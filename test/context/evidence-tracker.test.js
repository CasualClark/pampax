#!/usr/bin/env node
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EvidenceTracker, EvidenceTrackerFactory } from '../../src/context/evidence-tracker.js';

test('EvidenceTracker - Basic functionality', async (t) => {
  await t.test('should create tracker with default options', () => {
    const tracker = new EvidenceTracker();
    assert(tracker instanceof EvidenceTracker);
    assert.strictEqual(typeof tracker.sessionId, 'string');
    assert.strictEqual(tracker.maxEvidenceItems, 1000);
    assert.strictEqual(tracker.enableDetailedLogging, false);
  });

  await t.test('should create tracker with custom options', () => {
    const options = {
      maxEvidenceItems: 500,
      enableDetailedLogging: true,
      sessionId: 'test_session'
    };
    const tracker = new EvidenceTracker(options);
    assert.strictEqual(tracker.maxEvidenceItems, 500);
    assert.strictEqual(tracker.enableDetailedLogging, true);
    assert.strictEqual(tracker.sessionId, 'test_session');
  });
});

test('EvidenceTracker - Search evidence', async (t) => {
  await t.test('should add search evidence successfully', () => {
    const tracker = new EvidenceTracker();
    const itemId = 'item_1';
    const evidence = {
      score: 0.85,
      searchType: 'vector',
      query: 'test query',
      rank: 1,
      metadata: { lang: 'javascript' }
    };

    const evidenceId = tracker.addSearchEvidence(itemId, evidence);
    
    assert(typeof evidenceId === 'string');
    assert(evidenceId.startsWith('evidence_'));

    const storedEvidence = tracker.getEvidenceForItem(itemId);
    assert.strictEqual(storedEvidence.length, 1);
    assert.strictEqual(storedEvidence[0].type, 'search');
    assert.strictEqual(storedEvidence[0].data.score, 0.85);
    assert.strictEqual(storedEvidence[0].data.searchType, 'vector');
  });

  await t.test('should handle multiple search evidence items', () => {
    const tracker = new EvidenceTracker();
    const itemId = 'item_1';

    tracker.addSearchEvidence(itemId, { score: 0.9, searchType: 'vector' });
    tracker.addSearchEvidence(itemId, { score: 0.7, searchType: 'bm25' });

    const evidence = tracker.getEvidenceForItem(itemId);
    assert.strictEqual(evidence.length, 2);
  });
});

test('EvidenceTracker - Graph evidence', async (t) => {
  await t.test('should add graph evidence successfully', () => {
    const tracker = new EvidenceTracker();
    const itemId = 'item_2';
    const evidence = {
      relationships: [
        { type: 'calls', to: 'function_a', confidence: 0.9 },
        { type: 'imports', to: 'module_b', confidence: 0.8 }
      ],
      graphExpansionScore: 0.85,
      confidence: 0.88
    };

    const evidenceId = tracker.addGraphEvidence(itemId, evidence);
    
    assert(typeof evidenceId === 'string');
    
    const storedEvidence = tracker.getEvidenceForItem(itemId);
    assert.strictEqual(storedEvidence.length, 1);
    assert.strictEqual(storedEvidence[0].type, 'graph');
    assert.strictEqual(storedEvidence[0].data.relationships.length, 2);
    assert.strictEqual(storedEvidence[0].data.confidence, 0.88);
  });
});

test('EvidenceTracker - Intent evidence', async (t) => {
  await t.test('should add intent evidence successfully', () => {
    const tracker = new EvidenceTracker();
    const itemId = 'item_3';
    const evidence = {
      intent: 'symbol',
      confidence: 0.92,
      entities: [{ type: 'function', value: 'testFunc' }],
      suggestedPolicies: ['symbol-aware'],
      contextualRelevance: 0.85
    };

    const evidenceId = tracker.addIntentEvidence(itemId, evidence);
    
    assert(typeof evidenceId === 'string');
    
    const storedEvidence = tracker.getEvidenceForItem(itemId);
    assert.strictEqual(storedEvidence.length, 1);
    assert.strictEqual(storedEvidence[0].type, 'intent');
    assert.strictEqual(storedEvidence[0].data.intent, 'symbol');
    assert.strictEqual(storedEvidence[0].data.confidence, 0.92);
    assert.strictEqual(storedEvidence[0].data.entities.length, 1);
  });
});

test('EvidenceTracker - Learning evidence', async (t) => {
  await t.test('should add learning evidence successfully', () => {
    const tracker = new EvidenceTracker();
    const itemId = 'item_4';
    const evidence = {
      signal: 'positive',
      weight: 0.8,
      userSatisfaction: 0.9,
      outcomeScore: 0.85,
      adaptationFactor: 1.2
    };

    const evidenceId = tracker.addLearningEvidence(itemId, evidence);
    
    assert(typeof evidenceId === 'string');
    
    const storedEvidence = tracker.getEvidenceForItem(itemId);
    assert.strictEqual(storedEvidence.length, 1);
    assert.strictEqual(storedEvidence[0].type, 'learning');
    assert.strictEqual(storedEvidence[0].data.signal, 'positive');
    assert.strictEqual(storedEvidence[0].data.weight, 0.8);
  });
});

