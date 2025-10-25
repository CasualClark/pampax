import { DatabaseManager, Migration } from '../database-optimized.js';

/**
 * Migration to add performance indexes for SQLite optimization
 */
export const addPerformanceIndexesMigration: Migration = {
  version: 1,
  name: 'add_performance_indexes',
  up: async (db: any): Promise<void> => {
    const run = (sql: string, params: any[] = []): Promise<void> => {
      return new Promise((resolve, reject) => {
        db.run(sql, params, function(err: any) {
          if (err) reject(err);
          else resolve();
        });
      });
    };

    // File table indexes
    await run('CREATE INDEX IF NOT EXISTS idx_file_repo_path ON file(repo, path)');
    await run('CREATE INDEX IF NOT EXISTS idx_file_content_hash ON file(content_hash)');
    await run('CREATE INDEX IF NOT EXISTS idx_file_lang ON file(lang)');
    await run('CREATE INDEX IF NOT EXISTS idx_file_repo_lang ON file(repo, lang)');
    await run('CREATE INDEX IF NOT EXISTS idx_file_modified_time ON file(modified_time DESC)');

    // Span table indexes
    await run('CREATE INDEX IF NOT EXISTS idx_span_repo_path ON span(repo, path)');
    await run('CREATE INDEX IF NOT EXISTS idx_span_repo_kind ON span(repo, kind)');
    await run('CREATE INDEX IF NOT EXISTS idx_span_name ON span(name)');
    await run('CREATE INDEX IF NOT EXISTS idx_span_repo_name ON span(repo, name)');
    await run('CREATE INDEX IF NOT EXISTS idx_span_byte_range ON span(byte_start, byte_end)');
    await run('CREATE INDEX IF NOT EXISTS idx_span_path_byte_start ON span(path, byte_start)');

    // Chunk table indexes
    await run('CREATE INDEX IF NOT EXISTS idx_chunk_repo_path ON chunk(repo, path)');
    await run('CREATE INDEX IF NOT EXISTS idx_chunk_span_id ON chunk(span_id)');
    await run('CREATE INDEX IF NOT EXISTS idx_chunk_created_at ON chunk(created_at DESC)');
    await run('CREATE INDEX IF NOT EXISTS idx_chunk_repo_created ON chunk(repo, created_at DESC)');

    // Embedding table indexes
    await run('CREATE INDEX IF NOT EXISTS idx_embedding_chunk_id ON embedding(chunk_id)');
    await run('CREATE INDEX IF NOT EXISTS idx_embedding_model ON embedding(model)');
    await run('CREATE INDEX IF NOT EXISTS idx_embedding_chunk_model ON embedding(chunk_id, model)');
    await run('CREATE INDEX IF NOT EXISTS idx_embedding_created_at ON embedding(created_at DESC)');

    // Reference table indexes
    await run('CREATE INDEX IF NOT EXISTS idx_reference_src_span_id ON reference(src_span_id)');
    await run('CREATE INDEX IF NOT EXISTS idx_reference_dst_path ON reference(dst_path)');
    await run('CREATE INDEX IF NOT EXISTS idx_reference_kind ON reference(kind)');
    await run('CREATE INDEX IF NOT EXISTS idx_reference_dst_path_range ON reference(dst_path, byte_start, byte_end)');

    // Job run indexes
    await run('CREATE INDEX IF NOT EXISTS idx_job_run_kind ON job_run(kind)');
    await run('CREATE INDEX IF NOT EXISTS idx_job_run_started_at ON job_run(started_at DESC)');
    await run('CREATE INDEX IF NOT EXISTS idx_job_run_status ON job_run(status)');
    await run('CREATE INDEX IF NOT EXISTS idx_job_run_kind_started ON job_run(kind, started_at DESC)');

    // Rerank cache indexes
    await run('CREATE INDEX IF NOT EXISTS idx_rerank_cache_created_at ON rerank_cache(created_at DESC)');
    await run('CREATE INDEX IF NOT EXISTS idx_rerank_cache_provider ON rerank_cache(provider)');
    await run('CREATE INDEX IF NOT EXISTS idx_rerank_cache_provider_created ON rerank_cache(provider, created_at DESC)');

    // Search log indexes
    await run('CREATE INDEX IF NOT EXISTS idx_search_log_ts ON search_log(ts DESC)');
    await run('CREATE INDEX IF NOT EXISTS idx_search_log_query ON search_log(query)');
    await run('CREATE INDEX IF NOT EXISTS idx_search_log_ts_k ON search_log(ts DESC, k)');

    // Memory table indexes
    await run('CREATE INDEX IF NOT EXISTS idx_memory_scope_repo ON memory(scope, repo)');
    await run('CREATE INDEX IF NOT EXISTS idx_memory_kind_weight ON memory(kind, weight DESC)');
    await run('CREATE INDEX IF NOT EXISTS idx_memory_repo_kind ON memory(repo, kind)');
    await run('CREATE INDEX IF NOT EXISTS idx_memory_expires_created ON memory(expires_at, created_at DESC)');

    // Session and interaction indexes
    await run('CREATE INDEX IF NOT EXISTS idx_session_tool_started ON session(tool, started_at DESC)');
    await run('CREATE INDEX IF NOT EXISTS idx_interaction_session_ts ON interaction(session_id, ts DESC)');
    await run('CREATE INDEX IF NOT EXISTS idx_interaction_satisfied ON interaction(satisfied, ts DESC)');

    // Composite indexes for complex queries
    await run('CREATE INDEX IF NOT EXISTS idx_chunk_repo_path_created ON chunk(repo, path, created_at DESC)');
    await run('CREATE INDEX IF NOT EXISTS idx_span_repo_path_kind ON span(repo, path, kind)');
    await run('CREATE INDEX IF NOT EXISTS idx_file_repo_lang_modified ON file(repo, lang, modified_time DESC)');

    // Run ANALYZE to update query planner statistics
    await run('ANALYZE');
  },
  
  down: async (db: any): Promise<void> => {
    const run = (sql: string, params: any[] = []): Promise<void> => {
      return new Promise((resolve, reject) => {
        db.run(sql, params, function(err: any) {
          if (err) reject(err);
          else resolve();
        });
      });
    };

    // Drop all performance indexes
    const indexes = [
      'idx_file_repo_path', 'idx_file_content_hash', 'idx_file_lang', 'idx_file_repo_lang', 'idx_file_modified_time',
      'idx_span_repo_path', 'idx_span_repo_kind', 'idx_span_name', 'idx_span_repo_name', 'idx_span_byte_range', 'idx_span_path_byte_start',
      'idx_chunk_repo_path', 'idx_chunk_span_id', 'idx_chunk_created_at', 'idx_chunk_repo_created',
      'idx_embedding_chunk_id', 'idx_embedding_model', 'idx_embedding_chunk_model', 'idx_embedding_created_at',
      'idx_reference_src_span_id', 'idx_reference_dst_path', 'idx_reference_kind', 'idx_reference_dst_path_range',
      'idx_job_run_kind', 'idx_job_run_started_at', 'idx_job_run_status', 'idx_job_run_kind_started',
      'idx_rerank_cache_created_at', 'idx_rerank_cache_provider', 'idx_rerank_cache_provider_created',
      'idx_search_log_ts', 'idx_search_log_query', 'idx_search_log_ts_k',
      'idx_memory_scope_repo', 'idx_memory_kind_weight', 'idx_memory_repo_kind', 'idx_memory_expires_created',
      'idx_session_tool_started', 'idx_interaction_session_ts', 'idx_interaction_satisfied',
      'idx_chunk_repo_path_created', 'idx_span_repo_path_kind', 'idx_file_repo_lang_modified'
    ];

    for (const indexName of indexes) {
      await run(`DROP INDEX IF EXISTS ${indexName}`);
    }
  }
};

/**
 * Register performance indexes migration with database manager
 */
export function registerPerformanceIndexesMigration(database: DatabaseManager): void {
  database.registerMigration(addPerformanceIndexesMigration);
}