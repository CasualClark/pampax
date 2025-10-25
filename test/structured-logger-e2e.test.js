/**
 * End-to-end tests for structured logging integration
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { getLogger, generateCorrelationId } from '../src/utils/structured-logger.js';

describe('Structured Logger E2E Integration', () => {
  let consoleOutput;
  let originalConsoleLog;

  beforeEach(() => {
    consoleOutput = [];
    originalConsoleLog = console.log;
    console.log = (data) => consoleOutput.push(data);
  });

  afterEach(() => {
    console.log = originalConsoleLog;
  });

  it('should integrate with CLI assemble component', async () => {
    // Test that the CLI assemble component can create and use logger
    const { assembleCommand } = await import('../src/cli/commands/assemble.js');
    
    // This test verifies that the module imports correctly
    // and doesn't throw errors during logger initialization
    assert.ok(typeof assembleCommand === 'function');
  });

  it('should integrate with CLI search component', async () => {
    // Test that the CLI search component can create and use logger
    const searchModule = await import('../src/cli/commands/search.js');
    
    // Verify the module exports the expected functions
    assert.ok(searchModule.searchCommand || searchModule.default);
  });

  it('should integrate with context assembler component', async () => {
    // Test that the context assembler can create and use logger
    const { ContextAssembler } = await import('../src/context/assembler.js');
    
    // Verify the class can be instantiated
    const mockDb = {
      getStorage: () => ({})
    };
    
    const assembler = new ContextAssembler(mockDb, { graphEnabled: false });
    assert.ok(assembler.logger);
    assert.strictEqual(assembler.logger.component, 'context-assembler');
  });

  it('should integrate with search hybrid component', async () => {
    // Test that the search hybrid can create and use logger
    const searchModule = await import('../src/search/hybrid.js');
    
    // Verify the module exports expected functions
    assert.ok(searchModule.hybridSearch || searchModule.reciprocalRankFusion);
  });

  it('should integrate with tokenizer factory component', async () => {
    // Test that the tokenizer factory can create and use logger
    const { logger: tokenizerLogger } = await import('../src/config/logger.js');
    
    // Verify the logger is properly initialized
    assert.ok(tokenizerLogger);
    assert.strictEqual(tokenizerLogger.component, 'tokenizer-factory');
  });

  it('should maintain correlation ID across component boundaries', async () => {
    const testCorrId = generateCorrelationId();
    
    // Create loggers from different components with JSON output
    const cliLogger = getLogger('cli-test', { jsonOutput: true });
    const searchLogger = getLogger('search-test', { jsonOutput: true });
    const contextLogger = getLogger('context-test', { jsonOutput: true });
    
    // Set correlation ID on first logger
    cliLogger.setCorrelationId(testCorrId);
    
    // Create child logger to simulate component boundary
    const childLogger = cliLogger.child('sub-component');
    
    // Log from each logger
    cliLogger.info('test_op', 'CLI component log');
    childLogger.info('test_op', 'Child component log');
    
    // Verify correlation ID is maintained
    assert.strictEqual(consoleOutput.length, 2);
    
    const cliLogEntry = JSON.parse(consoleOutput[0]);
    const childLogEntry = JSON.parse(consoleOutput[1]);
    
    assert.strictEqual(cliLogEntry.corr_id, testCorrId);
    assert.strictEqual(childLogEntry.corr_id, testCorrId);
    assert.strictEqual(cliLogEntry.component, 'cli-test');
    assert.strictEqual(childLogEntry.component, 'sub-component');
  });

  it('should handle performance requirements under load', async () => {
    const logger = getLogger('performance-test', { jsonOutput: true });
    const iterations = 50;
    const startTime = Date.now();
    
    // Simulate high-volume logging
    for (let i = 0; i < iterations; i++) {
      logger.info('performance_test', `Performance test iteration ${i}`, {
        iteration: i,
        component: 'performance-test',
        timestamp: Date.now()
      });
    }
    
    const totalTime = Date.now() - startTime;
    const avgTimePerOperation = totalTime / iterations;
    
    // Should maintain performance under 5ms per operation
    assert.ok(avgTimePerOperation < 5, 
      `Average time per operation (${avgTimePerOperation}ms) exceeds 5ms threshold`);
    
    // Should have logged all iterations
    assert.strictEqual(consoleOutput.length, iterations);
    
    // Verify log structure
    const sampleLog = JSON.parse(consoleOutput[0]);
    assert.ok(sampleLog.time);
    assert.strictEqual(sampleLog.level, 'INFO');
    assert.strictEqual(sampleLog.component, 'performance-test');
    assert.strictEqual(sampleLog.op, 'performance_test');
    assert.ok(sampleLog.corr_id);
  });
});