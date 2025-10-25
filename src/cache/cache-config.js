/**
 * Cache Configuration for PAMPAX
 * 
 * Centralized cache configuration with:
 * - Namespace-specific settings
 * - TTL configurations
 * - Memory limits
 * - Performance targets
 */

export const CACHE_NAMESPACES = {
  SEARCH: 'search',
  BUNDLE: 'bundle',
  INDEX: 'index',
  METADATA: 'metadata'
};

export const DEFAULT_CACHE_CONFIG = {
  // Global settings
  version: 'v1',
  metricsEnabled: true,
  cleanupInterval: 60000, // 1 minute
  
  // Performance targets
  performanceTargets: {
    hitRate: 0.6,           // ≥60% hit rate
    operationLatency: 5,     // <5ms per operation
    memoryLimit: 100 * 1024 * 1024, // 100MB total
    evictionRate: 0.1        // <10% eviction rate
  },
  
  // Namespace-specific configurations
  namespaces: {
    [CACHE_NAMESPACES.SEARCH]: {
      ttl: 300000,           // 5 minutes
      maxSize: 1000,         // Max 1000 entries
      sampling: 0.5,         // Sample 50% for metrics
      enableMetrics: true,
      description: 'Search query results and hybrid search data'
    },
    
    [CACHE_NAMESPACES.BUNDLE]: {
      ttl: 1800000,          // 30 minutes
      maxSize: 500,          // Max 500 entries
      sampling: 0.3,         // Sample 30% for metrics
      enableMetrics: true,
      description: 'Context bundle assembly results'
    },
    
    [CACHE_NAMESPACES.INDEX]: {
      ttl: 600000,           // 10 minutes
      maxSize: 200,          // Max 200 entries
      sampling: 0.2,         // Sample 20% for metrics
      enableMetrics: true,
      description: 'Index metadata and file structure information'
    },
    
    [CACHE_NAMESPACES.METADATA]: {
      ttl: 3600000,          // 1 hour
      maxSize: 100,          // Max 100 entries
      sampling: 0.1,         // Sample 10% for metrics
      enableMetrics: false,
      description: 'System metadata and configuration data'
    }
  }
};

export const CACHE_INVALIDATION_STRATEGIES = {
  // Time-based invalidation
  TIME_BASED: 'time_based',
  
  // Content-based invalidation
  CONTENT_BASED: 'content_based',
  
  // Manual invalidation
  MANUAL: 'manual',
  
  // Event-driven invalidation (file changes, etc.)
  EVENT_DRIVEN: 'event_driven'
};

export const CACHE_EVICTION_POLICIES = {
  // Least Recently Used
  LRU: 'lru',
  
  // Least Frequently Used
  LFU: 'lfu',
  
  // First In First Out
  FIFO: 'fifo',
  
  // Time-based expiration only
  TTL_ONLY: 'ttl_only'
};

export const CACHE_HEALTH_THRESHOLDS = {
  // Hit rate thresholds
  hitRate: {
    excellent: 0.8,  // ≥80%
    good: 0.6,       // ≥60%
    warning: 0.4,     // <40%
    critical: 0.2     // <20%
  },
  
  // Memory usage thresholds
  memoryUsage: {
    warning: 50 * 1024 * 1024,   // 50MB
    critical: 80 * 1024 * 1024   // 80MB
  },
  
  // Eviction rate thresholds
  evictionRate: {
    warning: 0.1,    // 10%
    critical: 0.2    // 20%
  },
  
  // Operation latency thresholds
  latency: {
    excellent: 1,     // ≤1ms
    good: 3,         // ≤3ms
    warning: 5,      // ≤5ms
    critical: 10     // >10ms
  }
};

/**
 * Get cache configuration for a specific namespace
 */
export function getCacheConfig(namespace) {
  const config = DEFAULT_CACHE_CONFIG.namespaces[namespace];
  if (!config) {
    throw new Error(`Unknown cache namespace: ${namespace}`);
  }
  return config;
}

/**
 * Get all cache configurations
 */
export function getAllCacheConfigs() {
  return DEFAULT_CACHE_CONFIG.namespaces;
}

