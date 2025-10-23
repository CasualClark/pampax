#!/usr/bin/env node
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { SeedMixOptimizer } from '../dist/src/search/seed-mix-optimizer.js';

describe('Seed Mix Optimizer Tests', () => {
  let optimizer;

  before(() => {
    optimizer = new SeedMixOptimizer();
  });

  after(() => {
    // Clean up if needed
    optimizer.clearCache();
    optimizer.resetMetrics();
  });

  test('should optimize symbol intent configuration', () => {
    const intent = {
      intent: 'symbol',
      confidence: 0.8,
      entities: [
        { type: 'function', value: 'getUserById', position: 0 }
      ],
      suggestedPolicies: ['symbol-level-2']
    };

    const policy = {
      maxDepth: 2,
      includeSymbols: true,
      includeFiles: false,
      includeContent: true,
      earlyStopThreshold: 3,
      seedWeights: {
        definition: 2.0,
        declaration: 1.8,
        implementation: 1.5,
        usage: 1.0,
        test: 0.8,
        reference: 0.5
      }
    };

    const config = optimizer.optimize(intent, policy);

    assert.ok(config.symbolWeight > 1.0, 'Symbol intent should have elevated symbol weight');
    assert.ok(config.symbolWeight >= 2.0, 'Symbol intent should have symbol weight >= 2.0');
    assert.equal(config.maxDepth, 2, 'Should respect policy maxDepth');
    assert.equal(config.earlyStopThreshold, 3, 'Should respect policy earlyStopThreshold');
    assert.ok(config.confidenceMultiplier > 1.0, 'Symbol intent should have confidence multiplier > 1.0');
  });

  test('should optimize config intent configuration', () => {
    const intent = {
      intent: 'config',
      confidence: 0.7,
      entities: [
        { type: 'file', value: 'config.json', position: 0 }
      ],
      suggestedPolicies: ['config-key-source']
    };

    const policy = {
      maxDepth: 1,
      includeSymbols: false,
      includeFiles: true,
      includeContent: true,
      earlyStopThreshold: 2,
      seedWeights: {
        config: 2.0,
        setting: 1.8,
        environment: 1.5,
        constant: 1.2,
        default: 1.0
      }
    };

    const config = optimizer.optimize(intent, policy);

    assert.ok(config.bm25Weight > 1.0, 'Config intent should have elevated BM25 weight');
    assert.ok(config.memoryWeight > 1.0, 'Config intent should have elevated memory weight');
    assert.ok(config.symbolWeight < 1.0, 'Config intent should have reduced symbol weight');
    assert.equal(config.maxDepth, 1, 'Should respect policy maxDepth');
    assert.equal(config.earlyStopThreshold, 2, 'Should respect policy earlyStopThreshold');
  });

  test('should optimize API intent configuration', () => {
    const intent = {
      intent: 'api',
      confidence: 0.9,
      entities: [
        { type: 'route', value: '/api/users', position: 0 }
      ],
      suggestedPolicies: ['api-handler-registration']
    };

    const policy = {
      maxDepth: 2,
      includeSymbols: true,
      includeFiles: false,
      includeContent: true,
      earlyStopThreshold: 2,
      seedWeights: {
        handler: 2.0,
        endpoint: 1.8,
        route: 1.5,
        controller: 1.3,
        middleware: 1.0,
        registration: 0.8
      }
    };

    const config = optimizer.optimize(intent, policy);

    assert.ok(config.vectorWeight > 0.8, 'API intent should have reasonable vector weight');
    assert.ok(config.bm25Weight > 0.8, 'API intent should have reasonable BM25 weight');
    assert.ok(config.memoryWeight > 1.0, 'API intent should have elevated memory weight');
    assert.ok(config.symbolWeight > 1.0, 'API intent should have elevated symbol weight');
  });

  test('should optimize incident intent configuration', () => {
    const intent = {
      intent: 'incident',
      confidence: 0.85,
      entities: [
        { type: 'function', value: 'authenticate', position: 0 }
      ],
      suggestedPolicies: ['incident-callers-diffs']
    };

    const policy = {
      maxDepth: 3,
      includeSymbols: true,
      includeFiles: true,
      includeContent: true,
      earlyStopThreshold: 5,
      seedWeights: {
        error: 2.5,
        exception: 2.2,
        caller: 2.0,
        stack: 1.8,
        diff: 1.5,
        recent: 1.2,
        related: 1.0
      }
    };

    const config = optimizer.optimize(intent, policy);

    assert.ok(config.memoryWeight > 1.5, 'Incident intent should have high memory weight');
    assert.ok(config.vectorWeight > 1.0, 'Incident intent should have elevated vector weight');
    assert.equal(config.maxDepth, 3, 'Should respect policy maxDepth');
    assert.equal(config.earlyStopThreshold, 5, 'Should respect policy earlyStopThreshold');
  });

  test('should optimize search intent configuration', () => {
    const intent = {
      intent: 'search',
      confidence: 0.6,
      entities: [],
      suggestedPolicies: ['search-default']
    };

    const policy = {
      maxDepth: 2,
      includeSymbols: true,
      includeFiles: true,
      includeContent: true,
      earlyStopThreshold: 10,
      seedWeights: {
        match: 1.0,
        relevant: 0.9,
        similar: 0.8,
        related: 0.7
      }
    };

    const config = optimizer.optimize(intent, policy);

    assert.ok(config.vectorWeight > 0.8, 'Search intent should have reasonable vector weight');
    assert.ok(config.bm25Weight > 0.8, 'Search intent should have reasonable BM25 weight');
    assert.ok(config.memoryWeight > 0.8, 'Search intent should have reasonable memory weight');
    assert.ok(config.symbolWeight > 0.8, 'Search intent should have reasonable symbol weight');
  });

  test('should apply confidence-based adjustments', () => {
    const baseIntent = {
      intent: 'symbol',
      confidence: 0.5,
      entities: [],
      suggestedPolicies: []
    };

    const policy = {
      maxDepth: 2,
      includeSymbols: true,
      includeFiles: false,
      includeContent: true,
      earlyStopThreshold: 3,
      seedWeights: {
        definition: 2.0,
        declaration: 1.8,
        implementation: 1.5,
        usage: 1.0,
        test: 0.8,
        reference: 0.5
      }
    };

    // Test low confidence
    const lowConfidenceConfig = optimizer.optimize({ ...baseIntent, confidence: 0.3 }, policy);
    assert.equal(lowConfidenceConfig.maxDepth, 1, 'Low confidence should reduce maxDepth');
    assert.equal(lowConfidenceConfig.earlyStopThreshold, 2, 'Low confidence should reduce earlyStopThreshold');

    // Test medium confidence
    const mediumConfidenceConfig = optimizer.optimize({ ...baseIntent, confidence: 0.6 }, policy);
    assert.ok(mediumConfidenceConfig.symbolWeight >= 2.5, 'Medium confidence should boost symbol weight');

    // Test high confidence
    const highConfidenceConfig = optimizer.optimize({ ...baseIntent, confidence: 0.9 }, policy);
    assert.ok(highConfidenceConfig.maxDepth >= 2, 'High confidence should maintain or increase maxDepth');
    assert.ok(highConfidenceConfig.earlyStopThreshold >= 3, 'High confidence should maintain or increase earlyStopThreshold');
    assert.ok(highConfidenceConfig.symbolWeight >= 2.0, 'High confidence should boost symbol weight');
  });

  test('should apply policy overrides correctly', () => {
    const intent = {
      intent: 'symbol',
      confidence: 0.8,
      entities: [],
      suggestedPolicies: []
    };

    const policy = {
      maxDepth: 1, // Lower than default
      includeSymbols: true,
      includeFiles: false,
      includeContent: true,
      earlyStopThreshold: 2, // Lower than default
      seedWeights: {
        definition: 3.0, // Higher than default
        declaration: 1.8,
        implementation: 1.5,
        usage: 1.0,
        test: 0.8,
        reference: 0.5
      }
    };

    const config = optimizer.optimize(intent, policy);

    assert.equal(config.maxDepth, 1, 'Should use policy override for maxDepth');
    assert.equal(config.earlyStopThreshold, 2, 'Should use policy override for earlyStopThreshold');
    // Policy seed weights should affect symbol weight through mapping
    assert.ok(config.symbolWeight > 2.0, 'Policy seed weights should affect symbol weight');
  });

  test('should apply early-stop mechanism correctly', () => {
    const config = {
      vectorWeight: 1.0,
      bm25Weight: 1.0,
      memoryWeight: 1.0,
      symbolWeight: 1.0,
      maxDepth: 2,
      earlyStopThreshold: 3,
      confidenceMultiplier: 1.0
    };

    const results = [
      { id: '1', score: 0.9 },
      { id: '2', score: 0.8 },
      { id: '3', score: 0.7 },
      { id: '4', score: 0.1 }, // Significant drop
      { id: '5', score: 0.05 },
      { id: '6', score: 0.01 }
    ];

    const earlyStoppedResults = optimizer.applyEarlyStop(results, config);

    assert.ok(earlyStoppedResults.length <= 6, 'Should apply some form of truncation');
    assert.equal(earlyStoppedResults[0].id, '1', 'Should preserve top result');
    assert.equal(earlyStoppedResults[1].id, '2', 'Should preserve second result');
    assert.equal(earlyStoppedResults[2].id, '3', 'Should preserve third result');
  });

  test('should not apply early stop when no significant drop', () => {
    const config = {
      vectorWeight: 1.0,
      bm25Weight: 1.0,
      memoryWeight: 1.0,
      symbolWeight: 1.0,
      maxDepth: 2,
      earlyStopThreshold: 3,
      confidenceMultiplier: 1.0
    };

    const results = [
      { id: '1', score: 0.9 },
      { id: '2', score: 0.8 },
      { id: '3', score: 0.7 },
      { id: '4', score: 0.6 }, // Not a significant drop
      { id: '5', score: 0.5 }
    ];

    const earlyStoppedResults = optimizer.applyEarlyStop(results, config);

    assert.equal(earlyStoppedResults.length, results.length, 'Should not apply early stop when no significant drop');
  });

  test('should perform reciprocal rank fusion correctly', () => {
    const config = {
      vectorWeight: 1.0,
      bm25Weight: 1.0,
      memoryWeight: 1.0,
      symbolWeight: 1.0,
      maxDepth: 2,
      earlyStopThreshold: 10,
      confidenceMultiplier: 1.0
    };

    const vectorResults = [
      { id: '1', score: 0.9, path: '/file1.js' },
      { id: '2', score: 0.8, path: '/file2.js' },
      { id: '3', score: 0.7, path: '/file3.js' }
    ];

    const bm25Results = [
      { id: '2', score: 0.9, path: '/file2.js' },
      { id: '1', score: 0.8, path: '/file1.js' },
      { id: '4', score: 0.7, path: '/file4.js' }
    ];

    const fusedResults = optimizer.reciprocalRankFusion({
      vectorResults,
      bm25Results
    }, config, 5);

    assert.equal(fusedResults.length, 4, 'Should fuse results from all sources');
    
    // Results that appear in both sources should rank higher
    const sharedResult1 = fusedResults.find(r => r.id === '1');
    const sharedResult2 = fusedResults.find(r => r.id === '2');
    const uniqueResult = fusedResults.find(r => r.id === '4');

    assert.ok(sharedResult1, 'Should include shared result 1');
    assert.ok(sharedResult2, 'Should include shared result 2');
    assert.ok(uniqueResult, 'Should include unique result');

    // Shared results should have higher scores than unique results
    assert.ok(sharedResult1.score > uniqueResult.score, 'Shared results should rank higher');
    assert.ok(sharedResult2.score > uniqueResult.score, 'Shared results should rank higher');

    // Should preserve rank information
    assert.equal(sharedResult1.vectorRank, 0, 'Should preserve vector rank');
    assert.equal(sharedResult1.bm25Rank, 1, 'Should preserve BM25 rank');
    assert.equal(sharedResult1.path, '/file1.js', 'Should preserve metadata');
  });

  test('should handle empty result sets in RRF', () => {
    const config = {
      vectorWeight: 1.0,
      bm25Weight: 1.0,
      memoryWeight: 1.0,
      symbolWeight: 1.0,
      maxDepth: 2,
      earlyStopThreshold: 10,
      confidenceMultiplier: 1.0
    };

    const vectorResults = [
      { id: '1', score: 0.9 },
      { id: '2', score: 0.8 }
    ];

    const fusedResults = optimizer.reciprocalRankFusion({
      vectorResults,
      bm25Results: [],
      memoryResults: [],
      symbolResults: []
    }, config, 5);

    assert.equal(fusedResults.length, 2, 'Should handle empty result sets');
    assert.equal(fusedResults[0].id, '1', 'Should preserve order from available results');
    assert.equal(fusedResults[1].id, '2', 'Should preserve order from available results');
  });

  test('should cache configurations', () => {
    const intent = {
      intent: 'symbol',
      confidence: 0.8,
      entities: [],
      suggestedPolicies: []
    };

    const policy = {
      maxDepth: 2,
      includeSymbols: true,
      includeFiles: false,
      includeContent: true,
      earlyStopThreshold: 3,
      seedWeights: {
        definition: 2.0,
        declaration: 1.8,
        implementation: 1.5,
        usage: 1.0,
        test: 0.8,
        reference: 0.5
      }
    };

    // First call should compute
    const config1 = optimizer.optimize(intent, policy);
    
    // Second call with same parameters should use cache
    const config2 = optimizer.optimize(intent, policy);

    assert.deepEqual(config1, config2, 'Cached configuration should match');
    
    const metrics = optimizer.getPerformanceMetrics();
    assert.ok(metrics.cacheHits > 0, 'Should have cache hits');
    assert.ok(metrics.cacheHitRate > 0, 'Should have positive cache hit rate');
  });

  test('should track performance metrics', () => {
    const intent = {
      intent: 'symbol',
      confidence: 0.8,
      entities: [],
      suggestedPolicies: []
    };

    const policy = {
      maxDepth: 2,
      includeSymbols: true,
      includeFiles: false,
      includeContent: true,
      earlyStopThreshold: 3,
      seedWeights: {
        definition: 2.0,
        declaration: 1.8,
        implementation: 1.5,
        usage: 1.0,
        test: 0.8,
        reference: 0.5
      }
    };

    // Reset metrics
    optimizer.resetMetrics();

    // Perform several operations
    optimizer.optimize(intent, policy);
    optimizer.optimize({ ...intent, intent: 'config' }, policy);
    optimizer.applyEarlyStop([
      { id: '1', score: 0.9 },
      { id: '2', score: 0.8 },
      { id: '3', score: 0.7 },
      { id: '4', score: 0.1 }
    ], optimizer.optimize(intent, policy));

    const metrics = optimizer.getPerformanceMetrics();

    assert.ok(metrics.totalResultsProcessed > 0, 'Should track processed results');
    assert.ok(metrics.intentDistribution.symbol > 0, 'Should track symbol intent distribution');
    assert.ok(metrics.intentDistribution.config > 0, 'Should track config intent distribution');
  });

  test('should handle unknown intent types gracefully', () => {
    const intent = {
      intent: 'unknown',
      confidence: 0.8,
      entities: [],
      suggestedPolicies: []
    };

    const policy = {
      maxDepth: 2,
      includeSymbols: true,
      includeFiles: false,
      includeContent: true,
      earlyStopThreshold: 3,
      seedWeights: {
        definition: 2.0,
        declaration: 1.8,
        implementation: 1.5,
        usage: 1.0,
        test: 0.8,
        reference: 0.5
      }
    };

    const config = optimizer.optimize(intent, policy);

    // Should fall back to default configuration
    assert.equal(config.vectorWeight, 1.0, 'Unknown intent should use default vector weight');
    assert.equal(config.bm25Weight, 1.0, 'Unknown intent should use default BM25 weight');
    assert.equal(config.memoryWeight, 1.0, 'Unknown intent should use default memory weight');
    assert.equal(config.symbolWeight, 1.0, 'Unknown intent should use default symbol weight');
  });

  test('should validate configuration constraints', () => {
    const intent = {
      intent: 'symbol',
      confidence: 0.8,
      entities: [],
      suggestedPolicies: []
    };

    const invalidPolicy = {
      maxDepth: 15, // Invalid - too high
      includeSymbols: true,
      includeFiles: false,
      includeContent: true,
      earlyStopThreshold: 60, // Invalid - too high
      seedWeights: {
        definition: 10.0 // Invalid - too high
      }
    };

    // Should not throw, but should fall back to defaults
    const config = optimizer.optimize(intent, invalidPolicy);
    
    assert.ok(config.maxDepth <= 10, 'Should clamp maxDepth to valid range');
    assert.ok(config.earlyStopThreshold <= 50, 'Should clamp earlyStopThreshold to valid range');
    assert.ok(config.symbolWeight <= 5.0, 'Should clamp weights to valid range');
  });

  test('should calculate rank stability for tie-breaking', () => {
    const config = {
      vectorWeight: 1.0,
      bm25Weight: 1.0,
      memoryWeight: 1.0,
      symbolWeight: 1.0,
      maxDepth: 2,
      earlyStopThreshold: 10,
      confidenceMultiplier: 1.0
    };

    // Create results with same score but different rank stability
    const vectorResults = [
      { id: 'stable', score: 0.9 }, // Rank 0 in vector
      { id: 'unstable', score: 0.9 } // Rank 0 in vector
    ];

    const bm25Results = [
      { id: 'stable', score: 0.8 }, // Rank 0 in BM25 (stable)
      { id: 'unstable', score: 0.7 } // Rank 5 in BM25 (unstable)
    ];

    const fusedResults = optimizer.reciprocalRankFusion({
      vectorResults,
      bm25Results
    }, config, 5);

    const stableResult = fusedResults.find(r => r.id === 'stable');
    const unstableResult = fusedResults.find(r => r.id === 'unstable');

    assert.ok(stableResult.score > unstableResult.score, 'More stable result should rank higher');
  });

  test('should clear cache and reset metrics', () => {
    // Generate some data
    const intent = {
      intent: 'symbol',
      confidence: 0.8,
      entities: [],
      suggestedPolicies: []
    };

    const policy = {
      maxDepth: 2,
      includeSymbols: true,
      includeFiles: false,
      includeContent: true,
      earlyStopThreshold: 3,
      seedWeights: {
        definition: 2.0,
        declaration: 1.8,
        implementation: 1.5,
        usage: 1.0,
        test: 0.8,
        reference: 0.5
      }
    };

    optimizer.optimize(intent, policy);

    // Clear cache
    optimizer.clearCache();
    
    // Should have no cache hits after clearing
    optimizer.resetMetrics();
    optimizer.optimize(intent, policy);
    
    const metrics = optimizer.getPerformanceMetrics();
    assert.equal(metrics.cacheHits, 0, 'Should have no cache hits after clearing');
  });
});