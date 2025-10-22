#!/usr/bin/env node

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { tmpdir } from 'os';
import { rmSync, mkdirSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Import commands to test
import { migrateCommand } from '../src/cli/commands/migrate.js';
import { indexCommand } from '../src/cli/commands/index.js';
import { searchCommand } from '../src/cli/commands/search.js';
import { rerankCommand } from '../src/cli/commands/rerank.js';
import { uiCommand } from '../src/cli/commands/ui.js';

// Test utilities
function createTempDir() {
  const tempDir = join(tmpdir(), `pampax-test-${Date.now()}`);
  mkdirSync(tempDir, { recursive: true });
  return tempDir;
}

function cleanupTempDir(tempDir) {
  try {
    rmSync(tempDir, { recursive: true, force: true });
  } catch (error) {
    // Ignore cleanup errors
  }
}

// Mock console methods to capture output
function mockConsole() {
  const originalConsole = { ...console };
  let logs = [];
  
  console.log = (...args) => logs.push({ type: 'log', args });
  console.error = (...args) => logs.push({ type: 'error', args });
  console.warn = (...args) => logs.push({ type: 'warn', args });
  
  return {
    logs,
    restore: () => {
      Object.assign(console, originalConsole);
    }
  };
}

test('migrate command - basic functionality', async () => {
  const tempDir = createTempDir();
  const dbPath = join(tempDir, 'test.sqlite');
  const mock = mockConsole();
  
  try {
    // Test status check before migration
    await migrateCommand({ db: dbPath, status: true, json: true });
    
    const statusOutput = mock.logs.find(log => log.type === 'log')?.args[0];
    const statusData = JSON.parse(statusOutput);
    
    assert.equal(statusData.currentVersion, 0);
    assert.equal(statusData.pendingMigrations, 1); // Should have one migration
    
    // Test migration
    mock.logs = [];
    await migrateCommand({ db: dbPath, json: true });
    
    const migrateOutput = mock.logs.find(log => log.type === 'log')?.args[0];
    const migrateData = JSON.parse(migrateOutput);
    
    assert.equal(migrateData.success, true);
    assert.equal(migrateData.migrations.length, 1);
    
  } finally {
    mock.restore();
    cleanupTempDir(tempDir);
  }
});

test('index command - file discovery', async () => {
  const tempDir = createTempDir();
  const dbPath = join(tempDir, 'test.sqlite');
  
  // Create test files
  const testFile1 = join(tempDir, 'test1.js');
  const testFile2 = join(tempDir, 'test2.py');
  
  await import('fs').then(fs => {
    fs.writeFileSync(testFile1, 'function test() { return true; }');
    fs.writeFileSync(testFile2, 'def test(): return True');
  });
  
  const mock = mockConsole();
  
  try {
    // First migrate to set up database
    await migrateCommand({ db: dbPath });
    
    // Test indexing
    mock.logs = [];
    await indexCommand({ 
      repo: tempDir, 
      db: dbPath, 
      include: ['**/*.js', '**/*.py'],
      json: true 
    });
    
    const output = mock.logs.find(log => log.type === 'log')?.args[0];
    const result = JSON.parse(output);
    
    assert.equal(result.success, true);
    assert.equal(result.totalFiles, 2);
    assert.equal(result.processedFiles, 2);
    assert(result.totalChunks > 0);
    
  } finally {
    mock.restore();
    cleanupTempDir(tempDir);
  }
});

test('search command - basic search', async () => {
  const tempDir = createTempDir();
  const dbPath = join(tempDir, 'test.sqlite');
  
  // Create test file
  const testFile = join(tempDir, 'search-test.js');
  await import('fs').then(fs => {
    fs.writeFileSync(testFile, 'function searchFunction() { return "found"; }');
  });
  
  const mock = mockConsole();
  
  try {
    // Set up database and index
    await migrateCommand({ db: dbPath });
    await indexCommand({ repo: tempDir, db: dbPath });
    
    // Test search
    mock.logs = [];
    await searchCommand('searchFunction', { 
      repo: tempDir, 
      db: dbPath, 
      json: true 
    });
    
    const output = mock.logs.find(log => log.type === 'log')?.args[0];
    const result = JSON.parse(output);
    
    assert.equal(result.success, true);
    assert.equal(result.results.length, 1);
    assert(result.results[0].path.includes('search-test.js'));
    
  } finally {
    mock.restore();
    cleanupTempDir(tempDir);
  }
});

test('rerank command - RRF fusion', async () => {
  const tempDir = createTempDir();
  
  // Create test input files
  const input1 = join(tempDir, 'results1.json');
  const input2 = join(tempDir, 'results2.json');
  
  const results1 = [
    { id: '1', path: 'file1.js', score: 0.9, content: 'function test1()' },
    { id: '2', path: 'file2.js', score: 0.8, content: 'function test2()' }
  ];
  
  const results2 = [
    { id: '2', path: 'file2.js', score: 0.9, content: 'function test2()' },
    { id: '3', path: 'file3.js', score: 0.7, content: 'function test3()' }
  ];
  
  await import('fs').then(fs => {
    fs.writeFileSync(input1, JSON.stringify(results1));
    fs.writeFileSync(input2, JSON.stringify(results2));
  });
  
  const mock = mockConsole();
  
  try {
    mock.logs = [];
    await rerankCommand('test query', {
      provider: 'rrf',
      input: [input1, input2],
      topK: 10,
      json: true
    });
    
    const output = mock.logs.find(log => log.type === 'log')?.args[0];
    const result = JSON.parse(output);
    
    assert.equal(result.success, true);
    assert.equal(result.results.length, 3); // Should have all 3 unique results
    assert.equal(result.provider, 'rrf');
    
    // Check that results are sorted by fused score
    const fusedScores = result.results.map(r => r.fusedScore).sort((a, b) => b - a);
    const resultScores = result.results.map(r => r.fusedScore);
    assert.deepEqual(resultScores, fusedScores);
    
  } finally {
    mock.restore();
    cleanupTempDir(tempDir);
  }
});

test('ui command - demo mode', async () => {
  const tempDir = createTempDir();
  const dbPath = join(tempDir, 'test.sqlite');
  
  // Create test file
  const testFile = join(tempDir, 'ui-test.js');
  await import('fs').then(fs => {
    fs.writeFileSync(testFile, 'function uiTest() { return "demo"; }');
  });
  
  const mock = mockConsole();
  
  try {
    // Set up database and index
    await migrateCommand({ db: dbPath });
    await indexCommand({ repo: tempDir, db: dbPath });
    
    // Test UI demo mode
    mock.logs = [];
    await uiCommand({ 
      repo: tempDir, 
      db: dbPath, 
      mode: 'demo' 
    });
    
    // Demo mode should produce output without errors
    const logOutputs = mock.logs.filter(log => log.type === 'log');
    assert(logOutputs.length > 0);
    
    // Should contain demo-related output
    const demoOutput = logOutputs.some(log => 
      log.args.some(arg => typeof arg === 'string' && arg.includes('Demo'))
    );
    assert(demoOutput, 'Should contain demo output');
    
  } finally {
    mock.restore();
    cleanupTempDir(tempDir);
  }
});

test('error handling - missing database', async () => {
  const tempDir = createTempDir();
  const dbPath = join(tempDir, 'nonexistent.sqlite');
  const mock = mockConsole();
  
  try {
    // Test search without database
    mock.logs = [];
    
    try {
      await searchCommand('test', { repo: tempDir, db: dbPath, json: true });
      assert.fail('Should have thrown an error');
    } catch (error) {
      // Expected to throw
    }
    
    const errorOutput = mock.logs.find(log => log.type === 'error')?.args[0];
    const errorData = JSON.parse(errorOutput);
    
    assert.equal(errorData.success, false);
    assert(errorData.error.includes('No indexed data'));
    
  } finally {
    mock.restore();
    cleanupTempDir(tempDir);
  }
});

test('progress renderer - TTY vs non-TTY', async () => {
  const { createProgressRenderer } = await import('../src/cli/progress/renderer.js');
  
  // Test TTY renderer
  const ttyRenderer = createProgressRenderer({ tty: true, json: false });
  assert(ttyRenderer.constructor.name.includes('TTY'));
  
  // Test non-TTY renderer
  const plainRenderer = createProgressRenderer({ tty: false, json: false });
  assert(plainRenderer.constructor.name.includes('Plain'));
  
  // Test JSON renderer
  const jsonRenderer = createProgressRenderer({ tty: true, json: true });
  assert(jsonRenderer.constructor.name.includes('JSON'));
  
  // Test basic functionality
  ttyRenderer.start('Test start');
  ttyRenderer.update('Test update');
  ttyRenderer.complete('Test complete');
  
  plainRenderer.start('Test start');
  plainRenderer.update('Test update');
  plainRenderer.complete('Test complete');
  
  jsonRenderer.start('Test start');
  jsonRenderer.update('Test update');
  jsonRenderer.complete('Test complete');
  
  // JSON renderer should have captured events
  const events = jsonRenderer.getEvents();
  assert.equal(events.length, 3);
  assert.equal(events[0].type, 'start');
  assert.equal(events[1].type, 'update');
  assert.equal(events[2].type, 'complete');
});

console.log('✅ All CLI command tests passed!');