import { test, describe } from 'node:test';
import assert from 'node:assert';
import { OutcomeAnalyzer, type OutcomeSignal } from '../../src/learning/outcome-analyzer.js';
import { MemoryOperations } from '../../src/storage/memory-operations.js';
import { DatabaseManager } from '../../src/storage/database-async.js';
import sqlite3 from 'sqlite3';

describe('OutcomeAnalyzer', () => {
  let db: sqlite3.Database;
  let memoryOps: MemoryOperations;
  let analyzer: OutcomeAnalyzer;

  test('should extract signals from interaction data', async () => {
    // Setup test database with sample interactions
    const storage = await createTestStorage();
    await setupSampleInteractions(storage);
    
    analyzer = new OutcomeAnalyzer(storage);
    const signals = await analyzer.analyzeInteractions(30);
    
    assert.ok(signals.length > 0, 'Should extract signals from interactions');
    
    const firstSignal = signals[0];
    assert.ok(firstSignal.sessionId, 'Should have session ID');
    assert.ok(firstSignal.query, 'Should have query');
    assert.ok(firstSignal.intent, 'Should have intent');
    assert.ok(firstSignal.bundleSignature, 'Should have bundle signature');
    assert(typeof firstSignal.satisfied === 'boolean', 'Should have satisfaction boolean');
    assert.ok(firstSignal.tokenUsage >= 0, 'Should have token usage');
    assert.ok(firstSignal.seedWeights, 'Should have seed weights');
    assert.ok(firstSignal.policyThresholds, 'Should have policy thresholds');
  });

  test('should generate consistent bundle signatures', async () => {
    const storage = await createTestStorage();
    analyzer = new OutcomeAnalyzer(storage);
    
    const bundle1 = {
      sources: [
        { type: 'code', items: [{ path: 'src/main.ts', score: 0.9 }] },
        { type: 'memory', items: [{ id: 'mem1', kind: 'definition' }] }
      ],
      intent: { intent: 'symbol' as any, confidence: 0.8, entities: [], suggestedPolicies: [] }
    };
    
    const bundle2 = {
      sources: [
        { type: 'code', items: [{ path: 'src/main.ts', score: 0.9 }] },
        { type: 'memory', items: [{ id: 'mem1', kind: 'definition' }] }
      ],
      intent: { intent: 'symbol' as any, confidence: 0.8, entities: [], suggestedPolicies: [] }
    };
    
    const sig1 = analyzer.generateBundleSignature(bundle1);
    const sig2 = analyzer.generateBundleSignature(bundle2);
    
    assert.strictEqual(sig1, sig2, 'Same bundles should generate same signature');
    assert.ok(sig1.length > 0, 'Signature should not be empty');
  });

  test('should compute satisfaction metrics', async () => {
    const storage = await createTestStorage();
    analyzer = new OutcomeAnalyzer(storage);
    
    const signals: OutcomeSignal[] = [
      {
        sessionId: 's1',
        query: 'test query 1',
        intent: 'symbol',
        bundleSignature: 'sig1',
        satisfied: true,
        timeToFix: 1000,
        tokenUsage: 500,
        seedWeights: { definition: 2.0 },
        policyThresholds: { earlyStop: 3 }
      },
      {
        sessionId: 's2',
        query: 'test query 2',
        intent: 'symbol',
        bundleSignature: 'sig1',
        satisfied: false,
        timeToFix: 5000,
        tokenUsage: 800,
        seedWeights: { definition: 2.0 },
        policyThresholds: { earlyStop: 3 }
      },
      {
        sessionId: 's3',
        query: 'test query 3',
        intent: 'config',
        bundleSignature: 'sig2',
        satisfied: true,
        timeToFix: 800,
        tokenUsage: 300,
        seedWeights: { config: 2.0 },
        policyThresholds: { earlyStop: 2 }
      }
    ];

    const metrics = await analyzer.computeSatisfactionMetrics(signals);
    
    assert.strictEqual(metrics.totalInteractions, 3, 'Should count total interactions');
    assert.strictEqual(metrics.satisfiedInteractions, 2, 'Should count satisfied interactions');
    assert.strictEqual(metrics.unsatisfiedInteractions, 1, 'Should count unsatisfied interactions');
    
    assert.ok(metrics.overallSatisfactionRate > 0.6, 'Should calculate overall satisfaction rate');
    assert.ok(metrics.overallSatisfactionRate < 0.7, 'Should calculate correct satisfaction rate');
    
    assert.ok(metrics.byIntent.symbol, 'Should have symbol intent metrics');
    assert.ok(metrics.byIntent.config, 'Should have config intent metrics');
    assert.strictEqual(metrics.byIntent.symbol.total, 2, 'Symbol intent should have 2 interactions');
    assert.strictEqual(metrics.byIntent.symbol.satisfied, 1, 'Symbol intent should have 1 satisfied');
    assert.strictEqual(metrics.byIntent.config.total, 1, 'Config intent should have 1 interaction');
    assert.strictEqual(metrics.byIntent.config.satisfied, 1, 'Config intent should have 1 satisfied');
  });

  test('should handle edge cases gracefully', async () => {
    const storage = await createTestStorage();
    analyzer = new OutcomeAnalyzer(storage);
    
    // Test with empty interactions
    const emptySignals = await analyzer.analyzeInteractions(30);
    assert.deepStrictEqual(emptySignals, [], 'Should handle empty interactions gracefully');
    
    // Test with malformed data
    const malformedSignals: OutcomeSignal[] = [
      {
        sessionId: '',
        query: '',
        intent: 'search',
        bundleSignature: '',
        satisfied: true,
        tokenUsage: 0,
        seedWeights: {},
        policyThresholds: {}
      }
    ];
    
    const metrics = await analyzer.computeSatisfactionMetrics(malformedSignals);
    assert.strictEqual(metrics.totalInteractions, 1, 'Should handle malformed data');
    assert.strictEqual(metrics.satisfiedInteractions, 1, 'Should count satisfied even with malformed data');
  });

  test('should process 30+ days of data efficiently', async () => {
    // Setup test with interactions spanning 35 days
    const storage = await createTestStorage();
    await setupHistoricalInteractions(storage, 35);
    
    const startTime = Date.now();
    analyzer = new OutcomeAnalyzer(storage);
    const signals = await analyzer.analyzeInteractions(30);
    const processingTime = Date.now() - startTime;
    
    assert.ok(signals.length > 0, 'Should process historical data');
    assert.ok(processingTime < 60000, 'Should process within 1 minute'); // 60 seconds
  });

  test('should extract time-based metrics correctly', async () => {
    const storage = await createTestStorage();
    analyzer = new OutcomeAnalyzer(storage);
    
    const signals: OutcomeSignal[] = [
      {
        sessionId: 's1',
        query: 'fast query',
        intent: 'symbol',
        bundleSignature: 'sig1',
        satisfied: true,
        timeToFix: 500,
        tokenUsage: 200,
        seedWeights: { definition: 2.0 },
        policyThresholds: { earlyStop: 3 }
      },
      {
        sessionId: 's2',
        query: 'slow query',
        intent: 'symbol',
        bundleSignature: 'sig2',
        satisfied: true,
        timeToFix: 3000,
        tokenUsage: 600,
        seedWeights: { definition: 2.0 },
        policyThresholds: { earlyStop: 3 }
      }
    ];

    const metrics = await analyzer.computeSatisfactionMetrics(signals);
    
    assert.ok(metrics.averageTimeToFix !== undefined, 'Should calculate average time to fix');
    assert.ok(metrics.averageTimeToFix > 500, 'Average should be between min and max');
    assert.ok(metrics.averageTimeToFix < 3000, 'Average should be between min and max');
  });
});

