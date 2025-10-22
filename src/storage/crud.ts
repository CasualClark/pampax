import Database from 'better-sqlite3';
import { logger } from '../config/logger.js';
import { HashUtils } from './migrations.js';
import { SpanKind } from '../types/core.js';

// Database interfaces
export interface FileRecord {
  id?: number;
  repo: string;
  path: string;
  content_hash: string;
  lang: string;
}

export interface SpanRecord {
  id: string;
  repo: string;
  path: string;
  byte_start: number;
  byte_end: number;
  kind: string;
  name?: string;
  signature?: string;
  doc?: string;
  parents?: string; // JSON string
}

export interface ChunkRecord {
  id: string;
  span_id: string;
  repo: string;
  path: string;
  content: string;
  created_at: number;
}

export interface EmbeddingRecord {
  chunk_id: string;
  model: string;
  dim: number;
  vector: Buffer;
  created_at: number;
}

export interface ReferenceRecord {
  src_span_id: string;
  dst_path: string;
  byte_start: number;
  byte_end: number;
  kind?: string;
}

export interface JobRunRecord {
  id: string;
  kind: string;
  started_at?: number;
  finished_at?: number;
  status: 'ok' | 'error';
  error_text?: string;
}

export interface RerankCacheRecord {
  id: string;
  provider: string;
  model?: string;
  query: string;
  created_at: number;
  result_json: string;
}

export interface SearchLogRecord {
  id?: number;
  query: string;
  ts: number;
  k: number;
}

export class FileOperations {
  constructor(private db: Database.Database) {}

