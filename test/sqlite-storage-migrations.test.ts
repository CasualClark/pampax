import { test, describe } from 'node:test';
import assert from 'node:assert';
import { Storage } from '../src/storage/index.js';

describe('SQLite Storage Migrations', () => {
  test('should apply migrations from scratch', async () => {
    const storage = Storage.createForTesting();
    await storage.initialize();

    // Check that all tables exist
    const db = storage.dbManager.getDatabase();
    
    const tables = [
      'file', 'span', 'chunk', 'embedding', 'chunk_fts', 'reference',
      'job_run', 'rerank_cache', 'search_log', 'schema_migrations'
    ];

    for (const table of tables) {
      const result = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).get(table);
      assert.ok(result, `Table ${table} should exist`);
    }

    // Check migration version
    const migrations = db.prepare('SELECT version FROM schema_migrations ORDER BY version').all() as Array<{ version: number }>;
    assert.ok(migrations.length >= 3, 'Should have at least 3 migrations');
    assert.strictEqual(migrations[0].version, 1, 'First migration should be version 1');
    assert.strictEqual(migrations[1].version, 2, 'Second migration should be version 2');
    assert.strictEqual(migrations[2].version, 3, 'Third migration should be version 3');

    await storage.close();
  });

  test('should handle re-initialization without reapplying migrations', async () => {
    const storage = Storage.createForTesting();
    await storage.initialize();

    // Get initial migration count
    const db = storage.dbManager.getDatabase();
    const initialMigrations = db.prepare('SELECT COUNT(*) as count FROM schema_migrations').get() as { count: number };
    
    await storage.close();

    // Re-initialize same storage
    const storage2 = Storage.createForTesting();
    await storage2.initialize();

    const db2 = storage2.dbManager.getDatabase();
    const finalMigrations = db2.prepare('SELECT COUNT(*) as count FROM schema_migrations').get() as { count: number };
    
    assert.strictEqual(finalMigrations.count, initialMigrations.count, 'Should not reapply migrations');

    await storage2.close();
  });

  test('should create proper indexes', async () => {
    const storage = Storage.createForTesting();
    await storage.initialize();

    const db = storage.dbManager.getDatabase();
    
    // Check that indexes exist
    const expectedIndexes = [
      'idx_file_repo_path',
      'idx_file_content_hash',
      'idx_span_repo_path',
      'idx_span_path_range',
      'idx_span_kind',
      'idx_chunk_span_id',
      'idx_chunk_repo_path',
      'idx_chunk_created_at',
      'idx_embedding_model',
      'idx_reference_src_span',
      'idx_reference_dst_path',
      'idx_job_run_kind',
      'idx_job_run_status',
      'idx_job_run_started_at',
      'idx_rerank_cache_provider',
      'idx_rerank_cache_model',
      'idx_rerank_cache_created_at',
      'idx_search_log_ts',
      'idx_search_log_query'
    ];

    for (const indexName of expectedIndexes) {
      const result = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name=?").get(indexName);
      assert.ok(result, `Index ${indexName} should exist`);
    }

    await storage.close();
  });

  test('should configure database pragmas correctly', async () => {
    const storage = Storage.createForTesting();
    await storage.initialize();

    const db = storage.dbManager.getDatabase();
    
    // Check WAL mode
    const journalMode = db.prepare('PRAGMA journal_mode').get() as { journal_mode: string };
    assert.strictEqual(journalMode.journal_mode, 'wal', 'Journal mode should be WAL');

    // Check synchronous mode
    const synchronous = db.prepare('PRAGMA synchronous').get() as { synchronous: number };
    assert.strictEqual(synchronous.synchronous, 1, 'Synchronous should be NORMAL (1)');

    // Check temp store
    const tempStore = db.prepare('PRAGMA temp_store').get() as { temp_store: number };
    assert.strictEqual(tempStore.temp_store, 2, 'Temp store should be MEMORY (2)');

    // Check foreign keys
    const foreignKeys = db.prepare('PRAGMA foreign_keys').get() as { foreign_keys: number };
    assert.strictEqual(foreignKeys.foreign_keys, 1, 'Foreign keys should be enabled');

    await storage.close();
  });

  test('should create FTS triggers correctly', async () => {
    const storage = Storage.createForTesting();
    await storage.initialize();

    const db = storage.dbManager.getDatabase();
    
    // Check that triggers exist
    const triggers = ['chunk_fts_insert', 'chunk_fts_delete', 'chunk_fts_update'];
    
    for (const triggerName of triggers) {
      const result = db.prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND name=?").get(triggerName);
      assert.ok(result, `Trigger ${triggerName} should exist`);
    }

    // Test that triggers work by inserting a chunk
    const chunkId = storage.operations.chunks.insert({
      span_id: 'test-span',
      repo: 'test-repo',
      path: 'test.ts',
      content: 'test content for FTS'
    });

    // Check that FTS table was updated
    const ftsResult = db.prepare('SELECT chunk_id FROM chunk_fts WHERE chunk_id=?').get(chunkId);
    assert.ok(ftsResult, 'FTS trigger should update chunk_fts table');

    await storage.close();
  });

  test('should handle foreign key constraints', async () => {
    const storage = Storage.createForTesting();
    await storage.initialize();

    // Try to insert a chunk with non-existent span ID (should fail)
    assert.throws(() => {
      storage.operations.chunks.insert({
        span_id: 'non-existent-span',
        repo: 'test-repo',
        path: 'test.ts',
        content: 'test content'
      });
    }, /FOREIGN KEY constraint failed/);

    // Try to insert an embedding with non-existent chunk ID (should fail)
    assert.throws(() => {
      storage.operations.embeddings.insert({
        chunk_id: 'non-existent-chunk',
        model: 'test-model',
        dim: 3,
        vector: Buffer.from([1, 2, 3])
      });
    }, /FOREIGN KEY constraint failed/);

    // Try to insert a reference with non-existent span ID (should fail)
    assert.throws(() => {
      storage.operations.references.insert({
        dst_path: 'test.ts',
        byte_start: 0,
        byte_end: 10,
        kind: 'call'
      }, 'non-existent-span');
    }, /FOREIGN KEY constraint failed/);

    await storage.close();
  });

  test('should handle cascade deletes correctly', async () => {
    const storage = Storage.createForTesting();
    await storage.initialize();

    // Insert a span
    const spanId = storage.operations.spans.insert({
      repo: 'test-repo',
      path: 'test.ts',
      byte_start: 0,
      byte_end: 100,
      kind: 'function',
      name: 'testFunction'
    });

    // Insert a chunk for that span
    const chunkId = storage.operations.chunks.insert({
      span_id: spanId,
      repo: 'test-repo',
      path: 'test.ts',
      content: 'test content'
    });

    // Insert an embedding for that chunk
    storage.operations.embeddings.insert({
      chunk_id: chunkId,
      model: 'test-model',
      dim: 3,
      vector: Buffer.from([1, 2, 3])
    });

    // Insert a reference from that span
    storage.operations.references.insert({
      dst_path: 'other.ts',
      byte_start: 0,
      byte_end: 10,
      kind: 'call'
    }, spanId);

    // Verify everything exists
    assert.ok(storage.operations.spans.findById(spanId), 'Span should exist');
    assert.ok(storage.operations.chunks.findById(chunkId), 'Chunk should exist');
    assert.ok(storage.operations.embeddings.findByChunkId(chunkId).length > 0, 'Embedding should exist');
    assert.ok(storage.operations.references.findBySrcSpanId(spanId).length > 0, 'Reference should exist');

    // Delete the span (should cascade)
    const deleted = storage.operations.spans.delete(spanId);
    assert.strictEqual(deleted, true, 'Span should be deleted');

    // Verify cascade worked
    assert.strictEqual(storage.operations.spans.findById(spanId), undefined, 'Span should be gone');
    assert.strictEqual(storage.operations.chunks.findById(chunkId), undefined, 'Chunk should be gone');
    assert.strictEqual(storage.operations.embeddings.findByChunkId(chunkId).length, 0, 'Embedding should be gone');
    assert.strictEqual(storage.operations.references.findBySrcSpanId(spanId).length, 0, 'Reference should be gone');

    await storage.close();
  });

  test('should support rollback functionality', async () => {
    const storage = Storage.createForTesting();
    await storage.initialize();

    // Check current version
    const db = storage.dbManager.getDatabase();
    const currentVersion = (db.prepare('SELECT MAX(version) as version FROM schema_migrations').get() as { version: number }).version;
    assert.ok(currentVersion >= 3, 'Should be at version 3 or higher');

    // Rollback to version 2
    await storage.dbManager.rollbackMigration(2);

    // Check version after rollback
    const rolledBackVersion = (db.prepare('SELECT MAX(version) as version FROM schema_migrations').get() as { version: number }).version;
    assert.strictEqual(rolledBackVersion, 2, 'Should be at version 2 after rollback');

    // Check that version 3 tables/triggers are gone
    const triggers = db.prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE 'chunk_fts%'").all() as Array<{ name: string }>;
    assert.strictEqual(triggers.length, 0, 'FTS triggers should be gone after rollback');

    // Re-migrate to current version
    await storage.dbManager.initialize(); // This will re-run pending migrations

    const finalVersion = (db.prepare('SELECT MAX(version) as version FROM schema_migrations').get() as { version: number }).version;
    assert.strictEqual(finalVersion, currentVersion, 'Should be back to current version after re-migration');

    await storage.close();
  });
});