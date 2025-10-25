import { DatabaseManager } from './database-optimized.js';
import { logger } from '../config/logger.js';
import { getMetricsCollector } from '../metrics/metrics-collector.js';

// Type definitions for database records
export interface FileRecord {
  repo: string;
  path: string;
  content_hash: string;
  lang: string;
  modified_time?: number;
}

export interface SpanRecord {
  id: string;
  repo: string;
  path: string;
  byte_start: number;
  byte_end: number;
  kind: string;
  name: string;
  text?: string;
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
  id: string;
  chunk_id: string;
  model: string;
  vector: number[];
  created_at: number;
}

export interface ReferenceRecord {
  id: string;
  src_span_id: string;
  dst_path: string;
  byte_start: number;
  byte_end: number;
  kind: string;
}

/**
 * Optimized CRUD operations with performance monitoring
 */
export class OptimizedCrudOperations {
  private db: DatabaseManager;
  private metrics = getMetricsCollector();

  constructor(database: DatabaseManager) {
    this.db = database;
  }

  // File operations
  async getFile(repo: string, path: string): Promise<FileRecord | null> {
    const query = 'SELECT * FROM file WHERE repo = ? AND path = ?';
    return this.db.executeQuery<FileRecord>(query, [repo, path], { expectSingleRow: true });
  }

  async getFilesByRepo(repo: string): Promise<FileRecord[]> {
    const query = 'SELECT * FROM file WHERE repo = ? ORDER BY path';
    return this.db.executeQuery<FileRecord[]>(query, [repo]);
  }

  async getFilesByLanguage(repo: string, lang: string): Promise<FileRecord[]> {
    const query = 'SELECT * FROM file WHERE repo = ? AND lang = ? ORDER BY path';
    return this.db.executeQuery<FileRecord[]>(query, [repo, lang]);
  }

  async getFilesModifiedSince(repo: string, since: number): Promise<FileRecord[]> {
    const query = 'SELECT * FROM file WHERE repo = ? AND modified_time > ? ORDER BY modified_time DESC';
    return this.db.executeQuery<FileRecord[]>(query, [repo, since]);
  }

  async insertFile(file: Omit<FileRecord, 'modified_time'> & { modified_time?: number }): Promise<void> {
    const query = `
      INSERT OR REPLACE INTO file (repo, path, content_hash, lang, modified_time)
      VALUES (?, ?, ?, ?, COALESCE(?, strftime('%s', 'now')))
    `;
    await this.db.executeQuery(query, [
      file.repo,
      file.path,
      file.content_hash,
      file.lang,
      file.modified_time
    ]);
  }

  async deleteFile(repo: string, path: string): Promise<void> {
    const query = 'DELETE FROM file WHERE repo = ? AND path = ?';
    await this.db.executeQuery(query, [repo, path]);
  }

  // Span operations
  async getSpan(id: string): Promise<SpanRecord | null> {
    const query = 'SELECT * FROM span WHERE id = ?';
    return this.db.executeQuery<SpanRecord>(query, [id], { expectSingleRow: true });
  }

  async getSpansByFile(repo: string, path: string): Promise<SpanRecord[]> {
    const query = 'SELECT * FROM span WHERE repo = ? AND path = ? ORDER BY byte_start';
    return this.db.executeQuery<SpanRecord[]>(query, [repo, path]);
  }

  async getSpansByKind(repo: string, kind: string): Promise<SpanRecord[]> {
    const query = 'SELECT * FROM span WHERE repo = ? AND kind = ? ORDER BY path, byte_start';
    return this.db.executeQuery<SpanRecord[]>(query, [repo, kind]);
  }

  async getSpansByName(repo: string, name: string): Promise<SpanRecord[]> {
    const query = 'SELECT * FROM span WHERE repo = ? AND name = ? ORDER BY path, byte_start';
    return this.db.executeQuery<SpanRecord[]>(query, [repo, name]);
  }

  async getSpansByByteRange(repo: string, path: string, start: number, end: number): Promise<SpanRecord[]> {
    const query = `
      SELECT * FROM span 
      WHERE repo = ? AND path = ? 
      AND byte_start <= ? AND byte_end >= ?
      ORDER BY byte_start
    `;
    return this.db.executeQuery<SpanRecord[]>(query, [repo, path, end, start]);
  }

