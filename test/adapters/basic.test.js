/**
 * Basic Adapter Tests
 * 
 * Simple tests to verify the adapter interface works
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';

// Mock adapter for testing
class MockAdapter {
    constructor() {
        this.id = 'mock-adapter';
    }

    supports(filePath) {
        return filePath.endsWith('.mock');
    }

    async parse(files) {
        const spans = [];
        for (const file of files) {
            // Create a mock span
            spans.push({
                id: `mock-${file}`,
                repo: 'test-repo',
                path: file,
                byteStart: 0,
                byteEnd: 100,
                kind: 'function',
                name: 'mockFunction',
                signature: 'mockFunction()',
                doc: 'Mock documentation'
            });
        }
        return spans;
    }
}

describe('Basic Adapter Interface', () => {
    let adapter;

    beforeEach(() => {
        adapter = new MockAdapter();
    });

    it('should have correct adapter ID', () => {
        assert.strictEqual(adapter.id, 'mock-adapter');
    });

    it('should support mock files', () => {
        assert.strictEqual(adapter.supports('test.mock'), true);
        assert.strictEqual(adapter.supports('path/to/file.mock'), true);
    });

    it('should not support other files', () => {
        assert.strictEqual(adapter.supports('test.py'), false);
        assert.strictEqual(adapter.supports('test.js'), false);
        assert.strictEqual(adapter.supports('test.txt'), false);
    });

    it('should parse files and return spans', async () => {
        const files = ['test1.mock', 'test2.mock'];
        const spans = await adapter.parse(files);
        
        assert.strictEqual(spans.length, 2);
        assert.strictEqual(spans[0].path, 'test1.mock');
        assert.strictEqual(spans[1].path, 'test2.mock');
        
        // Verify span structure
        const span = spans[0];
        assert.strictEqual(span.repo, 'test-repo');
        assert.strictEqual(span.kind, 'function');
        assert.strictEqual(span.name, 'mockFunction');
        assert.strictEqual(span.signature, 'mockFunction()');
        assert.strictEqual(span.doc, 'Mock documentation');
    });

    it('should handle empty file list', async () => {
        const spans = await adapter.parse([]);
        assert.deepStrictEqual(spans, []);
    });
});

describe('Adapter Registry Pattern', () => {
    let registry;
    let adapter;

    beforeEach(() => {
        registry = new Map();
        adapter = new MockAdapter();
    });

    it('should register and retrieve adapters', () => {
        registry.set(adapter.id, adapter);
        
        const retrieved = registry.get('mock-adapter');
        assert.strictEqual(retrieved, adapter);
    });

    it('should find supporting adapters', () => {
        registry.set(adapter.id, adapter);
        
        const supporting = Array.from(registry.values())
            .filter(a => a.supports('test.mock'));
        
        assert.strictEqual(supporting.length, 1);
        assert.strictEqual(supporting[0], adapter);
    });

    it('should return empty for unsupported files', () => {
        registry.set(adapter.id, adapter);
        
        const supporting = Array.from(registry.values())
            .filter(a => a.supports('test.py'));
        
        assert.strictEqual(supporting.length, 0);
    });
});

describe('Progress Event Pattern', () => {
    it('should emit progress events', async () => {
        const events = [];
        const mockProgress = (event) => events.push(event);
        
        const adapter = new MockAdapter();
        const files = ['test.mock'];
        
        // Simulate progress events
        mockProgress({ type: 'start', totalFiles: 1 });
        
        const spans = await adapter.parse(files);
        
        mockProgress({ type: 'fileParsed', path: 'test.mock' });
        mockProgress({ type: 'spansEmitted', path: 'test.mock', count: spans.length });
        
        // Verify events
        assert.strictEqual(events.length, 3);
        assert.strictEqual(events[0].type, 'start');
        assert.strictEqual(events[1].type, 'fileParsed');
        assert.strictEqual(events[2].type, 'spansEmitted');
        assert.strictEqual(events[0].totalFiles, 1);
        assert.strictEqual(events[2].count, 1);
    });
});