test('EvidenceTracker - Cache evidence', async (t) => {
  await t.test('should add cache evidence successfully', () => {
    const tracker = new EvidenceTracker();
    const itemId = 'item_5';
    const evidence = {
      cacheHit: true,
      cacheKey: 'cache_key_123',
      cacheAge: 300,
      retrievalTime: 5,
      cacheType: 'memory',
      hitRate: 0.85
    };

    const evidenceId = tracker.addCacheEvidence(itemId, evidence);
    
    assert(typeof evidenceId === 'string');
    
    const storedEvidence = tracker.getEvidenceForItem(itemId);
    assert.strictEqual(storedEvidence.length, 1);
    assert.strictEqual(storedEvidence[0].type, 'cache');
    assert.strictEqual(storedEvidence[0].data.cacheHit, true);
    assert.strictEqual(storedEvidence[0].data.retrievalTime, 5);
  });
});

test('EvidenceTracker - Performance evidence', async (t) => {
  await t.test('should add performance evidence successfully', () => {
    const tracker = new EvidenceTracker();
    const itemId = 'item_6';
    const evidence = {
      responseTime: 150,
      processingTime: 120,
      tokenCount: 2500,
      memoryUsage: 1024,
      throughput: 100
    };

    const evidenceId = tracker.addPerformanceEvidence(itemId, evidence);
    
    assert(typeof evidenceId === 'string');
    
    const storedEvidence = tracker.getEvidenceForItem(itemId);
    assert.strictEqual(storedEvidence.length, 1);
    assert.strictEqual(storedEvidence[0].type, 'performance');
    assert.strictEqual(storedEvidence[0].data.responseTime, 150);
    assert.strictEqual(storedEvidence[0].data.tokenCount, 2500);
  });
});

test('EvidenceTracker - Evidence retrieval', async (t) => {
  await t.test('should get evidence by type', () => {
    const tracker = new EvidenceTracker();
    
    tracker.addSearchEvidence('item_1', { score: 0.8 });
    tracker.addGraphEvidence('item_2', { confidence: 0.9 });
    tracker.addSearchEvidence('item_3', { score: 0.7 });

    const searchEvidence = tracker.getEvidenceByType('search');
    assert.strictEqual(searchEvidence.length, 2);
    
    const graphEvidence = tracker.getEvidenceByType('graph');
    assert.strictEqual(graphEvidence.length, 1);
  });

  await t.test('should get evidence for session', () => {
    const tracker = new EvidenceTracker({ sessionId: 'test_session' });
    
    tracker.addSearchEvidence('item_1', { score: 0.8 });
    tracker.addGraphEvidence('item_2', { confidence: 0.9 });

    const sessionEvidence = tracker.getEvidenceForSession('test_session');
    assert.strictEqual(sessionEvidence.length, 2);
  });
});

test('EvidenceTracker - Evidence filtering', async (t) => {
  await t.test('should filter evidence by multiple criteria', () => {
    const tracker = new EvidenceTracker();
    
    tracker.addSearchEvidence('item_1', { score: 0.9 });
    tracker.addGraphEvidence('item_1', { confidence: 0.8 });
    tracker.addSearchEvidence('item_2', { score: 0.6 });

    // Filter by item ID
    let filtered = tracker.filterEvidence({ itemId: 'item_1' });
    assert.strictEqual(filtered.length, 2);

    // Filter by type
    filtered = tracker.filterEvidence({ type: 'search' });
    assert.strictEqual(filtered.length, 2);

    // Filter by minimum score
    filtered = tracker.filterEvidence({ minScore: 0.8 });
    assert.strictEqual(filtered.length, 2); // Both search items have scores >= 0.8

    // Filter by custom predicate
    filtered = tracker.filterEvidence({
      predicate: (item) => item.data.score > 0.7
    });
    assert.strictEqual(filtered.length, 1);
  });
});

