import { seedMixOptimizer } from './seed-mix-optimizer.js';
import { BFSTraversalEngine } from '../graph/graph-traversal.js';
import { intentClassifier } from '../intent/index.js';
import { getLogger } from '../utils/structured-logger.js';
import { getMetricsCollector } from '../metrics/metrics-collector.js';
import { getCacheManager } from '../cache/cache-manager.js';

const logger = getLogger('search-hybrid');
const metrics = getMetricsCollector();

// Simple token estimation functions
function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / 3);
}

class TokenBudgetTracker {
  constructor(budget = 4000) {
    this.budget = budget;
    this.used = 0;
    this.items = [];
  }
  
  addItem(item, tokens) {
    this.used += tokens;
    this.items.push({ item, tokens });
    return this.remaining();
  }
  
  remaining() {
    return Math.max(0, this.budget - this.used);
  }
  
  canFit(tokens) {
    return this.used + tokens <= this.budget;
  }
  
  getReport() {
    return {
      budget: this.budget,
      used: this.used,
      remaining: this.remaining(),
      percentage: Math.round((this.used / this.budget) * 100),
      items: this.items.length
    };
  }
}

/**
 * Legacy reciprocal rank fusion function for backward compatibility
 * @deprecated Use seedMixOptimizer.reciprocalRankFusion with intent-aware weighting instead
 */
export function reciprocalRankFusion({ vectorResults = [], bm25Results = [], limit = 10, k = 60 }) {
    const scores = new Map();

    const addScores = (items, source) => {
        items.forEach((item, index) => {
            if (!item || typeof item.id === 'undefined') {
                return;
            }

            const rankContribution = 1 / (k + index + 1);
            const existing = scores.get(item.id) || {
                id: item.id,
                score: 0,
                vectorRank: null,
                bm25Rank: null,
                vectorScore: null,
                bm25Score: null
            };

            existing.score += rankContribution;
            if (source === 'vector') {
                existing.vectorRank = index;
                existing.vectorScore = item.score;
            } else if (source === 'bm25') {
                existing.bm25Rank = index;
                existing.bm25Score = item.score;
            }

            scores.set(item.id, existing);
        });
    };

    addScores(vectorResults, 'vector');
    addScores(bm25Results, 'bm25');

    return Array.from(scores.values())
        .sort((a, b) => {
            if (b.score !== a.score) {
                return b.score - a.score;
            }

            const aVectorRank = typeof a.vectorRank === 'number' ? a.vectorRank : Number.MAX_SAFE_INTEGER;
            const bVectorRank = typeof b.vectorRank === 'number' ? b.vectorRank : Number.MAX_SAFE_INTEGER;
            if (aVectorRank !== bVectorRank) {
                return aVectorRank - bVectorRank;
            }

            const aBmRank = typeof a.bm25Rank === 'number' ? a.bm25Rank : Number.MAX_SAFE_INTEGER;
            const bBmRank = typeof b.bm25Rank === 'number' ? b.bmRank : Number.MAX_SAFE_INTEGER;
            if (aBmRank !== bBmRank) {
                return aBmRank - bBmRank;
            }

            return 0;
        })
        .slice(0, limit);
}

/**
 * Enhanced reciprocal rank fusion with intent-aware seed mix optimization
 * This is the recommended approach for new implementations
 */
export function enhancedReciprocalRankFusion({
    vectorResults = [],
    bm25Results = [],
    memoryResults = [],
    symbolResults = [],
    intent = null,
    policy = null,
    limit = 10
} = {}) {
    // If no intent or policy provided, fall back to legacy RRF
    if (!intent || !policy) {
        return reciprocalRankFusion({ vectorResults, bm25Results, limit });
    }

    // Get optimized seed mix configuration
    const config = seedMixOptimizer.optimize(intent, policy);

    // Apply enhanced RRF with intent-aware weighting
    const fusedResults = seedMixOptimizer.reciprocalRankFusion({
        vectorResults,
        bm25Results,
        memoryResults,
        symbolResults
    }, config, limit);

    // Apply early stop if configured
    const finalResults = seedMixOptimizer.applyEarlyStop(fusedResults, config);

    return finalResults;
}

