#!/usr/bin/env node

import crypto from 'crypto';

/**
 * Memory operations class following existing CRUD patterns
 */
export class MemoryOperations {
  constructor(db) {
    this.db = db;
  }

  // Memory operations
  async insert(memory) {
    const id = this.generateMemoryId(memory);
    const createdAt = Date.now();

    try {
      return new Promise((resolve, reject) => {
        this.db.run(`
          INSERT OR REPLACE INTO memory 
          (id, scope, repo, branch, kind, key, value, weight, created_at, expires_at, source_json)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          id,
          memory.scope,
          memory.repo,
          memory.branch,
          memory.kind,
          memory.key,
          memory.value,
          memory.weight || 1.0,
          createdAt,
          memory.expires_at,
          memory.source_json
        ], function(err) {
          if (err) {
            reject(err);
          } else {
            resolve(id);
          }
        });
      });
    } catch (error) {
      console.error('Failed to insert memory record', { 
        error: error instanceof Error ? error.message : String(error),
        memory: id 
      });
      throw error;
    }
  }

  async insertBulk(memories) {
    const results = [];
    for (const memory of memories) {
      results.push(await this.insert(memory));
    }
    return results;
  }

  async findById(id) {
    return new Promise((resolve, reject) => {
      this.db.get(`
        SELECT * FROM memory WHERE id = ?
      `, [id], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  async findByScope(scope, repo) {
    let sql = 'SELECT * FROM memory WHERE scope = ?';
    const params = [scope];

    if (repo) {
      sql += ' AND repo = ?';
      params.push(repo);
    }

    sql += ' ORDER BY created_at DESC';

    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  async findByKind(kind, scope, repo) {
    let sql = 'SELECT * FROM memory WHERE kind = ?';
    const params = [kind];

    if (scope) {
      sql += ' AND scope = ?';
      params.push(scope);
    }

    if (repo) {
      sql += ' AND repo = ?';
      params.push(repo);
    }

    sql += ' ORDER BY created_at DESC';

    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  async findByKey(key, scope) {
    let sql = 'SELECT * FROM memory WHERE key = ?';
    const params = [key];

    if (scope) {
      sql += ' AND scope = ?';
      params.push(scope);
    }

    sql += ' ORDER BY created_at DESC';

    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  async search(query, options = {}) {
    const {
      limit = 10,
      scope,
      repo,
      kind,
      includeExpired = false
    } = options;

    let sql = `
      SELECT m.*, rank FROM memory_fts fts
      JOIN memory m ON fts.rowid = m.rowid
      WHERE memory_fts MATCH ?
    `;
    const params = [query];

    // Add filters
    if (scope) {
      sql += ' AND m.scope = ?';
      params.push(scope);
    }

    if (repo) {
      sql += ' AND m.repo = ?';
      params.push(repo);
    }

    if (kind) {
      sql += ' AND m.kind = ?';
      params.push(kind);
    }

    if (!includeExpired) {
      sql += ' AND (m.expires_at IS NULL OR m.expires_at > ?)';
      params.push(Date.now());
    }

    sql += ' ORDER BY rank, m.weight DESC, m.created_at DESC LIMIT ?';
    params.push(limit);

    try {
      return new Promise((resolve, reject) => {
        this.db.all(sql, params, (err, rows) => {
          if (err) {
            console.error('Memory search failed', { 
              error: err.message,
              query 
            });
            resolve([]);
          } else {
            resolve(rows);
          }
        });
      });
    } catch (error) {
      console.error('Memory search failed', { 
        error: error instanceof Error ? error.message : String(error),
        query 
      });
      return [];
    }
  }

  async update(id, updates) {
    const fields = [];
    const values = [];

    for (const [key, value] of Object.entries(updates)) {
      if (key !== 'id' && key !== 'created_at') {
        fields.push(`${key} = ?`);
        values.push(value);
      }
    }

    if (fields.length === 0) {
      return false;
    }

    values.push(id);

    return new Promise((resolve, reject) => {
      this.db.run(`
        UPDATE memory SET ${fields.join(', ')} WHERE id = ?
      `, values, function(err) {
        if (err) reject(err);
        else resolve(this.changes > 0);
      });
    });
  }

  async delete(id) {
    return new Promise((resolve, reject) => {
      this.db.run(`
        DELETE FROM memory WHERE id = ?
      `, [id], function(err) {
        if (err) reject(err);
        else resolve(this.changes > 0);
      });
    });
  }

  async deleteExpired() {
    return new Promise((resolve, reject) => {
      this.db.run(`
        DELETE FROM memory WHERE expires_at IS NOT NULL AND expires_at <= ?
      `, [Date.now()], function(err) {
        if (err) reject(err);
        else resolve(this.changes);
      });
    });
  }

  // Session operations
  async createSession(session) {
    const id = this.generateSessionId(session);
    const startedAt = Date.now();

    try {
      return new Promise((resolve, reject) => {
        this.db.run(`
          INSERT OR REPLACE INTO session 
          (id, tool, user, repo, branch, started_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `, [
          id,
          session.tool,
          session.user,
          session.repo,
          session.branch,
          startedAt
        ], function(err) {
          if (err) {
            reject(err);
          } else {
            resolve(id);
          }
        });
      });
    } catch (error) {
      console.error('Failed to create session', { 
        error: error instanceof Error ? error.message : String(error),
        sessionId: id 
      });
      throw error;
    }
  }

  async finishSession(sessionId) {
    const finishedAt = Date.now();
    
    return new Promise((resolve, reject) => {
      this.db.run(`
        UPDATE session SET finished_at = ? WHERE id = ?
      `, [finishedAt, sessionId], function(err) {
        if (err) reject(err);
        else resolve(this.changes > 0);
      });
    });
  }

  async findSessionById(id) {
    return new Promise((resolve, reject) => {
      this.db.get(`
        SELECT * FROM session WHERE id = ?
      `, [id], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  async findActiveSessions(tool) {
    let sql = 'SELECT * FROM session WHERE finished_at IS NULL';
    const params = [];

    if (tool) {
      sql += ' AND tool = ?';
      params.push(tool);
    }

    sql += ' ORDER BY started_at DESC';

    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  // Interaction operations
  async createInteraction(interaction) {
    const ts = Date.now();

    try {
      return new Promise((resolve, reject) => {
        this.db.run(`
          INSERT INTO interaction (session_id, ts, query, bundle_id, satisfied, notes)
          VALUES (?, ?, ?, ?, ?, ?)
        `, [
          interaction.session_id,
          ts,
          interaction.query,
          interaction.bundle_id,
          interaction.satisfied,
          interaction.notes
        ], function(err) {
          if (err) {
            reject(err);
          } else {
            resolve(this.lastID);
          }
        });
      });
    } catch (error) {
      console.error('Failed to create interaction', { 
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  async findInteractionsBySession(sessionId) {
    return new Promise((resolve, reject) => {
      this.db.all(`
        SELECT * FROM interaction WHERE session_id = ? ORDER BY ts
      `, [sessionId], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  async findRecentInteractions(limit = 10) {
    return new Promise((resolve, reject) => {
      this.db.all(`
        SELECT * FROM interaction ORDER BY ts DESC LIMIT ?
      `, [limit], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  // Memory link operations
  async createLink(link) {
    try {
      return new Promise((resolve, reject) => {
        this.db.run(`
          INSERT OR REPLACE INTO memory_link (src, dst, kind, score)
          VALUES (?, ?, ?, ?)
        `, [link.src, link.dst, link.kind, link.score || 1.0], function(err) {
          if (err) reject(err);
          else resolve();
        });
      });
    } catch (error) {
      console.error('Failed to create memory link', { 
        error: error instanceof Error ? error.message : String(error),
        link 
      });
      throw error;
    }
  }

  async findLinksFrom(src) {
    return new Promise((resolve, reject) => {
      this.db.all(`
        SELECT * FROM memory_link WHERE src = ?
      `, [src], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  async findLinksTo(dst) {
    return new Promise((resolve, reject) => {
      this.db.all(`
        SELECT * FROM memory_link WHERE dst = ?
      `, [dst], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  async deleteLink(src, dst, kind) {
    return new Promise((resolve, reject) => {
      this.db.run(`
        DELETE FROM memory_link WHERE src = ? AND dst = ? AND kind = ?
      `, [src, dst, kind], function(err) {
        if (err) reject(err);
        else resolve(this.changes > 0);
      });
    });
  }

  // Utility methods
  generateMemoryId(memory) {
    const payload = {
      scope: memory.scope,
      repo: memory.repo,
      kind: memory.kind,
      key: memory.key,
      value: memory.value.substring(0, 100), // First 100 chars for uniqueness
      timestamp: Date.now()
    };
    
    return `m_${crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex').substring(0, 16)}`;
  }

  generateSessionId(session) {
    const payload = {
      tool: session.tool,
      user: session.user,
      repo: session.repo,
      timestamp: Date.now()
    };
    
    return `s_${crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex').substring(0, 16)}`;
  }

  // Statistics and health
  async getMemoryStats(scope, repo) {
    let sql = 'SELECT kind, scope, COUNT(*) as count FROM memory';
    const params = [];
    const whereConditions = [];

    if (scope) {
      whereConditions.push('scope = ?');
      params.push(scope);
    }

    if (repo) {
      whereConditions.push('repo = ?');
      params.push(repo);
    }

    if (whereConditions.length > 0) {
      sql += ' WHERE ' + whereConditions.join(' AND ');
    }

    sql += ' GROUP BY kind, scope';

    const rows = await new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    const byKind = {};
    const byScope = {};
    let total = 0;

    if (Array.isArray(rows)) {
      for (const row of rows) {
        byKind[row.kind] = (byKind[row.kind] || 0) + row.count;
        byScope[row.scope] = (byScope[row.scope] || 0) + row.count;
        total += row.count;
      }
    }

    // Count expired memories
    let expiredSql = 'SELECT COUNT(*) as count FROM memory WHERE expires_at IS NOT NULL AND expires_at <= ?';
    let expiredParams = [Date.now()];
    
    if (scope) {
      expiredSql += ' AND scope = ?';
      expiredParams.push(scope);
    }

    if (repo) {
      expiredSql += ' AND repo = ?';
      expiredParams.push(repo);
    }

    const expired = await new Promise((resolve, reject) => {
      this.db.get(expiredSql, expiredParams, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    return {
      total,
      byKind,
      byScope,
      expired: expired.count
    };
  }
}