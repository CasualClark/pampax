import * as sqlite3 from 'sqlite3';
import { dirname } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { logger } from '../config/logger.js';
import { promisify } from 'util';
import { getMetricsCollector } from '../metrics/metrics-collector.js';

export interface DatabaseConfig {
  path: string;
  enableWAL?: boolean;
  enableForeignKeys?: boolean;
  readOnly?: boolean;
  connectionPool?: {
    max?: number;
    min?: number;
    acquireTimeoutMillis?: number;
    idleTimeoutMillis?: number;
  };
}

export interface Migration {
  version: number;
  name: string;
  up: (db: sqlite3.Database) => Promise<void>;
  down: (db: sqlite3.Database) => Promise<void>;
}

export interface QueryPerformanceMetrics {
  query: string;
  duration: number;
  rowsAffected?: number;
  rowsReturned?: number;
  timestamp: number;
  correlationId?: string;
}

/**
 * Enhanced Database Manager with performance optimizations
 */
class DatabaseManager {
  private db: sqlite3.Database | null = null;
  private config: DatabaseConfig;
  private migrations: Migration[] = [];
  private metrics = getMetricsCollector();
  private queryPerformanceLog: QueryPerformanceMetrics[] = [];
  private maxPerformanceLogSize = 1000;

  constructor(config: DatabaseConfig) {
    this.config = {
      enableWAL: true,
      enableForeignKeys: true,
      readOnly: false,
      connectionPool: {
        max: 10,
        min: 1,
        acquireTimeoutMillis: 30000,
        idleTimeoutMillis: 300000
      },
      ...config
    };
  }

