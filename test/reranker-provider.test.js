#!/usr/bin/env node
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {
    RerankerProvider,
    LocalCrossEncoderProvider,
    APIRerankerProvider,
    RerankerProviderRegistry,
    rerankerRegistry
} from '../src/ranking/reranker-provider.js';

test('RerankerProvider base class throws on unimplemented methods', async () => {
    const provider = new RerankerProvider();
    
    await assert.rejects(
        async () => await provider.getName(), 
        /getName\(\) must be implemented/
    );
    await assert.rejects(
        async () => await provider.isAvailable(), 
        /isAvailable\(\) must be implemented/
    );
    await assert.rejects(
        async () => await provider.getAvailableModels(), 
        /getAvailableModels\(\) must be implemented/
    );
    await assert.rejects(
        async () => await provider.rerankImpl('query', [], {}), 
        /rerankImpl\(\) must be implemented/
    );
});

test('RerankerProvider document validation', () => {
    const provider = new RerankerProvider();
    
    // Valid documents
    assert.doesNotThrow(() => {
        provider.validateDocuments([{ text: 'test' }]);
    });
    
    assert.doesNotThrow(() => {
        provider.validateDocuments([{ content: 'test' }]);
    });
    
    // Invalid documents
    assert.throws(() => {
        provider.validateDocuments('not an array');
    }, /Documents must be an array/);
    
    assert.throws(() => {
        provider.validateDocuments([]);
    }, /Documents array cannot be empty/);
    
    assert.throws(() => {
        provider.validateDocuments([{}]);
    }, /must have text or content property/);
});

test('RerankerProvider text extraction and truncation', () => {
    const provider = new RerankerProvider();
    
    // Text extraction
    assert.equal(provider.extractDocumentText({ text: 'hello' }), 'hello');
    assert.equal(provider.extractDocumentText({ content: 'world' }), 'world');
    assert.equal(provider.extractDocumentText({ text: 'a', content: 'b' }), 'a');
    assert.equal(provider.extractDocumentText({}), '');
    
    // Text truncation
    const longText = 'a'.repeat(1000);
    const truncated = provider.truncateText(longText, 100); // ~400 chars
    assert.equal(truncated.length, 400);
    
    // Short text shouldn't be truncated
    const shortText = 'hello';
    assert.equal(provider.truncateText(shortText, 100), 'hello');
});

test('LocalCrossEncoderProvider configuration', () => {
    const provider = new LocalCrossEncoderProvider({
        model: 'test-model',
        maxCandidates: 25,
        maxTokens: 256
    });
    
    assert.equal(provider.getName(), 'local');
    assert.equal(provider.modelId, 'test-model');
    assert.equal(provider.maxCandidates, 25);
    assert.equal(provider.maxTokens, 256);
});

test('LocalCrossEncoderProvider model loading failure', async () => {
    const provider = new LocalCrossEncoderProvider();
    
    // Force load failure by setting the flag
    provider.loadFailed = true;
    
    const available = await provider.isAvailable();
    assert.equal(available, false);
    
    provider.resetModel();
});

test('LocalCrossEncoderProvider reranking with mock mode', async () => {
    // Set mock mode
    process.env.PAMPAX_MOCK_RERANKER_TESTS = '1';
    
    try {
        const provider = new LocalCrossEncoderProvider();
        
        const documents = [
            { id: '1', text: 'first document' },
            { id: '2', text: 'second document' },
            { id: '3', text: 'third document' }
        ];
        
        const result = await provider.rerank('test query', documents);
        
        assert.equal(result.provider, 'local');
        assert.equal(result.results.length, 3);
        assert.equal(result.cached, false);
        assert.ok(result.model);
        
        // Results should have proper structure
        result.results.forEach((r, index) => {
            assert.equal(typeof r.index, 'number');
            assert.ok(r.document);
            assert.equal(typeof r.relevance_score, 'number');
        });
        
    } finally {
        delete process.env.PAMPAX_MOCK_RERANKER_TESTS;
    }
});

test('APIRerankerProvider configuration', () => {
    const provider = new APIRerankerProvider({
        apiUrl: 'https://api.test.com/v1',
        apiKey: 'test-key',
        model: 'test-model'
    });
    
    assert.equal(provider.getName(), 'api');
    assert.equal(provider.apiUrl, 'https://api.test.com/v1');
    assert.equal(provider.apiKey, 'test-key');
    assert.equal(provider.model, 'test-model');
});

test('APIRerankerProvider availability check', async () => {
    // Without configuration
    const provider1 = new APIRerankerProvider();
    const available1 = await provider1.isAvailable();
    assert.equal(available1, false);
    
    // With configuration - should return true if both URL and key are provided
    const provider2 = new APIRerankerProvider({
        apiUrl: 'https://api.test.com/v1',
        apiKey: 'test-key'
    });
    const available2 = await provider2.isAvailable();
    assert.equal(available2, true);
});

