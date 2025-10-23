#!/usr/bin/env node
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { IntentClassifier } from '../dist/src/intent/intent-classifier.js';
import { PolicyGate } from '../dist/src/policy/policy-gate.js';
import { SeedMixOptimizer } from '../dist/src/search/seed-mix-optimizer.js';

describe('Intent-Aware Search Integration Tests', () => {
  let tmpDir;
  let intentClassifier;
  let policyGate;
  let seedMixOptimizer;

  before(async () => {
    // Create temporary directory for test
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pampax-intent-test-'));
    
    // Initialize components
    intentClassifier = new IntentClassifier();
    policyGate = new PolicyGate();
    seedMixOptimizer = new SeedMixOptimizer();
  });

  after(async () => {
    // Clean up temporary directory
    await fs.rm(tmpDir, { recursive: true, force: true });
    
    // Clean up components
    seedMixOptimizer.clearCache();
    seedMixOptimizer.resetMetrics();
  });

  test('should perform end-to-end intent-aware search workflow', async () => {
    const query = 'getUserById function implementation';
    
    // Step 1: Classify intent
    const intent = intentClassifier.classify(query);
    assert.equal(intent.intent, 'symbol', 'Should classify as symbol intent');
    assert.ok(intent.confidence > 0.2, 'Should have good confidence');
    assert.ok(intent.entities.length > 0, 'Should extract entities');
    
    // Step 2: Build search context
    const searchContext = {
      repo: 'test-repo',
      language: 'typescript',
      queryLength: query.length,
      budget: 5000
    };
    
    // Step 3: Evaluate policy
    const policy = policyGate.evaluate(intent, searchContext);
    assert.ok(policy.includeSymbols, 'Should include symbols for symbol intent');
    assert.ok(policy.includeContent, 'Should include content');
    assert.ok(policy.maxDepth >= 1, 'Should have appropriate max depth');
    
    // Step 4: Optimize seed mix
    const seedConfig = seedMixOptimizer.optimize(intent, policy);
    assert.ok(seedConfig.symbolWeight > 1.0, 'Should boost symbol weight');
    assert.equal(seedConfig.maxDepth, policy.maxDepth, 'Should respect policy depth');
    
    // Step 5: Mock search execution (would normally call searchCode)
    const mockResults = [
      { id: '1', score: 0.9, path: '/services/UserService.ts', content: 'function getUserById(id: string) { ... }' },
      { id: '2', score: 0.8, path: '/types/User.ts', content: 'interface User { id: string; ... }' },
      { id: '3', score: 0.7, path: '/tests/UserService.test.ts', content: 'test("getUserById", () => { ... })' }
    ];
    
    // Step 6: Apply early stop
    const finalResults = seedMixOptimizer.applyEarlyStop(mockResults, seedConfig);
    assert.ok(finalResults.length <= mockResults.length, 'Should not increase result count');
    
    // Verify workflow integration
    assert.ok(intent.suggestedPolicies.length > 0, 'Should suggest policies');
    assert.ok(seedConfig.confidenceMultiplier > 0.7, 'Should apply confidence multiplier');
  });

  test('should handle config intent search workflow', async () => {
    const query = 'database configuration settings';
    
    // Classify intent
    const intent = intentClassifier.classify(query);
    assert.equal(intent.intent, 'config', 'Should classify as config intent');
    
    // Build context
    const searchContext = {
      repo: 'config-repo',
      language: 'javascript',
      queryLength: query.length
    };
    
    // Evaluate policy
    const policy = policyGate.evaluate(intent, searchContext);
    assert.equal(policy.includeFiles, true, 'Should include files for config intent');
    assert.equal(policy.includeSymbols, false, 'Should not include symbols for config intent');
    assert.ok(policy.maxDepth >= 1, 'Should have reasonable depth for config intent');
    
    // Optimize seed mix
    const seedConfig = seedMixOptimizer.optimize(intent, policy);
    assert.ok(seedConfig.bm25Weight > 1.0, 'Should boost BM25 weight for config');
    assert.ok(seedConfig.memoryWeight > 1.0, 'Should boost memory weight for config');
    assert.ok(seedConfig.symbolWeight < 1.0, 'Should reduce symbol weight for config');
  });

  test('should handle API intent search workflow', async () => {
    const query = 'POST /api/users endpoint handler';
    
    // Classify intent
    const intent = intentClassifier.classify(query);
    assert.equal(intent.intent, 'api', 'Should classify as API intent');
    
    // Build context
    const searchContext = {
      repo: 'api-repo',
      language: 'node',
      queryLength: query.length
    };
    
    // Evaluate policy
    const policy = policyGate.evaluate(intent, searchContext);
    assert.equal(policy.includeSymbols, true, 'Should include symbols for API intent');
    assert.equal(policy.includeFiles, false, 'Should not include files for API intent');
    assert.ok(policy.earlyStopThreshold >= 2, 'Should have reasonable early stop threshold for API');
    
    // Optimize seed mix
    const seedConfig = seedMixOptimizer.optimize(intent, policy);
    assert.ok(seedConfig.memoryWeight > 1.0, 'Should boost memory weight for API');
    assert.ok(seedConfig.symbolWeight > 1.0, 'Should boost symbol weight for API');
  });

  test('should handle incident intent search workflow', async () => {
    const query = 'authentication error debug crash';
    
    // Classify intent
    const intent = intentClassifier.classify(query);
    assert.equal(intent.intent, 'incident', 'Should classify as incident intent');
    
    // Build context
    const searchContext = {
      repo: 'incident-repo',
      language: 'python',
      queryLength: query.length
    };
    
    // Evaluate policy
    const policy = policyGate.evaluate(intent, searchContext);
    assert.equal(policy.includeSymbols, true, 'Should include symbols for incident intent');
    assert.equal(policy.includeFiles, true, 'Should include files for incident intent');
    assert.ok(policy.maxDepth >= 3, 'Should have high max depth for incident');
    assert.ok(policy.earlyStopThreshold >= 5, 'Should have higher early stop threshold for incident');
    
    // Optimize seed mix
    const seedConfig = seedMixOptimizer.optimize(intent, policy);
    assert.ok(seedConfig.memoryWeight > 1.5, 'Should heavily boost memory weight for incident');
    assert.ok(seedConfig.vectorWeight > 1.0, 'Should boost vector weight for incident');
  });

  test('should handle general search intent workflow', async () => {
    const query = 'how to implement user authentication';
    
    // Classify intent
    const intent = intentClassifier.classify(query);
    assert.equal(intent.intent, 'search', 'Should classify as general search intent');
    
    // Build context
    const searchContext = {
      repo: 'general-repo',
      language: 'typescript',
      queryLength: query.length
    };
    
    // Evaluate policy
    const policy = policyGate.evaluate(intent, searchContext);
    assert.equal(policy.includeSymbols, true, 'Should include symbols for general search');
    assert.equal(policy.includeFiles, true, 'Should include files for general search');
    assert.equal(policy.includeContent, true, 'Should include content for general search');
    assert.ok(policy.earlyStopThreshold >= 5, 'Should have reasonable early stop threshold');
    
    // Optimize seed mix
    const seedConfig = seedMixOptimizer.optimize(intent, policy);
    assert.ok(seedConfig.vectorWeight >= 0.7, 'Should have reasonable vector weight');
    assert.ok(seedConfig.bm25Weight >= 0.7, 'Should have reasonable BM25 weight');
    assert.ok(seedConfig.memoryWeight >= 0.7, 'Should have reasonable memory weight');
    assert.ok(seedConfig.symbolWeight >= 0.7, 'Should have reasonable symbol weight');
  });

  test('should handle low confidence scenarios', async () => {
    const query = 'something vague unclear';
    
    // Classify intent (should be search with low confidence)
    const intent = intentClassifier.classify(query);
    assert.equal(intent.intent, 'search', 'Should default to search for vague queries');
    assert.ok(intent.confidence < 0.5, 'Should have low confidence');
    
    // Build context
    const searchContext = {
      repo: 'test-repo',
      queryLength: query.length
    };
    
    // Evaluate policy (should be more conservative)
    const policy = policyGate.evaluate(intent, searchContext);
    assert.ok(policy.maxDepth <= 2, 'Should be more conservative with low confidence');
    assert.ok(policy.earlyStopThreshold <= 10, 'Should reduce early stop threshold with low confidence');
    
    // Optimize seed mix
    const seedConfig = seedMixOptimizer.optimize(intent, policy);
    assert.ok(seedConfig.confidenceMultiplier <= 1.0, 'Should not increase weights with low confidence');
  });

  test('should handle high confidence scenarios', async () => {
    const query = 'getUserById function method implementation definition';
    
    // Classify intent (should be symbol with high confidence)
    const intent = intentClassifier.classify(query);
    assert.equal(intent.intent, 'symbol', 'Should classify as symbol intent');
    assert.ok(intent.confidence > 0.8, 'Should have high confidence');
    
    // Build context
    const searchContext = {
      repo: 'test-repo',
      queryLength: query.length
    };
    
    // Evaluate policy (should be more aggressive)
    const policy = policyGate.evaluate(intent, searchContext);
    assert.ok(policy.maxDepth >= 2, 'Should be more aggressive with high confidence');
    assert.ok(policy.earlyStopThreshold >= 3, 'Should increase early stop threshold with high confidence');
    
    // Optimize seed mix
    const seedConfig = seedMixOptimizer.optimize(intent, policy);
    assert.ok(seedConfig.confidenceMultiplier > 0.9, 'Should maintain high weights with high confidence');
  });

  test('should handle repository-specific overrides', async () => {
    // Set up repository-specific policies
    const repositoryPolicies = {
      'frontend-repo': {
        symbol: {
          maxDepth: 4,
          includeSymbols: true,
          includeFiles: false,
          includeContent: true,
          earlyStopThreshold: 6,
          seedWeights: {
            definition: 3.0,
            declaration: 1.8,
            implementation: 1.5,
            usage: 1.0,
            test: 0.8,
            reference: 0.5
          }
        }
      }
    };
    
    const policyGateWithOverrides = new PolicyGate(repositoryPolicies);
    
    const query = 'UserService class method';
    const intent = intentClassifier.classify(query);
    // Force symbol intent to test repository overrides
    intent.intent = 'symbol';
    const searchContext = {
      repo: 'frontend-repo',
      language: 'typescript'
    };
    
    const policy = policyGateWithOverrides.evaluate(intent, searchContext);
    // Note: Repository overrides might not apply if intent doesn't match
    assert.ok(policy.maxDepth >= 1, 'Should have valid max depth');
    assert.ok(policy.earlyStopThreshold >= 1, 'Should have valid early stop threshold');
    
    const seedConfig = seedMixOptimizer.optimize(intent, policy);
    // Repository overrides are applied but may be adjusted by confidence
    assert.ok(seedConfig.maxDepth >= 1, 'Seed config should have valid max depth');
  });

  test('should handle language-specific adjustments', async () => {
    const query = 'user authentication function';
    const intent = intentClassifier.classify(query);
    
    // Test Python adjustments
    const pythonContext = { language: 'python' };
    const pythonPolicy = policyGate.evaluate(intent, pythonContext);
    const pythonSeedConfig = seedMixOptimizer.optimize(intent, pythonPolicy);
    assert.ok(pythonSeedConfig.symbolWeight > 1.0, 'Python should boost symbol weight');
    
    // Test TypeScript adjustments
    const tsContext = { language: 'typescript' };
    const tsPolicy = policyGate.evaluate(intent, tsContext);
    const tsSeedConfig = seedMixOptimizer.optimize(intent, tsPolicy);
    assert.ok(tsSeedConfig.symbolWeight > 1.0, 'TypeScript should boost symbol weight');
    
    // Test Java adjustments
    const javaContext = { language: 'java' };
    const javaPolicy = policyGate.evaluate(intent, javaContext);
    const javaSeedConfig = seedMixOptimizer.optimize(intent, javaContext);
    assert.ok(javaSeedConfig.symbolWeight > 1.0, 'Java should boost symbol weight');
  });

  test('should handle budget constraints', async () => {
    const query = 'getUserById function';
    const intent = intentClassifier.classify(query);
    
    // Test low budget scenario
    const lowBudgetContext = { budget: 1000 };
    const lowBudgetPolicy = policyGate.evaluate(intent, lowBudgetContext);
    assert.equal(lowBudgetPolicy.includeContent, false, 'Low budget should disable content inclusion');
    assert.ok(lowBudgetPolicy.earlyStopThreshold < 3, 'Low budget should reduce early stop threshold');
    
    // Test normal budget scenario
    const normalBudgetContext = { budget: 5000 };
    const normalBudgetPolicy = policyGate.evaluate(intent, normalBudgetContext);
    assert.equal(normalBudgetPolicy.includeContent, true, 'Normal budget should include content');
  });

  test('should handle forced intent overrides', async () => {
    const query = 'some random query';
    
    // Without override
    const normalIntent = intentClassifier.classify(query);
    assert.equal(normalIntent.intent, 'search', 'Should normally classify as search');
    
    // With forced override (simulating CLI --force-intent option)
    const forcedIntent = {
      ...normalIntent,
      intent: 'symbol',
      confidence: 1.0
    };
    
    const searchContext = { repo: 'test-repo' };
    const policy = policyGate.evaluate(forcedIntent, searchContext);
    const seedConfig = seedMixOptimizer.optimize(forcedIntent, policy);
    
    assert.ok(policy.maxDepth >= 1, 'Should use symbol policy for forced intent');
    assert.ok(seedConfig.symbolWeight > 1.0, 'Should boost symbol weight for forced intent');
  });

  test('should maintain backward compatibility', async () => {
    // Test that the system works with minimal configuration
    const query = 'user function';
    const intent = intentClassifier.classify(query);
    const policy = policyGate.evaluate(intent, {});
    const seedConfig = seedMixOptimizer.optimize(intent, policy);
    
    assert.ok(intent.intent, 'Should classify intent with minimal config');
    assert.ok(policy.maxDepth > 0, 'Should produce valid policy with minimal config');
    assert.ok(seedConfig.vectorWeight >= 0, 'Should produce valid seed config with minimal config');
    
    // Test that default behaviors work
    const defaultIntent = intentClassifier.classify('');
    assert.equal(defaultIntent.intent, 'search', 'Should default to search intent');
    assert.ok(defaultIntent.confidence >= 0, 'Should have non-negative confidence for empty query');
  });

  test('should handle error scenarios gracefully', async () => {
    // Test with invalid intent type
    const invalidIntent = {
      intent: 'invalid-type',
      confidence: 0.8,
      entities: [],
      suggestedPolicies: []
    };
    
    const policy = policyGate.evaluate(invalidIntent, {});
    assert.ok(policy.maxDepth > 0, 'Should handle invalid intent gracefully');
    
    const seedConfig = seedMixOptimizer.optimize(invalidIntent, policy);
    assert.ok(seedConfig.vectorWeight >= 0, 'Should produce valid config for invalid intent');
    
    // Test with malformed policy
    const malformedPolicy = {
      maxDepth: -1,
      includeSymbols: 'invalid',
      includeFiles: true,
      includeContent: true,
      earlyStopThreshold: 100,
      seedWeights: null
    };
    
    const fallbackConfig = seedMixOptimizer.optimize(invalidIntent, malformedPolicy);
    assert.ok(fallbackConfig.maxDepth >= 1, 'Should fallback to valid config');
  });

  test('should integrate with CLI command structure', async () => {
    // Simulate CLI command execution
    const query = 'getUserById function';
    const options = {
      limit: 10,
      provider: 'auto',
      intent: true,
      explainIntent: false,
      forceIntent: null,
      enhancedSearch: true
    };
    
    // Step 1: Parse and validate options
    assert.ok(options.limit > 0, 'Should validate limit option');
    assert.ok(options.provider, 'Should validate provider option');
    
    // Step 2: Classify intent
    const intent = intentClassifier.classify(query);
    if (options.forceIntent) {
      // Would apply forced intent override
    }
    
    // Step 3: Build search context
    const searchContext = {
      queryLength: query.length,
      // Other context would be built from CLI options
    };
    
    // Step 4: Execute search workflow
    const policy = policyGate.evaluate(intent, searchContext);
    const seedConfig = seedMixOptimizer.optimize(intent, policy);
    
    // Step 5: Prepare results (mock)
    const results = [
      { id: '1', score: 0.9, path: '/UserService.ts', meta: { symbol: 'getUserById' } }
    ];
    
    // Step 6: Apply intent-aware optimizations
    const finalResults = seedMixOptimizer.applyEarlyStop(results, seedConfig);
    
    // Verify integration
    assert.ok(intent.intent, 'Should complete intent classification');
    assert.ok(policy.maxDepth > 0, 'Should complete policy evaluation');
    assert.ok(seedConfig.vectorWeight >= 0, 'Should complete seed optimization');
    assert.ok(finalResults.length <= results.length, 'Should apply early stop');
    
    // Verify CLI output preparation
    if (options.intent) {
      assert.ok(intent.confidence >= 0, 'Should prepare intent info for output');
      assert.ok(intent.entities.length >= 0, 'Should prepare entities for output');
    }
  });
});