/**
 * Get seed mix configuration for a given intent and policy
 */
export function getSeedMixConfig(intent, policy) {
    return seedMixOptimizer.optimize(intent, policy);
}

/**
 * Apply early stop to search results
 */
export function applyEarlyStop(results, config) {
    return seedMixOptimizer.applyEarlyStop(results, config);
}

/**
 * Get performance metrics from the seed mix optimizer
 */
export function getOptimizerMetrics() {
    return seedMixOptimizer.getPerformanceMetrics();
}

/**
 * Reset optimizer metrics
 */
export function resetOptimizerMetrics() {
    seedMixOptimizer.resetMetrics();
}

/**
 * Clear optimizer cache
 */
export function clearOptimizerCache() {
    seedMixOptimizer.clearCache();
}

/**
 * Graph-Enhanced Hybrid Search with Intent-Aware Expansion
 * 
 * Integrates graph traversal into the search pipeline with token budget enforcement
 * and intent-aware query processing for Phase 5: Code Graph Neighbors
 */
export class GraphEnhancedSearchEngine {
    constructor(storage, options = {}) {
        this.storage = storage;
        this.bfsEngine = new BFSTraversalEngine(storage, options.defaultTokenBudget || 4000);
        this.intentClassifier = options.intentClassifier || null;
        this.cache = options.cacheEnabled !== false ? getCacheManager() : null;
        this.defaultGraphOptions = {
            max_depth: 2,
            expansion_strategy: 'quality-first',
            edge_types: null, // null means all edge types
            token_budget: 4000,
            ...options.graphOptions
        };
        this.performance_threshold_ms = options.performanceThreshold || 200;
        this.options = options;
        this.reliabilityManager = null;
        
        // Initialize reliability manager asynchronously
        this.initializeReliabilityManager();
    }

    async initializeReliabilityManager() {
        try {
            const { ReliabilityManager } = await import('../reliability/reliability-manager.js');
            this.reliabilityManager = new ReliabilityManager('search-engine', {
                timeouts: {
                    search: this.options.searchTimeout || 5000,
                    graph: this.options.graphTimeout || 8000,
                    cache: this.options.cacheTimeout || 1000
                },
                circuitBreakers: {
                    search: { failureThreshold: 5, recoveryTimeout: 30000 },
                    graph: { failureThreshold: 3, recoveryTimeout: 45000 },
                    cache: { failureThreshold: 10, recoveryTimeout: 15000 }
                },
                retryPolicies: {
                    search: { maxAttempts: 3, baseDelay: 1000 },
                    graph: { maxAttempts: 2, baseDelay: 2000 },
                    cache: { maxAttempts: 2, baseDelay: 200 }
                },
                enableGracefulDegradation: this.options.enableReliability !== false
            });
        } catch (error) {
            logger.warn('reliability_manager_init_failed', 'Failed to initialize reliability manager', {
                error: error.message
            });
        }
    }

