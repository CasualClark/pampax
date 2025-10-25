/**
 * Cached Search Operations for PAMPAX
 * 
 * Integrates read-through caching with search operations:
 * - Hybrid search with caching
 * - Graph-enhanced search with caching
 * - Bundle assembly with caching
 * - Content-based cache invalidation
 */

import { getCacheManager } from '../cache/cache-manager.js';
import { GraphEnhancedSearchEngine } from './hybrid.js';
import { getLogger } from '../utils/structured-logger.js';
import { getMetricsCollector } from '../metrics/metrics-collector.js';

const logger = getLogger('cached-search');
const metrics = getMetricsCollector();

/**
 * Cached Search Engine wrapper
 */
export class CachedSearchEngine {
  constructor(storage, options = {}) {
    this.storage = storage;
    this.cache = getCacheManager(options.cache);
    this.graphEnabled = options.graphEnabled || false;
    this.graphEngine = null;
    this.defaultOptions = {
      limit: 10,
      includeContent: true,
      cacheEnabled: true,
      ttl: 300000, // 5 minutes default
      ...options
    };

    // Initialize graph engine if enabled
    if (this.graphEnabled) {
      this.initializeGraphEngine(options.graphOptions);
    }
  }

  /**
   * Initialize graph-enhanced search engine
   */
  async initializeGraphEngine(options = {}) {
    try {
      this.graphEngine = new GraphEnhancedSearchEngine(this.storage, options);
      logger.debug('graph_engine_initialized', 'Graph-enhanced search engine initialized');
    } catch (error) {
      logger.warn('graph_engine_init_failed', 'Failed to initialize graph engine', {
        error: error.message
      });
      this.graphEnabled = false;
    }
  }

  /**
   * Perform cached hybrid search
   */
  async search(query, options = {}) {
    const startTime = Date.now();
    const corrId = logger.getCorrelationId();
    
    const mergedOptions = { ...this.defaultOptions, ...options };
    
    try {
      if (!mergedOptions.cacheEnabled) {
        // Bypass cache if disabled
        return await this.performSearch(query, mergedOptions);
      }

      // Generate cache key
      const cacheKey = this.cache.keyGenerator.generateSearchKey(query, mergedOptions);
      
      // Use read-through cache
      const result = await this.cache.get('search', cacheKey, async () => {
        return await this.performSearch(query, mergedOptions);
      }, {
        ttl: mergedOptions.ttl
      });

      // Add cache metadata to results
      if (result.value && Array.isArray(result.value)) {
        result.value = result.value.map(item => ({
          ...item,
          _cached: result.fromCache,
          _cache_key: cacheKey
        }));
      }

      // Emit metrics
      const duration = Date.now() - startTime;
      metrics.emitTiming('cached_search_duration_ms', duration, {
        from_cache: result.fromCache.toString(),
        graph_enabled: this.graphEnabled.toString(),
        results_count: Array.isArray(result.value) ? result.value.length : 0
      }, corrId);

      metrics.emitCounter('cached_search_operations', 1, {
        hit: result.fromCache.toString(),
        miss: (!result.fromCache).toString()
      }, corrId);

      logger.debug('cached_search_completed', 'Cached search completed', {
        query,
        fromCache: result.fromCache,
        duration,
        resultCount: Array.isArray(result.value) ? result.value.length : 0
      });

      return result.value;

    } catch (error) {
      const duration = Date.now() - startTime;
      
      logger.error('cached_search_failed', 'Cached search failed', {
        query,
        error: error.message,
        duration
      });

      metrics.emitCounter('cached_search_errors', 1, {
        error_type: error.constructor.name
      }, corrId);

      throw error;
    }
  }

  /**
   * Perform the actual search operation
   */
  async performSearch(query, options) {
    if (this.graphEnabled && this.graphEngine && options.graphEnabled !== false) {
      // Use graph-enhanced search
      const vectorResults = await this.getVectorResults(query, options);
      const bm25Results = await this.getBm25Results(query, options);
      const memoryResults = await this.getMemoryResults(query, options);
      const symbolResults = await this.getSymbolResults(query, options);

      return await this.graphEngine.searchWithGraphExpansion({
        query,
        vectorResults,
        bm25Results,
        memoryResults,
        symbolResults,
        limit: options.limit,
        graphOptions: options.graphOptions,
        intent: options.intent,
        policy: options.policy
      });
    } else {
      // Use standard search
      return await this.storage.search(query, options);
    }
  }

