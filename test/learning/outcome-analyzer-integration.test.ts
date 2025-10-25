import { test, describe } from 'node:test';
import assert from 'node:assert';
import { OutcomeAnalyzer } from '../../src/learning/outcome-analyzer.js';
import { DatabaseManager } from '../../src/storage/database-async.js';
import { MemoryOperations } from '../../src/storage/memory-operations.js';

describe('OutcomeAnalyzer Integration', () => {
  test('should integrate with existing storage system', async () => {
    // Create database manager and memory operations
    const dbManager = new DatabaseManager({ path: ':memory:' });
    await dbManager.initialize();
    
    // Create the required tables
    const db = dbManager.getDatabase();
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
    
    const memoryOps = new MemoryOperations(db);
    
    // Create outcome analyzer with memory operations
    const analyzer = new OutcomeAnalyzer(memoryOps);
    
    // Create a session and interactions
    const sessionId = await memoryOps.createSession({
      tool: 'test-cli',
      user: 'test-user',
      repo: '/test/repo',
      branch: 'main'
    });
    
    // Create some test interactions
    await memoryOps.createInteraction({
      session_id: sessionId,
      query: 'find main function',
      bundle_id: 'test-bundle-1',
      satisfied: 1,
      notes: JSON.stringify({
        intent: 'symbol',
        confidence: 0.8,
        time_to_fix_ms: 1200,
        top_click_id: 'item-1',
        total_tokens: 450
      })
    });
    
    await memoryOps.createInteraction({
      session_id: sessionId,
      query: 'configure database',
      bundle_id: 'test-bundle-2',
      satisfied: 0,
      notes: JSON.stringify({
        intent: 'config',
        confidence: 0.7,
        time_to_fix_ms: 3500,
        total_tokens: 680
      })
    });
    
    // Analyze interactions
    const signals = await analyzer.analyzeInteractions(30);
    
    assert.ok(signals.length >= 2, 'Should extract signals from created interactions');
    
    // Check first signal
    const symbolSignal = signals.find(s => s.intent === 'symbol');
    assert.ok(symbolSignal, 'Should have symbol intent signal');
    assert.strictEqual(symbolSignal.satisfied, true, 'Symbol interaction should be satisfied');
    assert.strictEqual(symbolSignal.timeToFix, 1200, 'Should extract time to fix');
    assert.strictEqual(symbolSignal.tokenUsage, 450, 'Should extract token usage');
    assert.ok(symbolSignal.seedWeights, 'Should have seed weights from policy gate');
    
    // Check second signal
    const configSignal = signals.find(s => s.intent === 'config');
    assert.ok(configSignal, 'Should have config intent signal');
    assert.strictEqual(configSignal.satisfied, false, 'Config interaction should be unsatisfied');
    assert.strictEqual(configSignal.timeToFix, 3500, 'Should extract time to fix');
    assert.strictEqual(configSignal.tokenUsage, 680, 'Should extract token usage');
    
    // Compute metrics
    const metrics = await analyzer.computeSatisfactionMetrics(signals);
    
    assert.strictEqual(metrics.totalInteractions, signals.length, 'Should count all interactions');
    assert.strictEqual(metrics.satisfiedInteractions, 1, 'Should count satisfied interactions');
    assert.strictEqual(metrics.unsatisfiedInteractions, 1, 'Should count unsatisfied interactions');
    assert.strictEqual(metrics.overallSatisfactionRate, 0.5, 'Should calculate correct satisfaction rate');
    
    assert.ok(metrics.byIntent.symbol, 'Should have symbol intent metrics');
    assert.ok(metrics.byIntent.config, 'Should have config intent metrics');
    
    await dbManager.close();
  });
  
  test('should handle real bundle signature generation', async () => {
    const dbManager = new DatabaseManager({ path: ':memory:' });
    await dbManager.initialize();
    const memoryOps = new MemoryOperations(dbManager.getDatabase());
    
    const analyzer = new OutcomeAnalyzer(memoryOps);
    
    // Test with realistic bundle structure
    const bundle = {
      sources: [
        {
          type: 'code',
          items: [
            { path: 'src/main.ts', score: 0.95, kind: 'function' },
            { path: 'src/utils.ts', score: 0.87, kind: 'function' }
          ]
        },
        {
          type: 'memory',
          items: [
            { id: 'mem1', kind: 'definition', score: 0.9 }
          ]
        }
      ],
      intent: {
        intent: 'symbol' as any,
        confidence: 0.85,
        entities: [],
        suggestedPolicies: []
      },
      total_tokens: 1250,
      budget_used: 0.42
    };
    
    const signature = analyzer.generateBundleSignature(bundle);
    
    assert.ok(signature.startsWith('b_'), 'Signature should have prefix');
    assert.strictEqual(signature.length, 18, 'Signature should be consistent length');
    
    // Same bundle should generate same signature
    const signature2 = analyzer.generateBundleSignature(bundle);
    assert.strictEqual(signature, signature2, 'Same bundle should generate same signature');
    
    // Different bundle should generate different signature
    const differentBundle = { ...bundle, total_tokens: 2000 };
    const differentSignature = analyzer.generateBundleSignature(differentBundle);
    assert.notStrictEqual(signature, differentSignature, 'Different bundle should generate different signature');
    
    await dbManager.close();
  });
});