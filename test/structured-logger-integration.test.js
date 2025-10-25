/**
 * Integration tests for Structured Logger
 * Tests the actual integration points and end-to-end functionality
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { randomUUID } from 'crypto';
import { getLogger, generateCorrelationId, withCorrelation, StructuredLogger, LoggerFactory } from '../src/utils/structured-logger.js';

describe('Structured Logger Integration', () => {
  let factory;

  beforeEach(() => {
    factory = new LoggerFactory();
  });

  describe('JSON Schema Validation', () => {
    it('should produce valid JSON log entries with required fields', () => {
      const logger = factory.getLogger('test-component', { 
        level: 'INFO', 
        jsonOutput: true 
      });
      
      const testCorrId = generateCorrelationId();
      logger.setCorrelationId(testCorrId);
      
      // Mock console to capture JSON output
      const outputs = [];
      const originalLog = console.log;
      console.log = (data) => outputs.push(data);
      
      try {
        logger.info('test_operation', 'Test message', {
          cache_hit: false,
          query_hash: 'sha256hash',
          duration_ms: 245
        });
        
        assert.strictEqual(outputs.length, 1);
        const logEntry = JSON.parse(outputs[0]);
        
        // Validate required fields
        assert.ok(typeof logEntry.time === 'number');
        assert.strictEqual(logEntry.level, 'INFO');
        assert.strictEqual(logEntry.component, 'test-component');
        assert.strictEqual(logEntry.op, 'test_operation');
        assert.strictEqual(logEntry.corr_id, testCorrId);
        assert.strictEqual(logEntry.msg, 'Test message');
        assert.strictEqual(logEntry.status, 'ok');
        assert.strictEqual(logEntry.cache_hit, false);
        assert.strictEqual(logEntry.query_hash, 'sha256hash');
        assert.strictEqual(logEntry.duration_ms, 245);
        
      } finally {
        console.log = originalLog;
      }
    });

    it('should handle error log entries with proper status', () => {
      const logger = factory.getLogger('error-component', { 
        level: 'ERROR', 
        jsonOutput: true 
      });
      
      const outputs = [];
      const originalLog = console.log;
      console.log = (data) => outputs.push(data);
      
      try {
        logger.error('failing_operation', 'Operation failed', {
          error_code: 500,
          details: 'Database connection lost'
        });
        
        assert.strictEqual(outputs.length, 1);
        const logEntry = JSON.parse(outputs[0]);
        
        assert.strictEqual(logEntry.level, 'ERROR');
        assert.strictEqual(logEntry.status, 'error');
        assert.strictEqual(logEntry.error_code, 500);
        assert.strictEqual(logEntry.details, 'Database connection lost');
        
      } finally {
        console.log = originalLog;
      }
    });
  });

  describe('Correlation ID Propagation', () => {
    it('should maintain correlation ID across multiple operations', async () => {
      const logger = factory.getLogger('propagation-test', { 
        level: 'INFO', 
        jsonOutput: true 
      });
      
      const testCorrId = generateCorrelationId();
      logger.setCorrelationId(testCorrId);
      
      const outputs = [];
      const originalLog = console.log;
      console.log = (data) => outputs.push(data);
      
      try {
        logger.info('step1', 'Starting process');
        logger.info('step2', 'Processing data');
        logger.info('step3', 'Completing process');
        
        assert.strictEqual(outputs.length, 3);
        
        const entry1 = JSON.parse(outputs[0]);
        const entry2 = JSON.parse(outputs[1]);
        const entry3 = JSON.parse(outputs[2]);
        
        assert.strictEqual(entry1.corr_id, testCorrId);
        assert.strictEqual(entry2.corr_id, testCorrId);
        assert.strictEqual(entry3.corr_id, testCorrId);
        
      } finally {
        console.log = originalLog;
      }
    });

    it('should propagate correlation ID through async operations', async () => {
      const logger = factory.getLogger('async-test', { 
        level: 'INFO', 
        jsonOutput: true 
      });
      
      const testCorrId = generateCorrelationId();
      
      const outputs = [];
      const originalLog = console.log;
      console.log = (data) => outputs.push(data);
      
      try {
        await logger.withCorrelation(async () => {
          logger.info('async_op1', 'Async operation 1');
          await new Promise(resolve => setTimeout(resolve, 10));
          logger.info('async_op2', 'Async operation 2');
        }, testCorrId);
        
        assert.strictEqual(outputs.length, 2);
        
        const entry1 = JSON.parse(outputs[0]);
        const entry2 = JSON.parse(outputs[1]);
        
        assert.strictEqual(entry1.corr_id, testCorrId);
        assert.strictEqual(entry2.corr_id, testCorrId);
        
      } finally {
        console.log = originalLog;
      }
    });
  });

  describe('Performance Requirements', () => {
    it('should complete log operations within 5ms performance threshold', () => {
      const logger = factory.getLogger('performance-test', { 
        level: 'INFO', 
        jsonOutput: true 
      });
      
      const iterations = 100;
      const startTime = Date.now();
      
      // Mock console to avoid actual output during performance test
      const originalLog = console.log;
      console.log = () => {};
      
      try {
        for (let i = 0; i < iterations; i++) {
          logger.info('perf_test', `Performance test iteration ${i}`, {
            iteration: i,
            data: 'sample data for performance testing'
          });
        }
        
        const totalTime = Date.now() - startTime;
        const avgTimePerOperation = totalTime / iterations;
        
        // Should average less than 5ms per operation
        assert.ok(avgTimePerOperation < 5, 
          `Average time per operation (${avgTimePerOperation}ms) exceeds 5ms threshold`);
        
      } finally {
        console.log = originalLog;
      }
    });
  });

  describe('Component Tagging', () => {
    it('should correctly tag major system components', () => {
      const components = ['search', 'cache', 'cli', 'context'];
      const outputs = [];
      
      const originalLog = console.log;
      console.log = (data) => outputs.push(data);
      
      try {
        components.forEach(component => {
          const logger = factory.getLogger(component, { 
            level: 'INFO', 
            jsonOutput: true 
          });
          
          logger.info('test_op', `Test message from ${component}`);
        });
        
        assert.strictEqual(outputs.length, components.length);
        
        outputs.forEach((output, index) => {
          const logEntry = JSON.parse(output);
          assert.strictEqual(logEntry.component, components[index]);
          assert.strictEqual(logEntry.op, 'test_op');
          assert.strictEqual(logEntry.msg, `Test message from ${components[index]}`);
        });
        
      } finally {
        console.log = originalLog;
      }
    });
  });

  describe('Log Level Filtering', () => {
    it('should respect log level configuration', () => {
      const logger = factory.getLogger('level-test', { 
        level: 'WARN', 
        jsonOutput: true 
      });
      
      const outputs = [];
      const originalLog = console.log;
      console.log = (data) => outputs.push(data);
      
      try {
        logger.debug('debug_op', 'Debug message');
        logger.info('info_op', 'Info message');
        logger.warn('warn_op', 'Warning message');
        logger.error('error_op', 'Error message');
        
        // Only WARN and ERROR should be logged
        assert.strictEqual(outputs.length, 2);
        
        const warnEntry = JSON.parse(outputs[0]);
        const errorEntry = JSON.parse(outputs[1]);
        
        assert.strictEqual(warnEntry.level, 'WARN');
        assert.strictEqual(errorEntry.level, 'ERROR');
        
      } finally {
        console.log = originalLog;
      }
    });
  });

  describe('Child Logger Inheritance', () => {
    it('should inherit correlation context from parent logger', () => {
      const parent = factory.getLogger('parent', { 
        level: 'INFO', 
        jsonOutput: true 
      });
      
      const testCorrId = generateCorrelationId();
      parent.setCorrelationId(testCorrId);
      
      const child = parent.child('child');
      
      const outputs = [];
      const originalLog = console.log;
      console.log = (data) => outputs.push(data);
      
      try {
        child.info('child_op', 'Child logger message');
        
        assert.strictEqual(outputs.length, 1);
        const logEntry = JSON.parse(outputs[0]);
        
        assert.strictEqual(logEntry.component, 'child');
        assert.strictEqual(logEntry.corr_id, testCorrId);
        assert.strictEqual(logEntry.op, 'child_op');
        assert.strictEqual(logEntry.msg, 'Child logger message');
        
      } finally {
        console.log = originalLog;
      }
    });
  });

  describe('Timing Operations', () => {
    it('should accurately measure operation duration', async () => {
      const logger = factory.getLogger('timing-test', { 
        level: 'INFO', 
        jsonOutput: true 
      });
      
      const outputs = [];
      const originalLog = console.log;
      console.log = (data) => outputs.push(data);
      
      try {
        const timed = logger.timed('timed_op', 'Starting timed operation');
        
        // Simulate some work
        await new Promise(resolve => setTimeout(resolve, 50));
        
        timed.end('Operation completed');
        
        assert.strictEqual(outputs.length, 2);
        
        const startEntry = JSON.parse(outputs[0]);
        const endEntry = JSON.parse(outputs[1]);
        
        assert.strictEqual(startEntry.msg, 'Starting timed operation');
        assert.strictEqual(endEntry.msg, 'Operation completed');
        assert.ok(typeof endEntry.duration_ms === 'number');
        assert.ok(endEntry.duration_ms >= 45); // Allow some tolerance
        
      } finally {
        console.log = originalLog;
      }
    });
  });
});