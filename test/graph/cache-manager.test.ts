/**
 * Tests for Traversal Cache Manager
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { TraversalCacheManager } from '../../src/graph/cache-manager.js';
import { GraphExpansion, TraversalResult } from '../../src/graph/graph-traversal.js';
import { GraphEdge } from '../../src/graph/types.js';

describe('TraversalCacheManager', () => {
  let cache: TraversalCacheManager;

  beforeEach(() => {
    cache = new TraversalCacheManager(10, 1); // Small cache for testing, 1 minute TTL
  });

  afterEach(() => {
    cache.destroy();
  });

  describe('cache operations', () => {
    it('should store and retrieve results', () => {
      const expansion: GraphExpansion = {
        query: 'test query',
        start_symbols: ['func_a'],
        max_depth: 2,
        token_budget: 1000,
        edge_types: ['call'],
        expansion_strategy: 'breadth'
      };

      const result: TraversalResult = {
        query: expansion.query,
        start_symbols: expansion.start_symbols,
        visited_nodes: new Set(['func_a', 'func_b']),
        edges: [{
          sourceId: 'func_a',
          targetId: 'func_b',
          type: 'call',
          confidence: 0.8,
          metadata: { extractor: 'test', timestamp: Date.now() }
        }],
        expansion_depth: 2,
        tokens_used: 100,
        token_budget: 1000,
        truncated: false,
        performance_ms: 50,
        cache_hit: false
      };

      // Store result
      cache.set(expansion, result);

      // Retrieve result
      const cached = cache.get(expansion);
      assert(cached);
      assert.strictEqual(cached.query, result.query);
      assert.strictEqual(cached.cache_hit, true);
      assert.deepStrictEqual(Array.from(cached.visited_nodes), Array.from(result.visited_nodes));
      assert.strictEqual(cached.edges.length, result.edges.length);
    });

    it('should return null for non-existent entries', () => {
      const expansion: GraphExpansion = {
        query: 'non-existent query',
        start_symbols: ['nonexistent'],
        max_depth: 1,
        token_budget: 1000,
        edge_types: ['call'],
        expansion_strategy: 'breadth'
      };

      const result = cache.get(expansion);
      assert.strictEqual(result, null);
    });

    it('should generate consistent cache keys', () => {
      const expansion1: GraphExpansion = {
        query: 'test query',
        start_symbols: ['func_a', 'func_b'],
        max_depth: 2,
        token_budget: 1000,
        edge_types: ['call', 'import'],
        expansion_strategy: 'breadth'
      };

      const expansion2: GraphExpansion = {
        query: 'test query',
        start_symbols: ['func_b', 'func_a'], // Different order
        max_depth: 2,
        token_budget: 1000,
        edge_types: ['import', 'call'], // Different order
        expansion_strategy: 'breadth'
      };

      const result: TraversalResult = {
        query: 'test query',
        start_symbols: ['func_a', 'func_b'],
        visited_nodes: new Set(['func_a', 'func_b']),
        edges: [],
        expansion_depth: 1,
        tokens_used: 50,
        token_budget: 1000,
        truncated: false,
        performance_ms: 25,
        cache_hit: false
      };

      // Store with first expansion
      cache.set(expansion1, result);

      // Should retrieve with second expansion (same parameters, different order)
      const cached = cache.get(expansion2);
      assert(cached);
      assert.strictEqual(cached.query, result.query);
    });

    it('should handle different queries separately', () => {
      const expansion1: GraphExpansion = {
        query: 'query 1',
        start_symbols: ['func_a'],
        max_depth: 2,
        token_budget: 1000,
        edge_types: ['call'],
        expansion_strategy: 'breadth'
      };

      const expansion2: GraphExpansion = {
        query: 'query 2',
        start_symbols: ['func_a'],
        max_depth: 2,
        token_budget: 1000,
        edge_types: ['call'],
        expansion_strategy: 'breadth'
      };

      const result1: TraversalResult = {
        query: 'query 1',
        start_symbols: ['func_a'],
        visited_nodes: new Set(['func_a']),
        edges: [],
        expansion_depth: 0,
        tokens_used: 25,
        token_budget: 1000,
        truncated: false,
        performance_ms: 10,
        cache_hit: false
      };

      const result2: TraversalResult = {
        query: 'query 2',
        start_symbols: ['func_a'],
        visited_nodes: new Set(['func_a']),
        edges: [],
        expansion_depth: 0,
        tokens_used: 30,
        token_budget: 1000,
        truncated: false,
        performance_ms: 15,
        cache_hit: false
      };

      cache.set(expansion1, result1);
      cache.set(expansion2, result2);

      const cached1 = cache.get(expansion1);
      const cached2 = cache.get(expansion2);

      assert(cached1);
      assert(cached2);
      assert.strictEqual(cached1.query, 'query 1');
      assert.strictEqual(cached2.query, 'query 2');
    });
  });

  describe('cache eviction', () => {
    it('should evict least used entries when at capacity', () => {
      const expansions: GraphExpansion[] = [];
      const results: TraversalResult[] = [];

      // Fill cache to capacity
      for (let i = 0; i < 10; i++) {
        const expansion: GraphExpansion = {
          query: `query ${i}`,
          start_symbols: [`func_${i}`],
          max_depth: 1,
          token_budget: 1000,
          edge_types: ['call'],
          expansion_strategy: 'breadth'
        };

        const result: TraversalResult = {
          query: expansion.query,
          start_symbols: expansion.start_symbols,
          visited_nodes: new Set([`func_${i}`]),
          edges: [],
          expansion_depth: 0,
          tokens_used: 25,
          token_budget: 1000,
          truncated: false,
          performance_ms: 10,
          cache_hit: false
        };

        expansions.push(expansion);
        results.push(result);
        cache.set(expansion, result);
      }

      // Access first few entries to increase their access count
      for (let i = 0; i < 5; i++) {
        cache.get(expansions[i]);
      }

      // Add one more entry to trigger eviction
      const newExpansion: GraphExpansion = {
        query: 'new query',
        start_symbols: ['new_func'],
        max_depth: 1,
        token_budget: 1000,
        edge_types: ['call'],
        expansion_strategy: 'breadth'
      };

      const newResult: TraversalResult = {
        query: 'new query',
        start_symbols: ['new_func'],
        visited_nodes: new Set(['new_func']),
        edges: [],
        expansion_depth: 0,
        tokens_used: 25,
        token_budget: 1000,
        truncated: false,
        performance_ms: 10,
        cache_hit: false
      };

      cache.set(newExpansion, newResult);

      // Should still be able to retrieve frequently accessed entries
      for (let i = 0; i < 5; i++) {
        const cached = cache.get(expansions[i]);
        assert(cached, `Entry ${i} should still be cached`);
      }

      // New entry should be cached
      const newCached = cache.get(newExpansion);
      assert(newCached);

      // Cache size should not exceed maximum
      const stats = cache.getStats();
      assert(stats.size <= stats.maxSize);
    });
  });

  describe('TTL expiration', () => {
    it('should expire old entries', async () => {
      const expansion: GraphExpansion = {
        query: 'test query',
        start_symbols: ['func_a'],
        max_depth: 1,
        token_budget: 1000,
        edge_types: ['call'],
        expansion_strategy: 'breadth'
      };

      const result: TraversalResult = {
        query: 'test query',
        start_symbols: ['func_a'],
        visited_nodes: new Set(['func_a']),
        edges: [],
        expansion_depth: 0,
        tokens_used: 25,
        token_budget: 1000,
        truncated: false,
        performance_ms: 10,
        cache_hit: false
      };

      // Create cache with very short TTL for testing
      const shortCache = new TraversalCacheManager(10, 0.001); // 1ms TTL
      shortCache.set(expansion, result);

      // Should be available immediately
      let cached = shortCache.get(expansion);
      assert(cached);

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 10));
      
      cached = shortCache.get(expansion);
      assert.strictEqual(cached, null);
      shortCache.destroy();
    });
  });

  describe('node-based invalidation', () => {
    it('should invalidate entries containing specific nodes', () => {
      const expansion1: GraphExpansion = {
        query: 'query 1',
        start_symbols: ['func_a'],
        max_depth: 2,
        token_budget: 1000,
        edge_types: ['call'],
        expansion_strategy: 'breadth'
      };

      const expansion2: GraphExpansion = {
        query: 'query 2',
        start_symbols: ['func_b'],
        max_depth: 2,
        token_budget: 1000,
        edge_types: ['call'],
        expansion_strategy: 'breadth'
      };

      const expansion3: GraphExpansion = {
        query: 'query 3',
        start_symbols: ['func_c'],
        max_depth: 2,
        token_budget: 1000,
        edge_types: ['call'],
        expansion_strategy: 'breadth'
      };

      const result1: TraversalResult = {
        query: 'query 1',
        start_symbols: ['func_a'],
        visited_nodes: new Set(['func_a', 'func_b']), // Contains func_b
        edges: [],
        expansion_depth: 1,
        tokens_used: 50,
        token_budget: 1000,
        truncated: false,
        performance_ms: 25,
        cache_hit: false
      };

      const result2: TraversalResult = {
        query: 'query 2',
        start_symbols: ['func_b'],
        visited_nodes: new Set(['func_b', 'func_c']), // Contains func_b
        edges: [],
        expansion_depth: 1,
        tokens_used: 50,
        token_budget: 1000,
        truncated: false,
        performance_ms: 25,
        cache_hit: false
      };

      const result3: TraversalResult = {
        query: 'query 3',
        start_symbols: ['func_c'],
        visited_nodes: new Set(['func_c', 'func_d']), // Does not contain func_b
        edges: [],
        expansion_depth: 1,
        tokens_used: 50,
        token_budget: 1000,
        truncated: false,
        performance_ms: 25,
        cache_hit: false
      };

      cache.set(expansion1, result1);
      cache.set(expansion2, result2);
      cache.set(expansion3, result3);

      // Invalidate entries containing func_b
      cache.invalidateForNodes(['func_b']);

      // Entries 1 and 2 should be invalidated, entry 3 should remain
      assert.strictEqual(cache.get(expansion1), null);
      assert.strictEqual(cache.get(expansion2), null);
      assert(cache.get(expansion3));
    });
  });

  describe('cache statistics', () => {
    it('should provide accurate statistics', () => {
      const expansion: GraphExpansion = {
        query: 'test query',
        start_symbols: ['func_a'],
        max_depth: 1,
        token_budget: 1000,
        edge_types: ['call'],
        expansion_strategy: 'breadth'
      };

      const result: TraversalResult = {
        query: 'test query',
        start_symbols: ['func_a'],
        visited_nodes: new Set(['func_a']),
        edges: [],
        expansion_depth: 0,
        tokens_used: 25,
        token_budget: 1000,
        truncated: false,
        performance_ms: 10,
        cache_hit: false
      };

      // Initially empty
      let stats = cache.getStats();
      assert.strictEqual(stats.size, 0);
      assert.strictEqual(stats.maxSize, 10);

      // Add entry
      cache.set(expansion, result);
      stats = cache.getStats();
      assert.strictEqual(stats.size, 1);

      // Access entry (cache hit)
      cache.get(expansion);
      stats = cache.getStats();
      assert.strictEqual(stats.size, 1);
      assert(stats.hitRate !== undefined);
      assert(stats.hitRate > 0);

      // Clear cache
      cache.clear();
      stats = cache.getStats();
      assert.strictEqual(stats.size, 0);
    });
  });

  describe('cleanup', () => {
    it('should clean up resources on destroy', () => {
      const expansion: GraphExpansion = {
        query: 'test query',
        start_symbols: ['func_a'],
        max_depth: 1,
        token_budget: 1000,
        edge_types: ['call'],
        expansion_strategy: 'breadth'
      };

      const result: TraversalResult = {
        query: 'test query',
        start_symbols: ['func_a'],
        visited_nodes: new Set(['func_a']),
        edges: [],
        expansion_depth: 0,
        tokens_used: 25,
        token_budget: 1000,
        truncated: false,
        performance_ms: 10,
        cache_hit: false
      };

      cache.set(expansion, result);
      assert.strictEqual(cache.getStats().size, 1);

      cache.destroy();
      assert.strictEqual(cache.getStats().size, 0);
    });
  });
});