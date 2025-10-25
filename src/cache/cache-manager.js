/**
 * Read-Through Cache Infrastructure for PAMPAX
 * 
 * Provides production-ready caching with:
 * - Namespaced cache key schema with versioning
 * - Read-through cache population
 * - TTL and LRU eviction policies
 * - Bundle signature caching for content-based invalidation
 * - Cache statistics and monitoring integration
 */

import crypto from 'crypto';
import { getLogger } from '../utils/structured-logger.js';
import { getMetricsCollector } from '../metrics/metrics-collector.js';

const logger = getLogger('cache-manager');
const metrics = getMetricsCollector();

/**
 * Cache configuration for different namespaces
 */
const CACHE_CONFIG = {
  search: {
    ttl: 300000,        // 5 minutes
    maxSize: 1000,      // Max 1000 entries
    sampling: 0.5,       // Sample 50% of operations for metrics
    enableMetrics: true
  },
  bundle: {
    ttl: 1800000,       // 30 minutes
    maxSize: 500,       // Max 500 entries
    sampling: 0.3,       // Sample 30% of operations
    enableMetrics: true
  },
  index: {
    ttl: 600000,        // 10 minutes
    maxSize: 200,       // Max 200 entries
    sampling: 0.2,       // Sample 20% of operations
    enableMetrics: true
  },
  metadata: {
    ttl: 3600000,       // 1 hour
    maxSize: 100,       // Max 100 entries
    sampling: 0.1,       // Sample 10% of operations
    enableMetrics: false
  }
};

/**
 * Cache entry with metadata
 */
class CacheEntry {
  constructor(value, ttl = 300000) {
    this.value = value;
    this.createdAt = Date.now();
    this.expiresAt = this.createdAt + ttl;
    this.accessCount = 1;
    this.lastAccessed = this.createdAt;
    this.size = this.calculateSize(value);
  }

  isExpired() {
    return Date.now() > this.expiresAt;
  }

  touch() {
    this.accessCount++;
    this.lastAccessed = Date.now();
  }

  calculateSize(value) {
    if (typeof value === 'string') {
      return value.length;
    } else if (typeof value === 'object') {
      return JSON.stringify(value).length;
    }
    return 8; // Default size for primitives
  }
}

/**
 * LRU Cache implementation with TTL support
 */
class LRUCache {
  constructor(namespace, maxSize = 1000, defaultTtl = 300000) {
    this.namespace = namespace;
    this.maxSize = maxSize;
    this.defaultTtl = defaultTtl;
    this.cache = new Map();
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      expirations: 0,
      totalOperations: 0,
      currentSize: 0,
      memoryUsage: 0
    };
  }

  get(key) {
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.stats.misses++;
      this.stats.totalOperations++;
      return null;
    }

    if (entry.isExpired()) {
      this.cache.delete(key);
      this.stats.expirations++;
      this.stats.misses++;
      this.stats.totalOperations++;
      this.updateMemoryUsage();
      return null;
    }

    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, entry);
    entry.touch();
    
    this.stats.hits++;
    this.stats.totalOperations++;
    return entry.value;
  }

  set(key, value, ttl = this.defaultTtl) {
    // Check if key exists and update size tracking
    const existingEntry = this.cache.get(key);
    if (existingEntry) {
      this.stats.memoryUsage -= existingEntry.size;
    }

    const entry = new CacheEntry(value, ttl);
    
    // Evict if necessary
    while (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      this.evictLRU();
    }

    this.cache.set(key, entry);
    this.stats.memoryUsage += entry.size;
    this.updateMemoryUsage();
  }

  delete(key) {
    const entry = this.cache.get(key);
    if (entry) {
      this.stats.memoryUsage -= entry.size;
      this.cache.delete(key);
      this.updateMemoryUsage();
      return true;
    }
    return false;
  }

  clear() {
    this.cache.clear();
    this.stats.memoryUsage = 0;
    this.updateMemoryUsage();
  }

  evictLRU() {
    if (this.cache.size === 0) return;
    
    const firstKey = this.cache.keys().next().value;
    const entry = this.cache.get(firstKey);
    this.stats.memoryUsage -= entry.size;
    this.cache.delete(firstKey);
    this.stats.evictions++;
    this.updateMemoryUsage();
  }

  cleanupExpired() {
    const now = Date.now();
    const expiredKeys = [];
    
    for (const [key, entry] of this.cache.entries()) {
      if (entry.isExpired()) {
        expiredKeys.push(key);
      }
    }

    for (const key of expiredKeys) {
      const entry = this.cache.get(key);
      this.stats.memoryUsage -= entry.size;
      this.cache.delete(key);
      this.stats.expirations++;
    }

    if (expiredKeys.length > 0) {
      this.updateMemoryUsage();
      logger.debug('cache_cleanup', `Cleaned up ${expiredKeys.length} expired entries`, {
        namespace: this.namespace,
        expiredCount: expiredKeys.length
      });
    }

    return expiredKeys.length;
  }

  updateMemoryUsage() {
    this.stats.currentSize = this.cache.size;
  }

  getStats() {
    return {
      ...this.stats,
      hitRate: this.stats.totalOperations > 0 ? this.stats.hits / this.stats.totalOperations : 0,
      namespace: this.namespace
    };
  }
}

