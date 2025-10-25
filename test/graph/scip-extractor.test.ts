/**
 * Tests for SCIP Edge Extractor
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { SCIPExtractor } from '../../src/graph/edge-extractors/scip-extractor.js';
import { Span } from '../../src/types/core.js';
import { spawn } from 'child_process';

describe('SCIPExtractor', () => {
  let extractor: SCIPExtractor;
  const testProjectRoot = '/tmp/test-project';

  beforeEach(() => {
    extractor = new SCIPExtractor(testProjectRoot);
  });

  afterEach(async () => {
    await extractor.cleanup();
  });

  describe('extractEdges', () => {
    it('should return empty edges when SCIP is not supported', async () => {
      // Mock fs.accessSync to throw error (SCIP not available)
      const originalAccessSync = require('fs').accessSync;
      require('fs').accessSync = () => {
        throw new Error('Command not found');
      };

      const spans: Span[] = [
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

      const edges = await extractor.extractEdges(spans);
      assert.strictEqual(edges.length, 0);

      // Restore original function
      require('fs').accessSync = originalAccessSync;
    });

    it('should handle SCIP process timeout', async () => {
      // Mock spawn to create a process that never responds
      const originalSpawn = require('child_process').spawn;
      require('child_process').spawn = () => {
        const mockProcess = {
          stdout: { on: () => {} },
          stderr: { on: () => {} },
          on: (event: string, callback: Function) => {
            if (event === 'error') {
              setTimeout(() => callback(new Error('Process error')), 10);
            }
          },
          kill: () => {}
        };
        return mockProcess;
      };

      const spans: Span[] = [
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

      const edges = await extractor.extractEdges(spans, { timeoutMs: 50 });
      assert.strictEqual(edges.length, 0);

      // Restore original function
      require('child_process').spawn = originalSpawn;
    });

    it('should parse SCIP output correctly when available', async () => {
      // Mock successful SCIP process
      const originalSpawn = require('child_process').spawn;
      require('child_process').spawn = (command: string, args: string[]) => {
        const mockProcess = {
          stdout: { 
            on: (event: string, callback: Function) => {
              if (event === 'data') {
                // Mock SCIP JSON output
                const scipOutput = JSON.stringify({
                  documents: [
                    {
                      uri: 'file:///test.py',
                      language: 'python',
                      text: 'def test_function(): pass',
                      symbols: [
                        {
                          name: 'test_function',
                          kind: 12, // Function
                          relationships: [
                            {
                              symbol: 'other_function',
                              kind: 0, // Reference
                              is_implementation: false,
                              source_symbol: 'test_function'
                            }
                          ]
                        }
                      ],
                      occurrences: [
                        {
                          range: {
                            start: { line: 0, character: 4 },
                            end: { line: 0, character: 16 }
                          },
                          symbol: 'test_function',
                          symbol_roles: [1] // Definition
                        }
                      ]
                    }
                  ]
                });
                callback(Buffer.from(scipOutput));
              }
            }
          },
          stderr: { on: () => {} },
          on: (event: string, callback: Function) => {
            if (event === 'close') {
              callback(0); // Exit code 0 (success)
            }
          },
          kill: () => {}
        };
        return mockProcess;
      };

      const spans: Span[] = [
        {
          id: 'test-span',
          repo: 'test-repo',
          path: 'test.py',
          byteStart: 4,
          byteEnd: 16,
          kind: 'function',
          name: 'test_function'
        },
        {
          id: 'other-span',
          repo: 'test-repo',
          path: 'test.py',
          byteStart: 20,
          byteEnd: 35,
          kind: 'function',
          name: 'other_function'
        }
      ];

      const edges = await extractor.extractEdges(spans);
      assert.ok(edges.length > 0);
      assert.strictEqual(edges[0].type, 'call');
      assert.strictEqual(edges[0].confidence, 1.0); // SCIP confidence

      // Restore original function
      require('child_process').spawn = originalSpawn;
    });
  });

  describe('getConfidence', () => {
    it('should return 1.0 confidence for SCIP extractor', () => {
      assert.strictEqual(extractor.getConfidence(), 1.0);
    });
  });

  describe('isSupported', () => {
    it('should return false when SCIP command is not available', () => {
      // Mock fs.accessSync to throw error
      const originalAccessSync = require('fs').accessSync;
      require('fs').accessSync = () => {
        throw new Error('Command not found');
      };

      assert.strictEqual(extractor.isSupported(), false);

      // Restore original function
      require('fs').accessSync = originalAccessSync;
    });

    it('should return true when SCIP command is available', () => {
      // Mock fs.accessSync to succeed
      const originalAccessSync = require('fs').accessSync;
      require('fs').accessSync = () => {}; // No error = success

      assert.strictEqual(extractor.isSupported(), true);

      // Restore original function
      require('fs').accessSync = originalAccessSync;
    });
  });
});