  private ensureDatabaseDirectory(): void {
    const dir = dirname(this.config.path);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  async initialize(): Promise<void> {
    try {
      this.ensureDatabaseDirectory();
      
      logger.info('Initializing optimized SQLite database', { path: this.config.path });
      
      this.db = new sqlite3.Database(this.config.path, (err) => {
        if (err) {
          throw new Error(`Failed to open database: ${err.message}`);
        }
      });

      // Configure database with enhanced performance settings
      await this.configureDatabase();

      // Initialize migration system
      await this.initializeMigrationTable();

      // Run pending migrations
      await this.runMigrations();

      // Create performance indexes
      await this.createPerformanceIndexes();

      // Analyze database for query planner optimization
      await this.analyzeDatabase();

      logger.info('Optimized database initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize optimized database', { 
        error: error instanceof Error ? error.message : String(error),
        path: this.config.path 
      });
      throw error;
    }
  }

  private async configureDatabase(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const run = promisify(this.db.run.bind(this.db));

    try {
      // Enhanced performance optimizations
      await run('PRAGMA journal_mode = WAL');
      await run('PRAGMA synchronous = NORMAL'); // Faster than FULL
      await run('PRAGMA temp_store = MEMORY');
      await run('PRAGMA cache_size = -64000'); // 64MB cache
      await run('PRAGMA mmap_size = 268435456'); // 256MB memory-mapped I/O
      await run('PRAGMA locking_mode = NORMAL');
      await run('PRAGMA page_size = 4096');
      await run('PRAGMA auto_vacuum = INCREMENTAL');
      
      // Query optimizer settings
      await run('PRAGMA optimize');
      await run('PRAGMA automatic_index = ON');
      await run('PRAGMA recursive_triggers = ON');

      // Enable foreign key constraints
      if (this.config.enableForeignKeys) {
        await run('PRAGMA foreign_keys = ON');
      }

      logger.debug('Database configured with enhanced performance optimizations');
    } catch (error) {
      logger.error('Failed to configure database', { error });
      throw error;
    }
  }

  private async createPerformanceIndexes(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const run = promisify(this.db.run.bind(this.db));

    try {
      // File table indexes for common query patterns
      await run('CREATE INDEX IF NOT EXISTS idx_file_repo_path ON file(repo, path)');
      await run('CREATE INDEX IF NOT EXISTS idx_file_content_hash ON file(content_hash)');
      await run('CREATE INDEX IF NOT EXISTS idx_file_lang ON file(lang)');
      await run('CREATE INDEX IF NOT EXISTS idx_file_repo_lang ON file(repo, lang)');
      await run('CREATE INDEX IF NOT EXISTS idx_file_modified_time ON file(modified_time DESC)');

      // Span table indexes for graph operations
      await run('CREATE INDEX IF NOT EXISTS idx_span_repo_path ON span(repo, path)');
      await run('CREATE INDEX IF NOT EXISTS idx_span_repo_kind ON span(repo, kind)');
      await run('CREATE INDEX IF NOT EXISTS idx_span_name ON span(name)');
      await run('CREATE INDEX IF NOT EXISTS idx_span_repo_name ON span(repo, name)');
      await run('CREATE INDEX IF NOT EXISTS idx_span_byte_range ON span(byte_start, byte_end)');
      await run('CREATE INDEX IF NOT EXISTS idx_span_path_byte_start ON span(path, byte_start)');

      // Chunk table indexes for search operations
      await run('CREATE INDEX IF NOT EXISTS idx_chunk_repo_path ON chunk(repo, path)');
      await run('CREATE INDEX IF NOT EXISTS idx_chunk_span_id ON chunk(span_id)');
      await run('CREATE INDEX IF NOT EXISTS idx_chunk_created_at ON chunk(created_at DESC)');
      await run('CREATE INDEX IF NOT EXISTS idx_chunk_repo_created ON chunk(repo, created_at DESC)');

      // Embedding table indexes for vector operations
      await run('CREATE INDEX IF NOT EXISTS idx_embedding_chunk_id ON embedding(chunk_id)');
      await run('CREATE INDEX IF NOT EXISTS idx_embedding_model ON embedding(model)');
      await run('CREATE INDEX IF NOT EXISTS idx_embedding_chunk_model ON embedding(chunk_id, model)');
      await run('CREATE INDEX IF NOT EXISTS idx_embedding_created_at ON embedding(created_at DESC)');

      // Reference table indexes for graph traversal
      await run('CREATE INDEX IF NOT EXISTS idx_reference_src_span_id ON reference(src_span_id)');
      await run('CREATE INDEX IF NOT EXISTS idx_reference_dst_path ON reference(dst_path)');
      await run('CREATE INDEX IF NOT EXISTS idx_reference_kind ON reference(kind)');
      await run('CREATE INDEX IF NOT EXISTS idx_reference_dst_path_range ON reference(dst_path, byte_start, byte_end)');

      // Job run indexes for monitoring
      await run('CREATE INDEX IF NOT EXISTS idx_job_run_kind ON job_run(kind)');
      await run('CREATE INDEX IF NOT EXISTS idx_job_run_started_at ON job_run(started_at DESC)');
      await run('CREATE INDEX IF NOT EXISTS idx_job_run_status ON job_run(status)');
      await run('CREATE INDEX IF NOT EXISTS idx_job_run_kind_started ON job_run(kind, started_at DESC)');

      // Rerank cache indexes for performance
      await run('CREATE INDEX IF NOT EXISTS idx_rerank_cache_created_at ON rerank_cache(created_at DESC)');
      await run('CREATE INDEX IF NOT EXISTS idx_rerank_cache_provider ON rerank_cache(provider)');
      await run('CREATE INDEX IF NOT EXISTS idx_rerank_cache_provider_created ON rerank_cache(provider, created_at DESC)');

      // Search log indexes for analytics
      await run('CREATE INDEX IF NOT EXISTS idx_search_log_ts ON search_log(ts DESC)');
      await run('CREATE INDEX IF NOT EXISTS idx_search_log_query ON search_log(query)');
      await run('CREATE INDEX IF NOT EXISTS idx_search_log_ts_k ON search_log(ts DESC, k)');

      // Memory table indexes (if memory tables exist)
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

      logger.debug('Performance indexes created successfully');
    } catch (error) {
      logger.error('Failed to create performance indexes', { error });
      throw error;
    }
  }

  private async analyzeDatabase(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const run = promisify(this.db.run.bind(this.db));

    try {
      // Run ANALYZE to update query planner statistics
      await run('ANALYZE');
      
      logger.debug('Database analyzed for query planner optimization');
    } catch (error) {
      logger.error('Failed to analyze database', { error });
      // Don't throw - this is non-critical
    }
  }

  private async initializeMigrationTable(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const run = promisify(this.db.run.bind(this.db));
    const createMigrationTable = `
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
      )
    `;

    await run(createMigrationTable);
    logger.debug('Migration table initialized');
  }

  registerMigration(migration: Migration): void {
    this.migrations.push(migration);
    // Sort migrations by version
    this.migrations.sort((a, b) => a.version - b.version);
  }

  private async runMigrations(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      const appliedVersions = await this.getAppliedVersions();
      const pendingMigrations = this.migrations.filter(
        m => !appliedVersions.includes(m.version)
      );

      logger.info(`Running ${pendingMigrations.length} pending migrations`);

      for (const migration of pendingMigrations) {
        logger.info(`Running migration ${migration.version}: ${migration.name}`);
        
        await this.transaction(async () => {
          await migration.up(this.db!);
          const run = promisify(this.db!.run.bind(this.db!));
          await run(`
            INSERT INTO schema_migrations (version, name) 
            VALUES (${migration.version}, '${migration.name}')
          `);
        });
        
        logger.info(`Migration ${migration.version} completed successfully`);
      }

      if (pendingMigrations.length === 0) {
        logger.info('Database is up to date');
      }
    } catch (error) {
      logger.error('Migration failed', { error });
      throw error;
    }
  }

