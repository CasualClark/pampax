/**
 * Database Migrations for PAMPAX
 * 
 * This file exports migration definitions for the database system.
 * Migrations are defined as an array of migration objects with version,
 * name, and up/down functions.
 */

/**
 * Database schema migrations
 */
export const migrations = [
  {
    version: 1,
    name: 'initial_schema',
    up: (db) => {
      // Create schema_migrations table
      db.run(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          version INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create files table
      db.run(`
        CREATE TABLE IF NOT EXISTS file (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          repo TEXT NOT NULL,
          path TEXT NOT NULL,
          content_hash TEXT NOT NULL,
          lang TEXT NOT NULL,
          size INTEGER NOT NULL,
          modified_time INTEGER NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(repo, path)
        )
      `);

      // Create spans table
      db.run(`
        CREATE TABLE IF NOT EXISTS span (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          span_id TEXT NOT NULL UNIQUE,
          repo TEXT NOT NULL,
          file_path TEXT NOT NULL,
          start_byte INTEGER NOT NULL,
          end_byte INTEGER NOT NULL,
          kind TEXT NOT NULL,
          name TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create chunks table with FTS
      db.run(`
        CREATE TABLE IF NOT EXISTS chunk (
          id TEXT PRIMARY KEY,
          span_id TEXT NOT NULL,
          repo TEXT NOT NULL,
          path TEXT NOT NULL,
          content TEXT NOT NULL,
          metadata TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (span_id) REFERENCES span(span_id)
        )
      `);

      // Create FTS virtual table for chunk content
      db.run(`
        CREATE VIRTUAL TABLE IF NOT EXISTS chunk_fts USING fts5(
          content,
          content='chunk',
          content_rowid='rowid'
        )
      `);

      // Create triggers for FTS
      db.run(`
        CREATE TRIGGER IF NOT EXISTS chunk_fts_insert AFTER INSERT ON chunk BEGIN
          INSERT INTO chunk_fts(rowid, content) VALUES (new.rowid, new.content);
        END
      `);

      db.run(`
        CREATE TRIGGER IF NOT EXISTS chunk_fts_delete AFTER DELETE ON chunk BEGIN
          INSERT INTO chunk_fts(chunk_fts, rowid, content) VALUES('delete', old.rowid, old.content);
        END
      `);

      db.run(`
        CREATE TRIGGER IF NOT EXISTS chunk_fts_update AFTER UPDATE ON chunk BEGIN
          INSERT INTO chunk_fts(chunk_fts, rowid, content) VALUES('delete', old.rowid, old.content);
          INSERT INTO chunk_fts(rowid, content) VALUES (new.rowid, new.content);
        END
      `);

      // Create indexes
      db.run('CREATE INDEX IF NOT EXISTS idx_file_repo ON file(repo)');
      db.run('CREATE INDEX IF NOT EXISTS idx_file_path ON file(path)');
      db.run('CREATE INDEX IF NOT EXISTS idx_file_lang ON file(lang)');
      db.run('CREATE INDEX IF NOT EXISTS idx_span_file ON span(file_path)');
      db.run('CREATE INDEX IF NOT EXISTS idx_span_repo ON span(repo)');
      db.run('CREATE INDEX IF NOT EXISTS idx_chunk_repo ON chunk(repo)');
      db.run('CREATE INDEX IF NOT EXISTS idx_chunk_path ON chunk(path)');
      db.run('CREATE INDEX IF NOT EXISTS idx_chunk_span ON chunk(span_id)');
    },
    down: (db) => {
      // Drop tables in reverse order
      db.run('DROP TABLE IF EXISTS chunk_fts');
      db.run('DROP TABLE IF EXISTS chunk');
      db.run('DROP TABLE IF EXISTS span');
      db.run('DROP TABLE IF EXISTS file');
      db.run('DROP TABLE IF EXISTS schema_migrations');
    }
  },

  {
    version: 2,
    name: 'add_performance_indexes',
    up: (db) => {
      // Add performance indexes for common queries
      db.run('CREATE INDEX IF NOT EXISTS idx_file_modified ON file(modified_time DESC)');
      db.run('CREATE INDEX IF NOT EXISTS idx_span_kind ON span(kind)');
      db.run('CREATE INDEX IF NOT EXISTS idx_span_name ON span(name)');
      db.run('CREATE INDEX IF NOT EXISTS idx_chunk_created ON chunk(created_at DESC)');
      
      // Composite indexes for common query patterns
      db.run('CREATE INDEX IF NOT EXISTS idx_file_repo_lang ON file(repo, lang)');
      db.run('CREATE INDEX IF NOT EXISTS idx_span_file_kind ON span(file_path, kind)');
      db.run('CREATE INDEX IF NOT EXISTS idx_chunk_repo_path ON chunk(repo, path)');
    },
    down: (db) => {
      // Drop performance indexes
      db.run('DROP INDEX IF EXISTS idx_file_modified');
      db.run('DROP INDEX IF EXISTS idx_span_kind');
      db.run('DROP INDEX IF EXISTS idx_span_name');
      db.run('DROP INDEX IF EXISTS idx_chunk_created');
      db.run('DROP INDEX IF EXISTS idx_file_repo_lang');
      db.run('DROP INDEX IF EXISTS idx_span_file_kind');
      db.run('DROP INDEX IF EXISTS idx_chunk_repo_path');
    }
  },

  {
    version: 3,
    name: 'add_search_stats',
    up: (db) => {
      // Create search statistics table
      db.run(`
        CREATE TABLE IF NOT EXISTS search_stats (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          query TEXT NOT NULL,
          results_count INTEGER NOT NULL,
          duration_ms INTEGER NOT NULL,
          repo TEXT NOT NULL,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create indexes for search stats
      db.run('CREATE INDEX IF NOT EXISTS idx_search_stats_timestamp ON search_stats(timestamp DESC)');
      db.run('CREATE INDEX IF NOT EXISTS idx_search_stats_repo ON search_stats(repo)');
    },
    down: (db) => {
      db.run('DROP TABLE IF EXISTS search_stats');
      db.run('DROP INDEX IF EXISTS idx_search_stats_timestamp');
      db.run('DROP INDEX IF EXISTS idx_search_stats_repo');
    }
  }
];

/**
 * Get latest migration version
 */
export function getLatestVersion() {
  return Math.max(...migrations.map(m => m.version));
}

/**
 * Get migration by version
 */
export function getMigration(version) {
  return migrations.find(m => m.version === version);
}

/**
 * Get pending migrations
 */
export function getPendingVersions(appliedVersions) {
  return migrations
    .filter(m => !appliedVersions.includes(m.version))
    .sort((a, b) => a.version - b.version);
}

/**
 * Validate migration sequence
 */
export function validateMigrations() {
  const versions = migrations.map(m => m.version).sort((a, b) => a - b);
  const errors = [];

  // Check for duplicate versions
  const duplicates = versions.filter((v, i) => versions.indexOf(v) !== i);
  if (duplicates.length > 0) {
    errors.push(`Duplicate migration versions: ${duplicates.join(', ')}`);
  }

  // Check for gaps in sequence
  for (let i = 1; i < versions.length; i++) {
    if (versions[i] - versions[i-1] > 1) {
      errors.push(`Gap in migration sequence between ${versions[i-1]} and ${versions[i]}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

export default migrations;