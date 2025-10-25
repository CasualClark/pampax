import { test, describe } from 'node:test';
import assert from 'node:assert';
import { SignatureCache, CacheEntry, CacheStats } from '../../src/learning/signature-cache.js';

describe('SignatureCache', () => {
  test('should store and retrieve cache entries', async () => {
    const cache = new SignatureCache({
      maxSize: 100,
      defaultTtl: 7 * 24 * 60 * 60 * 1000, // 7 days
      cleanupInterval: 60000, // 1 minute
      satisfactionThreshold: 0.8
    });

    try {
      const entry = new CacheEntry(
        'test_query_123',
        'bundle_456',
        0.9,
        1,
        Date.now(),
        Date.now(),
        7 * 24 * 60 * 60 * 1000
      );

      await cache.set(entry);
      const retrieved = await cache.get('test_query_123');

      assert.ok(retrieved, 'Should retrieve cached entry');
      assert.strictEqual(retrieved.querySignature, 'test_query_123');
      assert.strictEqual(retrieved.bundleId, 'bundle_456');
      assert.strictEqual(retrieved.satisfaction, 0.9);
      assert.strictEqual(retrieved.usageCount, 2); // Should increment on retrieval
    } finally {
      await cache.cleanup();
    }
  });

  test('should return null for non-existent entries', async () => {
    const cache = new SignatureCache();
    
    try {
      const result = await cache.get('non_existent_query');
      assert.strictEqual(result, null, 'Should return null for non-existent entries');
    } finally {
      await cache.cleanup();
    }
  });

  test('should not cache entries below satisfaction threshold', async () => {
    const cache = new SignatureCache({
      satisfactionThreshold: 0.8
    });

    try {
      const entry = new CacheEntry(
        'low_satisfaction_query',
        'bundle_789',
        0.7, // Below 0.8 threshold
        1,
        Date.now(),
        Date.now(),
        7 * 24 * 60 * 60 * 1000
      );

      await cache.set(entry);
      const retrieved = await cache.get('low_satisfaction_query');
      
      assert.strictEqual(retrieved, null, 'Should not cache entries below satisfaction threshold');
    } finally {
      await cache.cleanup();
    }
  });

  test('should update usage count and last used timestamp on retrieval', async () => {
    const cache = new SignatureCache();

    try {
      const now = Date.now();
      const entry = new CacheEntry(
        'usage_test_query',
        'bundle_usage',
        0.85,
        1,
        now - 1000,
        now - 1000,
        7 * 24 * 60 * 60 * 1000
      );

      await cache.set(entry);
      
      // Wait a bit to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const retrieved = await cache.get('usage_test_query');
      
      assert.ok(retrieved, 'Should retrieve entry');
      assert.strictEqual(retrieved.usageCount, 2, 'Should increment usage count');
      assert.ok(retrieved.lastUsed >= entry.lastUsed, 'Should update last used timestamp');
    } finally {
      await cache.cleanup();
    }
  });

  test('should respect TTL and return null for expired entries', async () => {
    const cache = new SignatureCache();

    try {
      const now = Date.now();
      const entry = new CacheEntry(
        'expired_query',
        'bundle_expired',
        0.9,
        1,
        now - 2000,
        now - 2000,
        1000 // 1 second TTL
      );

      await cache.set(entry);
      
      // Wait for entry to expire
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      const retrieved = await cache.get('expired_query');
      assert.strictEqual(retrieved, null, 'Should return null for expired entries');
    } finally {
      await cache.cleanup();
    }
  });

  test('should implement LRU eviction when max size is reached', async () => {
    // Create cache with small max size
    const smallCache = new SignatureCache({
      maxSize: 2,
      defaultTtl: 7 * 24 * 60 * 60 * 1000,
      cleanupInterval: 60000,
      satisfactionThreshold: 0.8
    });

    try {
      const now = Date.now();
      
      // Add first entry
      const entry1 = new CacheEntry(
        'lru_query_1',
        'bundle_1',
        0.9,
        1,
        now,
        now,
        7 * 24 * 60 * 60 * 1000
      );
      await smallCache.set(entry1);

      // Add second entry
      const entry2 = new CacheEntry(
        'lru_query_2',
        'bundle_2',
        0.9,
        1,
        now,
        now,
        7 * 24 * 60 * 60 * 1000
      );
      await smallCache.set(entry2);

      // Access first entry to make it recently used
      await smallCache.get('lru_query_1');

      // Add third entry, should evict second entry (LRU)
      const entry3 = new CacheEntry(
        'lru_query_3',
        'bundle_3',
        0.9,
        1,
        now,
        now,
        7 * 24 * 60 * 60 * 1000
      );
      await smallCache.set(entry3);

      // Check that first entry is still cached (recently used)
      const retrieved1 = await smallCache.get('lru_query_1');
      assert.ok(retrieved1, 'First entry should still be cached');

      // Check that second entry is evicted (least recently used)
      const retrieved2 = await smallCache.get('lru_query_2');
      assert.strictEqual(retrieved2, null, 'Second entry should be evicted');

      // Check that third entry is cached
      const retrieved3 = await smallCache.get('lru_query_3');
      assert.ok(retrieved3, 'Third entry should be cached');
    } finally {
      await smallCache.cleanup();
    }
  });

  test('should provide accurate cache statistics', async () => {
    const cache = new SignatureCache();
    
    try {
      const stats = await cache.getStats();
      
      assert.strictEqual(stats.totalRequests, 0, 'Should start with 0 requests');
      assert.strictEqual(stats.cacheHits, 0, 'Should start with 0 hits');
      assert.strictEqual(stats.cacheMisses, 0, 'Should start with 0 misses');
      assert.strictEqual(stats.hitRate, 0, 'Should start with 0% hit rate');
      assert.strictEqual(stats.entries, 0, 'Should start with 0 entries');

      // Add an entry
      const entry = new CacheEntry(
        'stats_test_query',
        'bundle_stats',
        0.9,
        1,
        Date.now(),
        Date.now(),
        7 * 24 * 60 * 60 * 1000
      );
      await cache.set(entry);

      // Test hit
      await cache.get('stats_test_query');
      
      // Test miss
      await cache.get('non_existent');

      const updatedStats = await cache.getStats();
      assert.strictEqual(updatedStats.totalRequests, 2, 'Should track 2 requests');
      assert.strictEqual(updatedStats.cacheHits, 1, 'Should track 1 hit');
      assert.strictEqual(updatedStats.cacheMisses, 1, 'Should track 1 miss');
      assert.strictEqual(updatedStats.hitRate, 0.5, 'Should calculate 50% hit rate');
      assert.strictEqual(updatedStats.entries, 1, 'Should track 1 entry');
    } finally {
      await cache.cleanup();
    }
  });

  test('should invalidate cache entries by pattern', async () => {
    const cache = new SignatureCache();
    
    try {
      const now = Date.now();
      
      // Add multiple entries
      const entries = [
        new CacheEntry(
          'pattern_test_1',
          'bundle_1',
          0.9,
          1,
          now,
          now,
          7 * 24 * 60 * 60 * 1000
        ),
        new CacheEntry(
          'pattern_test_2',
          'bundle_2',
          0.9,
          1,
          now,
          now,
          7 * 24 * 60 * 60 * 1000
        ),
        new CacheEntry(
          'other_query',
          'bundle_3',
          0.9,
          1,
          now,
          now,
          7 * 24 * 60 * 60 * 1000
        )
      ];

      for (const entry of entries) {
        await cache.set(entry);
      }

      // Invalidate entries matching pattern
      await cache.invalidate('pattern_test');

      // Check that pattern entries are invalidated
      const retrieved1 = await cache.get('pattern_test_1');
      const retrieved2 = await cache.get('pattern_test_2');
      assert.strictEqual(retrieved1, null, 'Pattern entry 1 should be invalidated');
      assert.strictEqual(retrieved2, null, 'Pattern entry 2 should be invalidated');

      // Check that non-matching entry is still cached
      const retrieved3 = await cache.get('other_query');
      assert.ok(retrieved3, 'Non-matching entry should still be cached');
    } finally {
      await cache.cleanup();
    }
  });

  test('should invalidate all cache entries when no pattern provided', async () => {
    const cache = new SignatureCache();
    
    try {
      // Add entries
      const entry = new CacheEntry(
        'clear_test_query',
        'bundle_clear',
        0.9,
        1,
        Date.now(),
        Date.now(),
        7 * 24 * 60 * 60 * 1000
      );
      await cache.set(entry);

      // Clear all entries
      await cache.invalidate();

      // Check that all entries are cleared
      const retrieved = await cache.get('clear_test_query');
      assert.strictEqual(retrieved, null, 'All entries should be invalidated');
    } finally {
      await cache.cleanup();
    }
  });

  test('should clean up expired entries', async () => {
    const cache = new SignatureCache();
    
    try {
      const now = Date.now();
      
      const expiredEntry = new CacheEntry(
        'cleanup_expired',
        'bundle_cleanup_expired',
        0.9,
        1,
        now - 2000,
        now - 2000,
        1000 // 1 second TTL
      );

      const validEntry = new CacheEntry(
        'cleanup_valid',
        'bundle_cleanup_valid',
        0.9,
        1,
        now,
        now,
        7 * 24 * 60 * 60 * 1000
      );

      await cache.set(expiredEntry);
      await cache.set(validEntry);

      // Wait for expired entry to expire
      await new Promise(resolve => setTimeout(resolve, 1100));

      await cache.cleanup();

      // Check that expired entry is removed
      const retrievedExpired = await cache.get('cleanup_expired');
      assert.strictEqual(retrievedExpired, null, 'Expired entry should be removed');

      // Check that valid entry is still cached
      const retrievedValid = await cache.get('cleanup_valid');
      assert.ok(retrievedValid, 'Valid entry should still be cached');
    } finally {
      await cache.cleanup();
    }
  });

  test('should handle concurrent access safely', async () => {
    const cache = new SignatureCache();
    
    try {
      const now = Date.now();
      
      const entry = new CacheEntry(
        'concurrent_test',
        'bundle_concurrent',
        0.9,
        1,
        now,
        now,
        7 * 24 * 60 * 60 * 1000
      );

      // Concurrent sets
      await Promise.all([
        cache.set(entry),
        cache.set(entry),
        cache.set(entry)
      ]);

      // Concurrent gets
      const results = await Promise.all([
        cache.get('concurrent_test'),
        cache.get('concurrent_test'),
        cache.get('concurrent_test')
      ]);

      // All should succeed and return the same entry
      for (const result of results) {
        assert.ok(result, 'All concurrent gets should succeed');
        assert.strictEqual(result.querySignature, 'concurrent_test');
      }
    } finally {
      await cache.cleanup();
    }
  });
});