  private async getAppliedVersions(): Promise<number[]> {
    if (!this.db) throw new Error('Database not initialized');

    const all = promisify(this.db.all.bind(this.db));
    const rows = await all('SELECT version FROM schema_migrations ORDER BY version') as Array<{ version: number }>;
    return rows.map(row => row.version);
  }

  /**
   * Execute a query with performance monitoring
   */
  async executeQuery<T = any>(
    query: string, 
    params: any[] = [], 
    options: { 
      correlationId?: string; 
      timeout?: number;
      expectSingleRow?: boolean;
    } = {}
  ): Promise<T> {
    const startTime = Date.now();
    const correlationId = options.correlationId || this.metrics.getCorrelationId?.() || 'unknown';
    
    try {
      if (!this.db) {
        throw new Error('Database not initialized. Call initialize() first.');
      }

      const method = options.expectSingleRow ? 'get' : 'all';
      const execute = promisify((this.db as any)[method].bind(this.db));
      
      // Set query timeout if specified
      if (options.timeout) {
        await promisify(this.db.run.bind(this.db))(`PRAGMA busy_timeout = ${options.timeout}`);
      }

      const result = await execute(query, params) as T;
      const duration = Date.now() - startTime;

      // Log performance metrics
      this.logQueryPerformance({
        query,
        duration,
        rowsReturned: Array.isArray(result) ? result.length : (result ? 1 : 0),
        timestamp: Date.now(),
        correlationId
      });

      // Emit metrics
      this.metrics.emitTiming('sqlite_query_duration_ms', duration, {
        query_type: this.getQueryType(query),
        correlationId
      });

      // Check performance threshold (50ms target)
      if (duration > 50) {
        logger.warn('SQLite query exceeded performance threshold', {
          query: query.substring(0, 100),
          duration,
          threshold: 50,
          correlationId
        });
      }

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Log error metrics
      this.metrics.emitCounter('sqlite_query_errors', 1, {
        query_type: this.getQueryType(query),
        error_type: error instanceof Error ? error.constructor.name : 'unknown',
        correlationId
      });

      logger.error('SQLite query failed', {
        query: query.substring(0, 100),
        error: error instanceof Error ? error.message : String(error),
        duration,
        correlationId
      });
      
      throw error;
    }
  }

