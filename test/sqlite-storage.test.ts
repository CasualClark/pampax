import { test, describe } from 'node:test';
import assert from 'node:assert';
import { Storage, HashUtils } from '../src/storage/index.js';
import { SpanKind } from '../src/types/core.js';

describe('SQLite Storage Layer', () => {
  let storage: Storage;

  test('should initialize storage successfully', async () => {
    storage = Storage.createForTesting();
    await storage.initialize();
    
    const health = storage.healthCheck();
    assert.strictEqual(health.healthy, true, 'Storage should be healthy');
  });

  test('should create and query file records', async () => {
    const fileRecord = {
      repo: 'test-repo',
      path: 'src/test.ts',
      content_hash: HashUtils.sha256('test content'),
      lang: 'typescript'
    };

    const id = storage.operations.files.insert(fileRecord);
    assert.ok(id, 'File record should be created with ID');

    const retrieved = storage.operations.files.findByPath('test-repo', 'src/test.ts');
    assert.ok(retrieved, 'File record should be retrievable');
    assert.strictEqual(retrieved!.path, 'src/test.ts');
    assert.strictEqual(retrieved!.content_hash, fileRecord.content_hash);
  });

  test('should handle bulk file insertions', async () => {
    const files = [
      {
        repo: 'test-repo',
        path: 'src/file1.ts',
        content_hash: HashUtils.sha256('content1'),
        lang: 'typescript'
      },
      {
        repo: 'test-repo',
        path: 'src/file2.ts',
        content_hash: HashUtils.sha256('content2'),
        lang: 'typescript'
      }
    ];

    const ids = storage.operations.files.insertBulk(files);
    assert.strictEqual(ids.length, 2, 'Should create 2 file records');

    const retrieved = storage.operations.files.findByRepo('test-repo');
    assert.ok(retrieved.length >= 2, 'Should find at least 2 files');
  });

  test('should create and query span records', async () => {
    const spanRecord = {
      repo: 'test-repo',
      path: 'src/test.ts',
      byte_start: 0,
      byte_end: 100,
      kind: 'function' as SpanKind,
      name: 'testFunction',
      signature: 'function testFunction() {}',
      doc: 'Test function documentation',
      parents: JSON.stringify(['module'])
    };

    const id = storage.operations.spans.insert(spanRecord);
    assert.ok(id, 'Span record should be created with ID');

    const retrieved = storage.operations.spans.findById(id);
    assert.ok(retrieved, 'Span record should be retrievable');
    assert.strictEqual(retrieved!.name, 'testFunction');
    assert.strictEqual(retrieved!.kind, 'function');
  });

  test('should find spans by path and range', async () => {
    const spans = storage.operations.spans.findByPath('test-repo', 'src/test.ts');
    assert.ok(spans.length > 0, 'Should find spans by path');

    const rangeSpans = storage.operations.spans.findByRange('test-repo', 'src/test.ts', 10, 90);
    assert.ok(rangeSpans.length > 0, 'Should find spans in range');
  });

  test('should create and query chunk records', async () => {
    const spanId = HashUtils.hashSpanId(
      'test-repo',
      'src/test.ts',
      0,
      100,
      'function',
      'testFunction',
      'function testFunction() {}',
      'Test function',
      ['module']
    );

    const chunkRecord = {
      span_id: spanId,
      repo: 'test-repo',
      path: 'src/test.ts',
      content: 'function testFunction() {\n  return true;\n}'
    };

    const id = storage.operations.chunks.insert(chunkRecord);
    assert.ok(id, 'Chunk record should be created with ID');

    const retrieved = storage.operations.chunks.findById(id);
    assert.ok(retrieved, 'Chunk record should be retrievable');
    assert.strictEqual(retrieved!.content, chunkRecord.content);
  });

  test('should find chunks for embedding', async () => {
    const chunksForEmbedding = storage.operations.chunks.findForEmbedding(10, 0);
    assert.ok(Array.isArray(chunksForEmbedding), 'Should return array of chunks');
  });

  test('should create and query embedding records', async () => {
    const chunkId = HashUtils.hashChunkId('test-span', HashUtils.sha256('test content'));
    
    // First create a chunk
    storage.operations.chunks.insert({
      span_id: 'test-span',
      repo: 'test-repo',
      path: 'src/test.ts',
      content: 'test content'
    });

    const embeddingRecord = {
      chunk_id: chunkId,
      model: 'test-model',
      dim: 3,
      vector: Buffer.from([1.0, 2.0, 3.0])
    };

    storage.operations.embeddings.insert(embeddingRecord);

    const retrieved = storage.operations.embeddings.findByChunkId(chunkId);
    assert.ok(retrieved.length > 0, 'Embedding record should be retrievable');
    assert.strictEqual(retrieved[0].model, 'test-model');
    assert.strictEqual(retrieved[0].dim, 3);
  });

  test('should perform FTS search', async () => {
    // First ensure we have some chunks with content
    const testContent = 'function testFunction() {\n  return "hello world";\n}';
    storage.operations.chunks.insert({
      span_id: 'fts-test-span',
      repo: 'test-repo',
      path: 'src/fts-test.ts',
      content: testContent
    });

    // Rebuild FTS index to ensure it's up to date
    storage.operations.fts.rebuildIndex();

    const results = storage.operations.fts.search('hello world', 5);
    assert.ok(Array.isArray(results), 'FTS search should return array');
    
    if (results.length > 0) {
      assert.ok(results[0].content.includes('hello world'), 'Results should contain search term');
    }
  });

  test('should create and query reference records', async () => {
    const srcSpanId = HashUtils.hashSpanId(
      'test-repo',
      'src/caller.ts',
      0,
      50,
      'function',
      'caller',
      'function caller() {}',
      '',
      []
    );

    const referenceRecord = {
      dst_path: 'src/callee.ts',
      byte_start: 10,
      byte_end: 20,
      kind: 'call'
    };

    storage.operations.references.insert(referenceRecord, srcSpanId);

    const retrieved = storage.operations.references.findBySrcSpanId(srcSpanId);
    assert.ok(retrieved.length > 0, 'Reference record should be retrievable');
    assert.strictEqual(retrieved[0].dst_path, 'src/callee.ts');
  });

  test('should create and query job run records', async () => {
    const jobRecord = {
      id: 'test-job-123',
      kind: 'index',
      status: 'ok' as const
    };

    const id = storage.operations.jobRuns.insert(jobRecord);
    assert.strictEqual(id, 'test-job-123', 'Job ID should be returned');

    const retrieved = storage.operations.jobRuns.findById('test-job-123');
    assert.ok(retrieved, 'Job record should be retrievable');
    assert.strictEqual(retrieved!.kind, 'index');
    assert.strictEqual(retrieved!.status, 'ok');

    // Update status
    storage.operations.jobRuns.updateStatus('test-job-123', 'error', 'Test error');
    const updated = storage.operations.jobRuns.findById('test-job-123');
    assert.strictEqual(updated!.status, 'error');
    assert.strictEqual(updated!.error_text, 'Test error');
  });

  test('should create and query rerank cache records', async () => {
    const cacheRecord = {
      id: 'test-cache-id',
      provider: 'test-provider',
      model: 'test-model',
      query: 'test query',
      result_json: '{"results": []}'
    };

    const id = storage.operations.rerankCache.insert(cacheRecord);
    assert.ok(id, 'Cache record should be created with ID');

    const retrieved = storage.operations.rerankCache.get('test-provider', 'test-model', 'test query');
    assert.ok(retrieved, 'Cache record should be retrievable');
    assert.strictEqual(retrieved!.provider, 'test-provider');
    assert.strictEqual(retrieved!.query, 'test query');
  });

  test('should create and query search log records', async () => {
    const logRecord = {
      query: 'test search query',
      ts: Date.now(),
      k: 10
    };

    const id = storage.operations.searchLog.insert(logRecord);
    assert.ok(id, 'Search log record should be created with ID');

    const recent = storage.operations.searchLog.findRecent(1);
    assert.ok(recent.length > 0, 'Should find recent search logs');
    assert.strictEqual(recent[0].query, 'test search query');
  });

  test('should handle transactions correctly', async () => {
    const initialFileCount = storage.operations.files.findByRepo('transaction-test').length;

    try {
      storage.transaction(() => {
        storage.operations.files.insert({
          repo: 'transaction-test',
          path: 'file1.ts',
          content_hash: HashUtils.sha256('content1'),
          lang: 'typescript'
        });
        
        storage.operations.files.insert({
          repo: 'transaction-test',
          path: 'file2.ts',
          content_hash: HashUtils.sha256('content2'),
          lang: 'typescript'
        });

        // Simulate an error to test rollback
        throw new Error('Intentional error for transaction test');
      });
    } catch (error) {
      // Expected error
    }

    const finalFileCount = storage.operations.files.findByRepo('transaction-test').length;
    assert.strictEqual(finalFileCount, initialFileCount, 'Transaction should rollback on error');
  });

  test('should perform successful transaction', async () => {
    const initialFileCount = storage.operations.files.findByRepo('transaction-success').length;

    storage.transaction(() => {
      storage.operations.files.insert({
        repo: 'transaction-success',
        path: 'success1.ts',
        content_hash: HashUtils.sha256('success1'),
        lang: 'typescript'
      });
      
      storage.operations.files.insert({
        repo: 'transaction-success',
        path: 'success2.ts',
        content_hash: HashUtils.sha256('success2'),
        lang: 'typescript'
      });
    });

    const finalFileCount = storage.operations.files.findByRepo('transaction-success').length;
    assert.strictEqual(finalFileCount, initialFileCount + 2, 'Transaction should commit all changes');
  });

  test('HashUtils should generate consistent hashes', () => {
    const content1 = 'test content';
    const content2 = 'test content';
    const content3 = 'different content';

    const hash1 = HashUtils.sha256(content1);
    const hash2 = HashUtils.sha256(content2);
    const hash3 = HashUtils.sha256(content3);

    assert.strictEqual(hash1, hash2, 'Same content should produce same hash');
    assert.notStrictEqual(hash1, hash3, 'Different content should produce different hash');
  });

  test('HashUtils should generate correct span IDs', () => {
    const spanId1 = HashUtils.hashSpanId(
      'test-repo',
      'src/test.ts',
      0,
      100,
      'function',
      'testFunction',
      'function testFunction() {}',
      'Test documentation',
      ['module', 'class']
    );

    const spanId2 = HashUtils.hashSpanId(
      'test-repo',
      'src/test.ts',
      0,
      100,
      'function',
      'testFunction',
      'function testFunction() {}',
      'Test documentation',
      ['module', 'class']
    );

    const spanId3 = HashUtils.hashSpanId(
      'different-repo',
      'src/test.ts',
      0,
      100,
      'function',
      'testFunction',
      'function testFunction() {}',
      'Test documentation',
      ['module', 'class']
    );

    assert.strictEqual(spanId1, spanId2, 'Same span data should produce same ID');
    assert.notStrictEqual(spanId1, spanId3, 'Different repo should produce different ID');
  });

  test('should cleanup properly', async () => {
    await storage.close();
    // If we get here without errors, cleanup was successful
    assert.ok(true, 'Storage should close without errors');
  });
});

