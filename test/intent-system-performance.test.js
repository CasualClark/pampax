#!/usr/bin/env node
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { IntentClassifier } from '../dist/src/intent/intent-classifier.js';
import { PolicyGate } from '../dist/src/policy/policy-gate.js';
import { SeedMixOptimizer } from '../dist/src/search/seed-mix-optimizer.js';

describe('Intent System Performance Tests', () => {
  let intentClassifier;
  let policyGate;
  let seedMixOptimizer;

  before(() => {
    intentClassifier = new IntentClassifier();
    policyGate = new PolicyGate();
    seedMixOptimizer = new SeedMixOptimizer();
  });

  after(() => {
    seedMixOptimizer.clearCache();
    seedMixOptimizer.resetMetrics();
  });

  test('should meet intent classification performance benchmarks', () => {
    const testQueries = [
      'getUserById function implementation',
      'database configuration settings',
      'POST /api/users endpoint handler',
      'authentication error debug crash',
      'how to implement user authentication',
      'React component render method',
      'Python class definition',
      'Java interface implementation',
      'Go package structure',
      'TypeScript generic types'
    ];

    const classificationTimes = [];
    const iterations = 100;

    for (let i = 0; i < iterations; i++) {
      const query = testQueries[i % testQueries.length];
      
      const startTime = performance.now();
      const result = intentClassifier.classify(query);
      const endTime = performance.now();
      
      const classificationTime = endTime - startTime;
      classificationTimes.push(classificationTime);
      
      // Verify correctness during performance test
      assert.ok(result.intent, 'Should always return an intent');
      assert.ok(typeof result.confidence === 'number', 'Should always return confidence score');
    }

    const avgTime = classificationTimes.reduce((sum, time) => sum + time, 0) / classificationTimes.length;
    const maxTime = Math.max(...classificationTimes);
    const p95Time = classificationTimes.sort((a, b) => a - b)[Math.floor(classificationTimes.length * 0.95)];

    console.log(`Intent Classification Performance:`);
    console.log(`  Average: ${avgTime.toFixed(3)}ms`);
    console.log(`  Max: ${maxTime.toFixed(3)}ms`);
    console.log(`  95th percentile: ${p95Time.toFixed(3)}ms`);

    assert.ok(avgTime < 5.0, `Average classification time should be < 5ms, got ${avgTime.toFixed(3)}ms`);
    assert.ok(maxTime < 20.0, `Max classification time should be < 20ms, got ${maxTime.toFixed(3)}ms`);
    assert.ok(p95Time < 10.0, `95th percentile should be < 10ms, got ${p95Time.toFixed(3)}ms`);
  });

  test('should meet policy evaluation performance benchmarks', () => {
    const testIntents = [
      { intent: 'symbol', confidence: 0.8, entities: [{ type: 'function', value: 'getUserById', position: 0 }], suggestedPolicies: ['symbol-level-2'] },
      { intent: 'config', confidence: 0.7, entities: [{ type: 'file', value: 'config.json', position: 0 }], suggestedPolicies: ['config-key-source'] },
      { intent: 'api', confidence: 0.9, entities: [{ type: 'route', value: '/api/users', position: 0 }], suggestedPolicies: ['api-handler-registration'] },
      { intent: 'incident', confidence: 0.85, entities: [{ type: 'function', value: 'authenticate', position: 0 }], suggestedPolicies: ['incident-callers-diffs'] },
      { intent: 'search', confidence: 0.6, entities: [], suggestedPolicies: ['search-default'] }
    ];

    const testContexts = [
      { repo: 'test-repo', language: 'typescript', queryLength: 20, budget: 5000 },
      { repo: 'frontend-repo', language: 'javascript', queryLength: 15, budget: 3000 },
      { repo: 'backend-repo', language: 'python', queryLength: 25, budget: 7000 },
      { repo: 'api-repo', language: 'node', queryLength: 18, budget: 4000 },
      {}
    ];

    const evaluationTimes = [];
    const iterations = 100;

    for (let i = 0; i < iterations; i++) {
      const intent = testIntents[i % testIntents.length];
      const context = testContexts[i % testContexts.length];
      
      const startTime = performance.now();
      const policy = policyGate.evaluate(intent, context);
      const endTime = performance.now();
      
      const evaluationTime = endTime - startTime;
      evaluationTimes.push(evaluationTime);
      
      // Verify correctness during performance test
      assert.ok(policy.maxDepth > 0, 'Should always return valid maxDepth');
      assert.ok(policy.earlyStopThreshold > 0, 'Should always return valid earlyStopThreshold');
    }

    const avgTime = evaluationTimes.reduce((sum, time) => sum + time, 0) / evaluationTimes.length;
    const maxTime = Math.max(...evaluationTimes);
    const p95Time = evaluationTimes.sort((a, b) => a - b)[Math.floor(evaluationTimes.length * 0.95)];

    console.log(`Policy Evaluation Performance:`);
    console.log(`  Average: ${avgTime.toFixed(3)}ms`);
    console.log(`  Max: ${maxTime.toFixed(3)}ms`);
    console.log(`  95th percentile: ${p95Time.toFixed(3)}ms`);

    assert.ok(avgTime < 3.0, `Average evaluation time should be < 3ms, got ${avgTime.toFixed(3)}ms`);
    assert.ok(maxTime < 15.0, `Max evaluation time should be < 15ms, got ${maxTime.toFixed(3)}ms`);
    assert.ok(p95Time < 8.0, `95th percentile should be < 8ms, got ${p95Time.toFixed(3)}ms`);
  });

  test('should meet seed mix optimization performance benchmarks', () => {
    const testIntents = [
      { intent: 'symbol', confidence: 0.8, entities: [], suggestedPolicies: [] },
      { intent: 'config', confidence: 0.7, entities: [], suggestedPolicies: [] },
      { intent: 'api', confidence: 0.9, entities: [], suggestedPolicies: [] },
      { intent: 'incident', confidence: 0.85, entities: [], suggestedPolicies: [] },
      { intent: 'search', confidence: 0.6, entities: [], suggestedPolicies: [] }
    ];

    const testPolicies = [
      {
        maxDepth: 2,
        includeSymbols: true,
        includeFiles: false,
        includeContent: true,
        earlyStopThreshold: 3,
        seedWeights: { definition: 2.0, declaration: 1.8, implementation: 1.5, usage: 1.0, test: 0.8, reference: 0.5 }
      },
      {
        maxDepth: 1,
        includeSymbols: false,
        includeFiles: true,
        includeContent: true,
        earlyStopThreshold: 2,
        seedWeights: { config: 2.0, setting: 1.8, environment: 1.5, constant: 1.2, default: 1.0 }
      },
      {
        maxDepth: 2,
        includeSymbols: true,
        includeFiles: false,
        includeContent: true,
        earlyStopThreshold: 2,
        seedWeights: { handler: 2.0, endpoint: 1.8, route: 1.5, controller: 1.3, middleware: 1.0, registration: 0.8 }
      }
    ];

    const optimizationTimes = [];
    const iterations = 100;

    // Reset metrics to get clean measurements
    seedMixOptimizer.resetMetrics();

    for (let i = 0; i < iterations; i++) {
      const intent = testIntents[i % testIntents.length];
      const policy = testPolicies[i % testPolicies.length];
      
      const startTime = performance.now();
      const config = seedMixOptimizer.optimize(intent, policy);
      const endTime = performance.now();
      
      const optimizationTime = endTime - startTime;
      optimizationTimes.push(optimizationTime);
      
      // Verify correctness during performance test
      assert.ok(config.vectorWeight >= 0, 'Should always return valid vector weight');
      assert.ok(config.bm25Weight >= 0, 'Should always return valid BM25 weight');
      assert.ok(config.memoryWeight >= 0, 'Should always return valid memory weight');
      assert.ok(config.symbolWeight >= 0, 'Should always return valid symbol weight');
    }

    const avgTime = optimizationTimes.reduce((sum, time) => sum + time, 0) / optimizationTimes.length;
    const maxTime = Math.max(...optimizationTimes);
    const p95Time = optimizationTimes.sort((a, b) => a - b)[Math.floor(optimizationTimes.length * 0.95)];

    console.log(`Seed Mix Optimization Performance:`);
    console.log(`  Average: ${avgTime.toFixed(3)}ms`);
    console.log(`  Max: ${maxTime.toFixed(3)}ms`);
    console.log(`  95th percentile: ${p95Time.toFixed(3)}ms`);

    assert.ok(avgTime < 4.0, `Average optimization time should be < 4ms, got ${avgTime.toFixed(3)}ms`);
    assert.ok(maxTime < 20.0, `Max optimization time should be < 20ms, got ${maxTime.toFixed(3)}ms`);
    assert.ok(p95Time < 10.0, `95th percentile should be < 10ms, got ${p95Time.toFixed(3)}ms`);

    // Check cache performance
    const metrics = seedMixOptimizer.getPerformanceMetrics();
    assert.ok(metrics.cacheHitRate > 0.5, `Cache hit rate should be > 50%, got ${(metrics.cacheHitRate * 100).toFixed(1)}%`);
  });

  test('should measure end-to-end intent-aware search performance', () => {
    const testQueries = [
      'getUserById function implementation',
      'database configuration settings',
      'POST /api/users endpoint handler',
      'authentication error debug crash',
      'how to implement user authentication'
    ];

    const context = {
      repo: 'performance-test-repo',
      language: 'typescript',
      queryLength: 25,
      budget: 5000
    };

    const endToEndTimes = [];
    const iterations = 50;

    for (let i = 0; i < iterations; i++) {
      const query = testQueries[i % testQueries.length];
      
      const startTime = performance.now();
      
      // Step 1: Intent classification
      const intent = intentClassifier.classify(query);
      
      // Step 2: Policy evaluation
      const policy = policyGate.evaluate(intent, context);
      
      // Step 3: Seed mix optimization
      const seedConfig = seedMixOptimizer.optimize(intent, policy);
      
      // Step 4: Mock RRF fusion (simplified for performance test)
      const mockResults = [
        { id: '1', score: 0.9 },
        { id: '2', score: 0.8 },
        { id: '3', score: 0.7 },
        { id: '4', score: 0.6 },
        { id: '5', score: 0.5 }
      ];
      const fusedResults = seedMixOptimizer.reciprocalRankFusion(
        { vectorResults: mockResults, bm25Results: mockResults },
        seedConfig,
        10
      );
      
      // Step 5: Early stop application
      const finalResults = seedMixOptimizer.applyEarlyStop(fusedResults, seedConfig);
      
      const endTime = performance.now();
      const totalTime = endTime - startTime;
      endToEndTimes.push(totalTime);
      
      // Verify end-to-end correctness
      assert.ok(intent.intent, 'Should classify intent');
      assert.ok(policy.maxDepth > 0, 'Should evaluate policy');
      assert.ok(seedConfig.vectorWeight >= 0, 'Should optimize seed mix');
      assert.ok(finalResults.length <= mockResults.length, 'Should apply early stop');
    }

    const avgTime = endToEndTimes.reduce((sum, time) => sum + time, 0) / endToEndTimes.length;
    const maxTime = Math.max(...endToEndTimes);
    const p95Time = endToEndTimes.sort((a, b) => a - b)[Math.floor(endToEndTimes.length * 0.95)];

    console.log(`End-to-End Intent-Aware Search Performance:`);
    console.log(`  Average: ${avgTime.toFixed(3)}ms`);
    console.log(`  Max: ${maxTime.toFixed(3)}ms`);
    console.log(`  95th percentile: ${p95Time.toFixed(3)}ms`);

    assert.ok(avgTime < 15.0, `Average end-to-end time should be < 15ms, got ${avgTime.toFixed(3)}ms`);
    assert.ok(maxTime < 50.0, `Max end-to-end time should be < 50ms, got ${maxTime.toFixed(3)}ms`);
    assert.ok(p95Time < 30.0, `95th percentile should be < 30ms, got ${p95Time.toFixed(3)}ms`);
  });

  test('should measure RRF fusion performance', () => {
    const config = {
      vectorWeight: 1.0,
      bm25Weight: 1.0,
      memoryWeight: 1.0,
      symbolWeight: 1.0,
      maxDepth: 2,
      earlyStopThreshold: 10,
      confidenceMultiplier: 1.0
    };

    const vectorResults = Array.from({ length: 100 }, (_, i) => ({
      id: `v${i}`,
      score: 1.0 - (i * 0.01),
      vectorRank: i,
      path: `/file${i}.js`
    }));

    const bm25Results = Array.from({ length: 100 }, (_, i) => ({
      id: `b${i}`,
      score: 1.0 - (i * 0.01),
      bm25Rank: i,
      path: `/file${i}.js`
    }));

    const memoryResults = Array.from({ length: 50 }, (_, i) => ({
      id: `m${i}`,
      score: 1.0 - (i * 0.02),
      memoryRank: i,
      path: `/memory${i}.js`
    }));

    const fusionTimes = [];
    const iterations = 50;

    for (let i = 0; i < iterations; i++) {
      const startTime = performance.now();
      
      const fusedResults = seedMixOptimizer.reciprocalRankFusion({
        vectorResults,
        bm25Results,
        memoryResults,
        symbolResults: []
      }, config, 20);
      
      const endTime = performance.now();
      const fusionTime = endTime - startTime;
      fusionTimes.push(fusionTime);
      
      // Verify correctness
      assert.ok(fusedResults.length > 0, 'Should produce fused results');
      assert.ok(fusedResults.length <= 20, 'Should respect limit');
    }

    const avgTime = fusionTimes.reduce((sum, time) => sum + time, 0) / fusionTimes.length;
    const maxTime = Math.max(...fusionTimes);

    console.log(`RRF Fusion Performance (250 total results):`);
    console.log(`  Average: ${avgTime.toFixed(3)}ms`);
    console.log(`  Max: ${maxTime.toFixed(3)}ms`);

    assert.ok(avgTime < 10.0, `Average fusion time should be < 10ms, got ${avgTime.toFixed(3)}ms`);
    assert.ok(maxTime < 30.0, `Max fusion time should be < 30ms, got ${maxTime.toFixed(3)}ms`);
  });

  test('should measure early stop performance', () => {
    const config = {
      vectorWeight: 1.0,
      bm25Weight: 1.0,
      memoryWeight: 1.0,
      symbolWeight: 1.0,
      maxDepth: 2,
      earlyStopThreshold: 10,
      confidenceMultiplier: 1.0
    };

    const largeResultSet = Array.from({ length: 1000 }, (_, i) => ({
      id: `result${i}`,
      score: i < 10 ? 1.0 - (i * 0.05) : 0.1, // Sharp drop after 10 results
      path: `/file${i}.js`
    }));

    const earlyStopTimes = [];
    const iterations = 100;

    for (let i = 0; i < iterations; i++) {
      const startTime = performance.now();
      
      const earlyStoppedResults = seedMixOptimizer.applyEarlyStop(largeResultSet, config);
      
      const endTime = performance.now();
      const earlyStopTime = endTime - startTime;
      earlyStopTimes.push(earlyStopTime);
      
      // Verify correctness
      assert.ok(earlyStoppedResults.length <= largeResultSet.length, 'Should not increase result count');
    }

    const avgTime = earlyStopTimes.reduce((sum, time) => sum + time, 0) / earlyStopTimes.length;
    const maxTime = Math.max(...earlyStopTimes);

    console.log(`Early Stop Performance (1000 results):`);
    console.log(`  Average: ${avgTime.toFixed(3)}ms`);
    console.log(`  Max: ${maxTime.toFixed(3)}ms`);

    assert.ok(avgTime < 2.0, `Average early stop time should be < 2ms, got ${avgTime.toFixed(3)}ms`);
    assert.ok(maxTime < 10.0, `Max early stop time should be < 10ms, got ${maxTime.toFixed(3)}ms`);
  });

  test('should measure memory usage and caching efficiency', () => {
    // Reset metrics for clean measurement
    seedMixOptimizer.resetMetrics();
    
    const testIntents = [
      { intent: 'symbol', confidence: 0.8, entities: [], suggestedPolicies: [] },
      { intent: 'config', confidence: 0.7, entities: [], suggestedPolicies: [] },
      { intent: 'api', confidence: 0.9, entities: [], suggestedPolicies: [] }
    ];

    const testPolicies = [
      {
        maxDepth: 2,
        includeSymbols: true,
        includeFiles: false,
        includeContent: true,
        earlyStopThreshold: 3,
        seedWeights: { definition: 2.0, declaration: 1.8, implementation: 1.5, usage: 1.0, test: 0.8, reference: 0.5 }
      }
    ];

    // Generate cache entries
    const uniqueCombinations = [];
    for (let i = 0; i < 20; i++) {
      const intent = testIntents[i % testIntents.length];
      const policy = { ...testPolicies[0], maxDepth: 1 + (i % 3) }; // Vary max depth
      uniqueCombinations.push({ intent, policy });
    }

    // First pass - populate cache
    const firstPassTimes = [];
    uniqueCombinations.forEach(({ intent, policy }) => {
      const startTime = performance.now();
      seedMixOptimizer.optimize(intent, policy);
      const endTime = performance.now();
      firstPassTimes.push(endTime - startTime);
    });

    // Second pass - test cache hits
    const secondPassTimes = [];
    uniqueCombinations.forEach(({ intent, policy }) => {
      const startTime = performance.now();
      seedMixOptimizer.optimize(intent, policy);
      const endTime = performance.now();
      secondPassTimes.push(endTime - startTime);
    });

    const avgFirstPass = firstPassTimes.reduce((sum, time) => sum + time, 0) / firstPassTimes.length;
    const avgSecondPass = secondPassTimes.reduce((sum, time) => sum + time, 0) / secondPassTimes.length;
    
    const metrics = seedMixOptimizer.getPerformanceMetrics();
    const cacheSpeedup = avgFirstPass / avgSecondPass;

    console.log(`Caching Performance:`);
    console.log(`  First pass avg: ${avgFirstPass.toFixed(3)}ms`);
    console.log(`  Second pass avg: ${avgSecondPass.toFixed(3)}ms`);
    console.log(`  Cache speedup: ${cacheSpeedup.toFixed(2)}x`);
    console.log(`  Cache hit rate: ${(metrics.cacheHitRate * 100).toFixed(1)}%`);
    console.log(`  Cache entries: ${metrics.cacheHits + metrics.cacheMisses}`);

    assert.ok(cacheSpeedup > 1.5, `Cache should provide at least 1.5x speedup, got ${cacheSpeedup.toFixed(2)}x`);
    assert.ok(metrics.cacheHitRate > 0.8, `Cache hit rate should be > 80%, got ${(metrics.cacheHitRate * 100).toFixed(1)}%`);
  });

  test('should validate performance regression thresholds', () => {
    // Define performance regression thresholds
    const thresholds = {
      intentClassification: { avg: 5.0, max: 20.0, p95: 10.0 },
      policyEvaluation: { avg: 3.0, max: 15.0, p95: 8.0 },
      seedOptimization: { avg: 4.0, max: 20.0, p95: 10.0 },
      endToEnd: { avg: 15.0, max: 50.0, p95: 30.0 }
    };

    // Quick validation test
    const query = 'getUserById function implementation';
    const context = { repo: 'test', language: 'typescript' };

    const iterations = 10;
    const times = { intent: [], policy: [], seed: [], total: [] };

    for (let i = 0; i < iterations; i++) {
      const totalStart = performance.now();
      
      const intentStart = performance.now();
      const intent = intentClassifier.classify(query);
      const intentEnd = performance.now();
      
      const policyStart = performance.now();
      const policy = policyGate.evaluate(intent, context);
      const policyEnd = performance.now();
      
      const seedStart = performance.now();
      const seedConfig = seedMixOptimizer.optimize(intent, policy);
      const seedEnd = performance.now();
      
      const totalEnd = performance.now();
      
      times.intent.push(intentEnd - intentStart);
      times.policy.push(policyEnd - policyStart);
      times.seed.push(seedEnd - seedStart);
      times.total.push(totalEnd - totalStart);
    }

    const calculateStats = (timeArray) => {
      const sorted = [...timeArray].sort((a, b) => a - b);
      return {
        avg: timeArray.reduce((sum, time) => sum + time, 0) / timeArray.length,
        max: Math.max(...timeArray),
        p95: sorted[Math.floor(sorted.length * 0.95)]
      };
    };

    const intentStats = calculateStats(times.intent);
    const policyStats = calculateStats(times.policy);
    const seedStats = calculateStats(times.seed);
    const totalStats = calculateStats(times.total);

    console.log(`Performance Regression Validation:`);
    console.log(`  Intent Classification: avg=${intentStats.avg.toFixed(3)}ms, max=${intentStats.max.toFixed(3)}ms, p95=${intentStats.p95.toFixed(3)}ms`);
    console.log(`  Policy Evaluation: avg=${policyStats.avg.toFixed(3)}ms, max=${policyStats.max.toFixed(3)}ms, p95=${policyStats.p95.toFixed(3)}ms`);
    console.log(`  Seed Optimization: avg=${seedStats.avg.toFixed(3)}ms, max=${seedStats.max.toFixed(3)}ms, p95=${seedStats.p95.toFixed(3)}ms`);
    console.log(`  End-to-End: avg=${totalStats.avg.toFixed(3)}ms, max=${totalStats.max.toFixed(3)}ms, p95=${totalStats.p95.toFixed(3)}ms`);

    // Validate against thresholds
    assert.ok(intentStats.avg <= thresholds.intentClassification.avg, `Intent classification avg exceeds threshold: ${intentStats.avg.toFixed(3)}ms > ${thresholds.intentClassification.avg}ms`);
    assert.ok(policyStats.avg <= thresholds.policyEvaluation.avg, `Policy evaluation avg exceeds threshold: ${policyStats.avg.toFixed(3)}ms > ${thresholds.policyEvaluation.avg}ms`);
    assert.ok(seedStats.avg <= thresholds.seedOptimization.avg, `Seed optimization avg exceeds threshold: ${seedStats.avg.toFixed(3)}ms > ${thresholds.seedOptimization.avg}ms`);
    assert.ok(totalStats.avg <= thresholds.endToEnd.avg, `End-to-end avg exceeds threshold: ${totalStats.avg.toFixed(3)}ms > ${thresholds.endToEnd.avg}ms`);
  });
});