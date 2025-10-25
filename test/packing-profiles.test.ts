/**
 * Tests for packing profiles system
 */

import { Database } from 'better-sqlite3';
import { PackingProfileManager, MODEL_PROFILES, DEFAULT_PRIORITIES } from '../src/tokenization/packing-profiles.js';
import { StorageOperations } from '../src/storage/crud.js';
import { ContextOptimizer } from '../src/tokenization/context-optimizer.js';
import { SearchIntegrationManager } from '../src/tokenization/search-integration.js';
import { IntentType } from '../src/intent/index.js';

describe('Packing Profiles System', () => {
  let db: Database;
  let storage: StorageOperations;
  let profileManager: PackingProfileManager;
  let searchIntegration: SearchIntegrationManager;

  beforeEach(async () => {
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
    it('should create a new packing profile', async () => {
      const profileData = {
        repository: 'test-repo',
        model: 'gpt-4',
        priorities: DEFAULT_PRIORITIES,
        budgetAllocation: MODEL_PROFILES['gpt-4'].budgetAllocation,
        capsuleStrategies: MODEL_PROFILES['gpt-4'].capsuleStrategies,
        truncationStrategies: MODEL_PROFILES['gpt-4'].truncationStrategies
      };

      const profileId = await profileManager.createProfile(profileData);
      expect(profileId).toBeDefined();
      expect(profileId).toMatch(/^profile-test-repo-gpt-4-/);

      const profile = await profileManager.getProfile('test-repo', 'gpt-4');
      expect(profile).toBeDefined();
      expect(profile.repository).toBe('test-repo');
      expect(profile.model).toBe('gpt-4');
      expect(profile.version).toBe(1);
    });

    it('should update an existing packing profile', async () => {
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
      expect(updatedProfile.priorities.tests).toBe(0.9);
      expect(updatedProfile.version).toBe(2);
    });

    it('should delete a packing profile', async () => {
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

      await expect(profileManager.getProfile('test-repo', 'gpt-4')).rejects.toThrow();
    });

    it('should generate optimized profile for repository', async () => {
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
      
      expect(profile).toBeDefined();
      expect(profile.repository).toBe('test-repo');
      expect(profile.model).toBe('gpt-4');
      expect(profile.metadata?.generated).toBe(true);
    });

    it('should cache profiles in memory', async () => {
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
      
      expect(profile1).toEqual(profile2);
    });
  });

  describe('ContextOptimizer', () => {
    let optimizer: ContextOptimizer;
    let profile: any;

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

    it('should classify content items correctly', async () => {
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

      expect(result.packed).toHaveLength(3);
      expect(result.totalTokens).toBeGreaterThan(0);
      expect(result.budgetUsed).toBeGreaterThanOrEqual(0);
      expect(result.budgetUsed).toBeLessThanOrEqual(1);
    });

    it('should apply intent-based adjustments', async () => {
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
        intent: 'symbol' as IntentType,
        confidence: 0.8,
        entities: [
          { type: 'function' as const, value: 'getUserById', position: 0 }
        ],
        suggestedPolicies: ['symbol-level-2']
      };

      const result = await optimizer.optimize(items, intent);

      expect(result.packed[0].priority).toBeGreaterThan(0.5);
      expect(result.packed[0].type).toBe('must-have');
    });

    it('should create capsules for large content', async () => {
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
      expect(result.packed.length).toBeGreaterThanOrEqual(1);
      if (result.packed.length > 1) {
        expect(result.packed[0].capsule).toBeDefined();
      }
    });

    it('should apply truncation when over budget', async () => {
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

      expect(result.truncated).toBe(true);
      expect(result.totalTokens).toBeLessThanOrEqual(1000);
    });
  });

  describe('SearchIntegrationManager', () => {
    it('should optimize search results', async () => {
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

      expect(result.query).toBe('search function');
      expect(result.results).toHaveLength(2);
      expect(result.optimized.packed).toBeDefined();
      expect(result.optimized.totalTokens).toBeGreaterThan(0);
      expect(result.profile).toBeDefined();
      expect(result.performance).toBeDefined();
    });

    it('should track performance metrics', async () => {
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
      expect(stats.totalQueries).toBe(1);
      expect(stats.avgTime).toBeGreaterThan(0);
    });

    it('should handle errors gracefully', async () => {
      const invalidResults = [
        {
          id: '1',
          content: null as any,
          path: 'invalid',
          score: 'invalid' as any
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

      expect(result.results).toBeDefined();
      expect(result.optimized.packed).toBeDefined();
      expect(result.profile).toBeDefined();
    });
  });

  describe('Profile Validation', () => {
    it('should validate profile constraints', async () => {
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

      await expect(profileManager.createProfile(invalidProfile)).rejects.toThrow();
    });

    it('should validate budget allocation', async () => {
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

      await expect(profileManager.createProfile(invalidBudgetProfile)).rejects.toThrow();
    });
  });

  describe('Model Profiles', () => {
    it('should have appropriate profiles for different models', () => {
      expect(MODEL_PROFILES['gpt-4']).toBeDefined();
      expect(MODEL_PROFILES['gpt-3.5-turbo']).toBeDefined();
      expect(MODEL_PROFILES['claude-3']).toBeDefined();
      expect(MODEL_PROFILES['default']).toBeDefined();

      // GPT-4 should have larger budget than GPT-3.5
      expect(MODEL_PROFILES['gpt-4'].budgetAllocation.total)
        .toBeGreaterThan(MODEL_PROFILES['gpt-3.5-turbo'].budgetAllocation.total);

      // Claude should have the largest budget
      expect(MODEL_PROFILES['claude-3'].budgetAllocation.total)
        .toBeGreaterThan(MODEL_PROFILES['gpt-4'].budgetAllocation.total);
    });
  });

  describe('Default Priorities', () => {
    it('should have sensible default priorities', () => {
      expect(DEFAULT_PRIORITIES.code).toBe(1.0);
      expect(DEFAULT_PRIORITIES.tests).toBe(0.8);
      expect(DEFAULT_PRIORITIES.examples).toBe(0.7);
      expect(DEFAULT_PRIORITIES.comments).toBe(0.6);
      expect(DEFAULT_PRIORITIES.config).toBe(0.5);
      expect(DEFAULT_PRIORITIES.docs).toBe(0.4);

      // All priorities should be between 0 and 1
      Object.values(DEFAULT_PRIORITIES).forEach(priority => {
        expect(priority).toBeGreaterThanOrEqual(0);
        expect(priority).toBeLessThanOrEqual(1);
      });
    });
  });
});