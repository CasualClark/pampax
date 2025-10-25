import { enhancedReciprocalRankFusion } from './hybrid.js';
import { intentClassifier } from '../intent/index.js';
import { policyGate } from '../policy/policy-gate.js';
import { logger } from '../config/logger.js';
import crypto from 'crypto';

/**
 * Learning-enhanced search with outcome tracking and cache integration
 * 
 * This module provides search functions that integrate with the Phase 6
 * learning system to collect outcomes, check caches, and optimize results.
 */

/**
 * Generate query signature for cache lookup
 */
function generateQuerySignature(query, intent) {
    const features = [
        `query:${query.toLowerCase().trim()}`,
        `intent:${intent.intent}`,
        `confidence:${Math.floor(intent.confidence * 100)}`
    ];
    
    return crypto.createHash('sha256')
        .update(features.join('|'))
        .digest('hex')
        .substring(0, 16);
}

/**
 * Learning-enhanced search with cache integration and outcome tracking
 * 
 * This function enhances the standard search with:
 * 1. Learning cache lookup for fast responses
 * 2. Intent classification and policy optimization
 * 3. Outcome tracking for continuous improvement
 * 4. Performance monitoring
 */
export async function learningEnhancedSearch({
    query,
    vectorResults = [],
    bm25Results = [],
    memoryResults = [],
    symbolResults = [],
    storage = null,
    learningIntegration = null,
    sessionId = null,
    limit = 10,
    options = {}
} = {}) {
    const startTime = Date.now();
    
    try {
        // Step 1: Classify intent
        const intent = intentClassifier.classify(query);
        logger.debug('Intent classified', { 
            query: query.substring(0, 50), 
            intent: intent.intent, 
            confidence: intent.confidence 
        }, 'learning-enhanced-search');

        // Step 2: Check learning cache if available
        let cacheResult = null;
        if (learningIntegration) {
            const querySignature = generateQuerySignature(query, intent);
            cacheResult = await learningIntegration.checkCache(querySignature);
            
            if (cacheResult) {
                logger.debug('Learning cache hit', {
                    querySignature,
                    bundleId: cacheResult
                }, 'learning-enhanced-search');
                
                return {
                    results: [], // Would load actual bundle from cache
                    cacheHit: true,
                    bundleId: cacheResult,
                    intent,
                    performance_ms: Date.now() - startTime,
                    querySignature
                };
            }
        }

        // Step 3: Get policy decision
        const policy = policyGate.evaluate(intent, {
            repo: options.repo,
            language: options.language,
            queryLength: query.length,
            budget: options.budget
        });

        // Step 4: Perform enhanced search with optimized policy
        const results = enhancedReciprocalRankFusion({
            vectorResults,
            bm25Results,
            memoryResults,
            symbolResults,
            intent,
            policy,
            limit
        });

        // Step 5: Generate bundle data for learning
        const bundleData = {
            sources: [
                { type: 'vector', items: vectorResults.slice(0, limit) },
                { type: 'bm25', items: bm25Results.slice(0, limit) },
                { type: 'memory', items: memoryResults.slice(0, limit) },
                { type: 'symbol', items: symbolResults.slice(0, limit) }
            ],
            intent,
            total_tokens: estimateTokenUsage(results),
            budget_used: options.budget ? estimateTokenUsage(results) / options.budget : 0,
            policy,
            query
        };

        const performance_ms = Date.now() - startTime;
        const querySignature = generateQuerySignature(query, intent);

        logger.debug('Learning-enhanced search completed', {
            resultCount: results.length,
            intent: intent.intent,
            performance_ms,
            cacheHit: false
        }, 'learning-enhanced-search');

        return {
            results,
            cacheHit: false,
            bundleId: null, // Will be set after bundle creation
            bundleData,
            intent,
            policy,
            performance_ms,
            querySignature,
            sessionId
        };
    } catch (error) {
        logger.error('Learning-enhanced search failed', {
            query: query.substring(0, 50),
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined
        }, 'learning-enhanced-search');

        // Fallback to basic search
        return {
            results: enhancedReciprocalRankFusion({ vectorResults, bm25Results, limit }),
            cacheHit: false,
            error: error instanceof Error ? error.message : String(error),
            performance_ms: Date.now() - startTime
        };
    }
}

