#!/usr/bin/env node

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { Database } from '../src/storage/database-simple.js';
import { MemoryOperations } from '../src/storage/memory-operations.js';
import { ContextAssembler } from '../src/context/assembler.js';
import fs from 'fs';
import path from 'path';
import { tmpdir } from 'os';

describe('Memory Operations', () => {
  let db;
  let memoryOps;
  let contextAssembler;
  let testDbPath;

  beforeEach(async () => {
    // Create a temporary database for testing
    testDbPath = path.join(tmpdir(), `test-memory-${Date.now()}.sqlite`);
    db = new Database(testDbPath);
    await db.initialize();
    await db.migrate(); // Run migrations to create memory tables
    memoryOps = db.memory; // Use the memory operations from the initialized database
    contextAssembler = new ContextAssembler(db);
  });

  afterEach(async () => {
    if (db) {
      await db.close();
    }
    // Clean up test database
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  describe('Memory CRUD Operations', () => {
    it('should create and retrieve a memory', async () => {
      const memoryData = {
        scope: 'repo',
        kind: 'fact',
        key: 'test-fact',
        value: 'This is a test fact about the codebase',
        weight: 1.5,
        source_json: JSON.stringify({ test: true })
      };

      const memoryId = await memoryOps.insert(memoryData);
      assert.ok(memoryId);
      assert(memoryId.startsWith('m_'));

      const retrieved = await memoryOps.findById(memoryId);
      assert.ok(retrieved);
      assert.strictEqual(retrieved.scope, 'repo');
      assert.strictEqual(retrieved.kind, 'fact');
      assert.strictEqual(retrieved.key, 'test-fact');
      assert.strictEqual(retrieved.value, 'This is a test fact about the codebase');
      assert.strictEqual(retrieved.weight, 1.5);
    });

    it('should search memories by content', async () => {
      // Create test memories
      const memories = [
        {
          scope: 'repo',
          kind: 'gotcha',
          key: 'auth-gotcha',
          value: 'Remember to handle JWT expiration properly',
          source_json: JSON.stringify({ test: true })
        },
        {
          scope: 'repo',
          kind: 'decision',
          key: 'api-decision',
          value: 'Chose REST over GraphQL for simplicity',
          source_json: JSON.stringify({ test: true })
        }
      ];

      for (const memory of memories) {
        await memoryOps.insert(memory);
      }

      // Search for JWT-related content
      const results = await memoryOps.search('JWT expiration');
      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].kind, 'gotcha');
      assert.strictEqual(results[0].key, 'auth-gotcha');
    });

    it('should filter memories by scope and kind', async () => {
      // Create memories with different scopes and kinds
      const repoMemory = {
        scope: 'repo',
        kind: 'fact',
        value: 'Repo-specific fact',
        source_json: JSON.stringify({ test: true })
      };

      const globalMemory = {
        scope: 'global',
        kind: 'rule',
        value: 'Global rule',
        source_json: JSON.stringify({ test: true })
      };

      await memoryOps.insert(repoMemory);
      await memoryOps.insert(globalMemory);

      // Filter by repo scope
      const repoMemories = await memoryOps.findByScope('repo');
      assert.strictEqual(repoMemories.length, 1);
      assert.strictEqual(repoMemories[0].scope, 'repo');

      // Filter by fact kind
      const factMemories = await memoryOps.findByKind('fact');
      assert.strictEqual(factMemories.length, 1);
      assert.strictEqual(factMemories[0].kind, 'fact');
    });

    it('should handle TTL and expiration', async () => {
      const memoryData = {
        scope: 'repo',
        kind: 'insight',
        value: 'This will expire soon',
        expires_at: Date.now() - 1000, // Already expired
        source_json: JSON.stringify({ test: true })
      };

      await memoryOps.insert(memoryData);

      // Should not find expired memories in search
      const results = await memoryOps.search('expire soon', { includeExpired: false });
      assert.strictEqual(results.length, 0);

      // Should find expired memories when explicitly included
      const expiredResults = await memoryOps.search('expire soon', { includeExpired: true });
      assert.strictEqual(expiredResults.length, 1);
    });

    it('should delete memories', async () => {
      const memoryData = {
        scope: 'repo',
        kind: 'fact',
        value: 'Memory to delete',
        source_json: JSON.stringify({ test: true })
      };

      const memoryId = await memoryOps.insert(memoryData);
      assert.ok(await memoryOps.findById(memoryId));

      const deleted = await memoryOps.delete(memoryId);
      assert.strictEqual(deleted, true);

      assert.strictEqual(await memoryOps.findById(memoryId), undefined);
    });
  });

  describe('Session and Interaction Tracking', () => {
    it('should create and manage sessions', async () => {
      const sessionData = {
        tool: 'test-tool',
        user: 'test-user',
        repo: '/test/repo'
      };

      const sessionId = await memoryOps.createSession(sessionData);
      assert.ok(sessionId);
      assert(sessionId.startsWith('s_'));

      const session = await memoryOps.findSessionById(sessionId);
      assert.ok(session);
      assert.strictEqual(session.tool, 'test-tool');
      assert.strictEqual(session.user, 'test-user');
      assert.strictEqual(session.repo, '/test/repo');
      assert.ok(session.started_at);
      assert.strictEqual(session.finished_at, null);

      // Finish the session
      const finished = await memoryOps.finishSession(sessionId);
      assert.strictEqual(finished, true);

      const finishedSession = await memoryOps.findSessionById(sessionId);
      assert.ok(finishedSession.finished_at);
    });

    it('should track interactions', async () => {
      const sessionId = await memoryOps.createSession({ tool: 'test' });

      const interactionData = {
        session_id: sessionId,
        query: 'test query',
        bundle_id: 'bundle-123',
        satisfied: 1,
        notes: 'Good result'
      };

      const interactionId = await memoryOps.createInteraction(interactionData);
      assert.ok(interactionId);
      assert(typeof interactionId === 'number');

      const interactions = await memoryOps.findInteractionsBySession(sessionId);
      assert.strictEqual(interactions.length, 1);
      assert.strictEqual(interactions[0].query, 'test query');
      assert.strictEqual(interactions[0].bundle_id, 'bundle-123');
      assert.strictEqual(interactions[0].satisfied, 1);
    });
  });

  describe('Memory Links', () => {
    it('should create and retrieve memory links', async () => {
      const linkData = {
        src: 'memory-1',
        dst: 'memory-2',
        kind: 'related-to',
        score: 0.8
      };

      await memoryOps.createLink(linkData);

      const linksFrom = await memoryOps.findLinksFrom('memory-1');
      assert.strictEqual(linksFrom.length, 1);
      assert.strictEqual(linksFrom[0].dst, 'memory-2');
      assert.strictEqual(linksFrom[0].kind, 'related-to');
      assert.strictEqual(linksFrom[0].score, 0.8);

      const linksTo = await memoryOps.findLinksTo('memory-2');
      assert.strictEqual(linksTo.length, 1);
      assert.strictEqual(linksTo[0].src, 'memory-1');
    });
  });

  describe('Context Assembly', () => {
    it('should assemble context from memory only', async () => {
      // Create test memories
      const memories = [
        {
          scope: 'repo',
          kind: 'fact',
          key: 'auth-fact',
          value: 'JWT tokens expire after 24 hours',
          source_json: JSON.stringify({ test: true })
        },
        {
          scope: 'repo',
          kind: 'gotcha',
          key: 'auth-gotcha',
          value: 'Always check token expiration before processing requests',
          source_json: JSON.stringify({ test: true })
        }
      ];

      for (const memory of memories) {
        await memoryOps.insert(memory);
      }

      const bundle = await contextAssembler.assemble('auth', {
        include: ['memory'],
        limit: 10
      });

      assert.strictEqual(bundle.query, 'auth');
      assert.strictEqual(bundle.sources.length, 1);
      assert.strictEqual(bundle.sources[0].type, 'memory');
      assert.strictEqual(bundle.sources[0].items.length, 2);
      assert.ok(bundle.total_tokens > 0);
    });

    it('should generate markdown context', async () => {
      const memoryData = {
        scope: 'repo',
        kind: 'decision',
        key: 'api-decision',
        value: 'Chose REST API over GraphQL for better caching support',
        source_json: JSON.stringify({ test: true })
      };

      await memoryOps.insert(memoryData);

      const markdown = await contextAssembler.assembleMarkdown('API', {
        include: ['memory']
      });

      assert.ok(markdown.includes('# Context Bundle: API'));
      assert.ok(markdown.includes('## Memory Results'));
      assert.ok(markdown.includes('decision Memory'));
      assert.ok(markdown.includes('Chose REST API over GraphQL'));
    });

    it('should track interactions in context assembly', async () => {
      const memoryData = {
        scope: 'repo',
        kind: 'fact',
        value: 'Test fact for interaction tracking',
        source_json: JSON.stringify({ test: true })
      };

      await memoryOps.insert(memoryData);

      const tracking = await contextAssembler.createInteraction(
        'test-tool',
        'test query',
        'bundle-123',
        true,
        'Successful interaction'
      );

      assert.ok(tracking.session_id);
      assert.ok(tracking.interaction_id);

      const sessionContext = await contextAssembler.getSessionContext(tracking.session_id);
      assert.strictEqual(sessionContext.interactions.length, 1);
      assert.strictEqual(sessionContext.interactions[0].query, 'test query');
    });
  });

  describe('Statistics and Cleanup', () => {
    it('should provide memory statistics', async () => {
      // Create test memories with different kinds and scopes
      const memories = [
        { scope: 'repo', kind: 'fact', value: 'Fact 1', source_json: '{}' },
        { scope: 'repo', kind: 'gotcha', value: 'Gotcha 1', source_json: '{}' },
        { scope: 'global', kind: 'rule', value: 'Rule 1', source_json: '{}' },
        { scope: 'global', kind: 'fact', value: 'Fact 2', source_json: '{}' }
      ];

      for (const memory of memories) {
        await memoryOps.insert(memory);
      }

      const stats = await memoryOps.getMemoryStats();
      assert.strictEqual(stats.total, 4);
      assert.strictEqual(stats.byKind.fact, 2);
      assert.strictEqual(stats.byKind.gotcha, 1);
      assert.strictEqual(stats.byKind.rule, 1);
      assert.strictEqual(stats.byScope.repo, 2);
      assert.strictEqual(stats.byScope.global, 2);
    });

    it('should clean up expired memories', async () => {
      // Create expired and non-expired memories
      const expiredMemory = {
        scope: 'repo',
        kind: 'fact',
        value: 'Expired memory',
        expires_at: Date.now() - 1000,
        source_json: JSON.stringify({ test: true })
      };

      const validMemory = {
        scope: 'repo',
        kind: 'fact',
        value: 'Valid memory',
        expires_at: Date.now() + 100000,
        source_json: JSON.stringify({ test: true })
      };

      await memoryOps.insert(expiredMemory);
      await memoryOps.insert(validMemory);

      const deletedCount = await memoryOps.deleteExpired();
      assert.strictEqual(deletedCount, 1);

      const stats = await memoryOps.getMemoryStats();
      assert.strictEqual(stats.total, 1);
    });
  });
});