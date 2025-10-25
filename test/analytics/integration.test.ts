import { test, describe } from 'node:test';
import assert from 'node:assert';
import { PerformanceTracker } from '../../src/analytics/performance-tracker.js';

describe('Analytics Integration', () => {
  test('should integrate with learning outcome signals', async () => {
    const tracker = new PerformanceTracker({ enableCache: false });
    
    // Create mock outcome signals as they would come from the learning system
    const outcomeSignals = [
      {
        sessionId: 'session-001',
        query: 'how to implement authentication',
        intent: 'api',
        bundleSignature: 'b_auth_123',
        satisfied: true,
        timeToFix: 3000,
        topClickId: 'auth-middleware',
        tokenUsage: 250,
        seedWeights: { api: 0.7, search: 0.3, symbol: 0, config: 0, incident: 0 },
        policyThresholds: { 
          earlyStop: 0.8, 
          maxDepth: 4, 
          includeSymbols: 1, 
          includeFiles: 1, 
          includeContent: 1 
        }
      },
      {
        sessionId: 'session-002',
        query: 'database connection error',
        intent: 'incident',
        bundleSignature: 'b_db_error_456',
        satisfied: false,
        timeToFix: 12000,
        tokenUsage: 180,
        seedWeights: { api: 0, search: 0.2, symbol: 0, config: 0, incident: 0.8 },
        policyThresholds: { 
          earlyStop: 0.6, 
          maxDepth: 6, 
          includeSymbols: 1, 
          includeFiles: 1, 
          includeContent: 1 
        }
      },
      {
        sessionId: 'session-003',
        query: 'React component props',
        intent: 'symbol',
        bundleSignature: 'b_react_symbol_789',
        satisfied: true,
        timeToFix: 2000,
        tokenUsage: 120,
        seedWeights: { api: 0, search: 0.1, symbol: 0.9, config: 0, incident: 0 },
        policyThresholds: { 
          earlyStop: 0.9, 
          maxDepth: 3, 
          includeSymbols: 1, 
          includeFiles: 0, 
          includeContent: 0 
        }
      }
    ];

    const period = {
      start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      end: new Date()
    };

    // Track metrics using the analytics system
    const metrics = await tracker.trackMetrics(outcomeSignals, period);

    // Verify metrics are computed correctly
    assert.strictEqual(metrics.totalInteractions, 3);
    assert.strictEqual(metrics.overallSatisfactionRate, 2/3); // 2 satisfied out of 3
    
    // Verify intent-specific metrics
    assert.ok(metrics.intentPerformance.api);
    assert.ok(metrics.intentPerformance.incident);
    assert.ok(metrics.intentPerformance.symbol);
    
    assert.strictEqual(metrics.intentPerformance.api.winRate, 1.0);
    assert.strictEqual(metrics.intentPerformance.incident.winRate, 0.0);
    assert.strictEqual(metrics.intentPerformance.symbol.winRate, 1.0);

    // Verify repository/session metrics
    assert.ok(metrics.repositoryPerformance['session-001']);
    assert.ok(metrics.repositoryPerformance['session-002']);
    assert.ok(metrics.repositoryPerformance['session-003']);

    // Verify cost analysis
    assert.ok(metrics.tokenCostAnalysis.totalTokens > 0);
    assert.ok(metrics.tokenCostAnalysis.totalCost > 0);
    assert.ok(metrics.tokenCostAnalysis.costByIntent.api > 0);
    assert.ok(metrics.tokenCostAnalysis.costByIntent.incident > 0);
    assert.ok(metrics.tokenCostAnalysis.costByIntent.symbol > 0);

    // Test comparison functionality
    const beforeMetrics = await tracker.trackMetrics(outcomeSignals.slice(0, 1), period);
    const afterMetrics = await tracker.trackMetrics(outcomeSignals, period);
    const comparison = await tracker.generateComparisonReport(beforeMetrics, afterMetrics);

    assert.ok(comparison.beforeMetrics);
    assert.ok(comparison.afterMetrics);
    assert.ok(Array.isArray(comparison.recommendations));
    assert.ok(typeof comparison.netImpact === 'number');

    // Test export functionality
    const jsonExport = await tracker.exportMetrics(metrics, 'json');
    const csvExport = await tracker.exportMetrics(metrics, 'csv');
    const mdExport = await tracker.exportMetrics(metrics, 'md');

    assert.ok(jsonExport.length > 0);
    assert.ok(csvExport.includes('Metric,Value,Unit'));
    assert.ok(mdExport.includes('# Performance Metrics Report'));

    // Parse JSON export to verify it's valid
    const parsedJson = JSON.parse(jsonExport);
    assert.strictEqual(parsedJson.totalInteractions, 3);
    assert.strictEqual(parsedJson.overallSatisfactionRate, 2/3);
  });

  test('should handle policy optimization scenarios', async () => {
    const tracker = new PerformanceTracker({ enableCache: false });
    
    // Simulate before/after policy optimization
    const beforeSignals = [
      {
        sessionId: 'session-001',
        query: 'API endpoint documentation',
        intent: 'api',
        bundleSignature: 'b_api_old',
        satisfied: false,
        timeToFix: 8000,
        tokenUsage: 300,
        seedWeights: { api: 0.5, search: 0.5, symbol: 0, config: 0, incident: 0 },
        policyThresholds: { 
          earlyStop: 0.5, 
          maxDepth: 2, 
          includeSymbols: 0, 
          includeFiles: 1, 
          includeContent: 0 
        }
      }
    ];

    const afterSignals = [
      {
        sessionId: 'session-001',
        query: 'API endpoint documentation',
        intent: 'api',
        bundleSignature: 'b_api_new',
        satisfied: true,
        timeToFix: 3000,
        tokenUsage: 200,
        seedWeights: { api: 0.8, search: 0.2, symbol: 0, config: 0, incident: 0 },
        policyThresholds: { 
          earlyStop: 0.8, 
          maxDepth: 4, 
          includeSymbols: 1, 
          includeFiles: 1, 
          includeContent: 1 
        }
      }
    ];

    const period = {
      start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      end: new Date()
    };

    const beforeMetrics = await tracker.trackMetrics(beforeSignals, period);
    const afterMetrics = await tracker.trackMetrics(afterSignals, period);
    const comparison = await tracker.generateComparisonReport(beforeMetrics, afterMetrics);

    // Should detect improvement
    assert.ok(comparison.improvements.overallSatisfactionRate > 0);
    assert.ok(comparison.netImpact > 0);
    
    // Should generate actionable recommendations
    assert.ok(comparison.recommendations.length > 0);
    assert.ok(
      comparison.recommendations.some(rec => 
        rec.includes('improvement') || rec.includes('satisfaction')
      )
    );
  });

  test('should scale to handle large datasets', async () => {
    const tracker = new PerformanceTracker({ enableCache: false });
    
    // Generate a large dataset similar to real-world usage
    const largeSignals = [];
    const intents = ['symbol', 'api', 'config', 'incident', 'search'];
    
    for (let i = 0; i < 1000; i++) { // Reduced for test performance
      const intent = intents[i % intents.length];
      largeSignals.push({
        sessionId: `session-${Math.floor(i / 10)}`,
        query: `query ${i}`,
        intent,
        bundleSignature: `b_${i}`,
        satisfied: Math.random() > 0.3, // ~70% satisfaction rate
        timeToFix: Math.floor(Math.random() * 10000) + 1000,
        tokenUsage: Math.floor(Math.random() * 300) + 50,
        seedWeights: { 
          symbol: intent === 'symbol' ? 0.8 : 0,
          api: intent === 'api' ? 0.8 : 0,
          config: intent === 'config' ? 0.8 : 0,
          incident: intent === 'incident' ? 0.8 : 0,
          search: intent === 'search' ? 0.8 : 0.2
        },
        policyThresholds: { 
          earlyStop: 0.7, 
          maxDepth: 4, 
          includeSymbols: 1, 
          includeFiles: 1, 
          includeContent: 1 
        }
      });
    }

    const period = {
      start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      end: new Date()
    };

    const startTime = Date.now();
    const metrics = await tracker.trackMetrics(largeSignals, period);
    const processingTime = Date.now() - startTime;

    // Should handle large datasets efficiently
    assert.strictEqual(metrics.totalInteractions, 1000);
    assert.ok(processingTime < 5000); // Should complete within 5 seconds
    assert.ok(metrics.overallSatisfactionRate > 0.6 && metrics.overallSatisfactionRate < 0.8); // Around 70%
    
    // Should have data for all intents
    assert.strictEqual(Object.keys(metrics.intentPerformance).length, intents.length);
    
    // Should have reasonable cost analysis
    assert.ok(metrics.tokenCostAnalysis.totalTokens > 0);
    assert.ok(metrics.tokenCostAnalysis.totalCost > 0);
  });
});