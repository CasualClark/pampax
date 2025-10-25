/**
 * Tests for Cached BFS Traversal Engine
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { 
  GraphExpansion, 
  GraphStorage,
  GraphEdge 
} from '../../src/graph/graph-traversal.js';
import { CachedBFSTraversalEngine } from '../../src/graph/cached-traversal.js';
import { EdgeType } from '../../src/graph/types.js';

// Mock Graph Storage implementation
class MockGraphStorage implements GraphStorage {
  private edges: Map<string, GraphEdge[]> = new Map();

  constructor() {
    this.setupTestData();
  }

  private setupTestData(): void {
    // Simple test graph
    const testEdges: GraphEdge[] = [
      { sourceId: 'func_a', targetId: 'func_b', type: 'call', confidence: 0.9, metadata: { extractor: 'test', timestamp: Date.now() } },
      { sourceId: 'func_b', targetId: 'func_c', type: 'call', confidence: 0.8, metadata: { extractor: 'test', timestamp: Date.now() } },
    ];

    for (const edge of testEdges) {
      if (!this.edges.has(edge.sourceId)) {
        this.edges.set(edge.sourceId, []);
      }
      this.edges.get(edge.sourceId)!.push(edge);
      
      if (!this.edges.has(edge.targetId)) {
        this.edges.set(edge.targetId, []);
      }
      this.edges.get(edge.targetId)!.push(edge);
    }
  }

  async getOutgoingEdges(nodeId: string, edgeTypes?: EdgeType[]): Promise<GraphEdge[]> {
    const edges = this.edges.get(nodeId) || [];
    if (edgeTypes) {
      return edges.filter(edge => edgeTypes.includes(edge.type));
    }
    return edges.filter(edge => edge.sourceId === nodeId);
  }

  async getIncomingEdges(nodeId: string, edgeTypes?: EdgeType[]): Promise<GraphEdge[]> {
    const edges = this.edges.get(nodeId) || [];
    if (edgeTypes) {
      return edges.filter(edge => edgeTypes.includes(edge.type));
    }
    return edges.filter(edge => edge.targetId === nodeId);
  }

  async getEdgesBetween(sourceId: string, targetId: string, edgeTypes?: EdgeType[]): Promise<GraphEdge[]> {
    const edges = this.edges.get(sourceId) || [];
    let result = edges.filter(edge => edge.targetId === targetId);
    
    if (edgeTypes) {
      result = result.filter(edge => edgeTypes.includes(edge.type));
    }
    
    return result;
  }

  async nodeExists(nodeId: string): Promise<boolean> {
    return this.edges.has(nodeId);
  }

  async getNodeMetadata(nodeId: string): Promise<any> {
    return undefined;
  }
}

describe('CachedBFSTraversalEngine', () => {
  let storage: MockGraphStorage;
  let engine: CachedBFSTraversalEngine;

  beforeEach(() => {
    storage = new MockGraphStorage();
    engine = new CachedBFSTraversalEngine(storage, 1000);
  });

  afterEach(() => {
    engine.destroy();
  });

  describe('caching behavior', () => {
    it('should cache traversal results', async () => {
      const expansion: GraphExpansion = {
        query: 'test query',
        start_symbols: ['func_a'],
        max_depth: 2,
        token_budget: 1000,
        edge_types: ['call'],
        expansion_strategy: 'breadth'
      };

      // First traversal
      const result1 = await engine.expandGraph(expansion);
      assert.strictEqual(result1.cache_hit, false);

      // Second traversal should hit cache
      const result2 = await engine.expandGraph(expansion);
      assert.strictEqual(result2.cache_hit, true);
      assert.strictEqual(result2.query, result1.query);
      assert.deepStrictEqual(Array.from(result2.visited_nodes), Array.from(result1.visited_nodes));
      assert.strictEqual(result2.edges.length, result1.edges.length);
    });

    it('should handle cache misses for different queries', async () => {
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

      // First query
      const result1 = await engine.expandGraph(expansion1);
      assert.strictEqual(result1.cache_hit, false);
      assert.strictEqual(result1.query, 'query 1');

      // Second query should be different
      const result2 = await engine.expandGraph(expansion2);
      assert.strictEqual(result2.cache_hit, false);
      assert.strictEqual(result2.query, 'query 2');
    });

    it('should provide cache statistics', async () => {
      const expansion: GraphExpansion = {
        query: 'test query',
        start_symbols: ['func_a'],
        max_depth: 1,
        token_budget: 1000,
        edge_types: ['call'],
        expansion_strategy: 'breadth'
      };

      // Initially empty cache
      let stats = engine.getCacheStats();
      assert.strictEqual(stats.size, 0);

      // Perform traversal
      await engine.expandGraph(expansion);
      stats = engine.getCacheStats();
      assert.strictEqual(stats.size, 1);

      // Access again (cache hit)
      await engine.expandGraph(expansion);
      stats = engine.getCacheStats();
      assert.strictEqual(stats.size, 1);
      assert(stats.hitRate !== undefined);
      assert(stats.hitRate > 0);
    });

    it('should clear cache', async () => {
      const expansion: GraphExpansion = {
        query: 'test query',
        start_symbols: ['func_a'],
        max_depth: 1,
        token_budget: 1000,
        edge_types: ['call'],
        expansion_strategy: 'breadth'
      };

      // Populate cache
      await engine.expandGraph(expansion);
      assert.strictEqual(engine.getCacheStats().size, 1);

      // Clear cache
      engine.clearCache();
      assert.strictEqual(engine.getCacheStats().size, 0);
    });

    it('should invalidate cache for specific nodes', async () => {
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

      // Populate cache
      await engine.expandGraph(expansion1);
      await engine.expandGraph(expansion2);
      assert.strictEqual(engine.getCacheStats().size, 2);

      // Invalidate cache for func_a
      engine.invalidateCacheForNodes(['func_a']);
      
      // First expansion should be invalidated, second should remain
      const result1 = await engine.expandGraph(expansion1);
      const result2 = await engine.expandGraph(expansion2);
      
      assert.strictEqual(result1.cache_hit, false);
      assert.strictEqual(result2.cache_hit, true);
    });
  });

  describe('traversal functionality', () => {
    it('should perform correct BFS traversal', async () => {
      const expansion: GraphExpansion = {
        query: 'test query',
        start_symbols: ['func_a'],
        max_depth: 2,
        token_budget: 1000,
        edge_types: ['call'],
        expansion_strategy: 'breadth'
      };

      const result = await engine.expandGraph(expansion);

      assert.strictEqual(result.query, expansion.query);
      assert.deepStrictEqual(result.start_symbols, expansion.start_symbols);
      assert(result.visited_nodes.has('func_a'));
      assert(result.visited_nodes.has('func_b'));
      assert(result.visited_nodes.has('func_c'));
      assert(result.edges.length > 0);
    });

    it('should respect token budget', async () => {
      const expansion: GraphExpansion = {
        query: 'test query',
        start_symbols: ['func_a'],
        max_depth: 2,
        token_budget: 10, // Very small budget
        edge_types: ['call'],
        expansion_strategy: 'breadth'
      };

      const result = await engine.expandGraph(expansion);

      assert(result.truncated);
      assert(result.tokens_used <= result.token_budget);
    });
  });

  describe('resource cleanup', () => {
    it('should cleanup resources on destroy', async () => {
      const expansion: GraphExpansion = {
        query: 'test query',
        start_symbols: ['func_a'],
        max_depth: 1,
        token_budget: 1000,
        edge_types: ['call'],
        expansion_strategy: 'breadth'
      };

      // Populate cache
      await engine.expandGraph(expansion);
      assert.strictEqual(engine.getCacheStats().size, 1);

      // Destroy engine
      engine.destroy();
      assert.strictEqual(engine.getCacheStats().size, 0);
    });
  });
});