    /**
     * Perform graph-enhanced hybrid search with reliability protection
     */
    async searchWithGraphExpansion({
        query,
        vectorResults = [],
        bm25Results = [],
        memoryResults = [],
        symbolResults = [],
        intent = null,
        policy = null,
        graphOptions = {},
        limit = 10
    } = {}) {
        // Ensure reliability manager is initialized
        if (!this.reliabilityManager) {
            await this.initializeReliabilityManager();
        }

        // Use reliability manager if available, otherwise fall back to standard search
        if (this.reliabilityManager) {
            return await this.reliabilityManager.executeSearch(query, async () => {
                return await this.performSearchWithReliability({
                    query,
                    vectorResults,
                    bm25Results,
                    memoryResults,
                    symbolResults,
                    intent,
                    policy,
                    graphOptions,
                    limit
                });
            }, {
                cacheKey: `search:${JSON.stringify({ query, limit, intent: intent?.intent })}`,
                cache: this.cache,
                fallback: () => ({
                    results: enhancedReciprocalRankFusion({
                        vectorResults,
                        bm25Results,
                        memoryResults,
                        symbolResults,
                        intent,
                        policy,
                        limit
                    }),
                    graphExpansion: null,
                    intent,
                    performance_ms: 0,
                    degraded: true,
                    fallback: 'standard_hybrid'
                })
            });
        }

        // Fallback to standard search without reliability protection
        return await this.performSearchWithReliability({
            query,
            vectorResults,
            bm25Results,
            memoryResults,
            symbolResults,
            intent,
            policy,
            graphOptions,
            limit
        });
    }

    /**
     * Perform the actual search with optional reliability protection
     */
    async performSearchWithReliability({
        query,
        vectorResults = [],
        bm25Results = [],
        memoryResults = [],
        symbolResults = [],
        intent = null,
        policy = null,
        graphOptions = {},
        limit = 10
    } = {}) {
        const startTime = Date.now();
        const corrId = logger.getCorrelationId();
        
        // Classify intent if not provided
        if (!intent && this.intentClassifier) {
            intent = this.intentClassifier.classify(query);
        }

        // Perform standard hybrid search first
        const hybridStartTime = Date.now();
        const hybridResults = enhancedReciprocalRankFusion({
            vectorResults,
            bm25Results,
            memoryResults,
            symbolResults,
            intent,
            policy,
            limit
        });
        const hybridDuration = Date.now() - hybridStartTime;
        
        metrics.emitTiming('hybrid_search_latency_ms', hybridDuration, {
            query_type: 'hybrid',
            vector_results: vectorResults.length,
            bm25_results: bm25Results.length,
            memory_results: memoryResults.length,
            symbol_results: symbolResults.length
        }, corrId);

        // Extract symbols for graph expansion
        const startSymbols = this.extractSymbolsForExpansion(hybridResults, intent);
        
        if (startSymbols.length === 0) {
            logger.debug('No symbols found for graph expansion', { query });
            return {
                results: hybridResults,
                graphExpansion: null,
                performance_ms: Date.now() - startTime
            };
        }

        // Perform graph expansion with optional reliability protection
        let graphExpansion;
        if (this.reliabilityManager) {
            graphExpansion = await this.reliabilityManager.execute('graph', async () => {
                return await this.performGraphExpansion({
                    query,
                    startSymbols,
                    intent,
                    options: { ...this.defaultGraphOptions, ...graphOptions }
                });
            }, {
                timeout: this.defaultGraphOptions.timeout || 8000,
                fallback: () => ({
                    query,
                    start_symbols: startSymbols,
                    max_depth: 0,
                    expansion_strategy: 'disabled',
                    visited_nodes: new Set(),
                    edges: [],
                    tokens_used: 0,
                    truncated: false,
                    error: 'Graph expansion failed, using fallback'
                })
            });
        } else {
            try {
                graphExpansion = await this.performGraphExpansion({
                    query,
                    startSymbols,
                    intent,
                    options: { ...this.defaultGraphOptions, ...graphOptions }
                });
            } catch (error) {
                graphExpansion = {
                    query,
                    start_symbols: startSymbols,
                    max_depth: 0,
                    expansion_strategy: 'disabled',
                    visited_nodes: new Set(),
                    edges: [],
                    tokens_used: 0,
                    truncated: false,
                    error: error.message
                };
            }
        }

        const graphDuration = Date.now() - hybridStartTime;
        
        metrics.emitTiming('graph_expansion_latency_ms', graphDuration, {
            symbols_count: startSymbols.length,
            visited_nodes: graphExpansion.visited_nodes?.size || 0,
            edges_count: graphExpansion.edges?.length || 0
        }, corrId);

        // Enhance results with graph relationships
        const enhancedResults = this.enhanceResultsWithGraph(hybridResults, graphExpansion, intent);

        const duration = Date.now() - startTime;
        
        // Emit overall search metrics
        metrics.emitTiming('search_latency_ms', duration, {
            search_type: 'graph_enhanced',
            results_count: enhancedResults.length,
            graph_enabled: 'true',
            success: 'true'
        }, corrId);
        
        metrics.emitCounter('search_operations', 1, {
            search_type: 'graph_enhanced',
            success: 'true'
        }, corrId);
        
        // Log performance warning if needed
        if (duration > this.performance_threshold_ms) {
            logger.warn('Graph-enhanced search exceeded performance threshold', {
                duration,
                threshold: this.performance_threshold_ms,
                query,
                symbolsExpanded: startSymbols.length,
                graphNodes: graphExpansion.visited_nodes?.size,
                graphEdges: graphExpansion.edges.length
            });
        }

        return {
            results: enhancedResults,
            graphExpansion,
            intent,
            performance_ms: duration,
            tokens_used: graphExpansion.tokens_used,
            truncated: graphExpansion.truncated
        };
    }

