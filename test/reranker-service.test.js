#!/usr/bin/env node
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import {
    RerankerService,
    defaultRerankerService,
    rerank,
    getAvailableProviders,
    getAvailableModels,
    getRerankerStats
} from '../src/ranking/reranker-service.js';

test('RerankerService configuration', () => {
    const service = new RerankerService({
        defaultProvider: 'api',
        fallbackProvider: 'rrf',
        cache: false
    });
    
    assert.equal(service.defaultProvider, 'api');
    assert.equal(service.fallbackProvider, 'rrf');
    assert.equal(service.cacheEnabled, false);
});

test('RerankerService provider name normalization', () => {
    const service = new RerankerService();
    
    assert.equal(service.normalizeProviderName('transformers'), 'local');
    assert.equal(service.normalizeProviderName('cohere'), 'api');
    assert.equal(service.normalizeProviderName('voyage'), 'api');
    assert.equal(service.normalizeProviderName('jina'), 'api');
    assert.equal(service.normalizeProviderName('local'), 'local');
    assert.equal(service.normalizeProviderName('api'), 'api');
    assert.equal(service.normalizeProviderName('unknown'), 'unknown');
});

test('RerankerService provider detection', () => {
    const service = new RerankerService();
    
    assert.equal(service.isNewProvider('local'), true);
    assert.equal(service.isNewProvider('api'), true);
    assert.equal(service.isNewProvider('transformers'), false);
    assert.equal(service.isNewProvider('cohere'), false);
    assert.equal(service.isNewProvider('rrf'), false);
});

test('RerankerService RRF fusion', async () => {
    const service = new RerankerService();
    
    const documents = [
        { id: '1', score: 0.9, path: 'file1.js' },
        { id: '2', score: 0.8, path: 'file2.js' },
        { id: '3', score: 0.7, path: 'file3.js' }
    ];
    
    const result = await service.performRRF(documents, {
        query: 'test query',
        topK: 2
    });
    
    assert.equal(result.success, true);
    assert.equal(result.provider, 'rrf');
    assert.equal(result.results.length, 2);
    assert.equal(result.total_processed, 3);
    
    // Check that results have proper structure
    result.results.forEach(r => {
        assert.ok(r.document);
        assert.equal(typeof r.relevance_score, 'number');
        assert.equal(typeof r.score, 'number');
        assert.equal(typeof r.fusedScore, 'number');
    });
});

test('RerankerService RRF with multiple result sets', async () => {
    const service = new RerankerService();
    
    const resultSet1 = [
        { id: '1', score: 0.9, path: 'file1.js' },
        { id: '2', score: 0.8, path: 'file2.js' }
    ];
    
    const resultSet2 = [
        { id: '2', score: 0.9, path: 'file2.js' },
        { id: '3', score: 0.8, path: 'file3.js' }
    ];
    
    const result = await service.performRRF([resultSet1, resultSet2], {
        query: 'test query'
    });
    
    assert.equal(result.success, true);
    assert.equal(result.provider, 'rrf');
    assert.equal(result.result_sets, 2);
    
    // Document 2 should rank highest (appears in both result sets)
    const topResult = result.results[0];
    assert.equal(topResult.document.id, '2');
    assert.ok(topResult.fusedScore > topResult.document.score);
});

test('RerankerService result formatting', () => {
    const service = new RerankerService();
    
    const providerResult = {
        query: 'test query',
        provider: 'local',
        results: [
            {
                index: 0,
                document: { id: '1', path: 'file1.js', text: 'content' },
                relevance_score: 0.9
            },
            {
                index: 1,
                document: { id: '2', path: 'file2.js', text: 'content' },
                relevance_score: 0.8
            }
        ],
        total_processed: 2,
        cached: true,
        model: 'test-model'
    };
    
    const formatted = service.formatResult(providerResult, 10);
    
    assert.equal(formatted.success, true);
    assert.equal(formatted.query, 'test query');
    assert.equal(formatted.provider, 'local');
    assert.equal(formatted.results.length, 2);
    assert.equal(formatted.total_processed, 2);
    assert.equal(formatted.cached, true);
    assert.equal(formatted.model, 'test-model');
    
    // Check result structure
    formatted.results.forEach((r, index) => {
        assert.equal(r.index, index);
        assert.ok(r.document);
        assert.equal(typeof r.relevance_score, 'number');
        assert.equal(typeof r.score, 'number');
    });
});

