import { test, describe } from 'node:test';
import assert from 'node:assert';
import { DEFAULT_CACHE_CONFIG, CACHE_CONFIGS, getCacheConfig, validateCacheConfig, CacheMetrics } from '../../src/learning/cache-config.js';

describe('Cache Configuration', () => {
  test('should have valid default configuration', () => {
    assert.ok(DEFAULT_CACHE_CONFIG, 'Default config should exist');
    assert.strictEqual(typeof DEFAULT_CACHE_CONFIG.maxSize, 'number');
    assert.strictEqual(typeof DEFAULT_CACHE_CONFIG.defaultTtl, 'number');
    assert.strictEqual(typeof DEFAULT_CACHE_CONFIG.satisfactionThreshold, 'number');
    assert.strictEqual(DEFAULT_CACHE_CONFIG.satisfactionThreshold, 0.8);
  });

  test('should provide environment-specific configurations', () => {
    assert.ok(CACHE_CONFIGS.development, 'Development config should exist');
    assert.ok(CACHE_CONFIGS.production, 'Production config should exist');
    assert.ok(CACHE_CONFIGS.testing, 'Testing config should exist');
    
    // Production should have larger cache than development
    assert.ok(CACHE_CONFIGS.production.maxSize > CACHE_CONFIGS.development.maxSize);
    
    // Testing should have smaller cache
    assert.ok(CACHE_CONFIGS.testing.maxSize < CACHE_CONFIGS.development.maxSize);
  });

  test('should get configuration with overrides', () => {
    const config = getCacheConfig('development', { maxSize: 500 });
    
    assert.strictEqual(config.maxSize, 500, 'Override should be applied');
    assert.strictEqual(config.satisfactionThreshold, DEFAULT_CACHE_CONFIG.satisfactionThreshold, 'Default should be preserved');
  });

  test('should validate configuration correctly', () => {
    // Valid configuration
    const validConfig = {
      maxSize: 1000,
      defaultTtl: 60000,
      satisfactionThreshold: 0.8
    };
    assert.strictEqual(validateCacheConfig(validConfig), true, 'Valid config should pass');
    
    // Invalid configurations
    assert.strictEqual(validateCacheConfig(null), false, 'Null config should fail');
    assert.strictEqual(validateCacheConfig({}), false, 'Empty config should fail');
    assert.strictEqual(validateCacheConfig({ maxSize: -1 }), false, 'Negative size should fail');
    assert.strictEqual(validateCacheConfig({ maxSize: 1000, defaultTtl: 60000, satisfactionThreshold: -0.1 }), false, 'Negative satisfaction should fail');
    assert.strictEqual(validateCacheConfig({ maxSize: 1000, defaultTtl: 60000, satisfactionThreshold: 1.1 }), false, 'Satisfaction > 1 should fail');
    assert.strictEqual(validateCacheConfig({ maxSize: 100000, defaultTtl: 60000, satisfactionThreshold: 0.8 }), false, 'Too large size should fail');
    assert.strictEqual(validateCacheConfig({ maxSize: 1000, defaultTtl: 1000, satisfactionThreshold: 0.8 }), false, 'Too short TTL should fail');
  });

  test('should track cache metrics', async () => {
    const metrics = new CacheMetrics();
    
    // Initial state
    const initialMetrics = metrics.getMetrics();
    assert.strictEqual(initialMetrics.totalLookups, 0);
    assert.strictEqual(initialMetrics.totalSets, 0);
    assert.strictEqual(initialMetrics.peakSize, 0);
    
    // Record operations
    metrics.recordLookup();
    metrics.recordLookup();
    metrics.recordSet(100);
    metrics.recordSet(150);
    metrics.recordInvalidation();
    metrics.recordEviction();
    
    const updatedMetrics = metrics.getMetrics();
    assert.strictEqual(updatedMetrics.totalLookups, 2);
    assert.strictEqual(updatedMetrics.totalSets, 2);
    assert.strictEqual(updatedMetrics.totalInvalidations, 1);
    assert.strictEqual(updatedMetrics.totalEvictions, 1);
    assert.strictEqual(updatedMetrics.peakSize, 150);
    assert.ok(updatedMetrics.uptime >= 0);
  });

  test('should reset metrics correctly', async () => {
    const metrics = new CacheMetrics();
    
    // Record some operations
    metrics.recordLookup();
    metrics.recordSet(100);
    
    // Reset
    metrics.reset();
    
    const resetMetrics = metrics.getMetrics();
    assert.strictEqual(resetMetrics.totalLookups, 0);
    assert.strictEqual(resetMetrics.totalSets, 0);
    assert.strictEqual(resetMetrics.peakSize, 0);
    assert.ok(resetMetrics.uptime >= 0);
  });

  test('should calculate rates correctly', async () => {
    const metrics = new CacheMetrics();
    
    // Record operations
    for (let i = 0; i < 10; i++) {
      metrics.recordLookup();
      metrics.recordSet(50);
    }
    
    const metricsData = metrics.getMetrics();
    assert.ok(metricsData.lookupsPerSecond >= 0);
    assert.ok(metricsData.setsPerSecond >= 0);
  });
});