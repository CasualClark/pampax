/**
 * Cache Integration Tests for PAMPAX
 * 
 * Tests the complete cache infrastructure including:
 * - Namespaced cache key schema
 * - Read-through cache operations
 * - TTL and LRU eviction
 * - CLI cache commands
 * - Integration with search and bundle assembly
 */

import { describe, it, before, after, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import { CacheManager, getCacheManager, resetCacheManager } from '../src/cache/cache-manager.js';
import { CachedSearchEngine, CachedBundleAssembler } from '../src/search/cached-search.js';
import { Database } from '../src/storage/database-simple.js';
import { ContextAssembler } from '../src/context/assembler.js';
import { getLogger } from '../src/utils/structured-logger.js';
import { getMetricsCollector } from '../src/metrics/metrics-collector.js';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const testDbPath = path.join(__dirname, 'fixtures', 'test-cache.db');

describe('Cache Integration Tests', function() {
  this.timeout(10000);

  let cacheManager;
  let db;
  let searchEngine;
  let assembler;

  before(async function() {
    // Clean up any existing test database
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }

    // Initialize test database
    db = new Database(testDbPath);
    await db.initialize();

    // Create some test data
    await setupTestData(db);
  });

  after(async function() {
    // Clean up
    if (db) {
      await db.close();
    }
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    resetCacheManager();
  });

  beforeEach(function() {
    // Reset cache manager for each test
    resetCacheManager();
    cacheManager = getCacheManager({
      metricsEnabled: true,
      cleanupInterval: 1000 // Fast cleanup for tests
    });
  });

  afterEach(function() {
    if (cacheManager) {
      cacheManager.shutdown();
    }
  });

  describe('Cache Key Schema', function() {
    it('should generate namespaced cache keys with versioning', function() {
      const keyGen = cacheManager.keyGenerator;
      
      const searchKey = keyGen.generateSearchKey('test query', { limit: 10 });
      expect(searchKey).to.match(/^v1:search:[a-f0-9]{16}$/);
      
      const bundleKey = keyGen.generateKey('bundle', { query: 'test' });
      expect(bundleKey).to.match(/^v1:bundle:[a-f0-9]{16}$/);
      
      const indexKey = keyGen.generateIndexKey('/test/path', 1234567890);
      expect(indexKey).to.match(/^v1:index:[a-f0-9]{16}$/);
    });

    it('should generate consistent keys for same input', function() {
      const keyGen = cacheManager.keyGenerator;
      const query = 'test query';
      const options = { limit: 10, include: ['code'] };
      
      const key1 = keyGen.generateSearchKey(query, options);
      const key2 = keyGen.generateSearchKey(query, options);
      
      expect(key1).to.equal(key2);
    });

    it('should generate different keys for different inputs', function() {
      const keyGen = cacheManager.keyGenerator;
      
      const key1 = keyGen.generateSearchKey('query1', { limit: 10 });
      const key2 = keyGen.generateSearchKey('query2', { limit: 10 });
      const key3 = keyGen.generateSearchKey('query1', { limit: 5 });
      
      expect(key1).to.not.equal(key2);
      expect(key1).to.not.equal(key3);
    });

    it('should parse cache key components', function() {
      const keyGen = cacheManager.keyGenerator;
      const key = keyGen.generateSearchKey('test', { limit: 10 });
      
      const parsed = keyGen.parseKey(key);
      expect(parsed.version).to.equal('v1');
      expect(parsed.scope).to.equal('search');
      expect(parsed.hash).to.have.length(16);
    });
  });

  describe('LRU Cache Operations', function() {
    it('should store and retrieve values', function() {
      const cache = cacheManager.getCache('search');
      
      cache.set('key1', 'value1');
      const value = cache.get('key1');
      
      expect(value).to.equal('value1');
    });

    it('should return null for missing keys', function() {
      const cache = cacheManager.getCache('search');
      
      const value = cache.get('nonexistent');
      expect(value).to.be.null;
    });

    it('should respect TTL expiration', function(done) {
      const cache = cacheManager.getCache('search');
      
      cache.set('expire_key', 'expire_value', 100); // 100ms TTL
      
      setTimeout(() => {
        const value = cache.get('expire_key');
        expect(value).to.be.null;
        done();
      }, 150);
    });

    it('should evict LRU entries when at capacity', function() {
      const cache = cacheManager.getCache('search');
      cache.maxSize = 2; // Small cache for testing
      
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3'); // Should evict key1
      
      expect(cache.get('key1')).to.be.null;
      expect(cache.get('key2')).to.equal('value2');
      expect(cache.get('key3')).to.equal('value3');
    });

    it('should update access order on get', function() {
      const cache = cacheManager.getCache('search');
      cache.maxSize = 2;
      
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.get('key1'); // Access key1 to make it most recently used
      cache.set('key3', 'value3'); // Should evict key2
      
      expect(cache.get('key1')).to.equal('value1');
      expect(cache.get('key2')).to.be.null;
      expect(cache.get('key3')).to.equal('value3');
    });
  });

  describe('Read-Through Cache', function() {
    it('should populate cache on miss', async function() {
      let callCount = 0;
      const fetchFn = async () => {
        callCount++;
        return 'fetched_value';
      };
      
      const result1 = await cacheManager.get('search', 'test_key', fetchFn);
      expect(result1.value).to.equal('fetched_value');
      expect(result1.fromCache).to.be.false;
      expect(callCount).to.equal(1);
      
      const result2 = await cacheManager.get('search', 'test_key', fetchFn);
      expect(result2.value).to.equal('fetched_value');
      expect(result2.fromCache).to.be.true;
      expect(callCount).to.equal(1); // Should not call fetchFn again
    });

    it('should handle fetch errors gracefully', async function() {
      const fetchFn = async () => {
        throw new Error('Fetch failed');
      };
      
      try {
        await cacheManager.get('search', 'error_key', fetchFn);
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error.message).to.equal('Fetch failed');
      }
    });

    it('should not cache null or undefined values', async function() {
      let nullCallCount = 0;
      let undefinedCallCount = 0;
      
      const nullFetchFn = async () => {
        nullCallCount++;
        return null;
      };
      
      const undefinedFetchFn = async () => {
        undefinedCallCount++;
        return undefined;
      };
      
      await cacheManager.get('search', 'null_key', nullFetchFn);
      await cacheManager.get('search', 'undefined_key', undefinedFetchFn);
      
      // Call again - should call fetch functions again
      await cacheManager.get('search', 'null_key', nullFetchFn);
      await cacheManager.get('search', 'undefined_key', undefinedFetchFn);
      
      expect(nullCallCount).to.equal(2);
      expect(undefinedCallCount).to.equal(2);
    });
  });

  describe('Cache Statistics', function() {
    it('should track hit and miss statistics', async function() {
      const cache = cacheManager.getCache('search');
      
      // Direct cache operations
      cache.set('key1', 'value1');
      cache.get('key1'); // hit
      cache.get('key2'); // miss
      
      const stats = cache.getStats();
      expect(stats.hits).to.equal(1);
      expect(stats.misses).to.equal(1);
      expect(stats.hitRate).to.equal(0.5);
    });

    it('should provide global statistics', function() {
      const globalStats = cacheManager.getStats();
      
      expect(globalStats).to.have.property('version');
      expect(globalStats).to.have.property('namespaces');
      expect(globalStats).to.have.property('summary');
      
      expect(globalStats.summary).to.have.property('totalHits');
      expect(globalStats.summary).to.have.property('totalMisses');
      expect(globalStats.summary).to.have.property('globalHitRate');
    });

    it('should provide health status', function() {
      const health = cacheManager.getHealthStatus();
      
      expect(health).to.have.property('healthy');
      expect(health).to.have.property('issues');
      expect(health).to.have.property('stats');
      expect(health).to.have.property('timestamp');
    });
  });

  describe('Cached Search Engine', function() {
    beforeEach(function() {
      searchEngine = new CachedSearchEngine(db, {
        cacheEnabled: true,
        graphEnabled: false
      });
    });

    it('should cache search results', async function() {
      // Mock search function
      let callCount = 0;
      const originalSearch = db.search.bind(db);
      db.search = async (query, options) => {
        callCount++;
        return await originalSearch(query, options);
      };
      
      const query = 'function';
      
      // First call - should hit database
      const result1 = await searchEngine.search(query);
      expect(callCount).to.equal(1);
      
      // Second call - should hit cache
      const result2 = await searchEngine.search(query);
      expect(callCount).to.equal(1); // No additional database calls
      
      expect(result1).to.deep.equal(result2);
    });

    it('should bypass cache when disabled', async function() {
      let callCount = 0;
      const originalSearch = db.search.bind(db);
      db.search = async (query, options) => {
        callCount++;
        return await originalSearch(query, options);
      };
      
      const query = 'function';
      
      // Both calls should hit database
      await searchEngine.search(query, { cacheEnabled: false });
      await searchEngine.search(query, { cacheEnabled: false });
      
      expect(callCount).to.equal(2);
    });
  });

  describe('Cached Bundle Assembler', function() {
    beforeEach(function() {
      assembler = new ContextAssembler(db, {
        cacheEnabled: true,
        graphEnabled: false
      });
    });

    it('should cache bundle assembly results', async function() {
      let callCount = 0;
      
      // Mock the database search to track calls
      const originalSearch = db.search.bind(db);
      db.search = async (query, options) => {
        callCount++;
        return await originalSearch(query, options);
      };
      
      const query = 'test function';
      
      // First call - should hit database
      const bundle1 = await assembler.assembleWithExplanation(query);
      expect(callCount).to.be.greaterThan(0);
      
      // Reset call count
      callCount = 0;
      
      // Second call - should hit cache
      const bundle2 = await assembler.assembleWithExplanation(query);
      expect(callCount).to.equal(0); // No additional database calls
      
      expect(bundle1.query).to.equal(bundle2.query);
      expect(bundle1.total_tokens).to.equal(bundle2.total_tokens);
    });
  });

  describe('Cache CLI Commands', function() {
    it('should execute cache status command', function(done) {
      const cliPath = path.join(__dirname, '..', 'src', 'cli.js');
      const child = spawn('node', [cliPath, 'cache', 'status', '--format', 'json'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: path.dirname(testDbPath)
      });
      
      let output = '';
      child.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      child.on('close', (code) => {
        expect(code).to.equal(0);
        const result = JSON.parse(output);
        expect(result).to.have.property('stats');
        expect(result).to.have.property('health');
        done();
      });
    });

    it('should execute cache warm command', function(done) {
      const cliPath = path.join(__dirname, '..', 'src', 'cli.js');
      const child = spawn('node', [cliPath, 'cache', 'warm', '--scope', 'search', '--query', 'function'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: path.dirname(testDbPath)
      });
      
      let output = '';
      child.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      child.on('close', (code) => {
        expect(code).to.equal(0);
        expect(output).to.contain('Warming cache');
        done();
      });
    });

    it('should execute cache clear command', function(done) {
      const cliPath = path.join(__dirname, '..', 'src', 'cli.js');
      const child = spawn('node', [cliPath, 'cache', 'clear', '--scope', 'search'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: path.dirname(testDbPath)
      });
      
      let output = '';
      child.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      child.on('close', (code) => {
        expect(code).to.equal(0);
        expect(output).to.contain('Cache clearing completed');
        done();
      });
    });
  });

  describe('Cache Performance', function() {
    it('should meet performance targets', async function() {
      const cache = cacheManager.getCache('search');
      const iterations = 1000;
      
      // Warm up cache
      for (let i = 0; i < 100; i++) {
        cache.set(`key${i}`, `value${i}`);
      }
      
      // Measure cache hit performance
      const startTime = Date.now();
      for (let i = 0; i < iterations; i++) {
        cache.get(`key${i % 100}`);
      }
      const duration = Date.now() - startTime;
      
      // Should be under 5ms per operation on average
      const avgMsPerOp = duration / iterations;
      expect(avgMsPerOp).to.be.lessThan(5);
      
      // Hit rate should be high
      const stats = cache.getStats();
      expect(stats.hitRate).to.be.greaterThan(0.6);
    });
  });
});

/**
 * Setup test data for cache integration tests
 */
async function setupTestData(db) {
  // Insert some test chunks for search
  const chunks = [
    {
      file: 'test1.js',
      content: 'function testFunction() { return true; }',
      sha: 'abc123',
      meta: { symbol: 'testFunction', lang: 'javascript' }
    },
    {
      file: 'test2.js',
      content: 'class TestClass { constructor() {} }',
      sha: 'def456',
      meta: { symbol: 'TestClass', lang: 'javascript' }
    }
  ];

  for (const chunk of chunks) {
    await db.insert(chunk);
  }

  // Insert some test memories
  if (db.memory) {
    await db.memory.insert({
      scope: 'repo',
      repo: process.cwd(),
      kind: 'fact',
      key: 'test_fact',
      value: 'This is a test fact',
      weight: 1.0
    });
  }
}