import { logger } from '../config/logger.js';
import type { IntentResult } from '../intent/intent-classifier.js';
import type { PolicyDecision } from '../policy/policy-gate.js';

/**
 * Seed mix configuration for different search sources
 */
export interface SeedMixConfig {
    vectorWeight: number;
    bm25Weight: number;
    memoryWeight: number;
    symbolWeight: number;
    maxDepth: number;
    earlyStopThreshold: number;
    confidenceMultiplier: number;
}

/**
 * Search result interface for the optimizer
 */
export interface SearchResult {
    id: string;
    score: number;
    vectorRank?: number;
    bm25Rank?: number;
    memoryRank?: number;
    symbolRank?: number;
    vectorScore?: number;
    bm25Score?: number;
    memoryScore?: number;
    symbolScore?: number;
    path?: string;
    content?: string;
    metadata?: any;
}

/**
 * Intent-specific seed weight profiles
 */
interface IntentSeedProfile {
    name: string;
    baseConfig: SeedMixConfig;
    confidenceAdjustments: {
        low: Partial<SeedMixConfig>;
        medium: Partial<SeedMixConfig>;
        high: Partial<SeedMixConfig>;
    };
}

/**
 * Performance metrics for optimization monitoring
 */
export interface PerformanceMetrics {
    totalResultsProcessed: number;
    earlyStopActivations: number;
    averageProcessingTime: number;
    cacheHitRate: number;
    cacheHits: number;
    cacheMisses: number;
    intentDistribution: Record<string, number>;
}

/**
 * Seed Mix Optimizer - Implements per-intent seed weight optimization
 * with depth controls and early-stop mechanisms
 */
export class SeedMixOptimizer {
    private readonly intentProfiles: Map<string, IntentSeedProfile>;
    private readonly performanceCache: Map<string, { config: SeedMixConfig; timestamp: number }>;
    private readonly metrics: PerformanceMetrics;
    private readonly cacheTimeout = 300000; // 5 minutes
    private readonly maxCacheSize = 1000;

    constructor() {
        this.intentProfiles = new Map();
        this.performanceCache = new Map();
        this.metrics = {
            totalResultsProcessed: 0,
            earlyStopActivations: 0,
            averageProcessingTime: 0,
            cacheHitRate: 0,
            cacheHits: 0,
            cacheMisses: 0,
            intentDistribution: {}
        };

        this.initializeIntentProfiles();
        logger.info('SeedMixOptimizer initialized', { profileCount: this.intentProfiles.size });
    }

