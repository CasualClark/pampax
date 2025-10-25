/**
 * Tests for LSP Edge Extractor
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { LSPExtractor } from './lsp-extractor.js';
import { LSPClient, LSPDocumentSymbol } from '../../../adapters/lsp/lsp-client.js';
import { Span } from '../../../types/core.js';

// Mock LSP Client
vi.mock('../../../adapters/lsp/lsp-client.js', () => ({
  LSPClient: vi.fn().mockImplementation(() => ({
    ready: true,
    openDocument: vi.fn(),
    getDocumentSymbols: vi.fn(),
    getDefinition: vi.fn(),
    getReferences: vi.fn(),
    shutdown: vi.fn()
  }))
}));

describe('LSPExtractor', () => {
  let extractor: LSPExtractor;
  let mockLspClient: any;

  beforeEach(() => {
    mockLspClient = new (vi.importMock('../../../adapters/lsp/lsp-client.js')).LSPClient();
    extractor = new LSPExtractor(mockLspClient);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('extractEdges', () => {
    it('should extract call edges from function definitions and references', async () => {
      const spans: Span[] = [
        {
          id: 'func1',
          repo: 'test-repo',
          path: 'file1.py',
          byteStart: 10,
          byteEnd: 50,
          kind: 'function',
          name: 'function_one',
          signature: 'def function_one()',
          references: [
            { path: 'file2.py', byteStart: 20, byteEnd: 32, kind: 'call' }
          ]
        },
        {
          id: 'func2',
          repo: 'test-repo',
          path: 'file2.py',
          byteStart: 15,
          byteEnd: 40,
          kind: 'function',
          name: 'function_two',
          signature: 'def function_two()'
        }
      ];

      // Mock LSP responses
      mockLspClient.getDocumentSymbols.mockResolvedValue([
        {
          name: 'function_one',
          kind: 12, // Function kind
          range: { start: { line: 1, character: 0 }, end: { line: 3, character: 0 } },
          selectionRange: { start: { line: 1, character: 4 }, end: { line: 1, character: 16 } }
        }
      ]);

      mockLspClient.getDefinition.mockResolvedValue([
        {
          uri: 'file:///test-repo/file1.py',
          range: { start: { line: 1, character: 4 }, end: { line: 1, character: 16 } }
        }
      ]);

      mockLspClient.getReferences.mockResolvedValue([
        {
          uri: 'file:///test-repo/file2.py',
          range: { start: { line: 2, character: 2 }, end: { line: 2, character: 14 } }
        }
      ]);

      const edges = await extractor.extractEdges(spans);

      expect(edges).toHaveLength(1);
      expect(edges[0]).toMatchObject({
        sourceId: 'func1',
        targetId: expect.any(String),
        type: 'call',
        confidence: 0.8,
        metadata: expect.objectContaining({
          extractor: 'lsp',
          lspMethod: 'references'
        })
      });
    });

    it('should extract import edges from module references', async () => {
      const spans: Span[] = [
        {
          id: 'module1',
          repo: 'test-repo',
          path: 'file1.py',
          byteStart: 0,
          byteEnd: 100,
          kind: 'module',
          name: 'module_one'
        },
        {
          id: 'import1',
          repo: 'test-repo',
          path: 'file2.py',
          byteStart: 5,
          byteEnd: 25,
          kind: 'module',
          name: 'import module_one'
        }
      ];

      mockLspClient.getDocumentSymbols.mockResolvedValue([
        {
          name: 'module_one',
          kind: 2, // Module kind
          range: { start: { line: 0, character: 0 }, end: { line: 10, character: 0 } },
          selectionRange: { start: { line: 0, character: 0 }, end: { line: 0, character: 11 } }
        }
      ]);

      const edges = await extractor.extractEdges(spans);

      expect(edges.some(edge => edge.type === 'import')).toBe(true);
    });

    it('should handle LSP client not ready gracefully', async () => {
      mockLspClient.ready = false;
      
      const spans: Span[] = [
        {
          id: 'func1',
          repo: 'test-repo',
          path: 'file1.py',
          byteStart: 10,
          byteEnd: 50,
          kind: 'function',
          name: 'function_one'
        }
      ];

      const edges = await extractor.extractEdges(spans);

      expect(edges).toHaveLength(0);
    });

    it('should handle LSP errors gracefully', async () => {
      const spans: Span[] = [
        {
          id: 'func1',
          repo: 'test-repo',
          path: 'file1.py',
          byteStart: 10,
          byteEnd: 50,
          kind: 'function',
          name: 'function_one'
        }
      ];

      mockLspClient.getDocumentSymbols.mockRejectedValue(new Error('LSP Error'));

      const edges = await extractor.extractEdges(spans);

      expect(edges).toHaveLength(0);
    });

    it('should respect performance timeout', async () => {
      const spans: Span[] = Array.from({ length: 100 }, (_, i) => ({
        id: `func${i}`,
        repo: 'test-repo',
        path: `file${i}.py`,
        byteStart: i * 10,
        byteEnd: i * 10 + 20,
        kind: 'function' as const,
        name: `function_${i}`
      }));

      // Mock slow LSP responses
      mockLspClient.getDocumentSymbols.mockImplementation(() => 
        new Promise(resolve => setTimeout(resolve, 100))
      );

      const startTime = Date.now();
      const edges = await extractor.extractEdges(spans, { timeoutMs: 50 });
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(100); // Should timeout before LSP responses complete
      expect(edges).toHaveLength(0);
    });
  });

  describe('getConfidence', () => {
    it('should return 0.8 confidence for LSP extractor', () => {
      expect(extractor.getConfidence()).toBe(0.8);
    });
  });

  describe('isSupported', () => {
    it('should return true when LSP client is ready', () => {
      mockLspClient.ready = true;
      expect(extractor.isSupported()).toBe(true);
    });

    it('should return false when LSP client is not ready', () => {
      mockLspClient.ready = false;
      expect(extractor.isSupported()).toBe(false);
    });
  });
});