  insert(file: Omit<FileRecord, 'id'>): number {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO file (repo, path, content_hash, lang)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(repo, path) DO UPDATE SET
          content_hash = excluded.content_hash,
          lang = excluded.lang
      `);

      const result = stmt.run(file.repo, file.path, file.content_hash, file.lang);
      return result.lastInsertRowid as number;
    } catch (error) {
      logger.error('Failed to insert file record', { 
        error: error instanceof Error ? error.message : String(error),
        file: file.path 
      });
      throw error;
    }
  }

  insertBulk(files: Omit<FileRecord, 'id'>[]): number[] {
    const results: number[] = [];
    const transaction = this.db.transaction(() => {
      for (const file of files) {
        results.push(this.insert(file));
      }
    });
    transaction();
    return results;
  }

  findByPath(repo: string, path: string): FileRecord | undefined {
    const stmt = this.db.prepare(`
      SELECT * FROM file WHERE repo = ? AND path = ?
    `);
    return stmt.get(repo, path) as FileRecord | undefined;
  }

  findByHash(contentHash: string): FileRecord[] {
    const stmt = this.db.prepare(`
      SELECT * FROM file WHERE content_hash = ?
    `);
    return stmt.all(contentHash) as FileRecord[];
  }

  findByRepo(repo: string): FileRecord[] {
    const stmt = this.db.prepare(`
      SELECT * FROM file WHERE repo = ? ORDER BY path
    `);
    return stmt.all(repo) as FileRecord[];
  }

  delete(repo: string, path: string): boolean {
    const stmt = this.db.prepare(`
      DELETE FROM file WHERE repo = ? AND path = ?
    `);
    const result = stmt.run(repo, path);
    return result.changes > 0;
  }
}

export class SpanOperations {
  constructor(private db: Database.Database) {}

  insert(span: Omit<SpanRecord, 'id'>): string {
    const id = HashUtils.hashSpanId(
      span.repo,
      span.path,
      span.byte_start,
      span.byte_end,
      span.kind,
      span.name,
      span.signature,
      span.doc,
      span.parents ? JSON.parse(span.parents) : undefined
    );

    try {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO span 
        (id, repo, path, byte_start, byte_end, kind, name, signature, doc, parents)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        id,
        span.repo,
        span.path,
        span.byte_start,
        span.byte_end,
        span.kind,
        span.name,
        span.signature,
        span.doc,
        span.parents
      );

      return id;
    } catch (error) {
      logger.error('Failed to insert span record', { 
        error: error instanceof Error ? error.message : String(error),
        span: id 
      });
      throw error;
    }
  }

  insertBulk(spans: Omit<SpanRecord, 'id'>[]): string[] {
    const results: string[] = [];
    const transaction = this.db.transaction(() => {
      for (const span of spans) {
        results.push(this.insert(span));
      }
    });
    transaction();
    return results;
  }

  findById(id: string): SpanRecord | undefined {
    const stmt = this.db.prepare(`
      SELECT * FROM span WHERE id = ?
    `);
    return stmt.get(id) as SpanRecord | undefined;
  }

  findByPath(repo: string, path: string): SpanRecord[] {
    const stmt = this.db.prepare(`
      SELECT * FROM span WHERE repo = ? AND path = ? ORDER BY byte_start
    `);
    return stmt.all(repo, path) as SpanRecord[];
  }

  findByRange(repo: string, path: string, byteStart: number, byteEnd: number): SpanRecord[] {
    const stmt = this.db.prepare(`
      SELECT * FROM span 
      WHERE repo = ? AND path = ? 
        AND byte_start <= ? AND byte_end >= ?
      ORDER BY byte_start
    `);
    return stmt.all(repo, path, byteEnd, byteStart) as SpanRecord[];
  }

  findByKind(repo: string, kind: SpanKind): SpanRecord[] {
    const stmt = this.db.prepare(`
      SELECT * FROM span WHERE repo = ? AND kind = ? ORDER BY path, byte_start
    `);
    return stmt.all(repo, kind) as SpanRecord[];
  }

  findByName(repo: string, name: string): SpanRecord[] {
    const stmt = this.db.prepare(`
      SELECT * FROM span WHERE repo = ? AND name = ? ORDER BY path, byte_start
    `);
    return stmt.all(repo, name) as SpanRecord[];
  }

  delete(id: string): boolean {
    const stmt = this.db.prepare(`
      DELETE FROM span WHERE id = ?
    `);
    const result = stmt.run(id);
    return result.changes > 0;
  }

  deleteByPath(repo: string, path: string): number {
    const stmt = this.db.prepare(`
      DELETE FROM span WHERE repo = ? AND path = ?
    `);
    const result = stmt.run(repo, path);
    return result.changes;
  }
}

export class ChunkOperations {
  constructor(private db: Database.Database) {}

  insert(chunk: Omit<ChunkRecord, 'id' | 'created_at'>): string {
    const id = HashUtils.hashChunkId(chunk.span_id, HashUtils.hashContext(chunk.content));
    const createdAt = Date.now();

    try {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO chunk (id, span_id, repo, path, content, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      stmt.run(id, chunk.span_id, chunk.repo, chunk.path, chunk.content, createdAt);
      return id;
    } catch (error) {
      logger.error('Failed to insert chunk record', { 
        error: error instanceof Error ? error.message : String(error),
        chunk: id 
      });
      throw error;
    }
  }

  insertBulk(chunks: Omit<ChunkRecord, 'id' | 'created_at'>[]): string[] {
    const results: string[] = [];
    const transaction = this.db.transaction(() => {
      for (const chunk of chunks) {
        results.push(this.insert(chunk));
      }
    });
    transaction();
    return results;
  }

  findById(id: string): ChunkRecord | undefined {
    const stmt = this.db.prepare(`
      SELECT * FROM chunk WHERE id = ?
    `);
    return stmt.get(id) as ChunkRecord | undefined;
  }

  findBySpanId(spanId: string): ChunkRecord[] {
    const stmt = this.db.prepare(`
      SELECT * FROM chunk WHERE span_id = ? ORDER BY created_at
    `);
    return stmt.all(spanId) as ChunkRecord[];
  }

  findByPath(repo: string, path: string): ChunkRecord[] {
    const stmt = this.db.prepare(`
      SELECT * FROM chunk WHERE repo = ? AND path = ? ORDER BY created_at
    `);
    return stmt.all(repo, path) as ChunkRecord[];
  }

  findForEmbedding(limit: number = 1000, offset: number = 0): ChunkRecord[] {
    const stmt = this.db.prepare(`
      SELECT c.* FROM chunk c
      LEFT JOIN embedding e ON c.id = e.chunk_id
      WHERE e.chunk_id IS NULL
      ORDER BY c.created_at
      LIMIT ? OFFSET ?
    `);
    return stmt.all(limit, offset) as ChunkRecord[];
  }

  delete(id: string): boolean {
    const stmt = this.db.prepare(`
      DELETE FROM chunk WHERE id = ?
    `);
    const result = stmt.run(id);
    return result.changes > 0;
  }

  deleteByPath(repo: string, path: string): number {
    const stmt = this.db.prepare(`
      DELETE FROM chunk WHERE repo = ? AND path = ?
    `);
    const result = stmt.run(repo, path);
    return result.changes;
  }
}

export class EmbeddingOperations {
  constructor(private db: Database.Database) {}

  insert(embedding: Omit<EmbeddingRecord, 'created_at'>): void {
    const createdAt = Date.now();

    try {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO embedding (chunk_id, model, dim, vector, created_at)
        VALUES (?, ?, ?, ?, ?)
      `);

