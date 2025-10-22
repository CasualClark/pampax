/**
 * Python Symbols Tests
 * 
 * Tests for Python-specific symbol extraction utilities
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import {
    positionToByteOffset,
    rangeToByteRange,
    extractPythonSpansFromLSP,
    getDefaultPythonSpanOptions,
    shouldIncludeSymbol,
    PythonSpanExtractionOptions,
    PythonSymbolInfo
} from '../../src/adapters/lsp/python-symbols.js';
import { LSPDocumentSymbol } from '../../src/adapters/lsp/lsp-client.js';

describe('Python Symbols', () => {
    const sampleSource = `def hello_world():
    """Say hello to the world"""
    print("Hello, World!")

class MyClass:
    """A simple class"""
    
    def __init__(self, name: str):
        self.name = name
    
    def get_name(self) -> str:
        """Get the name"""
        return self.name
`;

    describe('Position/Range Conversion', () => {
        it('should convert position to byte offset correctly', () => {
            const source = 'line1\nline2\nline3';
            
            // Test various positions
            assert.strictEqual(positionToByteOffset(source, { line: 0, character: 0 }), 0);
            assert.strictEqual(positionToByteOffset(source, { line: 0, character: 3 }), 3);
            assert.strictEqual(positionToByteOffset(source, { line: 1, character: 0 }), 6); // After "line1\n"
            assert.strictEqual(positionToByteOffset(source, { line: 1, character: 2 }), 8);
            assert.strictEqual(positionToByteOffset(source, { line: 2, character: 0 }), 12); // After "line1\nline2\n"
        });

        it('should handle out-of-bounds positions gracefully', () => {
            const source = 'short';
            
            // Position beyond line length
            assert.strictEqual(positionToByteOffset(source, { line: 0, character: 10 }), 6);
            
            // Position beyond file
            assert.strictEqual(positionToByteOffset(source, { line: 10, character: 0 }), 6);
        });

        it('should convert range to byte range correctly', () => {
            const source = 'line1\nline2\nline3';
            const range = {
                start: { line: 0, character: 2 },
                end: { line: 1, character: 2 }
            };
            
            const byteRange = rangeToByteRange(source, range);
            assert.strictEqual(byteRange.byteStart, 2);
            assert.strictEqual(byteRange.byteEnd, 8);
        });
    });

    describe('Symbol Filtering', () => {
        const defaultOptions = getDefaultPythonSpanOptions();

        it('should include public symbols by default', () => {
            const publicSymbol: PythonSymbolInfo = {
                name: 'public_function',
                kind: 'function',
                isAsync: false,
                isStatic: false,
                isProperty: false,
                isClassMethod: false,
                isPrivate: false,
                isDunder: false,
                parents: [],
                children: [],
                range: { start: { line: 0, character: 0 }, end: { line: 1, character: 0 } },
                selectionRange: { start: { line: 0, character: 0 }, end: { line: 0, character: 10 } }
            };

            assert.strictEqual(shouldIncludeSymbol(publicSymbol, defaultOptions), true);
        });

        it('should exclude private symbols when disabled', () => {
            const options = { ...defaultOptions, includePrivateSymbols: false };
            const privateSymbol: PythonSymbolInfo = {
                name: '_private_function',
                kind: 'function',
                isAsync: false,
                isStatic: false,
                isProperty: false,
                isClassMethod: false,
                isPrivate: true,
                isDunder: false,
                parents: [],
                children: [],
                range: { start: { line: 0, character: 0 }, end: { line: 1, character: 0 } },
                selectionRange: { start: { line: 0, character: 0 }, end: { line: 0, character: 10 } }
            };

            assert.strictEqual(shouldIncludeSymbol(privateSymbol, options), false);
        });

        it('should include private symbols when enabled', () => {
            const options = { ...defaultOptions, includePrivateSymbols: true };
            const privateSymbol: PythonSymbolInfo = {
                name: '_private_function',
                kind: 'function',
                isAsync: false,
                isStatic: false,
                isProperty: false,
                isClassMethod: false,
                isPrivate: true,
                isDunder: false,
                parents: [],
                children: [],
                range: { start: { line: 0, character: 0 }, end: { line: 1, character: 0 } },
                selectionRange: { start: { line: 0, character: 0 }, end: { line: 0, character: 10 } }
            };

            assert.strictEqual(shouldIncludeSymbol(privateSymbol, options), true);
        });

        it('should exclude dunder symbols when disabled', () => {
            const options = { ...defaultOptions, includeDunderSymbols: false };
            const dunderSymbol: PythonSymbolInfo = {
                name: '__init__',
                kind: 'method',
                isAsync: false,
                isStatic: false,
                isProperty: false,
                isClassMethod: false,
                isPrivate: false,
                isDunder: true,
                parents: [],
                children: [],
                range: { start: { line: 0, character: 0 }, end: { line: 1, character: 0 } },
                selectionRange: { start: { line: 0, character: 0 }, end: { line: 0, character: 10 } }
            };

            assert.strictEqual(shouldIncludeSymbol(dunderSymbol, options), false);
        });

        it('should include dunder symbols when enabled', () => {
            const options = { ...defaultOptions, includeDunderSymbols: true };
            const dunderSymbol: PythonSymbolInfo = {
                name: '__init__',
                kind: 'method',
                isAsync: false,
                isStatic: false,
                isProperty: false,
                isClassMethod: false,
                isPrivate: false,
                isDunder: true,
                parents: [],
                children: [],
                range: { start: { line: 0, character: 0 }, end: { line: 1, character: 0 } },
                selectionRange: { start: { line: 0, character: 0 }, end: { line: 0, character: 10 } }
            };

            assert.strictEqual(shouldIncludeSymbol(dunderSymbol, options), true);
        });
    });

    describe('Span Extraction', () => {
        it('should extract spans from simple LSP symbols', () => {
            const lspSymbols: LSPDocumentSymbol[] = [
                {
                    name: 'test_function',
                    kind: 12, // Function
                    range: {
                        start: { line: 0, character: 0 },
                        end: { line: 2, character: 0 }
                    },
                    selectionRange: {
                        start: { line: 0, character: 4 },
                        end: { line: 0, character: 16 }
                    }
                }
            ];

            const spans = extractPythonSpansFromLSP(
                lspSymbols,
                'test-repo',
                'test.py',
                sampleSource,
                getDefaultPythonSpanOptions()
            );

            assert.strictEqual(spans.length, 2); // Function + module
            
            const functionSpan = spans.find(s => s.name === 'test_function');
            assert(functionSpan);
            assert.strictEqual(functionSpan.kind, 'function');
            assert.strictEqual(functionSpan.repo, 'test-repo');
            assert.strictEqual(functionSpan.path, 'test.py');
            
            const moduleSpan = spans.find(s => s.kind === 'module');
            assert(moduleSpan);
            assert.strictEqual(moduleSpan.name, 'test');
        });

        it('should handle hierarchical symbols', () => {
            const lspSymbols: LSPDocumentSymbol[] = [
                {
                    name: 'TestClass',
                    kind: 5, // Class
                    range: {
                        start: { line: 0, character: 0 },
                        end: { line: 6, character: 0 }
                    },
                    selectionRange: {
                        start: { line: 0, character: 6 },
                        end: { line: 0, character: 14 }
                    },
                    children: [
                        {
                            name: 'method',
                            kind: 6, // Method
                            range: {
                                start: { line: 2, character: 4 },
                                end: { line: 4, character: 0 }
                            },
                            selectionRange: {
                                start: { line: 2, character: 8 },
                                end: { line: 2, character: 14 }
                            }
                        }
                    ]
                }
            ];

            const spans = extractPythonSpansFromLSP(
                lspSymbols,
                'test-repo',
                'test.py',
                sampleSource,
                getDefaultPythonSpanOptions()
            );

            assert.strictEqual(spans.length, 3); // Class + method + module
            
            const classSpan = spans.find(s => s.name === 'TestClass');
            assert(classSpan);
            assert.strictEqual(classSpan.kind, 'class');
            
            const methodSpan = spans.find(s => s.name === 'method');
            assert(methodSpan);
            assert.strictEqual(methodSpan.kind, 'method');
            assert.deepStrictEqual(methodSpan.parents, ['TestClass']);
        });

        it('should respect symbol filtering options', () => {
            const lspSymbols: LSPDocumentSymbol[] = [
                {
                    name: 'public_function',
                    kind: 12, // Function
                    range: {
                        start: { line: 0, character: 0 },
                        end: { line: 1, character: 0 }
                    },
                    selectionRange: {
                        start: { line: 0, character: 4 },
                        end: { line: 0, character: 18 }
                    }
                },
                {
                    name: '_private_function',
                    kind: 12, // Function
                    range: {
                        start: { line: 2, character: 0 },
                        end: { line: 3, character: 0 }
                    },
                    selectionRange: {
                        start: { line: 2, character: 4 },
                        end: { line: 2, character: 20 }
                    }
                }
            ];

            const options: PythonSpanExtractionOptions = {
                ...getDefaultPythonSpanOptions(),
                includePrivateSymbols: false
            };

            const spans = extractPythonSpansFromLSP(
                lspSymbols,
                'test-repo',
                'test.py',
                sampleSource,
                options
            );

            // Should only include public function + module
            assert.strictEqual(spans.length, 2);
            assert(spans.some(s => s.name === 'public_function'));
            assert(!spans.some(s => s.name === '_private_function'));
        });

        it('should handle empty symbol list', () => {
            const spans = extractPythonSpansFromLSP(
                [],
                'test-repo',
                'test.py',
                sampleSource,
                getDefaultPythonSpanOptions()
            );

            // Should only include module span
            assert.strictEqual(spans.length, 1);
            assert.strictEqual(spans[0].kind, 'module');
            assert.strictEqual(spans[0].name, 'test');
        });
    });

    describe('Default Options', () => {
        it('should provide sensible defaults', () => {
            const options = getDefaultPythonSpanOptions();
            
            assert.strictEqual(options.includePrivateSymbols, false);
            assert.strictEqual(options.includeDunderSymbols, false);
            assert.strictEqual(options.maxDepth, 10);
            assert.strictEqual(options.extractTypeHints, true);
            assert.strictEqual(options.extractDecorators, true);
            assert.strictEqual(options.extractDocstrings, true);
        });
    });
});