test('RerankerService legacy reranking integration', async () => {
    // Mock the legacy rerankers
    const mockLegacyRerank = mock.fn(async (query, candidates, options) => {
        return candidates.map((c, i) => ({
            ...c,
            rerankerScore: candidates.length - i,
            rerankerRank: i + 1
        }));
    });
    
    const { rerankCrossEncoder } = await import('../src/ranking/crossEncoderReranker.js');
    const originalRerankCrossEncoder = rerankCrossEncoder;
    
    try {
        // Mock the legacy function
        global.rerankCrossEncoder = mockLegacyRerank;
        
        const service = new RerankerService();
        const documents = [
            { id: '1', text: 'first', path: 'file1.js' },
            { id: '2', text: 'second', path: 'file2.js' }
        ];
        
        const result = await service.legacyRerank('test query', documents, {
            provider: 'transformers',
            topK: 2
        });
        
        assert.equal(result.success, true);
        assert.equal(result.provider, 'transformers');
        assert.equal(result.results.length, 2);
        
        // Check that legacy function was called
        assert.equal(mockLegacyRerank.mock.calls.length, 1);
        
    } finally {
        // Restore original function if it exists
        if (originalRerankCrossEncoder) {
            global.rerankCrossEncoder = originalRerankCrossEncoder;
        }
    }
});

test('RerankerService fallback mechanism', async () => {
    const service = new RerankerService({
        defaultProvider: 'nonexistent',
        fallbackProvider: 'rrf'
    });
    
    const documents = [
        { id: '1', text: 'first', path: 'file1.js' },
        { id: '2', text: 'second', path: 'file2.js' }
    ];
    
    // Should fall back to RRF when primary provider fails
    const result = await service.rerank('test query', documents);
    
    assert.equal(result.success, true);
    assert.equal(result.provider, 'rrf');
});

test('RerankerService statistics', async () => {
    const service = new RerankerService({
        defaultProvider: 'local',
        fallbackProvider: 'rrf',
        cache: true
    });
    
    const stats = await service.getStats();
    
    assert.equal(typeof stats.available_providers, 'number');
    assert.equal(typeof stats.total_providers, 'number');
    assert.equal(stats.default_provider, 'local');
    assert.equal(stats.fallback_provider, 'rrf');
    assert.equal(stats.cache_enabled, true);
    assert(Array.isArray(stats.providers));
});

test('Default service instance', () => {
    assert.ok(defaultRerankerService instanceof RerankerService);
});

test('Convenience functions', async () => {
    // Mock the default service
    const originalRerank = defaultRerankerService.rerank;
    defaultRerankerService.rerank = mock.fn(async () => ({
        success: true,
        results: []
    }));
    
    const originalGetAvailableProviders = defaultRerankerService.getAvailableProviders;
    defaultRerankerService.getAvailableProviders = mock.fn(async () => []);
    
    const originalGetAvailableModels = defaultRerankerService.getAvailableModels;
    defaultRerankerService.getAvailableModels = mock.fn(async () => []);
    
    const originalGetStats = defaultRerankerService.getStats;
    defaultRerankerService.getStats = mock.fn(async () => ({}));
    
    try {
        // Test convenience functions
        const result1 = await rerank('query', []);
        assert(defaultRerankerService.rerank.mock.calls.length, 1);
        
        const result2 = await getAvailableProviders();
        assert(defaultRerankerService.getAvailableProviders.mock.calls.length, 1);
        
        const result3 = await getAvailableModels('local');
        assert(defaultRerankerService.getAvailableModels.mock.calls.length, 1);
        
        const result4 = await getRerankerStats();
        assert(defaultRerankerService.getStats.mock.calls.length, 1);
        
    } finally {
        // Restore original methods
        defaultRerankerService.rerank = originalRerank;
        defaultRerankerService.getAvailableProviders = originalGetAvailableProviders;
        defaultRerankerService.getAvailableModels = originalGetAvailableModels;
        defaultRerankerService.getStats = originalGetStats;
    }
});