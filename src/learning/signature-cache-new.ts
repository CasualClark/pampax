import { logger } from '../config/logger.js';

/**
 * Cache entry for storing successful query→bundle patterns
 */
export interface CacheEntry {
  querySignature: string;
  bundleId: string;
  satisfaction: number;
  usageCount: number;
  createdAt: number;
  lastUsed: number;
  ttl: number;
}

/**
 * Cache statistics for monitoring performance
 */
export interface CacheStats {
  hitRate: number;
  totalRequests: number;
  cacheHits: number;
  cacheMisses: number;
  entries: number;
}

/**
 * Configuration options for the signature cache
 */
export interface SignatureCacheConfig {
  maxSize: number;
  defaultTtl: number;
  cleanupInterval: number;
  satisfactionThreshold: number;
}

/**
 * Signature Cache - Stores successful query→bundle patterns for fast retrieval
 * 
 * This class implements an efficient caching system with LRU eviction, TTL management,
 * and satisfaction-based filtering to cache only high-performing search patterns.
 */
export class SignatureCache {
  private cache: Map<string, CacheEntry> = new Map();
  private accessOrder: string[] = [];
  private config: SignatureCacheConfig;
  private stats: CacheStats = {
    hitRate: 0,
    totalRequests: 0,
    cacheHits: 0,
    cacheMisses: 0,
    entries: 0
  };
  private cleanupTimer?: NodeJS.Timeout;

  constructor(config: Partial<SignatureCacheConfig> = {}) {
    this.config = {
      maxSize: 1000,
      defaultTtl: 7 * 24 * 60 * 60 * 1000, // 7 days
      cleanupInterval: 60 * 60 * 1000, // 1 hour
      satisfactionThreshold: 0.8,
      ...config
    };

    // Start periodic cleanup
    this.startCleanupTimer();
    
    logger.debug('SignatureCache initialized', {
      maxSize: this.config.maxSize,
      defaultTtl: this.config.defaultTtl,
      satisfactionThreshold: this.config.satisfactionThreshold
    }, 'signature-cache');
  }

  /**
   * Retrieve a cache entry by query signature
   */
  async get(querySignature: string): Promise<CacheEntry | null> {
    const startTime = Date.now();
    
    try {
      this.stats.totalRequests++;
      
      const entry = this.cache.get(querySignature);
      
      if (!entry) {
        this.stats.cacheMisses++;
        this.updateHitRate();
        return null;
      }

      // Check if entry has expired
      const now = Date.now();
      if (now - entry.createdAt > entry.ttl) {
        this.cache.delete(querySignature);
        this.removeFromAccessOrder(querySignature);
        this.stats.cacheMisses++;
        this.updateHitRate();
        this.stats.entries = this.cache.size;
        
        logger.debug('Cache entry expired and removed', {
          querySignature,
          age: now - entry.createdAt,
          ttl: entry.ttl
        }, 'signature-cache');
        
        return null;
      }

      // Update usage statistics
      entry.usageCount++;
      entry.lastUsed = now;
      this.updateAccessOrder(querySignature);
      
      this.stats.cacheHits++;
      this.updateHitRate();
      
      const lookupTime = Date.now() - startTime;
      logger.debug('Cache hit', {
        querySignature,
        usageCount: entry.usageCount,
        lookupTime
      }, 'signature-cache');

      return entry;
    } catch (error) {
      logger.error('Error during cache get', {
        querySignature,
        error: error instanceof Error ? error.message : String(error)
      }, 'signature-cache');
      this.stats.cacheMisses++;
      this.updateHitRate();
      return null;
    }
  }

  /**
   * Store a cache entry if it meets satisfaction threshold
   */
  async set(entry: CacheEntry): Promise<void> {
    try {
      // Only cache entries above satisfaction threshold
      if (entry.satisfaction < this.config.satisfactionThreshold) {
        logger.debug('Entry below satisfaction threshold, not caching', {
          querySignature: entry.querySignature,
          satisfaction: entry.satisfaction,
          threshold: this.config.satisfactionThreshold
        }, 'signature-cache');
        return;
      }

      // Ensure TTL is set
      if (entry.ttl === 0) {
        entry.ttl = this.config.defaultTtl;
      }

      // Set timestamps if not provided
      const now = Date.now();
      if (entry.createdAt === 0) {
        entry.createdAt = now;
      }
      if (entry.lastUsed === 0) {
        entry.lastUsed = now;
      }

      // Check if we need to evict entries (LRU)
      if (this.cache.size >= this.config.maxSize && !this.cache.has(entry.querySignature)) {
        this.evictLRU();
      }

      // Store the entry
      this.cache.set(entry.querySignature, entry);
      this.updateAccessOrder(entry.querySignature);
      this.stats.entries = this.cache.size;

      logger.debug('Entry cached', {
        querySignature: entry.querySignature,
        bundleId: entry.bundleId,
        satisfaction: entry.satisfaction,
        cacheSize: this.cache.size
      }, 'signature-cache');
    } catch (error) {
      logger.error('Error during cache set', {
        querySignature: entry.querySignature,
        error: error instanceof Error ? error.message : String(error)
      }, 'signature-cache');
    }
  }