/**
 * Record search outcome for learning
 * 
 * This function should be called after user interaction with search results
 * to collect outcome signals for the learning system.
 */
export async function recordSearchOutcome({
    learningIntegration,
    searchResult,
    satisfied,
    timeToFix = null,
    topClickId = null,
    tokenUsage = null,
    repo = null,
    branch = null
} = {}) {
    if (!learningIntegration || !searchResult) {
        return;
    }

    try {
        await learningIntegration.recordInteraction({
            sessionId: searchResult.sessionId || 'unknown',
            query: searchResult.bundleData?.query || 'unknown',
            intent: searchResult.intent,
            bundleId: searchResult.bundleId,
            bundleData: searchResult.bundleData,
            satisfied,
            timeToFix,
            topClickId,
            tokenUsage: tokenUsage || searchResult.bundleData?.total_tokens,
            repo,
            branch
        });

        // If satisfied and cache is available, store in learning cache
        if (satisfied && searchResult.querySignature && searchResult.bundleId) {
            await learningIntegration.storeInCache(
                searchResult.querySignature,
                searchResult.bundleId,
                1.0 // Perfect satisfaction score
            );
        }

        logger.debug('Search outcome recorded', {
            sessionId: searchResult.sessionId,
            satisfied,
            timeToFix,
            bundleId: searchResult.bundleId
        }, 'learning-enhanced-search');
    } catch (error) {
        logger.warn('Failed to record search outcome', {
            sessionId: searchResult.sessionId,
            error: error instanceof Error ? error.message : String(error)
        }, 'learning-enhanced-search');
    }
}

/**
 * Create learning-enhanced search engine
 */
export class LearningEnhancedSearchEngine {
    constructor(storage, learningIntegration = null, options = {}) {
        this.storage = storage;
        this.learningIntegration = learningIntegration;
        this.options = {
            defaultLimit: 10,
            enableCache: true,
            enableOutcomeTracking: true,
            ...options
        };
    }

    /**
     * Perform search with learning enhancements
     */
    async search(params) {
        return await learningEnhancedSearch({
            ...params,
            storage: this.storage,
            learningIntegration: this.learningIntegration,
            limit: params.limit || this.options.defaultLimit
        });
    }

    /**
     * Record outcome for a search
     */
    async recordOutcome(searchResult, outcome) {
        if (!this.options.enableOutcomeTracking) {
            return;
        }

        return await recordSearchOutcome({
            learningIntegration: this.learningIntegration,
            searchResult,
            ...outcome
        });
    }

    /**
     * Get learning statistics
     */
    async getLearningStats() {
        if (!this.learningIntegration) {
            return null;
        }

        return await this.learningIntegration.getLearningStats();
    }

    /**
     * Update learning integration
     */
    setLearningIntegration(learningIntegration) {
        this.learningIntegration = learningIntegration;
    }
}

/**
 * Estimate token usage for search results
 */
function estimateTokenUsage(results) {
    if (!results || !Array.isArray(results)) {
        return 0;
    }

    let totalTokens = 0;
    for (const result of results) {
        if (result.content) {
            totalTokens += Math.ceil(result.content.length / 4); // Rough estimate
        }
        if (result.file) {
            totalTokens += Math.ceil(result.file.length / 4);
        }
        if (result.path) {
            totalTokens += Math.ceil(result.path.length / 4);
        }
        // Base tokens for metadata
        totalTokens += 20;
    }

    return totalTokens;
}

/**
 * Convenience function for quick learning-enhanced search
 */
export async function quickLearningSearch(query, storage, learningIntegration = null, options = {}) {
    // This would typically perform the actual vector and BM25 searches
    // For now, return a placeholder structure
    const vectorResults = options.vectorResults || [];
    const bm25Results = options.bm25Results || [];
    
    return await learningEnhancedSearch({
        query,
        vectorResults,
        bm25Results,
        storage,
        learningIntegration,
        ...options
    });
}