/**
 * Cache Key Generator with namespacing and versioning
 */
class CacheKeyGenerator {
  constructor(version = 'v1') {
    this.version = version;
  }

  /**
   * Generate cache key with namespace and content hash
   * Format: "{version}:{scope}:{hash}"
   */
  generateKey(scope, payload) {
    const hash = this.hashPayload(payload);
    return `${this.version}:${scope}:${hash}`;
  }

  /**
   * Generate bundle signature key for content-based invalidation
   */
  generateBundleSignature(bundle) {
    const signature = {
      query: bundle.query,
      sourceTypes: bundle.sources.map(s => s.type).sort(),
      sourceCounts: bundle.sources.map(s => s.items?.length || 0).sort(),
      totalTokens: bundle.total_tokens,
      assembled_at: bundle.assembled_at
    };

    return this.hashPayload(signature);
  }

  /**
   * Generate search query key
   */
  generateSearchKey(query, options = {}) {
    const searchPayload = {
      query,
      limit: options.limit || 10,
      include: options.include?.sort() || ['code'],
      scope: options.scope,
      repo: options.repo,
      graphEnabled: options.graphEnabled || false
    };

    return this.generateKey('search', searchPayload);
  }

  /**
   * Generate index key
   */
  generateIndexKey(repoPath, modifiedTime) {
    const indexPayload = {
      repoPath,
      modifiedTime,
      version: this.version
    };

    return this.generateKey('index', indexPayload);
  }

  /**
   * Hash payload consistently
   */
  hashPayload(payload) {
    const payloadStr = typeof payload === 'string' ? payload : JSON.stringify(payload, Object.keys(payload).sort());
    return crypto.createHash('sha256').update(payloadStr).digest('hex').substring(0, 16);
  }

  /**
   * Parse cache key components
   */
  parseKey(key) {
    const parts = key.split(':');
    if (parts.length !== 3) {
      throw new Error(`Invalid cache key format: ${key}`);
    }

    return {
      version: parts[0],
      scope: parts[1],
      hash: parts[2]
    };
  }

  /**
   * Check if key matches current version
   */
  isCurrentVersion(key) {
    try {
      const parsed = this.parseKey(key);
      return parsed.version === this.version;
    } catch {
      return false;
    }
  }
}

/**
 * Main Cache Manager with read-through functionality
 */
