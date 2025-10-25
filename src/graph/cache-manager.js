/**
 * Cache Manager for Graph Traversal Results
 *
 * Provides intelligent caching with LRU eviction, TTL-based expiration,
 * and node-based invalidation for graph traversal results.
 */
import { logger } from '../config/logger.js';
/**
 * Traversal Cache Manager
 */
export class TraversalCacheManager {
    cache = new Map();
    maxCacheSize = 1000;
    maxAge = 5 * 60 * 1000; // 5 minutes
    cleanupInterval = null;
    constructor(maxCacheSize = 1000, maxAgeMinutes = 5) {
        this.maxCacheSize = maxCacheSize;
        this.maxAge = maxAgeMinutes * 60 * 1000;
        // Start periodic cleanup
        this.startCleanup();
    }
    /**
     * Generate cache key from expansion parameters
     */
    generateKey(expansion) {
        const keyData = {
            query: expansion.query,
            start_symbols: expansion.start_symbols.sort(),
            max_depth: expansion.max_depth,
            edge_types: expansion.edge_types.sort(),
            expansion_strategy: expansion.expansion_strategy
        };
        return JSON.stringify(keyData);
    }
    /**
     * Get cached traversal result
     */
    get(expansion) {
        const key = this.generateKey(expansion);
        const entry = this.cache.get(key);
        if (!entry)
            return null;
        // Check if entry is too old
        if (Date.now() - entry.timestamp > this.maxAge) {
            this.cache.delete(key);
            return null;
        }
        // Update access statistics
        entry.access_count++;
        entry.timestamp = Date.now();
        // Mark as cache hit
        const result = { ...entry.result, cache_hit: true };
        logger.debug('Cache hit for graph traversal', {
            query: expansion.query,
            accessCount: entry.access_count
        });
        return result;
    }
    /**
     * Store traversal result in cache
     */
    set(expansion, result) {
        const key = this.generateKey(expansion);
        // Check cache size limit
        if (this.cache.size >= this.maxCacheSize) {
            this.evictLeastUsed();
        }
        const entry = {
            result: { ...result, cache_hit: false },
            timestamp: Date.now(),
            access_count: 1
        };
        this.cache.set(key, entry);
        logger.debug('Cached graph traversal result', {
            query: expansion.query,
            edgesCount: result.edges.length,
            cacheSize: this.cache.size
        });
    }
    /**
     * Invalidate cache entries for specific nodes
     */
    invalidateForNodes(nodeIds) {
        let invalidated = 0;
        for (const [key, entry] of this.cache.entries()) {
            // Check if any of the specified nodes are in the traversal result
            const hasNode = nodeIds.some(nodeId => entry.result.visited_nodes.has(nodeId) ||
                entry.result.start_symbols.includes(nodeId));
            if (hasNode) {
                this.cache.delete(key);
                invalidated++;
            }
        }
        if (invalidated > 0) {
            logger.info('Invalidated cache entries for nodes', {
                nodeCount: nodeIds.length,
                invalidatedEntries: invalidated
            });
        }
    }
    /**
     * Clear all cache entries
     */
    clear() {
        const size = this.cache.size;
        this.cache.clear();
        logger.info('Cleared traversal cache', { size });
    }
    /**
     * Get cache statistics
     */
    getStats() {
        if (this.cache.size === 0) {
            return { size: 0, maxSize: this.maxCacheSize };
        }
        const timestamps = Array.from(this.cache.values()).map(e => e.timestamp);
        const totalAccess = Array.from(this.cache.values()).reduce((sum, e) => sum + e.access_count, 0);
        return {
            size: this.cache.size,
            maxSize: this.maxCacheSize,
            hitRate: totalAccess > 0 ? (totalAccess - this.cache.size) / totalAccess : 0,
            oldestEntry: Math.min(...timestamps),
            newestEntry: Math.max(...timestamps)
        };
    }
    /**
     * Evict least used entries
     */
    evictLeastUsed() {
        let oldestKey = '';
        let oldestTime = Infinity;
        let lowestAccess = Infinity;
        for (const [key, entry] of this.cache.entries()) {
            // Prefer entries with lowest access count, then oldest
            if (entry.access_count < lowestAccess ||
                (entry.access_count === lowestAccess && entry.timestamp < oldestTime)) {
                oldestKey = key;
                oldestTime = entry.timestamp;
                lowestAccess = entry.access_count;
            }
        }
        if (oldestKey) {
            this.cache.delete(oldestKey);
            logger.debug('Evicted least used cache entry', { key: oldestKey });
        }
    }
    /**
     * Start periodic cleanup
     */
    startCleanup() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
        this.cleanupInterval = setInterval(() => {
            this.cleanup();
        }, 60000); // Cleanup every minute
    }
    /**
     * Clean up expired entries
     */
    cleanup() {
        const now = Date.now();
        let cleaned = 0;
        for (const [key, entry] of this.cache.entries()) {
            if (now - entry.timestamp > this.maxAge) {
                this.cache.delete(key);
                cleaned++;
            }
        }
        if (cleaned > 0) {
            logger.debug('Cleaned up expired cache entries', { cleaned });
        }
    }
    /**
     * Stop cleanup interval
     */
    destroy() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
        this.clear();
    }
}