  private getQueryType(query: string): string {
    const trimmed = query.trim().toUpperCase();
    if (trimmed.startsWith('SELECT')) return 'SELECT';
    if (trimmed.startsWith('INSERT')) return 'INSERT';
    if (trimmed.startsWith('UPDATE')) return 'UPDATE';
    if (trimmed.startsWith('DELETE')) return 'DELETE';
    if (trimmed.startsWith('CREATE')) return 'CREATE';
    if (trimmed.startsWith('DROP')) return 'DROP';
    if (trimmed.startsWith('ALTER')) return 'ALTER';
    return 'OTHER';
  }

  private logQueryPerformance(metrics: QueryPerformanceMetrics): void {
    this.queryPerformanceLog.push(metrics);
    
    // Keep log size manageable
    if (this.queryPerformanceLog.length > this.maxPerformanceLogSize) {
      this.queryPerformanceLog = this.queryPerformanceLog.slice(-this.maxPerformanceLogSize);
    }
  }

  /**
   * Get query performance statistics
   */
  getQueryPerformanceStats(): {
    totalQueries: number;
    averageDuration: number;
    p95Duration: number;
    p99Duration: number;
    slowQueries: QueryPerformanceMetrics[];
    recentQueries: QueryPerformanceMetrics[];
  } {
    if (this.queryPerformanceLog.length === 0) {
      return {
        totalQueries: 0,
        averageDuration: 0,
        p95Duration: 0,
        p99Duration: 0,
        slowQueries: [],
        recentQueries: []
      };
    }

    const durations = this.queryPerformanceLog.map(q => q.duration);
    durations.sort((a, b) => a - b);
    
    const totalQueries = this.queryPerformanceLog.length;
    const averageDuration = durations.reduce((a, b) => a + b, 0) / totalQueries;
    const p95Index = Math.floor(totalQueries * 0.95);
    const p99Index = Math.floor(totalQueries * 0.99);
    const p95Duration = durations[p95Index] || 0;
    const p99Duration = durations[p99Index] || 0;

    const slowQueries = this.queryPerformanceLog
      .filter(q => q.duration > 50)
      .sort((a, b) => b.duration - a.duration)
      .slice(0, 10);

    const recentQueries = this.queryPerformanceLog
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 20);

