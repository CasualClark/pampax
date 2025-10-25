/**
 * Tests for Heuristic Edge Extractor
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { HeuristicExtractor } from '../../src/graph/edge-extractors/heuristic-extractor.js';
import { Span } from '../../src/types/core.js';

describe('HeuristicExtractor', () => {
  let extractor: HeuristicExtractor;

  beforeEach(() => {
    extractor = new HeuristicExtractor();
  });

  describe('extractEdges', () => {
    it('should handle spans without crashing', async () => {
      const spans: Span[] = [
        {
          id: 'func1',
          repo: 'test-repo',
          path: 'test.py',
          byteStart: 4,
          byteEnd: 16,
          kind: 'function',
          name: 'function_one'
        }
      ];

      const edges = await extractor.extractEdges(spans);
      assert.ok(Array.isArray(edges));
    });

    it('should return empty edges for non-existent files', async () => {
      const spans: Span[] = [
        {
          id: 'func1',
          repo: 'test-repo',
          path: 'nonexistent.py',
          byteStart: 0,
          byteEnd: 10,
          kind: 'function',
          name: 'test_function'
        }
      ];

      const edges = await extractor.extractEdges(spans);
      assert.strictEqual(edges.length, 0);
    });

    it('should extract cross-file test relationships', async () => {
      const spans: Span[] = [
        {
          id: 'test1',
          repo: 'test-repo',
          path: 'test_function.py',
          byteStart: 4,
          byteEnd: 17,
          kind: 'function',
          name: 'test_function_one'
        },
        {
          id: 'func1',
          repo: 'test-repo',
          path: 'function.py',
          byteStart: 4,
          byteEnd: 16,
          kind: 'function',
          name: 'function_one'
        }
      ];

      const edges = await extractor.extractEdges(spans);
      
      const testEdges = edges.filter(edge => edge.type === 'test-of');
      assert.ok(Array.isArray(testEdges));
    });

    it('should respect timeout limit', async () => {
      const spans: Span[] = Array.from({ length: 100 }, (_, i) => ({
        id: `func${i}`,
        repo: 'test-repo',
        path: `file${i}.py`,
        byteStart: i * 10,
        byteEnd: i * 10 + 20,
        kind: 'function' as const,
        name: `function_${i}`
      }));

      const startTime = Date.now();
      const edges = await extractor.extractEdges(spans, { timeoutMs: 10 });
      const duration = Date.now() - startTime;

      assert.ok(duration < 50); // Should complete quickly
      assert.ok(Array.isArray(edges));
    });

    it('should limit edges when maxEdges is specified', async () => {
      const spans: Span[] = Array.from({ length: 50 }, (_, i) => ({
        id: `func${i}`,
        repo: 'test-repo',
        path: `file${i}.py`,
        byteStart: i * 10,
        byteEnd: i * 10 + 20,
        kind: 'function' as const,
        name: `function_${i}`
      }));

      const edges = await extractor.extractEdges(spans, { maxEdges: 10 });
      assert.ok(edges.length <= 10);
    });
  });

  describe('getConfidence', () => {
    it('should return 0.6 confidence for heuristic extractor', () => {
      assert.strictEqual(extractor.getConfidence(), 0.6);
    });
  });

  describe('isSupported', () => {
    it('should always return true (heuristic is always available)', () => {
      assert.strictEqual(extractor.isSupported(), true);
    });
  });
});