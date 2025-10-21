/**
 * Caches progressive context results to avoid re-computation
 */

class CacheManager {
  constructor(maxAge = 300000) { // 5 minutes default
    this.sessions = new Map();
    this.maxAge = maxAge;
  }
  
  buildKey(query, detailLevel, files) {
    const filesKey = files.length > 0 ? files.sort().join(',') : '';
    return `${query}:${detailLevel}:${filesKey}`;
  }
  
  get(sessionId, key) {
    if (!this.sessions.has(sessionId)) return null;
    
    const session = this.sessions.get(sessionId);
    const cached = session.get(key);
    
    if (!cached) return null;
    
    // Check if expired
    if (Date.now() - cached.timestamp > this.maxAge) {
      session.delete(key);
      return null;
    }
    
    return cached.data;
  }
  
  set(sessionId, key, data) {
    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, new Map());
    }
    
    const session = this.sessions.get(sessionId);
    session.set(key, {
      data,
      timestamp: Date.now()
    });
    
    // Cleanup old sessions periodically
    this.cleanupOldSessions();
  }
  
  clear(sessionId) {
    if (sessionId) {
      this.sessions.delete(sessionId);
    } else {
      this.sessions.clear();
    }
  }
  
  cleanupOldSessions() {
    const now = Date.now();
    
    for (const [sessionId, session] of this.sessions.entries()) {
      // Remove expired entries
      for (const [key, cached] of session.entries()) {
        if (now - cached.timestamp > this.maxAge) {
          session.delete(key);
        }
      }
      
      // Remove empty sessions
      if (session.size === 0) {
        this.sessions.delete(sessionId);
      }
    }
  }
  
  getStats() {
    let totalEntries = 0;
    for (const session of this.sessions.values()) {
      totalEntries += session.size;
    }
    
    return {
      sessions: this.sessions.size,
      total_entries: totalEntries,
      max_age_ms: this.maxAge
    };
  }
}

module.exports = CacheManager;