  /**
   * Invalidate cache entries by pattern or all entries
   */
  async invalidate(pattern?: string): Promise<void> {
    try {
      if (!pattern) {
        // Clear all entries
        const clearedCount = this.cache.size;
        this.cache.clear();
        this.accessOrder = [];
        this.stats.entries = 0;
        
        logger.info('All cache entries invalidated', {
          clearedCount
        }, 'signature-cache');
        return;
      }

      // Remove entries matching pattern
      const keysToRemove: string[] = [];
      for (const key of this.cache.keys()) {
        if (key.includes(pattern)) {
          keysToRemove.push(key);
        }
      }

      for (const key of keysToRemove) {
        this.cache.delete(key);
        this.removeFromAccessOrder(key);
      }

      this.stats.entries = this.cache.size;

      logger.info('Cache entries invalidated by pattern', {
        pattern,
        invalidatedCount: keysToRemove.length,
        remainingCount: this.cache.size
      }, 'signature-cache');
    } catch (error) {
      logger.error('Error during cache invalidation', {
        pattern,
        error: error instanceof Error ? error.message : String(error)
      }, 'signature-cache');
    }
  }

  /**
   * Get current cache statistics
   */
  async getStats(): Promise<CacheStats> {
    return { ...this.stats };
  }

  /**
   * Clean up expired entries
   */
  async cleanup(): Promise<void> {
    try {
      const now = Date.now();
      const keysToRemove: string[] = [];
      
      for (const [key, entry] of this.cache.entries()) {
        if (now - entry.createdAt > entry.ttl) {
          keysToRemove.push(key);
        }
      }

      for (const key of keysToRemove) {
        this.cache.delete(key);
        this.removeFromAccessOrder(key);
      }

      this.stats.entries = this.cache.size;

      if (keysToRemove.length > 0) {
        logger.debug('Cleaned up expired entries', {
          removedCount: keysToRemove.length,
          remainingCount: this.cache.size
        }, 'signature-cache');
      }
    } catch (error) {
      logger.error('Error during cache cleanup', {
        error: error instanceof Error ? error.message : String(error)
      }, 'signature-cache');
    }
  }

  /**
   * Destroy the cache and stop cleanup timer
   */
  async destroy(): Promise<void> {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
    
    this.cache.clear();
    this.accessOrder = [];
    this.stats.entries = 0;
    
    logger.info('SignatureCache destroyed', {}, 'signature-cache');
  }

  /**
   * Update the access order for LRU tracking
   */
  private updateAccessOrder(querySignature: string): void {
    this.removeFromAccessOrder(querySignature);
    this.accessOrder.push(querySignature);
  }

  /**
   * Remove an entry from the access order array
   */
  private removeFromAccessOrder(querySignature: string): void {
    const index = this.accessOrder.indexOf(querySignature);
    if (index > -1) {
      this.accessOrder.splice(index, 1);
    }
  }

  /**
   * Evict the least recently used entry
   */
  private evictLRU(): void {
    if (this.accessOrder.length === 0) {
      return;
    }

    const lruKey = this.accessOrder[0];
    this.cache.delete(lruKey);
    this.accessOrder.shift();
    this.stats.entries = this.cache.size;

    logger.debug('LRU eviction', {
      evictedKey: lruKey,
      cacheSize: this.cache.size
    }, 'signature-cache');
  }

  /**
   * Update the hit rate calculation
   */
  private updateHitRate(): void {
    if (this.stats.totalRequests === 0) {
      this.stats.hitRate = 0;
    } else {
      this.stats.hitRate = this.stats.cacheHits / this.stats.totalRequests;
    }
  }

  /**
   * Start the periodic cleanup timer
   */
  private startCleanupTimer(): void {
    if (this.config.cleanupInterval > 0) {
      this.cleanupTimer = setInterval(() => {
        this.cleanup().catch(error => {
          logger.error('Periodic cleanup failed', {
            error: error instanceof Error ? error.message : String(error)
          }, 'signature-cache');
        });
      }, this.config.cleanupInterval);
    }
  }
}