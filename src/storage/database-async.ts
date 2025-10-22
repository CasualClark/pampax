import sqlite3 from 'sqlite3';
import { dirname } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { logger } from '../config/logger.js';
import { promisify } from 'util';

export interface DatabaseConfig {
  path: string;
  enableWAL?: boolean;
  enableForeignKeys?: boolean;
  readOnly?: boolean;
}

export interface Migration {
  version: number;
  name: string;
  up: (db: sqlite3.Database) => Promise<void>;
  down: (db: sqlite3.Database) => Promise<void>;
}

class DatabaseManager {
  private db: sqlite3.Database | null = null;
  private config: DatabaseConfig;
  private migrations: Migration[] = [];

  constructor(config: DatabaseConfig) {
    this.config = {
      enableWAL: true,
      enableForeignKeys: true,
      readOnly: false,
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
      
      logger.info('Initializing SQLite database', { path: this.config.path });
      
      this.db = new sqlite3.Database(this.config.path, (err) => {
        if (err) {
          throw new Error(`Failed to open database: ${err.message}`);
        }
      });

      // Configure database performance settings
      await this.configureDatabase();

      // Initialize migration system
      await this.initializeMigrationTable();

      // Run pending migrations
      await this.runMigrations();

      logger.info('Database initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize database', { 
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
      // Performance optimizations
      await run('PRAGMA journal_mode = WAL');
      await run('PRAGMA synchronous = NORMAL');
      await run('PRAGMA temp_store = MEMORY');
      await run('PRAGMA cache_size = 10000');
      await run('PRAGMA mmap_size = 268435456'); // 256MB

      // Enable foreign key constraints
      if (this.config.enableForeignKeys) {
        await run('PRAGMA foreign_keys = ON');
      }

      logger.debug('Database configured with performance optimizations');
    } catch (error) {
      logger.error('Failed to configure database', { error });
      throw error;
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
    
    await run('BEGIN TRANSACTION');
    
    try {
      const result = await fn();
      await run('COMMIT');
      return result;
    } catch (error) {
      await run('ROLLBACK');
      throw error;
    }
  }

  // Health check method
  async healthCheck(): Promise<{ healthy: boolean; error?: string }> {
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

      return { healthy: true };
    } catch (error) {
      return { 
        healthy: false, 
        error: error instanceof Error ? error.message : String(error) 
      };
    }
  }

  // Get database statistics
  async getStats(): Promise<{ 
    version: string; 
    pageCount: number; 
    pageSize: number; 
    size: number; 
    freePages: number; 
    cacheSize: number;
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
      cacheSize
    };
  }
}

export { DatabaseManager };