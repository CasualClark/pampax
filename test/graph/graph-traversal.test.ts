/**
 * Tests for Graph Traversal Engine (Phase 5: Code Graph Neighbors)
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { 
  BFSTraversalEngine, 
  TokenGuard, 
  GraphExpansion, 
  GraphStorage, 
  GraphEdge 
} from '../../src/graph/graph-traversal.js';
import { EdgeType } from '../../src/graph/types.js';

// Mock Graph Storage implementation
class MockGraphStorage implements GraphStorage {
  private edges: Map<string, GraphEdge[]> = new Map();
  private nodeMetadata: Map<string, any> = new Map();

  constructor() {
    this.setupTestData();
  }

  private setupTestData(): void {
    // Create a test graph with various edge types
    const testEdges: GraphEdge[] = [
      // Function calls
      { sourceId: 'func_a', targetId: 'func_b', type: 'call', confidence: 0.9, metadata: { extractor: 'test', timestamp: Date.now() } },
      { sourceId: 'func_b', targetId: 'func_c', type: 'call', confidence: 0.8, metadata: { extractor: 'test', timestamp: Date.now() } },
      { sourceId: 'func_c', targetId: 'func_d', type: 'call', confidence: 0.7, metadata: { extractor: 'test', timestamp: Date.now() } },
      
      // Imports
      { sourceId: 'module_a', targetId: 'module_b', type: 'import', confidence: 1.0, metadata: { extractor: 'test', timestamp: Date.now() } },
      { sourceId: 'module_b', targetId: 'module_c', type: 'import', confidence: 1.0, metadata: { extractor: 'test', timestamp: Date.now() } },
      
      // Test relationships
      { sourceId: 'test_a', targetId: 'func_a', type: 'test-of', confidence: 0.9, metadata: { extractor: 'test', timestamp: Date.now() } },
      
      // Routes
      { sourceId: 'route_a', targetId: 'func_a', type: 'routes', confidence: 0.8, metadata: { extractor: 'test', timestamp: Date.now() } },
      
      // Config keys
      { sourceId: 'config_a', targetId: 'func_b', type: 'config-key', confidence: 0.7, metadata: { extractor: 'test', timestamp: Date.now() } },
    ];

    // Index edges by source node
    for (const edge of testEdges) {
      if (!this.edges.has(edge.sourceId)) {
        this.edges.set(edge.sourceId, []);
      }
      this.edges.get(edge.sourceId)!.push(edge);
      
      // Also index by target for incoming edge queries
      if (!this.edges.has(edge.targetId)) {
        this.edges.set(edge.targetId, []);
      }
      this.edges.get(edge.targetId)!.push(edge);
    }

    // Add some node metadata
    this.nodeMetadata.set('func_a', { name: 'function_a', file: 'test.py', line: 10 });
    this.nodeMetadata.set('func_b', { name: 'function_b', file: 'test.py', line: 20 });
    this.nodeMetadata.set('func_c', { name: 'function_c', file: 'test.py', line: 30 });
    this.nodeMetadata.set('func_d', { name: 'function_d', file: 'test.py', line: 40 });
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
    return this.edges.has(nodeId) || this.nodeMetadata.has(nodeId);
  }

  async getNodeMetadata(nodeId: string): Promise<any> {
    return this.nodeMetadata.get(nodeId);
  }

  // Helper method for testing
  addEdge(edge: GraphEdge): void {
    if (!this.edges.has(edge.sourceId)) {
      this.edges.set(edge.sourceId, []);
    }
    this.edges.get(edge.sourceId)!.push(edge);
  }

  // Helper method for testing
  clear(): void {
    this.edges.clear();
    this.nodeMetadata.clear();
  }
}

describe('TokenGuard', () => {
  let tokenGuard: TokenGuard;

  beforeEach(() => {
    tokenGuard = new TokenGuard(1000);
  });

  it('should estimate tokens for strings', () => {
    const text = 'Hello world';
    const tokens = tokenGuard.estimateTokens(text);
    assert.strictEqual(typeof tokens, 'number');
    assert(tokens > 0);
  });

  it('should estimate tokens for objects', () => {
    const obj = { key: 'value', num: 42 };
    const tokens = tokenGuard.estimateTokens(obj);
    assert.strictEqual(typeof tokens, 'number');
    assert(tokens > 0);
  });

  it('should check if content fits in budget', () => {
    const smallText = 'small';
    assert(tokenGuard.canFit(smallText));
    
    const largeText = 'x'.repeat(10000);
    assert(!tokenGuard.canFit(largeText));
  });

  it('should track token usage', () => {
    const text = 'test';
    const initialUsage = tokenGuard.getUsage().used;
    
    const success = tokenGuard.tryAdd(text);
    assert(success);
    
    const newUsage = tokenGuard.getUsage().used;
    assert(newUsage > initialUsage);
  });

  it('should prevent exceeding budget', () => {
    const largeText = 'x'.repeat(10000);
    const success = tokenGuard.tryAdd(largeText);
    assert(!success);
    
    const usage = tokenGuard.getUsage();
    assert(usage.used <= usage.budget);
  });

  it('should reset usage', () => {
    tokenGuard.tryAdd('test');
    assert(tokenGuard.getUsage().used > 0);
    
    tokenGuard.reset();
    assert.strictEqual(tokenGuard.getUsage().used, 0);
  });

  it('should provide usage statistics', () => {
    tokenGuard.tryAdd('test');
    const stats = tokenGuard.getUsage();
    
    assert.strictEqual(typeof stats.budget, 'number');
    assert.strictEqual(typeof stats.used, 'number');
    assert.strictEqual(typeof stats.remaining, 'number');
    assert.strictEqual(typeof stats.percentage, 'number');
    assert(stats.budget === 1000);
    assert(stats.used > 0);
    assert(stats.remaining >= 0);
    assert(stats.percentage >= 0 && stats.percentage <= 100);
  });
});

describe('BFSTraversalEngine', () => {
  let storage: MockGraphStorage;
  let engine: BFSTraversalEngine;

  beforeEach(() => {
    storage = new MockGraphStorage();
    engine = new BFSTraversalEngine(storage, 1000);
  });

  describe('expandGraph', () => {
    it('should perform basic BFS expansion', async () => {
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
      assert.strictEqual(result.expansion_depth, 2);
      assert(result.visited_nodes.has('func_a'));
      assert(result.edges.length > 0);
      assert.strictEqual(result.cache_hit, false);
    });

    it('should respect max depth limit', async () => {
      const expansion: GraphExpansion = {
        query: 'test query',
        start_symbols: ['func_a'],
        max_depth: 1,
        token_budget: 1000,
        edge_types: ['call'],
        expansion_strategy: 'breadth'
      };

      const result = await engine.expandGraph(expansion);

      assert.strictEqual(result.expansion_depth, 1);
      // Should not reach func_d (depth 3)
      assert(!result.visited_nodes.has('func_d'));
    });

    it('should filter by edge types', async () => {
      const expansion: GraphExpansion = {
        query: 'test query',
        start_symbols: ['func_a'],
        max_depth: 2,
        token_budget: 1000,
        edge_types: ['import'],
        expansion_strategy: 'breadth'
      };

      const result = await engine.expandGraph(expansion);

      // Should only find import edges
      result.edges.forEach(edge => {
        assert.strictEqual(edge.type, 'import');
      });
    });

    it('should handle quality-first expansion strategy', async () => {
      const expansion: GraphExpansion = {
        query: 'test query',
        start_symbols: ['func_a'],
        max_depth: 2,
        token_budget: 1000,
        edge_types: ['call'],
        expansion_strategy: 'quality-first'
      };

      const result = await engine.expandGraph(expansion);

      // Edges should be sorted by confidence (highest first)
      for (let i = 1; i < result.edges.length; i++) {
        assert(result.edges[i-1].confidence >= result.edges[i].confidence);
      }
    });

    it('should enforce token budget', async () => {
      const expansion: GraphExpansion = {
        query: 'test query',
        start_symbols: ['func_a'],
        max_depth: 2,
        token_budget: 10, // Very small budget
        edge_types: ['call', 'import'],
        expansion_strategy: 'breadth'
      };

      const result = await engine.expandGraph(expansion);

      assert(result.truncated);
      assert(result.tokens_used <= result.token_budget);
    });

    it('should handle empty start symbols', async () => {
      const expansion: GraphExpansion = {
        query: 'test query',
        start_symbols: [],
        max_depth: 2,
        token_budget: 1000,
        edge_types: ['call'],
        expansion_strategy: 'breadth'
      };

      const result = await engine.expandGraph(expansion);

      assert.strictEqual(result.visited_nodes.size, 0);
      assert.strictEqual(result.edges.length, 0);
      assert.strictEqual(result.expansion_depth, 0);
    });

    it('should handle non-existent start symbols', async () => {
      const expansion: GraphExpansion = {
        query: 'test query',
        start_symbols: ['nonexistent'],
        max_depth: 2,
        token_budget: 1000,
        edge_types: ['call'],
        expansion_strategy: 'breadth'
      };

      const result = await engine.expandGraph(expansion);

      assert.strictEqual(result.visited_nodes.size, 1); // Only the start symbol
      assert.strictEqual(result.edges.length, 0);
    });

    it('should track performance metrics', async () => {
      const expansion: GraphExpansion = {
        query: 'test query',
        start_symbols: ['func_a'],
        max_depth: 2,
        token_budget: 1000,
        edge_types: ['call'],
        expansion_strategy: 'breadth'
      };

      const result = await engine.expandGraph(expansion);

      assert.strictEqual(typeof result.performance_ms, 'number');
      assert(result.performance_ms >= 0);
    });

    it('should handle bidirectional traversal', async () => {
      const expansion: GraphExpansion = {
        query: 'test query',
        start_symbols: ['func_b'],
        max_depth: 1,
        token_budget: 1000,
        edge_types: ['call'],
        expansion_strategy: 'breadth'
      };

      const result = await engine.expandGraph(expansion);

      // Should find both outgoing (func_c) and incoming (func_a) connections
      assert(result.visited_nodes.has('func_a'));
      assert(result.visited_nodes.has('func_c'));
    });
  });

  describe('getPerformanceStats', () => {
    it('should return performance statistics', () => {
      const stats = engine.getPerformanceStats();
      
      assert.strictEqual(typeof stats.threshold_ms, 'number');
      assert(stats.threshold_ms > 0);
    });
  });

  describe('setPerformanceThreshold', () => {
    it('should update performance threshold', () => {
      engine.setPerformanceThreshold(200);
      const stats = engine.getPerformanceStats();
      assert.strictEqual(stats.threshold_ms, 200);
    });
  });
});

describe('Graph Storage Integration', () => {
  let storage: MockGraphStorage;

  beforeEach(() => {
    storage = new MockGraphStorage();
  });

  it('should handle edge storage and retrieval', async () => {
    const testEdge: GraphEdge = {
      sourceId: 'test_source',
      targetId: 'test_target',
      type: 'call',
      confidence: 0.8,
      metadata: { extractor: 'test', timestamp: Date.now() }
    };

    storage.addEdge(testEdge);

    const outgoing = await storage.getOutgoingEdges('test_source');
    assert.strictEqual(outgoing.length, 1);
    assert.deepStrictEqual(outgoing[0], testEdge);

    const incoming = await storage.getIncomingEdges('test_target');
    assert.strictEqual(incoming.length, 1);
    assert.deepStrictEqual(incoming[0], testEdge);
  });

  it('should filter edges by type', async () => {
    storage.addEdge({
      sourceId: 'multi_source',
      targetId: 'multi_target1',
      type: 'call',
      confidence: 0.8,
      metadata: { extractor: 'test', timestamp: Date.now() }
    });

    storage.addEdge({
      sourceId: 'multi_source',
      targetId: 'multi_target2',
      type: 'import',
      confidence: 0.9,
      metadata: { extractor: 'test', timestamp: Date.now() }
    });

    const callEdges = await storage.getOutgoingEdges('multi_source', ['call']);
    assert.strictEqual(callEdges.length, 1);
    assert.strictEqual(callEdges[0].type, 'call');

    const importEdges = await storage.getOutgoingEdges('multi_source', ['import']);
    assert.strictEqual(importEdges.length, 1);
    assert.strictEqual(importEdges[0].type, 'import');
  });

  it('should check node existence', async () => {
    assert(await storage.nodeExists('func_a'));
    assert(!await storage.nodeExists('nonexistent'));
  });

  it('should retrieve node metadata', async () => {
    const metadata = await storage.getNodeMetadata('func_a');
    assert(metadata);
    assert.strictEqual(metadata.name, 'function_a');
    assert.strictEqual(metadata.file, 'test.py');
    assert.strictEqual(metadata.line, 10);

    const emptyMetadata = await storage.getNodeMetadata('nonexistent');
    assert.strictEqual(emptyMetadata, undefined);
  });
});