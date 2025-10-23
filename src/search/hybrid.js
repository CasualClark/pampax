import { seedMixOptimizer } from './seed-mix-optimizer.js';

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