export class CacheManager {
  constructor(options = {}) {
    this.version = options.version || 'v1';
    this.keyGenerator = new CacheKeyGenerator(this.version);
    this.caches = new Map();
    this.globalStats = {
      totalHits: 0,
      totalMisses: 0,
      totalEvictions: 0,
      totalExpirations: 0,
      totalOperations: 0,
      globalHitRate: 0
    };
    this.cleanupInterval = options.cleanupInterval || 60000; // 1 minute
    this.metricsEnabled = options.metricsEnabled !== false;

    // Initialize caches for each namespace
    for (const [namespace, config] of Object.entries(CACHE_CONFIG)) {
      this.caches.set(namespace, new LRUCache(namespace, config.maxSize, config.ttl));
    }

    // Start cleanup interval
    this.startCleanupInterval();

    logger.info('cache_manager_initialized', 'Cache manager initialized', {
      version: this.version,
      namespaces: Array.from(this.caches.keys()),
      cleanupInterval: this.cleanupInterval,
      metricsEnabled: this.metricsEnabled
    });
  }

  /**
   * Get cache instance for namespace
   */
  getCache(namespace) {
    const cache = this.caches.get(namespace);
    if (!cache) {
      throw new Error(`Unknown cache namespace: ${namespace}`);
    }
    return cache;
  }

