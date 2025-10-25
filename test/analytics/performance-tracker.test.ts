import { test, describe } from 'node:test';
import assert from 'node:assert';
import { PerformanceTracker } from '../../src/analytics/performance-tracker.js';
import type { OutcomeSignal } from '../../src/learning/outcome-analyzer.js';

describe('PerformanceTracker', () => {
  const createMockSignals = (): OutcomeSignal[] => [
    {
      sessionId: 'session1',
      query: 'function definition',
      intent: 'symbol',
      bundleSignature: 'b_abc123',
      satisfied: true,
      timeToFix: 5000,
      tokenUsage: 100,
      seedWeights: { symbol: 0.8, search: 0.2 },
      policyThresholds: { earlyStop: 0.8, maxDepth: 5, includeSymbols: 1, includeFiles: 1, includeContent: 1 }
    },
    {
      sessionId: 'session1',
      query: 'config settings',
      intent: 'config',
      bundleSignature: 'b_def456',
      satisfied: false,
      timeToFix: 15000,
      tokenUsage: 200,
      seedWeights: { config: 0.9, search: 0.1 },
      policyThresholds: { earlyStop: 0.7, maxDepth: 3, includeSymbols: 0, includeFiles: 1, includeContent: 1 }
    },
    {
      sessionId: 'session2',
      query: 'api endpoint',
      intent: 'api',
      bundleSignature: 'b_ghi789',
      satisfied: true,
      timeToFix: 3000,
      tokenUsage: 150,
      seedWeights: { api: 0.85, search: 0.15 },
      policyThresholds: { earlyStop: 0.9, maxDepth: 4, includeSymbols: 1, includeFiles: 1, includeContent: 0 }
    },
    {
      sessionId: 'session2',
      query: 'error handling',
      intent: 'incident',
      bundleSignature: 'b_jkl012',
      satisfied: true,
      timeToFix: 8000,
      tokenUsage: 120,
      seedWeights: { incident: 0.75, search: 0.25 },
      policyThresholds: { earlyStop: 0.6, maxDepth: 6, includeSymbols: 1, includeFiles: 1, includeContent: 1 }
    },
    {
      sessionId: 'session3',
      query: 'search query',
      intent: 'search',
      bundleSignature: 'b_mno345',
      satisfied: false,
      timeToFix: 12000,
      tokenUsage: 80,
      seedWeights: { search: 1.0 },
      policyThresholds: { earlyStop: 0.5, maxDepth: 2, includeSymbols: 0, includeFiles: 1, includeContent: 0 }
    }
  ];

  const createMockPeriod = () => {
    const now = new Date();
    return {
      start: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
      end: now
    };
  };

  test('should compute basic performance metrics', async () => {
    const tracker = new PerformanceTracker({
      tokenCostPerMillion: 0.002,
      significanceThreshold: 0.05,
      forecastHorizon: 7,
      minSampleSize: 10,
      enableCache: false
    });

    const mockSignals = createMockSignals();
    const mockPeriod = createMockPeriod();
    const metrics = await tracker.trackMetrics(mockSignals, mockPeriod);

    assert.strictEqual(metrics.totalInteractions, 5);
    assert.strictEqual(metrics.overallSatisfactionRate, 0.6); // 3 satisfied out of 5
    assert.deepStrictEqual(metrics.period, mockPeriod);
  });

  test('should compute win rates by intent', async () => {
    const tracker = new PerformanceTracker({ enableCache: false });
    const mockSignals = createMockSignals();
    const mockPeriod = createMockPeriod();
    const metrics = await tracker.trackMetrics(mockSignals, mockPeriod);

    assert.strictEqual(metrics.winRates.overall, 0.6);
    assert.strictEqual(metrics.winRates.intent_symbol, 1.0); // 1/1 satisfied
    assert.strictEqual(metrics.winRates.intent_config, 0.0); // 0/1 satisfied
    assert.strictEqual(metrics.winRates.intent_api, 1.0); // 1/1 satisfied
    assert.strictEqual(metrics.winRates.intent_incident, 1.0); // 1/1 satisfied
    assert.strictEqual(metrics.winRates.intent_search, 0.0); // 0/1 satisfied
  });

  test('should compute win rates by bundle signature', async () => {
    const tracker = new PerformanceTracker({ enableCache: false });
    const mockSignals = createMockSignals();
    const mockPeriod = createMockPeriod();
    const metrics = await tracker.trackMetrics(mockSignals, mockPeriod);

    assert.strictEqual(metrics.winRates.bundle_b_abc123, 1.0);
    assert.strictEqual(metrics.winRates.bundle_b_def456, 0.0);
    assert.strictEqual(metrics.winRates.bundle_b_ghi789, 1.0);
    assert.strictEqual(metrics.winRates.bundle_b_jkl012, 1.0);
    assert.strictEqual(metrics.winRates.bundle_b_mno345, 0.0);
  });

  test('should compute token cost analysis', async () => {
    const tracker = new PerformanceTracker({ 
      tokenCostPerMillion: 0.002,
      enableCache: false 
    });
    const mockSignals = createMockSignals();
    const mockPeriod = createMockPeriod();
    const metrics = await tracker.trackMetrics(mockSignals, mockPeriod);

    const totalTokens = 100 + 200 + 150 + 120 + 80; // 650
    assert.strictEqual(metrics.tokenCostAnalysis.totalTokens, totalTokens);
    
    const expectedCost = (totalTokens / 1000000) * 0.002; // 0.0013
    assert.ok(Math.abs(metrics.tokenCostAnalysis.totalCost - expectedCost) < 0.000001);
    
    assert.ok(Math.abs(metrics.tokenCostAnalysis.averageCostPerInteraction - (expectedCost / 5)) < 0.000001);
  });

  test('should compute intent performance metrics', async () => {
    const tracker = new PerformanceTracker({ enableCache: false });
    const mockSignals = createMockSignals();
    const mockPeriod = createMockPeriod();
    const metrics = await tracker.trackMetrics(mockSignals, mockPeriod);

    // Symbol intent performance
    assert.strictEqual(metrics.intentPerformance.symbol.winRate, 1.0);
    assert.strictEqual(metrics.intentPerformance.symbol.totalInteractions, 1);
    assert.strictEqual(metrics.intentPerformance.symbol.satisfiedInteractions, 1);
    assert.strictEqual(metrics.intentPerformance.symbol.averageTokenUsage, 100);
    assert.strictEqual(metrics.intentPerformance.symbol.averageTimeToFix, 5000);

    // Config intent performance
    assert.strictEqual(metrics.intentPerformance.config.winRate, 0.0);
    assert.strictEqual(metrics.intentPerformance.config.totalInteractions, 1);
    assert.strictEqual(metrics.intentPerformance.config.satisfiedInteractions, 0);
    assert.strictEqual(metrics.intentPerformance.config.averageTokenUsage, 200);
    assert.strictEqual(metrics.intentPerformance.config.averageTimeToFix, 15000);
  });

  test('should compute repository performance metrics', async () => {
    const tracker = new PerformanceTracker({ enableCache: false });
    const mockSignals = createMockSignals();
    const mockPeriod = createMockPeriod();
    const metrics = await tracker.trackMetrics(mockSignals, mockPeriod);

    // Should have metrics for each session
    assert.ok(metrics.repositoryPerformance.session1);
    assert.ok(metrics.repositoryPerformance.session2);
    assert.ok(metrics.repositoryPerformance.session3);

    // Session 1: 2 interactions, 1 satisfied
    assert.strictEqual(metrics.repositoryPerformance.session1.winRate, 0.5);
    assert.strictEqual(metrics.repositoryPerformance.session1.totalInteractions, 2);

    // Session 2: 2 interactions, 2 satisfied
    assert.strictEqual(metrics.repositoryPerformance.session2.winRate, 1.0);
    assert.strictEqual(metrics.repositoryPerformance.session2.totalInteractions, 2);

    // Session 3: 1 interaction, 0 satisfied
    assert.strictEqual(metrics.repositoryPerformance.session3.winRate, 0.0);
    assert.strictEqual(metrics.repositoryPerformance.session3.totalInteractions, 1);
  });

  test('should generate satisfaction trends', async () => {
    const tracker = new PerformanceTracker({ enableCache: false });
    const mockSignals = createMockSignals();
    const mockPeriod = createMockPeriod();
    const metrics = await tracker.trackMetrics(mockSignals, mockPeriod);

    assert.strictEqual(metrics.satisfactionTrends.length, 1);
    assert.strictEqual(metrics.satisfactionTrends[0].label, 'Overall Satisfaction Rate');
    assert.strictEqual(metrics.satisfactionTrends[0].unit, 'rate');
    assert.ok(metrics.satisfactionTrends[0].points);
  });

  test('should handle empty signals array', async () => {
    const tracker = new PerformanceTracker({ enableCache: false });
    const mockPeriod = createMockPeriod();
    const metrics = await tracker.trackMetrics([], mockPeriod);

    assert.strictEqual(metrics.totalInteractions, 0);
    assert.strictEqual(metrics.overallSatisfactionRate, 0);
    assert.strictEqual(metrics.overallCostEfficiency, 0);
  });

  test('should handle signals without timeToFix', async () => {
    const tracker = new PerformanceTracker({ enableCache: false });
    const signalsWithoutTimeFix = createMockSignals().map(s => ({
      ...s,
      timeToFix: undefined
    }));
    const mockPeriod = createMockPeriod();
    const metrics = await tracker.trackMetrics(signalsWithoutTimeFix, mockPeriod);

    assert.strictEqual(metrics.intentPerformance.symbol.averageTimeToFix, 0);
    assert.strictEqual(metrics.intentPerformance.config.averageTimeToFix, 0);
  });

  test('should generate comparison report between two metrics', async () => {
    const tracker = new PerformanceTracker({ enableCache: false });
    const mockSignals = createMockSignals();
    const mockPeriod = createMockPeriod();
    const beforeMetrics = await tracker.trackMetrics(mockSignals.slice(0, 3), mockPeriod);
    const afterMetrics = await tracker.trackMetrics(mockSignals, mockPeriod);

    const report = await tracker.generateComparisonReport(beforeMetrics, afterMetrics);

    assert.deepStrictEqual(report.beforeMetrics, beforeMetrics);
    assert.deepStrictEqual(report.afterMetrics, afterMetrics);
    assert.ok(report.improvements);
    assert.ok(report.regressions);
    assert.ok(typeof report.netImpact === 'number');
    assert.ok(Array.isArray(report.recommendations));
    assert.ok(Array.isArray(report.significantChanges));
  });

  test('should detect improvements in satisfaction rate', async () => {
    const tracker = new PerformanceTracker({ enableCache: false });
    const mockSignals = createMockSignals();
    const mockPeriod = createMockPeriod();
    const beforeMetrics = await tracker.trackMetrics(mockSignals.slice(0, 2), mockPeriod); // 1/2 satisfied
    const afterMetrics = await tracker.trackMetrics(mockSignals.slice(2, 4), mockPeriod); // 2/2 satisfied

    const report = await tracker.generateComparisonReport(beforeMetrics, afterMetrics);

    assert.ok(report.improvements.overallSatisfactionRate > 0);
    assert.strictEqual(report.regressions.overallSatisfactionRate, undefined);
  });

  test('should generate recommendations based on changes', async () => {
    const tracker = new PerformanceTracker({ enableCache: false });
    const mockSignals = createMockSignals();
    const mockPeriod = createMockPeriod();
    const beforeMetrics = await tracker.trackMetrics(mockSignals.slice(0, 2), mockPeriod);
    const afterMetrics = await tracker.trackMetrics(mockSignals.slice(2, 4), mockPeriod);

    const report = await tracker.generateComparisonReport(beforeMetrics, afterMetrics);

    assert.ok(report.recommendations);
    assert.ok(Array.isArray(report.recommendations));
  });

  test('should analyze trends across multiple time periods', async () => {
    const tracker = new PerformanceTracker({ enableCache: false });
    const mockSignals = createMockSignals();
    const mockPeriod = createMockPeriod();
    const metrics1 = await tracker.trackMetrics(mockSignals.slice(0, 2), mockPeriod);
    const metrics2 = await tracker.trackMetrics(mockSignals.slice(2, 4), mockPeriod);
    const metrics3 = await tracker.trackMetrics(mockSignals.slice(4, 5), mockPeriod);

    const periods = [mockPeriod, mockPeriod, mockPeriod];
    const analysis = await tracker.analyzeTrends([metrics1, metrics2, metrics3], periods);

    assert.ok(analysis.trends);
    assert.ok(analysis.trends.overallSatisfaction);
    assert.ok(analysis.trends.costEfficiency);
    assert.ok(Array.isArray(analysis.anomalies));
    assert.ok(Array.isArray(analysis.insights));
  });

  test('should detect trend directions', async () => {
    const tracker = new PerformanceTracker({ enableCache: false });
    const mockSignals = createMockSignals();
    const mockPeriod = createMockPeriod();
    // Create metrics with decreasing satisfaction
    const metrics1 = await tracker.trackMetrics(mockSignals.slice(0, 3), mockPeriod); // 2/3 satisfied
    const metrics2 = await tracker.trackMetrics(mockSignals.slice(3, 5), mockPeriod); // 1/2 satisfied

    const analysis = await tracker.analyzeTrends([metrics1, metrics2], [mockPeriod, mockPeriod]);

    assert.ok(analysis.trends.overallSatisfaction.direction);
    assert.ok(['improving', 'declining', 'stable'].includes(analysis.trends.overallSatisfaction.direction));
  });

  test('should export metrics as JSON', async () => {
    const tracker = new PerformanceTracker({ enableCache: false });
    const mockSignals = createMockSignals();
    const mockPeriod = createMockPeriod();
    const metrics = await tracker.trackMetrics(mockSignals, mockPeriod);
    const exported = await tracker.exportMetrics(metrics, 'json');

    const parsed = JSON.parse(exported);
    assert.strictEqual(parsed.totalInteractions, 5);
    assert.strictEqual(parsed.overallSatisfactionRate, 0.6);
  });

  test('should export metrics as CSV', async () => {
    const tracker = new PerformanceTracker({ enableCache: false });
    const mockSignals = createMockSignals();
    const mockPeriod = createMockPeriod();
    const metrics = await tracker.trackMetrics(mockSignals, mockPeriod);
    const exported = await tracker.exportMetrics(metrics, 'csv');

    assert.ok(exported.includes('Metric,Value,Unit'));
    assert.ok(exported.includes('Overall Satisfaction Rate,0.6,rate'));
    assert.ok(exported.includes('Total Interactions,5,count'));
  });

  test('should export metrics as Markdown', async () => {
    const tracker = new PerformanceTracker({ enableCache: false });
    const mockSignals = createMockSignals();
    const mockPeriod = createMockPeriod();
    const metrics = await tracker.trackMetrics(mockSignals, mockPeriod);
    const exported = await tracker.exportMetrics(metrics, 'md');

    assert.ok(exported.includes('# Performance Metrics Report'));
    assert.ok(exported.includes('## Overall Performance'));
    assert.ok(exported.includes('**Total Interactions:** 5'));
    assert.ok(exported.includes('| Satisfaction Rate | 60.0% |'));
  });

  test('should throw error for unsupported format', async () => {
    const tracker = new PerformanceTracker({ enableCache: false });
    const mockSignals = createMockSignals();
    const mockPeriod = createMockPeriod();
    const metrics = await tracker.trackMetrics(mockSignals, mockPeriod);

    await assert.rejects(
      () => tracker.exportMetrics(metrics, 'xml' as any),
      /Unsupported export format: xml/
    );
  });

  test('should use custom configuration', async () => {
    const customTracker = new PerformanceTracker({
      tokenCostPerMillion: 0.005,
      significanceThreshold: 0.1,
      forecastHorizon: 14,
      minSampleSize: 5,
      enableCache: true
    });

    const mockSignals = createMockSignals();
    const mockPeriod = createMockPeriod();
    const metrics = await customTracker.trackMetrics(mockSignals, mockPeriod);

    // Should use custom token cost
    const totalTokens = 650;
    const expectedCost = (totalTokens / 1000000) * 0.005;
    assert.ok(Math.abs(metrics.tokenCostAnalysis.totalCost - expectedCost) < 0.000001);
  });

  test('should use default configuration', async () => {
    const defaultTracker = new PerformanceTracker();
    const mockSignals = createMockSignals();
    const mockPeriod = createMockPeriod();
    const metrics = await defaultTracker.trackMetrics(mockSignals, mockPeriod);

    // Should use default token cost (0.002)
    const totalTokens = 650;
    const expectedCost = (totalTokens / 1000000) * 0.002;
    assert.ok(Math.abs(metrics.tokenCostAnalysis.totalCost - expectedCost) < 0.000001);
  });

  test('should handle signals with missing properties', async () => {
    const tracker = new PerformanceTracker({ enableCache: false });
    const incompleteSignals = [
      {
        sessionId: 'session1',
        query: 'test',
        intent: 'search',
        bundleSignature: 'b_test',
        satisfied: true,
        tokenUsage: 100,
        seedWeights: {},
        policyThresholds: { earlyStop: 0.5, maxDepth: 3, includeSymbols: 1, includeFiles: 1, includeContent: 1 }
      }
      // Missing timeToFix
    ] as OutcomeSignal[];

    const mockPeriod = createMockPeriod();
    const metrics = await tracker.trackMetrics(incompleteSignals, mockPeriod);

    assert.strictEqual(metrics.totalInteractions, 1);
    assert.strictEqual(metrics.overallSatisfactionRate, 1.0);
  });

  test('should handle large datasets efficiently', async () => {
    const tracker = new PerformanceTracker({ enableCache: false });
    
    // Create a larger dataset
    const largeSignals: OutcomeSignal[] = [];
    for (let i = 0; i < 1000; i++) {
      largeSignals.push({
        sessionId: `session${i % 10}`,
        query: `query ${i}`,
        intent: i % 2 === 0 ? 'symbol' : 'search',
        bundleSignature: `b_${i}`,
        satisfied: i % 3 !== 0, // ~67% satisfaction
        timeToFix: i % 2 === 0 ? 5000 : 10000,
        tokenUsage: 100 + (i % 50),
        seedWeights: { symbol: 0.5, search: 0.5 },
        policyThresholds: { earlyStop: 0.8, maxDepth: 5, includeSymbols: 1, includeFiles: 1, includeContent: 1 }
      });
    }

    const mockPeriod = createMockPeriod();
    const startTime = Date.now();
    const metrics = await tracker.trackMetrics(largeSignals, mockPeriod);
    const processingTime = Date.now() - startTime;

    assert.strictEqual(metrics.totalInteractions, 1000);
    assert.ok(Math.abs(metrics.overallSatisfactionRate - 0.667) < 0.05); // ~67%
    assert.ok(processingTime < 5000); // Should complete within 5 seconds
  });

  test('should handle zero token usage', async () => {
    const tracker = new PerformanceTracker({ enableCache: false });
    const zeroTokenSignals = createMockSignals().map(s => ({
      ...s,
      tokenUsage: 0
    }));
    const mockPeriod = createMockPeriod();
    const metrics = await tracker.trackMetrics(zeroTokenSignals, mockPeriod);

    assert.strictEqual(metrics.tokenCostAnalysis.totalTokens, 0);
    assert.strictEqual(metrics.tokenCostAnalysis.totalCost, 0);
    assert.strictEqual(metrics.tokenCostAnalysis.averageCostPerInteraction, 0);
  });

  test('should work with OutcomeSignal interface', async () => {
    const tracker = new PerformanceTracker({ enableCache: false });
    const signal: OutcomeSignal = {
      sessionId: 'test-session',
      query: 'test query',
      intent: 'symbol',
      bundleSignature: 'b_test123',
      satisfied: true,
      timeToFix: 5000,
      topClickId: 'click-123',
      tokenUsage: 150,
      seedWeights: { symbol: 0.8, search: 0.2 },
      policyThresholds: { earlyStop: 0.9, maxDepth: 5, includeSymbols: 1, includeFiles: 1, includeContent: 1 }
    };

    const mockPeriod = createMockPeriod();
    const metrics = await tracker.trackMetrics([signal], mockPeriod);

    assert.strictEqual(metrics.totalInteractions, 1);
    assert.strictEqual(metrics.overallSatisfactionRate, 1.0);
    assert.ok(metrics.intentPerformance.symbol);
    assert.ok(metrics.repositoryPerformance['test-session']);
  });

  test('should handle different intent types from learning system', async () => {
    const tracker = new PerformanceTracker({ enableCache: false });
    const learningSignals: OutcomeSignal[] = [
      {
        sessionId: 'session1',
        query: 'function definition',
        intent: 'symbol',
        bundleSignature: 'b_symbol1',
        satisfied: true,
        tokenUsage: 100,
        seedWeights: { symbol: 0.9 },
        policyThresholds: { earlyStop: 0.8, maxDepth: 5, includeSymbols: 1, includeFiles: 1, includeContent: 1 }
      },
      {
        sessionId: 'session2',
        query: 'configuration issue',
        intent: 'config',
        bundleSignature: 'b_config1',
        satisfied: false,
        tokenUsage: 200,
        seedWeights: { config: 0.9 },
        policyThresholds: { earlyStop: 0.7, maxDepth: 3, includeSymbols: 0, includeFiles: 1, includeContent: 1 }
      },
      {
        sessionId: 'session3',
        query: 'API documentation',
        intent: 'api',
        bundleSignature: 'b_api1',
        satisfied: true,
        tokenUsage: 150,
        seedWeights: { api: 0.9 },
        policyThresholds: { earlyStop: 0.9, maxDepth: 4, includeSymbols: 1, includeFiles: 1, includeContent: 0 }
      }
    ];

    const mockPeriod = createMockPeriod();
    const metrics = await tracker.trackMetrics(learningSignals, mockPeriod);

    assert.ok(metrics.intentPerformance.symbol);
    assert.ok(metrics.intentPerformance.config);
    assert.ok(metrics.intentPerformance.api);
    assert.strictEqual(Object.keys(metrics.intentPerformance).length, 3);
  });
});