#!/usr/bin/env node

import path from 'path';
import { z } from 'zod';

// Input schemas
export const memoryListInputSchema = z.object({
  q: z.string().optional().describe('Search query for memory content'),
  scope: z.enum(['repo', 'workspace', 'global']).optional().describe('Memory scope filter'),
  kind: z.enum(['fact', 'gotcha', 'decision', 'plan', 'rule', 'name-alias', 'insight', 'exemplar']).optional().describe('Memory kind filter'),
  limit: z.number().min(1).max(100).default(10).describe('Maximum number of results'),
  repo: z.string().optional().describe('Repository path (for repo-scoped memories)')
});

export const memoryCreateInputSchema = z.object({
  kind: z.enum(['fact', 'gotcha', 'decision', 'plan', 'rule', 'name-alias', 'insight', 'exemplar']).describe('Memory kind'),
  key: z.string().optional().describe('Memory key for lookup'),
  value: z.string().min(1).describe('Memory value (markdown content)'),
  scope: z.enum(['repo', 'workspace', 'global']).default('repo').describe('Memory scope'),
  weight: z.number().min(0).max(10).default(1.0).describe('Memory weight for ranking'),
  ttl: z.string().optional().describe('Time to live (e.g., 30d, 2w, 6m, 1y)'),
  evidence: z.object({
    type: z.string(),
    id: z.string().optional(),
    path: z.string().optional(),
    metadata: z.record(z.any()).optional()
  }).optional().describe('Evidence source for this memory')
});

export const memoryDeleteInputSchema = z.object({
  id: z.string().describe('Memory ID to delete')
});

export const contextAssembleInputSchema = z.object({
  q: z.string().describe('Query for context assembly'),
  budget: z.number().min(100).max(100000).default(5000).describe('Token budget for assembly'),
  include: z.array(z.enum(['code', 'memory'])).default(['code']).describe('What to include in context'),
  scope: z.enum(['repo', 'workspace', 'global']).optional().describe('Memory scope filter'),
  repo: z.string().optional().describe('Repository path (for repo-scoped content)'),
  limit: z.number().min(1).max(50).default(10).describe('Maximum items per source')
});

// Result schemas
export const memoryListResultSchema = z.object({
  success: z.boolean(),
  memories: z.array(z.object({
    id: z.string(),
    scope: z.string(),
    kind: z.string(),
    key: z.string().nullable(),
    value: z.string(),
    weight: z.number(),
    created_at: z.number(),
    expires_at: z.number().nullable(),
    rank: z.number().optional()
  })),
  total: z.number()
});

export const memoryCreateResultSchema = z.object({
  success: z.boolean(),
  memory_id: z.string(),
  message: z.string()
});

export const memoryDeleteResultSchema = z.object({
  success: z.boolean(),
  deleted: z.boolean(),
  message: z.string()
});

export const contextAssembleResultSchema = z.object({
  success: z.boolean(),
  bundle: z.object({
    query: z.string(),
    total_tokens: z.number(),
    sources: z.array(z.object({
      type: z.enum(['code', 'memory']),
      items: z.array(z.any()),
      tokens: z.number()
    })),
    assembled_at: z.string()
  })
});

/**
 * Memory list handler
 */
export function createMemoryListHandler(options) {
  const { getWorkingPath, errorLogger } = options;

  return async ({ q, scope, kind, limit, repo }) => {
    const basePath = repo || getWorkingPath();
    const dbPath = path.join(basePath, '.pampax/pampax.sqlite');

    try {
      const { Database } = await import('../../storage/database-simple.js');
      const db = new Database(dbPath);
      await db.initialize();

      let memories;
      
      if (q) {
        // Search memories
        memories = db.memory.search(q, {
          limit,
          scope,
          repo: scope === 'repo' ? basePath : undefined,
          kind
        });
      } else {
        // List memories by filters
        if (kind) {
          memories = db.memory.findByKind(kind, scope, scope === 'repo' ? basePath : undefined);
        } else if (scope) {
          memories = db.memory.findByScope(scope, scope === 'repo' ? basePath : undefined);
        } else {
          // Get all memories (limited)
          memories = db.memory.search('', { limit, includeExpired: false });
        }
      }

      await db.close();

      return {
        success: true,
        memories: memories.slice(0, limit),
        total: memories.length
      };
    } catch (error) {
      if (errorLogger) {
        errorLogger.log(error, { operation: 'memory_list', q, scope, kind, limit, repo: basePath });
      }
      throw error;
    }
  };
}