/**
 * Validate cache configuration
 */
export function validateCacheConfig(config) {
  const errors = [];
  
  if (!config.version || typeof config.version !== 'string') {
    errors.push('Cache version must be a non-empty string');
  }
  
  if (typeof config.cleanupInterval !== 'number' || config.cleanupInterval <= 0) {
    errors.push('Cleanup interval must be a positive number');
  }
  
  if (!config.namespaces || typeof config.namespaces !== 'object') {
    errors.push('Namespaces configuration is required');
  } else {
    for (const [namespace, nsConfig] of Object.entries(config.namespaces)) {
      if (typeof nsConfig.ttl !== 'number' || nsConfig.ttl <= 0) {
        errors.push(`TTL for ${namespace} must be a positive number`);
      }
      
      if (typeof nsConfig.maxSize !== 'number' || nsConfig.maxSize <= 0) {
        errors.push(`Max size for ${namespace} must be a positive number`);
      }
      
      if (typeof nsConfig.sampling !== 'number' || nsConfig.sampling < 0 || nsConfig.sampling > 1) {
        errors.push(`Sampling rate for ${namespace} must be between 0 and 1`);
      }
    }
  }
  
  return errors;
}

/**
 * Merge user configuration with defaults
 */
export function mergeCacheConfig(userConfig = {}) {
  const merged = {
    ...DEFAULT_CACHE_CONFIG,
    ...userConfig
  };
  
  // Merge namespace configurations
  if (userConfig.namespaces) {
    merged.namespaces = {
      ...DEFAULT_CACHE_CONFIG.namespaces,
      ...userConfig.namespaces
    };
  }
  
  // Merge performance targets
  if (userConfig.performanceTargets) {
    merged.performanceTargets = {
      ...DEFAULT_CACHE_CONFIG.performanceTargets,
      ...userConfig.performanceTargets
    };
  }
  
  return merged;
}

/**
 * Get cache configuration from environment variables
 */
export function getCacheConfigFromEnv() {
  const envConfig = {
    metricsEnabled: process.env.PAMPAX_CACHE_METRICS !== 'false',
    cleanupInterval: parseInt(process.env.PAMPAX_CACHE_CLEANUP_INTERVAL || '60000', 10),
    version: process.env.PAMPAX_CACHE_VERSION || 'v1'
  };
  
  // Performance targets from environment
  const performanceTargets = {};
  if (process.env.PAMPAX_CACHE_HIT_RATE_TARGET) {
    performanceTargets.hitRate = parseFloat(process.env.PAMPAX_CACHE_HIT_RATE_TARGET);
  }
  if (process.env.PAMPAX_CACHE_LATENCY_TARGET) {
    performanceTargets.operationLatency = parseInt(process.env.PAMPAX_CACHE_LATENCY_TARGET, 10);
  }
  if (process.env.PAMPAX_CACHE_MEMORY_LIMIT) {
    performanceTargets.memoryLimit = parseInt(process.env.PAMPAX_CACHE_MEMORY_LIMIT, 10);
  }
  
  if (Object.keys(performanceTargets).length > 0) {
    envConfig.performanceTargets = performanceTargets;
  }
  
  // Namespace configurations from environment
  const namespaces = {};
  
  // Search cache
  if (process.env.PAMPAX_CACHE_SEARCH_TTL) {
    namespaces[CACHE_NAMESPACES.SEARCH] = {
      ttl: parseInt(process.env.PAMPAX_CACHE_SEARCH_TTL, 10)
    };
  }
  if (process.env.PAMPAX_CACHE_SEARCH_MAX_SIZE) {
    if (!namespaces[CACHE_NAMESPACES.SEARCH]) {
      namespaces[CACHE_NAMESPACES.SEARCH] = {};
    }
    namespaces[CACHE_NAMESPACES.SEARCH].maxSize = parseInt(process.env.PAMPAX_CACHE_SEARCH_MAX_SIZE, 10);
  }
  
  // Bundle cache
  if (process.env.PAMPAX_CACHE_BUNDLE_TTL) {
    namespaces[CACHE_NAMESPACES.BUNDLE] = {
      ttl: parseInt(process.env.PAMPAX_CACHE_BUNDLE_TTL, 10)
    };
  }
  if (process.env.PAMPAX_CACHE_BUNDLE_MAX_SIZE) {
    if (!namespaces[CACHE_NAMESPACES.BUNDLE]) {
      namespaces[CACHE_NAMESPACES.BUNDLE] = {};
    }
    namespaces[CACHE_NAMESPACES.BUNDLE].maxSize = parseInt(process.env.PAMPAX_CACHE_BUNDLE_MAX_SIZE, 10);
  }
  
  if (Object.keys(namespaces).length > 0) {
    envConfig.namespaces = namespaces;
  }
  
  return envConfig;
}

