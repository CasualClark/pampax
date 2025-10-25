/**
 * Integration test for graph edge extraction pipeline
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { GraphBuilder } from '../../dist/graph/graph-builder.js';
import { HeuristicExtractor } from '../../dist/graph/edge-extractors/heuristic-extractor.js';

describe('Graph Edge Extraction Integration', () => {
  let graphBuilder;

  beforeEach(() => {
    graphBuilder = new GraphBuilder();
  });

  it('should create graph builder with heuristic extractor', () => {
    const status = graphBuilder.getExtractorStatus();
    assert.ok(status.length > 0);
    
    const heuristicStatus = status.find(s => s.id === 'heuristic');
    assert(heuristicStatus);
    assert.strictEqual(heuristicStatus.supported, true);
    assert.strictEqual(heuristicStatus.confidence, 0.6);
  });

  it('should build graph incrementally with fallback', async () => {
    const spans = [
      {
        id: 'func1',
        repo: 'test-repo',
        path: 'test.py',
        byteStart: 4,
        byteEnd: 16,
        kind: 'function',
        name: 'function_one'
      },
      {
        id: 'func2',
        repo: 'test-repo',
        path: 'test.py',
        byteStart: 20,
        byteEnd: 35,
        kind: 'function',
        name: 'function_two'
      }
    ];

    const result = await graphBuilder.buildGraphIncremental(spans);
    
    assert.ok(['heuristic', 'complete'].includes(result.stage));
    assert.ok(Array.isArray(result.edges));
    assert.ok(typeof result.confidence === 'number');
  });

  it('should handle empty spans gracefully', async () => {
    const result = await graphBuilder.buildGraph([]);
    
    assert.strictEqual(result.edges.length, 0);
    assert.strictEqual(result.summary.totalEdges, 0);
    assert.ok(Array.isArray(result.results));
  });

  it('should add custom extractors', () => {
    const customExtractor = new HeuristicExtractor();
    graphBuilder.addExtractor(customExtractor);
    
    const extractor = graphBuilder.getExtractor('heuristic');
    assert(extractor);
    assert.strictEqual(extractor.getConfidence(), 0.6);
  });

  it('should provide comprehensive summary', async () => {
    const spans = [
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

    const result = await graphBuilder.buildGraph(spans, {
      extractors: ['heuristic']
    });

    const summary = result.summary;
    assert.ok(typeof summary.totalEdges === 'number');
    assert.ok(typeof summary.edgesByType === 'object');
    assert.ok(typeof summary.edgesByExtractor === 'object');
    assert.ok(typeof summary.averageConfidence === 'number');
    assert.ok(typeof summary.durationMs === 'number');
  });

  it('should respect confidence threshold', async () => {
    const spans = [
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

    const result = await graphBuilder.buildGraph(spans, {
      extractors: ['heuristic'],
      confidenceThreshold: 0.7 // Higher than heuristic confidence
    });

    // Should filter out heuristic edges (0.6 confidence)
    assert.strictEqual(result.edges.length, 0);
  });
});