// Helper functions for test setup
async function createTestStorage(): Promise<MemoryOperations> {
  const dbManager = new DatabaseManager({ path: ':memory:' });
  await dbManager.initialize();
  const db = dbManager.getDatabase();
  
  // Create the tables we need for testing
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
        notes TEXT
      );
    `, (err: any) => {
      if (err) reject(err);
      else resolve();
    });
  });
  
  return new MemoryOperations(db);
}

async function setupSampleInteractions(storage: MemoryOperations): Promise<void> {
  // Create session
  const sessionId = await storage.createSession({
    tool: 'test',
    user: 'test-user',
    repo: '/test/repo',
    branch: 'main'
  });

  // Create interactions with different outcomes
  await storage.createInteraction({
    session_id: sessionId,
    query: 'find main function',
    bundle_id: 'bundle1',
    satisfied: 1,
    notes: JSON.stringify({ intent: 'symbol', time_to_fix_ms: 1000, top_click_id: 'item1' })
  });

  await storage.createInteraction({
    session_id: sessionId,
    query: 'configure settings',
    bundle_id: 'bundle2',
    satisfied: 0,
    notes: JSON.stringify({ intent: 'config', time_to_fix_ms: 5000, top_click_id: 'item2' })
  });
}

async function setupHistoricalInteractions(storage: MemoryOperations, days: number): Promise<void> {
  const sessionId = await storage.createSession({
    tool: 'test',
    user: 'test-user',
    repo: '/test/repo',
    branch: 'main'
  });

  const now = Date.now();
  const msPerDay = 24 * 60 * 60 * 1000;

  for (let i = 0; i < days; i++) {
    const timestamp = now - (i * msPerDay);
    
    // Insert interaction directly with custom timestamp
    await new Promise<void>((resolve, reject) => {
      const db = (storage as any).db;
      db.run(`
        INSERT INTO interaction (session_id, ts, query, bundle_id, satisfied, notes)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [
        sessionId,
        timestamp,
        `query ${i}`,
        `bundle${i}`,
        i % 2 === 0 ? 1 : 0,
        JSON.stringify({ intent: i % 2 === 0 ? 'symbol' : 'config', time_to_fix_ms: 1000 + i * 100 })
      ], function(err: any) {
        if (err) reject(err);
        else resolve();
      });
    });
  }
}