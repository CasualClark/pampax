/**
 * Cached BFS Traversal Engine with automatic caching
 *
 * Extends the base BFS traversal engine with intelligent caching for
 * performance optimization in repeated graph queries.
 */
import { BFSTraversalEngine } from './graph-traversal.js';
import { TraversalCacheManager } from './cache-manager.js';
/**
 * Cached BFS Traversal Engine with automatic caching
 */
export class CachedBFSTraversalEngine extends BFSTraversalEngine {
    cache;
    constructor(storage, defaultTokenBudget = 4000) {
        super(storage, defaultTokenBudget);
        this.cache = new TraversalCacheManager();
    }
    /**
     * Expand graph with caching
     */
    async expandGraph(expansion) {
        // Try cache first
        const cached = this.cache.get(expansion);
        if (cached) {
            return cached;
        }
        // Perform traversal
        const result = await super.expandGraph(expansion);
        // Cache the result
        this.cache.set(expansion, result);
        return result;
    }
    /**
     * Get cache statistics
     */
    getCacheStats() {
        return this.cache.getStats();
    }
    /**
     * Clear cache
     */
    clearCache() {
        this.cache.clear();
    }
    /**
     * Invalidate cache for specific nodes
     */
    invalidateCacheForNodes(nodeIds) {
        this.cache.invalidateForNodes(nodeIds);
    }
    /**
     * Cleanup resources
     */
    destroy() {
        this.cache.destroy();
    }
}