  /**
   * Get vector search results
   */
  async getVectorResults(query, options) {
    try {
      if (this.storage.search) {
        return await this.storage.search(query, {
          limit: Math.floor(options.limit * 0.6),
          includeContent: options.includeContent
        });
      }
      return [];
    } catch (error) {
      logger.warn('vector_search_failed', 'Vector search failed', { error: error.message });
      return [];
    }
  }

  /**
   * Get BM25 search results
   */
  async getBm25Results(query, options) {
    try {
      if (this.storage.searchBM25) {
        return await this.storage.searchBM25(query, {
          limit: Math.floor(options.limit * 0.4)
        });
      }
      return [];
    } catch (error) {
      logger.warn('bm25_search_failed', 'BM25 search failed', { error: error.message });
      return [];
    }
  }

  /**
   * Get memory search results
   */
  async getMemoryResults(query, options) {
    try {
      if (this.storage.memory && this.storage.memory.search) {
        return await this.storage.memory.search(query, {
          limit: Math.floor(options.limit * 0.3),
          scope: options.scope,
          repo: options.repo
        });
      }
      return [];
    } catch (error) {
      logger.warn('memory_search_failed', 'Memory search failed', { error: error.message });
      return [];
    }
  }

  /**
   * Get symbol search results
   */
  async getSymbolResults(query, options) {
    try {
      if (this.storage.searchSymbols) {
        return await this.storage.searchSymbols(query, {
          limit: Math.floor(options.limit * 0.3)
        });
      }
      return [];
    } catch (error) {
      logger.warn('symbol_search_failed', 'Symbol search failed', { error: error.message });
      return [];
    }
  }

  /**
   * Invalidate cache entries for specific query patterns
   */
  invalidateQuery(queryPattern) {
    // Implementation would find and invalidate matching cache entries
    logger.debug('query_cache_invalidated', 'Query cache invalidated', {
      pattern: queryPattern
    });
  }

  /**
   * Warm cache with common queries
   */
  async warmCache(queries, options = {}) {
    const startTime = Date.now();
    let warmed = 0;

    logger.info('cache_warm_start', 'Starting search cache warm-up', {
      queryCount: queries.length
    });

    for (const query of queries) {
      try {
        await this.search(query, { ...options, cacheEnabled: true });
        warmed++;
      } catch (error) {
        logger.warn('cache_warm_query_failed', 'Failed to warm cache query', {
          query,
          error: error.message
        });
      }
    }

    const duration = Date.now() - startTime;
    
    logger.info('cache_warm_complete', 'Search cache warm-up completed', {
      totalQueries: queries.length,
      entriesWarmed: warmed,
      duration
    });

    return { warmed, total: queries.length, duration };
  }

  /**
   * Get cache statistics for search operations
   */
  getCacheStats() {
    return this.cache.getStats('search');
  }

  /**
   * Clear search cache
   */
  clearCache() {
    const cleared = this.cache.clear('search');
    logger.info('search_cache_cleared', 'Search cache cleared', {
      entriesCleared: cleared
    });
    return cleared;
  }
}

/**
 * Cached Bundle Assembly wrapper
 */
export class CachedBundleAssembler {
  constructor(assembler, options = {}) {
    this.assembler = assembler;
    this.cache = getCacheManager(options.cache);
    this.defaultOptions = {
      cacheEnabled: true,
      ttl: 1800000, // 30 minutes default
      ...options
    };
  }

