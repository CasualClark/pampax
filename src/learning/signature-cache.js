import { logger } from '../config/logger.js';

/**
 * Simple Signature Cache for CLI learning
 * 
 * This is a minimal JavaScript implementation that caches bundle signatures
 * to improve retrieval performance based on usage patterns.
 */
export class SignatureCache {
  constructor(config = {}) {
    this.config = {
      maxSize: config.maxSize || 1000,
      defaultTtl: config.defaultTtl || 7 * 24 * 60 * 60 * 1000, // 7 days
      cleanupInterval: config.cleanupInterval || 60 * 60 * 1000, // 1 hour
      satisfactionThreshold: config.satisfactionThreshold || 0.7,
      ...config
    };
    
    this.cache = new Map();
    this.accessOrder = new Map(); // Track LRU order
    this.stats = {
      totalRequests: 0,
      cacheHits: 0,
      cacheMisses: 0,
      hitRate: 0,
      entries: 0
    };
    
    this.cleanupTimer = null;
    this.startCleanupTimer();
  }

  /**
   * Start automatic cleanup timer
   */
  startCleanupTimer() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.config.cleanupInterval);
  }

  /**
   * Stop cleanup timer
   */
  stopCleanupTimer() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * Get cache entry by query signature
   */
  async get(querySignature) {
    this.stats.totalRequests++;
    
    const entry = this.cache.get(querySignature);
    if (!entry) {
      this.stats.cacheMisses++;
      this.updateHitRate();
      return null;
    }
    
    // Check if entry is expired
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(querySignature);
      this.accessOrder.delete(querySignature);
      this.stats.cacheMisses++;
      this.stats.entries = this.cache.size;
      this.updateHitRate();
      return null;
    }
    
    // Update access order for LRU
    this.accessOrder.set(querySignature, Date.now());
    this.stats.cacheHits++;
    this.updateHitRate();
    
    // Update last used time
    entry.lastUsed = Date.now();
    entry.usageCount++;
    
    logger.debug('Cache hit', {
      querySignature,
      usageCount: entry.usageCount,
      satisfaction: entry.satisfaction
    }, 'signature-cache');
    
    return entry;
  }

  /**
   * Set cache entry
   */
  async set(entry) {
    const querySignature = entry.querySignature;
    const now = Date.now();
    
    // Ensure entry has required fields
    const cacheEntry = {
      querySignature,
      bundleId: entry.bundleId || querySignature,
      satisfaction: entry.satisfaction || 0.5,
      usageCount: entry.usageCount || 1,
      createdAt: entry.createdAt || now,
      lastUsed: entry.lastUsed || now,
      ttl: entry.ttl || this.config.defaultTtl,
      expiresAt: now + (entry.ttl || this.config.defaultTtl),
      ...entry
    };
    
    // Check if we need to evict entries
    if (this.cache.size >= this.config.maxSize && !this.cache.has(querySignature)) {
      this.evictLRU();
    }
    
    this.cache.set(querySignature, cacheEntry);
    this.accessOrder.set(querySignature, now);
    this.stats.entries = this.cache.size;
    
    logger.debug('Cache entry added', {
      querySignature,
      satisfaction: cacheEntry.satisfaction,
      ttl: cacheEntry.ttl
    }, 'signature-cache');
  }

  /**
   * Update cache entry
   */
  async update(querySignature, updates) {
    const entry = this.cache.get(querySignature);
    if (!entry) {
      return false;
    }
    
    const updatedEntry = {
      ...entry,
      ...updates,
      lastUsed: Date.now()
    };
    
    this.cache.set(querySignature, updatedEntry);
    this.accessOrder.set(querySignature, Date.now());
    
    logger.debug('Cache entry updated', {
      querySignature,
      updates: Object.keys(updates)
    }, 'signature-cache');
    
    return true;
  }

  /**
   * Delete cache entry
   */
  async delete(querySignature) {
    const deleted = this.cache.delete(querySignature);
    this.accessOrder.delete(querySignature);
    this.stats.entries = this.cache.size;
    
    if (deleted) {
      logger.debug('Cache entry deleted', { querySignature }, 'signature-cache');
    }
    
    return deleted;
  }

  /**
   * Clear all cache entries
   */
  async clear() {
    const size = this.cache.size;
    this.cache.clear();
    this.accessOrder.clear();
    this.stats.entries = 0;
    
    logger.info('Cache cleared', { entries: size }, 'signature-cache');
  }

  /**
   * Get cache statistics
   */
  async getStats() {
    return {
      ...this.stats,
      entries: this.cache.size,
      maxSize: this.config.maxSize,
      memoryUsage: this.estimateMemoryUsage()
    };
  }

  /**
   * Search cache entries by pattern
   */
  async search(pattern) {
    const results = [];
    const regex = new RegExp(pattern, 'i');
    
    for (const [querySignature, entry] of this.cache.entries()) {
      if (regex.test(querySignature) || regex.test(entry.bundleId)) {
        results.push({
          querySignature,
          ...entry
        });
      }
    }
    
    return results;
  }

  /**
   * Get top performing entries by satisfaction
   */
  async getTopPerforming(limit = 10) {
    const entries = Array.from(this.cache.entries())
      .map(([querySignature, entry]) => ({
        querySignature,
        ...entry
      }))
      .sort((a, b) => b.satisfaction - a.satisfaction)
      .slice(0, limit);
    
    return entries;
  }

  /**
   * Get least recently used entries
   */
  async getLRU(limit = 10) {
    const entries = Array.from(this.accessOrder.entries())
      .sort(([, timeA], [, timeB]) => timeA - timeB)
      .slice(0, limit)
      .map(([querySignature]) => ({
        querySignature,
        ...this.cache.get(querySignature)
      }));
    
    return entries;
  }

  /**
   * Cleanup expired entries
   */
  cleanup() {
    const now = Date.now();
    const expiredKeys = [];
    
    for (const [querySignature, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        expiredKeys.push(querySignature);
      }
    }
    
    for (const key of expiredKeys) {
      this.cache.delete(key);
      this.accessOrder.delete(key);
    }
    
    this.stats.entries = this.cache.size;
    
    if (expiredKeys.length > 0) {
      logger.info('Cleaned up expired entries', {
        expiredCount: expiredKeys.length,
        remainingEntries: this.cache.size
      }, 'signature-cache');
    }
  }

  /**
   * Evict least recently used entries
   */
  evictLRU() {
    const lruEntries = Array.from(this.accessOrder.entries())
      .sort(([, timeA], [, timeB]) => timeA - timeB)
      .slice(0, Math.ceil(this.config.maxSize * 0.1)); // Evict 10%
    
    for (const [querySignature] of lruEntries) {
      this.cache.delete(querySignature);
      this.accessOrder.delete(querySignature);
    }
    
    this.stats.entries = this.cache.size;
    
    logger.debug('Evicted LRU entries', {
      evictedCount: lruEntries.length,
      remainingEntries: this.cache.size
    }, 'signature-cache');
  }

  /**
   * Update cache hit rate
   */
  updateHitRate() {
    this.stats.hitRate = this.stats.totalRequests > 0 
      ? this.stats.cacheHits / this.stats.totalRequests 
      : 0;
  }

  /**
   * Estimate memory usage (rough approximation)
   */
  estimateMemoryUsage() {
    let totalSize = 0;
    
    for (const [querySignature, entry] of this.cache.entries()) {
      totalSize += querySignature.length * 2; // String characters
      totalSize += JSON.stringify(entry).length * 2; // Entry data
    }
    
    return totalSize;
  }

  /**
   * Destroy cache and cleanup resources
   */
  async destroy() {
    this.stopCleanupTimer();
    await this.clear();
    
    logger.info('Signature cache destroyed', {}, 'signature-cache');
  }
}