/**
 * Memory create handler
 */
export function createMemoryCreateHandler(options) {
  const { getWorkingPath, errorLogger } = options;

  return async ({ kind, key, value, scope, weight, ttl, evidence }) => {
    const basePath = getWorkingPath();
    const dbPath = path.join(basePath, '.pampax/pampax.sqlite');

    try {
      const { Database } = await import('../../storage/database-simple.js');
      const db = new Database(dbPath);
      await db.initialize();

      // Parse TTL if provided
      let expiresAt;
      if (ttl) {
        expiresAt = parseTTL(ttl);
      }

      // Build source JSON
      const sourceJson = JSON.stringify({
        type: 'mcp_create',
        evidence: evidence || {},
        created_at: new Date().toISOString(),
        mcp_session: true
      });

      const memoryData = {
        scope,
        repo: scope === 'repo' ? basePath : undefined,
        kind,
        key,
        value,
        weight,
        expires_at: expiresAt,
        source_json: sourceJson
      };

      const memoryId = db.memory.insert(memoryData);
      await db.close();

      return {
        success: true,
        memory_id: memoryId,
        message: `Memory created successfully with ID: ${memoryId}`
      };
    } catch (error) {
      if (errorLogger) {
        errorLogger.log(error, { operation: 'memory_create', kind, key, scope, weight, ttl });
      }
      throw error;
    }
  };
}

/**
 * Memory delete handler
 */
export function createMemoryDeleteHandler(options) {
  const { getWorkingPath, errorLogger } = options;

  return async ({ id }) => {
    const basePath = getWorkingPath();
    const dbPath = path.join(basePath, '.pampax/pampax.sqlite');

    try {
      const { Database } = await import('../../storage/database-simple.js');
      const db = new Database(dbPath);
      await db.initialize();

      const deleted = db.memory.delete(id);
      await db.close();

      return {
        success: true,
        deleted,
        message: deleted ? `Memory ${id} deleted successfully` : `Memory ${id} not found`
      };
    } catch (error) {
      if (errorLogger) {
        errorLogger.log(error, { operation: 'memory_delete', id });
      }
      throw error;
    }
  };
}

/**
 * Context assemble handler
 */
export function createContextAssembleHandler(options) {
  const { getWorkingPath, errorLogger } = options;

  return async ({ q, budget, include, scope, repo, limit }) => {
    const basePath = repo || getWorkingPath();
    const dbPath = path.join(basePath, '.pampax/pampax.sqlite');

    try {
      const { Database } = await import('../../storage/database-simple.js');
      const db = new Database(dbPath);
      await db.initialize();

      const sources = [];
      let totalTokens = 0;

      // Include code search results
      if (include.includes('code')) {
        try {
          const codeResults = await db.search(q, {
            limit,
            includeContent: true
          });

          const codeTokens = estimateTokens(JSON.stringify(codeResults));
          
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
          if (errorLogger) {
            errorLogger.debugLog('Code search failed in context assembly', { error: error.message });
          }
        }
      }

      // Include memory search results
      if (include.includes('memory')) {
        const memoryResults = db.memory.search(q, {
          limit: Math.max(1, Math.floor(limit * 0.5)), // Allocate half the limit to memories
          scope,
          repo: scope === 'repo' ? basePath : undefined
        });

        const memoryTokens = estimateTokens(JSON.stringify(memoryResults));
        
        if (totalTokens + memoryTokens <= budget) {
          sources.push({
            type: 'memory',
            items: memoryResults,
            tokens: memoryTokens
          });
          totalTokens += memoryTokens;
        }
      }

      await db.close();

      return {
        success: true,
        bundle: {
          query: q,
          total_tokens: totalTokens,
          sources,
          assembled_at: new Date().toISOString()
        }
      };
    } catch (error) {
      if (errorLogger) {
        errorLogger.log(error, { operation: 'context_assemble', q, budget, include, scope, repo: basePath });
      }
      throw error;
    }
  };
}