  /**
   * Assemble context with caching
   */
  async assembleWithExplanation(query, options = {}) {
    const startTime = Date.now();
    const corrId = logger.getCorrelationId();
    
    const mergedOptions = { ...this.defaultOptions, ...options };
    
    try {
      if (!mergedOptions.cacheEnabled) {
        // Bypass cache if disabled
        return await this.assembler.assembleWithExplanation(query, mergedOptions);
      }

      // Generate cache key based on query and options
      const bundlePayload = {
        query,
        limit: mergedOptions.limit || 10,
        include: mergedOptions.include?.sort() || ['code', 'memory'],
        scope: mergedOptions.scope,
        repo: mergedOptions.repo,
        graphEnabled: mergedOptions.graphEnabled || false,
        budget: mergedOptions.budget || 5000
      };

      const cacheKey = this.cache.keyGenerator.generateKey('bundle', bundlePayload);
      
      // Use read-through cache
      const result = await this.cache.get('bundle', cacheKey, async () => {
        const bundle = await this.assembler.assembleWithExplanation(query, mergedOptions);
        
        // Add bundle signature for content-based invalidation
        bundle._signature = this.cache.keyGenerator.generateBundleSignature(bundle);
        bundle._cached = false;
        bundle._cache_key = cacheKey;
        
        return bundle;
      }, {
        ttl: mergedOptions.ttl
      });

      // Add cache metadata to bundle
      if (result.value) {
        result.value._cached = result.fromCache;
        result.value._cache_key = cacheKey;
      }

      // Emit metrics
      const duration = Date.now() - startTime;
      metrics.emitTiming('cached_bundle_assembly_duration_ms', duration, {
        from_cache: result.fromCache.toString(),
        total_tokens: result.value?.total_tokens || 0,
        sources_count: result.value?.sources?.length || 0
      }, corrId);

      metrics.emitCounter('cached_bundle_assemblies', 1, {
        hit: result.fromCache.toString(),
        miss: (!result.fromCache).toString()
      }, corrId);

      logger.debug('cached_bundle_assembly_completed', 'Cached bundle assembly completed', {
        query,
        fromCache: result.fromCache,
        duration,
        totalTokens: result.value?.total_tokens || 0
      });

      return result.value;

    } catch (error) {
      const duration = Date.now() - startTime;
      
      logger.error('cached_bundle_assembly_failed', 'Cached bundle assembly failed', {
        query,
        error: error.message,
        duration
      });

      metrics.emitCounter('cached_bundle_assembly_errors', 1, {
        error_type: error.constructor.name
      }, corrId);

      throw error;
    }
  }

  /**
   * Invalidate bundles by content signature
   */
  invalidateBySignature(signature) {
    const cache = this.cache.getCache('bundle');
    let invalidated = 0;

    for (const [key, entry] of cache.cache.entries()) {
      if (entry.value._signature === signature) {
        cache.delete(key);
        invalidated++;
      }
    }

    logger.info('bundle_cache_invalidated_by_signature', 'Bundle cache invalidated by signature', {
      signature,
      entriesInvalidated: invalidated
    });

    return invalidated;
  }

  /**
   * Warm bundle cache with common queries
   */
  async warmCache(queries, options = {}) {
    const startTime = Date.now();
    let warmed = 0;

    logger.info('bundle_cache_warm_start', 'Starting bundle cache warm-up', {
      queryCount: queries.length
    });

    for (const query of queries) {
      try {
        await this.assembleWithExplanation(query, { ...options, cacheEnabled: true });
        warmed++;
      } catch (error) {
        logger.warn('bundle_cache_warm_query_failed', 'Failed to warm bundle cache query', {
          query,
          error: error.message
        });
      }
    }

    const duration = Date.now() - startTime;
    
    logger.info('bundle_cache_warm_complete', 'Bundle cache warm-up completed', {
      totalQueries: queries.length,
      entriesWarmed: warmed,
      duration
    });

    return { warmed, total: queries.length, duration };
  }

  /**
   * Get bundle cache statistics
   */
  getCacheStats() {
    return this.cache.getStats('bundle');
  }

  /**
   * Clear bundle cache
   */
  clearCache() {
    const cleared = this.cache.clear('bundle');
    logger.info('bundle_cache_cleared', 'Bundle cache cleared', {
      entriesCleared: cleared
    });
    return cleared;
  }
}

