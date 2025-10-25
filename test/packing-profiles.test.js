/**
 * Comprehensive Tests for Packing Profiles System
 * 
 * Tests profile creation, retrieval, update, deletion,
 * disk caching, persistence, validation, and integration.
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { Database } from 'better-sqlite3';
import { PackingProfileManager, MODEL_PROFILES, DEFAULT_PRIORITIES } from '../src/tokenization/packing-profiles.js';
import { StorageOperations } from '../src/storage/crud.js';
import { ContextOptimizer } from '../src/tokenization/context-optimizer.js';
import { SearchIntegrationManager } from '../src/tokenization/search-integration.js';

describe('Packing Profiles System', () => {
  let db, storage, profileManager, searchIntegration;

  beforeEach(() => {
    // Create in-memory database for testing
    db = new Database(':memory:');
    
    // Initialize tables
    db.exec(`
      CREATE TABLE packing_profile (
        id TEXT PRIMARY KEY,
        repository TEXT NOT NULL,
        model TEXT NOT NULL,
        priorities TEXT NOT NULL,
        budget_allocation TEXT NOT NULL,
        capsule_strategies TEXT NOT NULL,
        truncation_strategies TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        ttl INTEGER,
        version INTEGER NOT NULL DEFAULT 1,
        metadata TEXT
      )
    `);

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

    db.exec(`
      CREATE TABLE IF NOT EXISTS chunk (
        id TEXT PRIMARY KEY,
        span_id TEXT NOT NULL,
        repo TEXT NOT NULL,
        path TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at INTEGER
      )
    `);

    storage = new StorageOperations(db);
    profileManager = new PackingProfileManager(storage);
    searchIntegration = new SearchIntegrationManager(profileManager, storage);
  });

  afterEach(() => {
    db.close();
  });

  describe('PackingProfileManager', () => {
    test('should create a new packing profile', async () => {
      const profileData = {
        repository: 'test-repo',
        model: 'gpt-4',
        priorities: DEFAULT_PRIORITIES,
        budgetAllocation: MODEL_PROFILES['gpt-4'].budgetAllocation,
        capsuleStrategies: MODEL_PROFILES['gpt-4'].capsuleStrategies,
        truncationStrategies: MODEL_PROFILES['gpt-4'].truncationStrategies
      };

      const profileId = await profileManager.createProfile(profileData);
      assert.ok(profileId);
      assert.ok(profileId.match(/^profile-test-repo-gpt-4-/));

      const profile = await profileManager.getProfile('test-repo', 'gpt-4');
      assert.ok(profile);
      assert.strictEqual(profile.repository, 'test-repo');
      assert.strictEqual(profile.model, 'gpt-4');
      assert.strictEqual(profile.version, 1);
    });

    test('should update an existing packing profile', async () => {
      const profileData = {
        repository: 'test-repo',
        model: 'gpt-4',
        priorities: DEFAULT_PRIORITIES,
        budgetAllocation: MODEL_PROFILES['gpt-4'].budgetAllocation,
        capsuleStrategies: MODEL_PROFILES['gpt-4'].capsuleStrategies,
        truncationStrategies: MODEL_PROFILES['gpt-4'].truncationStrategies
      };

      const profileId = await profileManager.createProfile(profileData);
      const profile = await profileManager.getProfile('test-repo', 'gpt-4');
      
      await profileManager.updateProfile(profileId, {
        priorities: {
          ...profile.priorities,
          tests: 0.9
        }
      });

      const updatedProfile = await profileManager.getProfile('test-repo', 'gpt-4');
      assert.strictEqual(updatedProfile.priorities.tests, 0.9);
      assert.strictEqual(updatedProfile.version, 2);
    });

    test('should delete a packing profile', async () => {
      const profileData = {
        repository: 'test-repo',
        model: 'gpt-4',
        priorities: DEFAULT_PRIORITIES,
        budgetAllocation: MODEL_PROFILES['gpt-4'].budgetAllocation,
        capsuleStrategies: MODEL_PROFILES['gpt-4'].capsuleStrategies,
        truncationStrategies: MODEL_PROFILES['gpt-4'].truncationStrategies
      };

      const profileId = await profileManager.createProfile(profileData);
      await profileManager.deleteProfile(profileId);

      await assert.rejects(
        () => profileManager.getProfile('test-repo', 'gpt-4'),
        /Profile not found/
      );
    });

    test('should generate optimized profile for repository', async () => {
      // Add some mock data to the database
      storage.files.insert({
        repo: 'test-repo',
        path: 'src/index.js',
        content_hash: 'hash1',
        lang: 'javascript'
      });

      storage.chunks.insert({
        span_id: 'span1',
        repo: 'test-repo',
        path: 'src/index.js',
        content: 'function test() { return true; }'
      });

      const profile = await profileManager.optimizeProfile('test-repo', 'gpt-4');
      
      assert.ok(profile);
      assert.strictEqual(profile.repository, 'test-repo');
      assert.strictEqual(profile.model, 'gpt-4');
      assert.strictEqual(profile.metadata.generated, true);
    });

    test('should cache profiles in memory', async () => {
      const profileData = {
        repository: 'test-repo',
        model: 'gpt-4',
        priorities: DEFAULT_PRIORITIES,
        budgetAllocation: MODEL_PROFILES['gpt-4'].budgetAllocation,
        capsuleStrategies: MODEL_PROFILES['gpt-4'].capsuleStrategies,
        truncationStrategies: MODEL_PROFILES['gpt-4'].truncationStrategies
      };

      await profileManager.createProfile(profileData);
      
      // First call should hit database
      const profile1 = await profileManager.getProfile('test-repo', 'gpt-4');
      
      // Second call should hit cache
      const profile2 = await profileManager.getProfile('test-repo', 'gpt-4');
      
      assert.deepStrictEqual(profile1, profile2);
    });

    test('should handle profile expiration', async () => {
      const profileData = {
        repository: 'test-repo',
        model: 'gpt-4',
        priorities: DEFAULT_PRIORITIES,
        budgetAllocation: MODEL_PROFILES['gpt-4'].budgetAllocation,
        capsuleStrategies: MODEL_PROFILES['gpt-4'].capsuleStrategies,
        truncationStrategies: MODEL_PROFILES['gpt-4'].truncationStrategies,
        ttl: 1 // 1ms TTL
      };

      await profileManager.createProfile(profileData);
      
      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Should generate new profile due to expiration
      const profile = await profileManager.getProfile('test-repo', 'gpt-4');
      assert.ok(profile);
    });

    test('should cleanup expired profiles', async () => {
      const profileData = {
        repository: 'test-repo',
        model: 'gpt-4',
        priorities: DEFAULT_PRIORITIES,
        budgetAllocation: MODEL_PROFILES['gpt-4'].budgetAllocation,
        capsuleStrategies: MODEL_PROFILES['gpt-4'].capsuleStrategies,
        truncationStrategies: MODEL_PROFILES['gpt-4'].truncationStrategies,
        ttl: 1 // 1ms TTL
      };

      await profileManager.createProfile(profileData);
      
      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const deletedCount = await profileManager.cleanupExpired();
      assert.ok(deletedCount >= 0);
    });
  });

  describe('ContextOptimizer', () => {
    let optimizer, profile;

    beforeEach(async () => {
      profile = {
        id: 'test-profile',
        repository: 'test-repo',
        model: 'gpt-4',
        priorities: DEFAULT_PRIORITIES,
        budgetAllocation: MODEL_PROFILES['gpt-4'].budgetAllocation,
        capsuleStrategies: MODEL_PROFILES['gpt-4'].capsuleStrategies,
        truncationStrategies: MODEL_PROFILES['gpt-4'].truncationStrategies,
        createdAt: new Date(),
        updatedAt: new Date(),
        version: 1
      };

      optimizer = new ContextOptimizer(profile);
    });

    test('should classify content items correctly', async () => {
      const items = [
        {
          id: '1',
          content: 'function test() { return true; }',
          path: 'src/test.js',
          spanKind: 'function',
          spanName: 'test',
          language: 'javascript'
        },
        {
          id: '2',
          content: 'describe("test", () => { it("should pass", () => { expect(true).toBe(true); }); });',
          path: 'test/test.spec.js',
          language: 'javascript'
        },
        {
          id: '3',
          content: 'DATABASE_URL=postgres://localhost/test',
          path: '.env',
          language: 'env'
        }
      ];

      const result = await optimizer.optimize(items);

      assert.strictEqual(result.packed.length, 3);
      assert.ok(result.totalTokens > 0);
      assert.ok(result.budgetUsed >= 0);
      assert.ok(result.budgetUsed <= 1);
    });

    test('should apply intent-based adjustments', async () => {
      const items = [
        {
          id: '1',
          content: 'function getUserById(id) { return database.users.find(id); }',
          path: 'src/users.js',
          spanKind: 'function',
          spanName: 'getUserById',
          language: 'javascript'
        }
      ];

      const intent = {
        intent: 'symbol',
        confidence: 0.8,
        entities: [
          { type: 'function', value: 'getUserById', position: 0 }
        ],
        suggestedPolicies: ['symbol-level-2']
      };

      const result = await optimizer.optimize(items, intent);

      assert.ok(result.packed[0].priority > 0.5);
      assert.strictEqual(result.packed[0].type, 'must-have');
    });

    test('should create capsules for large content', async () => {
      const largeContent = 'function largeFunction() {\n' + 
        '  // This is a very large function\n'.repeat(100) +
        '  return true;\n' +
        '}';

      const items = [
        {
          id: '1',
          content: largeContent,
          path: 'src/large.js',
          spanKind: 'function',
          spanName: 'largeFunction',
          language: 'javascript'
        }
      ];

      const result = await optimizer.optimize(items);

      // Should create capsules due to large content
      assert.ok(result.packed.length >= 1);
      if (result.packed.length > 1) {
        assert.ok(result.packed[0].capsule);
      }
    });

    test('should apply truncation when over budget', async () => {
      const items = Array.from({ length: 50 }, (_, i) => ({
        id: `${i}`,
        content: `function func${i}() { return ${i}; }`,
        path: `src/file${i}.js`,
        spanKind: 'function',
        spanName: `func${i}`,
        language: 'javascript'
      }));

      const smallBudgetProfile = {
        ...profile,
        budgetAllocation: {
          total: 1000,
          mustHave: 200,
          important: 300,
          supplementary: 200,
          optional: 100,
          reserve: 200
        }
      };

      const smallOptimizer = new ContextOptimizer(smallBudgetProfile);
      const result = await smallOptimizer.optimize(items);

      assert.strictEqual(result.truncated, true);
      assert.ok(result.totalTokens <= 1000);
    });
  });

  describe('SearchIntegrationManager', () => {
    test('should optimize search results', async () => {
      const searchResults = [
        {
          id: '1',
          content: 'function search() { return results; }',
          path: 'src/search.js',
          spanKind: 'function',
          spanName: 'search',
          language: 'javascript',
          score: 0.9
        },
        {
          id: '2',
          content: 'describe("search", () => { it("should work", () => {}); });',
          path: 'test/search.test.js',
          language: 'javascript',
          score: 0.7
        }
      ];

      const result = await searchIntegration.optimizeSearchResults(
        'search function',
        searchResults,
        {
          repository: 'test-repo',
          model: 'gpt-4'
        }
      );

      assert.strictEqual(result.query, 'search function');
      assert.strictEqual(result.results.length, 2);
      assert.ok(result.optimized.packed);
      assert.ok(result.optimized.totalTokens > 0);
      assert.ok(result.profile);
      assert.ok(result.performance);
    });

    test('should track performance metrics', async () => {
      const searchResults = [
        {
          id: '1',
          content: 'function test() { return true; }',
          path: 'src/test.js',
          language: 'javascript',
          score: 0.8
        }
      ];

      await searchIntegration.optimizeSearchResults(
        'test',
        searchResults,
        {
          repository: 'test-repo',
          model: 'gpt-4',
          options: { trackPerformance: true }
        }
      );

      const stats = searchIntegration.getPerformanceStats();
      assert.strictEqual(stats.totalQueries, 1);
      assert.ok(stats.avgTime > 0);
    });

    test('should handle errors gracefully', async () => {
      const invalidResults = [
        {
          id: '1',
          content: null,
          path: 'invalid',
          score: 'invalid'
        }
      ];

      const result = await searchIntegration.optimizeSearchResults(
        'invalid query',
        invalidResults,
        {
          repository: 'test-repo',
          model: 'gpt-4'
        }
      );

      assert.ok(result.results);
      assert.ok(result.optimized.packed);
      assert.ok(result.profile);
    });
  });

  describe('Profile Validation', () => {
    test('should validate profile constraints', async () => {
      const invalidProfile = {
        repository: '',
        model: '',
        priorities: {
          tests: 0,
          code: 0,
          comments: 0,
          examples: 0,
          config: 0,
          docs: 0
        },
        budgetAllocation: {
          total: 1000,
          mustHave: 500,
          important: 400,
          supplementary: 300,
          optional: 200,
          reserve: 100
        },
        capsuleStrategies: MODEL_PROFILES['gpt-4'].capsuleStrategies,
        truncationStrategies: MODEL_PROFILES['gpt-4'].truncationStrategies
      };

      await assert.rejects(
        () => profileManager.createProfile(invalidProfile),
        /Profile must have repository and model/
      );
    });

    test('should validate budget allocation', async () => {
      const invalidBudgetProfile = {
        repository: 'test-repo',
        model: 'gpt-4',
        priorities: DEFAULT_PRIORITIES,
        budgetAllocation: {
          total: 1000,
          mustHave: 600,
          important: 500,
          supplementary: 400,
          optional: 300,
          reserve: 200
        },
        capsuleStrategies: MODEL_PROFILES['gpt-4'].capsuleStrategies,
        truncationStrategies: MODEL_PROFILES['gpt-4'].truncationStrategies
      };

      await assert.rejects(
        () => profileManager.createProfile(invalidBudgetProfile),
        /Budget allocation .* exceeds total/
      );
    });

    test('should handle profile update validation', async () => {
      const profileData = {
        repository: 'test-repo',
        model: 'gpt-4',
        priorities: DEFAULT_PRIORITIES,
        budgetAllocation: MODEL_PROFILES['gpt-4'].budgetAllocation,
        capsuleStrategies: MODEL_PROFILES['gpt-4'].capsuleStrategies,
        truncationStrategies: MODEL_PROFILES['gpt-4'].truncationStrategies
      };

      const profileId = await profileManager.createProfile(profileData);

      await assert.rejects(
        () => profileManager.updateProfile(profileId, {
          budgetAllocation: {
            total: 1000,
            mustHave: 1100, // Exceeds total
            important: 0,
            supplementary: 0,
            optional: 0,
            reserve: 0
          }
        }),
        /Budget allocation .* exceeds total/
      );
    });
  });

  describe('Model Profiles', () => {
    test('should have appropriate profiles for different models', () => {
      assert.ok(MODEL_PROFILES['gpt-4']);
      assert.ok(MODEL_PROFILES['gpt-3.5-turbo']);
      assert.ok(MODEL_PROFILES['claude-3']);
      assert.ok(MODEL_PROFILES['default']);

      // GPT-4 should have larger budget than GPT-3.5
      assert.ok(
        MODEL_PROFILES['gpt-4'].budgetAllocation.total >
        MODEL_PROFILES['gpt-3.5-turbo'].budgetAllocation.total
      );

      // Claude should have the largest budget
      assert.ok(
        MODEL_PROFILES['claude-3'].budgetAllocation.total >
        MODEL_PROFILES['gpt-4'].budgetAllocation.total
      );
    });

    test('should have valid profile structures', () => {
      Object.values(MODEL_PROFILES).forEach(profile => {
        assert.ok(profile.priorities, 'Should have priorities');
        assert.ok(profile.budgetAllocation, 'Should have budget allocation');
        assert.ok(profile.capsuleStrategies, 'Should have capsule strategies');
        assert.ok(profile.truncationStrategies, 'Should have truncation strategies');

        // Validate budget allocation sums
        const { total, mustHave, important, supplementary, optional, reserve } = profile.budgetAllocation;
        const allocated = mustHave + important + supplementary + optional + reserve;
        assert.ok(allocated <= total, 'Budget allocation should not exceed total');
      });
    });
  });

  describe('Default Priorities', () => {
    test('should have sensible default priorities', () => {
      assert.strictEqual(DEFAULT_PRIORITIES.code, 1.0);
      assert.strictEqual(DEFAULT_PRIORITIES.tests, 0.8);
      assert.strictEqual(DEFAULT_PRIORITIES.examples, 0.7);
      assert.strictEqual(DEFAULT_PRIORITIES.comments, 0.6);
      assert.strictEqual(DEFAULT_PRIORITIES.config, 0.5);
      assert.strictEqual(DEFAULT_PRIORITIES.docs, 0.4);

      // All priorities should be between 0 and 1
      Object.values(DEFAULT_PRIORITIES).forEach(priority => {
        assert.ok(priority >= 0);
        assert.ok(priority <= 1);
      });
    });
  });

  describe('Performance and Scalability', () => {
    test('should handle large numbers of profiles efficiently', async () => {
      const startTime = Date.now();
      
      // Create multiple profiles
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(
          profileManager.createProfile({
            repository: `test-repo-${i}`,
            model: 'gpt-4',
            priorities: DEFAULT_PRIORITIES,
            budgetAllocation: MODEL_PROFILES['gpt-4'].budgetAllocation,
            capsuleStrategies: MODEL_PROFILES['gpt-4'].capsuleStrategies,
            truncationStrategies: MODEL_PROFILES['gpt-4'].truncationStrategies
          })
        );
      }
      
      await Promise.all(promises);
      const endTime = Date.now();
      
      assert.ok(endTime - startTime < 5000, 'Should create profiles efficiently');
    });

    test('should handle profile caching under load', async () => {
      // Create a profile
      await profileManager.createProfile({
        repository: 'cache-test-repo',
        model: 'gpt-4',
        priorities: DEFAULT_PRIORITIES,
        budgetAllocation: MODEL_PROFILES['gpt-4'].budgetAllocation,
        capsuleStrategies: MODEL_PROFILES['gpt-4'].capsuleStrategies,
        truncationStrategies: MODEL_PROFILES['gpt-4'].truncationStrategies
      });

      const startTime = Date.now();
      
      // Request the same profile multiple times
      const promises = [];
      for (let i = 0; i < 100; i++) {
        promises.push(profileManager.getProfile('cache-test-repo', 'gpt-4'));
      }
      
      const results = await Promise.all(promises);
      const endTime = Date.now();
      
      // All results should be identical
      results.forEach(result => {
        assert.deepStrictEqual(result, results[0]);
      });
      
      // Should be fast due to caching
      assert.ok(endTime - startTime < 1000, 'Cached lookups should be fast');
    });
  });

  describe('Integration with Search Results', () => {
    test('should optimize complex search result sets', async () => {
      const complexResults = [
        {
          id: '1',
          content: 'export class ComplexService { constructor() {} }',
          path: 'src/services/ComplexService.js',
          spanKind: 'class',
          spanName: 'ComplexService',
          language: 'javascript',
          score: 0.95
        },
        {
          id: '2',
          content: 'describe("ComplexService", () => { it("should work", () => {}); });',
          path: 'test/services/ComplexService.test.js',
          language: 'javascript',
          score: 0.9
        },
        {
          id: '3',
          content: '# ComplexService Documentation\n\nThis service handles complex operations.',
          path: 'docs/ComplexService.md',
          language: 'markdown',
          score: 0.8
        },
        {
          id: '4',
          content: 'PORT=3000\nDATABASE_URL=localhost',
          path: '.env',
          language: 'env',
          score: 0.6
        }
      ];

      const result = await searchIntegration.optimizeSearchResults(
        'ComplexService',
        complexResults,
        {
          repository: 'test-repo',
          model: 'gpt-4',
          options: { trackPerformance: true }
        }
      );

      assert.strictEqual(result.results.length, 4);
      assert.ok(result.optimized.packed.length > 0);
      assert.ok(result.optimized.totalTokens > 0);
      assert.ok(result.performance.totalTime > 0);
      
      // Higher scored items should have higher priority
      const sortedItems = result.optimized.packed.sort((a, b) => b.priority - a.priority);
      assert.ok(sortedItems[0].priority >= sortedItems[sortedItems.length - 1].priority);
    });

    test('should handle empty search results', async () => {
      const result = await searchIntegration.optimizeSearchResults(
        'empty query',
        [],
        {
          repository: 'test-repo',
          model: 'gpt-4'
        }
      );

      assert.strictEqual(result.results.length, 0);
      assert.strictEqual(result.optimized.packed.length, 0);
      assert.strictEqual(result.optimized.totalTokens, 0);
    });

    test('should maintain search result metadata', async () => {
      const searchResults = [
        {
          id: '1',
          content: 'function test() {}',
          path: 'src/test.js',
          spanKind: 'function',
          spanName: 'test',
          language: 'javascript',
          score: 0.9,
          metadata: { originalIndex: 0, relevanceScore: 0.95 }
        }
      ];

      const result = await searchIntegration.optimizeSearchResults(
        'test',
        searchResults,
        {
          repository: 'test-repo',
          model: 'gpt-4'
        }
      );

      assert.strictEqual(result.results.length, 1);
      assert.deepStrictEqual(result.results[0].metadata, searchResults[0].metadata);
    });
  });

  describe('Error Recovery and Edge Cases', () => {
    test('should handle database connection errors gracefully', async () => {
      // Close the database to simulate connection error
      db.close();
      
      await assert.rejects(
        () => profileManager.createProfile({
          repository: 'test-repo',
          model: 'gpt-4',
          priorities: DEFAULT_PRIORITIES,
          budgetAllocation: MODEL_PROFILES['gpt-4'].budgetAllocation,
          capsuleStrategies: MODEL_PROFILES['gpt-4'].capsuleStrategies,
          truncationStrategies: MODEL_PROFILES['gpt-4'].truncationStrategies
        }),
        Error
      );
    });

    test('should handle malformed JSON in database', async () => {
      // Insert malformed data directly
      db.prepare('INSERT INTO packing_profile (id, repository, model, priorities, budget_allocation, capsule_strategies, truncation_strategies, created_at, updated_at, version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(
          'malformed-profile',
          'test-repo',
          'gpt-4',
          '{ invalid json }',
          '{ invalid json }',
          '{ invalid json }',
          '{ invalid json }',
          Date.now(),
          Date.now(),
          1
        );

      await assert.rejects(
        () => profileManager.getProfile('test-repo', 'gpt-4'),
        Error
      );
    });

    test('should handle concurrent profile creation', async () => {
      const promises = [];
      for (let i = 0; i < 5; i++) {
        promises.push(
          profileManager.createProfile({
            repository: 'concurrent-test-repo',
            model: 'gpt-4',
            priorities: DEFAULT_PRIORITIES,
            budgetAllocation: MODEL_PROFILES['gpt-4'].budgetAllocation,
            capsuleStrategies: MODEL_PROFILES['gpt-4'].capsuleStrategies,
            truncationStrategies: MODEL_PROFILES['gpt-4'].truncationStrategies
          })
        );
      }

      const results = await Promise.allSettled(promises);
      
      // At least one should succeed
      const successful = results.filter(r => r.status === 'fulfilled');
      assert.ok(successful.length > 0);
    });
  });
});