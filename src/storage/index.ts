import { join } from 'path';
import { homedir } from 'os';
import { DatabaseManager, DatabaseConfig } from './database.js';
import { migrations } from './migrations.js';
import { StorageOperations } from './crud.js';
import { logger } from '../config/logger.js';

export interface StorageConfig extends Omit<DatabaseConfig, 'path'> {
  dataDir?: string;
  path?: string;
}

export class Storage {
  public readonly dbManager: DatabaseManager;
  public operations: StorageOperations;

  constructor(config: StorageConfig = {}) {
    const defaultDataDir = join(homedir(), '.pampax', 'data');
    const dataDir = config.dataDir || defaultDataDir;
    const dbPath = join(dataDir, 'pampax.db');

    this.dbManager = new DatabaseManager({
      path: dbPath,
      enableWAL: true,
      enableForeignKeys: true,
      readOnly: false,
      ...config
    });

    // Register migrations
    migrations.forEach(migration => {
      this.dbManager.registerMigration(migration);
    });

    // Initialize operations (will be ready after DB is initialized)
    this.operations = new StorageOperations(this.dbManager.getDatabase());
  }

  async initialize(): Promise<void> {
    await this.dbManager.initialize();
    
    // Re-initialize operations after DB is ready
    this.operations = new StorageOperations(this.dbManager.getDatabase());
    
    logger.info('Storage system initialized');
  }

  async close(): Promise<void> {
    await this.dbManager.close();
  }

  // Database management methods
  transaction<T>(fn: () => T): T {
    return this.dbManager.transaction(fn);
  }

  healthCheck(): { healthy: boolean; error?: string; operations?: Record<string, boolean> } {
    const dbHealth = this.dbManager.healthCheck();
    if (!dbHealth.healthy) {
      return dbHealth;
    }

    return this.operations.healthCheck();
  }

  getStats(): any {
    return {
      database: this.dbManager.getStats(),
      // Add more storage-specific stats here if needed
    };
  }

  // Migration management
  async rollbackMigration(targetVersion?: number): Promise<void> {
    await this.dbManager.rollbackMigration(targetVersion);
  }

  // Utility methods
  static getDefaultConfig(): StorageConfig {
    const defaultDataDir = join(homedir(), '.pampax', 'data');
    return {
      dataDir: defaultDataDir,
      enableWAL: true,
      enableForeignKeys: true
    };
  }

  static createInMemory(): Storage {
    return new Storage({
      path: ':memory:',
      enableWAL: false,
      enableForeignKeys: true
    });
  }

  static createForTesting(): Storage {
    return new Storage({
      path: ':memory:',
      enableWAL: false,
      enableForeignKeys: true
    });
  }
}

// Export all storage-related types and classes
export { DatabaseManager, DatabaseConfig } from './database.js';
export { migrations, HashUtils } from './migrations.js';
export type { Migration } from './database.js';
export {
  StorageOperations,
  FileOperations,
  SpanOperations,
  ChunkOperations,
  EmbeddingOperations,
  FTSSearchOperations,
  ReferenceOperations,
  JobRunOperations,
  RerankCacheOperations,
  SearchLogOperations
} from './crud.js';

export type {
  FileRecord,
  SpanRecord,
  ChunkRecord,
  EmbeddingRecord,
  ReferenceRecord,
  JobRunRecord,
  RerankCacheRecord,
  SearchLogRecord
} from './crud.js';

// Re-export encryption functions
export {
  getActiveEncryptionKey,
  getEncryptionKeyError,
  resolveEncryptionPreference,
  writeChunkToDisk,
  readChunkFromDisk,
  removeChunkArtifacts,
  isChunkEncryptedOnDisk,
  resetEncryptionCacheForTests
} from './encryptedChunks.js';

// Types for encryption functionality
export interface ChunkPaths {
  plainPath: string;
  encryptedPath: string;
}

export interface WriteChunkResult {
  encrypted: boolean;
  path: string;
}

export interface ReadChunkResult {
  code: string;
  encrypted: boolean;
}

export interface EncryptionConfig {
  enabled: boolean;
  key: Buffer | null;
  reason: string;
}