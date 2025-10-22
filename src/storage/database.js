#!/usr/bin/env node

import { DatabaseManager } from './database-async.ts';
import { migrations } from './migrations.js';
import { logger } from '../config/logger.js';
import fs from 'fs';
import path from 'path';

/**
 * Main Database class that provides the interface for CLI commands
 */
export class Database {
  constructor(dbPath) {
    this.manager = new DatabaseManager({ path: dbPath });
    this.dbPath = dbPath;
    
    // Register migrations
    migrations.forEach(migration => {
      this.manager.registerMigration({
        version: migration.version,
        name: migration.name,
        up: async (db) => {
          return new Promise((resolve, reject) => {
            try {
              migration.up(db);
              resolve();
            } catch (error) {
              reject(error);
            }
          });
        },
        down: async (db) => {
          return new Promise((resolve, reject) => {
            try {
              if (migration.down) {
                migration.down(db);
              }
              resolve();
            } catch (error) {
              reject(error);
            }
          });
        }
      });
    });
  }

  async initialize() {
    await this.manager.initialize();
  }

  async close() {
    await this.manager.close();
  }

  // Migration methods
  async migrate() {
    await this.initialize();
    const appliedVersions = await this.getAppliedVersions();
    const pendingMigrations = migrations.filter(
      m => !appliedVersions.includes(m.version)
    );
    
    for (const migration of pendingMigrations) {
      await this.manager.transaction(async () => {
        const db = this.manager.getDatabase();
        migration.up(db);
        
        return new Promise((resolve, reject) => {
          db.run(
            `INSERT INTO schema_migrations (version, name) VALUES (?, ?)`,
            [migration.version, migration.name],
            function(err) {
              if (err) reject(err);
              else resolve();
            }
          );
        });
      });
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
    
    await this.manager.transaction(async () => {
      const db = this.manager.getDatabase();
      
      if (migration.down) {
        migration.down(db);
      }
      
      return new Promise((resolve, reject) => {
        db.run(
          `DELETE FROM schema_migrations WHERE version = ?`,
          [lastVersion],
          function(err) {
            if (err) reject(err);
            else resolve();
          }
        );
      });
    });
    
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

  async getAppliedVersions() {
    const db = this.manager.getDatabase();
    
    return new Promise((resolve, reject) => {
      db.all('SELECT version FROM schema_migrations ORDER BY version', (err, rows) => {
        if (err) reject(err);
        else resolve(rows.map(row => row.version));
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
    
    return this.manager.transaction(async () => {
      const db = this.manager.getDatabase();
      
      return new Promise((resolve, reject) => {
        db.run(
          `INSERT OR REPLACE INTO file (repo, path, content_hash, lang, size, modified_time) 
           VALUES (?, ?, ?, ?, ?, ?)`,
          [fileData.repo, fileData.path, fileData.contentHash, fileData.lang, fileData.size, fileData.modifiedTime],
          function(err) {
            if (err) reject(err);
            else resolve(this.lastID);
          }
        );
      });
    });
  }

  async storeChunk(chunkData) {
    await this.initialize();
    
    return this.manager.transaction(async () => {
      const db = this.manager.getDatabase();
      
      return new Promise((resolve, reject) => {
        db.run(
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
    });
  }

  async search(query, options = {}) {
    await this.initialize();
    
    const limit = options.limit || 10;
    const offset = options.offset || 0;
    const filters = options.filters || {};
    
    let whereClause = 'WHERE c.content MATCH ?';
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
        rank
      FROM chunk c
      LEFT JOIN file f ON c.path = f.path AND c.repo = f.repo
      ${whereClause}
      ORDER BY rank
      LIMIT ? OFFSET ?
    `;
    
    params.push(limit, offset);
    
    const db = this.manager.getDatabase();
    
    return new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => {
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

  async ftsSearch(query, options = {}) {
    await this.initialize();
    
    const limit = options.limit || 10;
    const offset = options.offset || 0;
    const orderBy = options.orderBy || 'rank';
    
    let whereClause = 'WHERE chunk.content MATCH ?';
    let params = [query];
    
    if (options.filters?.pathGlob) {
      whereClause += ' AND chunk.path GLOB ?';
      params.push(options.filters.pathGlob);
    }
    
    if (options.filters?.lang) {
      whereClause += ' AND file.lang = ?';
      params.push(options.filters.lang);
    }
    
    const sql = `
      SELECT 
        chunk.id,
        chunk.path,
        snippet(chunk.content, 1, '<mark>', '</mark>', '...', 32) as snippet,
        rank
      FROM chunk
      LEFT JOIN file ON chunk.path = file.path
      ${whereClause}
      ORDER BY ${orderBy}
      LIMIT ? OFFSET ?
    `;
    
    params.push(limit, offset);
    
    const db = this.manager.getDatabase();
    
    return new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  async getStatistics() {
    await this.initialize();
    
    const db = this.manager.getDatabase();
    
    const [fileCount, spanCount, chunkCount, languages] = await Promise.all([
      new Promise((resolve, reject) => {
        db.get('SELECT COUNT(*) as count FROM file', (err, row) => {
          if (err) reject(err);
          else resolve(row.count);
        });
      }),
      new Promise((resolve, reject) => {
        db.get('SELECT COUNT(*) as count FROM span', (err, row) => {
          if (err) reject(err);
          else resolve(row.count);
        });
      }),
      new Promise((resolve, reject) => {
        db.get('SELECT COUNT(*) as count FROM chunk', (err, row) => {
          if (err) reject(err);
          else resolve(row.count);
        });
      }),
      new Promise((resolve, reject) => {
        db.all(
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
    
    const stats = await this.manager.getStats();
    const fileStats = fs.statSync(this.dbPath);
    
    return {
      version: await this.getCurrentVersion(),
      size: fileStats.size,
      lastUpdated: fileStats.mtime,
      sqliteVersion: stats.version,
      pageCount: stats.pageCount,
      pageSize: stats.pageSize
    };
  }

  async getRecentFiles(limit = 5) {
    await this.initialize();
    
    const db = this.manager.getDatabase();
    
    return new Promise((resolve, reject) => {
      db.all(
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