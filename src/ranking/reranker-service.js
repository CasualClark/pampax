/**
 * Reranker Service - High-level interface for reranking operations
 * 
 * Provides a unified interface for different reranking providers while
 * maintaining backward compatibility with existing code.
 */

import { rerankerRegistry, LocalCrossEncoderProvider, APIRerankerProvider } from './reranker-provider.js';
import { rerankCrossEncoder } from './crossEncoderReranker.js';
import { rerankWithAPI } from './apiReranker.js';

/**
 * Main reranker service class
 */
export class RerankerService {
    constructor(config = {}) {
        this.config = config;
        this.defaultProvider = config.defaultProvider || 'local';
        this.fallbackProvider = config.fallbackProvider || 'rrf';
        this.cacheEnabled = config.cache !== false;
    }

    /**
     * Rerank documents using specified provider
     */
    async rerank(query, documents, options = {}) {
        const provider = options.provider || this.defaultProvider;
        const maxCandidates = options.maxCandidates || 50;
        const topK = options.topK || options.k || 20;

        // Handle RRF fusion (legacy support)
        if (provider === 'rrf') {
            return this.performRRF(documents, options);
        }

        // Handle legacy provider names for backward compatibility
        const normalizedProvider = this.normalizeProviderName(provider);

        try {
            // Use new provider system
            if (this.isNewProvider(normalizedProvider)) {
                const rerankerProvider = rerankerRegistry.create(normalizedProvider, this.config[normalizedProvider] || {});
                
                // Check if provider is available
                if (!(await rerankerProvider.isAvailable())) {
                    if (this.fallbackProvider && this.fallbackProvider !== provider) {
                        console.warn(`Provider ${normalizedProvider} not available, falling back to ${this.fallbackProvider}`);
                        return this.rerank(query, documents, { ...options, provider: this.fallbackProvider });
                    } else {
                        throw new Error(`Reranker provider ${normalizedProvider} is not available`);
                    }
                }

                const result = await rerankerProvider.rerank(query, documents, {
                    ...options,
                    noCache: !this.cacheEnabled || options.noCache
                });

                // Convert to expected format
                return this.formatResult(result, topK);

            } else {
                // Use legacy system for backward compatibility
                return await this.legacyRerank(query, documents, options);
            }

        } catch (error) {
            // Attempt fallback if configured
            if (this.fallbackProvider && this.fallbackProvider !== provider) {
                console.warn(`Reranking with ${normalizedProvider} failed, falling back to ${this.fallbackProvider}: ${error.message}`);
                return this.rerank(query, documents, { ...options, provider: this.fallbackProvider });
            }
            
            throw error;
        }
    }

    /**
     * Normalize legacy provider names to new provider names
     */
    normalizeProviderName(provider) {
        const mapping = {
            'transformers': 'local',
            'cohere': 'api',
            'voyage': 'api',
            'jina': 'api'
        };
        return mapping[provider] || provider;
    }

    /**
     * Check if provider uses new system
     */
    isNewProvider(provider) {
        return ['local', 'api'].includes(provider);
    }

    /**
     * Legacy reranking for backward compatibility
     */
    async legacyRerank(query, documents, options = {}) {
        const provider = options.provider || 'transformers';

        // Convert documents to expected format for legacy system
        const candidates = documents.map((doc, index) => ({
            ...doc,
            id: doc.id || `${doc.path || 'unknown'}:${index}`,
            text: doc.text || doc.content || ''
        }));

        let result;
        if (provider === 'transformers' || provider === 'local') {
            result = await rerankCrossEncoder(query, candidates, options);
        } else if (['cohere', 'voyage', 'jina', 'api'].includes(provider)) {
            result = await rerankWithAPI(query, candidates, options);
        } else {
            throw new Error(`Unknown legacy provider: ${provider}`);
        }

        // Convert back to document format
        const topK = options.topK || options.k || 20;
        return {
            success: true,
            query,
            provider,
            results: result.slice(0, topK).map((candidate, index) => ({
                index,
                document: candidate,
                relevance_score: candidate.rerankerScore || candidate.score || 0,
                score: candidate.rerankerScore || candidate.score || 0,
                path: candidate.path,
                metadata: candidate.metadata
            })),
            total_processed: result.length,
            cached: false
        };
    }