    /**
     * Extract symbols from search results for graph expansion
     */
    extractSymbolsForExpansion(results, intent) {
        const symbols = [];
        
        // Prioritize results based on intent and score
        const prioritizedResults = results
            .filter(result => result.score > 0.1) // Filter low-confidence results
            .sort((a, b) => b.score - a.score)
            .slice(0, 5); // Take top 5 for expansion

        for (const result of prioritizedResults) {
            // Extract symbol information from different result types
            if (result.id && typeof result.id === 'string') {
                symbols.push(result.id);
            }
            
            // Extract from metadata if available
            if (result.metadata?.spanName) {
                symbols.push(result.metadata.spanName);
            }
            
            // Extract from file paths for file-level symbols
            if (result.file || result.path) {
                const filePath = result.file || result.path;
                // Convert file path to symbol format
                const symbol = filePath.replace(/\.(js|ts|py|java|cpp|c|h|go|rs|php|rb|swift|kt|dart)$/, '');
                if (symbol && !symbols.includes(symbol)) {
                    symbols.push(symbol);
                }
            }
        }

        // Intent-specific symbol extraction
        if (intent?.entities) {
            for (const entity of intent.entities) {
                if (entity.value && !symbols.includes(entity.value)) {
                    symbols.push(entity.value);
                }
            }
        }

        return symbols.filter(s => s && s.length > 0).slice(0, 10); // Limit to 10 symbols
    }

    /**
     * Perform graph expansion using BFS traversal
     */
    async performGraphExpansion({ query, startSymbols, intent, options }) {
        const expansion = {
            query,
            start_symbols: startSymbols,
            max_depth: options.max_depth,
            expansion_strategy: options.expansion_strategy,
            edge_types: options.edge_types,
            token_budget: options.token_budget
        };

        return await this.bfsEngine.expandGraph(expansion);
    }

