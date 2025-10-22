import { test, describe } from 'node:test';
import assert from 'node:assert';
import { Logger } from '../../src/config/logger.js';
import { unlinkSync, mkdirSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';

describe('Logger', () => {
  const testLogPath = join(__dirname, '..', 'temp', 'test-logs');
  const testErrorHistoryPath = join(testLogPath, 'error-history.json');
  
  // Setup temp directory
  mkdirSync(testLogPath, { recursive: true });

  function cleanup() {
    try {
      unlinkSync(testErrorHistoryPath);
      unlinkSync(join(testLogPath, 'pampax.log'));
    } catch {
      // Ignore if files don't exist
    }
  }

  test('should create logger with default config', () => {
    cleanup();
    const logger = new Logger();
    
    // Should not throw
    logger.info('Test message');
    logger.warn('Test warning');
    logger.error('Test error');
    logger.debug('Test debug');
  });

  test('should respect log levels', () => {
    cleanup();
    const logger = new Logger({ level: 'ERROR' });
    
    // Capture console output
    const originalError = console.error;
    const originalLog = console.log;
    let errorCalled = false;
    let logCalled = false;

    console.error = () => { errorCalled = true; };
    console.log = () => { logCalled = true; };

    logger.info('Should not log');
    logger.warn('Should not log');
    logger.error('Should log');
    logger.debug('Should not log');

    console.error = originalError;
    console.log = originalLog;

    assert.strictEqual(logCalled, false);
    assert.strictEqual(errorCalled, true);
  });

  test('should format JSON output', () => {
    cleanup();
    const logger = new Logger({ jsonOutput: true });
    
    let capturedOutput = '';
    const originalLog = console.log;
    console.log = (message: string) => { capturedOutput = message; };

    logger.info('Test message', { key: 'value' }, 'test.py');

    console.log = originalLog;

    const parsed = JSON.parse(capturedOutput);
    assert.strictEqual(parsed.level, 'INFO');
    assert.strictEqual(parsed.message, 'Test message');
    assert.strictEqual(parsed.context.key, 'value');
    assert.strictEqual(parsed.file, 'test.py');
    assert(parsed.timestamp);
  });

  test('should persist error history', () => {
    cleanup();
    const logger = new Logger({ 
      persistErrors: true,
      logPath: testLogPath 
    });

    logger.error('Test error 1');
    logger.error('Test error 2');

    assert(existsSync(testErrorHistoryPath));
    
    const content = readFileSync(testErrorHistoryPath, 'utf-8');
    const errors = JSON.parse(content);
    
    assert.strictEqual(errors.length, 2);
    assert.strictEqual(errors[0].message, 'Test error 1');
    assert.strictEqual(errors[1].message, 'Test error 2');
  });

  test('should limit error history size', () => {
    cleanup();
    const logger = new Logger({ 
      persistErrors: true,
      errorHistorySize: 2,
      logPath: testLogPath 
    });

    logger.error('Error 1');
    logger.error('Error 2');
    logger.error('Error 3');

    const errors = logger.getErrorHistory();
    assert.strictEqual(errors.length, 2);
    assert.strictEqual(errors[0].message, 'Error 2');
    assert.strictEqual(errors[1].message, 'Error 3');
  });

  test('should measure execution time', () => {
    cleanup();
    const logger = new Logger();
    
    let capturedOutput = '';
    const originalLog = console.log;
    console.log = (message: string) => { capturedOutput = message; };

    const result = logger.time('test operation', () => {
      return 42;
    });

    console.log = originalLog;

    assert.strictEqual(result, 42);
    assert(capturedOutput.includes('Completed test operation'));
    assert(capturedOutput.includes('ms'));
  });

  test('should handle async timing', async () => {
    cleanup();
    const logger = new Logger();
    
    let capturedOutput = '';
    const originalLog = console.log;
    console.log = (message: string) => { capturedOutput = message; };

    const result = await logger.timeAsync('async test', async () => {
      return new Promise(resolve => setTimeout(() => resolve(42), 10));
    });

    console.log = originalLog;

    assert.strictEqual(result, 42);
    assert(capturedOutput.includes('Completed async test'));
    assert(capturedOutput.includes('ms'));
  });

  test('should clear error history', () => {
    cleanup();
    const logger = new Logger({ 
      persistErrors: true,
      logPath: testLogPath 
    });

    logger.error('Test error');
    assert.strictEqual(logger.getErrorHistory().length, 1);

    logger.clearErrorHistory();
    assert.strictEqual(logger.getErrorHistory().length, 0);
  });
});