describe('Storage Health and Stats', () => {
  test('should provide database statistics', async () => {
    const storage = Storage.createForTesting();
    await storage.initialize();

    const stats = storage.getStats();
    assert.ok(stats.database, 'Should provide database stats');
    assert.ok(typeof stats.database.version === 'string', 'Should include SQLite version');
    assert.ok(typeof stats.database.pageCount === 'number', 'Should include page count');
    assert.ok(typeof stats.database.size === 'number', 'Should include database size');

    await storage.close();
  });

  test('should perform comprehensive health check', async () => {
    const storage = Storage.createForTesting();
    await storage.initialize();

    const health = storage.healthCheck();
    assert.strictEqual(health.healthy, true, 'Storage should be healthy');
    assert.ok(health.operations, 'Should provide operation health details');
    assert.strictEqual(health.operations.database, true, 'Database should be healthy');
    assert.strictEqual(health.operations.file, true, 'File table should be healthy');
    assert.strictEqual(health.operations.span, true, 'Span table should be healthy');
    assert.strictEqual(health.operations.chunk, true, 'Chunk table should be healthy');
    assert.strictEqual(health.operations.embedding, true, 'Embedding table should be healthy');
    assert.strictEqual(health.operations.chunk_fts, true, 'FTS table should be healthy');
    assert.strictEqual(health.operations.reference, true, 'Reference table should be healthy');
    assert.strictEqual(health.operations.job_run, true, 'Job run table should be healthy');
    assert.strictEqual(health.operations.rerank_cache, true, 'Rerank cache table should be healthy');
    assert.strictEqual(health.operations.search_log, true, 'Search log table should be healthy');

    await storage.close();
  });
});