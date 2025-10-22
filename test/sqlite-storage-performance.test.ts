import { test, describe } from 'node:test';
import assert from 'node:assert';
import { performance } from 'node:perf_hooks';
import { Storage, HashUtils } from '../src/storage/index.js';

describe('SQLite Storage Performance Tests', () => {
  let storage: Storage;

  test('should handle bulk file insertions efficiently', async () => {
    storage = Storage.createForTesting();
    await storage.initialize();

    const numFiles = 1000;
    const files = Array.from({ length: numFiles }, (_, i) => ({
      repo: 'perf-test-repo',
      path: `src/file${i}.ts`,
      content_hash: HashUtils.sha256(`content for file ${i}`),
      lang: 'typescript'
    }));

    const startTime = performance.now();
    const ids = storage.operations.files.insertBulk(files);
    const endTime = performance.now();

    assert.strictEqual(ids.length, numFiles, 'Should insert all files');
    const duration = endTime - startTime;
    console.log(`Bulk insert ${numFiles} files in ${duration.toFixed(2)}ms (${(numFiles / duration * 1000).toFixed(0)} files/sec)`);
    
    // Should be reasonably fast (less than 1 second for 1000 files)
    assert.ok(duration < 1000, `Bulk insert should be fast, took ${duration}ms`);

    await storage.close();
  });

  test('should handle bulk span insertions efficiently', async () => {
    storage = Storage.createForTesting();
    await storage.initialize();

    const numSpans = 2000;
    const spans = Array.from({ length: numSpans }, (_, i) => ({
      repo: 'perf-test-repo',
      path: `src/file${i % 100}.ts`,
      byte_start: i * 10,
      byte_end: i * 10 + 9,
      kind: 'function' as const,
      name: `function${i}`,
      signature: `function function${i}() {}`,
      doc: `Documentation for function ${i}`,
      parents: JSON.stringify(['module'])
    }));

    const startTime = performance.now();
    const ids = storage.operations.spans.insertBulk(spans);
    const endTime = performance.now();

    assert.strictEqual(ids.length, numSpans, 'Should insert all spans');
    const duration = endTime - startTime;
    console.log(`Bulk insert ${numSpans} spans in ${duration.toFixed(2)}ms (${(numSpans / duration * 1000).toFixed(0)} spans/sec)`);
    
    // Should be reasonably fast
    assert.ok(duration < 2000, `Bulk span insert should be fast, took ${duration}ms`);

    await storage.close();
  });

  test('should handle bulk chunk insertions efficiently', async () => {
    storage = Storage.createForTesting();
    await storage.initialize();

    const numChunks = 1500;
    const chunks = Array.from({ length: numChunks }, (_, i) => ({
      span_id: `span-${i % 100}`,
      repo: 'perf-test-repo',
      path: `src/file${i % 100}.ts`,
      content: `// Chunk content ${i}\nfunction chunk${i}() {\n  return ${i};\n}`
    }));

    const startTime = performance.now();
    const ids = storage.operations.chunks.insertBulk(chunks);
    const endTime = performance.now();

    assert.strictEqual(ids.length, numChunks, 'Should insert all chunks');
    const duration = endTime - startTime;
    console.log(`Bulk insert ${numChunks} chunks in ${duration.toFixed(2)}ms (${(numChunks / duration * 1000).toFixed(0)} chunks/sec)`);
    
    // Should be reasonably fast
    assert.ok(duration < 3000, `Bulk chunk insert should be fast, took ${duration}ms`);

    await storage.close();
  });

  test('should handle FTS search efficiently', async () => {
    storage = Storage.createForTesting();
    await storage.initialize();

    // Insert test data
    const numChunks = 500;
    const chunks = Array.from({ length: numChunks }, (_, i) => ({
      span_id: `span-${i}`,
      repo: 'search-test-repo',
      path: `src/file${i}.ts`,
      content: `function testFunction${i}() {\n  // This is a test function with number ${i}\n  return "result ${i}";\n}`
    }));

    storage.operations.chunks.insertBulk(chunks);
    storage.operations.fts.rebuildIndex();

    // Perform multiple searches
    const numSearches = 100;
    const startTime = performance.now();
    
    for (let i = 0; i < numSearches; i++) {
      const results = storage.operations.fts.search(`function ${i % 10}`, 10);
      assert.ok(Array.isArray(results), 'Search should return array');
    }
    
    const endTime = performance.now();
    const duration = endTime - startTime;
    const avgSearchTime = duration / numSearches;
    
    console.log(`Performed ${numSearches} FTS searches in ${duration.toFixed(2)}ms (avg ${avgSearchTime.toFixed(2)}ms per search)`);
    
    // Average search should be fast (less than 10ms per search)
    assert.ok(avgSearchTime < 10, `Average search time should be fast, was ${avgSearchTime}ms`);

    await storage.close();
  });

  test('should handle concurrent operations efficiently', async () => {
    storage = Storage.createForTesting();
    await storage.initialize();

    // Insert test data
    const numFiles = 100;
    const files = Array.from({ length: numFiles }, (_, i) => ({
      repo: 'concurrent-test-repo',
      path: `src/concurrent${i}.ts`,
      content_hash: HashUtils.sha256(`concurrent content ${i}`),
      lang: 'typescript'
    }));

    storage.operations.files.insertBulk(files);

    // Perform concurrent reads
    const numReads = 50;
    const startTime = performance.now();
    
    const readPromises = Array.from({ length: numReads }, async (_, i) => {
      return storage.operations.files.findByPath('concurrent-test-repo', `src/concurrent${i % numFiles}.ts`);
    });

    const results = await Promise.all(readPromises);
    const endTime = performance.now();
    const duration = endTime - startTime;
    
    assert.strictEqual(results.length, numReads, 'Should complete all reads');
    assert.ok(results.every(r => r !== undefined), 'All reads should succeed');
    
    console.log(`Performed ${numReads} concurrent reads in ${duration.toFixed(2)}ms (avg ${(duration / numReads).toFixed(2)}ms per read)`);
    
    // Concurrent reads should be fast
    assert.ok(duration < 1000, `Concurrent reads should be fast, took ${duration}ms`);

    await storage.close();
  });

  test('should handle large transactions efficiently', async () => {
    storage = Storage.createForTesting();
    await storage.initialize();

    const numOperations = 1000;
    const startTime = performance.now();
    
    storage.transaction(() => {
      for (let i = 0; i < numOperations; i++) {
        storage.operations.files.insert({
          repo: 'transaction-test-repo',
          path: `src/tx_file${i}.ts`,
          content_hash: HashUtils.sha256(`transaction content ${i}`),
          lang: 'typescript'
        });
      }
    });
    
    const endTime = performance.now();
    const duration = endTime - startTime;
    
    console.log(`Performed ${numOperations} operations in single transaction in ${duration.toFixed(2)}ms (${(numOperations / duration * 1000).toFixed(0)} ops/sec)`);
    
    // Transaction should be efficient
    assert.ok(duration < 2000, `Large transaction should be efficient, took ${duration}ms`);

    // Verify all data was inserted
    const files = storage.operations.files.findByRepo('transaction-test-repo');
    assert.strictEqual(files.length, numOperations, 'All operations should be committed');

    await storage.close();
  });

  test('should maintain performance with indexes', async () => {
    storage = Storage.createForTesting();
    await storage.initialize();

    // Insert test data
    const numSpans = 2000;
    const spans = Array.from({ length: numSpans }, (_, i) => ({
      repo: 'index-test-repo',
      path: `src/file${i % 50}.ts`,
      byte_start: i * 10,
      byte_end: i * 10 + 9,
      kind: i % 3 === 0 ? 'function' : i % 3 === 1 ? 'class' : 'method',
      name: `item${i}`,
      signature: `signature for item ${i}`,
      doc: `documentation for item ${i}`,
      parents: JSON.stringify(['module'])
    }));

    storage.operations.spans.insertBulk(spans);

    // Test indexed queries
    const startTime = performance.now();
    
    // Query by path (should use index)
    const pathResults = storage.operations.spans.findByPath('index-test-repo', 'src/file0.ts');
    assert.ok(pathResults.length > 0, 'Should find spans by path');
    
    // Query by kind (should use index)
    const kindResults = storage.operations.spans.findByKind('index-test-repo', 'function');
    assert.ok(kindResults.length > 0, 'Should find spans by kind');
    
    // Query by name (should use index)
    const nameResults = storage.operations.spans.findByName('index-test-repo', 'item0');
    assert.ok(nameResults.length > 0, 'Should find spans by name');
    
    const endTime = performance.now();
    const duration = endTime - startTime;
    
    console.log(`Performed indexed queries in ${duration.toFixed(2)}ms`);
    
    // Indexed queries should be very fast
    assert.ok(duration < 100, `Indexed queries should be very fast, took ${duration}ms`);

    await storage.close();
  });

  test('should handle memory usage efficiently', async () => {
    storage = Storage.createForTesting();
    await storage.initialize();

    // Get initial memory usage
    const initialMemory = process.memoryUsage();

    // Insert large amount of data
    const numChunks = 2000;
    const chunks = Array.from({ length: numChunks }, (_, i) => ({
      span_id: `span-${i}`,
      repo: 'memory-test-repo',
      path: `src/file${i}.ts`,
      content: `// Large content for chunk ${i}\n${'x'.repeat(1000)}\nfunction large${i}() {\n  return "${'y'.repeat(1000)}";\n}`
    }));

    storage.operations.chunks.insertBulk(chunks);

    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }

    const afterInsertMemory = process.memoryUsage();
    const memoryIncrease = afterInsertMemory.heapUsed - initialMemory.heapUsed;

    console.log(`Memory increase for ${numChunks} chunks: ${(memoryIncrease / 1024 / 1024).toFixed(2)}MB`);
    
    // Memory usage should be reasonable (less than 100MB for 2000 chunks with large content)
    assert.ok(memoryIncrease < 100 * 1024 * 1024, `Memory usage should be reasonable, increased by ${(memoryIncrease / 1024 / 1024).toFixed(2)}MB`);

    await storage.close();
  });
});