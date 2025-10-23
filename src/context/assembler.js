#!/usr/bin/env node

import path from 'path';

/**
 * Context Assembler - combines code and memory search results
 */
export class ContextAssembler {
  constructor(db) {
    this.db = db;
  }

  /**
   * Assemble context from multiple sources
   */
  async assemble(query, options = {}) {
    const {
      budget = 5000,
      include = ['code', 'memory'],
      scope,
      repo,
      limit = 10
    } = options;

    const sources = [];
    let totalTokens = 0;

    // Include code search results
    if (include.includes('code')) {
      try {
        const codeResults = await this.db.search(query, {
          limit,
          includeContent: true
        });

        const codeTokens = this.estimateTokens(JSON.stringify(codeResults));
        
        if (totalTokens + codeTokens <= budget) {
          sources.push({
            type: 'code',
            items: codeResults,
            tokens: codeTokens
          });
          totalTokens += codeTokens;
        }
      } catch (error) {
        // Code search might fail if no indexed data
        console.debug('Code search failed in context assembly', { error: error.message });
      }
    }

    // Include memory search results
    if (include.includes('memory')) {
      const memoryResults = await this.db.memory.search(query, {
        limit: Math.max(1, Math.floor(limit * 0.5)), // Allocate half the limit to memories
        scope,
        repo: scope === 'repo' ? repo : undefined
      });

      const memoryTokens = this.estimateTokens(JSON.stringify(memoryResults));
      
      if (totalTokens + memoryTokens <= budget) {
        sources.push({
          type: 'memory',
          items: memoryResults,
          tokens: memoryTokens
        });
        totalTokens += memoryTokens;
      }
    }

    return {
      query,
      total_tokens: totalTokens,
      sources,
      assembled_at: new Date().toISOString(),
      budget_used: totalTokens / budget
    };
  }

  /**
   * Create markdown representation of context
   */
  async assembleMarkdown(query, options = {}) {
    const bundle = await this.assemble(query, options);
    
    let markdown = `# Context Bundle: ${query}\n\n`;
    markdown += `**Generated:** ${bundle.assembled_at}\n`;
    markdown += `**Total Tokens:** ${bundle.total_tokens}\n`;
    markdown += `**Budget Used:** ${(bundle.budget_used * 100).toFixed(1)}%\n\n`;

    for (const source of bundle.sources) {
      markdown += `## ${source.type.charAt(0).toUpperCase() + source.type.slice(1)} Results\n\n`;
      
      if (source.items.length === 0) {
        markdown += `No ${source.type} results found.\n\n`;
        continue;
      }

      for (let index = 0; index < source.items.length; index++) {
        const item = source.items[index];
        markdown += `### ${index + 1}. `;
        
        if (source.type === 'code') {
          markdown += `${item.path}\n\n`;
          markdown += `- **Path:** \`${item.path}\`\n`;
          if (item.metadata?.spanName) {
            markdown += `- **Symbol:** ${item.metadata.spanName} (${item.metadata.spanKind})\n`;
          }
          if (item.metadata?.lang) {
            markdown += `- **Language:** ${item.metadata.lang}\n`;
          }
          markdown += `- **Score:** ${item.score?.toFixed(3) || 'N/A'}\n`;
          
          if (item.content) {
            markdown += `\n\`\`\`${item.metadata?.lang || ''}\n${item.content}\n\`\`\`\n\n`;
          }
        } else if (source.type === 'memory') {
          markdown += `${item.kind} Memory\n\n`;
          markdown += `- **ID:** ${item.id}\n`;
          markdown += `- **Kind:** ${item.kind}\n`;
          markdown += `- **Scope:** ${item.scope}\n`;
          if (item.key) {
            markdown += `- **Key:** ${item.key}\n`;
          }
          markdown += `- **Weight:** ${item.weight}\n`;
          markdown += `- **Rank:** ${item.rank?.toFixed(3) || 'N/A'}\n`;
          
          const createdDate = new Date(item.created_at);
          markdown += `- **Created:** ${createdDate.toISOString()}\n`;
          
          markdown += `\n**Value:**\n\n${item.value}\n\n`;
        }
      }
    }

    return markdown;
  }

  /**
   * Get session context with recent interactions
   */
  async getSessionContext(sessionId, options = {}) {
    const { limit = 5 } = options;
    
    const interactions = await this.db.memory.findInteractionsBySession(sessionId);
    const recentInteractions = interactions.slice(-limit);
    
    return {
      session_id: sessionId,
      interactions: recentInteractions,
      total_interactions: interactions.length
    };
  }

  /**
   * Create a new session and track interaction
   */
  async createInteraction(tool, query, bundleId, satisfied, notes) {
    // Create or get active session
    const activeSessions = await this.db.memory.findActiveSessions(tool);
    let sessionId;
    
    if (activeSessions.length > 0) {
      sessionId = activeSessions[0].id;
    } else {
      sessionId = await this.db.memory.createSession({
        tool,
        repo: process.cwd()
      });
    }

    // Create interaction
    const interactionId = await this.db.memory.createInteraction({
      session_id: sessionId,
      query,
      bundle_id: bundleId,
      satisfied: satisfied ? 1 : 0,
      notes
    });

    return {
      session_id: sessionId,
      interaction_id: interactionId
    };
  }

  /**
   * Estimate tokens for text content
   */
  estimateTokens(text) {
    // Rough estimation: ~4 characters per token
    return Math.ceil(text.length / 4);
  }

  /**
   * Get memory statistics
   */
  async getMemoryStats(scope, repo) {
    return await this.db.memory.getMemoryStats(scope, repo);
  }

  /**
   * Clean up expired memories
   */
  async cleanupExpiredMemories() {
    return await this.db.memory.deleteExpired();
  }
}

/**
 * Create context assembler from database path
 */
export async function createContextAssembler(dbPath) {
  const { Database } = await import('../storage/database-simple.js');
  const db = new Database(dbPath);
  await db.initialize();
  
  return new ContextAssembler(db);
}