  async insertSpan(span: Omit<SpanRecord, 'id'>): Promise<string> {
    const id = `${span.repo}:${span.path}:${span.byte_start}-${span.byte_end}:${span.kind}`;
    const query = `
      INSERT OR REPLACE INTO span (id, repo, path, byte_start, byte_end, kind, name, text)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;
    await this.db.executeQuery(query, [
      id, span.repo, span.path, span.byte_start, span.byte_end, span.kind, span.name, span.text
    ]);
    return id;
  }

  async deleteSpansByFile(repo: string, path: string): Promise<void> {
    const query = 'DELETE FROM span WHERE repo = ? AND path = ?';
    await this.db.executeQuery(query, [repo, path]);
  }

  // Chunk operations
  async getChunk(id: string): Promise<ChunkRecord | null> {
    const query = 'SELECT * FROM chunk WHERE id = ?';
    return this.db.executeQuery<ChunkRecord>(query, [id], { expectSingleRow: true });
  }

  async getChunksBySpan(spanId: string): Promise<ChunkRecord[]> {
    const query = 'SELECT * FROM chunk WHERE span_id = ? ORDER BY created_at';
    return this.db.executeQuery<ChunkRecord[]>(query, [spanId]);
  }

  async getChunksByFile(repo: string, path: string): Promise<ChunkRecord[]> {
    const query = 'SELECT * FROM chunk WHERE repo = ? AND path = ? ORDER BY created_at';
    return this.db.executeQuery<ChunkRecord[]>(query, [repo, path]);
  }

  async getRecentChunks(repo: string, limit: number = 100): Promise<ChunkRecord[]> {
    const query = 'SELECT * FROM chunk WHERE repo = ? ORDER BY created_at DESC LIMIT ?';
    return this.db.executeQuery<ChunkRecord[]>(query, [repo, limit]);
  }

  async insertChunk(chunk: Omit<ChunkRecord, 'id'>): Promise<string> {
    const id = `${chunk.span_id}:${Date.now()}:${Math.random().toString(36).substr(2, 9)}`;
    const query = `
      INSERT INTO chunk (id, span_id, repo, path, content, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `;
    await this.db.executeQuery(query, [
      id, chunk.span_id, chunk.repo, chunk.path, chunk.content, chunk.created_at
    ]);
    return id;
  }

  async deleteChunksBySpan(spanId: string): Promise<void> {
    const query = 'DELETE FROM chunk WHERE span_id = ?';
    await this.db.executeQuery(query, [spanId]);
  }

  // Embedding operations
  async getEmbedding(chunkId: string, model: string): Promise<EmbeddingRecord | null> {
    const query = 'SELECT * FROM embedding WHERE chunk_id = ? AND model = ?';
    return this.db.executeQuery<EmbeddingRecord>(query, [chunkId, model], { expectSingleRow: true });
  }

  async getEmbeddingsByModel(model: string, limit: number = 1000): Promise<EmbeddingRecord[]> {
    const query = 'SELECT * FROM embedding WHERE model = ? ORDER BY created_at DESC LIMIT ?';
    return this.db.executeQuery<EmbeddingRecord[]>(query, [model, limit]);
  }

  async insertEmbedding(embedding: Omit<EmbeddingRecord, 'id'>): Promise<string> {
    const id = `${embedding.chunk_id}:${embedding.model}:${Date.now()}`;
    const query = `
      INSERT OR REPLACE INTO embedding (id, chunk_id, model, vector, created_at)
      VALUES (?, ?, ?, ?, ?)
    `;
    await this.db.executeQuery(query, [
      id, embedding.chunk_id, embedding.model, JSON.stringify(embedding.vector), embedding.created_at
    ]);
    return id;
  }

  // Reference operations
  async getReferencesBySourceSpan(srcSpanId: string): Promise<ReferenceRecord[]> {
    const query = 'SELECT * FROM reference WHERE src_span_id = ? ORDER BY dst_path, byte_start';
    return this.db.executeQuery<ReferenceRecord[]>(query, [srcSpanId]);
  }

  async getReferencesByTargetFile(dstPath: string): Promise<ReferenceRecord[]> {
    const query = 'SELECT * FROM reference WHERE dst_path = ? ORDER BY byte_start';
    return this.db.executeQuery<ReferenceRecord[]>(query, [dstPath]);
  }

  async getReferencesByKind(repo: string, kind: string): Promise<ReferenceRecord[]> {
    const query = `
      SELECT r.* FROM reference r
      JOIN span s ON r.src_span_id = s.id
      WHERE s.repo = ? AND r.kind = ?
      ORDER BY r.dst_path, r.byte_start
    `;
    return this.db.executeQuery<ReferenceRecord[]>(query, [repo, kind]);
  }

  async insertReference(reference: Omit<ReferenceRecord, 'id'>): Promise<string> {
    const id = `${reference.src_span_id}:${reference.dst_path}:${reference.byte_start}-${reference.byte_end}:${Date.now()}`;
    const query = `
      INSERT INTO reference (id, src_span_id, dst_path, byte_start, byte_end, kind)
      VALUES (?, ?, ?, ?, ?, ?)
    `;
    await this.db.executeQuery(query, [
      id, reference.src_span_id, reference.dst_path, reference.byte_start, reference.byte_end, reference.kind
    ]);
    return id;
  }

  // Search operations
  async searchChunks(
    repo: string,
    query: string,
    limit: number = 10
  ): Promise<Array<ChunkRecord & { rank: number }>> {
    const ftsQuery = `
      SELECT c.*, rank FROM chunk c
      JOIN chunk_fts fts ON c.id = fts.id
      WHERE c.repo = ? AND chunk_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `;
    return this.db.executeQuery<Array<ChunkRecord & { rank: number }>>(ftsQuery, [repo, query, limit]);
  }

  async getChunkEmbeddings(chunkIds: string[], model?: string): Promise<Array<ChunkRecord & { embedding: EmbeddingRecord }>> {
    const placeholders = chunkIds.map(() => '?').join(',');
    const query = `
      SELECT c.*, e.* FROM chunk c
      LEFT JOIN embedding e ON c.id = e.chunk_id
      WHERE c.id IN (${placeholders})
      ${model ? 'AND (e.model = ? OR e.model IS NULL)' : ''}
      ORDER BY c.id
    `;
    const params = [...chunkIds];
    if (model) params.push(model);
    
    return this.db.executeQuery(query, params);
  }

  // Analytics operations
  async getFileCount(repo?: string): Promise<{ count: number }> {
    const query = repo ? 'SELECT COUNT(*) as count FROM file WHERE repo = ?' : 'SELECT COUNT(*) as count FROM file';
    const params = repo ? [repo] : [];
    return this.db.executeQuery<{ count: number }>(query, params, { expectSingleRow: true });
  }

  async getSpanCount(repo?: string): Promise<{ count: number }> {
    const query = repo ? 'SELECT COUNT(*) as count FROM span WHERE repo = ?' : 'SELECT COUNT(*) as count FROM span';
    const params = repo ? [repo] : [];
    return this.db.executeQuery<{ count: number }>(query, params, { expectSingleRow: true });
  }

  async getChunkCount(repo?: string): Promise<{ count: number }> {
    const query = repo ? 'SELECT COUNT(*) as count FROM chunk WHERE repo = ?' : 'SELECT COUNT(*) as count FROM chunk';
    const params = repo ? [repo] : [];
    return this.db.executeQuery<{ count: number }>(query, params, { expectSingleRow: true });
  }

  // Health check
  async healthCheck(): Promise<{
    healthy: boolean;
    operations: Record<string, boolean>;
    performance?: any;
  }> {
    try {
      const dbHealth = await this.db.healthCheck();
      
      // Test basic CRUD operations
      const operations: Record<string, boolean> = {};
      
      try {
        await this.getFileCount();
        operations.read = true;
      } catch (error) {
        operations.read = false;
      }

      return {
        healthy: dbHealth.healthy && Object.values(operations).every(v => v),
        operations,
        performance: dbHealth.performance
      };
    } catch (error) {
      return {
        healthy: false,
        operations: {}
      };
    }
  }

  // Database statistics
  async getDatabaseStats(): Promise<{
    tables: Array<{ name: string; table: string; sql: string }>;
    indexes: Array<{ name: string; table: string; sql: string }>;
    performance: any;
  }> {
    const tables = await this.db.executeQuery(`
      SELECT name, name as table, sql FROM sqlite_master 
      WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
    `) as Array<{ name: string; table: string; sql: string }>;

    const indexes = await this.db.executeQuery(`
      SELECT name, tbl_name as table, sql FROM sqlite_master 
      WHERE type = 'index' AND name NOT LIKE 'sqlite_%'
    `) as Array<{ name: string; table: string; sql: string }>;

    const performance = this.db.getQueryPerformanceStats();

    return {
      tables,
      indexes,
      performance
    };
  }
}

/**
 * Create optimized CRUD operations instance
 */
export function createOptimizedCrudOperations(database: DatabaseManager): OptimizedCrudOperations {
  return new OptimizedCrudOperations(database);
}