/**
 * Register memory tools with MCP server
 */
export function registerMemoryTools(server, options) {
  // Memory list tool
  server.tool(
    'memory_list',
    {
      q: z.string().optional().describe('Search query for memory content'),
      scope: z.enum(['repo', 'workspace', 'global']).optional().describe('Memory scope filter'),
      kind: z.enum(['fact', 'gotcha', 'decision', 'plan', 'rule', 'name-alias', 'insight', 'exemplar']).optional().describe('Memory kind filter'),
      limit: z.number().min(1).max(100).default(10).describe('Maximum number of results'),
      repo: z.string().optional().describe('Repository path (for repo-scoped memories)')
    },
    async (params) => {
      const handler = createMemoryListHandler(options);
      const result = await handler(params);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2)
          }
        ]
      };
    }
  );

  // Memory create tool
  server.tool(
    'memory_create',
    {
      kind: z.enum(['fact', 'gotcha', 'decision', 'plan', 'rule', 'name-alias', 'insight', 'exemplar']).describe('Memory kind'),
      key: z.string().optional().describe('Memory key for lookup'),
      value: z.string().min(1).describe('Memory value (markdown content)'),
      scope: z.enum(['repo', 'workspace', 'global']).default('repo').describe('Memory scope'),
      weight: z.number().min(0).max(10).default(1.0).describe('Memory weight for ranking'),
      ttl: z.string().optional().describe('Time to live (e.g., 30d, 2w, 6m, 1y)'),
      evidence: z.object({
        type: z.string(),
        id: z.string().optional(),
        path: z.string().optional(),
        metadata: z.record(z.any()).optional()
      }).optional().describe('Evidence source for this memory')
    },
    async (params) => {
      const handler = createMemoryCreateHandler(options);
      const result = await handler(params);
      return {
        content: [
          {
            type: 'text',
            text: result.message
          }
        ]
      };
    }
  );

  // Memory delete tool
  server.tool(
    'memory_delete',
    {
      id: z.string().describe('Memory ID to delete')
    },
    async (params) => {
      const handler = createMemoryDeleteHandler(options);
      const result = await handler(params);
      return {
        content: [
          {
            type: 'text',
            text: result.message
          }
        ]
      };
    }
  );

  // Context assemble tool
  server.tool(
    'context_assemble',
    {
      q: z.string().describe('Query for context assembly'),
      budget: z.number().min(100).max(100000).default(5000).describe('Token budget for assembly'),
      include: z.array(z.enum(['code', 'memory'])).default(['code']).describe('What to include in context'),
      scope: z.enum(['repo', 'workspace', 'global']).optional().describe('Memory scope filter'),
      repo: z.string().optional().describe('Repository path (for repo-scoped content)'),
      limit: z.number().min(1).max(50).default(10).describe('Maximum items per source')
    },
    async (params) => {
      const handler = createContextAssembleHandler(options);
      const result = await handler(params);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2)
          }
        ]
      };
    }
  );
}

/**
 * Helper functions
 */
function parseTTL(ttlStr) {
  const match = ttlStr.match(/^(\d+)([dwmy])$/);
  if (!match) {
    throw new Error('Invalid TTL format. Use: {number}{d|w|m|y} (e.g., 30d, 2w, 6m, 1y)');
  }

  const [, amount, unit] = match;
  const now = Date.now();
  const multipliers = {
    d: 24 * 60 * 60 * 1000,      // days
    w: 7 * 24 * 60 * 60 * 1000,  // weeks
    m: 30 * 24 * 60 * 60 * 1000, // months (approximate)
    y: 365 * 24 * 60 * 60 * 1000 // years (approximate)
  };

  return now + (parseInt(amount) * multipliers[unit]);
}

function estimateTokens(text) {
  // Rough estimation: ~4 characters per token
  return Math.ceil(text.length / 4);
}