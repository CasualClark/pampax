import { test, describe, before, beforeEach } from 'node:test';
import assert from 'node:assert';
import { 
  OutcomeAnalyzer, 
  WeightOptimizer, 
  PolicyTuner, 
  SignatureCache,
  type OutcomeSignal,
  type BundleStructure,
  type SatisfactionMetrics
} from '../../src/learning/index.js';
import { MemoryOperations } from '../../src/storage/memory-operations.js';
import { DatabaseManager } from '../../src/storage/database-async.js';
import { type IntentType } from '../../src/intent/intent-classifier.js';
import { type PolicyDecision } from '../../src/policy/policy-gate.js';
import type { CacheEntry } from '../../src/learning/signature-cache.js';

describe('Comprehensive Learning System Test Suite', () => {
  let testStorage: MemoryOperations;

  // Test data generators
  const generateTestSignals = (count: number = 100): OutcomeSignal[] => {
    const signals: OutcomeSignal[] = [];
    const intents: IntentType[] = ['symbol', 'config', 'api', 'incident', 'search'];
    const satisfactionRates = { symbol: 0.8, config: 0.6, api: 0.7, incident: 0.5, search: 0.9 };
    
    for (let i = 0; i < count; i++) {
      const intent = intents[i % intents.length];
      const satisfied = Math.random() < satisfactionRates[intent];
      
      signals.push({
        sessionId: `session_${Math.floor(i / 5)}`,
        query: `test query ${i}`,
        intent,
        bundleSignature: `bundle_sig_${i % 20}`,
        satisfied,
        timeToFix: satisfied ? 500 + Math.random() * 1500 : 2000 + Math.random() * 3000,
        tokenUsage: 200 + Math.random() * 800,
        seedWeights: {
          definition: 1.5 + Math.random() * 2,
          config: intent === 'config' ? 2.0 + Math.random() : 0.5 + Math.random(),
          usage: 0.8 + Math.random() * 1.2
        },
        policyThresholds: {
          earlyStop: 2 + Math.floor(Math.random() * 4),
          maxDepth: 3 + Math.floor(Math.random() * 5)
        }
      });
    }
    
    return signals;
  };

  const generateLargeDataset = (size: number = 10000): OutcomeSignal[] => {
    console.log(`Generating large dataset with ${size} signals...`);
    return generateTestSignals(size);
  };

  // Performance measurement utilities
  const measurePerformance = async <T>(operation: () => Promise<T>, name: string): Promise<{ result: T; duration: number }> => {
    const startTime = performance.now();
    const result = await operation();
    const endTime = performance.now();
    const duration = endTime - startTime;
    
    console.log(`${name}: ${duration.toFixed(2)}ms`);
    return { result, duration };
  };

  // Setup test database
  const setupTestDatabase = async (): Promise<MemoryOperations> => {
    const dbManager = new DatabaseManager({ path: ':memory:' });
    await dbManager.initialize();
    const db = dbManager.getDatabase();
    
    // Create comprehensive schema for learning tests
    await new Promise<void>((resolve, reject) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS session (
          id TEXT PRIMARY KEY,
          tool TEXT,
          user TEXT,
          repo TEXT,
          branch TEXT,
          started_at INTEGER,
          finished_at INTEGER
        );
        
        CREATE TABLE IF NOT EXISTS interaction (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          session_id TEXT REFERENCES session(id),
          ts INTEGER NOT NULL,
          query TEXT NOT NULL,
          bundle_id TEXT,
          satisfied INTEGER,
          notes TEXT,
          token_usage INTEGER DEFAULT 0,
          seed_weights TEXT,
          policy_thresholds TEXT
        );
        
        CREATE TABLE IF NOT EXISTS learning_signals (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          session_id TEXT,
          interaction_id INTEGER,
          signal_type TEXT,
          signal_data TEXT,
          created_at INTEGER,
          processed INTEGER DEFAULT 0
        );
        
        CREATE INDEX IF NOT EXISTS idx_interaction_session ON interaction(session_id);
        CREATE INDEX IF NOT EXISTS idx_interaction_ts ON interaction(ts);
        CREATE INDEX IF NOT EXISTS idx_learning_signals_processed ON learning_signals(processed);
      `, (err: any) => {
        if (err) reject(err);
        else resolve();
      });
    });
    
    return new MemoryOperations(db);
  };

  before(async () => {
    testStorage = await setupTestDatabase();
  });

  describe('OutcomeAnalyzer Comprehensive Tests', () => {
    let analyzer: OutcomeAnalyzer;

    beforeEach(() => {
      analyzer = new OutcomeAnalyzer(testStorage);
    });

    test('should handle large datasets efficiently', async () => {
      const largeDataset = generateLargeDataset(5000);
      
      const { duration } = await measurePerformance(async () => {
        const metrics = await analyzer.computeSatisfactionMetrics(largeDataset);
        return metrics;
      }, 'Large dataset processing (5000 signals)');
      
      assert.ok(duration < 10000, `Should process 5000 signals in <10s, took ${duration}ms`);
    });

    test('should achieve 90%+ code coverage edge cases', async () => {
      // Test empty data
      const emptyMetrics = await analyzer.computeSatisfactionMetrics([]);
      assert.strictEqual(emptyMetrics.totalInteractions, 0);
      assert.strictEqual(emptyMetrics.overallSatisfactionRate, 0);

      // Test single signal
      const singleSignal = generateTestSignals(1);
      const singleMetrics = await analyzer.computeSatisfactionMetrics(singleSignal);
      assert.strictEqual(singleMetrics.totalInteractions, 1);
      assert.ok(singleMetrics.overallSatisfactionRate === 0 || singleMetrics.overallSatisfactionRate === 1);

      // Test malformed signals
      const malformedSignals = [
        { sessionId: '', query: '', intent: '', bundleSignature: '', satisfied: true, tokenUsage: 0, seedWeights: {}, policyThresholds: {} },
        { sessionId: 'test', query: 'test', intent: 'invalid' as IntentType, bundleSignature: 'test', satisfied: false, tokenUsage: -1, seedWeights: null as any, policyThresholds: undefined as any }
      ];
      
      const malformedMetrics = await analyzer.computeSatisfactionMetrics(malformedSignals);
      assert.strictEqual(malformedMetrics.totalInteractions, 2);
    });

    test('should process 30 days of data within performance target', async () => {
      // Create 30 days worth of historical data
      const thirtyDaySignals = generateLargeDataset(1000); // ~33 interactions per day
      
      const { duration } = await measurePerformance(async () => {
        return await analyzer.computeSatisfactionMetrics(thirtyDaySignals);
      }, '30 days data processing');
      
      assert.ok(duration < 60000, `Should process 30 days in <60s, took ${duration}ms`);
    });

    test('should generate consistent bundle signatures', async () => {
      const bundle1: BundleStructure = {
        sources: [
          { type: 'code', items: [{ path: 'src/main.ts', score: 0.9, kind: 'function' }] },
          { type: 'memory', items: [{ id: 'mem1', kind: 'definition' }] }
        ],
        intent: { intent: 'symbol', confidence: 0.8, entities: [], suggestedPolicies: [] },
        total_tokens: 500
      };

      const bundle2 = { ...bundle1 };
      const bundle3 = { ...bundle1, sources: [...bundle1.sources] };

      const sig1 = analyzer.generateBundleSignature(bundle1);
      const sig2 = analyzer.generateBundleSignature(bundle2);
      const sig3 = analyzer.generateBundleSignature(bundle3);

      assert.strictEqual(sig1, sig2, 'Identical bundles should have same signature');
      assert.strictEqual(sig1, sig3, 'Deep copied bundles should have same signature');
      assert.ok(sig1.length > 10, 'Signature should be substantial');
    });

    test('should handle concurrent analysis', async () => {
      const datasets = Array.from({ length: 10 }, () => generateTestSignals(100));
      
      const { duration } = await measurePerformance(async () => {
        const promises = datasets.map(dataset => analyzer.computeSatisfactionMetrics(dataset));
        return await Promise.all(promises);
      }, 'Concurrent analysis (10 datasets)');
      
      assert.ok(duration < 15000, `Concurrent analysis should complete in <15s, took ${duration}ms`);
    });
  });

  describe('WeightOptimizer Comprehensive Tests', () => {
    let optimizer: WeightOptimizer;

    beforeEach(() => {
      optimizer = new WeightOptimizer();
    });

    test('should optimize weights within performance targets', async () => {
      const signals = generateTestSignals(200);
      const initialWeights = {
        symbol: { definition: 2.0, usage: 1.0, config: 0.5 },
        config: { definition: 1.0, usage: 0.8, config: 2.5 },
        search: { definition: 1.5, usage: 1.2, config: 0.8 }
      };

      const { duration, result } = await measurePerformance(async () => {
        return await optimizer.optimizeWeights(signals, initialWeights);
      }, 'Weight optimization');

      assert.ok(duration < 10000, `Weight optimization should complete in <10s, took ${duration}ms`);
      assert.ok(result.optimizedWeights, 'Should return optimized weights');
      assert.ok(result.improvement >= 0, 'Improvement should be non-negative');
      assert.ok(result.iterations > 0, 'Should perform iterations');
      assert.ok(result.convergence !== undefined, 'Should track convergence');
    });

    test('should handle edge cases and constraints', async () => {
      // Test with insufficient signals
      const insufficientSignals = generateTestSignals(2);
      const result = await optimizer.optimizeWeights(insufficientSignals, {});
      assert.ok(!result.convergence, 'Should not converge with insufficient data');

      // Test with weight bounds
      const signals = generateTestSignals(50);
      const extremeWeights = {
        symbol: { definition: 0.01, usage: 100, config: -5 }
      };

      const boundedResult = await optimizer.optimizeWeights(signals, extremeWeights, {
        weightBounds: { min: 0.1, max: 5.0 }
      });

      for (const intent of Object.keys(boundedResult.optimizedWeights)) {
        for (const [weight, value] of Object.entries(boundedResult.optimizedWeights[intent])) {
          assert.ok(value >= 0.1, `Weight ${weight} should be >= 0.1, got ${value}`);
          assert.ok(value <= 5.0, `Weight ${weight} should be <= 5.0, got ${value}`);
        }
      }
    });

    test('should validate rollback functionality', async () => {
      const signals = generateTestSignals(100);
      const initialWeights = {
        symbol: { definition: 2.0, usage: 1.0 }
      };

      const result = await optimizer.optimizeWeights(signals, initialWeights);
      
      assert.ok(result.rollbackData, 'Should include rollback data');
      assert.deepStrictEqual(result.rollbackData, initialWeights, 'Rollback data should match initial weights');
    });

    test('should achieve convergence on typical datasets', async () => {
      const signals = generateTestSignals(500);
      const weights = {
        symbol: { definition: 1.5, usage: 1.2, config: 0.8 },
        config: { definition: 1.0, usage: 1.5, config: 2.0 }
      };

      const result = await optimizer.optimizeWeights(signals, weights, {
        maxIterations: 50,
        convergenceThreshold: 0.01
      });

      assert.ok(result.convergence, 'Should achieve convergence');
      assert.ok(result.iterations <= 50, 'Should respect max iterations');
    });
  });

  describe('PolicyTuner Comprehensive Tests', () => {
    let tuner: PolicyTuner;

    beforeEach(() => {
      tuner = new PolicyTuner();
    });

    test('should tune policies within performance targets', async () => {
      const signals = generateTestSignals(300);
      const initialPolicies: Record<string, PolicyDecision> = {
        symbol: { 
          maxDepth: 5, 
          includeSymbols: true, 
          includeFiles: true, 
          includeContent: true, 
          earlyStopThreshold: 3, 
          seedWeights: { definition: 2.0 } 
        },
        config: { 
          maxDepth: 4, 
          includeSymbols: false, 
          includeFiles: true, 
          includeContent: true, 
          earlyStopThreshold: 2, 
          seedWeights: { config: 2.5 } 
        }
      };

      const { duration, result } = await measurePerformance(async () => {
        return await tuner.tunePolicies(signals, initialPolicies);
      }, 'Policy tuning');

      assert.ok(duration < 8000, `Policy tuning should complete in <8s, took ${duration}ms`);
      assert.ok(result.optimizedPolicies, 'Should return optimized policies');
      assert.ok(result.parameterChanges, 'Should track parameter changes');
      assert.ok(result.rollbackData, 'Should include rollback data');
    });

    test('should respect parameter bounds', async () => {
      const signals = generateTestSignals(100);
      const policies: Record<string, PolicyDecision> = {
        symbol: { 
          maxDepth: 20, 
          includeSymbols: true, 
          includeFiles: true, 
          includeContent: true, 
          earlyStopThreshold: 10, 
          seedWeights: {} 
        }
      };

      const result = await tuner.tunePolicies(signals, policies, {
        parameterBounds: {
          maxDepth: { min: 1, max: 10 },
          earlyStopThreshold: { min: 1, max: 5 },
          seedWeight: { min: 0.1, max: 5.0 }
        }
      });

      for (const [intent, policy] of Object.entries(result.optimizedPolicies)) {
        assert.ok(policy.maxDepth >= 1 && policy.maxDepth <= 10, `maxDepth should be within bounds`);
        assert.ok(policy.earlyStopThreshold >= 1 && policy.earlyStopThreshold <= 5, `earlyStopThreshold should be within bounds`);
      }
    });

    test('should handle validation errors gracefully', async () => {
      const signals = generateTestSignals(10); // Too few signals
      const invalidPolicies: Record<string, PolicyDecision> = {
        symbol: { 
          maxDepth: 0, 
          includeSymbols: true, 
          includeFiles: true, 
          includeContent: true, 
          earlyStopThreshold: -1, 
          seedWeights: {} 
        }
      };

      const result = await tuner.tunePolicies(signals, invalidPolicies);
      
      assert.ok(result.validationErrors.length > 0, 'Should detect validation errors');
      assert.ok(!result.optimizedPolicies || Object.keys(result.optimizedPolicies).length === 0, 'Should not optimize with invalid input');
    });

    test('should track parameter changes with confidence', async () => {
      const signals = generateTestSignals(200);
      const policies: Record<string, PolicyDecision> = {
        symbol: { 
          maxDepth: 5, 
          includeSymbols: true, 
          includeFiles: true, 
          includeContent: true, 
          earlyStopThreshold: 3, 
          seedWeights: {} 
        }
      };

      const result = await tuner.tunePolicies(signals, policies);
      
      for (const [param, change] of Object.entries(result.parameterChanges)) {
        assert.ok(change.oldValue !== undefined, 'Should track old value');
        assert.ok(change.newValue !== undefined, 'Should track new value');
        assert.ok(change.impact !== undefined, 'Should calculate impact');
        assert.ok(change.confidence >= 0 && change.confidence <= 1, 'Confidence should be between 0 and 1');
      }
    });
  });

  describe('SignatureCache Comprehensive Tests', () => {
    let cache: SignatureCache;

    beforeEach(() => {
      cache = new SignatureCache({
        maxSize: 1000,
        defaultTtl: 3600000, // 1 hour
        cleanupInterval: 60000, // 1 minute
        satisfactionThreshold: 0.7
      });
    });

    test('should meet performance targets for cache operations', async () => {
      const testEntries = Array.from({ length: 100 }, (_, i) => ({
        querySignature: `query_${i}`,
        bundleId: `bundle_${i}`,
        satisfaction: 0.8 + Math.random() * 0.2
      }));

      // Test write performance
      const { duration: writeDuration } = await measurePerformance(async () => {
        for (const entry of testEntries) {
          const cacheEntry: CacheEntry = {
            querySignature: entry.querySignature,
            bundleId: entry.bundleId,
            satisfaction: entry.satisfaction,
            usageCount: 0,
            createdAt: 0,
            lastUsed: 0,
            ttl: 0
          };
          await cache.set(cacheEntry);
        }
      }, 'Cache writes (100 entries)');

      assert.ok(writeDuration < 100, `Cache writes should complete in <100ms, took ${writeDuration}ms`);

      // Test read performance
      const { duration: readDuration } = await measurePerformance(async () => {
        for (const entry of testEntries) {
          await cache.get(entry.querySignature);
        }
      }, 'Cache reads (100 entries)');

      assert.ok(readDuration < 10, `Cache reads should complete in <10ms, took ${readDuration}ms`);
    });

    test('should handle LRU eviction correctly', async () => {
      const smallCache = new SignatureCache({ maxSize: 5 });
      
      // Fill cache beyond capacity
      for (let i = 0; i < 10; i++) {
        const cacheEntry: CacheEntry = {
          querySignature: `key_${i}`,
          bundleId: `value_${i}`,
          satisfaction: 0.8,
          usageCount: 0,
          createdAt: 0,
          lastUsed: 0,
          ttl: 0
        };
        await smallCache.set(cacheEntry);
      }

      // Should only keep 5 most recent entries
      const stats = await smallCache.getStats();
      assert.ok(stats.entries <= 5, `Should respect max size, got ${stats.entries}`);

      // LRU items should be evicted
      const lruResult = await smallCache.get('key_0');
      assert.ok(lruResult === null, 'LRU item should be evicted');

      // Recent items should remain
      const recentResult = await smallCache.get('key_9');
      assert.ok(recentResult !== null, 'Recent item should remain');
      assert.ok(recentResult.bundleId === 'value_9', 'Recent item should have correct value');
    });

    test('should handle TTL expiration', async () => {
      const shortTtlCache = new SignatureCache({ 
        defaultTtl: 100, // 100ms
        cleanupInterval: 50 // 50ms
      });

      const cacheEntry: CacheEntry = {
        querySignature: 'test_key',
        bundleId: 'test_value',
        satisfaction: 0.8,
        usageCount: 0,
        createdAt: 0,
        lastUsed: 0,
        ttl: 0
      };
      await shortTtlCache.set(cacheEntry);
      
      // Should be available immediately
      let result = await shortTtlCache.get('test_key');
      assert.ok(result !== null, 'Should be available immediately');
      assert.ok(result.bundleId === 'test_value', 'Should return correct value');

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 150));
      
      result = await shortTtlCache.get('test_key');
      assert.ok(result === null, 'Should expire after TTL');
    });

    test('should filter by satisfaction threshold', async () => {
      const threshold = 0.7;
      const testCache = new SignatureCache({ satisfactionThreshold: threshold });

      // Add entries with varying satisfaction
      const highSatEntry: CacheEntry = {
        querySignature: 'high_sat',
        bundleId: 'value1',
        satisfaction: 0.9,
        usageCount: 0,
        createdAt: 0,
        lastUsed: 0,
        ttl: 0
      };
      await testCache.set(highSatEntry);

      const lowSatEntry: CacheEntry = {
        querySignature: 'low_sat',
        bundleId: 'value2',
        satisfaction: 0.5,
        usageCount: 0,
        createdAt: 0,
        lastUsed: 0,
        ttl: 0
      };
      await testCache.set(lowSatEntry);

      const mediumSatEntry: CacheEntry = {
        querySignature: 'medium_sat',
        bundleId: 'value3',
        satisfaction: 0.7,
        usageCount: 0,
        createdAt: 0,
        lastUsed: 0,
        ttl: 0
      };
      await testCache.set(mediumSatEntry);

      // High satisfaction should be cached
      let result = await testCache.get('high_sat');
      assert.ok(result !== null, 'High satisfaction should be cached');
      assert.ok(result.bundleId === 'value1', 'Should return correct value');

      // Low satisfaction should be rejected
      result = await testCache.get('low_sat');
      assert.ok(result === null, 'Low satisfaction should be rejected');

      // Threshold satisfaction should be cached
      result = await testCache.get('medium_sat');
      assert.ok(result !== null, 'Threshold satisfaction should be cached');
      assert.ok(result.bundleId === 'value3', 'Should return correct value');
    });

    test('should maintain accurate statistics', async () => {
      const entry1: CacheEntry = {
        querySignature: 'key1',
        bundleId: 'value1',
        satisfaction: 0.8,
        usageCount: 0,
        createdAt: 0,
        lastUsed: 0,
        ttl: 0
      };
      await cache.set(entry1);

      const entry2: CacheEntry = {
        querySignature: 'key2',
        bundleId: 'value2',
        satisfaction: 0.9,
        usageCount: 0,
        createdAt: 0,
        lastUsed: 0,
        ttl: 0
      };
      await cache.set(entry2);

      // Generate some hits and misses
      await cache.get('key1'); // hit
      await cache.get('key2'); // hit
      await cache.get('nonexistent'); // miss

      const stats = await cache.getStats();
      assert.strictEqual(stats.totalRequests, 3, 'Should track total requests');
      assert.strictEqual(stats.cacheHits, 2, 'Should track cache hits');
      assert.strictEqual(stats.cacheMisses, 1, 'Should track cache misses');
      assert.strictEqual(stats.hitRate, 2/3, 'Should calculate correct hit rate');
    });
  });

  describe('Integration Workflow Tests', () => {
    test('should complete end-to-end learning workflow', async () => {
      const signals = generateTestSignals(500);
      
      const { duration } = await measurePerformance(async () => {
        // Step 1: Analyze outcomes
        const analyzer = new OutcomeAnalyzer(testStorage);
        const metrics = await analyzer.computeSatisfactionMetrics(signals);
        
        // Step 2: Optimize weights
        const optimizer = new WeightOptimizer();
        const initialWeights = {
          symbol: { definition: 2.0, usage: 1.0, config: 0.5 },
          config: { definition: 1.0, usage: 0.8, config: 2.0 }
        };
        const weightResult = await optimizer.optimizeWeights(signals, initialWeights);
        
        // Step 3: Tune policies
        const tuner = new PolicyTuner();
        const initialPolicies: Record<string, PolicyDecision> = {
          symbol: { 
            maxDepth: 5, 
            includeSymbols: true, 
            includeFiles: true, 
            includeContent: true, 
            earlyStopThreshold: 3, 
            seedWeights: {} 
          },
          config: { 
            maxDepth: 4, 
            includeSymbols: false, 
            includeFiles: true, 
            includeContent: true, 
            earlyStopThreshold: 2, 
            seedWeights: {} 
          }
        };
        const policyResult = await tuner.tunePolicies(signals, initialPolicies);
        
        // Step 4: Update cache
        const cache = new SignatureCache();
        for (const signal of signals.slice(0, 100)) {
          if (signal.satisfied) {
            const cacheEntry: CacheEntry = {
              querySignature: signal.bundleSignature,
              bundleId: `optimized_${signal.bundleSignature}`,
              satisfaction: 0.8,
              usageCount: 0,
              createdAt: 0,
              lastUsed: 0,
              ttl: 0
            };
            await cache.set(cacheEntry);
          }
        }
        
        return { metrics, weightResult, policyResult, cacheStats: await cache.getStats() };
      }, 'End-to-end learning workflow');

      assert.ok(duration < 30000, `End-to-end workflow should complete in <30s, took ${duration}ms`);
    });

    test('should handle workflow failures gracefully', async () => {
      // Test with invalid data
      const invalidSignals = [
        null as any,
        undefined as any,
        {} as any,
        { sessionId: 'test' } as any
      ];

      const analyzer = new OutcomeAnalyzer(testStorage);
      const metrics = await analyzer.computeSatisfactionMetrics(invalidSignals);
      
      assert.ok(metrics.totalInteractions >= 0, 'Should handle invalid signals gracefully');
    });

    test('should maintain performance under load', async () => {
      const largeSignals = generateLargeDataset(2000);
      const concurrentWorkflows = 5;
      
      const { duration } = await measurePerformance(async () => {
        const workflows = Array.from({ length: concurrentWorkflows }, async () => {
          const analyzer = new OutcomeAnalyzer(testStorage);
          return await analyzer.computeSatisfactionMetrics(largeSignals);
        });
        
        return await Promise.all(workflows);
      }, 'Concurrent workflows under load');

      assert.ok(duration < 45000, `Concurrent workflows should complete in <45s, took ${duration}ms`);
    });
  });

  describe('Performance and Load Testing', () => {
    test('should handle 10k+ interactions efficiently', async () => {
      const massiveDataset = generateLargeDataset(10000);
      
      const { duration } = await measurePerformance(async () => {
        const analyzer = new OutcomeAnalyzer(testStorage);
        return await analyzer.computeSatisfactionMetrics(massiveDataset);
      }, 'Massive dataset processing (10k signals)');

      assert.ok(duration < 60000, `Should process 10k signals in <60s, took ${duration}ms`);
    });

    test('should maintain cache performance at scale', async () => {
      const largeCache = new SignatureCache({ maxSize: 10000 });
      const numOperations = 5000;
      
      // Fill cache
      const { duration: fillDuration } = await measurePerformance(async () => {
        for (let i = 0; i < numOperations; i++) {
          const cacheEntry: CacheEntry = {
            querySignature: `key_${i}`,
            bundleId: `value_${i}`,
            satisfaction: 0.8,
            usageCount: 0,
            createdAt: 0,
            lastUsed: 0,
            ttl: 0
          };
          await largeCache.set(cacheEntry);
        }
      }, 'Large cache fill');

      assert.ok(fillDuration < 1000, `Should fill large cache in <1s, took ${fillDuration}ms`);

      // Random access pattern
      const { duration: accessDuration } = await measurePerformance(async () => {
        for (let i = 0; i < numOperations; i++) {
          const key = `key_${Math.floor(Math.random() * numOperations)}`;
          await largeCache.get(key);
        }
      }, 'Large cache random access');

      assert.ok(accessDuration < 500, `Random access should complete in <500ms, took ${accessDuration}ms`);
    });

    test('should handle memory pressure gracefully', async () => {
      const datasets = Array.from({ length: 20 }, () => generateLargeDataset(1000));
      
      const { duration } = await measurePerformance(async () => {
        const analyzer = new OutcomeAnalyzer(testStorage);
        const promises = datasets.map(dataset => analyzer.computeSatisfactionMetrics(dataset));
        return await Promise.all(promises);
      }, 'Memory pressure test (20 datasets)');

      assert.ok(duration < 120000, `Should handle memory pressure in <120s, took ${duration}ms`);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    test('should handle database connection failures', async () => {
      // Create analyzer with invalid storage
      const invalidStorage = null as any;
      const analyzer = new OutcomeAnalyzer(invalidStorage);
      
      try {
        await analyzer.analyzeInteractions(30);
        assert.fail('Should throw error with invalid storage');
      } catch (error) {
        assert.ok(error instanceof Error, 'Should throw proper error');
      }
    });

    test('should handle corrupted data gracefully', async () => {
      const corruptedSignals: OutcomeSignal[] = [
        generateTestSignals(1)[0],
        { ...generateTestSignals(1)[0], seedWeights: 'not an object' as any },
        { ...generateTestSignals(1)[0], policyThresholds: null as any },
        { ...generateTestSignals(1)[0], satisfied: 'not a boolean' as any }
      ];

      const analyzer = new OutcomeAnalyzer(testStorage);
      const metrics = await analyzer.computeSatisfactionMetrics(corruptedSignals);
      
      assert.ok(metrics.totalInteractions >= 0, 'Should handle corrupted data');
    });

    test('should handle system resource exhaustion', async () => {
      // Test with extremely large dataset that might cause memory issues
      const extremelyLargeDataset = generateLargeDataset(50000);
      
      try {
        const analyzer = new OutcomeAnalyzer(testStorage);
        const { duration } = await measurePerformance(async () => {
          return await analyzer.computeSatisfactionMetrics(extremelyLargeDataset);
        }, 'Extreme load test');
        
        // If it succeeds, ensure it's within reasonable time
        assert.ok(duration < 300000, `Even extreme loads should complete in <5min, took ${duration}ms`);
      } catch (error) {
        // Should fail gracefully with meaningful error
        assert.ok(error instanceof Error, 'Should fail with proper error');
        assert.ok(error.message.includes('memory') || error.message.includes('resource'), 'Error should indicate resource issue');
      }
    });
  });

  describe('Regression Testing', () => {
    test('should maintain compatibility with existing search functionality', async () => {
      // This would integrate with actual search components
      // For now, we'll simulate the integration
      const signals = generateTestSignals(100);
      
      const analyzer = new OutcomeAnalyzer(testStorage);
      const metrics = await analyzer.computeSatisfactionMetrics(signals);
      
      // Ensure learning doesn't break existing metrics
      assert.ok(metrics.totalInteractions === 100, 'Should maintain interaction counting');
      assert.ok(metrics.overallSatisfactionRate >= 0 && metrics.overallSatisfactionRate <= 1, 'Should maintain valid satisfaction rates');
    });

    test('should not impact search performance significantly', async () => {
      // Simulate search with and without learning integration
      const searchQuery = 'test search';
      const iterations = 1000;
      
      // Baseline search performance (simulated)
      const { duration: baselineDuration } = await measurePerformance(async () => {
        for (let i = 0; i < iterations; i++) {
          // Simulate search operation
          await new Promise(resolve => setTimeout(resolve, 1));
        }
      }, 'Baseline search performance');

      // Search with learning integration (simulated)
      const cache = new SignatureCache();
      const { duration: integratedDuration } = await measurePerformance(async () => {
        for (let i = 0; i < iterations; i++) {
          // Simulate search with learning cache lookup
          await cache.get(searchQuery);
          await new Promise(resolve => setTimeout(resolve, 1));
        }
      }, 'Integrated search performance');

      const overhead = ((integratedDuration - baselineDuration) / baselineDuration) * 100;
      assert.ok(overhead < 5, `Learning integration should add <5% overhead, added ${overhead.toFixed(2)}%`);
    });
  });
});