test('EvidenceTracker - Serialization', async (t) => {
  await t.test('should serialize evidence to JSON', () => {
    const tracker = new EvidenceTracker();
    
    tracker.addSearchEvidence('item_1', { score: 0.8, query: 'test' });
    tracker.addGraphEvidence('item_2', { confidence: 0.9 });

    const json = tracker.serializeEvidence(null, 'json');
    const parsed = JSON.parse(json);
    
    assert(Array.isArray(parsed));
    assert.strictEqual(parsed.length, 2);
    assert.strictEqual(parsed[0].type, 'search');
    assert.strictEqual(parsed[1].type, 'graph');
  });

  await t.test('should serialize evidence to summary', () => {
    const tracker = new EvidenceTracker();
    
    tracker.addSearchEvidence('item_1', { score: 0.8 });
    tracker.addCacheEvidence('item_1', { cacheHit: true });
    tracker.addPerformanceEvidence('item_2', { responseTime: 150 });

    const summary = tracker.serializeEvidence(null, 'summary');
    const parsed = JSON.parse(summary);
    
    assert.strictEqual(parsed.totalEvidence, 3);
    assert(parsed.typeCounts.search === 1);
    assert(parsed.typeCounts.cache === 1);
    assert(parsed.typeCounts.performance === 1);
  });

  await t.test('should serialize evidence to CSV', () => {
    const tracker = new EvidenceTracker();
    
    tracker.addSearchEvidence('item_1', { score: 0.8 });

    const csv = tracker.serializeEvidence(null, 'csv');
    const lines = csv.split('\n');
    
    assert(lines.length >= 2); // Header + at least one data row
    assert(lines[0].includes('id,type,itemId,timestamp,sessionId,data'));
  });
});

test('EvidenceTracker - Analysis', async (t) => {
  await t.test('should analyze evidence patterns', () => {
    const tracker = new EvidenceTracker();
    
    tracker.addSearchEvidence('item_1', { score: 0.9 });
    tracker.addSearchEvidence('item_2', { score: 0.7 });
    tracker.addLearningEvidence('item_1', { signal: 'positive', userSatisfaction: 0.8 });
    tracker.addCacheEvidence('item_1', { cacheHit: true, retrievalTime: 5 });

    const analysis = tracker.analyzeEvidence();
    
    assert.strictEqual(analysis.totalItems, 4);
    assert.strictEqual(analysis.typeDistribution.search, 2);
    assert.strictEqual(analysis.typeDistribution.learning, 1);
    assert.strictEqual(analysis.typeDistribution.cache, 1);
    assert.strictEqual(analysis.learningSignals.positiveSignals, 1);
    assert.strictEqual(analysis.cacheEfficiency.hitRate, 1);
  });

  await t.test('should analyze evidence for specific item', () => {
    const tracker = new EvidenceTracker();
    
    tracker.addSearchEvidence('item_1', { score: 0.9 });
    tracker.addGraphEvidence('item_1', { confidence: 0.8 });
    tracker.addSearchEvidence('item_2', { score: 0.7 });

    const analysis = tracker.analyzeEvidence('item_1');
    
    assert.strictEqual(analysis.totalItems, 2);
    assert.strictEqual(analysis.typeDistribution.search, 1);
    assert.strictEqual(analysis.typeDistribution.graph, 1);
  });
});

test('EvidenceTracker - Statistics', async (t) => {
  await t.test('should provide evidence statistics', () => {
    const tracker = new EvidenceTracker({ sessionId: 'test_session' });
    
    tracker.addSearchEvidence('item_1', { score: 0.8 });
    tracker.addGraphEvidence('item_2', { confidence: 0.9 });

    const stats = tracker.getStatistics();
    
    assert.strictEqual(stats.totalEvidence, 2);
    assert.strictEqual(stats.evidenceByType.search, 1);
    assert.strictEqual(stats.evidenceByType.graph, 1);
    assert.strictEqual(stats.currentSession, 'test_session');
    assert(stats.memoryUsage);
    assert.strictEqual(stats.storeSize, 2);
  });
});

test('EvidenceTracker - Import/Export', async (t) => {
  await t.test('should export and import evidence', () => {
    const tracker1 = new EvidenceTracker();
    
    tracker1.addSearchEvidence('item_1', { score: 0.8, query: 'test' });
    tracker1.addGraphEvidence('item_2', { confidence: 0.9 });

    const exported = tracker1.exportEvidence('json');
    
    const tracker2 = new EvidenceTracker();
    const importedCount = tracker2.importEvidence(exported, 'json');
    
    assert.strictEqual(importedCount, 2);
    assert.strictEqual(tracker2.getStatistics().totalEvidence, 2);
  });

  await t.test('should handle invalid import data', () => {
    const tracker = new EvidenceTracker();
    
    assert.throws(() => {
      tracker.importEvidence('invalid json', 'json');
    });

    assert.throws(() => {
      tracker.importEvidence('{"not": "an array"}', 'json');
    });
  });
});