    /**
     * Perform RRF fusion for multiple result sets
     */
    performRRF(documents, options = {}) {
        const k = options.rrfK || 60;
        const topK = options.topK || options.k || 20;

        // Handle different input formats
        let resultSets;
        if (Array.isArray(documents[0])) {
            // Already an array of result sets
            resultSets = documents;
        } else if (documents[0] && documents[0].results) {
            // Array of objects with results property
            resultSets = documents.map(docSet => docSet.results || []);
        } else {
            // Single result set - just return as-is
            return {
                success: true,
                query: options.query || '',
                provider: 'rrf',
                results: documents.slice(0, topK).map((doc, index) => ({
                    index,
                    document: doc,
                    relevance_score: doc.score || 0,
                    score: doc.score || 0,
                    fusedScore: doc.score || 0
                })),
                total_processed: documents.length
            };
        }

        // Perform RRF fusion
        const fusedScores = new Map();
        
        resultSets.forEach((resultList, listIndex) => {
            resultList.forEach((result, rank) => {
                const id = result.id || result.document?.id || `${result.path || 'unknown'}:${rank}`;
                const currentScore = fusedScores.get(id) || { 
                    document: result.document || result,
                    fusedScore: 0,
                    sources: [],
                    scores: []
                };
                
                const newScore = currentScore.fusedScore + (1 / (k + rank + 1));
                
                fusedScores.set(id, {
                    ...currentScore,
                    fusedScore: newScore,
                    sources: [...currentScore.sources, listIndex],
                    scores: [...currentScore.scores, result.score || result.relevance_score || 0]
                });
            });
        });

        const fusedResults = Array.from(fusedScores.values())
            .sort((a, b) => b.fusedScore - a.fusedScore)
            .slice(0, topK);

        return {
            success: true,
            query: options.query || '',
            provider: 'rrf',
            results: fusedResults.map((item, index) => ({
                index,
                document: item.document,
                relevance_score: item.fusedScore,
                score: item.fusedScore,
                fusedScore: item.fusedScore,
                sources: item.sources,
                avgScore: item.scores.reduce((a, b) => a + b, 0) / item.scores.length
            })),
            total_processed: fusedResults.length,
            result_sets: resultSets.length
        };
    }

    /**
     * Format result from provider system to standard format
     */
    formatResult(providerResult, topK) {
        const results = (providerResult.results || []).slice(0, topK);
        
        return {
            success: true,
            query: providerResult.query || '',
            provider: providerResult.provider,
            results: results.map((result, index) => ({
                index,
                document: result.document,
                relevance_score: result.relevance_score || result.score || 0,
                score: result.relevance_score || result.score || 0,
                path: result.document?.path,
                metadata: result.document?.metadata
            })),
            total_processed: providerResult.total_processed || results.length,
            cached: providerResult.cached || false,
            model: providerResult.model
        };
    }

    /**
     * Get available providers with status
     */
    async getAvailableProviders() {
        return await rerankerRegistry.getAvailableProvidersWithStatus();
    }

    /**
     * Get available models for a specific provider
     */
    async getAvailableModels(provider) {
        try {
            const normalizedProvider = this.normalizeProviderName(provider);
            const rerankerProvider = rerankerRegistry.create(normalizedProvider);
            
            if (await rerankerProvider.isAvailable()) {
                return await rerankerProvider.getAvailableModels();
            } else {
                return [];
            }
        } catch (error) {
            return [];
        }
    }

    /**
     * Clear cache for all providers
     */
    clearCache() {
        // This would need to be implemented in each provider
        console.log('Cache clearing not yet implemented for all providers');
    }

    /**
     * Get provider statistics
     */
    async getStats() {
        const providers = await this.getAvailableProviders();
        return {
            available_providers: providers.filter(p => p.available).length,
            total_providers: providers.length,
            default_provider: this.defaultProvider,
            fallback_provider: this.fallbackProvider,
            cache_enabled: this.cacheEnabled,
            providers: providers.map(p => ({
                name: p.name,
                available: p.available,
                model_count: p.models.length,
                description: p.description
            }))
        };
    }
}

// Create default service instance
export const defaultRerankerService = new RerankerService();

/**
 * Convenience function for simple reranking
 */
export async function rerank(query, documents, options = {}) {
    return await defaultRerankerService.rerank(query, documents, options);
}

/**
 * Get available providers
 */
export async function getAvailableProviders() {
    return await defaultRerankerService.getAvailableProviders();
}

/**
 * Get available models for provider
 */
export async function getAvailableModels(provider) {
    return await defaultRerankerService.getAvailableModels(provider);
}

/**
 * Get reranker service statistics
 */
export async function getRerankerStats() {
    return await defaultRerankerService.getStats();
}