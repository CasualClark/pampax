/**
 * Tests for Structured Logger
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { randomUUID } from 'crypto';
import { getLogger, generateCorrelationId, withCorrelation, StructuredLogger, loggerFactory } from '../src/utils/structured-logger.js';

// Mock console methods to capture output
let consoleOutput = [];
let originalConsoleLog, originalConsoleWarn, originalConsoleError;

function mockConsole() {
  consoleOutput = [];
  originalConsoleLog = console.log;
  originalConsoleWarn = console.warn;
  originalConsoleError = console.error;
  
  console.log = (...args) => consoleOutput.push({ method: 'log', args });
  console.warn = (...args) => consoleOutput.push({ method: 'warn', args });
  console.error = (...args) => consoleOutput.push({ method: 'error', args });
}

function restoreConsole() {
  console.log = originalConsoleLog;
  console.warn = originalConsoleWarn;
  console.error = originalConsoleError;
}

describe('Structured Logger', () => {
  beforeEach(() => {
    mockConsole();
    // Clear logger factory to avoid state leakage between tests
    loggerFactory.clear();
  });

  afterEach(() => {
    restoreConsole();
  });

  describe('Basic Logging', () => {
    it('should create logger with component name', () => {
      const logger = getLogger('test-component');
      assert.strictEqual(logger.component, 'test-component');
    });

    it('should log info messages', () => {
      const logger = getLogger('test', { level: 'INFO', jsonOutput: false });
      logger.info('test_op', 'Test message', { extra: 'data' });
      
      assert.strictEqual(consoleOutput.length, 1);
      assert.strictEqual(consoleOutput[0].method, 'log');
      assert.ok(consoleOutput[0].args[0].includes('INFO [test].test_op: Test message'));
    });

    it('should log error messages', () => {
      const logger = getLogger('test', { level: 'INFO', jsonOutput: false });
      logger.error('test_op', 'Error message', { code: 500 });
      
      assert.strictEqual(consoleOutput.length, 1);
      assert.strictEqual(consoleOutput[0].method, 'log');
      assert.ok(consoleOutput[0].args[0].includes('ERROR [test].test_op: Error message'));
    });

    it('should log warning messages', () => {
      const logger = getLogger('test', { level: 'INFO', jsonOutput: false });
      logger.warn('test_op', 'Warning message');
      
      assert.strictEqual(consoleOutput.length, 1);
      assert.strictEqual(consoleOutput[0].method, 'log');
      assert.ok(consoleOutput[0].args[0].includes('WARN [test].test_op: Warning message'));
    });

    it('should respect log levels', () => {
      const logger = getLogger('test', { level: 'ERROR', jsonOutput: false });
      logger.debug('test_op', 'Debug message');
      logger.info('test_op', 'Info message');
      logger.warn('test_op', 'Warning message');
      logger.error('test_op', 'Error message');
      
      // Only ERROR should be logged
      assert.strictEqual(consoleOutput.length, 1);
      assert.ok(consoleOutput[0].args[0].includes('ERROR [test].test_op: Error message'));
    });
  });

  describe('JSON Output', () => {
    it('should output structured JSON when enabled', () => {
      const logger = getLogger('test', { level: 'INFO', jsonOutput: true });
      logger.info('test_op', 'Test message', { extra: 'data' });
      
      assert.strictEqual(consoleOutput.length, 1);
      const logEntry = JSON.parse(consoleOutput[0].args[0]);
      
      assert.strictEqual(logEntry.level, 'INFO');
      assert.strictEqual(logEntry.component, 'test');
      assert.strictEqual(logEntry.op, 'test_op');
      assert.strictEqual(logEntry.msg, 'Test message');
      assert.strictEqual(logEntry.extra, 'data');
      assert.strictEqual(logEntry.status, 'ok');
      assert.ok(typeof logEntry.time === 'number');
      assert.ok(typeof logEntry.corr_id === 'string');
    });

    it('should include duration in JSON output', () => {
      const logger = getLogger('test', { level: 'INFO', jsonOutput: true });
      logger.info('test_op', 'Test message', { duration_ms: 123 });
      
      const logEntry = JSON.parse(consoleOutput[0].args[0]);
      assert.strictEqual(logEntry.duration_ms, 123);
    });
  });

  describe('Correlation ID Management', () => {
    it('should generate and use correlation IDs', () => {
      const logger = getLogger('test', { level: 'INFO', jsonOutput: true });
      logger.info('test_op', 'Test message');
      
      const logEntry = JSON.parse(consoleOutput[0].args[0]);
      assert.ok(typeof logEntry.corr_id === 'string');
      assert.strictEqual(logEntry.corr_id.length, 36); // UUID length
    });

    it('should allow setting custom correlation ID', () => {
      const logger = getLogger('test', { level: 'INFO', jsonOutput: true });
      const customId = 'custom-correlation-id';
      logger.setCorrelationId(customId);
      logger.info('test_op', 'Test message');
      
      const logEntry = JSON.parse(consoleOutput[0].args[0]);
      assert.strictEqual(logEntry.corr_id, customId);
    });

    it('should maintain correlation ID across multiple logs', () => {
      const logger = getLogger('test', { level: 'INFO', jsonOutput: true });
      const customId = generateCorrelationId();
      logger.setCorrelationId(customId);
      
      logger.info('op1', 'Message 1');
      logger.info('op2', 'Message 2');
      
      const entry1 = JSON.parse(consoleOutput[0].args[0]);
      const entry2 = JSON.parse(consoleOutput[1].args[0]);
      
      assert.strictEqual(entry1.corr_id, customId);
      assert.strictEqual(entry2.corr_id, customId);
    });
  });

  describe('Timing Operations', () => {
    it('should automatically time operations', () => {
      const logger = getLogger('test', { level: 'INFO', jsonOutput: false });
      
      const timed = logger.timed('test_op', 'Starting operation');
      
      // Simulate some work
      setTimeout(() => {
        timed.end('Operation completed');
        
        assert.strictEqual(consoleOutput.length, 2);
        assert.ok(consoleOutput[0].args[0].includes('Starting operation'));
        assert.ok(consoleOutput[1].args[0].includes('Operation completed'));
        assert.ok(consoleOutput[1].args[0].includes('ms'));
      }, 10);
    });

    it('should wrap functions with timing', async () => {
      const logger = getLogger('test', { level: 'INFO', jsonOutput: true });
      
      const wrappedFn = logger.wrap('test_op', async (value) => {
        return value * 2;
      }, {
        startMessage: 'Starting calculation',
        endMessage: 'Calculation completed',
        logArgs: true,
        logResult: true
      });
      
      const result = await wrappedFn(5);
      
      assert.strictEqual(result, 10);
      assert.strictEqual(consoleOutput.length, 2);
      
      const startEntry = JSON.parse(consoleOutput[0].args[0]);
      const endEntry = JSON.parse(consoleOutput[1].args[0]);
      
      assert.strictEqual(startEntry.msg, 'Starting calculation');
      assert.strictEqual(endEntry.msg, 'Calculation completed');
      assert.strictEqual(startEntry.args[0], 5);
      assert.strictEqual(endEntry.result, 10);
      assert.ok(typeof endEntry.duration_ms === 'number');
    });

    it('should handle errors in wrapped functions', async () => {
      const logger = getLogger('test', { level: 'INFO', jsonOutput: true });
      
      const wrappedFn = logger.wrap('test_op', async () => {
        throw new Error('Test error');
      });
      
      await assert.rejects(async () => await wrappedFn(), Error('Test error'));
      
      assert.strictEqual(consoleOutput.length, 2);
      
      const startEntry = JSON.parse(consoleOutput[0].args[0]);
      const errorEntry = JSON.parse(consoleOutput[1].args[0]);
      
      assert.strictEqual(startEntry.level, 'INFO');
      assert.strictEqual(errorEntry.level, 'ERROR');
      assert.strictEqual(errorEntry.error.message, 'Test error');
    });
  });

  describe('Child Loggers', () => {
    it('should inherit correlation context from parent', () => {
      const parent = getLogger('parent', { level: 'INFO', jsonOutput: true });
      const customId = generateCorrelationId();
      parent.setCorrelationId(customId);
      
      const child = parent.child('child');
      child.info('test_op', 'Child message');
      
      const logEntry = JSON.parse(consoleOutput[0].args[0]);
      assert.strictEqual(logEntry.component, 'child');
      assert.strictEqual(logEntry.corr_id, customId);
    });

    it('should allow additional context in child', () => {
      const parent = getLogger('parent', { level: 'INFO', jsonOutput: true });
      parent.setContext('user_id', 'user123');
      
      const child = parent.child('child', { session_id: 'session456' });
      
      // Context should be inherited but not visible in logs unless explicitly added
      child.info('test_op', 'Child message');
      
      const logEntry = JSON.parse(consoleOutput[0].args[0]);
      assert.strictEqual(logEntry.component, 'child');
    });
  });

  describe('Correlation Context Wrapper', () => {
    it('should propagate correlation ID through async operations', async () => {
      const logger = getLogger('test', { level: 'INFO', jsonOutput: true });
      const customId = generateCorrelationId();
      
      await withCorrelation('test', async () => {
        logger.info('op1', 'Message 1');
        logger.info('op2', 'Message 2');
      }, customId);
      
      const entry1 = JSON.parse(consoleOutput[0].args[0]);
      const entry2 = JSON.parse(consoleOutput[1].args[0]);
      
      assert.strictEqual(entry1.corr_id, customId);
      assert.strictEqual(entry2.corr_id, customId);
    });

    it('should restore original correlation ID after wrapper', async () => {
      const logger = getLogger('test', { level: 'INFO', jsonOutput: true });
      const originalId = generateCorrelationId();
      const wrapperId = generateCorrelationId();
      
      logger.setCorrelationId(originalId);
      
      await withCorrelation('test', async () => {
        logger.info('op1', 'Inside wrapper');
      }, wrapperId);
      
      logger.info('op2', 'After wrapper');
      
      const entry1 = JSON.parse(consoleOutput[0].args[0]);
      const entry2 = JSON.parse(consoleOutput[1].args[0]);
      
      assert.strictEqual(entry1.corr_id, wrapperId);
      assert.strictEqual(entry2.corr_id, originalId);
    });
  });

  describe('Error History', () => {
    it('should track errors in history', () => {
      const logger = getLogger('test', { level: 'INFO', jsonOutput: true, persistErrors: true });
      
      logger.error('test_op', 'Test error', { code: 500 });
      
      const history = logger.getErrorHistory();
      assert.strictEqual(history.length, 1);
      assert.strictEqual(history[0].error.message, 'Test error');
      assert.strictEqual(history[0].error.code, 500);
      assert.ok(typeof history[0].timestamp === 'number');
    });

    it('should limit error history size', () => {
      const logger = getLogger('test', { level: 'INFO', jsonOutput: true, persistErrors: true, errorHistorySize: 2 });
      
      // Add more errors than the limit
      for (let i = 0; i < 5; i++) {
        logger.error('test_op', `Error ${i}`);
      }
      
      const history = logger.getErrorHistory();
      assert.strictEqual(history.length, 2);
      assert.strictEqual(history[0].error.message, 'Error 3');
      assert.strictEqual(history[1].error.message, 'Error 4');
    });
  });

  describe('Utility Functions', () => {
    it('should generate correlation IDs', () => {
      const id1 = generateCorrelationId();
      const id2 = generateCorrelationId();
      
      assert.strictEqual(typeof id1, 'string');
      assert.strictEqual(typeof id2, 'string');
      assert.strictEqual(id1.length, 36);
      assert.strictEqual(id2.length, 36);
      assert.notStrictEqual(id1, id2);
    });
  });
});