    /**
     * Initialize intent-specific seed profiles
     */
    private initializeIntentProfiles(): void {
        // Symbol-heavy profile: prioritizes definitions and implementations
        this.intentProfiles.set('symbol', {
            name: 'symbol-heavy',
            baseConfig: {
                vectorWeight: 1.2,
                bm25Weight: 0.8,
                memoryWeight: 1.0,
                symbolWeight: 2.0,
                maxDepth: 2,
                earlyStopThreshold: 3,
                confidenceMultiplier: 1.5
            },
            confidenceAdjustments: {
                low: { maxDepth: 1, earlyStopThreshold: 2 },
                medium: { symbolWeight: 2.5, maxDepth: 2 },
                high: { symbolWeight: 3.0, maxDepth: 3, earlyStopThreshold: 4 }
            }
        });

        // Config-focused profile: prioritizes configuration files and settings
        this.intentProfiles.set('config', {
            name: 'config-focused',
            baseConfig: {
                vectorWeight: 0.8,
                bm25Weight: 1.5,
                memoryWeight: 1.2,
                symbolWeight: 0.5,
                maxDepth: 1,
                earlyStopThreshold: 2,
                confidenceMultiplier: 1.2
            },
            confidenceAdjustments: {
                low: { maxDepth: 1, earlyStopThreshold: 1 },
                medium: { bm25Weight: 1.8, memoryWeight: 1.5 },
                high: { bm25Weight: 2.0, memoryWeight: 1.8, earlyStopThreshold: 3 }
            }
        });

        // API-balanced profile: balanced approach for API endpoints and handlers
        this.intentProfiles.set('api', {
            name: 'api-balanced',
            baseConfig: {
                vectorWeight: 1.0,
                bm25Weight: 1.0,
                memoryWeight: 1.3,
                symbolWeight: 1.2,
                maxDepth: 2,
                earlyStopThreshold: 2,
                confidenceMultiplier: 1.3
            },
            confidenceAdjustments: {
                low: { maxDepth: 1, earlyStopThreshold: 1 },
                medium: { memoryWeight: 1.5, symbolWeight: 1.5 },
                high: { memoryWeight: 1.8, symbolWeight: 1.8, maxDepth: 3 }
            }
        });

        // Incident-contextual profile: prioritizes error contexts and related code
        this.intentProfiles.set('incident', {
            name: 'incident-contextual',
            baseConfig: {
                vectorWeight: 1.3,
                bm25Weight: 1.1,
                memoryWeight: 1.8,
                symbolWeight: 1.5,
                maxDepth: 3,
                earlyStopThreshold: 5,
                confidenceMultiplier: 1.4
            },
            confidenceAdjustments: {
                low: { maxDepth: 2, earlyStopThreshold: 3 },
                medium: { memoryWeight: 2.0, maxDepth: 3 },
                high: { memoryWeight: 2.5, symbolWeight: 2.0, maxDepth: 4, earlyStopThreshold: 6 }
            }
        });

        // Default search profile: general-purpose balanced approach
        this.intentProfiles.set('search', {
            name: 'search-default',
            baseConfig: {
                vectorWeight: 1.0,
                bm25Weight: 1.0,
                memoryWeight: 1.0,
                symbolWeight: 1.0,
                maxDepth: 2,
                earlyStopThreshold: 10,
                confidenceMultiplier: 1.0
            },
            confidenceAdjustments: {
                low: { maxDepth: 1, earlyStopThreshold: 5 },
                medium: { maxDepth: 2 },
                high: { maxDepth: 3, earlyStopThreshold: 15 }
            }
        });
    }

