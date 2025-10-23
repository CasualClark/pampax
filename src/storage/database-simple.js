#!/usr/bin/env node

import sqlite3 from 'sqlite3';
import { dirname } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { MemoryOperations } from './memory-operations.js';

// Simple migration definitions
const migrations = [
  {
    version: 1,
    name: 'create_base_tables',
    up: (db) => {
      // File table
      db.exec(`
        CREATE TABLE IF NOT EXISTS file (
          id INTEGER PRIMARY KEY,
          repo TEXT NOT NULL,
          path TEXT NOT NULL,
          content_hash TEXT NOT NULL,
          lang TEXT NOT NULL,
          size INTEGER,
          modified_time INTEGER,
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

      // Chunk table with FTS
      db.exec(`
        CREATE TABLE IF NOT EXISTS chunk (
          id TEXT PRIMARY KEY,
          span_id TEXT NOT NULL,
          repo TEXT NOT NULL,
          path TEXT NOT NULL,
          content TEXT NOT NULL,
          metadata TEXT
        )
      `);

      db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS chunk_fts USING fts5(
          content,
          path,
          repo,
          content=chunk,
          content_rowid=rowid
        )
      `);

      // Triggers to keep FTS in sync
      db.exec(`
        CREATE TRIGGER IF NOT EXISTS chunk_ai AFTER INSERT ON chunk BEGIN
          INSERT INTO chunk_fts(rowid, content, path, repo) 
          VALUES (new.rowid, new.content, new.path, new.repo);
        END
      `);

      db.exec(`
        CREATE TRIGGER IF NOT EXISTS chunk_ad AFTER DELETE ON chunk BEGIN
          INSERT INTO chunk_fts(chunk_fts, rowid, content, path, repo) 
          VALUES('delete', old.rowid, old.content, old.path, old.repo);
        END
      `);

      db.exec(`
        CREATE TRIGGER IF NOT EXISTS chunk_au AFTER UPDATE ON chunk BEGIN
          INSERT INTO chunk_fts(chunk_fts, rowid, content, path, repo) 
          VALUES('delete', old.rowid, old.content, old.path, old.repo);
          INSERT INTO chunk_fts(rowid, content, path, repo) 
          VALUES (new.rowid, new.content, new.path, new.repo);
        END
      `);
    },
    down: (db) => {
      db.exec('DROP TRIGGER IF EXISTS chunk_ai');
      db.exec('DROP TRIGGER IF EXISTS chunk_ad');
      db.exec('DROP TRIGGER IF EXISTS chunk_au');
      db.exec('DROP TABLE IF EXISTS chunk_fts');
      db.exec('DROP TABLE IF EXISTS chunk');
      db.exec('DROP TABLE IF EXISTS span');
      db.exec('DROP TABLE IF EXISTS file');
    }
  },
  {
    version: 2,
    name: 'create_memory_tables',
    up: (db) => {
      // Memory table
      db.exec(`
        CREATE TABLE IF NOT EXISTS memory (
          id TEXT PRIMARY KEY,
          scope TEXT CHECK(scope IN ('repo','workspace','global')) NOT NULL,
          repo TEXT,
          branch TEXT,
          kind TEXT CHECK(kind IN ('fact','gotcha','decision','plan','rule','name-alias','insight','exemplar')) NOT NULL,
          key TEXT,
          value TEXT NOT NULL,
          weight REAL DEFAULT 1.0,
          created_at INTEGER NOT NULL,
          expires_at INTEGER,
          source_json TEXT NOT NULL
        )
      `);

      // Session table
      db.exec(`
        CREATE TABLE IF NOT EXISTS session (
          id TEXT PRIMARY KEY,
          tool TEXT,
          user TEXT,
          repo TEXT,
          branch TEXT,
          started_at INTEGER,
          finished_at INTEGER
        )
      `);

      // Interaction table
      db.exec(`
        CREATE TABLE IF NOT EXISTS interaction (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          session_id TEXT REFERENCES session(id),
          ts INTEGER NOT NULL,
          query TEXT NOT NULL,
          bundle_id TEXT,
          satisfied INTEGER,
          notes TEXT
        )
      `);

      // Memory link table
      db.exec(`
        CREATE TABLE IF NOT EXISTS memory_link (
          src TEXT,
          dst TEXT,
          kind TEXT,
          score REAL,
          PRIMARY KEY (src,dst,kind)
        )
      `);

      // Indexes for performance
      db.exec('CREATE INDEX IF NOT EXISTS idx_memory_scope ON memory(scope)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_memory_kind ON memory(kind)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_memory_repo ON memory(repo)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_memory_key ON memory(key)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_memory_created_at ON memory(created_at)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_memory_expires_at ON memory(expires_at)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_session_tool ON session(tool)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_session_started_at ON session(started_at)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_interaction_session_id ON interaction(session_id)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_interaction_ts ON interaction(ts)');

      // FTS for memory content
      db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(
          value,
          key,
          kind,
          scope,
          content=memory,
          content_rowid=rowid
        )
      `);

      // Triggers to keep memory FTS in sync
      db.exec(`
        CREATE TRIGGER IF NOT EXISTS memory_ai AFTER INSERT ON memory BEGIN
          INSERT INTO memory_fts(rowid, value, key, kind, scope) 
          VALUES (new.rowid, new.value, new.key, new.kind, new.scope);
        END
      `);

      db.exec(`
        CREATE TRIGGER IF NOT EXISTS memory_ad AFTER DELETE ON memory BEGIN
          INSERT INTO memory_fts(memory_fts, rowid, value, key, kind, scope) 
          VALUES('delete', old.rowid, old.value, old.key, old.kind, old.scope);
        END
      `);

      db.exec(`
        CREATE TRIGGER IF NOT EXISTS memory_au AFTER UPDATE ON memory BEGIN
          INSERT INTO memory_fts(memory_fts, rowid, value, key, kind, scope) 
          VALUES('delete', old.rowid, old.value, old.key, old.kind, old.scope);
          INSERT INTO memory_fts(rowid, value, key, kind, scope) 
          VALUES (new.rowid, new.value, new.key, new.kind, new.scope);
        END
      `);
    },
    down: (db) => {
      db.exec('DROP TRIGGER IF EXISTS memory_ai');
      db.exec('DROP TRIGGER IF EXISTS memory_ad');
      db.exec('DROP TRIGGER IF EXISTS memory_au');
      db.exec('DROP TABLE IF EXISTS memory_fts');
      db.exec('DROP TABLE IF EXISTS memory_link');
      db.exec('DROP TABLE IF EXISTS interaction');
      db.exec('DROP TABLE IF EXISTS session');
      db.exec('DROP TABLE IF EXISTS memory');
    }
  }
];

/**
 * Simple Database class for CLI operations
 */
export class Database {
  constructor(dbPath) {
    this.dbPath = dbPath;
    this.db = null;
    this.memory = null;
  }

  async initialize() {
    return new Promise((resolve, reject) => {
      // Ensure database directory exists
      const dir = dirname(this.dbPath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) {
          reject(new Error(`Failed to open database: ${err.message}`));
        } else {
          // Configure database
          this.db.run('PRAGMA journal_mode = WAL');
          this.db.run('PRAGMA synchronous = NORMAL');
          this.db.run('PRAGMA foreign_keys = ON');
          
          // Initialize memory operations
          this.memory = new MemoryOperations(this.db);
          
          resolve();
        }
      });
    });
  }

  async close() {
    return new Promise((resolve, reject) => {
      if (this.db) {
        this.db.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      } else {
        resolve();
      }
    });
  }

  // Migration methods
  async migrate() {
    await this.initialize();
    await this.initializeMigrationTable();
    
    const appliedVersions = await this.getAppliedVersions();
    const pendingMigrations = migrations.filter(
      m => !appliedVersions.includes(m.version)
    );
    
    for (const migration of pendingMigrations) {
      await this.runMigration(migration);
    }
    
    return pendingMigrations;
  }

  async rollback() {
    await this.initialize();
    const appliedVersions = await this.getAppliedVersions();
    
    if (appliedVersions.length === 0) {
      throw new Error('No migrations to rollback');
    }
    
    const lastVersion = appliedVersions[appliedVersions.length - 1];
    const migration = migrations.find(m => m.version === lastVersion);
    
    if (!migration || !migration.down) {
      throw new Error(`Cannot rollback migration ${lastVersion}`);
    }
    
    await this.runRollback(migration);
    return { version: lastVersion - 1 };
  }

  async getCurrentVersion() {
    await this.initialize();
    const appliedVersions = await this.getAppliedVersions();
    return appliedVersions.length > 0 ? Math.max(...appliedVersions) : 0;
  }

  async getPendingMigrations() {
    await this.initialize();
    const appliedVersions = await this.getAppliedVersions();
    return migrations.filter(m => !appliedVersions.includes(m.version));
  }

  async initializeMigrationTable() {
    return new Promise((resolve, reject) => {
      const createTable = `
        CREATE TABLE IF NOT EXISTS schema_migrations (
          version INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          applied_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
        )
      `;
      
      this.db.run(createTable, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  async getAppliedVersions() {
    return new Promise((resolve, reject) => {
      this.db.all('SELECT version FROM schema_migrations ORDER BY version', (err, rows) => {
        if (err) reject(err);
        else resolve(rows.map(row => row.version));
      });
    });
  }

  async runMigration(migration) {
    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        this.db.run('BEGIN TRANSACTION');
        
        // Run migration up
        migration.up(this.db);
        
        // Record migration
        this.db.run(
          'INSERT INTO schema_migrations (version, name) VALUES (?, ?)',
          [migration.version, migration.name],
          (err) => {
            if (err) {
              this.db.run('ROLLBACK');
              reject(err);
            } else {
              this.db.run('COMMIT', (commitErr) => {
                if (commitErr) reject(commitErr);
                else resolve();
              });
            }
          }
        );
      });
    });
  }

  async runRollback(migration) {
    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        this.db.run('BEGIN TRANSACTION');
        
        // Run migration down
        if (migration.down) {
          migration.down(this.db);
        }
        
        // Remove migration record
        this.db.run(
          'DELETE FROM schema_migrations WHERE version = ?',
          [migration.version],
          (err) => {
            if (err) {
              this.db.run('ROLLBACK');
              reject(err);
            } else {
              this.db.run('COMMIT', (commitErr) => {
                if (commitErr) reject(commitErr);
                else resolve();
              });
            }
          }
        );
      });
    });
  }

  // Data methods
  async hasData() {
    try {
      await this.initialize();
      const stats = await this.getStatistics();
      return stats.fileCount > 0;
    } catch {
      return false;
    }
  }

  async storeFile(fileData) {
    await this.initialize();
    
    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT OR REPLACE INTO file (repo, path, content_hash, lang, size, modified_time) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        [fileData.repo, fileData.path, fileData.contentHash, fileData.lang, fileData.size, fileData.modifiedTime],
        function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });
  }

  async storeChunk(chunkData) {
    await this.initialize();
    
    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT OR REPLACE INTO chunk (id, span_id, repo, path, content, metadata) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          chunkData.id,
          chunkData.spanId,
          chunkData.repo,
          chunkData.path,
          chunkData.content,
          JSON.stringify(chunkData.metadata)
        ],
        function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });
  }

  async search(query, options = {}) {
    await this.initialize();
    
    const limit = options.limit || 10;
    const offset = options.offset || 0;
    const filters = options.filters || {};
    
    let whereClause = '';
    let params = [query];
    
    if (filters.pathGlob && filters.pathGlob.length > 0) {
      const pathConditions = filters.pathGlob.map(() => 'c.path GLOB ?').join(' OR ');
      whereClause += ` AND (${pathConditions})`;
      params.push(...filters.pathGlob);
    }
    
    if (filters.lang && filters.lang.length > 0) {
      const langConditions = filters.lang.map(() => 'f.lang = ?').join(' OR ');
      whereClause += ` AND (${langConditions})`;
      params.push(...filters.lang);
    }
    
    const sql = `
      SELECT 
        c.id,
        c.path,
        c.content,
        json_extract(c.metadata, '$.spanName') as spanName,
        json_extract(c.metadata, '$.spanKind') as spanKind,
        json_extract(c.metadata, '$.lang') as lang,
        json_extract(c.metadata, '$.byteStart') as byteStart,
        json_extract(c.metadata, '$.byteEnd') as byteEnd,
        c.metadata,
        fts.rank
      FROM chunk_fts fts
      JOIN chunk c ON c.rowid = fts.rowid
      LEFT JOIN file f ON c.path = f.path AND c.repo = f.repo
      WHERE fts.content MATCH ?${whereClause}
      ORDER BY fts.rank
      LIMIT ? OFFSET ?
    `;
    
    params.push(limit, offset);
    
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          const results = rows.map(row => ({
            id: row.id,
            path: row.path,
            content: options.includeContent ? row.content : undefined,
            score: row.rank || 0,
            metadata: {
              spanName: row.spanName,
              spanKind: row.spanKind,
              lang: row.lang,
              byteStart: row.byteStart,
              byteEnd: row.byteEnd,
              ...JSON.parse(row.metadata || '{}')
            }
          }));
          resolve(results);
        }
      });
    });
  }

  async getStatistics() {
    await this.initialize();
    
    const [fileCount, spanCount, chunkCount, languages] = await Promise.all([
      new Promise((resolve, reject) => {
        this.db.get('SELECT COUNT(*) as count FROM file', (err, row) => {
          if (err) reject(err);
          else resolve(row.count);
        });
      }),
      new Promise((resolve, reject) => {
        this.db.get('SELECT COUNT(*) as count FROM span', (err, row) => {
          if (err) reject(err);
          else resolve(row.count);
        });
      }),
      new Promise((resolve, reject) => {
        this.db.get('SELECT COUNT(*) as count FROM chunk', (err, row) => {
          if (err) reject(err);
          else resolve(row.count);
        });
      }),
      new Promise((resolve, reject) => {
        this.db.all(
          'SELECT f.lang, COUNT(*) as count FROM file f GROUP BY f.lang ORDER BY count DESC',
          (err, rows) => {
            if (err) reject(err);
            else {
              const langMap = {};
              rows.forEach(row => {
                langMap[row.lang] = row.count;
              });
              resolve(langMap);
            }
          }
        );
      })
    ]);
    
    return {
      fileCount,
      spanCount,
      chunkCount,
      languages
    };
  }

  async getDatabaseInfo() {
    await this.initialize();
    
    const version = await this.getCurrentVersion();
    const fileStats = existsSync(this.dbPath) ? require('fs').statSync(this.dbPath) : { size: 0, mtime: new Date() };
    
    return {
      version,
      size: fileStats.size,
      lastUpdated: fileStats.mtime,
      sqliteVersion: '3.x', // Would need a query to get actual version
      pageCount: 0,
      pageSize: 4096
    };
  }

  async getRecentFiles(limit = 5) {
    await this.initialize();
    
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT path, modified_time FROM file ORDER BY modified_time DESC LIMIT ?',
        [limit],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows.map(row => ({
            path: row.path,
            modifiedTime: row.modified_time
          })));
        }
      );
    });
  }

  async getSearchStatistics() {
    // This would require a search statistics table
    // For now, return null to indicate not available
    return null;
  }
}