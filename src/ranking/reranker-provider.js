/**
 * Reranker Provider Interface and Local Implementation
 * 
 * Implements a provider pattern for reranking with local cross-encoder support
 * and maintains parity with cloud API patterns.
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

/**
 * Base interface for all reranker providers
 */
export class RerankerProvider {
    constructor(config = {}) {
        this.config = config;
        this.cache = new RerankerCache(config.cachePath);
    }

    /**
     * Get provider name
     */
    getName() {
        throw new Error('getName() must be implemented by subclass');
    }

    /**
     * Check if provider is available
     */
    async isAvailable() {
        throw new Error('isAvailable() must be implemented by subclass');
    }

    /**
     * Get available models for this provider
     */
    async getAvailableModels() {
        throw new Error('getAvailableModels() must be implemented by subclass');
    }

    /**
     * Rerank documents with caching
     */
    async rerank(query, documents, options = {}) {
        const cacheKey = this.generateCacheKey(query, documents, options);
        
        // Check cache first
        if (!options.noCache) {
            const cached = this.cache.get(cacheKey);
            if (cached) {
                return {
                    ...cached,
                    cached: true,
                    provider: this.getName()
                };
            }
        }

        // Perform reranking
        const result = await this.rerankImpl(query, documents, options);

        // Cache result
        if (!options.noCache && result.results) {
            this.cache.set(cacheKey, result);
        }

        return {
            ...result,
            cached: false,
            provider: this.getName()
        };
    }

    /**
     * Implementation-specific reranking logic
     */
    async rerankImpl(query, documents, options = {}) {
        throw new Error('rerankImpl() must be implemented by subclass');
    }

    /**
     * Generate cache key for query/documents combination
     */
    generateCacheKey(query, documents, options) {
        const docHash = documents
            .map(doc => doc.id || doc.text?.substring(0, 100) || '')
            .sort()
            .join('|');
        
        const optionsHash = Object.keys(options)
            .sort()
            .map(key => `${key}:${options[key]}`)
            .join(',');
        
        const input = `${this.getName()}:${query}:${docHash}:${optionsHash}`;
        return crypto.createHash('sha256').update(input).digest('hex').substring(0, 16);
    }

    /**
     * Validate documents format
     */
    validateDocuments(documents) {
        if (!Array.isArray(documents)) {
            throw new Error('Documents must be an array');
        }
        
        if (documents.length === 0) {
            throw new Error('Documents array cannot be empty');
        }

        documents.forEach((doc, index) => {
            if (!doc.text && !doc.content) {
                throw new Error(`Document at index ${index} must have text or content property`);
            }
        });
    }

    /**
     * Extract text from document
     */
    extractDocumentText(doc) {
        return doc.text || doc.content || '';
    }

    /**
     * Truncate text to max tokens (rough estimate)
     */
    truncateText(text, maxTokens = 512) {
        if (!text || typeof text !== 'string') {
            return '';
        }

        // Rough estimate: 1 token ≈ 4 characters for code
        const maxChars = maxTokens * 4;
        
        if (text.length <= maxChars) {
            return text;
        }

        return text.slice(0, maxChars);
    }
}

/**
 * Local cross-encoder reranker using Transformers.js
 */
export class LocalCrossEncoderProvider extends RerankerProvider {
    constructor(config = {}) {
        super(config);
        this.modelId = config.model || 'Xenova/ms-marco-MiniLM-L-6-v2';
        this.maxCandidates = config.maxCandidates || 50;
        this.maxTokens = config.maxTokens || 512;
        this.quantized = config.quantized !== false;
        
        this.pipelineFactory = null;
        this.modelPromise = null;
        this.loadFailed = false;
    }

    getName() {
        return 'local';
    }

    async isAvailable() {
        try {
            await this.loadPipelineFactory();
            return this.pipelineFactory !== null;
        } catch (error) {
            return false;
        }
    }

    async getAvailableModels() {
        return [
            'Xenova/ms-marco-MiniLM-L-6-v2',
            'Xenova/ms-marco-MiniLM-L-12-v2',
            'Xenova/bge-reranker-base',
            'Xenova/bge-reranker-large'
        ];
    }

    async loadPipelineFactory() {
        if (this.pipelineFactory || this.loadFailed) {
            return this.pipelineFactory;
        }

        try {
            const module = await import('@xenova/transformers');
            if (typeof module.pipeline === 'function') {
                this.pipelineFactory = module.pipeline;
            } else if (module.default && typeof module.default.pipeline === 'function') {
                this.pipelineFactory = module.default.pipeline;
            } else {
                throw new Error('Transformers pipeline function not found');
            }
        } catch (error) {
            this.loadFailed = true;
            return null;
        }

        return this.pipelineFactory;
    }