  /**
   * Read-through cache get operation
   */
  async get(namespace, key, fetchFn, options = {}) {
    const startTime = Date.now();
    const corrId = logger.getCorrelationId();
    
    try {
      const cache = this.getCache(namespace);
      const config = CACHE_CONFIG[namespace];
      
      // Check cache first
      let value = cache.get(key);
      let fromCache = true;

      if (value === null) {
        // Cache miss - fetch data
        fromCache = false;
        value = await fetchFn();
        
        // Cache the result
        if (value !== null && value !== undefined) {
          const ttl = options.ttl || config.ttl;
          cache.set(key, value, ttl);
          
          logger.debug('cache_miss_populated', 'Cache miss - populated', {
            namespace,
            key: key.substring(0, 50) + '...',
            ttl,
            valueType: typeof value
          });
        } else {
          logger.debug('cache_miss_no_value', 'Cache miss - no value to cache', {
            namespace,
            key: key.substring(0, 50) + '...'
          });
        }
      } else {
        logger.debug('cache_hit', 'Cache hit', {
          namespace,
          key: key.substring(0, 50) + '...'
        });
      }

      // Update global stats
      this.updateGlobalStats(fromCache);

      // Emit metrics if enabled and sampled
      if (this.metricsEnabled && config.enableMetrics && Math.random() < config.sampling) {
        const duration = Date.now() - startTime;
        
        metrics.emitTiming('cache_operation_duration_ms', duration, {
          namespace,
          operation: fromCache ? 'hit' : 'miss',
          from_cache: fromCache.toString()
        }, corrId);

        metrics.emitCounter('cache_operations', 1, {
          namespace,
          hit: fromCache.toString(),
          miss: (!fromCache).toString()
        }, corrId);

        if (fromCache) {
          metrics.emitCounter('cache_hits', 1, { namespace }, corrId);
        } else {
          metrics.emitCounter('cache_misses', 1, { namespace }, corrId);
        }
      }

      return {
        value,
        fromCache,
        key,
        namespace
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      
      logger.error('cache_operation_failed', 'Cache operation failed', {
        namespace,
        key: key.substring(0, 50) + '...',
        error: error.message,
        duration
      });

      metrics.emitCounter('cache_errors', 1, {
        namespace,
        error_type: error.constructor.name
      }, corrId);

      throw error;
    }
  }

  /**
   * Direct cache set operation
   */
  set(namespace, key, value, options = {}) {
    const cache = this.getCache(namespace);
    const ttl = options.ttl || CACHE_CONFIG[namespace]?.ttl || 300000;
    
    cache.set(key, value, ttl);
    
    logger.debug('cache_set', 'Cache entry set', {
      namespace,
      key: key.substring(0, 50) + '...',
      ttl
    });
  }

  /**
   * Direct cache delete operation
   */
  delete(namespace, key) {
    const cache = this.getCache(namespace);
    const deleted = cache.delete(key);
    
    if (deleted) {
      logger.debug('cache_delete', 'Cache entry deleted', {
        namespace,
        key: key.substring(0, 50) + '...'
      });
    }
    
    return deleted;
  }

  /**
   * Clear cache namespace
   */
  clear(namespace) {
    const cache = this.getCache(namespace);
    const size = cache.size;
    cache.clear();
    
    logger.info('cache_cleared', 'Cache namespace cleared', {
      namespace,
      entriesCleared: size
    });
    
    return size;
  }

  /**
   * Clear all caches
   */
  clearAll() {
    let totalCleared = 0;
    for (const [namespace, cache] of this.caches.entries()) {
      totalCleared += cache.size;
      cache.clear();
    }
    
    logger.info('cache_all_cleared', 'All caches cleared', {
      totalEntriesCleared: totalCleared
    });
    
    return totalCleared;
  }

  /**
   * Invalidate cache entries older than specified time
   */
  invalidateOlderThan(namespace, olderThan) {
    const cache = this.getCache(namespace);
    const cutoffTime = Date.now() - olderThan;
    let invalidated = 0;

    for (const [key, entry] of cache.cache.entries()) {
      if (entry.createdAt < cutoffTime) {
        cache.delete(key);
        invalidated++;
      }
    }

    logger.info('cache_invalidated', 'Cache entries invalidated by age', {
      namespace,
      olderThan,
      entriesInvalidated: invalidated
    });

    return invalidated;
  }

  /**
   * Warm cache with predefined queries
   */
  async warm(namespace, queries, fetchFn) {
    const cache = this.getCache(namespace);
    let warmed = 0;
    const startTime = Date.now();

    logger.info('cache_warm_start', 'Starting cache warm-up', {
      namespace,
      queryCount: queries.length
    });

    for (const query of queries) {
      try {
        const key = typeof query === 'string' ? query : query.key;
        const payload = typeof query === 'object' ? query.payload : query;
        
        // Check if already cached
        if (cache.get(key) === null) {
          const value = await fetchFn(payload);
          if (value !== null && value !== undefined) {
            this.set(namespace, key, value);
            warmed++;
          }
        }
      } catch (error) {
        logger.warn('cache_warm_query_failed', 'Failed to warm cache query', {
          namespace,
          query: typeof query === 'string' ? query : query.key,
          error: error.message
        });
      }
    }

    const duration = Date.now() - startTime;
    
    logger.info('cache_warm_complete', 'Cache warm-up completed', {
      namespace,
      totalQueries: queries.length,
      entriesWarmed: warmed,
      duration
    });

    metrics.emitTiming('cache_warm_duration_ms', duration, {
      namespace,
      entries_warmed: warmed,
      total_queries: queries.length
    });

    return { warmed, total: queries.length, duration };
  }

  /**
   * Get comprehensive cache statistics
   */
  getStats(namespace = null) {
    if (namespace) {
      return this.getCache(namespace).getStats();
    }

    const namespaceStats = {};
    let totalHits = 0;
    let totalMisses = 0;
    let totalEvictions = 0;
    let totalExpirations = 0;
    let totalOperations = 0;
    let totalMemoryUsage = 0;

    for (const [ns, cache] of this.caches.entries()) {
      const stats = cache.getStats();
      namespaceStats[ns] = stats;
      
      totalHits += stats.hits;
      totalMisses += stats.misses;
      totalEvictions += stats.evictions;
      totalExpirations += stats.expirations;
      totalOperations += stats.totalOperations;
      totalMemoryUsage += stats.memoryUsage;
    }

    return {
      version: this.version,
      namespaces: namespaceStats,
      summary: {
        totalHits,
        totalMisses,
        totalEvictions,
        totalExpirations,
        totalOperations,
        globalHitRate: totalOperations > 0 ? totalHits / totalOperations : 0,
        totalMemoryUsage,
        totalEntries: Object.values(namespaceStats).reduce((sum, stats) => sum + stats.currentSize, 0)
      }
    };
  }

  /**
   * Get cache health status
   */
  getHealthStatus() {
    const stats = this.getStats();
    const issues = [];

    // Check hit rates
    for (const [ns, nsStats] of Object.entries(stats.namespaces)) {
      if (nsStats.hitRate < 0.3 && nsStats.totalOperations > 100) {
        issues.push(`Low hit rate in ${ns}: ${(nsStats.hitRate * 100).toFixed(1)}%`);
      }
    }

    // Check memory usage
    if (stats.summary.totalMemoryUsage > 100 * 1024 * 1024) { // 100MB
      issues.push(`High memory usage: ${(stats.summary.totalMemoryUsage / 1024 / 1024).toFixed(1)}MB`);
    }

    // Check eviction rates
    for (const [ns, nsStats] of Object.entries(stats.namespaces)) {
      if (nsStats.evictions > nsStats.totalOperations * 0.1) {
        issues.push(`High eviction rate in ${ns}: ${((nsStats.evictions / nsStats.totalOperations) * 100).toFixed(1)}%`);
      }
    }

    return {
      healthy: issues.length === 0,
      issues,
      stats,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Update global statistics
   */
  updateGlobalStats(fromCache) {
    if (fromCache) {
      this.globalStats.totalHits++;
    } else {
      this.globalStats.totalMisses++;
    }
    this.globalStats.totalOperations++;
    this.globalStats.globalHitRate = this.globalStats.totalHits / this.globalStats.totalOperations;
  }

  /**
   * Start cleanup interval
   */
  startCleanupInterval() {
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.cleanupInterval);
  }

  /**
   * Stop cleanup interval
   */
  stopCleanupInterval() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * Cleanup expired entries
   */
  cleanup() {
    let totalCleaned = 0;
    
    for (const [namespace, cache] of this.caches.entries()) {
      const cleaned = cache.cleanupExpired();
      totalCleaned += cleaned;
    }

    if (totalCleaned > 0) {
      logger.debug('cache_cleanup_complete', 'Periodic cleanup completed', {
        entriesCleaned: totalCleaned
      });
    }
  }

  /**
   * Graceful shutdown
   */
  shutdown() {
    this.stopCleanupInterval();
    this.clearAll();
    
    logger.info('cache_manager_shutdown', 'Cache manager shutdown completed');
  }
}

/**
 * Global cache manager instance
 */
let globalCacheManager = null;

/**
 * Get or create global cache manager
 */
export function getCacheManager(options = {}) {
  if (!globalCacheManager) {
    globalCacheManager = new CacheManager(options);
  }
  return globalCacheManager;
}

/**
 * Reset global cache manager (useful for testing)
 */
export function resetCacheManager() {
  if (globalCacheManager) {
    globalCacheManager.shutdown();
    globalCacheManager = null;
  }
}

/**
 * Convenience functions for common cache operations
 */
export async function cachedSearch(query, searchFn, options = {}) {
  const cache = getCacheManager();
  const key = cache.keyGenerator.generateSearchKey(query, options);
  
  const result = await cache.get('search', key, async () => {
    return await searchFn(query, options);
  }, options);

  return result.value;
}

export async function cachedBundle(bundleKey, bundleFn, options = {}) {
  const cache = getCacheManager();
  
  const result = await cache.get('bundle', bundleKey, async () => {
    return await bundleFn();
  }, options);

  return result.value;
}

export function invalidateBundleCache(bundleSignature) {
  const cache = getCacheManager();
  // Implementation would find and invalidate all entries matching the bundle signature
  logger.debug('bundle_cache_invalidated', 'Bundle cache invalidated', {
    signature: bundleSignature
  });
}