      stmt.run(
        embedding.chunk_id,
        embedding.model,
        embedding.dim,
        embedding.vector,
        createdAt
      );
    } catch (error) {
      logger.error('Failed to insert embedding record', { 
        error: error instanceof Error ? error.message : String(error),
        chunkId: embedding.chunk_id 
      });
      throw error;
    }
  }

  insertBulk(embeddings: Omit<EmbeddingRecord, 'created_at'>[]): void {
    const transaction = this.db.transaction(() => {
      for (const embedding of embeddings) {
        this.insert(embedding);
      }
    });
    transaction();
  }

  findByChunkId(chunkId: string): EmbeddingRecord[] {
    const stmt = this.db.prepare(`
      SELECT * FROM embedding WHERE chunk_id = ?
    `);
    return stmt.all(chunkId) as EmbeddingRecord[];
  }

  findByModel(model: string): EmbeddingRecord[] {
    const stmt = this.db.prepare(`
      SELECT * FROM embedding WHERE model = ?
    `);
    return stmt.all(model) as EmbeddingRecord[];
  }

  delete(chunkId: string, model?: string): boolean {
    let stmt;
    if (model) {
      stmt = this.db.prepare(`
        DELETE FROM embedding WHERE chunk_id = ? AND model = ?
      `);
      const result = stmt.run(chunkId, model);
      return result.changes > 0;
    } else {
      stmt = this.db.prepare(`
        DELETE FROM embedding WHERE chunk_id = ?
      `);
      const result = stmt.run(chunkId);
      return result.changes > 0;
    }
  }
}

export class FTSSearchOperations {
  constructor(private db: Database.Database) {}

  search(query: string, limit: number = 10, repo?: string): Array<ChunkRecord & { rank: number }> {
    let sql = `
      SELECT c.*, rank FROM chunk_fts fts
      JOIN chunk c ON fts.chunk_id = c.id
      WHERE chunk_fts MATCH ?
    `;
    const params: any[] = [query];

    if (repo) {
      sql += ' AND c.repo = ?';
      params.push(repo);
    }

    sql += ' ORDER BY rank LIMIT ?';
    params.push(limit);

    try {
      const stmt = this.db.prepare(sql);
      return stmt.all(...params) as Array<ChunkRecord & { rank: number }>;
    } catch (error) {
      logger.error('FTS search failed', { 
        error: error instanceof Error ? error.message : String(error),
        query 
      });
      return [];
    }
  }

  searchByPath(query: string, path: string, limit: number = 10): Array<ChunkRecord & { rank: number }> {
    const stmt = this.db.prepare(`
      SELECT c.*, rank FROM chunk_fts fts
      JOIN chunk c ON fts.chunk_id = c.id
      WHERE chunk_fts MATCH ? AND c.path = ?
      ORDER BY rank LIMIT ?
    `);
    return stmt.all(query, path, limit) as Array<ChunkRecord & { rank: number }>;
  }

  rebuildIndex(): void {
    this.db.exec(`
      DELETE FROM chunk_fts;
      INSERT INTO chunk_fts(chunk_id, repo, path, content)
      SELECT id, repo, path, content FROM chunk;
    `);
    logger.info('FTS index rebuilt');
  }
}

export class ReferenceOperations {
  constructor(private db: Database.Database) {}