    /**
     * Enhance search results with graph relationship data
     */
    enhanceResultsWithGraph(results, graphExpansion, intent) {
        if (!graphExpansion || !graphExpansion.edges.length) {
            return results;
        }

        // Create relationship map for quick lookup
        const relationshipMap = new Map();
        const nodeConnections = new Map();

        for (const edge of graphExpansion.edges) {
            const sourceKey = edge.sourceId;
            const targetKey = edge.targetId;
            
            // Track connections for each node
            if (!nodeConnections.has(sourceKey)) {
                nodeConnections.set(sourceKey, []);
            }
            if (!nodeConnections.has(targetKey)) {
                nodeConnections.set(targetKey, []);
            }
            
            nodeConnections.get(sourceKey).push({
                to: targetKey,
                type: edge.type,
                confidence: edge.confidence
            });
            nodeConnections.get(targetKey).push({
                to: sourceKey,
                type: edge.type,
                confidence: edge.confidence,
                direction: 'incoming'
            });
        }

        // Enhance each result with graph information
        return results.map(result => {
            const resultId = result.id || result.metadata?.spanName || result.file;
            const connections = nodeConnections.get(resultId);
            
            if (!connections || connections.length === 0) {
                return result;
            }

            // Calculate graph enhancement score
            const graphScore = this.calculateGraphEnhancementScore(connections, intent);
            
            // Create enhanced result
            return {
                ...result,
                graphRelationships: connections.slice(0, 5), // Limit to top 5 connections
                graphEnhancementScore: graphScore,
                // Boost original score based on graph relationships
                score: result.score + (graphScore * 0.2), // 20% boost max
                _graphNodes: graphExpansion.visited_nodes.size,
                _graphEdges: graphExpansion.edges.length
            };
        }).sort((a, b) => b.score - a.score); // Re-sort by enhanced scores
    }

    /**
     * Calculate graph enhancement score based on connections and intent
     */
    calculateGraphEnhancementScore(connections, intent) {
        let score = 0;
        
        // Base score from number of connections
        score += Math.min(connections.length * 0.1, 0.5); // Max 0.5 from connections
        
        // Intent-specific scoring
        if (intent) {
            for (const conn of connections) {
                // Boost scores for intent-relevant edge types
                if (intent.intent === 'symbol' && (conn.type === 'calls' || conn.type === 'uses')) {
                    score += 0.1;
                } else if (intent.intent === 'api' && (conn.type === 'implements' || conn.type === 'exposes')) {
                    score += 0.1;
                } else if (intent.intent === 'config' && (conn.type === 'configures' || conn.type === 'depends_on')) {
                    score += 0.1;
                }
                
                // Confidence weighting
                if (conn.confidence) {
                    score += conn.confidence * 0.1;
                }
            }
        }
        
        return Math.min(score, 1.0); // Cap at 1.0
    }

    /**
     * Get performance statistics
     */
    getPerformanceStats() {
        return {
            bfsEngine: this.bfsEngine.getPerformanceStats(),
            performanceThreshold: this.performance_threshold_ms
        };
    }

    /**
     * Update performance threshold
     */
    setPerformanceThreshold(thresholdMs) {
        this.performance_threshold_ms = thresholdMs;
        this.bfsEngine.setPerformanceThreshold(thresholdMs);
    }

    /**
     * Get reliability status
     */
    async getReliabilityStatus() {
        if (!this.reliabilityManager) {
            await this.initializeReliabilityManager();
        }
        
        return this.reliabilityManager ? {
            enabled: true,
            health: this.reliabilityManager.getHealthStatus(),
            stats: this.reliabilityManager.getStats()
        } : {
            enabled: false,
            reason: 'Reliability manager not initialized'
        };
    }

    /**
     * Get performance statistics including reliability
     */
    async getPerformanceStats() {
        const baseStats = {
            bfsEngine: this.bfsEngine.getPerformanceStats(),
            performanceThreshold: this.performance_threshold_ms
        };

        if (this.reliabilityManager) {
            baseStats.reliability = await this.getReliabilityStatus();
        }

        return baseStats;
    }
}

/**
 * Convenience function for graph-enhanced search
 */
export async function graphEnhancedSearch(params, storage, options = {}) {
    const engine = new GraphEnhancedSearchEngine(storage, options);
    return await engine.searchWithGraphExpansion(params);
}

/**
 * Create graph-enhanced search engine with intent classifier
 */
export async function createGraphEnhancedSearchEngine(storage, options = {}) {
    // Use the stub intent classifier for now
    return new GraphEnhancedSearchEngine(storage, {
        ...options,
        intentClassifier
    });
}