    return {
      totalQueries,
      averageDuration,
      p95Duration,
      p99Duration,
      slowQueries,
      recentQueries
    };
  }

  /**
   * Run EXPLAIN QUERY PLAN for a query
   */
  async explainQueryPlan(query: string, params: any[] = []): Promise<any[]> {
    const explainQuery = `EXPLAIN QUERY PLAN ${query}`;
    return this.executeQuery(explainQuery, params);
  }

  /**
   * Optimize database with maintenance operations
   */
  async optimizeDatabase(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const run = promisify(this.db.run.bind(this.db));

    try {
      logger.info('Starting database optimization');
      
      // Clean up free pages
      await run('PRAGMA incremental_vacuum');
      
      // Update statistics
      await run('ANALYZE');
      
      // Optimize query plans
      await run('PRAGMA optimize');
      
      // Check database integrity
      const integrityResult = await promisify(this.db.get.bind(this.db))('PRAGMA integrity_check') as { integrity_check: string };
      if (integrityResult.integrity_check !== 'ok') {
        logger.warn('Database integrity check failed', { result: integrityResult });
      }
      
      logger.info('Database optimization completed');
    } catch (error) {
      logger.error('Database optimization failed', { error });
      throw error;
    }
  }

  async rollbackMigration(targetVersion?: number): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      const appliedVersions = await this.getAppliedVersions();
      const target = targetVersion !== undefined ? targetVersion : 
                     appliedVersions.length > 0 ? appliedVersions[appliedVersions.length - 2] : 0;

      const migrationsToRollback = this.migrations.filter(
        m => appliedVersions.includes(m.version) && m.version > target
      ).sort((a, b) => b.version - a.version); // Reverse order for rollback

      logger.info(`Rolling back ${migrationsToRollback.length} migrations to version ${target}`);

      for (const migration of migrationsToRollback) {
        logger.info(`Rolling back migration ${migration.version}: ${migration.name}`);
        
        await this.transaction(async () => {
          await migration.down(this.db!);
          const run = promisify(this.db!.run.bind(this.db!));
          await run(`DELETE FROM schema_migrations WHERE version = ${migration.version}`);
        });
        
        logger.info(`Migration ${migration.version} rollback completed`);
      }
    } catch (error) {
      logger.error('Migration rollback failed', { error });
      throw error;
    }
  }

  getDatabase(): sqlite3.Database {
    if (!this.db) {
      throw new Error('Database not initialized. Call initialize() first.');
    }
    return this.db;
  }

  async close(): Promise<void> {
    if (this.db) {
      // Log final performance stats
      const stats = this.getQueryPerformanceStats();
      logger.info('Database performance summary', {
        totalQueries: stats.totalQueries,
        averageDuration: stats.averageDuration.toFixed(2),
        p95Duration: stats.p95Duration,
        p99Duration: stats.p99Duration,
        slowQueriesCount: stats.slowQueries.length
      });

      await new Promise<void>((resolve, reject) => {
        this.db!.close((err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });
      this.db = null;
      logger.info('Database connection closed');
    }
  }

  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    const db = this.getDatabase();
    const run = promisify(db.run.bind(db));
    
    await run('BEGIN IMMEDIATE TRANSACTION');
    
    try {
      const result = await fn();
      await run('COMMIT');
      return result;
    } catch (error) {
      await run('ROLLBACK');
      throw error;
    }
  }

  // Health check method with performance metrics
  async healthCheck(): Promise<{ 
    healthy: boolean; 
    error?: string;
    performance?: ReturnType<DatabaseManager['getQueryPerformanceStats']>;
  }> {
    try {
      if (!this.db) {
        return { healthy: false, error: 'Database not initialized' };
      }

      // Test basic connectivity
      const get = promisify(this.db.get.bind(this.db));
      const result = await get('SELECT 1 as test') as { test: number };
      if (result.test !== 1) {
        return { healthy: false, error: 'Database connectivity test failed' };
      }

      // Check foreign keys are enabled if configured
      if (this.config.enableForeignKeys) {
        const fkResult = await get('PRAGMA foreign_keys') as { foreign_keys: number };
        if (fkResult.foreign_keys !== 1) {
          return { healthy: false, error: 'Foreign keys not enabled' };
        }
      }

      // Check WAL mode if configured
      if (this.config.enableWAL) {
        const walResult = await get('PRAGMA journal_mode') as { journal_mode: string };
        if (walResult.journal_mode !== 'wal') {
          return { healthy: false, error: 'WAL mode not enabled' };
        }
      }

      return { 
        healthy: true,
        performance: this.getQueryPerformanceStats()
      };
    } catch (error) {
      return { 
        healthy: false, 
        error: error instanceof Error ? error.message : String(error) 
      };
    }
  }

  // Get database statistics with performance data
  async getStats(): Promise<{ 
    version: string; 
    pageCount: number; 
    pageSize: number; 
    size: number; 
    freePages: number; 
    cacheSize: number;
    performance: ReturnType<DatabaseManager['getQueryPerformanceStats']>;
  }> {
    const db = this.getDatabase();
    const get = promisify(db.get.bind(db));
    
    const version = (await get('SELECT sqlite_version() as version') as { version: string }).version;
    const pageCount = (await get('PRAGMA page_count') as { page_count: number }).page_count;
    const pageSize = (await get('PRAGMA page_size') as { page_size: number }).page_size;
    const freePages = (await get('PRAGMA freelist_count') as { freelist_count: number }).freelist_count;
    const cacheSize = (await get('PRAGMA cache_size') as { cache_size: number }).cache_size;

    return {
      version,
      pageCount,
      pageSize,
      size: pageCount * pageSize,
      freePages,
      cacheSize,
      performance: this.getQueryPerformanceStats()
    };
  }
}

export { DatabaseManager };