  insert(reference: Omit<ReferenceRecord, 'src_span_id'>, srcSpanId: string): void {
    try {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO reference (src_span_id, dst_path, byte_start, byte_end, kind)
        VALUES (?, ?, ?, ?, ?)
      `);

      stmt.run(srcSpanId, reference.dst_path, reference.byte_start, reference.byte_end, reference.kind);
    } catch (error) {
      logger.error('Failed to insert reference record', { 
        error: error instanceof Error ? error.message : String(error),
        srcSpanId 
      });
      throw error;
    }
  }

  insertBulk(references: Array<{ reference: Omit<ReferenceRecord, 'src_span_id'>; srcSpanId: string }>): void {
    const transaction = this.db.transaction(() => {
      for (const { reference, srcSpanId } of references) {
        this.insert(reference, srcSpanId);
      }
    });
    transaction();
  }

  findBySrcSpanId(srcSpanId: string): ReferenceRecord[] {
    const stmt = this.db.prepare(`
      SELECT * FROM reference WHERE src_span_id = ?
    `);
    return stmt.all(srcSpanId) as ReferenceRecord[];
  }

  findByDstPath(dstPath: string): ReferenceRecord[] {
    const stmt = this.db.prepare(`
      SELECT * FROM reference WHERE dst_path = ?
    `);
    return stmt.all(dstPath) as ReferenceRecord[];
  }

  delete(srcSpanId: string): boolean {
    const stmt = this.db.prepare(`
      DELETE FROM reference WHERE src_span_id = ?
    `);
    const result = stmt.run(srcSpanId);
    return result.changes > 0;
  }
}

export class JobRunOperations {
  constructor(private db: Database.Database) {}

  insert(job: Omit<JobRunRecord, 'started_at' | 'finished_at'>): string {
    const startedAt = Date.now();

    try {
      const stmt = this.db.prepare(`
        INSERT INTO job_run (id, kind, started_at, status, error_text)
        VALUES (?, ?, ?, ?, ?)
      `);

      stmt.run(job.id, job.kind, startedAt, job.status, job.error_text);
      return job.id;
    } catch (error) {
      logger.error('Failed to insert job run record', { 
        error: error instanceof Error ? error.message : String(error),
        jobId: job.id 
      });
      throw error;
    }
  }

  updateStatus(jobId: string, status: 'ok' | 'error', errorText?: string): void {
    const finishedAt = Date.now();

    const stmt = this.db.prepare(`
      UPDATE job_run SET status = ?, finished_at = ?, error_text = ?
      WHERE id = ?
    `);

    stmt.run(status, finishedAt, errorText, jobId);
  }

  findById(id: string): JobRunRecord | undefined {
    const stmt = this.db.prepare(`
      SELECT * FROM job_run WHERE id = ?
    `);
    return stmt.get(id) as JobRunRecord | undefined;
  }

  findByKind(kind: string, limit: number = 10): JobRunRecord[] {
    const stmt = this.db.prepare(`
      SELECT * FROM job_run WHERE kind = ? ORDER BY started_at DESC LIMIT ?
    `);
    return stmt.all(kind, limit) as JobRunRecord[];
  }

  findRecent(limit: number = 10): JobRunRecord[] {
    const stmt = this.db.prepare(`
      SELECT * FROM job_run ORDER BY started_at DESC LIMIT ?
    `);
    return stmt.all(limit) as JobRunRecord[];
  }

  delete(id: string): boolean {
    const stmt = this.db.prepare(`
      DELETE FROM job_run WHERE id = ?
    `);
    const result = stmt.run(id);
    return result.changes > 0;
  }
}

export class RerankCacheOperations {
  constructor(private db: Database.Database) {}

  insert(cache: Omit<RerankCacheRecord, 'created_at'>): string {
    const id = HashUtils.hashRerankCacheKey(cache.provider, cache.model || '', cache.query, []);
    const createdAt = Date.now();

    try {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO rerank_cache (id, provider, model, query, created_at, result_json)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      stmt.run(id, cache.provider, cache.model, cache.query, createdAt, cache.result_json);
      return id;
    } catch (error) {
      logger.error('Failed to insert rerank cache record', { 
        error: error instanceof Error ? error.message : String(error),
        provider: cache.provider 
      });
      throw error;
    }
  }

  get(provider: string, model: string | undefined, query: string): RerankCacheRecord | undefined {
    const id = HashUtils.hashRerankCacheKey(provider, model || '', query, []);
    
    const stmt = this.db.prepare(`
      SELECT * FROM rerank_cache WHERE id = ?
    `);
    return stmt.get(id) as RerankCacheRecord | undefined;
  }

  deleteOlderThan(maxAge: number): number {
    const cutoffTime = Date.now() - maxAge;
    
    const stmt = this.db.prepare(`
      DELETE FROM rerank_cache WHERE created_at < ?
    `);
    const result = stmt.run(cutoffTime);
    return result.changes;
  }

  delete(id: string): boolean {
    const stmt = this.db.prepare(`
      DELETE FROM rerank_cache WHERE id = ?
    `);
    const result = stmt.run(id);
    return result.changes > 0;
  }
}

export class SearchLogOperations {
  constructor(private db: Database.Database) {}

  insert(log: Omit<SearchLogRecord, 'id'>): number {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO search_log (query, ts, k)
        VALUES (?, ?, ?)
      `);

      const result = stmt.run(log.query, log.ts, log.k);
      return result.lastInsertRowid as number;
    } catch (error) {
      logger.error('Failed to insert search log record', { 
        error: error instanceof Error ? error.message : String(error),
        query: log.query 
      });
      throw error;
    }
  }

  findRecent(limit: number = 100): SearchLogRecord[] {
    const stmt = this.db.prepare(`
      SELECT * FROM search_log ORDER BY ts DESC LIMIT ?
    `);
    return stmt.all(limit) as SearchLogRecord[];
  }

  findByTimeRange(startTime: number, endTime: number): SearchLogRecord[] {
    const stmt = this.db.prepare(`
      SELECT * FROM search_log WHERE ts >= ? AND ts <= ? ORDER BY ts DESC
    `);
    return stmt.all(startTime, endTime) as SearchLogRecord[];
  }

  deleteOlderThan(maxAge: number): number {
    const cutoffTime = Date.now() - maxAge;
    
    const stmt = this.db.prepare(`
      DELETE FROM search_log WHERE ts < ?
    `);
    const result = stmt.run(cutoffTime);
    return result.changes;
  }
}

