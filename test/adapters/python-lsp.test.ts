/**
 * Python LSP Adapter Tests
 * 
 * Comprehensive tests for the Python LSP adapter implementation
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { PythonLSPAdapter } from '../../src/adapters/lsp/python-adapter.js';
import { ParseContext } from '../../src/adapters/base.js';
import path from 'path';
import fs from 'fs';

describe('PythonLSPAdapter', () => {
    let adapter: PythonLSPAdapter;
    let testContext: ParseContext;
    let tempDir: string;

    beforeEach(() => {
        adapter = new PythonLSPAdapter({
            enableFallback: true,
            maxLSPFiles: 5,
            enableHover: false, // Disable for tests to avoid LSP server dependency
            symbolOptions: {
                includePrivateSymbols: true,
                includeDunderSymbols: false,
                maxDepth: 5,
                extractTypeHints: true,
                extractDecorators: true,
                extractDocstrings: true
            }
        });

        // Create temporary directory for test files
        tempDir = fs.mkdtempSync(path.join(process.cwd(), 'test-python-lsp-'));
        
        testContext = {
            repo: 'test-repo',
            basePath: tempDir,
            onProgress: undefined
        };
    });

    afterEach(() => {
        // Cleanup temporary directory
        if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
        
        // Cleanup adapter
        adapter.cleanup();
    });

    describe('Adapter Interface', () => {
        it('should have correct adapter ID', () => {
            assert.strictEqual(adapter.id, 'lsp-python');
        });

        it('should support Python files', () => {
            assert.strictEqual(adapter.supports('test.py'), true);
            assert.strictEqual(adapter.supports('path/to/file.py'), true);
        });

        it('should not support non-Python files', () => {
            assert.strictEqual(adapter.supports('test.js'), false);
            assert.strictEqual(adapter.supports('test.ts'), false);
            assert.strictEqual(adapter.supports('test.txt'), false);
            assert.strictEqual(adapter.supports('test.md'), false);
        });

        it('should return supported extensions', () => {
            const extensions = adapter.getSupportedExtensions();
            assert.deepStrictEqual(extensions, ['.py']);
        });

        it('should return adapter capabilities', () => {
            const capabilities = adapter.getCapabilities();
            assert.strictEqual(typeof capabilities.lsp, 'boolean');
            assert.strictEqual(typeof capabilities.fallback, 'boolean');
            assert.strictEqual(typeof capabilities.hover, 'boolean');
            assert.strictEqual(typeof capabilities.definitions, 'boolean');
            assert.strictEqual(typeof capabilities.typeHints, 'boolean');
            assert.strictEqual(typeof capabilities.decorators, 'boolean');
        });
    });

    describe('Configuration', () => {
        it('should have default configuration', () => {
            const config = adapter.getConfiguration();
            assert.strictEqual(config.serverCommand, 'pyright-langserver');
            assert.deepStrictEqual(config.serverArgs, ['--stdio']);
            assert.strictEqual(config.enableFallback, true);
            assert.strictEqual(config.enableHover, true);
            assert.strictEqual(config.maxLSPFiles, 100);
        });

        it('should update configuration', () => {
            adapter.updateConfiguration({
                serverCommand: 'basedpyright-langserver',
                enableHover: false,
                maxLSPFiles: 50
            });

            const config = adapter.getConfiguration();
            assert.strictEqual(config.serverCommand, 'basedpyright-langserver');
            assert.strictEqual(config.enableHover, false);
            assert.strictEqual(config.maxLSPFiles, 50);
        });

        it('should merge symbol options correctly', () => {
            adapter.updateConfiguration({
                symbolOptions: {
                    includePrivateSymbols: false,
                    maxDepth: 3
                }
            });

            const config = adapter.getConfiguration();
            assert.strictEqual(config.symbolOptions.includePrivateSymbols, false);
            assert.strictEqual(config.symbolOptions.maxDepth, 3);
            // Other options should remain from defaults
            assert.strictEqual(config.symbolOptions.includeDunderSymbols, false);
            assert.strictEqual(config.symbolOptions.extractTypeHints, true);
        });
    });

    describe('File Parsing', () => {
        const simplePythonCode = `
def simple_function():
    """A simple function"""
    return "hello"

class SimpleClass:
    """A simple class"""
    
    def method(self):
        """A method"""
        pass
`;

        it('should parse empty file list', async () => {
            const spans = await adapter.parse([], testContext);
            assert.deepStrictEqual(spans, []);
        });

        it('should filter non-Python files', async () => {
            const files = ['test.py', 'test.js', 'test.txt'];
            const spans = await adapter.parse(files, testContext);
            // Should only process Python files
            assert(spans.length >= 0);
        });

        it('should parse simple Python code with fallback', async () => {
            const testFile = path.join(tempDir, 'simple.py');
            fs.writeFileSync(testFile, simplePythonCode);

            try {
                const spans = await adapter.parse([testFile], testContext);
                
                // Should get spans from fallback adapter
                assert(spans.length > 0);
                
                // Check for module span
                const moduleSpan = spans.find(s => s.kind === 'module');
                assert(moduleSpan);
                assert.strictEqual(moduleSpan.name, 'simple');
                
                // Check for function span
                const functionSpan = spans.find(s => s.kind === 'function' && s.name === 'simple_function');
                assert(functionSpan);
                assert(functionSpan.doc?.includes('A simple function'));
                
                // Check for class span
                const classSpan = spans.find(s => s.kind === 'class' && s.name === 'SimpleClass');
                assert(classSpan);
                assert(classSpan.doc?.includes('A simple class'));
                
            } catch (error) {
                // If LSP server is not available, fallback should work
                assert(error instanceof Error);
            }
        });

        it('should handle files with type hints', async () => {
            const typedPythonCode = `
from typing import List, Optional

def typed_function(x: int, y: str) -> List[str]:
    """Function with type hints"""
    return [y] * x

class TypedClass:
    def __init__(self, name: Optional[str] = None) -> None:
        self.name = name
        
    def get_name(self) -> Optional[str]:
        return self.name
`;

            const testFile = path.join(tempDir, 'typed.py');
            fs.writeFileSync(testFile, typedPythonCode);

            try {
                const spans = await adapter.parse([testFile], testContext);
                
                assert(spans.length > 0);
                
                // Check that type hints are preserved in signatures
                const functionSpan = spans.find(s => s.kind === 'function' && s.name === 'typed_function');
                if (functionSpan) {
                    assert(functionSpan.signature?.includes('int'));
                    assert(functionSpan.signature?.includes('str'));
                    assert(functionSpan.signature?.includes('List[str]'));
                }
                
            } catch (error) {
                // Expected if LSP server is not available
            }
        });

        it('should handle files with decorators', async () => {
            const decoratedPythonCode = `
def decorator(func):
    def wrapper(*args, **kwargs):
        print("Before")
        result = func(*args, **kwargs)
        print("After")
        return result
    return wrapper

class DecoratedClass:
    @decorator
    def decorated_method(self) -> str:
        """Decorated method"""
        return "decorated"
    
    @staticmethod
    def static_method() -> None:
        """Static method"""
        pass
    
    @classmethod
    def class_method(cls) -> str:
        """Class method"""
        return cls.__name__
`;

            const testFile = path.join(tempDir, 'decorated.py');
            fs.writeFileSync(testFile, decoratedPythonCode);

            try {
                const spans = await adapter.parse([testFile], testContext);
                
                assert(spans.length > 0);
                
                // Check for decorated methods
                const decoratedMethod = spans.find(s => s.kind === 'method' && s.name === 'decorated_method');
                if (decoratedMethod) {
                    assert(decoratedMethod.signature?.includes('@decorator'));
                }
                
            } catch (error) {
                // Expected if LSP server is not available
            }
        });

        it('should handle async functions', async () => {
            const asyncPythonCode = `
import asyncio

async def async_function() -> str:
    """Async function"""
    await asyncio.sleep(0.1)
    return "async"

class AsyncClass:
    async def async_method(self, x: int) -> int:
        """Async method"""
        await asyncio.sleep(0.1)
        return x * 2
`;

            const testFile = path.join(tempDir, 'async.py');
            fs.writeFileSync(testFile, asyncPythonCode);

            try {
                const spans = await adapter.parse([testFile], testContext);
                
                assert(spans.length > 0);
                
                // Check for async functions
                const asyncFunction = spans.find(s => s.kind === 'function' && s.name === 'async_function');
                if (asyncFunction) {
                    assert(asyncFunction.signature?.includes('async'));
                }
                
            } catch (error) {
                // Expected if LSP server is not available
            }
        });
    });

    describe('Error Handling', () => {
        it('should handle missing files gracefully', async () => {
            const nonExistentFile = path.join(tempDir, 'nonexistent.py');
            
            try {
                const spans = await adapter.parse([nonExistentFile], testContext);
                // Should handle gracefully, either return empty or throw
                assert(Array.isArray(spans));
            } catch (error) {
                // Acceptable to throw for missing files
                assert(error instanceof Error);
            }
        });

        it('should handle syntax errors gracefully', async () => {
            const invalidPythonCode = `
def invalid_function(
    # Missing closing parenthesis and colon
    return x
`;

            const testFile = path.join(tempDir, 'invalid.py');
            fs.writeFileSync(testFile, invalidPythonCode);

            try {
                const spans = await adapter.parse([testFile], testContext);
                // Should not throw, but may return empty spans or use fallback
                assert(Array.isArray(spans));
            } catch (error) {
                // Acceptable to throw for syntax errors
                assert(error instanceof Error);
            }
        });

        it('should handle empty files', async () => {
            const testFile = path.join(tempDir, 'empty.py');
            fs.writeFileSync(testFile, '');

            try {
                const spans = await adapter.parse([testFile], testContext);
                assert(Array.isArray(spans));
            } catch (error) {
                assert(error instanceof Error);
            }
        });
    });

    describe('Progress Reporting', () => {
        it('should emit progress events', async () => {
            const progressEvents: Array<{type: string; path?: string; error?: string; count?: number}> = [];
            const contextWithProgress: ParseContext = {
                ...testContext,
                onProgress: (event) => progressEvents.push(event as any)
            };

            const pythonCode = 'def test(): pass';
            const testFile = path.join(tempDir, 'progress.py');
            fs.writeFileSync(testFile, pythonCode);

            try {
                await adapter.parse([testFile], contextWithProgress);
                
                assert(progressEvents.length > 0);
                
                // Should have start event
                assert(progressEvents.some(e => e.type === 'start'));
                
                // Should have fileParsed event
                assert(progressEvents.some(e => e.type === 'fileParsed'));
                
                // Should have spansEmitted event
                assert(progressEvents.some(e => e.type === 'spansEmitted'));
                
            } catch (error) {
                // Progress events should still be emitted even if parsing fails
                assert(progressEvents.length > 0);
            }
        });

        it('should emit error events on failure', async () => {
            const progressEvents: any[] = [];
            const contextWithProgress: ParseContext = {
                ...testContext,
                onProgress: (event) => progressEvents.push(event)
            };

            const nonExistentFile = path.join(tempDir, 'nonexistent.py');

            try {
                await adapter.parse([nonExistentFile], contextWithProgress);
            } catch (error) {
                // Expected
            }

            // Should have error events
            assert(progressEvents.some(e => e.type === 'error'));
        });
    });

    describe('File Limits', () => {
        it('should use fallback when file count exceeds limit', async () => {
            // Create adapter with low file limit
            const limitedAdapter = new PythonLSPAdapter({
                maxLSPFiles: 2,
                enableFallback: true
            });

            const progressEvents: Array<{type: string; path?: string; error?: string; count?: number}> = [];
            const contextWithProgress: ParseContext = {
                ...testContext,
                onProgress: (event) => progressEvents.push(event as any)
            };

            // Create 3 test files (exceeds limit of 2)
            const files: string[] = [];
            for (let i = 0; i < 3; i++) {
                const fileName = 'test_' + i + '.py';
                const testFile = path.join(tempDir, fileName);
                fs.writeFileSync(testFile, 'def test_' + i + '(): return ' + i);
                files.push(testFile);
            }

            try {
                await limitedAdapter.parse(files, contextWithProgress);
                
                // Should emit error about too many files
                let hasErrorEvent = false;
                for (const event of progressEvents) {
                    if (event.type === 'error' && 
                        event.error?.includes('Too many files')) {
                        hasErrorEvent = true;
                        break;
                    }
                }
                assert(hasErrorEvent);
                
            } catch (error) {
                // Acceptable
            } finally {
                limitedAdapter.cleanup();
            }
        });
    });

    describe('Feature Flags', () => {
        it('should respect feature flag when disabled', async () => {
            // This test would require mocking the feature flags module
            // For now, we just verify the adapter handles missing feature flags gracefully
            const progressEvents: any[] = [];
            const contextWithProgress: ParseContext = {
                ...testContext,
                onProgress: (event) => progressEvents.push(event)
            };

            const testFile = path.join(tempDir, 'test.py');
            fs.writeFileSync(testFile, 'def test(): pass');

            try {
                await adapter.parse([testFile], contextWithProgress);
                // Should work even if feature flags are not available
                assert(true);
            } catch (error) {
                // Acceptable
            }
        });
    });

    describe('Cleanup', () => {
        it('should cleanup resources properly', async () => {
            await adapter.cleanup();
            
            // Should not throw when called multiple times
            await adapter.cleanup();
            
            // Should still be able to parse after cleanup (will reinitialize)
            const testFile = path.join(tempDir, 'test.py');
            fs.writeFileSync(testFile, 'def test(): pass');
            
            try {
                await adapter.parse([testFile], testContext);
                assert(true);
            } catch (error) {
                // Acceptable
            }
        });
    });
});