    async getModel() {
        if (this.loadFailed) {
            throw new Error('Transformers library failed to load');
        }

        await this.loadPipelineFactory();
        if (!this.pipelineFactory) {
            this.loadFailed = true;
            throw new Error('Transformers pipeline not available');
        }

        if (!this.modelPromise) {
            this.modelPromise = this.pipelineFactory('text-classification', this.modelId, {
                quantized: this.quantized
            }).catch(error => {
                this.loadFailed = true;
                this.modelPromise = null;
                throw error;
            });
        }

        return await this.modelPromise;
    }

    async rerankImpl(query, documents, options = {}) {
        this.validateDocuments(documents);

        const maxCandidates = Math.min(
            options.maxCandidates || this.maxCandidates,
            documents.length
        );

        if (maxCandidates <= 1) {
            return {
                results: documents.map((doc, index) => ({
                    index,
                    document: doc,
                    relevance_score: 1.0,
                    score: 1.0
                })),
                model: this.modelId,
                total_processed: documents.length
            };
        }

        const topDocuments = documents.slice(0, maxCandidates);
        const maxTokens = options.maxTokens || this.maxTokens;

        // Check for mock mode
        if (process.env.PAMPAX_MOCK_RERANKER_TESTS === '1') {
            const results = topDocuments.map((doc, index) => ({
                index,
                document: doc,
                relevance_score: Math.random(), // Mock scores
                score: Math.random()
            })).sort((a, b) => b.relevance_score - a.relevance_score);

            return {
                results,
                model: 'mock-model',
                total_processed: topDocuments.length,
                max_tokens: maxTokens
            };
        }

        try {
            const model = await this.getModel();
            
            // Prepare inputs for cross-encoder
            const inputs = topDocuments.map(doc => 
                `${query} [SEP] ${this.truncateText(this.extractDocumentText(doc), maxTokens)}`
            );

            // Get relevance scores
            const outputs = await model(inputs);

            // Extract scores from model output
            const results = topDocuments.map((doc, index) => {
                const output = Array.isArray(outputs) ? outputs[index] : outputs;
                let score = 0;

                if (Array.isArray(output)) {
                    if (output.length > 0 && typeof output[0] === 'number') {
                        score = output[0];
                    } else if (output[0] && typeof output[0].score === 'number') {
                        score = output[0].score;
                    }
                } else if (typeof output === 'object' && typeof output.score === 'number') {
                    score = output.score;
                } else if (typeof output === 'number') {
                    score = output;
                } else if (typeof output === 'object' && Array.isArray(output.logits)) {
                    // Handle classification output
                    score = Math.max(...output.logits);
                }

                return {
                    index,
                    document: doc,
                    relevance_score: score,
                    score: score
                };
            });

            // Sort by relevance score (descending)
            results.sort((a, b) => b.relevance_score - a.relevance_score);

            return {
                results,
                model: this.modelId,
                total_processed: topDocuments.length,
                max_tokens: maxTokens
            };

        } catch (error) {
            throw new Error(`Local reranking failed: ${error.message}`);
        }
    }

    /**
     * Reset model cache (for testing)
     */
    resetModel() {
        this.pipelineFactory = null;
        this.modelPromise = null;
        this.loadFailed = false;
    }
}

/**
 * API-based reranker provider (wrapper for existing API reranker)
 */
export class APIRerankerProvider extends RerankerProvider {
    constructor(config = {}) {
        super(config);
        this.apiUrl = config.apiUrl || process.env.PAMPAX_RERANK_API_URL;
        this.apiKey = config.apiKey || process.env.PAMPAX_RERANK_API_KEY;
        this.model = config.model || process.env.PAMPAX_RERANK_MODEL || 'rerank-v3.5';
        this.maxCandidates = config.maxCandidates || 50;
        this.maxTokens = config.maxTokens || 512;
    }

    getName() {
        return 'api';
    }

    async isAvailable() {
        return Boolean(this.apiUrl && this.apiKey);
    }

    async getAvailableModels() {
        return [
            'rerank-v3.5',
            'rerank-english-v2.0',
            'rerank-multilingual-v2.0'
        ];
    }