// Main CRUD operations class that combines all operations
export class StorageOperations {
  public readonly files: FileOperations;
  public readonly spans: SpanOperations;
  public readonly chunks: ChunkOperations;
  public readonly embeddings: EmbeddingOperations;
  public readonly fts: FTSSearchOperations;
  public readonly references: ReferenceOperations;
  public readonly jobRuns: JobRunOperations;
  public readonly rerankCache: RerankCacheOperations;
  public readonly searchLog: SearchLogOperations;

  constructor(private db: Database.Database) {
    this.files = new FileOperations(db);
    this.spans = new SpanOperations(db);
    this.chunks = new ChunkOperations(db);
    this.embeddings = new EmbeddingOperations(db);
    this.fts = new FTSSearchOperations(db);
    this.references = new ReferenceOperations(db);
    this.jobRuns = new JobRunOperations(db);
    this.rerankCache = new RerankCacheOperations(db);
    this.searchLog = new SearchLogOperations(db);
  }

  // Utility method to run transactions
  transaction<T>(fn: () => T): T {
    const transaction = this.db.transaction(fn);
    return transaction();
  }

  // Health check for all operations
  healthCheck(): { healthy: boolean; operations: Record<string, boolean> } {
    const operations: Record<string, boolean> = {};
    
    try {
      // Test basic operations
      this.db.prepare('SELECT 1').get();
      operations.database = true;

      // Test each table exists
      const tables = ['file', 'span', 'chunk', 'embedding', 'chunk_fts', 'reference', 'job_run', 'rerank_cache', 'search_log'];
      for (const table of tables) {
        try {
          this.db.prepare(`SELECT COUNT(*) FROM ${table}`).get();
          operations[table] = true;
        } catch {
          operations[table] = false;
        }
      }

      const healthy = Object.values(operations).every(Boolean);
      return { healthy, operations };
    } catch (error) {
      return { 
        healthy: false, 
        operations: { ...operations, database: false } 
      };
    }
  }
}