test('APIRerankerProvider reranking with mocked fetch', async () => {
    const mockResponse = {
        ok: true,
        json: async () => ({
            results: [
                { index: 1, relevance_score: 0.9 },
                { index: 0, relevance_score: 0.7 },
                { index: 2, relevance_score: 0.3 }
            ]
        })
    };
    
    const originalFetch = global.fetch;
    global.fetch = mock.fn(async () => mockResponse);
    
    try {
        const provider = new APIRerankerProvider({
            apiUrl: 'https://api.test.com/v1',
            apiKey: 'test-key',
            model: 'test-model'
        });
        
        const documents = [
            { id: '1', text: 'first document' },
            { id: '2', text: 'second document' },
            { id: '3', text: 'third document' }
        ];
        
        const result = await provider.rerank('test query', documents);
        
        assert.equal(result.provider, 'api');
        assert.equal(result.results.length, 3);
        assert.equal(result.model, 'test-model');
        
        // Check ordering (should be sorted by relevance_score)
        assert.equal(result.results[0].index, 1); // score 0.9
        assert.equal(result.results[1].index, 0); // score 0.7
        assert.equal(result.results[2].index, 2); // score 0.3
        
        // Verify fetch was called correctly
        assert.equal(global.fetch.mock.calls.length, 1);
        const [url, options] = global.fetch.mock.calls[0];
        assert.equal(url, 'https://api.test.com/v1');
        assert.equal(options.method, 'POST');
        assert.equal(options.headers.Authorization, 'Bearer test-key');
        
        const requestBody = JSON.parse(options.body);
        assert.equal(requestBody.model, 'test-model');
        assert.equal(requestBody.query, 'test query');
        assert.equal(requestBody.documents.length, 3);
        
    } finally {
        global.fetch = originalFetch;
    }
});

test('APIRerankerProvider error handling', async () => {
    const originalFetch = global.fetch;
    global.fetch = mock.fn(async () => ({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error'
    }));
    
    try {
        const provider = new APIRerankerProvider({
            apiUrl: 'https://api.test.com/v1',
            apiKey: 'test-key'
        });
        
        const documents = [{ id: '1', text: 'test' }];
        
        await assert.rejects(
            () => provider.rerank('query', documents),
            /API reranking failed: Rerank API error \(500\)/
        );
        
    } finally {
        global.fetch = originalFetch;
    }
});

test('RerankerProviderRegistry default providers', () => {
    const registry = new RerankerProviderRegistry();
    
    assert.ok(registry.providers.has('local'));
    assert.ok(registry.providers.has('api'));
    
    const availableProviders = registry.getAvailableProviders();
    assert(availableProviders.includes('local'));
    assert(availableProviders.includes('api'));
});

test('RerankerProviderRegistry provider creation', () => {
    const registry = new RerankerProviderRegistry();
    
    const localProvider = registry.create('local', { model: 'test' });
    assert(localProvider instanceof LocalCrossEncoderProvider);
    assert.equal(localProvider.modelId, 'test');
    
    const apiProvider = registry.create('api', { apiKey: 'test' });
    assert(apiProvider instanceof APIRerankerProvider);
    assert.equal(apiProvider.apiKey, 'test');
    
    assert.throws(() => {
        registry.create('unknown');
    }, /Unknown reranker provider: unknown/);
});

test('RerankerProviderRegistry custom provider registration', () => {
    const registry = new RerankerProviderRegistry();
    
    class CustomProvider extends RerankerProvider {
        getName() { return 'custom'; }
        async isAvailable() { return true; }
        async getAvailableModels() { return ['custom-model']; }
        async rerankImpl() { return { results: [] }; }
    }
    
    registry.register('custom', CustomProvider);
    
    assert.ok(registry.providers.has('custom'));
    
    const provider = registry.create('custom');
    assert(provider instanceof CustomProvider);
});

test('RerankerProviderRegistry provider status', async () => {
    const registry = new RerankerProviderRegistry();
    
    // Mock the providers to avoid actual loading
    registry.register('mock-available', class extends RerankerProvider {
        getName() { return 'mock-available'; }
        async isAvailable() { return true; }
        async getAvailableModels() { return ['model1']; }
        async rerankImpl() { return { results: [] }; }
    });
    
    registry.register('mock-unavailable', class extends RerankerProvider {
        getName() { return 'mock-unavailable'; }
        async isAvailable() { return false; }
        async getAvailableModels() { return []; }
        async rerankImpl() { return { results: [] }; }
    });
    
    const providers = await registry.getAvailableProvidersWithStatus();
    
    const availableProvider = providers.find(p => p.name === 'mock-available');
    assert.equal(availableProvider.available, true);
    assert.deepEqual(availableProvider.models, ['model1']);
    
    const unavailableProvider = providers.find(p => p.name === 'mock-unavailable');
    assert.equal(unavailableProvider.available, false);
    assert.deepEqual(unavailableProvider.models, []);
});

test('RerankerCache functionality', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'rerank-cache-test-'));
    const cachePath = path.join(tmpDir, 'test-cache.json');
    
    const { RerankerCache } = await import('../src/ranking/reranker-provider.js');
    const cache = new RerankerCache(cachePath);
    
    // Test cache miss
    assert.equal(cache.get('nonexistent'), null);
    
    // Test cache set and get
    const testData = { results: [{ id: '1', score: 0.9 }] };
    cache.set('test-key', testData);
    
    const retrieved = cache.get('test-key');
    assert.deepEqual(retrieved, testData);
    
    // Test persistence
    const cache2 = new RerankerCache(cachePath);
    const retrieved2 = cache2.get('test-key');
    assert.deepEqual(retrieved2, testData);
    
    // Test cache cleanup (expired entries)
    const oldData = { results: [] };
    cache.set('old-key', oldData);
    
    // Manually set old timestamp
    cache.cache['old-key'].timestamp = Date.now() - 25 * 60 * 60 * 1000; // 25 hours ago
    
    cache.cleanup();
    assert.equal(cache.get('old-key'), null);
    assert.notEqual(cache.get('test-key'), null);
    
    // Cleanup
    await fs.rm(tmpDir, { recursive: true, force: true });
});

test('Global reranker registry', () => {
    assert.ok(rerankerRegistry instanceof RerankerProviderRegistry);
    assert(rerankerRegistry.getAvailableProviders().includes('local'));
    assert(rerankerRegistry.getAvailableProviders().includes('api'));
});