test('EvidenceTracker - Evidence validation', async (t) => {
  await t.test('should validate evidence items', () => {
    const tracker = new EvidenceTracker();
    
    // Valid evidence item
    const validItem = {
      id: 'evidence_123',
      type: 'search',
      itemId: 'item_1',
      timestamp: Date.now(),
      data: { score: 0.8 }
    };
    assert.strictEqual(tracker.isValidEvidenceItem(validItem), true);

    // Invalid evidence items
    assert.strictEqual(tracker.isValidEvidenceItem(null), false);
    assert.strictEqual(tracker.isValidEvidenceItem({}), false);
    assert.strictEqual(tracker.isValidEvidenceItem({ id: 123 }), false);
    assert.strictEqual(tracker.isValidEvidenceItem({ id: 'test', type: 'search' }), false);
    assert.strictEqual(tracker.isValidEvidenceItem({ id: 'test', type: 'search', itemId: 'item1' }), false);
  });
});

test('EvidenceTracker - Memory management', async (t) => {
  await t.test('should enforce size limits', () => {
    const tracker = new EvidenceTracker({ maxEvidenceItems: 3 });
    
    tracker.addSearchEvidence('item_1', { score: 0.8 });
    tracker.addSearchEvidence('item_2', { score: 0.7 });
    tracker.addSearchEvidence('item_3', { score: 0.6 });
    
    assert.strictEqual(tracker.getStatistics().storeSize, 3);
    
    // Add one more - should remove oldest
    tracker.addSearchEvidence('item_4', { score: 0.9 });
    
    assert.strictEqual(tracker.getStatistics().storeSize, 3);
    
    // First item should be gone
    const evidence = tracker.getEvidenceForItem('item_1');
    assert.strictEqual(evidence.length, 0);
  });
});

test('EvidenceTracker - Evidence clearing', async (t) => {
  await t.test('should clear evidence for specific item', () => {
    const tracker = new EvidenceTracker();
    
    tracker.addSearchEvidence('item_1', { score: 0.8 });
    tracker.addGraphEvidence('item_1', { confidence: 0.9 });
    tracker.addSearchEvidence('item_2', { score: 0.7 });

    tracker.clearEvidence('item_1');
    
    const item1Evidence = tracker.getEvidenceForItem('item_1');
    const item2Evidence = tracker.getEvidenceForItem('item_2');
    
    assert.strictEqual(item1Evidence.length, 0);
    assert.strictEqual(item2Evidence.length, 1);
  });

  await t.test('should clear all evidence', () => {
    const tracker = new EvidenceTracker();
    
    tracker.addSearchEvidence('item_1', { score: 0.8 });
    tracker.addGraphEvidence('item_2', { confidence: 0.9 });

    tracker.clearEvidence();
    
    assert.strictEqual(tracker.getStatistics().totalEvidence, 0);
  });
});

test('EvidenceTrackerFactory - Factory methods', async (t) => {
  await t.test('should create development tracker', () => {
    const tracker = EvidenceTrackerFactory.createDevelopmentTracker();
    assert.strictEqual(tracker.maxEvidenceItems, 500);
    assert.strictEqual(tracker.enableDetailedLogging, true);
  });

  await t.test('should create production tracker', () => {
    const tracker = EvidenceTrackerFactory.createProductionTracker();
    assert.strictEqual(tracker.maxEvidenceItems, 2000);
    assert.strictEqual(tracker.enableDetailedLogging, false);
  });

  await t.test('should create test tracker', () => {
    const tracker = EvidenceTrackerFactory.createTestTracker();
    assert.strictEqual(tracker.maxEvidenceItems, 100);
    assert.strictEqual(tracker.enableDetailedLogging, false);
    assert.strictEqual(tracker.sessionId, 'test_session');
  });
});

test('EvidenceTracker - Edge cases', async (t) => {
  await t.test('should handle empty evidence gracefully', () => {
    const tracker = new EvidenceTracker();
    
    assert.deepStrictEqual(tracker.getEvidenceForItem('nonexistent'), []);
    assert.deepStrictEqual(tracker.getEvidenceByType('nonexistent'), []);
    assert.deepStrictEqual(tracker.getEvidenceForSession('nonexistent'), []);
    
    const analysis = tracker.analyzeEvidence();
    assert.strictEqual(analysis.totalItems, 0);
    
    const stats = tracker.getStatistics();
    assert.strictEqual(stats.totalEvidence, 0);
  });

  await t.test('should handle missing optional fields', () => {
    const tracker = new EvidenceTracker();
    
    // Add evidence with minimal required data
    tracker.addSearchEvidence('item_1', {});
    
    const evidence = tracker.getEvidenceForItem('item_1');
    assert.strictEqual(evidence.length, 1);
    assert.strictEqual(evidence[0].data.score, 0);
    assert.strictEqual(evidence[0].data.searchType, 'vector');
  });

  await t.test('should handle unsupported serialization formats', () => {
    const tracker = new EvidenceTracker();
    
    assert.throws(() => {
      tracker.serializeEvidence(null, 'unsupported');
    });
  });
});