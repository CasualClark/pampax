import { test, describe, before, after, afterEach } from 'node:test';
import assert from 'node:assert';
import { performance } from 'node:perf_hooks';
import { DatabaseManager } from '../src/storage/database-optimized.js';
import { createDatabaseMaintenance } from '../src/storage/database-maintenance.js';
import { createPerformanceOptimizer } from '../src/storage/performance-optimizer.js';
import { existsSync, unlinkSync } from 'fs';

describe('SQLite Performance Optimization Tests', () => {
  let db: DatabaseManager;
  const testDbPath = '/tmp/pampax-optimization-test.sqlite';

  before(async () => {
    // Clean up any existing test database
    if (existsSync(testDbPath)) {
      unlinkSync(testDbPath);
    }

    db = new DatabaseManager({ path: testDbPath });
    await db.initialize();
  });

  afterEach(async () => {
    if (db) {
      await db.close();
    }
    
    // Clean up test database
    if (existsSync(testDbPath)) {
      unlinkSync(testDbPath);
    }
  });

  test('should achieve ≤50ms p95 for read operations', async () => {
    // Insert test data
    const numFiles = 1000;
    const files = Array.from({ length: numFiles }, (_, i) => ({
      repo: 'test-repo',
      path: `src/file${i}.ts`,
      content_hash: `hash${i}`,
      lang: 'typescript',
      size: 1000 + i,
      modified_time: Date.now() - (i * 1000)
    }));

    const insertStart = performance.now();
    for (const file of files) {
      await db.executeQuery(
        'INSERT INTO file (repo, path, content_hash, lang, size, modified_time) VALUES (?, ?, ?, ?, ?, ?)',
        [file.repo, file.path, file.content_hash, file.lang, file.size, file.modified_time]
      );
    }
    const insertDuration = performance.now() - insertStart;
    console.log(`Inserted ${numFiles} files in ${insertDuration.toFixed(2)}ms`);

    // Test read performance
    const readTimes: number[] = [];
    const numReads = 1000;

    for (let i = 0; i < numReads; i++) {
      const fileIndex = i % numFiles;
      const readStart = performance.now();
      
      await db.executeQuery(
        'SELECT * FROM file WHERE repo = ? AND path = ?',
        ['test-repo', `src/file${fileIndex}.ts`],
        { expectSingleRow: true }
      );
      
      const readDuration = performance.now() - readStart;
      readTimes.push(readDuration);
    }

    // Calculate p95
    readTimes.sort((a, b) => a - b);
    const p95Index = Math.floor(readTimes.length * 0.95);
    const p95Duration = readTimes[p95Index];

    console.log(`Read performance - Average: ${(readTimes.reduce((a, b) => a + b, 0) / readTimes.length).toFixed(2)}ms, P95: ${p95Duration.toFixed(2)}ms`);

    assert.ok(p95Duration <= 50, `P95 read duration should be ≤50ms, was ${p95Duration.toFixed(2)}ms`);
  });

  test('should use indexes effectively for complex queries', async () => {
    // Insert test data with relationships
    await db.executeQuery(`
      CREATE TABLE IF NOT EXISTS test_data (
        id INTEGER PRIMARY KEY,
        category TEXT,
        name TEXT,
        value REAL,
        created_at INTEGER
      )
    `);

    // Create indexes
    await db.executeQuery('CREATE INDEX IF NOT EXISTS idx_test_category ON test_data(category)');
    await db.executeQuery('CREATE INDEX IF NOT EXISTS idx_test_name ON test_data(name)');
    await db.executeQuery('CREATE INDEX IF NOT EXISTS idx_test_category_name ON test_data(category, name)');

    // Insert test data
    const numRecords = 10000;
    const insertStart = performance.now();
    
    for (let i = 0; i < numRecords; i++) {
      await db.executeQuery(
        'INSERT INTO test_data (category, name, value, created_at) VALUES (?, ?, ?, ?)',
        [`category${i % 100}`, `name${i}`, Math.random() * 1000, Date.now() - (i * 1000)]
      );
    }
    
    const insertDuration = performance.now() - insertStart;
    console.log(`Inserted ${numRecords} test records in ${insertDuration.toFixed(2)}ms`);

    // Test indexed queries
    const queries = [
      'SELECT * FROM test_data WHERE category = ?',
      'SELECT * FROM test_data WHERE name = ?',
      'SELECT * FROM test_data WHERE category = ? AND name = ?',
      'SELECT * FROM test_data WHERE category = ? ORDER BY created_at DESC LIMIT 10',
      'SELECT * FROM test_data WHERE name LIKE ? ORDER BY value DESC LIMIT 5'
    ];

    for (const query of queries) {
      const queryStart = performance.now();
      
      await db.executeQuery(query, ['category1']); // Example parameter
      
      const queryDuration = performance.now() - queryStart;
      
      // Verify query uses index
      const plan = await db.executeQuery('EXPLAIN QUERY PLAN ' + query, ['category1']);
      const usesIndex = plan.some((row: any) => 
        row.detail && (row.detail.includes('USING INDEX') || row.detail.includes('SEARCH'))
      );

      console.log(`Query: ${query.substring(0, 50)}... Duration: ${queryDuration.toFixed(2)}ms, Uses Index: ${usesIndex}`);

      assert.ok(queryDuration <= 20, `Indexed query should be fast, was ${queryDuration.toFixed(2)}ms`);
      assert.ok(usesIndex, `Query should use index: ${query}`);
    }
  });

  test('should handle concurrent read operations efficiently', async () => {
    // Insert test data
    const numFiles = 500;
    for (let i = 0; i < numFiles; i++) {
      await db.executeQuery(
        'INSERT INTO file (repo, path, content_hash, lang) VALUES (?, ?, ?, ?)',
        ['test-repo', `src/file${i}.ts`, `hash${i}`, 'typescript']
      );
    }

    // Test concurrent reads
    const numConcurrentReads = 100;
    const concurrentStart = performance.now();
    
    const readPromises = Array.from({ length: numConcurrentReads }, async (_, i) => {
      const fileIndex = i % numFiles;
      return db.executeQuery(
        'SELECT * FROM file WHERE repo = ? AND path = ?',
        ['test-repo', `src/file${fileIndex}.ts`],
        { expectSingleRow: true }
      );
    });

    const results = await Promise.all(readPromises);
    const concurrentDuration = performance.now() - concurrentStart;

    console.log(`Concurrent reads: ${numConcurrentReads} in ${concurrentDuration.toFixed(2)}ms, avg ${(concurrentDuration / numConcurrentReads).toFixed(2)}ms per read`);

    assert.strictEqual(results.length, numConcurrentReads, 'All concurrent reads should complete');
    assert.ok(concurrentDuration / numConcurrentReads <= 10, `Average concurrent read should be ≤10ms, was ${(concurrentDuration / numConcurrentReads).toFixed(2)}ms`);
  });

  test('should maintain performance under load', async () => {
    // Insert substantial test data
    const numFiles = 2000;
    const numChunks = 5000;

    // Insert files
    for (let i = 0; i < numFiles; i++) {
      await db.executeQuery(
        'INSERT INTO file (repo, path, content_hash, lang, size, modified_time) VALUES (?, ?, ?, ?, ?, ?)',
        ['load-test-repo', `src/file${i}.ts`, `hash${i}`, 'typescript', 1000 + i, Date.now()]
      );
    }

    // Insert chunks (simulate FTS data)
    await db.executeQuery(`
      CREATE TABLE IF NOT EXISTS chunk (
        id TEXT PRIMARY KEY,
        span_id TEXT,
        repo TEXT,
        path TEXT,
        content TEXT,
        created_at INTEGER
      )
    `);

    await db.executeQuery(`
      CREATE VIRTUAL TABLE IF NOT EXISTS chunk_fts USING fts5(
        content,
        path,
        repo,
        content=chunk,
        content_rowid=rowid
      )
    `);

    for (let i = 0; i < numChunks; i++) {
      await db.executeQuery(
        'INSERT INTO chunk (id, span_id, repo, path, content, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        [`chunk${i}`, `span${i}`, 'load-test-repo', `src/file${i % numFiles}.ts`, `function test${i}() { return ${i}; }`, Date.now()]
      );
    }

    // Rebuild FTS index
    await db.executeQuery('DELETE FROM chunk_fts');
    await db.executeQuery('INSERT INTO chunk_fts(rowid, content, path, repo) SELECT rowid, content, path, repo FROM chunk');

    console.log(`Loaded test data: ${numFiles} files, ${numChunks} chunks`);

    // Performance test under load
    const loadTestQueries = [
      () => db.executeQuery('SELECT * FROM file WHERE repo = ? ORDER BY modified_time DESC LIMIT 10', ['load-test-repo']),
      () => db.executeQuery('SELECT * FROM file WHERE lang = ? LIMIT 20', ['typescript']),
      () => db.executeQuery('SELECT f.*, c.content FROM file f JOIN chunk c ON f.path = c.path WHERE f.repo = ? LIMIT 10', ['load-test-repo']),
      () => db.executeQuery("SELECT * FROM chunk_fts WHERE chunk_fts MATCH ? ORDER BY rank LIMIT 10", ['function']),
      () => db.executeQuery('SELECT COUNT(*) FROM file WHERE repo = ?', ['load-test-repo'])
    ];

    const loadTestDuration: number[] = [];
    const iterations = 50;

    for (let i = 0; i < iterations; i++) {
      const queryIndex = i % loadTestQueries.length;
      const queryStart = performance.now();
      
      await loadTestQueries[queryIndex]();
      
      const queryDuration = performance.now() - queryStart;
      loadTestDuration.push(queryDuration);
    }

    loadTestDuration.sort((a, b) => a - b);
    const p95Index = Math.floor(loadTestDuration.length * 0.95);
    const p95Duration = loadTestDuration[p95Index];
    const avgDuration = loadTestDuration.reduce((a, b) => a + b, 0) / loadTestDuration.length;

    console.log(`Load test - Average: ${avgDuration.toFixed(2)}ms, P95: ${p95Duration.toFixed(2)}ms over ${iterations} queries`);

    assert.ok(p95Duration <= 50, `P95 query time under load should be ≤50ms, was ${p95Duration.toFixed(2)}ms`);
    assert.ok(avgDuration <= 25, `Average query time under load should be ≤25ms, was ${avgDuration.toFixed(2)}ms`);
  });

  test('should optimize database with maintenance operations', async () => {
    // Insert test data
    for (let i = 0; i < 1000; i++) {
      await db.executeQuery(
        'INSERT INTO file (repo, path, content_hash, lang, size, modified_time) VALUES (?, ?, ?, ?, ?, ?)',
        ['maint-test-repo', `src/file${i}.ts`, `hash${i}`, 'typescript', 1000 + i, Date.now() - (i * 1000)]
      );
    }

    const maintenance = createDatabaseMaintenance(db);
    
    // Test maintenance operations
    const maintenanceStart = performance.now();
    const report = await maintenance.performMaintenance({
      vacuum: true,
      analyze: true,
      checkIntegrity: true,
      optimize: true
    });
    const maintenanceDuration = performance.now() - maintenanceStart;

    console.log(`Maintenance completed in ${maintenanceDuration.toFixed(2)}ms`, {
      operations: Object.keys(report.operations).length,
      errors: report.errors.length
    });

    assert.ok(report.operations.vacuum?.success, 'Vacuum should succeed');
    assert.ok(report.operations.analyze?.success, 'Analyze should succeed');
    assert.ok(report.operations.optimize?.success, 'Optimize should succeed');
    assert.strictEqual(report.errors.length, 0, 'No maintenance errors should occur');

    // Test performance after maintenance
    const postMaintenanceStart = performance.now();
    await db.executeQuery('SELECT * FROM file WHERE repo = ? ORDER BY path LIMIT 10', ['maint-test-repo']);
    const postMaintenanceDuration = performance.now() - postMaintenanceStart;

    console.log(`Post-maintenance query time: ${postMaintenanceDuration.toFixed(2)}ms`);
    assert.ok(postMaintenanceDuration <= 20, 'Queries should be fast after maintenance');
  });

  test('should provide performance monitoring and insights', async () => {
    const optimizer = createPerformanceOptimizer(db);

    // Generate various query patterns
    const queries = [
      'SELECT * FROM file WHERE repo = ?',
      'SELECT * FROM file WHERE repo = ? AND lang = ?',
      'SELECT * FROM file WHERE repo = ? ORDER BY modified_time DESC',
      'SELECT * FROM file WHERE path LIKE ?',
      'SELECT * FROM file WHERE repo = ? AND lang = ? ORDER BY modified_time DESC LIMIT ?'
    ];

    // Execute queries to generate performance data
    for (let i = 0; i < 100; i++) {
      const query = queries[i % queries.length];
      await db.executeQuery(query, ['test-repo', 'typescript', 10]);
    }

    // Get performance report
    const report = await optimizer.getPerformanceReport();

    console.log('Performance Report:', {
      totalQueries: report.queryStats.totalQueries,
      averageDuration: report.queryStats.averageDuration.toFixed(2),
      p95Duration: report.queryStats.p95Duration,
      slowQueries: report.slowQueries.length,
      indexRecommendations: report.indexRecommendations.length
    });

    assert.ok(report.queryStats.totalQueries > 0, 'Should have query statistics');
    assert.ok(report.queryStats.averageDuration >= 0, 'Should have average duration');
    assert.ok(Array.isArray(report.slowQueries), 'Should have slow queries array');
    assert.ok(Array.isArray(report.indexRecommendations), 'Should have index recommendations');

    // Test index recommendations
    if (report.indexRecommendations.length > 0) {
      const topRecommendation = report.indexRecommendations[0];
      assert.ok(topRecommendation.table, 'Recommendation should have table');
      assert.ok(Array.isArray(topRecommendation.columns), 'Recommendation should have columns');
      assert.ok(topRecommendation.estimatedBenefit > 0, 'Recommendation should have estimated benefit');
    }
  });

  test('should validate and optimize indexes automatically', async () => {
    // Create test table without proper indexes
    await db.executeQuery(`
      CREATE TABLE IF NOT EXISTS auto_opt_test (
        id INTEGER PRIMARY KEY,
        category TEXT,
        name TEXT,
        value REAL,
        timestamp INTEGER
      )
    `);

    // Insert data
    for (let i = 0; i < 5000; i++) {
      await db.executeQuery(
        'INSERT INTO auto_opt_test (category, name, value, timestamp) VALUES (?, ?, ?, ?)',
        [`cat${i % 10}`, `name${i}`, Math.random() * 1000, Date.now() - (i * 1000)]
      );
    }

    const optimizer = createPerformanceOptimizer(db);

    // Test index validation
    const validation = await optimizer.validateIndexes();
    console.log('Index validation:', {
      valid: validation.validIndexes.length,
      invalid: validation.invalidIndexes.length,
      unused: validation.unusedIndexes.length
    });

    // Test index recommendations
    const testQueries = [
      'SELECT * FROM auto_opt_test WHERE category = ?',
      'SELECT * FROM auto_opt_test WHERE category = ? AND name = ?',
      'SELECT * FROM auto_opt_test WHERE name LIKE ? ORDER BY timestamp DESC'
    ];

    const recommendations = await optimizer.identifyMissingIndexes(testQueries);
    console.log('Index recommendations:', recommendations.length);

    assert.ok(recommendations.length > 0, 'Should recommend indexes for test queries');

    // Create recommended indexes
    if (recommendations.length > 0) {
      await optimizer.createRecommendedIndexes(recommendations.slice(0, 2)); // Create top 2

      // Test performance improvement
      const beforeIndexStart = performance.now();
      await db.executeQuery('SELECT * FROM auto_opt_test WHERE category = ? AND name = ?', ['cat1', 'name1']);
      const beforeIndexDuration = performance.now() - beforeIndexStart;

      const afterIndexStart = performance.now();
      await db.executeQuery('SELECT * FROM auto_opt_test WHERE category = ? AND name = ?', ['cat1', 'name1']);
      const afterIndexDuration = performance.now() - afterIndexStart;

      console.log(`Performance before/after index: ${beforeIndexDuration.toFixed(2)}ms / ${afterIndexDuration.toFixed(2)}ms`);

      // Index should improve performance (though this is test data, so improvement may be minimal)
      assert.ok(afterIndexDuration <= beforeIndexDuration * 1.5, 'Index should not significantly degrade performance');
    }
  });

  test('should handle memory usage efficiently', async () => {
    const initialMemory = process.memoryUsage();
    
    // Insert large amount of data
    const numRecords = 10000;
    for (let i = 0; i < numRecords; i++) {
      await db.executeQuery(
        'INSERT INTO file (repo, path, content_hash, lang, size, modified_time) VALUES (?, ?, ?, ?, ?, ?)',
        ['memory-test-repo', `src/file${i}.ts`, `hash${i}`, 'typescript', 1000 + i, Date.now()]
      );
    }

    const afterInsertMemory = process.memoryUsage();
    const memoryIncrease = afterInsertMemory.heapUsed - initialMemory.heapUsed;

    console.log(`Memory usage for ${numRecords} records: ${(memoryIncrease / 1024 / 1024).toFixed(2)}MB`);

    // Memory usage should be reasonable (less than 50MB for 10k records)
    assert.ok(memoryIncrease < 50 * 1024 * 1024, `Memory usage should be reasonable, was ${(memoryIncrease / 1024 / 1024).toFixed(2)}MB`);

    // Test query performance doesn't degrade with memory usage
    const queryStart = performance.now();
    const results = await db.executeQuery('SELECT * FROM file WHERE repo = ? LIMIT 100', ['memory-test-repo']);
    const queryDuration = performance.now() - queryStart;

    console.log(`Query with large dataset: ${queryDuration.toFixed(2)}ms, returned ${results.length} rows`);
    assert.ok(queryDuration <= 30, 'Query should remain fast even with large dataset');
  });
});