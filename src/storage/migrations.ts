import { Migration } from './database.js';
import { logger } from '../config/logger.js';
import { createHash } from 'crypto';

export const migrations: Migration[] = [
  {
    version: 1,
    name: 'create_base_tables',
    up: (db) => {
      logger.info('Creating base tables');
      
      // File table
      db.exec(`
        CREATE TABLE IF NOT EXISTS file (
          id INTEGER PRIMARY KEY,
          repo TEXT NOT NULL,
          path TEXT NOT NULL,
          content_hash TEXT NOT NULL,
          lang TEXT NOT NULL,
          UNIQUE(repo, path)
        )
      `);

      // Span table
      db.exec(`
        CREATE TABLE IF NOT EXISTS span (
          id TEXT PRIMARY KEY,
          repo TEXT NOT NULL,
          path TEXT NOT NULL,
          byte_start INTEGER NOT NULL,
          byte_end INTEGER NOT NULL,
          kind TEXT NOT NULL,
          name TEXT,
          signature TEXT,
          doc TEXT,
          parents TEXT
        )
      `);

      // Chunk table
      db.exec(`
        CREATE TABLE IF NOT EXISTS chunk (
          id TEXT PRIMARY KEY,
          span_id TEXT NOT NULL REFERENCES span(id) ON DELETE CASCADE,
          repo TEXT NOT NULL,
          path TEXT NOT NULL,
          content TEXT NOT NULL,
          created_at INTEGER NOT NULL
        )
      `);

      // Embedding table
      db.exec(`
        CREATE TABLE IF NOT EXISTS embedding (
          chunk_id TEXT NOT NULL REFERENCES chunk(id) ON DELETE CASCADE,
          model TEXT NOT NULL,
          dim INTEGER NOT NULL,
          vector BLOB NOT NULL,
          created_at INTEGER NOT NULL,
          PRIMARY KEY (chunk_id, model)
        )
      `);

      // FTS virtual table
      db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS chunk_fts USING fts5(
          chunk_id UNINDEXED,
          repo,
          path,
          content,
          tokenize='porter'
        )
      `);

      // Reference table
      db.exec(`
        CREATE TABLE IF NOT EXISTS reference (
          src_span_id TEXT NOT NULL REFERENCES span(id) ON DELETE CASCADE,
          dst_path TEXT NOT NULL,
          byte_start INTEGER NOT NULL,
          byte_end INTEGER NOT NULL,
          kind TEXT
        )
      `);

      // Create indexes for performance
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_file_repo_path ON file(repo, path);
        CREATE INDEX IF NOT EXISTS idx_file_content_hash ON file(content_hash);
        CREATE INDEX IF NOT EXISTS idx_span_repo_path ON span(repo, path);
        CREATE INDEX IF NOT EXISTS idx_span_path_range ON span(path, byte_start, byte_end);
        CREATE INDEX IF NOT EXISTS idx_span_kind ON span(kind);
        CREATE INDEX IF NOT EXISTS idx_chunk_span_id ON chunk(span_id);
        CREATE INDEX IF NOT EXISTS idx_chunk_repo_path ON chunk(repo, path);
        CREATE INDEX IF NOT EXISTS idx_chunk_created_at ON chunk(created_at);
        CREATE INDEX IF NOT EXISTS idx_embedding_model ON embedding(model);
        CREATE INDEX IF NOT EXISTS idx_reference_src_span ON reference(src_span_id);
        CREATE INDEX IF NOT EXISTS idx_reference_dst_path ON reference(dst_path);
      `);
    },
    down: (db) => {
      logger.info('Dropping base tables');
      db.exec(`
        DROP TABLE IF EXISTS reference;
        DROP TABLE IF EXISTS chunk_fts;
        DROP TABLE IF EXISTS embedding;
        DROP TABLE IF EXISTS chunk;
        DROP TABLE IF EXISTS span;
        DROP TABLE IF EXISTS file;
      `);
    }
  },

  {
    version: 2,
    name: 'create_cli_support_tables',
    up: (db) => {
      logger.info('Creating CLI support tables');
      
      // Job run table
      db.exec(`
        CREATE TABLE IF NOT EXISTS job_run (
          id TEXT PRIMARY KEY,
          kind TEXT NOT NULL,
          started_at INTEGER,
          finished_at INTEGER,
          status TEXT CHECK(status IN ('ok','error')) DEFAULT 'ok',
          error_text TEXT
        )
      `);

      // Rerank cache table
      db.exec(`
        CREATE TABLE IF NOT EXISTS rerank_cache (
          id TEXT PRIMARY KEY,
          provider TEXT NOT NULL,
          model TEXT,
          query TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          result_json TEXT NOT NULL
        )
      `);

      // Search log table
      db.exec(`
        CREATE TABLE IF NOT EXISTS search_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          query TEXT NOT NULL,
          ts INTEGER NOT NULL,
          k INTEGER NOT NULL
        )
      `);

      // Create indexes for CLI tables
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_job_run_kind ON job_run(kind);
        CREATE INDEX IF NOT EXISTS idx_job_run_status ON job_run(status);
        CREATE INDEX IF NOT EXISTS idx_job_run_started_at ON job_run(started_at);
        CREATE INDEX IF NOT EXISTS idx_rerank_cache_provider ON rerank_cache(provider);
        CREATE INDEX IF NOT EXISTS idx_rerank_cache_model ON rerank_cache(model);
        CREATE INDEX IF NOT EXISTS idx_rerank_cache_created_at ON rerank_cache(created_at);
        CREATE INDEX IF NOT EXISTS idx_search_log_ts ON search_log(ts);
        CREATE INDEX IF NOT EXISTS idx_search_log_query ON search_log(query);
      `);
    },
    down: (db) => {
      logger.info('Dropping CLI support tables');
      db.exec(`
        DROP TABLE IF EXISTS search_log;
        DROP TABLE IF EXISTS rerank_cache;
        DROP TABLE IF EXISTS job_run;
      `);
    }
  },

  {
    version: 3,
    name: 'add_triggers_for_fts_sync',
    up: (db) => {
      logger.info('Adding FTS sync triggers');
      
      // Triggers to keep FTS table in sync with chunk table
      db.exec(`
        CREATE TRIGGER IF NOT EXISTS chunk_fts_insert AFTER INSERT ON chunk BEGIN
          INSERT INTO chunk_fts(chunk_id, repo, path, content) 
          VALUES (new.id, new.repo, new.path, new.content);
        END;

        CREATE TRIGGER IF NOT EXISTS chunk_fts_delete AFTER DELETE ON chunk BEGIN
          DELETE FROM chunk_fts WHERE chunk_id = old.id;
        END;

        CREATE TRIGGER IF NOT EXISTS chunk_fts_update AFTER UPDATE ON chunk BEGIN
          DELETE FROM chunk_fts WHERE chunk_id = old.id;
          INSERT INTO chunk_fts(chunk_id, repo, path, content) 
          VALUES (new.id, new.repo, new.path, new.content);
        END;
      `);
    },
    down: (db) => {
      logger.info('Removing FTS sync triggers');
      db.exec(`
        DROP TRIGGER IF EXISTS chunk_fts_insert;
        DROP TRIGGER IF EXISTS chunk_fts_delete;
        DROP TRIGGER IF EXISTS chunk_fts_update;
      `);
    }
  }
];

// Hash utilities for generating stable IDs
export class HashUtils {
  static sha256(data: string): string {
    return createHash('sha256').update(data, 'utf8').digest('hex');
  }

  static hashFileContent(content: Buffer): string {
    return createHash('sha256').update(content).digest('hex');
  }

  static hashSpanId(
    repo: string,
    path: string,
    byteStart: number,
    byteEnd: number,
    kind: string,
    name?: string,
    signature?: string,
    doc?: string,
    parents?: string[]
  ): string {
    const docHash = doc ? this.sha256(doc) : '';
    const parentsHash = parents && parents.length > 0 ? this.sha256(parents.join('|')) : '';
    
    const data = [
      repo,
      path,
      `${byteStart}`,
      `${byteEnd}`,
      kind,
      name || '',
      signature || '',
      docHash,
      parentsHash
    ].join('|');
    
    return this.sha256(data);
  }

  static hashChunkId(spanId: string, contextHash: string): string {
    return this.sha256(`${spanId}|${contextHash}`);
  }

  static hashRerankCacheKey(
    provider: string,
    model: string,
    query: string,
    candidateIds: string[]
  ): string {
    const data = [
      provider,
      model || '',
      query,
      candidateIds.sort().join('|')
    ].join('|');
    
    return this.sha256(data);
  }

  static hashContext(content: string): string {
    return this.sha256(content);
  }
}