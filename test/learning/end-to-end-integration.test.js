#!/usr/bin/env node

/**
 * End-to-end integration tests for Phase 6 Learning System
 * 
 * This test suite verifies the complete integration between:
 * - Learning system components
 * - Search pipeline
 * - Intent classification
 * - Policy gate system
 * - CLI commands
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test utilities
function createTestRepo() {
  const testDir = fs.mkdtempSync(path.join(__dirname, 'temp-test-repo-'));
  const pampaxDir = path.join(testDir, '.pampax');
  fs.mkdirSync(pampaxDir, { recursive: true });
  
  // Create basic config
  fs.writeFileSync(
    path.join(pampaxDir, 'token-budget.json'),
    JSON.stringify({ budget: 4000, model: 'test' })
  );
  
  return testDir;
}

function cleanupTestRepo(testDir) {
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true });
  }
}

async function setupTestDatabase(testDir) {
  const { Database } = await import('../../src/storage/database-simple.js');
  const dbPath = path.join(testDir, '.pampax', 'pampax.sqlite');
  return new Database(dbPath);
}

async function createMockInteractions(db, count = 20) {
  const interactions = [];
  const now = Date.now();
  
  for (let i = 0; i < count; i++) {
    const satisfied = Math.random() > 0.3; // 70% satisfaction rate
    const interaction = {
      id: `test_interaction_${i}`,
      session_id: `test_session_${Math.floor(i / 5)}`,
      query: `test query ${i}`,
      satisfied: satisfied ? 1 : 0,
      time_to_fix_ms: satisfied ? Math.floor(Math.random() * 5000) + 1000 : null,
      notes: JSON.stringify({
        intent: i % 4 === 0 ? 'symbol' : i % 4 === 1 ? 'config' : i % 4 === 2 ? 'api' : 'search',
        confidence: 0.8 + Math.random() * 0.2,
        tokenUsage: Math.floor(Math.random() * 1000) + 100
      }),
      ts: now - (i * 60 * 60 * 1000) // Spread over time
    };
    interactions.push(interaction);
  }
  
  // Insert into database
  return new Promise((resolve, reject) => {
    const stmt = db.prepare(`
      INSERT INTO interaction (id, session_id, query, satisfied, time_to_fix_ms, notes, ts)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    
    db.transaction(() => {
      for (const interaction of interactions) {
        stmt.run(
          interaction.id,
          interaction.session_id,
          interaction.query,
          interaction.satisfied,
          interaction.time_to_fix_ms,
          interaction.notes,
          interaction.ts
        );
      }
    })();
    
    resolve(interactions);
  });
}

describe('Phase 6 Learning System Integration', () => {
  let testDir;
  let db;
  let memoryOps;
  let learningIntegration;
  let learningWorkflow;

  beforeEach(async () => {
    testDir = createTestRepo();
    db = await setupTestDatabase(testDir);
    
    const { MemoryOperations } = await import('../../src/storage/memory-operations.js');
    memoryOps = new MemoryOperations(db);
    
    // Create test data
    await createMockInteractions(db);
  });

  afterEach(async () => {
    if (learningIntegration) {
      await learningIntegration.stop();
    }
    if (learningWorkflow) {
      await learningWorkflow.stop();
    }
    if (db) {
      db.close();
    }
    cleanupTestRepo(testDir);
  });

  it('should initialize learning integration', async () => {
    const { getLearningIntegration } = await import('../../src/learning/index.js');
    
    learningIntegration = getLearningIntegration(memoryOps, {
      enabled: true,
      analysisInterval: 1000, // Short for testing
      minSignalsForOptimization: 5,
      cacheEnabled: true,
      autoApplyOptimizations: false // Don't auto-apply in tests
    });
    
    await learningIntegration.start();
    
    const state = learningIntegration.getState();
    assert.strictEqual(state.isActive, true);
    assert.strictEqual(state.totalSignals, 0); // Will be updated when recording interactions
  });

  it('should record interactions and analyze outcomes', async () => {
    const { getLearningIntegration, OutcomeAnalyzer } = await import('../../src/learning/index.js');
    
    learningIntegration = getLearningIntegration(memoryOps, {
      enabled: true,
      minSignalsForOptimization: 5
    });
    
    await learningIntegration.start();
    
    // Record some test interactions
    await learningIntegration.recordInteraction({
      sessionId: 'test_session_1',
      query: 'find function definition',
      intent: { intent: 'symbol', confidence: 0.9, entities: [], suggestedPolicies: [] },
      satisfied: true,
      timeToFix: 2000,
      tokenUsage: 150,
      repo: 'test-repo'
    });
    
    await learningIntegration.recordInteraction({
      sessionId: 'test_session_2',
      query: 'configuration settings',
      intent: { intent: 'config', confidence: 0.8, entities: [], suggestedPolicies: [] },
      satisfied: false,
      timeToFix: 8000,
      tokenUsage: 300,
      repo: 'test-repo'
    });
    
    // Run learning workflow
    const result = await learningIntegration.runLearningWorkflow(30); // 30 days back
    
    assert.strictEqual(result.success, true);
    assert.ok(result.signalsProcessed >= 2);
    assert.ok(result.performance.totalTime > 0);
  });

  it('should execute learning workflow with all steps', async () => {
    const { getLearningWorkflow } = await import('../../src/learning/index.js');
    
    learningWorkflow = getLearningWorkflow(memoryOps, {
      integration: {
        enabled: true,
        minSignalsForOptimization: 5,
        autoApplyOptimizations: false
      },
      steps: {
        signalCollection: { enabled: true, timeout: 5000, retryCount: 1, required: true },
        outcomeAnalysis: { enabled: true, timeout: 5000, retryCount: 1, required: true },
        weightOptimization: { enabled: true, timeout: 5000, retryCount: 1, required: false },
        policyTuning: { enabled: true, timeout: 5000, retryCount: 1, required: false },
        cacheUpdate: { enabled: true, timeout: 5000, retryCount: 1, required: false }
      }
    });
    
    await learningWorkflow.start();
    
    const result = await learningWorkflow.executeWorkflow(30);
    
    assert.strictEqual(result.success, true);
    assert.ok(result.executionTime > 0);
    assert.ok(Object.keys(result.steps).length > 0);
    
    // Check that required steps completed
    assert.strictEqual(result.steps.signalCollection.success, true);
    assert.strictEqual(result.steps.outcomeAnalysis.success, true);
  });

  it('should integrate with search pipeline', async () => {
    const { learningEnhancedSearch } = await import('../../src/search/learning-enhanced.js');
    const { getLearningIntegration } = await import('../../src/learning/index.js');
    
    learningIntegration = getLearningIntegration(memoryOps, {
      enabled: true,
      cacheEnabled: true
    });
    
    await learningIntegration.start();
    
    // Mock search results
    const vectorResults = [
      { id: 'result1', score: 0.9, content: 'function test() {}' },
      { id: 'result2', score: 0.8, content: 'class TestClass {}' }
    ];
    
    const bm25Results = [
      { id: 'result3', score: 0.7, content: 'const test = "value"' }
    ];
    
    const searchResult = await learningEnhancedSearch({
      query: 'test function',
      vectorResults,
      bm25Results,
      learningIntegration,
      sessionId: 'test_search_session'
    });
    
    assert.ok(searchResult.results);
    assert.ok(searchResult.intent);
    assert.ok(searchResult.performance_ms > 0);
    assert.strictEqual(searchResult.cacheHit, false);
    
    // Record outcome
    await learningIntegration.recordInteraction({
      sessionId: searchResult.sessionId,
      query: searchResult.bundleData?.query || 'test function',
      intent: searchResult.intent,
      bundleData: searchResult.bundleData,
      satisfied: true,
      timeToFix: 1500,
      tokenUsage: searchResult.bundleData?.total_tokens
    });
  });

  it('should handle cache integration', async () => {
    const { getLearningIntegration } = await import('../../src/learning/index.js');
    
    learningIntegration = getLearningIntegration(memoryOps, {
      enabled: true,
      cacheEnabled: true
    });
    
    await learningIntegration.start();
    
    const querySignature = 'test_query_signature';
    const bundleId = 'test_bundle_123';
    
    // Store in cache
    await learningIntegration.storeInCache(querySignature, bundleId, 0.9);
    
    // Check cache
    const cachedBundleId = await learningIntegration.checkCache(querySignature);
    assert.strictEqual(cachedBundleId, bundleId);
    
    // Check non-existent cache entry
    const nonExistent = await learningIntegration.checkCache('non_existent_signature');
    assert.strictEqual(nonExistent, null);
  });

  it('should provide learning statistics', async () => {
    const { getLearningIntegration } = await import('../../src/learning/index.js');
    
    learningIntegration = getLearningIntegration(memoryOps, {
      enabled: true,
      performanceTracking: true
    });
    
    await learningIntegration.start();
    
    // Record some interactions
    for (let i = 0; i < 5; i++) {
      await learningIntegration.recordInteraction({
        sessionId: `stats_session_${i}`,
        query: `stats query ${i}`,
        intent: { intent: 'search', confidence: 0.8, entities: [], suggestedPolicies: [] },
        satisfied: i % 2 === 0,
        timeToFix: 1000 + i * 500,
        tokenUsage: 100 + i * 20
      });
    }
    
    const stats = await learningIntegration.getLearningStats();
    
    assert.ok(stats.state);
    assert.ok(stats.cacheStats);
    assert.strictEqual(stats.state.isActive, true);
    assert.ok(stats.state.totalSignals >= 5);
  });

  it('should handle workflow failures gracefully', async () => {
    const { getLearningWorkflow } = await import('../../src/learning/index.js');
    
    learningWorkflow = getLearningWorkflow(memoryOps, {
      integration: {
        enabled: true,
        minSignalsForOptimization: 1000, // Very high to trigger failure
        autoApplyOptimizations: false
      }
    });
    
    await learningWorkflow.start();
    
    const result = await learningWorkflow.executeWorkflow(1); // Only 1 day
    
    // Should succeed but with no optimizations due to insufficient signals
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.summary.optimizationsApplied, 0);
    assert.ok(result.summary.signalsProcessed < 1000);
  });

  it('should integrate with policy gate system', async () => {
    const { policyGate } = await import('../../src/policy/policy-gate.js');
    const { getLearningIntegration } = await import('../../src/learning/index.js');
    
    learningIntegration = getLearningIntegration(memoryOps, {
      enabled: true,
      autoApplyOptimizations: false
    });
    
    await learningIntegration.start();
    
    // Test policy evaluation
    const intent = { intent: 'symbol', confidence: 0.9, entities: [], suggestedPolicies: [] };
    const policy = policyGate.evaluate(intent, { repo: 'test-repo' });
    
    assert.ok(policy.maxDepth > 0);
    assert.ok(policy.seedWeights);
    assert.strictEqual(typeof policy.includeSymbols, 'boolean');
    
    // Record interaction with this policy
    await learningIntegration.recordInteraction({
      sessionId: 'policy_test_session',
      query: 'symbol search',
      intent,
      satisfied: true,
      timeToFix: 2000,
      tokenUsage: 200,
      repo: 'test-repo'
    });
  });

  it('should handle concurrent operations', async () => {
    const { getLearningIntegration } = await import('../../src/learning/index.js');
    
    learningIntegration = getLearningIntegration(memoryOps, {
      enabled: true,
      minSignalsForOptimization: 2
    });
    
    await learningIntegration.start();
    
    // Record multiple interactions concurrently
    const interactionPromises = [];
    for (let i = 0; i < 10; i++) {
      interactionPromises.push(
        learningIntegration.recordInteraction({
          sessionId: `concurrent_session_${i}`,
          query: `concurrent query ${i}`,
          intent: { intent: 'search', confidence: 0.8, entities: [], suggestedPolicies: [] },
          satisfied: true,
          timeToFix: 1000,
          tokenUsage: 100
        })
      );
    }
    
    await Promise.all(interactionPromises);
    
    // Run workflow
    const result = await learningIntegration.runLearningWorkflow(1);
    
    assert.strictEqual(result.success, true);
    assert.ok(result.signalsProcessed >= 10);
  });
});

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('Running Phase 6 Learning System Integration Tests...');
  
  // Simple test runner for Node.js test API
  const runTests = async () => {
    const tests = [];
    
    // This is a simplified test runner - in practice you'd use a proper test framework
    try {
      // Test basic integration
      const testDir = createTestRepo();
      const db = await setupTestDatabase(testDir);
      await createMockInteractions(db, 10);
      
      const { MemoryOperations } = await import('../../src/storage/memory-operations.js');
      const memoryOps = new MemoryOperations(db);
      
      const { getLearningIntegration } = await import('../../src/learning/index.js');
      const learningIntegration = getLearningIntegration(memoryOps, {
        enabled: true,
        minSignalsForOptimization: 5
      });
      
      await learningIntegration.start();
      
      // Record interaction
      await learningIntegration.recordInteraction({
        sessionId: 'test_session',
        query: 'test query',
        intent: { intent: 'search', confidence: 0.8, entities: [], suggestedPolicies: [] },
        satisfied: true,
        timeToFix: 1000,
        tokenUsage: 100
      });
      
      // Run workflow
      const result = await learningIntegration.runLearningWorkflow(30);
      
      assert(result.success, 'Learning workflow should succeed');
      assert(result.signalsProcessed >= 1, 'Should process at least one signal');
      
      await learningIntegration.stop();
      db.close();
      cleanupTestRepo(testDir);
      
      console.log('✅ All integration tests passed!');
    } catch (error) {
      console.error('❌ Integration test failed:', error.message);
      process.exit(1);
    }
  };
  
  runTests();
}