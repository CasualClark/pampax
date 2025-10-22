/**
 * Adapter Integration Tests
 * 
 * Tests for integrating the adapter system with the existing service layer
 */

import { describe, it, before, beforeEach } from 'node:test';
import assert from 'node:assert';
import { adapterRegistry } from '../../src/adapters/base.js';
import { treeSitterAdapter } from '../../src/adapters/treesitter/treesitter-adapter.js';
import { initializeParsers } from '../../src/adapters/treesitter/parser.js';
import path from 'path';
import fs from 'fs';

describe('Adapter Integration Tests', () => {
    let testRepoPath: string;

    before(async () => {
        // Initialize parsers
        await initializeParsers();
        
        // Register adapters
        adapterRegistry.register(treeSitterAdapter);
        
        // Create test repository
        testRepoPath = path.resolve('./test/integration-repo');
        if (!fs.existsSync(testRepoPath)) {
            fs.mkdirSync(testRepoPath, { recursive: true });
        }
    });

    beforeEach(() => {
        // Clean up test files
        if (fs.existsSync(testRepoPath)) {
            const files = fs.readdirSync(testRepoPath);
            for (const file of files) {
                fs.unlinkSync(path.join(testRepoPath, file));
            }
        }
    });

    it('should register and retrieve adapters', () => {
        const retrieved = adapterRegistry.get('treesitter');
        assert.strictEqual(retrieved, treeSitterAdapter);
        
        const allAdapters = adapterRegistry.getAll();
        assert.ok(allAdapters.includes(treeSitterAdapter));
    });

    it('should find supporting adapters for files', () => {
        const pythonAdapters = adapterRegistry.findSupporting('test.py');
        assert.ok(pythonAdapters.length > 0);
        assert.ok(pythonAdapters.includes(treeSitterAdapter));
        
        const jsAdapters = adapterRegistry.findSupporting('test.js');
        assert.ok(jsAdapters.length > 0);
        assert.ok(jsAdapters.includes(treeSitterAdapter));
        
        const unsupportedAdapters = adapterRegistry.findSupporting('test.txt');
        assert.strictEqual(unsupportedAdapters.length, 0);
    });

    it('should get adapters by IDs', () => {
        const adapters = adapterRegistry.getByIds(['treesitter']);
        assert.strictEqual(adapters.length, 1);
        assert.strictEqual(adapters[0], treeSitterAdapter);
        
        const emptyAdapters = adapterRegistry.getByIds(['nonexistent']);
        assert.strictEqual(emptyAdapters.length, 0);
    });

    it('should parse files through adapter registry', async () => {
        const pythonCode = `
def integration_test():
    '''Integration test function'''
    return 'success'
`;

        const testFile = path.join(testRepoPath, 'integration_test.py');
        fs.writeFileSync(testFile, pythonCode);

        try {
            const adapters = adapterRegistry.findSupporting(testFile);
            assert.ok(adapters.length > 0, 'Should find supporting adapters');
            
            const adapter = adapters[0];
            const context = {
                repo: 'integration-test',
                basePath: testRepoPath,
                onProgress: undefined
            };
            
            const spans = await adapter.parse([testFile]);
            assert.ok(spans.length > 0, 'Should extract spans');
            
            const functionSpan = spans.find(s => s.kind === 'function' && s.name === 'integration_test');
            assert.ok(functionSpan, 'Should find integration_test function');
            assert.ok(functionSpan?.doc?.includes('Integration test function'), 'Should extract documentation');
            
        } finally {
            if (fs.existsSync(testFile)) {
                fs.unlinkSync(testFile);
            }
        }
    });

    it('should handle multiple files with different languages', async () => {
        const pythonCode = `
def python_func():
    return 'python'
`;

        const jsCode = `
function jsFunction() {
    return 'javascript';
}
`;

        const pythonFile = path.join(testRepoPath, 'multi_test.py');
        const jsFile = path.join(testRepoPath, 'multi_test.js');
        
        fs.writeFileSync(pythonFile, pythonCode);
        fs.writeFileSync(jsFile, jsCode);

        try {
            const context = {
                repo: 'multi-lang-test',
                basePath: testRepoPath,
                onProgress: undefined
            };
            
            // Parse Python file
            const pythonAdapters = adapterRegistry.findSupporting(pythonFile);
            const pythonSpans = await pythonAdapters[0].parse([pythonFile]);
            assert.ok(pythonSpans.length > 0, 'Should extract Python spans');
            
            // Parse JavaScript file
            const jsAdapters = adapterRegistry.findSupporting(jsFile);
            const jsSpans = await jsAdapters[0].parse([jsFile]);
            assert.ok(jsSpans.length > 0, 'Should extract JavaScript spans');
            
            // Verify different languages
            const pythonFunc = pythonSpans.find(s => s.name === 'python_func');
            assert.ok(pythonFunc, 'Should find Python function');
            
            const jsFunc = jsSpans.find(s => s.name === 'jsFunction');
            assert.ok(jsFunc, 'Should find JavaScript function');
            
        } finally {
            if (fs.existsSync(pythonFile)) {
                fs.unlinkSync(pythonFile);
            }
            if (fs.existsSync(jsFile)) {
                fs.unlinkSync(jsFile);
            }
        }
    });

    it('should emit progress events during parsing', async () => {
        const progressEvents: any[] = [];
        const context = {
            repo: 'progress-test',
            basePath: testRepoPath,
            onProgress: (event: any) => progressEvents.push(event)
        };
        
        const testCode = `
def progress_test():
    return 'progress'
`;

        const testFile = path.join(testRepoPath, 'progress_test.py');
        fs.writeFileSync(testFile, testCode);

        try {
            const adapters = adapterRegistry.findSupporting(testFile);
            await adapters[0].parse([testFile]);
            
            assert.ok(progressEvents.length > 0, 'Should emit progress events');
            
            const startEvent = progressEvents.find(e => e.type === 'start');
            assert.ok(startEvent, 'Should emit start event');
            assert.strictEqual(startEvent.totalFiles, 1);
            
            const fileParsedEvent = progressEvents.find(e => e.type === 'fileParsed');
            assert.ok(fileParsedEvent, 'Should emit fileParsed event');
            assert.strictEqual(fileParsedEvent.path, path.relative(testRepoPath, testFile));
            
            const spansEmittedEvent = progressEvents.find(e => e.type === 'spansEmitted');
            assert.ok(spansEmittedEvent, 'Should emit spansEmitted event');
            assert.ok(spansEmittedEvent.count > 0, 'Should emit span count');
            
        } finally {
            if (fs.existsSync(testFile)) {
                fs.unlinkSync(testFile);
            }
        }
    });
});