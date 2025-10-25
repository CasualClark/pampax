/**
 * Circuit Breaker Tests
 * 
 * Test-driven implementation of circuit breaker patterns for PAMPAX reliability
 */

const { CircuitBreaker, CircuitBreakerState } = require('./circuit-breaker.js');
const { getMetricsCollector } = require('../metrics/metrics-collector.js');
const { getLogger } = require('../utils/structured-logger.js');

describe('CircuitBreaker', () => {
  let circuitBreaker;
  let mockMetrics;
  let mockLogger;

  beforeEach(() => {
    mockMetrics = {
      emitCounter: jest.fn(),
      emitGauge: jest.fn(),
      emitTiming: jest.fn()
    };
    
    mockLogger = {
      warn: jest.fn(),
      info: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    };

    jest.spyOn(require('../metrics/metrics-collector.js'), 'getMetricsCollector').mockReturnValue(mockMetrics);
    jest.spyOn(require('../utils/structured-logger.js'), 'getLogger').mockReturnValue(mockLogger);

    circuitBreaker = new CircuitBreaker('test-service', {
      failureThreshold: 3,
      recoveryTimeout: 1000,
      monitoringPeriod: 5000,
      successThreshold: 2
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Initial State', () => {
    test('should start in CLOSED state', () => {
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.CLOSED);
    });

    test('should have default configuration', () => {
      const cb = new CircuitBreaker('test');
      expect(cb.getState()).toBe(CircuitBreakerState.CLOSED);
      expect(cb.getStats().failureCount).toBe(0);
      expect(cb.getStats().successCount).toBe(0);
    });
  });

  describe('CLOSED State Operations', () => {
    test('should execute operations successfully in CLOSED state', async () => {
      const successFn = jest.fn().mockResolvedValue('success');
      
      const result = await circuitBreaker.execute(successFn);
      
      expect(result).toBe('success');
      expect(successFn).toHaveBeenCalledTimes(1);
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.CLOSED);
      expect(circuitBreaker.getStats().successCount).toBe(1);
    });

    test('should handle failures and count them', async () => {
      const failureFn = jest.fn().mockRejectedValue(new Error('Service error'));
      
      await expect(circuitBreaker.execute(failureFn)).rejects.toThrow('Service error');
      
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.CLOSED);
      expect(circuitBreaker.getStats().failureCount).toBe(1);
    });

    test('should transition to OPEN when failure threshold is reached', async () => {
      const failureFn = jest.fn().mockRejectedValue(new Error('Service error'));
      
      // Fail 3 times to reach threshold
      for (let i = 0; i < 3; i++) {
        await expect(circuitBreaker.execute(failureFn)).rejects.toThrow('Service error');
      }
      
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.OPEN);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Circuit breaker OPENED'),
        expect.any(String),
        expect.objectContaining({
          service: 'test-service',
          failureCount: 3,
          failureRate: expect.any(Number)
        })
      );
    });

    test('should reset failure count on successful operation', async () => {
      const failureFn = jest.fn().mockRejectedValue(new Error('Service error'));
      const successFn = jest.fn().mockResolvedValue('success');
      
      // Fail twice
      await expect(circuitBreaker.execute(failureFn)).rejects.toThrow('Service error');
      await expect(circuitBreaker.execute(failureFn)).rejects.toThrow('Service error');
      
      expect(circuitBreaker.getStats().failureCount).toBe(2);
      
      // Succeed once
      await circuitBreaker.execute(successFn);
      
      expect(circuitBreaker.getStats().failureCount).toBe(0);
      expect(circuitBreaker.getStats().successCount).toBe(1);
    });
  });

  describe('OPEN State Operations', () => {
    beforeEach(async () => {
      // Force circuit breaker to OPEN state
      const failureFn = jest.fn().mockRejectedValue(new Error('Service error'));
      for (let i = 0; i < 3; i++) {
        await expect(circuitBreaker.execute(failureFn)).rejects.toThrow('Service error');
      }
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.OPEN);
    });

    test('should reject immediately without calling function in OPEN state', async () => {
      const fn = jest.fn().mockResolvedValue('success');
      
      await expect(circuitBreaker.execute(fn)).rejects.toThrow('Circuit breaker is OPEN');
      
      expect(fn).not.toHaveBeenCalled();
      expect(mockMetrics.emitCounter).toHaveBeenCalledWith(
        'circuit_breaker_rejections',
        1,
        expect.objectContaining({ service: 'test-service', state: 'OPEN' })
      );
    });

    test('should transition to HALF_OPEN after recovery timeout', async () => {
      // Wait for recovery timeout
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      // Next call should trigger HALF_OPEN state
      const fn = jest.fn().mockResolvedValue('success');
      await circuitBreaker.execute(fn);
      
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.HALF_OPEN);
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  describe('HALF_OPEN State Operations', () => {
    beforeEach(async () => {
      // Force to OPEN state
      const failureFn = jest.fn().mockRejectedValue(new Error('Service error'));
      for (let i = 0; i < 3; i++) {
        await expect(circuitBreaker.execute(failureFn)).rejects.toThrow('Service error');
      }
      
      // Wait for recovery timeout and trigger HALF_OPEN
      await new Promise(resolve => setTimeout(resolve, 1100));
    });

    test('should close circuit after success threshold is reached', async () => {
      const successFn = jest.fn().mockResolvedValue('success');
      
      // Execute successful operations to reach success threshold
      await circuitBreaker.execute(successFn);
      await circuitBreaker.execute(successFn);
      
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.CLOSED);
      expect(circuitBreaker.getStats().successCount).toBe(2);
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Circuit breaker CLOSED'),
        expect.any(String),
        expect.objectContaining({
          service: 'test-service',
          successCount: 2
        })
      );
    });

    test('should return to OPEN on failure in HALF_OPEN state', async () => {
      const failureFn = jest.fn().mockRejectedValue(new Error('Service still failing'));
      
      await expect(circuitBreaker.execute(failureFn)).rejects.toThrow('Service still failing');
      
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.OPEN);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Circuit breaker returned to OPEN'),
        expect.any(String),
        expect.objectContaining({
          service: 'test-service'
        })
      );
    });
  });

  describe('Metrics and Monitoring', () => {
    test('should emit appropriate metrics for state changes', async () => {
      const failureFn = jest.fn().mockRejectedValue(new Error('Service error'));
      
      // Trigger OPEN state
      for (let i = 0; i < 3; i++) {
        await expect(circuitBreaker.execute(failureFn)).rejects.toThrow('Service error');
      }
      
      expect(mockMetrics.emitGauge).toHaveBeenCalledWith(
        'circuit_breaker_state',
        expect.any(Number),
        expect.objectContaining({
          service: 'test-service',
          state: 'OPEN'
        })
      );
    });

    test('should track operation latency', async () => {
      const slowFn = jest.fn().mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve('slow'), 100))
      );
      
      await circuitBreaker.execute(slowFn);
      
      expect(mockMetrics.emitTiming).toHaveBeenCalledWith(
        'circuit_breaker_operation_duration_ms',
        expect.any(Number),
        expect.objectContaining({
          service: 'test-service',
          state: 'CLOSED',
          success: 'true'
        })
      );
    });
  });

  describe('Configuration and Customization', () => {
    test('should support custom error classification', async () => {
      const cb = new CircuitBreaker('test', {
        failureThreshold: 2,
        isTransientError: (error) => error.code === 'TRANSIENT'
      });
      
      const transientError = new Error('Transient failure');
      transientError.code = 'TRANSIENT';
      
      const permanentError = new Error('Permanent failure');
      permanentError.code = 'PERMANENT';
      
      // Transient error should count as failure
      await expect(cb.execute(() => { throw transientError; })).rejects.toThrow('Transient failure');
      expect(cb.getStats().failureCount).toBe(1);
      
      // Permanent error should not count as failure
      await expect(cb.execute(() => { throw permanentError; })).rejects.toThrow('Permanent failure');
      expect(cb.getStats().failureCount).toBe(1); // Should not increment
    });

    test('should support custom fallback function', async () => {
      const fallbackFn = jest.fn().mockResolvedValue('fallback-result');
      const failureFn = jest.fn().mockRejectedValue(new Error('Service error'));
      
      // Force OPEN state
      for (let i = 0; i < 3; i++) {
        await expect(circuitBreaker.execute(failureFn)).rejects.toThrow('Service error');
      }
      
      const result = await circuitBreaker.execute(failureFn, { fallback: fallbackFn });
      
      expect(result).toBe('fallback-result');
      expect(fallbackFn).toHaveBeenCalledTimes(1);
      expect(failureFn).not.toHaveBeenCalled();
    });
  });

  describe('Bulkhead Pattern', () => {
    test('should limit concurrent operations', async () => {
      const cb = new CircuitBreaker('test', {
        maxConcurrent: 2,
        failureThreshold: 5
      });
      
      const slowFn = jest.fn().mockImplementation(() => 
        new Promise(resolve => setTimeout(resolve, 100))
      );
      
      // Start 3 concurrent operations
      const promises = [
        cb.execute(slowFn),
        cb.execute(slowFn),
        cb.execute(slowFn)
      ];
      
      // The third should be rejected due to bulkhead limit
      await expect(Promise.allSettled(promises)).then((results) => {
        expect(results[0].status).toBe('fulfilled');
        expect(results[1].status).toBe('fulfilled');
        expect(results[2].status).toBe('rejected');
        expect(results[2].reason.message).toContain('Bulkhead limit exceeded');
      });
    });
  });

  describe('Statistics and Health', () => {
    test('should provide comprehensive statistics', async () => {
      const successFn = jest.fn().mockResolvedValue('success');
      const failureFn = jest.fn().mockRejectedValue(new Error('failure'));
      
      // Mix of operations
      await circuitBreaker.execute(successFn);
      await circuitBreaker.execute(failureFn);
      await circuitBreaker.execute(successFn);
      
      const stats = circuitBreaker.getStats();
      
      expect(stats.successCount).toBe(2);
      expect(stats.failureCount).toBe(1);
      expect(stats.totalOperations).toBe(3);
      expect(stats.failureRate).toBeCloseTo(0.33, 2);
      expect(stats.state).toBe('CLOSED');
    });

    test('should provide health status', () => {
      const health = circuitBreaker.getHealthStatus();
      
      expect(health).toHaveProperty('healthy');
      expect(health).toHaveProperty('state');
      expect(health).toHaveProperty('stats');
      expect(health).toHaveProperty('timestamp');
    });
  });
});