    /**
     * Optimize seed mix configuration based on intent and policy
     */
    optimize(intent: IntentResult, policy: PolicyDecision): SeedMixConfig {
        const startTime = Date.now();
        
        try {
            // Update intent distribution metrics
            this.metrics.intentDistribution[intent.intent] = 
                (this.metrics.intentDistribution[intent.intent] || 0) + 1;

            // Check cache first
            const cacheKey = this.generateCacheKey(intent, policy);
            const cached = this.performanceCache.get(cacheKey);
            if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
                this.metrics.cacheHits++;
                this.metrics.cacheHitRate = this.calculateCacheHitRate();
                return cached.config;
            }

            this.metrics.cacheMisses++;

            // Get base configuration for intent
            const profile = this.intentProfiles.get(intent.intent);
            if (!profile) {
                logger.warn(`Unknown intent type: ${intent.intent}, using default profile`);
                return this.getDefaultConfig();
            }

            let config = { ...profile.baseConfig };

            // Apply confidence-based adjustments
            const confidenceLevel = this.getConfidenceLevel(intent.confidence);
            const adjustments = profile.confidenceAdjustments[confidenceLevel];
            config = { ...config, ...adjustments };

            // Apply policy-based overrides
            config = this.applyPolicyOverrides(config, policy);

            // Apply dynamic weight adjustment based on confidence score
            config = this.applyConfidenceMultiplier(config, intent.confidence);

            // Validate configuration
            this.validateConfig(config);

            // Cache the result
            this.cacheConfiguration(cacheKey, config);

            const duration = Date.now() - startTime;
            this.updatePerformanceMetrics(duration);

            logger.debug('Seed mix optimization completed', {
                intent: intent.intent,
                confidence: intent.confidence,
                config: this.sanitizeConfigForLogging(config),
                duration
            });

            return config;

        } catch (error) {
            logger.error('Seed mix optimization failed', { 
                error: error instanceof Error ? error.message : String(error),
                intent: intent.intent 
            });
            return this.getDefaultConfig();
        }
    }

    /**
     * Apply early-stop mechanism to search results
     */
    applyEarlyStop(results: SearchResult[], config: SeedMixConfig): SearchResult[] {
        const startTime = Date.now();
        
        try {
            if (results.length <= config.earlyStopThreshold) {
                return results;
            }

            // Sort results by score (descending)
            const sortedResults = [...results].sort((a, b) => b.score - a.score);

            // Calculate early-stop criteria
            const shouldEarlyStop = this.shouldApplyEarlyStop(sortedResults, config);
            
            if (shouldEarlyStop) {
                const truncatedResults = sortedResults.slice(0, config.earlyStopThreshold);
                this.metrics.earlyStopActivations++;
                
                logger.debug('Early stop applied', {
                    originalCount: results.length,
                    truncatedCount: truncatedResults.length,
                    threshold: config.earlyStopThreshold
                });
                
                return truncatedResults;
            }

            return sortedResults;

        } catch (error) {
            logger.error('Early stop application failed', { 
                error: error instanceof Error ? error.message : String(error) 
            });
            return results;
        } finally {
            this.metrics.totalResultsProcessed += results.length;
            const duration = Date.now() - startTime;
            this.updatePerformanceMetrics(duration);
        }
    }

    /**
     * Enhanced RRF with intent-aware weighting
     */
    reciprocalRankFusion(results: {
        vectorResults?: SearchResult[];
        bm25Results?: SearchResult[];
        memoryResults?: SearchResult[];
        symbolResults?: SearchResult[];
    }, config: SeedMixConfig, limit: number = 10): SearchResult[] {
        const k = 60; // RRF constant
        const scores = new Map<string, SearchResult>();

        // Process each result type with its weight
        this.processResultsWithWeight(
            results.vectorResults || [], 
            'vector', 
            config.vectorWeight, 
            k, 
            scores
        );
        
        this.processResultsWithWeight(
            results.bm25Results || [], 
            'bm25', 
            config.bm25Weight, 
            k, 
            scores
        );
        
        this.processResultsWithWeight(
            results.memoryResults || [], 
            'memory', 
            config.memoryWeight, 
            k, 
            scores
        );
        
        this.processResultsWithWeight(
            results.symbolResults || [], 
            'symbol', 
            config.symbolWeight, 
            k, 
            scores
        );

        // Convert to array and sort
        const fusedResults = Array.from(scores.values())
            .sort((a, b) => {
                // Primary sort by score
                if (b.score !== a.score) {
                    return b.score - a.score;
                }

                // Secondary sort by rank stability
                const aRankStability = this.calculateRankStability(a);
                const bRankStability = this.calculateRankStability(b);
                return bRankStability - aRankStability;
            })
            .slice(0, limit);

        return fusedResults;
    }

    /**
     * Process results with weighted scoring
     */
    private processResultsWithWeight(
        items: SearchResult[], 
        source: string, 
        weight: number, 
        k: number, 
        scores: Map<string, SearchResult>
    ): void {
        items.forEach((item, index) => {
            if (!item || typeof item.id === 'undefined') {
                return;
            }

            const rankContribution = weight / (k + index + 1);
            const existing = scores.get(item.id) || this.createEmptyResult(item.id);

            existing.score += rankContribution;
            this.updateRankInfo(existing, source, index, item);

            scores.set(item.id, existing);
        });
    }

    /**
     * Create empty result structure
     */
    private createEmptyResult(id: string): SearchResult {
        return {
            id,
            score: 0,
            vectorRank: undefined,
            bm25Rank: undefined,
            memoryRank: undefined,
            symbolRank: undefined,
            vectorScore: undefined,
            bm25Score: undefined,
            memoryScore: undefined,
            symbolScore: undefined
        };
    }

    /**
     * Update rank information for result
     */
    private updateRankInfo(existing: SearchResult, source: string, index: number, item: SearchResult): void {
        switch (source) {
            case 'vector':
                existing.vectorRank = index;
                existing.vectorScore = item.score;
                break;
            case 'bm25':
                existing.bm25Rank = index;
                existing.bm25Score = item.score;
                break;
            case 'memory':
                existing.memoryRank = index;
                existing.memoryScore = item.score;
                break;
            case 'symbol':
                existing.symbolRank = index;
                existing.symbolScore = item.score;
                break;
        }
        
        // Copy other metadata
        if (item.path) existing.path = item.path;
        if (item.content) existing.content = item.content;
        if (item.metadata) existing.metadata = item.metadata;
    }

    /**
     * Calculate rank stability for tie-breaking
     */
    private calculateRankStability(result: SearchResult): number {
        const ranks = [
            result.vectorRank,
            result.bm25Rank,
            result.memoryRank,
            result.symbolRank
        ].filter(rank => typeof rank === 'number') as number[];

        if (ranks.length === 0) return 0;
        
        // Lower variance = higher stability
        const mean = ranks.reduce((sum, rank) => sum + rank, 0) / ranks.length;
        const variance = ranks.reduce((sum, rank) => sum + Math.pow(rank - mean, 2), 0) / ranks.length;
        
        return 1 / (1 + variance); // Convert to stability score
    }

    /**
     * Determine if early stop should be applied
     */
    private shouldApplyEarlyStop(results: SearchResult[], config: SeedMixConfig): boolean {
        if (results.length <= config.earlyStopThreshold) {
            return false;
        }

        // Check if there's a significant score drop
        const topScore = results[0]?.score || 0;
        const thresholdScore = results[config.earlyStopThreshold - 1]?.score || 0;
        
        // Handle edge case where topScore is 0
        if (topScore === 0) {
            return false;
        }
        
        const scoreDropRatio = thresholdScore / topScore;

        // Apply early stop if score drop is significant (>70% drop)
        return scoreDropRatio < 0.3;
    }

    /**
     * Get confidence level category
     */
    private getConfidenceLevel(confidence: number): 'low' | 'medium' | 'high' {
        if (confidence < 0.4) return 'low';
        if (confidence < 0.7) return 'medium';
        return 'high';
    }

    /**
     * Apply policy-based overrides to configuration
     */
    private applyPolicyOverrides(config: SeedMixConfig, policy: PolicyDecision): SeedMixConfig {
        const adjusted = { ...config };

        // Override depth controls
        if (policy.maxDepth !== undefined) {
            adjusted.maxDepth = Math.min(config.maxDepth, policy.maxDepth);
        }

        if (policy.earlyStopThreshold !== undefined) {
            adjusted.earlyStopThreshold = Math.min(config.earlyStopThreshold, policy.earlyStopThreshold);
        }

        // Apply seed weight adjustments from policy
        if (policy.seedWeights) {
            // Map policy weights to seed mix weights
            if (policy.seedWeights.definition) {
                adjusted.symbolWeight *= policy.seedWeights.definition;
            }
            if (policy.seedWeights.config) {
                adjusted.bm25Weight *= policy.seedWeights.config;
            }
            if (policy.seedWeights.handler) {
                adjusted.memoryWeight *= policy.seedWeights.handler;
            }
        }

        return adjusted;
    }

    /**
     * Apply confidence multiplier to weights
     */
    private applyConfidenceMultiplier(config: SeedMixConfig, confidence: number): SeedMixConfig {
        const adjusted = { ...config };
        const multiplier = 0.7 + (confidence * 0.3); // More conservative multiplier

        adjusted.vectorWeight = Math.min(5.0, adjusted.vectorWeight * multiplier);
        adjusted.bm25Weight = Math.min(5.0, adjusted.bm25Weight * multiplier);
        adjusted.memoryWeight = Math.min(5.0, adjusted.memoryWeight * multiplier);
        adjusted.symbolWeight = Math.min(5.0, adjusted.symbolWeight * multiplier);

        return adjusted;
    }

    /**
     * Validate configuration constraints
     */
    private validateConfig(config: SeedMixConfig): void {
        if (config.maxDepth < 1 || config.maxDepth > 10) {
            throw new Error(`Invalid maxDepth: ${config.maxDepth}. Must be between 1 and 10.`);
        }

        if (config.earlyStopThreshold < 1 || config.earlyStopThreshold > 50) {
            throw new Error(`Invalid earlyStopThreshold: ${config.earlyStopThreshold}. Must be between 1 and 50.`);
        }

        const weights = [config.vectorWeight, config.bm25Weight, config.memoryWeight, config.symbolWeight];
        for (const weight of weights) {
            if (weight < 0 || weight > 5) {
                throw new Error(`Invalid weight: ${weight}. Must be between 0 and 5.`);
            }
        }
    }

    /**
     * Get default configuration fallback
     */
    private getDefaultConfig(): SeedMixConfig {
        return {
            vectorWeight: 1.0,
            bm25Weight: 1.0,
            memoryWeight: 1.0,
            symbolWeight: 1.0,
            maxDepth: 2,
            earlyStopThreshold: 10,
            confidenceMultiplier: 1.0
        };
    }

    /**
     * Generate cache key for configuration
     */
    private generateCacheKey(intent: IntentResult, policy: PolicyDecision): string {
        return `${intent.intent}-${intent.confidence.toFixed(2)}-${policy.maxDepth}-${policy.earlyStopThreshold}`;
    }

    /**
     * Cache configuration with size management
     */
    private cacheConfiguration(key: string, config: SeedMixConfig): void {
        // Remove oldest entries if cache is full
        if (this.performanceCache.size >= this.maxCacheSize) {
            const oldestKey = this.performanceCache.keys().next().value;
            if (oldestKey) {
                this.performanceCache.delete(oldestKey);
            }
        }

        this.performanceCache.set(key, {
            config: { ...config },
            timestamp: Date.now()
        });
    }

    /**
     * Calculate cache hit rate
     */
    private calculateCacheHitRate(): number {
        const totalCacheOperations = this.metrics.cacheHits + this.metrics.cacheMisses;
        return totalCacheOperations > 0 ? this.metrics.cacheHits / totalCacheOperations : 0;
    }

    /**
     * Update performance metrics
     */
    private updatePerformanceMetrics(duration: number): void {
        const currentAvg = this.metrics.averageProcessingTime;
        const count = this.metrics.totalResultsProcessed;
        this.metrics.averageProcessingTime = (currentAvg * count + duration) / (count + 1);
    }

    /**
     * Sanitize config for logging (remove sensitive data)
     */
    private sanitizeConfigForLogging(config: SeedMixConfig): any {
        return {
            vectorWeight: config.vectorWeight,
            bm25Weight: config.bm25Weight,
            memoryWeight: config.memoryWeight,
            symbolWeight: config.symbolWeight,
            maxDepth: config.maxDepth,
            earlyStopThreshold: config.earlyStopThreshold
        };
    }

    /**
     * Get current performance metrics
     */
    getPerformanceMetrics(): PerformanceMetrics {
        return { ...this.metrics };
    }

    /**
     * Reset performance metrics
     */
    resetMetrics(): void {
        this.metrics.totalResultsProcessed = 0;
        this.metrics.earlyStopActivations = 0;
        this.metrics.averageProcessingTime = 0;
        this.metrics.cacheHitRate = 0;
        this.metrics.cacheHits = 0;
        this.metrics.cacheMisses = 0;
        this.metrics.intentDistribution = {};
    }

    /**
     * Clear performance cache
     */
    clearCache(): void {
        this.performanceCache.clear();
        logger.info('SeedMixOptimizer cache cleared');
    }
}

// Export singleton instance
export const seedMixOptimizer = new SeedMixOptimizer();