/**
 * Cache invalidation strategies
 */
export class CacheInvalidationManager {
  constructor(cacheManager) {
    this.cache = cacheManager;
  }

  /**
   * Invalidate cache when repository data changes
   */
  async invalidateOnRepoChange(repoPath, changeType = 'update') {
    logger.info('repo_change_invalidation', 'Invalidating cache due to repository change', {
      repoPath,
      changeType
    });

    // Clear search cache as file changes affect search results
    const searchCleared = this.cache.clear('search');
    
    // Clear bundle cache as content changes affect context
    const bundleCleared = this.cache.clear('bundle');
    
    // Clear index cache as file structure changed
    const indexCleared = this.cache.clear('index');

    logger.info('repo_change_invalidation_complete', 'Repository change invalidation completed', {
      repoPath,
      changeType,
      searchCleared,
      bundleCleared,
      indexCleared,
      totalCleared: searchCleared + bundleCleared + indexCleared
    });

    return {
      search: searchCleared,
      bundle: bundleCleared,
      index: indexCleared,
      total: searchCleared + bundleCleared + indexCleared
    };
  }

  /**
   * Invalidate cache for specific files
   */
  async invalidateOnFileChange(filePath, changeType = 'update') {
    logger.debug('file_change_invalidation', 'Invalidating cache due to file change', {
      filePath,
      changeType
    });

    // For file changes, we might be more selective
    // This is a simplified implementation - in practice you'd
    // track which cache entries depend on which files
    
    const invalidated = {
      search: 0,
      bundle: 0
    };

    // Invalidate search cache entries that might contain this file
    const searchCache = this.cache.getCache('search');
    for (const [key, entry] of searchCache.cache.entries()) {
      // Simple heuristic - invalidate if key contains file path patterns
      if (key.includes(filePath.split('/').pop()) || entry.value.file === filePath) {
        searchCache.delete(key);
        invalidated.search++;
      }
    }

    // Invalidate bundle entries that might contain this file
    const bundleCache = this.cache.getCache('bundle');
    for (const [key, entry] of bundleCache.cache.entries()) {
      if (entry.value.sources && Array.isArray(entry.value.sources)) {
        const hasFile = entry.value.sources.some(source => 
          source.items && source.items.some(item => item.file === filePath)
        );
        
        if (hasFile) {
          bundleCache.delete(key);
          invalidated.bundle++;
        }
      }
    }

    logger.debug('file_change_invalidation_complete', 'File change invalidation completed', {
      filePath,
      changeType,
      invalidated
    });

    return invalidated;
  }

  /**
   * Invalidate expired entries
   */
  invalidateExpired() {
    let totalExpired = 0;
    
    for (const [namespace, cache] of this.cache.caches.entries()) {
      const expired = cache.cleanupExpired();
      totalExpired += expired;
    }

    logger.debug('expired_invalidation_complete', 'Expired entries invalidation completed', {
      totalExpired
    });

    return totalExpired;
  }

  /**
   * Periodic cleanup and maintenance
   */
  async performMaintenance() {
    const startTime = Date.now();
    
    // Clean up expired entries
    const expiredCount = this.invalidateExpired();
    
    // Check cache health
    const health = this.cache.getHealthStatus();
    
    // Log maintenance results
    const duration = Date.now() - startTime;
    
    logger.info('cache_maintenance_complete', 'Cache maintenance completed', {
      duration,
      expiredCount,
      healthy: health.healthy,
      issues: health.issues.length
    });

    return {
      duration,
      expiredCount,
      health
    };
  }
}

/**
 * Create cached search engine with default options
 */
export async function createCachedSearchEngine(storage, options = {}) {
  return new CachedSearchEngine(storage, options);
}

/**
 * Create cached bundle assembler with default options
 */
export async function createCachedBundleAssembler(assembler, options = {}) {
  return new CachedBundleAssembler(assembler, options);
}

/**
 * Create cache invalidation manager
 */
export function createCacheInvalidationManager(cacheManager = null) {
  return new CacheInvalidationManager(cacheManager || getCacheManager());
}