/**
 * Simple Tree-sitter Adapter Tests
 * 
 * Basic tests for the Tree-sitter adapter using Node.js test runner
 */

import { describe, it, before, beforeEach } from 'node:test';
import assert from 'node:assert';
import { TreeSitterAdapter } from '../../src/adapters/treesitter/treesitter-adapter.js';
import { ParseContext } from '../../src/adapters/base.js';
import { initializeParsers } from '../../src/adapters/treesitter/parser.js';
import path from 'path';
import fs from 'fs';

describe('TreeSitterAdapter Basic Tests', () => {
    let adapter: TreeSitterAdapter;
    let testContext: ParseContext;

    before(async () => {
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

    it('should have correct adapter ID', () => {
        assert.strictEqual(adapter.id, 'treesitter');
    });

    it('should support Python files', () => {
        assert.strictEqual(adapter.supports('test.py'), true);
        assert.strictEqual(adapter.supports('path/to/file.py'), true);
    });

    it('should support JavaScript files', () => {
        assert.strictEqual(adapter.supports('test.js'), true);
        assert.strictEqual(adapter.supports('path/to/file.js'), true);
    });

    it('should support TypeScript files', () => {
        assert.strictEqual(adapter.supports('test.ts'), true);
        assert.strictEqual(adapter.supports('path/to/file.ts'), true);
        assert.strictEqual(adapter.supports('test.tsx'), true);
    });

    it('should support Dart files', () => {
        assert.strictEqual(adapter.supports('test.dart'), true);
        assert.strictEqual(adapter.supports('path/to/file.dart'), true);
    });

    it('should not support unsupported files', () => {
        assert.strictEqual(adapter.supports('test.txt'), false);
        assert.strictEqual(adapter.supports('test.md'), false);
        assert.strictEqual(adapter.supports('test.unknown'), false);
    });

    it('should parse simple Python code', async () => {
        const pythonCode = `
def simple_function():
    '''Simple function'''
    return 42

class SimpleClass:
    '''Simple class'''
    def method(self):
        return 'hello'
`;

        // Ensure fixtures directory exists
        if (!fs.existsSync(testContext.basePath)) {
            fs.mkdirSync(testContext.basePath, { recursive: true });
        }

        const tempFile = path.join(testContext.basePath, 'simple_test.py');
        fs.writeFileSync(tempFile, pythonCode);

        try {
            const spans = await adapter.parse([tempFile], testContext);
            
            assert.ok(spans.length > 0, 'Should extract at least one span');
            
            // Check for function
            const functionSpan = spans.find(s => s.kind === 'function' && s.name === 'simple_function');
            assert.ok(functionSpan, 'Should find simple_function');
            assert.ok(functionSpan?.doc?.includes('Simple function'), 'Should extract documentation');
            
            // Check for class
            const classSpan = spans.find(s => s.kind === 'class' && s.name === 'SimpleClass');
            assert.ok(classSpan, 'Should find SimpleClass');
            
            // Check for method
            const methodSpan = spans.find(s => s.kind === 'method' && s.name === 'method');
            assert.ok(methodSpan, 'Should find method');
            
        } finally {
            if (fs.existsSync(tempFile)) {
                fs.unlinkSync(tempFile);
            }
        }
    });

    it('should parse simple JavaScript code', async () => {
        const jsCode = `
/**
 * Simple function
 */
function simpleFunction() {
    return 42;
}

/**
 * Simple class
 */
class SimpleClass {
    /**
     * Method
     */
    method() {
        return 'hello';
    }
}
`;

        // Ensure fixtures directory exists
        if (!fs.existsSync(testContext.basePath)) {
            fs.mkdirSync(testContext.basePath, { recursive: true });
        }

        const tempFile = path.join(testContext.basePath, 'simple_test.js');
        fs.writeFileSync(tempFile, jsCode);

        try {
            const spans = await adapter.parse([tempFile], testContext);
            
            assert.ok(spans.length > 0, 'Should extract at least one span');
            
            // Check for function
            const functionSpan = spans.find(s => s.kind === 'function' && s.name === 'simpleFunction');
            assert.ok(functionSpan, 'Should find simpleFunction');
            assert.ok(functionSpan?.doc?.includes('Simple function'), 'Should extract documentation');
            
            // Check for class
            const classSpan = spans.find(s => s.kind === 'class' && s.name === 'SimpleClass');
            assert.ok(classSpan, 'Should find SimpleClass');
            
        } finally {
            if (fs.existsSync(tempFile)) {
                fs.unlinkSync(tempFile);
            }
        }
    });

    it('should handle empty files gracefully', async () => {
        // Ensure fixtures directory exists
        if (!fs.existsSync(testContext.basePath)) {
            fs.mkdirSync(testContext.basePath, { recursive: true });
        }

        const tempFile = path.join(testContext.basePath, 'empty.py');
        fs.writeFileSync(tempFile, '');

        try {
            const spans = await adapter.parse([tempFile], testContext);
            assert.deepStrictEqual(spans, []);
        } finally {
            if (fs.existsSync(tempFile)) {
                fs.unlinkSync(tempFile);
            }
        }
    });

    it('should return supported extensions', () => {
        const extensions = adapter.getSupportedExtensions();
        assert.ok(extensions.length > 0, 'Should have supported extensions');
        assert.ok(extensions.includes('.py'), 'Should support Python');
        assert.ok(extensions.includes('.js'), 'Should support JavaScript');
        assert.ok(extensions.includes('.ts'), 'Should support TypeScript');
    });

    it('should return available languages', () => {
        const languages = adapter.getAvailableLanguages();
        assert.ok(Array.isArray(languages), 'Should return array');
    });

    it('should report ready status', () => {
        assert.ok(typeof adapter.isReady() === 'boolean', 'Should return boolean');
    });
});