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
  up: (db: Database.Database) => void;
  down: (db: Database.Database) => void;
}

class DatabaseManager {
  private db: Database.Database | null = null;
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
      
      this.db = new Database(this.config.path, {
        readonly: this.config.readOnly,
        fileMustExist: false
      });

      // Configure database performance settings
      this.configureDatabase();

      // Initialize migration system
      this.initializeMigrationTable();

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

  private configureDatabase(): void {
    if (!this.db) throw new Error('Database not initialized');

    try {
      // Performance optimizations
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('synchronous = NORMAL');
      this.db.pragma('temp_store = MEMORY');
      this.db.pragma('cache_size = 10000');
      this.db.pragma('mmap_size = 268435456'); // 256MB

      // Enable foreign key constraints
      if (this.config.enableForeignKeys) {
        this.db.pragma('foreign_keys = ON');
      }

      logger.debug('Database configured with performance optimizations');
    } catch (error) {
      logger.error('Failed to configure database', { error });
      throw error;
    }
  }

  private initializeMigrationTable(): void {
    if (!this.db) throw new Error('Database not initialized');

    const createMigrationTable = `
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
      )
    `;

    this.db.exec(createMigrationTable);
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
      const appliedVersions = this.getAppliedVersions();
      const pendingMigrations = this.migrations.filter(
        m => !appliedVersions.includes(m.version)
      );

      logger.info(`Running ${pendingMigrations.length} pending migrations`);

      for (const migration of pendingMigrations) {
        logger.info(`Running migration ${migration.version}: ${migration.name}`);
        
        const transaction = this.db.transaction(() => {
          migration.up(this.db!);
          this.db!.exec(`
            INSERT INTO schema_migrations (version, name) 
            VALUES (${migration.version}, '${migration.name}')
          `);
        });

        transaction();
        
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

  private getAppliedVersions(): number[] {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('SELECT version FROM schema_migrations ORDER BY version');
    const rows = stmt.all() as Array<{ version: number }>;
    return rows.map(row => row.version);
  }

  async rollbackMigration(targetVersion?: number): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      const appliedVersions = this.getAppliedVersions();
      const target = targetVersion !== undefined ? targetVersion : 
                     appliedVersions.length > 0 ? appliedVersions[appliedVersions.length - 2] : 0;

      const migrationsToRollback = this.migrations.filter(
        m => appliedVersions.includes(m.version) && m.version > target
      ).sort((a, b) => b.version - a.version); // Reverse order for rollback

      logger.info(`Rolling back ${migrationsToRollback.length} migrations to version ${target}`);

      for (const migration of migrationsToRollback) {
        logger.info(`Rolling back migration ${migration.version}: ${migration.name}`);
        
        const transaction = this.db.transaction(() => {
          migration.down(this.db!);
          this.db!.exec(`DELETE FROM schema_migrations WHERE version = ${migration.version}`);
        });

        transaction();
        
        logger.info(`Migration ${migration.version} rollback completed`);
      }
    } catch (error) {
      logger.error('Migration rollback failed', { error });
      throw error;
    }
  }

  getDatabase(): Database.Database {
    if (!this.db) {
      throw new Error('Database not initialized. Call initialize() first.');
    }
    return this.db;
  }

  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
      logger.info('Database connection closed');
    }
  }

  transaction<T>(fn: () => T): T {
    const db = this.getDatabase();
    const transaction = db.transaction(fn);
    return transaction();
  }

  // Health check method
  healthCheck(): { healthy: boolean; error?: string } {
    try {
      if (!this.db) {
        return { healthy: false, error: 'Database not initialized' };
      }

      // Test basic connectivity
      const result = this.db.prepare('SELECT 1 as test').get() as { test: number };
      if (result.test !== 1) {
        return { healthy: false, error: 'Database connectivity test failed' };
      }

      // Check foreign keys are enabled if configured
      if (this.config.enableForeignKeys) {
        const fkResult = this.db.prepare('PRAGMA foreign_keys').get() as { foreign_keys: number };
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
  getStats(): { 
    version: string; 
    pageCount: number; 
    pageSize: number; 
    size: number; 
    freePages: number; 
    cacheSize: number;
  } {
    const db = this.getDatabase();
    
    const version = (db.prepare('SELECT sqlite_version() as version').get() as { version: string }).version;
    const pageCount = (db.prepare('PRAGMA page_count').get() as { page_count: number }).page_count;
    const pageSize = (db.prepare('PRAGMA page_size').get() as { page_size: number }).page_size;
    const freePages = (db.prepare('PRAGMA freelist_count').get() as { freelist_count: number }).freelist_count;
    const cacheSize = (db.prepare('PRAGMA cache_size').get() as { cache_size: number }).cache_size;

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