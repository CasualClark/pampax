/**
 * Configuration for signature cache system
 * 
 * This module provides default configuration and validation
 * for the signature cache system used in Phase 6.
 */

/**
 * Default cache configuration
 */
export const DEFAULT_CACHE_CONFIG = {
  maxSize: 1000,
  defaultTtl: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
  cleanupInterval: 60 * 60 * 1000, // 1 hour in milliseconds
  satisfactionThreshold: 0.8
};

/**
 * Cache configuration for different environments
 */
export const CACHE_CONFIGS = {
  development: {
    ...DEFAULT_CACHE_CONFIG,
    maxSize: 100,
    cleanupInterval: 5 * 60 * 1000, // 5 minutes
    defaultTtl: 24 * 60 * 60 * 1000 // 1 day
  },
  
  production: {
    ...DEFAULT_CACHE_CONFIG,
    maxSize: 5000,
    cleanupInterval: 2 * 60 * 60 * 1000, // 2 hours
    defaultTtl: 14 * 24 * 60 * 60 * 1000 // 14 days
  },
  
  testing: {
    ...DEFAULT_CACHE_CONFIG,
    maxSize: 50,
    cleanupInterval: 0, // Disabled for tests
    defaultTtl: 60 * 60 * 1000, // 1 hour
    satisfactionThreshold: 0.7 // Lower threshold for testing
  }
};

/**
 * Get cache configuration for environment
 * @param {string} env - Environment name (development, production, testing)
 * @param {Object} overrides - Configuration overrides
 * @returns {Object} Cache configuration
 */
export function getCacheConfig(env = 'development', overrides = {}) {
  const baseConfig = CACHE_CONFIGS[env] || DEFAULT_CACHE_CONFIG;
  return { ...baseConfig, ...overrides };
}

/**
 * Validate cache configuration
 * @param {Object} config - Configuration to validate
 * @returns {boolean} True if configuration is valid
 */
export function validateCacheConfig(config) {
  if (!config || typeof config !== 'object') {
    return false;
  }
  
  // Check required fields
  const requiredFields = ['maxSize', 'defaultTtl', 'satisfactionThreshold'];
  for (const field of requiredFields) {
    if (typeof config[field] !== 'number' || config[field] < 0) {
      return false;
    }
  }
  
  // Validate ranges
  if (config.maxSize > 10000) {
    return false; // Too large
  }
  
  if (config.satisfactionThreshold < 0 || config.satisfactionThreshold > 1) {
    return false; // Invalid range
  }
  
  if (config.defaultTtl < 60000) { // Less than 1 minute
    return false;
  }
  
  return true;
}

/**
 * Cache performance metrics
 */
export class CacheMetrics {
  constructor() {
    this.reset();
  }
  
  reset() {
    this.startTime = Date.now();
    this.totalLookups = 0;
    this.totalSets = 0;
    this.totalInvalidations = 0;
    this.peakSize = 0;
    this.totalEvictions = 0;
  }
  
  recordLookup() {
    this.totalLookups++;
  }
  
  recordSet(size) {
    this.totalSets++;
    this.peakSize = Math.max(this.peakSize, size);
  }
  
  recordInvalidation() {
    this.totalInvalidations++;
  }
  
  recordEviction() {
    this.totalEvictions++;
  }
  
  getMetrics() {
    const uptime = Date.now() - this.startTime;
    return {
      uptime,
      totalLookups: this.totalLookups,
      totalSets: this.totalSets,
      totalInvalidations: this.totalInvalidations,
      peakSize: this.peakSize,
      totalEvictions: this.totalEvictions,
      lookupsPerSecond: this.totalLookups / (uptime / 1000),
      setsPerSecond: this.totalSets / (uptime / 1000)
    };
  }
}