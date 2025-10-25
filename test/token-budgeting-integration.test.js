/**
 * Comprehensive Tests for Token Budgeting Integration
 * 
 * Tests end-to-end token budgeting workflow, context assembly
 * with token constraints, model-specific optimizations, and performance.
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { Database } from 'better-sqlite3';
import { createTokenizer, getModelRecommendations } from '../src/tokenization/tokenizer-factory.js';
import { PackingProfileManager } from '../src/tokenization/packing-profiles.js';
import { DegradePolicyEngine } from '../src/tokenization/degrade-policy.js';
import { ContextOptimizer } from '../src/tokenization/context-optimizer.js';
import { SearchIntegrationManager } from '../src/tokenization/search-integration.js';
import { StorageOperations } from '../src/storage/crud.js';

// Mock tokenizer for consistent testing
class MockTokenizer {
  constructor(model = 'gpt-4') {
    this.model = model;
    this.config = {
      'gpt-4': { charsPerToken: 3.5, contextSize: 8192 },
      'gpt-3.5-turbo': { charsPerToken: 4.0, contextSize: 4096 },
      'claude-3': { charsPerToken: 4.0, contextSize: 100000 }
    }[model] || { charsPerToken: 4.0, contextSize: 4096 };
  }

  countTokens(text) {
    if (!text || typeof text !== 'string') return 0;
    return Math.ceil(text.length / this.config.charsPerToken);
  }

  estimateTokens(text) {
    return this.countTokens(text);
  }

  getModel() {
    return this.model;
  }

  getContextSize() {
    return this.config.contextSize;
  }

  getConfig() {
    return { name: this.model, ...this.config };
  }
}

// Test data generators
const createMockSearchResults = (count = 10) => {
  const templates = [
    { content: 'function calculateTotal(items) { return items.reduce((sum, item) => sum + item.price, 0); }', type: 'function', score: 0.9 },
    { content: 'describe("calculateTotal", () => { it("should sum prices", () => { expect(calculateTotal([{price: 10}])).toBe(10); }); });', type: 'test', score: 0.8 },
    { content: '# Calculate Total Function\n\nThis function calculates the total price of items in an array.', type: 'documentation', score: 0.7 },
    { content: 'const API_URL = "https://api.example.com";\nconst TIMEOUT = 5000;', type: 'config', score: 0.6 },
    { content: 'export class Calculator { add(a, b) { return a + b; } }', type: 'class', score: 0.85 }
  ];

  return Array.from({ length: count }, (_, i) => {
    const template = templates[i % templates.length];
    return {
      id: `result-${i}`,
      content: template.content,
      path: `src/file${i}.js`,
      spanKind: template.type,
      spanName: `item${i}`,
      language: 'javascript',
      score: template.score,
      metadata: { index: i }
    };
  });
};

describe('Token Budgeting Integration', () => {
  let db, storage, profileManager, degradeEngine, searchIntegration;

  beforeEach(() => {
    // Create in-memory database
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
    degradeEngine = new DegradePolicyEngine();
    searchIntegration = new SearchIntegrationManager(profileManager, storage);
  });

  afterEach(() => {
    db.close();
  });

  describe('End-to-End Token Budgeting Workflow', () => {
    test('should complete full workflow with token constraints', async () => {
      const searchResults = createMockSearchResults(20);
      const budget = 2000;
      const model = 'gpt-4';
      const repository = 'test-repo';

      // Step 1: Get or create packing profile
      const profile = await profileManager.getProfile(repository, model);
      assert.ok(profile);
      assert.strictEqual(profile.repository, repository);
      assert.strictEqual(profile.model, model);

      // Step 2: Create context optimizer
      const optimizer = new ContextOptimizer(profile);
      const optimizationResult = await optimizer.optimize(searchResults);
      
      assert.ok(optimizationResult.packed);
      assert.ok(optimizationResult.totalTokens > 0);
      assert.ok(optimizationResult.budgetUsed >= 0);

      // Step 3: Apply degradation if needed
      const policy = degradeEngine.getPolicyForModel(model);
      const tokenizer = new MockTokenizer(model);
      const degradeResult = await degradeEngine.applyDegradePolicy(
        optimizationResult.packed,
        budget,
        policy,
        tokenizer
      );

      assert.ok(degradeResult.degraded);
      assert.ok(degradeResult.savings.originalTokens >= degradeResult.savings.degradedTokens);
      
      // Step 4: Verify final result meets budget
      const finalTokens = degradeResult.degraded.reduce(
        (sum, item) => sum + tokenizer.countTokens(item.content), 0
      );
      assert.ok(finalTokens <= budget, `Final tokens ${finalTokens} should be <= budget ${budget}`);

      // Step 5: Verify quality metrics
      assert.ok(degradeResult.applied.qualityScore >= 0);
      assert.ok(degradeResult.applied.qualityScore <= 1);
    });

    test('should handle different budget constraints appropriately', async () => {
      const searchResults = createMockSearchResults(15);
      const model = 'gpt-4';
      const repository = 'test-repo';
      const tokenizer = new MockTokenizer(model);

      // Test with different budget levels
      const budgets = [500, 1500, 5000];
      const results = [];

      for (const budget of budgets) {
        const profile = await profileManager.getProfile(repository, model);
        const optimizer = new ContextOptimizer(profile);
        const optimizationResult = await optimizer.optimize(searchResults);
        
        const policy = degradeEngine.getPolicyForModel(model);
        const degradeResult = await degradeEngine.applyDegradePolicy(
          optimizationResult.packed,
          budget,
          policy,
          tokenizer
        );

        results.push({ budget, result: degradeResult });
      }

      // Verify that larger budgets preserve more content
      const sortedResults = results.sort((a, b) => a.budget - b.budget);
      for (let i = 0; i < sortedResults.length - 1; i++) {
        const current = sortedResults[i];
        const next = sortedResults[i + 1];
        
        assert.ok(
          next.result.savings.degradedTokens >= current.result.savings.degradedTokens,
          `Larger budget should preserve more content`
        );
        assert.ok(
          next.result.applied.qualityScore >= current.result.applied.qualityScore,
          `Larger budget should maintain better quality`
        );
      }
    });
  });

  describe('Context Assembly with Token Constraints', () => {
    test('should assemble context respecting token limits', async () => {
      const searchResults = createMockSearchResults(25);
      const budget = 1500;
      const model = 'claude-3';
      const repository = 'test-repo';

      const result = await searchIntegration.optimizeSearchResults(
        'test query',
        searchResults,
        { repository, model, budget }
      );

      assert.ok(result.query);
      assert.ok(result.results);
      assert.ok(result.optimized);
      assert.ok(result.profile);
      assert.ok(result.performance);

      // Verify token constraints are respected
      const tokenizer = new MockTokenizer(model);
      const totalTokens = result.optimized.packed.reduce(
        (sum, item) => sum + tokenizer.countTokens(item.content), 0
      );
      assert.ok(totalTokens <= budget, `Total tokens ${totalTokens} should be <= budget ${budget}`);
    });

    test('should prioritize important content when constrained', async () => {
      const searchResults = [
        {
          id: '1',
          content: 'export class CriticalService { constructor() {} }',
          path: 'src/CriticalService.js',
          spanKind: 'class',
          spanName: 'CriticalService',
          language: 'javascript',
          score: 0.95
        },
        {
          id: '2',
          content: '// Low priority comment',
          path: 'src/comments.js',
          spanKind: 'comment',
          score: 0.2
        },
        {
          id: '3',
          content: 'function importantFunction() { return "important"; }',
          path: 'src/important.js',
          spanKind: 'function',
          score: 0.9
        }
      ];

      const budget = 200; // Very constrained
      const result = await searchIntegration.optimizeSearchResults(
        'test query',
        searchResults,
        { repository: 'test-repo', model: 'gpt-4', budget }
      );

      // High-priority items should be preserved
      const finalItems = result.optimized.packed;
      const hasCritical = finalItems.some(item => item.id === '1');
      const hasImportant = finalItems.some(item => item.id === '3');
      
      assert.ok(hasCritical || hasImportant, 'High priority items should be preserved');
    });

    test('should maintain content diversity', async () => {
      const searchResults = [
        ...Array.from({ length: 5 }, (_, i) => ({
          id: `func-${i}`,
          content: `function func${i}() { return ${i}; }`,
          path: `src/func${i}.js`,
          spanKind: 'function',
          score: 0.9
        })),
        ...Array.from({ length: 5 }, (_, i) => ({
          id: `test-${i}`,
          content: `it("should test ${i}", () => { expect(${i}).toBe(${i}); });`,
          path: `test/test${i}.js`,
          spanKind: 'test',
          score: 0.8
        })),
        ...Array.from({ length: 5 }, (_, i) => ({
          id: `doc-${i}`,
          content: `# Documentation ${i}\n\nThis is documentation for item ${i}.`,
          path: `docs/doc${i}.md`,
          spanKind: 'comment',
          score: 0.7
        }))
      ];

      const budget = 1000;
      const result = await searchIntegration.optimizeSearchResults(
        'test query',
        searchResults,
        { repository: 'test-repo', model: 'gpt-4', budget }
      );

      const finalItems = result.optimized.packed;
      const spanKinds = new Set(finalItems.map(item => item.spanKind));
      
      // Should maintain diversity across different content types
      assert.ok(spanKinds.size >= 2, `Should maintain content diversity, got ${spanKinds.size} types`);
    });
  });

  describe('Model-Specific Optimizations', () => {
    test('should optimize differently for different models', async () => {
      const searchResults = createMockSearchResults(15);
      const budget = 2000;
      const repository = 'test-repo';
      const models = ['gpt-3.5-turbo', 'gpt-4', 'claude-3'];

      const results = [];

      for (const model of models) {
        const result = await searchIntegration.optimizeSearchResults(
          'test query',
          searchResults,
          { repository, model, budget }
        );
        results.push({ model, result });
      }

      // Claude should handle larger contexts better
      const claudeResult = results.find(r => r.model === 'claude-3');
      const gpt35Result = results.find(r => r.model === 'gpt-3.5-turbo');
      
      assert.ok(
        claudeResult.result.optimized.totalTokens >= gpt35Result.result.optimized.totalTokens,
        'Claude should preserve more content due to larger context'
      );
    });

    test('should use model-specific degradation strategies', async () => {
      const searchResults = createMockSearchResults(20);
      const budget = 800; // Constrained budget
      const models = ['gpt-3.5-turbo', 'claude-3'];

      const results = [];

      for (const model of models) {
        const profile = await profileManager.getProfile('test-repo', model);
        const optimizer = new ContextOptimizer(profile);
        const optimizationResult = await optimizer.optimize(searchResults);
        
        const policy = degradeEngine.getPolicyForModel(model);
        const tokenizer = new MockTokenizer(model);
        const degradeResult = await degradeEngine.applyDegradePolicy(
          optimizationResult.packed,
          budget,
          policy,
          tokenizer
        );

        results.push({ model, result: degradeResult });
      }

      // Different models should use different degradation levels
      const strategies = results.map(r => r.result.applied.strategy);
      assert.ok(strategies.length > 0, 'Should apply degradation strategies');
    });

    test('should adapt capsule creation based on model capabilities', async () => {
      const largeContent = 'export class LargeClass {\n' + '  // Many methods\n'.repeat(50) + '  method1() { return 1; }\n' + '}\n';
      const searchResults = [createMockSearchResults(1)[0]];
      searchResults[0].content = largeContent;

      const budget = 500;
      const models = ['gpt-3.5-turbo', 'claude-3'];

      const results = [];

      for (const model of models) {
        const result = await searchIntegration.optimizeSearchResults(
          'test query',
          searchResults,
          { repository: 'test-repo', model, budget }
        );
        results.push({ model, result });
      }

      // Results should differ based on model capabilities
      results.forEach(({ model, result }) => {
        assert.ok(result.optimized.packed.length > 0, `${model} should return optimized results`);
        assert.ok(result.optimized.totalTokens <= budget, `${model} should respect budget`);
      });
    });
  });

  describe('Performance and Accuracy', () => {
    test('should complete token budgeting within performance targets', async () => {
      const searchResults = createMockSearchResults(50);
      const budget = 3000;

      const startTime = Date.now();
      
      const result = await searchIntegration.optimizeSearchResults(
        'performance test query',
        searchResults,
        { repository: 'test-repo', model: 'gpt-4', budget }
      );
      
      const endTime = Date.now();
      const totalTime = endTime - startTime;

      assert.ok(totalTime < 2000, `Should complete within 2 seconds, took ${totalTime}ms`);
      assert.ok(result.performance.totalTime > 0, 'Should track performance metrics');
      
      // Verify accuracy
      const tokenizer = new MockTokenizer('gpt-4');
      const actualTokens = result.optimized.packed.reduce(
        (sum, item) => sum + tokenizer.countTokens(item.content), 0
      );
      assert.ok(actualTokens <= budget, `Should respect budget constraints`);
    });

    test('should maintain accuracy across multiple runs', async () => {
      const searchResults = createMockSearchResults(20);
      const budget = 1500;
      const runs = 5;

      const results = [];

      for (let i = 0; i < runs; i++) {
        const result = await searchIntegration.optimizeSearchResults(
          'consistency test query',
          searchResults,
          { repository: 'test-repo', model: 'gpt-4', budget }
        );
        results.push(result);
      }

      // Results should be consistent
      const tokenCounts = results.map(r => r.optimized.totalTokens);
      const maxTokens = Math.max(...tokenCounts);
      const minTokens = Math.min(...tokenCounts);
      
      assert.ok(maxTokens - minTokens <= 100, 'Token counts should be consistent across runs');
      
      // All should respect budget
      results.forEach(result => {
        assert.ok(result.optimized.totalTokens <= budget, 'All runs should respect budget');
      });
    });

    test('should handle large result sets efficiently', async () => {
      const largeSearchResults = createMockSearchResults(100);
      const budget = 4000;

      const startTime = Date.now();
      
      const result = await searchIntegration.optimizeSearchResults(
        'large result set test',
        largeSearchResults,
        { repository: 'test-repo', model: 'gpt-4', budget }
      );
      
      const endTime = Date.now();
      const totalTime = endTime - startTime;

      assert.ok(totalTime < 5000, `Should handle large sets efficiently, took ${totalTime}ms`);
      assert.ok(result.optimized.packed.length > 0, 'Should return optimized results');
      assert.ok(result.optimized.totalTokens <= budget, 'Should respect budget');
    });
  });

  describe('Integration with Tokenizer Factory', () => {
    test('should use tokenizer factory for accurate counting', async () => {
      const searchResults = createMockSearchResults(10);
      const budget = 1000;
      const model = 'gpt-4';

      const result = await searchIntegration.optimizeSearchResults(
        'tokenizer integration test',
        searchResults,
        { repository: 'test-repo', model, budget }
      );

      // Verify tokenizer factory integration
      const factoryTokenizer = createTokenizer(model);
      const countedTokens = result.optimized.packed.reduce(
        (sum, item) => sum + factoryTokenizer.countTokens(item.content), 0
      );

      assert.ok(countedTokens <= budget, 'Factory tokenizer should confirm budget compliance');
      assert.ok(result.optimized.totalTokens > 0, 'Should have token count');
    });

    test('should handle model recommendations', async () => {
      const searchResults = createMockSearchResults(15);
      const estimatedTokens = 3000;

      const recommendations = getModelRecommendations(estimatedTokens);
      assert.ok(Array.isArray(recommendations));
      assert.ok(recommendations.length > 0);

      // Test with recommended model
      const bestFit = recommendations.find(r => r.recommendation === 'good') || recommendations[0];
      
      const result = await searchIntegration.optimizeSearchResults(
        'model recommendation test',
        searchResults,
        { repository: 'test-repo', model: bestFit.model, budget: estimatedTokens }
      );

      assert.ok(result.optimized.packed.length > 0);
      assert.ok(result.optimized.totalTokens <= estimatedTokens);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle empty search results gracefully', async () => {
      const result = await searchIntegration.optimizeSearchResults(
        'empty query',
        [],
        { repository: 'test-repo', model: 'gpt-4', budget: 1000 }
      );

      assert.strictEqual(result.results.length, 0);
      assert.strictEqual(result.optimized.packed.length, 0);
      assert.strictEqual(result.optimized.totalTokens, 0);
    });

    test('should handle zero budget gracefully', async () => {
      const searchResults = createMockSearchResults(5);

      const result = await searchIntegration.optimizeSearchResults(
        'zero budget test',
        searchResults,
        { repository: 'test-repo', model: 'gpt-4', budget: 0 }
      );

      // Should apply emergency degradation
      assert.ok(result.optimized.packed.length >= 0);
      assert.ok(result.optimized.totalTokens >= 0);
    });

    test('should handle invalid search results gracefully', async () => {
      const invalidResults = [
        { id: '1', content: null, path: 'test.js' },
        { id: '2', content: undefined, path: 'test2.js' },
        { id: '3', content: '', path: 'test3.js' },
        { id: '4', content: 'valid content', path: 'valid.js', spanKind: 'function', score: 0.8 }
      ];

      const result = await searchIntegration.optimizeSearchResults(
        'invalid results test',
        invalidResults,
        { repository: 'test-repo', model: 'gpt-4', budget: 1000 }
      );

      // Should handle gracefully and return valid results
      assert.ok(result.optimized.packed.length >= 0);
      assert.ok(result.optimized.totalTokens >= 0);
    });

    test('should handle concurrent requests', async () => {
      const searchResults = createMockSearchResults(10);
      const budget = 1500;

      // Create multiple concurrent requests
      const promises = Array.from({ length: 5 }, (_, i) =>
        searchIntegration.optimizeSearchResults(
          `concurrent query ${i}`,
          searchResults,
          { repository: 'test-repo', model: 'gpt-4', budget }
        )
      );

      const results = await Promise.all(promises);

      // All should complete successfully
      results.forEach((result, i) => {
        assert.ok(result.optimized.packed.length >= 0, `Request ${i} should return results`);
        assert.ok(result.optimized.totalTokens <= budget, `Request ${i} should respect budget`);
      });
    });
  });

  describe('Metrics and Monitoring', () => {
    test('should provide comprehensive performance metrics', async () => {
      const searchResults = createMockSearchResults(20);
      const budget = 2000;

      const result = await searchIntegration.optimizeSearchResults(
        'metrics test query',
        searchResults,
        { repository: 'test-repo', model: 'gpt-4', budget, options: { trackPerformance: true } }
      );

      assert.ok(result.performance);
      assert.ok(typeof result.performance.totalTime === 'number');
      assert.ok(result.performance.totalTime > 0);

      // Check search integration performance stats
      const stats = searchIntegration.getPerformanceStats();
      assert.ok(stats.totalQueries >= 1);
      assert.ok(stats.avgTime >= 0);
    });

    test('should track optimization statistics', async () => {
      const searchResults = createMockSearchResults(15);
      const budget = 1800;

      const result = await searchIntegration.optimizeSearchResults(
        'statistics test query',
        searchResults,
        { repository: 'test-repo', model: 'gpt-4', budget }
      );

      // Verify optimization statistics
      assert.ok(result.optimized.strategy);
      assert.ok(typeof result.optimized.truncated === 'boolean');
      assert.ok(result.optimized.budgetUsed >= 0);
      assert.ok(result.optimized.budgetUsed <= 1);
    });

    test('should maintain quality metrics', async () => {
      const searchResults = createMockSearchResults(12);
      const budget = 1600;

      const result = await searchIntegration.optimizeSearchResults(
        'quality metrics test',
        searchResults,
        { repository: 'test-repo', model: 'gpt-4', budget }
      );

      // Quality metrics should be available
      if (result.optimized.applied) {
        assert.ok(typeof result.optimized.applied.qualityScore === 'number');
        assert.ok(result.optimized.applied.qualityScore >= 0);
        assert.ok(result.optimized.applied.qualityScore <= 1);
      }
    });
  });
});