/**
 * Create cache configuration for specific use case
 */
export function createCacheConfigForUseCase(useCase, options = {}) {
  const baseConfig = { ...DEFAULT_CACHE_CONFIG };
  
  switch (useCase) {
    case 'development':
      // Development: shorter TTL, smaller caches, more metrics
      baseConfig.cleanupInterval = 30000; // 30 seconds
      baseConfig.namespaces[CACHE_NAMESPACES.SEARCH].ttl = 60000; // 1 minute
      baseConfig.namespaces[CACHE_NAMESPACES.BUNDLE].ttl = 300000; // 5 minutes
      baseConfig.namespaces[CACHE_NAMESPACES.SEARCH].maxSize = 100;
      baseConfig.namespaces[CACHE_NAMESPACES.BUNDLE].maxSize = 50;
      break;
      
    case 'testing':
      // Testing: very short TTL, minimal caches
      baseConfig.cleanupInterval = 5000; // 5 seconds
      baseConfig.namespaces[CACHE_NAMESPACES.SEARCH].ttl = 10000; // 10 seconds
      baseConfig.namespaces[CACHE_NAMESPACES.BUNDLE].ttl = 30000; // 30 seconds
      baseConfig.namespaces[CACHE_NAMESPACES.SEARCH].maxSize = 10;
      baseConfig.namespaces[CACHE_NAMESPACES.BUNDLE].maxSize = 5;
      baseConfig.metricsEnabled = false; // Disable metrics for tests
      break;
      
    case 'production':
      // Production: longer TTL, larger caches, optimized for performance
      baseConfig.namespaces[CACHE_NAMESPACES.SEARCH].ttl = 600000; // 10 minutes
      baseConfig.namespaces[CACHE_NAMESPACES.BUNDLE].ttl = 3600000; // 1 hour
      baseConfig.namespaces[CACHE_NAMESPACES.SEARCH].maxSize = 2000;
      baseConfig.namespaces[CACHE_NAMESPACES.BUNDLE].maxSize = 1000;
      baseConfig.namespaces[CACHE_NAMESPACES.SEARCH].sampling = 0.1; // Less sampling
      baseConfig.namespaces[CACHE_NAMESPACES.BUNDLE].sampling = 0.05;
      break;
      
    case 'memory-constrained':
      // Memory-constrained: smaller caches, aggressive cleanup
      baseConfig.cleanupInterval = 15000; // 15 seconds
      baseConfig.namespaces[CACHE_NAMESPACES.SEARCH].maxSize = 100;
      baseConfig.namespaces[CACHE_NAMESPACES.BUNDLE].maxSize = 50;
      baseConfig.namespaces[CACHE_NAMESPACES.INDEX].maxSize = 25;
      baseConfig.namespaces[CACHE_NAMESPACES.METADATA].maxSize = 10;
      break;
  }
  
  return mergeCacheConfig({ ...baseConfig, ...options });
}

export default {
  CACHE_NAMESPACES,
  DEFAULT_CACHE_CONFIG,
  CACHE_INVALIDATION_STRATEGIES,
  CACHE_EVICTION_POLICIES,
  CACHE_HEALTH_THRESHOLDS,
  getCacheConfig,
  getAllCacheConfigs,
  validateCacheConfig,
  mergeCacheConfig,
  getCacheConfigFromEnv,
  createCacheConfigForUseCase
};