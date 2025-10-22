/**
 * Tree-sitter Adapter Tests
 * 
 * Comprehensive tests for the Tree-sitter adapter implementation
 */

import { describe, it, beforeEach, before } from 'node:test';
import assert from 'node:assert';
import { TreeSitterAdapter } from '../../src/adapters/treesitter/treesitter-adapter.js';
import { ParseContext } from '../../src/adapters/base.js';
import { initializeParsers } from '../../src/adapters/treesitter/parser.js';
import path from 'path';
import fs from 'fs';

describe('TreeSitterAdapter', () => {
    let adapter: TreeSitterAdapter;
    let testContext: ParseContext;

    beforeAll(async () => {
        // Initialize parsers for testing
        await initializeParsers();
    });

    beforeEach(() => {
        adapter = new TreeSitterAdapter();
        testContext = {
            repo: 'test-repo',
            basePath: path.resolve('./test/fixtures'),
            onProgress: undefined
        };
    });

    describe('Adapter Interface', () => {
        it('should have correct adapter ID', () => {
            expect(adapter.id).toBe('treesitter');
        });

        it('should support Python files', () => {
            expect(adapter.supports('test.py')).toBe(true);
            expect(adapter.supports('path/to/file.py')).toBe(true);
        });

        it('should support JavaScript files', () => {
            expect(adapter.supports('test.js')).toBe(true);
            expect(adapter.supports('path/to/file.js')).toBe(true);
        });

        it('should support TypeScript files', () => {
            expect(adapter.supports('test.ts')).toBe(true);
            expect(adapter.supports('path/to/file.ts')).toBe(true);
            expect(adapter.supports('test.tsx')).toBe(true);
        });

        it('should support Dart files', () => {
            expect(adapter.supports('test.dart')).toBe(true);
            expect(adapter.supports('path/to/file.dart')).toBe(true);
        });

        it('should not support unsupported files', () => {
            expect(adapter.supports('test.txt')).toBe(false);
            expect(adapter.supports('test.md')).toBe(false);
            expect(adapter.supports('test.unknown')).toBe(false);
        });
    });

    describe('Python Parsing', () => {
        const pythonCode = `
"""
Example module with classes and functions
"""

class MyClass:
    """A simple class"""
    
    def __init__(self, name: str):
        self.name = name
    
    def get_name(self) -> str:
        """Get the name"""
        return self.name
    
    @staticmethod
    def static_method():
        """Static method"""
        pass

def standalone_function(x: int, y: int) -> int:
    """A standalone function"""
    return x + y

async def async_function():
    """Async function"""
    await some_operation()
`;

        it('should extract Python spans correctly', async () => {
            const tempFile = path.join(testContext.basePath, 'temp_test.py');
            fs.writeFileSync(tempFile, pythonCode);

            try {
                const spans = await adapter.parse([tempFile], testContext);
                
                expect(spans.length).toBeGreaterThan(0);
                
                // Check for class
                const classSpan = spans.find(s => s.kind === 'class' && s.name === 'MyClass');
                expect(classSpan).toBeDefined();
                expect(classSpan?.doc).toContain('A simple class');
                
                // Check for methods
                const methodSpans = spans.filter(s => s.kind === 'method');
                expect(methodSpans.length).toBeGreaterThan(0);
                
                const initMethod = methodSpans.find(s => s.name === '__init__');
                expect(initMethod).toBeDefined();
                
                const getNameMethod = methodSpans.find(s => s.name === 'get_name');
                expect(getNameMethod).toBeDefined();
                expect(getNameMethod?.doc).toContain('Get the name');
                
                // Check for functions
                const functionSpans = spans.filter(s => s.kind === 'function');
                expect(functionSpans.length).toBeGreaterThan(0);
                
                const standaloneFunc = functionSpans.find(s => s.name === 'standalone_function');
                expect(standaloneFunc).toBeDefined();
                expect(standaloneFunc?.doc).toContain('A standalone function');
                
                const asyncFunc = functionSpans.find(s => s.name === 'async_function');
                expect(asyncFunc).toBeDefined();
                expect(asyncFunc?.doc).toContain('Async function');
                
            } finally {
                fs.unlinkSync(tempFile);
            }
        });

        it('should handle Python parent-child relationships', async () => {
            const tempFile = path.join(testContext.basePath, 'temp_test.py');
            fs.writeFileSync(tempFile, pythonCode);

            try {
                const spans = await adapter.parse([tempFile], testContext);
                
                // Methods should have the class as parent
                const methodSpans = spans.filter(s => s.kind === 'method');
                const classSpan = spans.find(s => s.kind === 'class' && s.name === 'MyClass');
                
                expect(classSpan).toBeDefined();
                
                for (const method of methodSpans) {
                    if (method.name === '__init__' || method.name === 'get_name' || method.name === 'static_method') {
                        expect(method.parents).toContain(classSpan!.id);
                    }
                }
                
            } finally {
                fs.unlinkSync(tempFile);
            }
        });
    });

    describe('JavaScript/TypeScript Parsing', () => {
        const jsCode = `
/**
 * Example JavaScript class
 */
class ExampleClass {
    constructor(name) {
        this.name = name;
    }
    
    /**
     * Get the name
     */
    getName() {
        return this.name;
    }
    
    static staticMethod() {
        return 'static';
    }
}

/**
 * Standalone function
 */
function standaloneFunction(x, y) {
    return x + y;
}

const arrowFunction = (a, b) => a + b;
`;

        it('should extract JavaScript spans correctly', async () => {
            const tempFile = path.join(testContext.basePath, 'temp_test.js');
            fs.writeFileSync(tempFile, jsCode);

            try {
                const spans = await adapter.parse([tempFile], testContext);
                
                expect(spans.length).toBeGreaterThan(0);
                
                // Check for class
                const classSpan = spans.find(s => s.kind === 'class' && s.name === 'ExampleClass');
                expect(classSpan).toBeDefined();
                expect(classSpan?.doc).toContain('Example JavaScript class');
                
                // Check for methods
                const methodSpans = spans.filter(s => s.kind === 'method');
                expect(methodSpans.length).toBeGreaterThan(0);
                
                // Check for functions
                const functionSpans = spans.filter(s => s.kind === 'function');
                expect(functionSpans.length).toBeGreaterThan(0);
                
                const standaloneFunc = functionSpans.find(s => s.name === 'standaloneFunction');
                expect(standaloneFunc).toBeDefined();
                expect(standaloneFunc?.doc).toContain('Standalone function');
                
            } finally {
                fs.unlinkSync(tempFile);
            }
        });
    });

    describe('Dart Parsing', () => {
        const dartCode = `
/// Example Dart class
class MyClass {
  String _name;
  
  /// Constructor
  MyClass(this._name);
  
  /// Get the name
  String getName() {
    return _name;
  }
  
  /// Static method
  static void staticMethod() {
    print('static');
  }
}

/// Standalone function
void standaloneFunction(int x, int y) {
  print(x + y);
}

/// Async function
Future<void> asyncFunction() async {
  await someOperation();
}

/// Enum example
enum Status {
  active,
  inactive,
  pending
}
`;

        it('should extract Dart spans correctly', async () => {
            const tempFile = path.join(testContext.basePath, 'temp_test.dart');
            fs.writeFileSync(tempFile, dartCode);

            try {
                const spans = await adapter.parse([tempFile], testContext);
                
                expect(spans.length).toBeGreaterThan(0);
                
                // Check for class
                const classSpan = spans.find(s => s.kind === 'class' && s.name === 'MyClass');
                expect(classSpan).toBeDefined();
                expect(classSpan?.doc).toContain('Example Dart class');
                
                // Check for methods
                const methodSpans = spans.filter(s => s.kind === 'method');
                expect(methodSpans.length).toBeGreaterThan(0);
                
                // Check for functions
                const functionSpans = spans.filter(s => s.kind === 'function');
                expect(functionSpans.length).toBeGreaterThan(0);
                
                const standaloneFunc = functionSpans.find(s => s.name === 'standaloneFunction');
                expect(standaloneFunc).toBeDefined();
                expect(standaloneFunc?.doc).toContain('Standalone function');
                
                // Check for enum
                const enumSpan = spans.find(s => s.kind === 'enum' && s.name === 'Status');
                expect(enumSpan).toBeDefined();
                expect(enumSpan?.doc).toContain('Enum example');
                
            } finally {
                fs.unlinkSync(tempFile);
            }
        });
    });

    describe('Error Handling', () => {
        it('should handle empty files gracefully', async () => {
            const tempFile = path.join(testContext.basePath, 'empty.py');
            fs.writeFileSync(tempFile, '');

            try {
                const spans = await adapter.parse([tempFile], testContext);
                expect(spans).toEqual([]);
            } finally {
                fs.unlinkSync(tempFile);
            }
        });

        it('should handle syntax errors gracefully', async () => {
            const invalidPythonCode = `
def invalid_function(
    # Missing closing parenthesis and colon
    return x
`;

            const tempFile = path.join(testContext.basePath, 'invalid.py');
            fs.writeFileSync(tempFile, invalidPythonCode);

            try {
                const spans = await adapter.parse([tempFile], testContext);
                // Should not throw, but may return empty spans or use fallback
                expect(Array.isArray(spans)).toBe(true);
            } finally {
                fs.unlinkSync(tempFile);
            }
        });

        it('should handle missing files', async () => {
            const nonExistentFile = path.join(testContext.basePath, 'nonexistent.py');
            
            const spans = await adapter.parse([nonExistentFile], testContext);
            expect(spans).toEqual([]);
        });
    });

    describe('Progress Reporting', () => {
        it('should emit progress events', async () => {
            const progressEvents: any[] = [];
            const contextWithProgress: ParseContext = {
                ...testContext,
                onProgress: (event) => progressEvents.push(event)
            };

            const pythonCode = 'def test(): pass';
            const tempFile = path.join(testContext.basePath, 'progress_test.py');
            fs.writeFileSync(tempFile, pythonCode);

            try {
                await adapter.parse([tempFile], contextWithProgress);
                
                expect(progressEvents.length).toBeGreaterThan(0);
                
                // Should have start event
                expect(progressEvents.some(e => e.type === 'start')).toBe(true);
                
                // Should have fileParsed event
                expect(progressEvents.some(e => e.type === 'fileParsed')).toBe(true);
                
                // Should have spansEmitted event
                expect(progressEvents.some(e => e.type === 'spansEmitted')).toBe(true);
                
            } finally {
                fs.unlinkSync(tempFile);
            }
        });
    });

    describe('Performance', () => {
        it('should handle large files efficiently', async () => {
            // Generate a large Python file
            let largeCode = 'class LargeClass:\n';
            for (let i = 0; i < 1000; i++) {
                largeCode += `    def method_${i}():\n        return ${i}\n`;
            }
            
            const tempFile = path.join(testContext.basePath, 'large.py');
            fs.writeFileSync(tempFile, largeCode);

            try {
                const startTime = Date.now();
                const spans = await adapter.parse([tempFile], testContext);
                const endTime = Date.now();
                
                // Should complete within reasonable time (5 seconds for 1000 methods)
                expect(endTime - startTime).toBeLessThan(5000);
                
                // Should extract all methods
                const methodSpans = spans.filter(s => s.kind === 'method');
                expect(methodSpans.length).toBe(1000);
                
            } finally {
                fs.unlinkSync(tempFile);
            }
        });
    });

    describe('Utility Methods', () => {
        it('should return supported extensions', () => {
            const extensions = adapter.getSupportedExtensions();
            expect(extensions.length).toBeGreaterThan(0);
            expect(extensions).toContain('.py');
            expect(extensions).toContain('.js');
            expect(extensions).toContain('.ts');
            expect(extensions).toContain('.dart');
        });

        it('should return available languages', () => {
            const languages = adapter.getAvailableLanguages();
            expect(Array.isArray(languages)).toBe(true);
        });

        it('should report ready status', () => {
            expect(typeof adapter.isReady()).toBe('boolean');
        });
    });
});