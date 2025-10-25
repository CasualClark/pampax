/**
 * Tests for Graph Builder
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { GraphBuilder } from '../../dist/graph/graph-builder.js';

// Mock extractors for testing
class MockExtractor {
  constructor(id, confidence, supported, edgesToReturn = []) {
    this.id = id;
    this.confidence = confidence;
    this.supported = supported;
    this.edgesToReturn = edgesToReturn;
  }

  async extractEdges(spans) {
    return this.edgesToReturn;
  }

  getConfidence() {
    return this.confidence;
  }

  isSupported() {
    return this.supported;
  }
}

describe('GraphBuilder', () => {
  let graphBuilder;

  beforeEach(() => {
    graphBuilder = new GraphBuilder();
  });

  describe('buildGraph', () => {
    it('should build graph with default extractors', async () => {
      const spans = [
        {
          id: 'test-span',
          repo: 'test-repo',
          path: 'test.py',
          byteStart: 0,
          byteEnd: 10,
          kind: 'function',
          name: 'test_function'
        }
      ];

      // Add mock extractor
      const mockExtractor = new MockExtractor('mock', 0.8, true, [
        {
          sourceId: 'test-span',
          targetId: 'target-span',
          type: 'call',
          confidence: 0.8,
          metadata: {
            extractor: 'mock',
            timestamp: Date.now()
          }
        }
      ]);
      
      graphBuilder.addExtractor(mockExtractor);

      const result = await graphBuilder.buildGraph(spans, {
        extractors: ['mock']
      });

      assert.strictEqual(result.edges.length, 1);
      assert.strictEqual(result.edges[0].type, 'call');
      assert.strictEqual(result.results.length, 1);
      assert.strictEqual(result.summary.totalEdges, 1);
    });

    it('should filter edges by confidence threshold', async () => {
      const spans = [
        {
          id: 'test-span',
          repo: 'test-repo',
          path: 'test.py',
          byteStart: 0,
          byteEnd: 10,
          kind: 'function',
          name: 'test_function'
        }
      ];

      const mockExtractor = new MockExtractor('mock', 0.3, true, [
        {
          sourceId: 'test-span',
          targetId: 'target-span',
          type: 'call',
          confidence: 0.3,
          metadata: {
            extractor: 'mock',
            timestamp: Date.now()
          }
        }
      ]);
      
      graphBuilder.addExtractor(mockExtractor);

      const result = await graphBuilder.buildGraph(spans, {
        extractors: ['mock'],
        confidenceThreshold: 0.5
      });

      assert.strictEqual(result.edges.length, 0);
      assert.strictEqual(result.summary.totalEdges, 0);
    });

    it('should deduplicate edges', async () => {
      const spans = [
        {
          id: 'test-span',
          repo: 'test-repo',
          path: 'test.py',
          byteStart: 0,
          byteEnd: 10,
          kind: 'function',
          name: 'test_function'
        }
      ];

      const mockExtractor = new MockExtractor('mock', 0.8, true, [
        {
          sourceId: 'test-span',
          targetId: 'target-span',
          type: 'call',
          confidence: 0.8,
          metadata: {
            extractor: 'mock',
            timestamp: Date.now()
          }
        },
        {
          sourceId: 'test-span',
          targetId: 'target-span',
          type: 'call',
          confidence: 0.6,
          metadata: {
            extractor: 'mock',
            timestamp: Date.now()
          }
        }
      ]);
      
      graphBuilder.addExtractor(mockExtractor);

      const result = await graphBuilder.buildGraph(spans, {
        extractors: ['mock']
      });

      assert.strictEqual(result.edges.length, 1);
      assert.strictEqual(result.edges[0].confidence, 0.8); // Higher confidence kept
    });

    it('should handle extractor errors gracefully', async () => {
      const spans = [
        {
          id: 'test-span',
          repo: 'test-repo',
          path: 'test.py',
          byteStart: 0,
          byteEnd: 10,
          kind: 'function',
          name: 'test_function'
        }
      ];

      class FailingExtractor {
        get id() { return 'failing'; }
        
        async extractEdges() {
          throw new Error('Extraction failed');
        }

        getConfidence() {
          return 0.8;
        }

        isSupported() {
          return true;
        }
      }

      const failingExtractor = new FailingExtractor();
      graphBuilder.addExtractor(failingExtractor);

      const result = await graphBuilder.buildGraph(spans, {
        extractors: ['failing']
      });

      assert.strictEqual(result.edges.length, 0);
      assert.strictEqual(result.results.length, 1);
      assert(result.results[0].error);
    });
  });

  describe('buildGraphIncremental', () => {
    it('should return LSP stage when LSP extractor succeeds', async () => {
      const spans = [
        {
          id: 'test-span',
          repo: 'test-repo',
          path: 'test.py',
          byteStart: 0,
          byteEnd: 10,
          kind: 'function',
          name: 'test_function'
        }
      ];

      const lspExtractor = new MockExtractor('lsp', 0.8, true, [
        {
          sourceId: 'test-span',
          targetId: 'target-span',
          type: 'call',
          confidence: 0.8,
          metadata: {
            extractor: 'lsp',
            timestamp: Date.now()
          }
        }
      ]);
      
      graphBuilder.addExtractor(lspExtractor);

      const result = await graphBuilder.buildGraphIncremental(spans);

      assert.strictEqual(result.stage, 'lsp');
      assert.strictEqual(result.edges.length, 1);
      assert.strictEqual(result.confidence, 0.8);
    });

    it('should fallback to heuristic when other extractors fail', async () => {
      const spans = [
        {
          id: 'test-span',
          repo: 'test-repo',
          path: 'test.py',
          byteStart: 0,
          byteEnd: 10,
          kind: 'function',
          name: 'test_function'
        }
      ];

      const heuristicExtractor = new MockExtractor('heuristic', 0.6, true, [
        {
          sourceId: 'test-span',
          targetId: 'target-span',
          type: 'call',
          confidence: 0.6,
          metadata: {
            extractor: 'heuristic',
            timestamp: Date.now()
          }
        }
      ]);
      
      graphBuilder.addExtractor(heuristicExtractor);

      const result = await graphBuilder.buildGraphIncremental(spans, {
        extractors: ['heuristic']
      });

      assert.strictEqual(result.stage, 'heuristic');
      assert.strictEqual(result.edges.length, 1);
      assert.strictEqual(result.confidence, 0.6);
    });
  });

  describe('extractor management', () => {
    it('should add and remove extractors', () => {
      const mockExtractor = new MockExtractor('test', 0.8, true);
      
      graphBuilder.addExtractor(mockExtractor);
      assert.strictEqual(graphBuilder.getExtractor('test'), mockExtractor);
      
      const removed = graphBuilder.removeExtractor('test');
      assert.strictEqual(removed, true);
      assert.strictEqual(graphBuilder.getExtractor('test'), undefined);
    });

    it('should get extractor status', () => {
      const mockExtractor = new MockExtractor('test', 0.8, true);
      graphBuilder.addExtractor(mockExtractor);
      
      const status = graphBuilder.getExtractorStatus();
      const testStatus = status.find(s => s.id === 'test');
      
      assert(testStatus);
      assert.strictEqual(testStatus.supported, true);
      assert.strictEqual(testStatus.confidence, 0.8);
    });
  });
});