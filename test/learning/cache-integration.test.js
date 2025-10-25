import { test, describe } from 'node:test';
import assert from 'node:assert';
import { CacheIntegration } from '../../src/learning/cache-integration.js';

describe('CacheIntegration', () => {
  test('should generate consistent query signatures', async () => {
    const integration = new CacheIntegration();
    
    try {
      const query = 'find user authentication functions';
      const intent = { intent: 'symbol', confidence: 0.85, entities: [], suggestedPolicies: [] };
      const context = { repo: 'myapp/backend', language: 'typescript' };
      
      const signature1 = integration.generateQuerySignature(query, intent, context);
      const signature2 = integration.generateQuerySignature(query, intent, context);
      
      assert.strictEqual(signature1, signature2, 'Should generate consistent signatures');
      assert.ok(signature1.startsWith('q_'), 'Signature should start with q_ prefix');
      assert.strictEqual(signature1.length, 18, 'Signature should be 18 characters long');
    } finally {
      await integration.destroy();
    }
  });

  test('should generate different signatures for different inputs', async () => {
    const integration = new CacheIntegration();
    
    try {
      const query = 'find user functions';
      const intent = { intent: 'symbol', confidence: 0.85, entities: [], suggestedPolicies: [] };
      const context1 = { repo: 'myapp/backend', language: 'typescript' };
      const context2 = { repo: 'myapp/frontend', language: 'typescript' };
      
      const signature1 = integration.generateQuerySignature(query, intent, context1);
      const signature2 = integration.generateQuerySignature(query, intent, context2);
      
      assert.notStrictEqual(signature1, signature2, 'Should generate different signatures for different context');
    } finally {
      await integration.destroy();
    }
  });

  test('should cache and retrieve results', async () => {
    const integration = new CacheIntegration();
    
    try {
      const querySignature = 'q_test1234567890';
      const bundleId = 'bundle_test_123';
      const satisfaction = 0.9;
      
      // Cache a result
      await integration.cacheResult(querySignature, bundleId, satisfaction);
      
      // Retrieve the cached result
      const cached = await integration.getCachedResult(querySignature);
      
      assert.ok(cached, 'Should retrieve cached result');
      assert.strictEqual(cached.querySignature, querySignature);
      assert.strictEqual(cached.bundleId, bundleId);
      assert.strictEqual(cached.satisfaction, satisfaction);
    } finally {
      await integration.destroy();
    }
  });

  test('should return null for non-existent cache entries', async () => {
    const integration = new CacheIntegration();
    
    try {
      const result = await integration.getCachedResult('q_nonexistent');
      assert.strictEqual(result, null, 'Should return null for non-existent entries');
    } finally {
      await integration.destroy();
    }
  });

  test('should not cache results below satisfaction threshold', async () => {
    const integration = new CacheIntegration({ satisfactionThreshold: 0.8 });
    
    try {
      const querySignature = 'q_low_satisfaction';
      const bundleId = 'bundle_low';
      const satisfaction = 0.7; // Below threshold
      
      // Try to cache a low satisfaction result
      await integration.cacheResult(querySignature, bundleId, satisfaction);
      
      // Should not find it in cache
      const cached = await integration.getCachedResult(querySignature);
      assert.strictEqual(cached, null, 'Should not cache results below threshold');
    } finally {
      await integration.destroy();
    }
  });

  test('should update satisfaction for existing entries', async () => {
    const integration = new CacheIntegration();
    
    try {
      const querySignature = 'q_update_test';
      const bundleId = 'bundle_update';
      const initialSatisfaction = 0.9;
      const updatedSatisfaction = 0.6;
      
      // Cache initial result
      await integration.cacheResult(querySignature, bundleId, initialSatisfaction);
      
      // Update satisfaction
      await integration.updateSatisfaction(querySignature, updatedSatisfaction);
      
      // Verify updated satisfaction
      const cached = await integration.getCachedResult(querySignature);
      assert.ok(cached, 'Should still find cached entry');
      assert.strictEqual(cached.satisfaction, updatedSatisfaction, 'Should update satisfaction');
    } finally {
      await integration.destroy();
    }
  });

  test('should provide cache statistics', async () => {
    const integration = new CacheIntegration();
    
    try {
      // Get initial stats
      const initialStats = await integration.getCacheStats();
      assert.strictEqual(initialStats.totalRequests, 0);
      assert.strictEqual(initialStats.cacheHits, 0);
      assert.strictEqual(initialStats.cacheMisses, 0);
      assert.strictEqual(initialStats.entries, 0);
      
      // Add an entry and perform operations
      await integration.cacheResult('q_stats_test', 'bundle_stats', 0.9);
      await integration.getCachedResult('q_stats_test'); // Hit
      await integration.getCachedResult('q_nonexistent'); // Miss
      
      // Get updated stats
      const updatedStats = await integration.getCacheStats();
      assert.strictEqual(updatedStats.totalRequests, 2);
      assert.strictEqual(updatedStats.cacheHits, 1);
      assert.strictEqual(updatedStats.cacheMisses, 1);
      assert.strictEqual(updatedStats.entries, 1);
      assert.strictEqual(updatedStats.hitRate, 0.5);
    } finally {
      await integration.destroy();
    }
  });

  test('should invalidate cache entries', async () => {
    const integration = new CacheIntegration();
    
    try {
      // Add multiple entries
      await integration.cacheResult('q_pattern_test_1', 'bundle_1', 0.9);
      await integration.cacheResult('q_pattern_test_2', 'bundle_2', 0.9);
      await integration.cacheResult('q_other_query', 'bundle_3', 0.9);
      
      // Invalidate entries matching pattern
      await integration.invalidateCache('pattern_test');
      
      // Check that pattern entries are invalidated
      const cached1 = await integration.getCachedResult('q_pattern_test_1');
      const cached2 = await integration.getCachedResult('q_pattern_test_2');
      assert.strictEqual(cached1, null, 'Pattern entry 1 should be invalidated');
      assert.strictEqual(cached2, null, 'Pattern entry 2 should be invalidated');
      
      // Check that non-matching entry is still cached
      const cached3 = await integration.getCachedResult('q_other_query');
      assert.ok(cached3, 'Non-matching entry should still be cached');
    } finally {
      await integration.destroy();
    }
  });

  test('should process outcome signals', async () => {
    const integration = new CacheIntegration({ satisfactionThreshold: 0.4 });
    
    try {
      // Add an initial cache entry (above threshold)
      await integration.cacheResult('q_signal_test', 'bundle_signal', 0.5);
      
      // Process outcome signals
      const signals = [
        {
          bundleSignature: 'q_signal_test',
          satisfied: true,
          query: 'test query',
          sessionId: 'session1'
        },
        {
          bundleSignature: 'q_nonexistent',
          satisfied: false,
          query: 'other query',
          sessionId: 'session2'
        }
      ];
      
      await integration.processOutcomeSignals(signals);
      
      // Check that satisfaction was updated for existing entry
      const cached = await integration.getCachedResult('q_signal_test');
      assert.ok(cached, 'Entry should still exist');
      assert.strictEqual(cached.satisfaction, 1.0, 'Satisfaction should be updated to 1.0');
    } finally {
      await integration.destroy();
    }
  });

  test('should handle query signature generation without intent or context', async () => {
    const integration = new CacheIntegration();
    
    try {
      const query = 'simple search query';
      
      const signature = integration.generateQuerySignature(query);
      
      assert.ok(signature, 'Should generate signature even without intent/context');
      assert.ok(signature.startsWith('q_'), 'Signature should have correct prefix');
      assert.strictEqual(signature.length, 18, 'Signature should have correct length');
    } finally {
      await integration.destroy();
    }
  });
});