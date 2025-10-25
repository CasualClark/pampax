/**
 * Tests for StoppingReasonEngine
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { StoppingReasonEngine, createStoppingReasonEngine, integrateWithAssembler } from '../src/context/stopping-reasons.js';

describe('StoppingReasonEngine', () => {
  let engine;

  beforeEach(() => {
    engine = new StoppingReasonEngine({
      enableDetailedLogging: false,
      cacheHitThreshold: 0.8,
      qualityScoreThreshold: 0.3,
      budgetWarningThreshold: 0.9
    });
  });

  afterEach(() => {
    engine = null;
  });

  describe('Session Management', () => {
    it('should start and end sessions correctly', () => {
      engine.startSession({ query: 'test', budget: 5000 });
      
      const metrics = engine.getMetrics();
      assert(metrics.isRunning);
      assert(metrics.startTime !== null);
      assert(metrics.endTime === null);
      
      const analysis = engine.endSession();
      assert(analysis.summary.duration >= 0);
      assert(!engine.getMetrics().isRunning);
    });

    it('should track session metrics', () => {
      engine.startSession({ query: 'test', budget: 5000 });
      
      engine.recordTokenBudget(4000, 5000, 'test-source');
      engine.recordResultLimit(8, 10, 'test-source');
      
      const analysis = engine.endSession();
      assert.strictEqual(analysis.summary.tokensUsed, 4000);
      assert.strictEqual(analysis.summary.itemsProcessed, 10);
    });
  });

  describe('Token Budget Conditions', () => {
    it('should record budget exhaustion', () => {
      engine.startSession();
      
      const explanation = engine.recordTokenBudget(5000, 5000, 'code-search');
      
      assert.strictEqual(explanation.title, 'Token Budget Exhausted');
      assert(explanation.explanation.includes('5,000'));
      assert(explanation.explanation.includes('100.0%'));
      assert.strictEqual(explanation.severity, 'high');
      assert(Array.isArray(explanation.actionable));
      assert(explanation.actionable.length > 0);
    });

    it('should record budget warning', () => {
      engine.startSession();
      
      const explanation = engine.recordTokenBudget(4500, 5000, 'code-search');
      
      assert.strictEqual(explanation.title, 'Token Budget Warning');
      assert(explanation.explanation.includes('4,500'));
      assert(explanation.explanation.includes('90.0%'));
      assert.strictEqual(explanation.severity, 'medium');
    });

    it('should track token metrics', () => {
      engine.startSession();
      engine.recordTokenBudget(3000, 5000, 'test');
      
      const metrics = engine.getMetrics();
      assert.strictEqual(metrics.totalTokens, 3000);
    });
  });

  describe('Result Limit Conditions', () => {
    it('should record limit reached', () => {
      engine.startSession();
      
      const explanation = engine.recordResultLimit(15, 10, 'memory-search');
      
      assert.strictEqual(explanation.title, 'Result Limit Reached');
      assert(explanation.explanation.includes('15'));
      assert(explanation.explanation.includes('10'));
      assert(explanation.explanation.includes('5 excess'));
      assert.strictEqual(explanation.severity, 'medium');
    });

    it('should track item metrics', () => {
      engine.startSession();
      engine.recordResultLimit(8, 10, 'test');
      
      const metrics = engine.getMetrics();
      assert.strictEqual(metrics.totalItems, 10);
    });
  });

  describe('Quality Threshold Conditions', () => {
    it('should record quality threshold failure', () => {
      engine.startSession();
      
      const item = { path: '/test/file.js', id: 'test-1' };
      const explanation = engine.recordQualityThreshold(0.2, 0.5, item, 'code-search');
      
      assert.strictEqual(explanation.title, 'Quality Threshold Not Met');
      assert(explanation.explanation.includes('0.200'));
      assert(explanation.explanation.includes('0.500'));
      assert(explanation.explanation.includes('0.300'));
      assert.strictEqual(explanation.severity, 'medium');
      assert(explanation.actionable.some(action => action.includes('/test/file.js')));
    });

    it('should handle quality without item metadata', () => {
      engine.startSession();
      
      const explanation = engine.recordQualityThreshold(0.2, 0.5, null, 'test');
      
      assert.strictEqual(explanation.title, 'Quality Threshold Not Met');
      assert(!explanation.actionable.some(action => action.includes('Review item')));
    });
  });

  describe('Search Failure Conditions', () => {
    it('should record search failures', () => {
      engine.startSession();
      
      const error = new Error('Connection failed');
      const explanation = engine.recordSearchFailure(error, 'vector-search', 2);
      
      assert.strictEqual(explanation.title, 'Search Operation Failed');
      assert(explanation.explanation.includes('Connection failed'));
      assert(explanation.explanation.includes('attempt 2'));
      assert.strictEqual(explanation.severity, 'high');
      
      const metrics = engine.getMetrics();
      assert.strictEqual(metrics.searchFailures, 1);
    });

    it('should track multiple failures', () => {
      engine.startSession();
      
      engine.recordSearchFailure(new Error('Error 1'), 'test', 1);
      engine.recordSearchFailure(new Error('Error 2'), 'test', 2);
      engine.recordSearchFailure(new Error('Error 3'), 'test', 3);
      
      const metrics = engine.getMetrics();
      assert.strictEqual(metrics.searchFailures, 3);
    });
  });

  describe('Cache Boundary Conditions', () => {
    it('should record cache boundary reached', () => {
      engine.startSession();
      
      const explanation = engine.recordCacheBoundary(950, 1000, 0.85, 'graph-cache');
      
      assert.strictEqual(explanation.title, 'Cache Size Limit Reached');
      assert(explanation.explanation.includes('950'));
      assert(explanation.explanation.includes('1,000'));
      assert(explanation.explanation.includes('95.0%'));
      assert.strictEqual(explanation.severity, 'low');
    });

    it('should record low cache hit rate', () => {
      engine.startSession();
      
      const explanation = engine.recordCacheBoundary(500, 1000, 0.6, 'search-cache');
      
      assert.strictEqual(explanation.title, 'Low Cache Hit Rate');
      assert(explanation.explanation.includes('60.0%'));
      assert(explanation.explanation.includes('80.0%'));
      assert.strictEqual(explanation.severity, 'medium');
    });

    it('should track cache metrics', () => {
      engine.startSession();
      engine.recordCacheBoundary(500, 1000, 0.75, 'test');
      
      const metrics = engine.getMetrics();
      assert.strictEqual(metrics.cacheHits, 75);
      assert.strictEqual(metrics.cacheMisses, 25);
    });
  });

  describe('Graph Traversal Conditions', () => {
    it('should record node limit reached', () => {
      engine.startSession();
      
      const explanation = engine.recordGraphTraversalLimit(100, 100, 50, 200, 'graph-engine');
      
      assert.strictEqual(explanation.title, 'Graph Traversal Limit Reached');
      assert(explanation.explanation.includes('100'));
      assert(explanation.explanation.includes('50'));
      assert(explanation.explanation.includes('200'));
      assert.strictEqual(explanation.severity, 'medium');
      assert(explanation.actionable.some(action => action.includes('node traversal limit')));
    });

    it('should record edge limit reached', () => {
      engine.startSession();
      
      const explanation = engine.recordGraphTraversalLimit(50, 100, 150, 150, 'graph-engine');
      
      assert.strictEqual(explanation.title, 'Graph Traversal Limit Reached');
      assert(explanation.actionable.some(action => action.includes('edge traversal limit')));
    });
  });

  describe('Timeout Conditions', () => {
    it('should record timeout', () => {
      engine.startSession();
      
      const explanation = engine.recordTimeout(5500, 5000, 'graph-traversal');
      
      assert.strictEqual(explanation.title, 'Operation Timeout');
      assert(explanation.explanation.includes('5500ms'));
      assert(explanation.explanation.includes('5000ms'));
      assert(explanation.explanation.includes('500ms excess'));
      assert.strictEqual(explanation.severity, 'high');
      assert.strictEqual(explanation.source, 'graph-traversal');
    });
  });

  describe('Degradation Conditions', () => {
    it('should record degradation triggered', () => {
      engine.startSession();
      
      const explanation = engine.recordDegradationTriggered('medium', 8000, 5000, 'budget-exceeded');
      
      assert.strictEqual(explanation.title, 'Content Degradation Applied');
      assert(explanation.explanation.includes('medium'));
      assert(explanation.explanation.includes('8,000'));
      assert(explanation.explanation.includes('5,000'));
      assert(explanation.explanation.includes('3,000'));
      assert(explanation.explanation.includes('37.5%'));
      assert.strictEqual(explanation.severity, 'medium');
      assert(explanation.actionable.some(action => action.includes('budget-exceeded')));
    });
  });

  describe('Analysis Generation', () => {
    it('should generate comprehensive analysis', () => {
      engine.startSession({ query: 'test', budget: 5000 });
      
      engine.recordTokenBudget(5000, 5000, 'code');
      engine.recordResultLimit(15, 10, 'memory');
      engine.recordQualityThreshold(0.2, 0.5, null, 'search');
      engine.recordSearchFailure(new Error('Failed'), 'vector', 1);
      
      const analysis = engine.endSession();
      
      assert.strictEqual(analysis.summary.totalConditions, 4);
      assert.strictEqual(analysis.summary.highSeverityCount, 2);
      assert.strictEqual(analysis.summary.mediumSeverityCount, 2);
      assert.strictEqual(analysis.summary.lowSeverityCount, 0);
      assert(analysis.summary.duration >= 0);
      assert(analysis.conditions.length === 4);
      assert(analysis.grouped.high.length === 2);
      assert(analysis.grouped.medium.length === 2);
      assert(Array.isArray(analysis.recommendations));
      assert(analysis.metrics.startTime !== null);
      assert(analysis.metrics.endTime !== null);
    });

    it('should generate appropriate recommendations', () => {
      engine.startSession();
      
      // Add high severity resource issues
      engine.recordTokenBudget(5000, 5000, 'code');
      engine.recordSearchFailure(new Error('Failed'), 'vector', 1);
      
      const analysis = engine.endSession();
      
      assert(analysis.recommendations.length > 0);
      
      const immediateRec = analysis.recommendations.find(r => r.priority === 'immediate');
      assert(immediateRec);
      assert.strictEqual(immediateRec.title, 'Address Critical Issues');
      
      const resourceRec = analysis.recommendations.find(r => r.title === 'Optimize Resource Usage');
      assert(resourceRec);
      assert.strictEqual(resourceRec.priority, 'high');
    });
  });

  describe('Should Stop Logic', () => {
    it('should stop on high severity conditions', () => {
      engine.startSession();
      
      engine.recordTokenBudget(5000, 5000, 'code'); // high severity
      
      assert(engine.shouldStop());
    });

    it('should stop on budget exhaustion', () => {
      engine.startSession();
      
      engine.recordTokenBudget(5000, 5000, 'code'); // triggers BUDGET_EXHAUSTED
      
      assert(engine.shouldStop());
    });

    it('should stop on multiple search failures', () => {
      engine.startSession();
      
      engine.recordSearchFailure(new Error('Failed 1'), 'test', 1);
      engine.recordSearchFailure(new Error('Failed 2'), 'test', 2);
      engine.recordSearchFailure(new Error('Failed 3'), 'test', 3);
      
      assert(engine.shouldStop());
    });

    it('should not stop on only low severity conditions', () => {
      engine.startSession();
      
      engine.recordCacheBoundary(500, 1000, 0.9, 'cache'); // low severity
      
      assert(!engine.shouldStop());
    });
  });

  describe('Export Functions', () => {
    it('should export conditions as JSON', () => {
      engine.startSession();
      engine.recordTokenBudget(4000, 5000, 'test');
      
      const exported = engine.exportConditions('json');
      const parsed = JSON.parse(exported);
      
      assert(parsed.summary);
      assert(parsed.conditions);
      assert(parsed.grouped);
      assert(parsed.metrics);
      assert(parsed.recommendations);
    });

    it('should export conditions as CSV', () => {
      engine.startSession();
      engine.recordTokenBudget(4000, 5000, 'test');
      
      const csv = engine.exportConditions('csv');
      const lines = csv.split('\n');
      
      assert(lines.length >= 2); // header + at least one data row
      assert(lines[0].includes('"type","severity","category","source","timestamp","explanation"'));
      assert(lines[1].includes('BUDGET_WARNING'));
    });
  });
});

describe('Utility Functions', () => {
  it('should create engine with factory function', () => {
    const engine = createStoppingReasonEngine({
      cacheHitThreshold: 0.9
    });
    
    assert(engine instanceof StoppingReasonEngine);
    assert.strictEqual(engine.options.cacheHitThreshold, 0.9);
  });

  it('should integrate with assembler mock', () => {
    // Create a mock assembler
    const mockAssembler = {
      assembleWithExplanation: async (query, options) => ({
        total_tokens: 4000,
        sources: [{ items: new Array(15) }], // 15 items to trigger limit
        explanation: {
          stopping_conditions: [
            'Token budget nearly exhausted (4000/5000 tokens)',
            'Result limit reached (15/10 items)'
          ]
        }
      })
    };

    const engine = integrateWithAssembler(mockAssembler);
    
    assert(engine instanceof StoppingReasonEngine);
    assert(typeof mockAssembler.assembleWithExplanation === 'function');
  });
});

describe('Edge Cases', () => {
  let engine;

  beforeEach(() => {
    engine = new StoppingReasonEngine();
  });

  it('should handle empty sessions gracefully', () => {
    engine.startSession();
    const analysis = engine.endSession();
    
    assert.strictEqual(analysis.summary.totalConditions, 0);
    assert.strictEqual(analysis.summary.highSeverityCount, 0);
    assert.strictEqual(analysis.summary.mediumSeverityCount, 0);
    assert.strictEqual(analysis.summary.lowSeverityCount, 0);
  });

  it('should handle unknown condition types', () => {
    engine.startSession();
    
    // Add a condition manually to test unknown type handling
    engine.conditions.push({
      type: 'UNKNOWN_TYPE',
      severity: 'medium',
      category: 'test',
      source: 'test',
      values: {},
      timestamp: Date.now()
    });
    
    const analysis = engine.endSession();
    const unknownExplanation = analysis.conditions.find(c => c.title === 'Unknown Condition');
    
    assert(unknownExplanation);
    assert(unknownExplanation.explanation.includes('UNKNOWN_TYPE'));
  });

  it('should handle zero cache hit rate', () => {
    engine.startSession();
    
    const explanation = engine.recordCacheBoundary(500, 1000, 0, 'test');
    
    assert.strictEqual(explanation.title, 'Low Cache Hit Rate');
    assert(explanation.explanation.includes('0.0%'));
  });

  it('should handle perfect cache hit rate', () => {
    engine.startSession();
    
    const explanation = engine.recordCacheBoundary(500, 1000, 1.0, 'test');
    
    // Should not trigger low cache hit rate warning
    assert(!explanation.title.includes('Low Cache Hit Rate'));
  });
});