    async rerankImpl(query, documents, options = {}) {
        this.validateDocuments(documents);

        if (!this.apiUrl || !this.apiKey) {
            throw new Error('API URL and API key are required for API reranking');
        }

        const maxCandidates = Math.min(
            options.maxCandidates || this.maxCandidates,
            documents.length
        );

        const topDocuments = documents.slice(0, maxCandidates);
        const maxTokens = options.maxTokens || this.maxTokens;

        // Prepare document texts
        const documentTexts = topDocuments.map(doc => 
            this.truncateText(this.extractDocumentText(doc), maxTokens)
        );

        try {
            const response = await fetch(this.apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`
                },
                body: JSON.stringify({
                    model: options.model || this.model,
                    query: query,
                    documents: documentTexts,
                    top_n: topDocuments.length
                })
            });

            if (!response.ok) {
                const errorText = await response.text().catch(() => 'Unknown error');
                throw new Error(`Rerank API error (${response.status}): ${errorText}`);
            }

            const data = await response.json();

            // Handle different response formats
            let apiResults;
            if (data.results && Array.isArray(data.results)) {
                apiResults = data.results;
            } else if (data.data && Array.isArray(data.data)) {
                apiResults = data.data;
            } else if (Array.isArray(data)) {
                apiResults = data;
            } else {
                throw new Error('Unexpected rerank API response format');
            }

            // Map API results back to documents
            const results = apiResults.map((result, index) => ({
                index: result.index,
                document: topDocuments[result.index],
                relevance_score: result.relevance_score || result.score || 0,
                score: result.relevance_score || result.score || 0
            }));

            return {
                results,
                model: options.model || this.model,
                total_processed: topDocuments.length,
                max_tokens: maxTokens
            };

        } catch (error) {
            throw new Error(`API reranking failed: ${error.message}`);
        }
    }
}

/**
 * Reranking result cache
 */
export class RerankerCache {
    constructor(cachePath = '.pampax/rerank-cache.json') {
        this.cachePath = cachePath;
        this.cache = this.loadCache();
        this.maxAge = 24 * 60 * 60 * 1000; // 24 hours
    }

    loadCache() {
        try {
            if (fs.existsSync(this.cachePath)) {
                const data = fs.readFileSync(this.cachePath, 'utf8');
                return JSON.parse(data);
            }
        } catch (error) {
            // Cache loading errors are non-fatal
        }
        return {};
    }

    saveCache() {
        try {
            const dir = path.dirname(this.cachePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(this.cachePath, JSON.stringify(this.cache, null, 2));
        } catch (error) {
            // Cache saving errors are non-fatal
        }
    }

    get(key) {
        const entry = this.cache[key];
        if (!entry) {
            return null;
        }

        // Check if entry is expired
        if (Date.now() - entry.timestamp > this.maxAge) {
            delete this.cache[key];
            this.saveCache();
            return null;
        }

        return entry.data;
    }

    set(key, data) {
        this.cache[key] = {
            data,
            timestamp: Date.now()
        };
        this.saveCache();
    }

    clear() {
        this.cache = {};
        this.saveCache();
    }

    cleanup() {
        const now = Date.now();
        let changed = false;
        
        for (const key in this.cache) {
            if (now - this.cache[key].timestamp > this.maxAge) {
                delete this.cache[key];
                changed = true;
            }
        }
        
        if (changed) {
            this.saveCache();
        }
    }
}

/**
 * Provider registry and factory
 */
export class RerankerProviderRegistry {
    constructor() {
        this.providers = new Map();
        this.registerDefaultProviders();
    }

    registerDefaultProviders() {
        this.register('local', LocalCrossEncoderProvider);
        this.register('api', APIRerankerProvider);
    }

    register(name, providerClass) {
        this.providers.set(name, providerClass);
    }

    create(name, config = {}) {
        const ProviderClass = this.providers.get(name);
        if (!ProviderClass) {
            throw new Error(`Unknown reranker provider: ${name}`);
        }
        return new ProviderClass(config);
    }

    getAvailableProviders() {
        return Array.from(this.providers.keys());
    }

    async getAvailableProvidersWithStatus() {
        const providers = [];
        
        for (const [name, ProviderClass] of this.providers) {
            try {
                const provider = new ProviderClass();
                const available = await provider.isAvailable();
                const models = available ? await provider.getAvailableModels() : [];
                
                providers.push({
                    name,
                    available,
                    models,
                    description: this.getProviderDescription(name)
                });
            } catch (error) {
                providers.push({
                    name,
                    available: false,
                    models: [],
                    error: error.message,
                    description: this.getProviderDescription(name)
                });
            }
        }
        
        return providers;
    }

    getProviderDescription(name) {
        const descriptions = {
            local: 'Local cross-encoder reranking using Transformers.js',
            api: 'Cloud API reranking (Cohere, Voyage, etc.)'
        };
        return descriptions[name] || 'Unknown provider';
    }
}

// Global registry instance
export const rerankerRegistry = new RerankerProviderRegistry();