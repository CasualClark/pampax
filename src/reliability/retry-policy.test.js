/**
 * Retry Policy Tests
 * 
 * Test-driven implementation of retry mechanisms with exponential backoff
 */

const { RetryPolicy, RetryStrategy } = require('./retry-policy.js');
const { getMetricsCollector } = require('../metrics/metrics-collector.js');
const { getLogger } = require('../utils/structured-logger.js');

describe('RetryPolicy', () => {
  let retryPolicy;
  let mockMetrics;
  let mockLogger;

  beforeEach(() => {
    mockMetrics = {
      emitCounter: jest.fn(),
      emitTiming: jest.fn(),
      emitHistogram: jest.fn()
    };
    
    mockLogger = {
      warn: jest.fn(),
      info: jest.fn(),
      debug: jest.fn(),
      error: jest.fn()
    };

    jest.spyOn(require('../metrics/metrics-collector.js'), 'getMetricsCollector').mockReturnValue(mockMetrics);
    jest.spyOn(require('../utils/structured-logger.js'), 'getLogger').mockReturnValue(mockLogger);

    retryPolicy = new RetryPolicy('test-operation', {
      maxAttempts: 3,
      baseDelay: 100,
      maxDelay: 1000,
      multiplier: 2.0,
      jitter: true
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllTimers();
  });

  describe('Configuration', () => {
    test('should use default configuration', () => {
      const defaultPolicy = new RetryPolicy('test');
      expect(defaultPolicy.maxAttempts).toBe(3);
      expect(defaultPolicy.baseDelay).toBe(1000);
      expect(defaultPolicy.multiplier).toBe(2.0);
    });

    test('should accept custom configuration', () => {
      const customPolicy = new RetryPolicy('test', {
        maxAttempts: 5,
        baseDelay: 200,
        maxDelay: 5000,
        multiplier: 1.5,
        jitter: false
      });

      expect(customPolicy.maxAttempts).toBe(5);
      expect(customPolicy.baseDelay).toBe(200);
      expect(customPolicy.maxDelay).toBe(5000);
      expect(customPolicy.multiplier).toBe(1.5);
      expect(customPolicy.jitter).toBe(false);
    });
  });

  describe('Successful Operations', () => {
    test('should execute successful operation without retries', async () => {
      const successFn = jest.fn().mockResolvedValue('success');
      
      const result = await retryPolicy.execute(successFn);
      
      expect(result).toBe('success');
      expect(successFn).toHaveBeenCalledTimes(1);
      expect(mockMetrics.emitCounter).toHaveBeenCalledWith(
        'retry_operations',
        1,
        expect.objectContaining({
          operation: 'test-operation',
          success: 'true',
          attempts: 1
        })
      );
    });

    test('should return result on first success after failures', async () => {
      const attemptFn = jest.fn()
        .mockRejectedValueOnce(new Error('First failure'))
        .mockRejectedValueOnce(new Error('Second failure'))
        .mockResolvedValue('success');
      
      jest.useFakeTimers();
      
      const promise = retryPolicy.execute(attemptFn);
      
      // First attempt fails
      await Promise.resolve();
      expect(attemptFn).toHaveBeenCalledTimes(1);
      
      // First retry
      jest.advanceTimersByTime(100);
      await Promise.resolve();
      expect(attemptFn).toHaveBeenCalledTimes(2);
      
      // Second retry
      jest.advanceTimersByTime(200);
      await Promise.resolve();
      expect(attemptFn).toHaveBeenCalledTimes(3);
      
      const result = await promise;
      expect(result).toBe('success');
      
      expect(mockMetrics.emitCounter).toHaveBeenCalledWith(
        'retry_operations',
        1,
        expect.objectContaining({
          operation: 'test-operation',
          success: 'true',
          attempts: 3
        })
      );
    });
  });

  describe('Retry Logic', () => {
    test('should retry on transient errors', async () => {
      const transientError = new Error('Network timeout');
      transientError.code = 'ETIMEDOUT';
      
      const attemptFn = jest.fn()
        .mockRejectedValueOnce(transientError)
        .mockResolvedValue('success');
      
      jest.useFakeTimers();
      
      const promise = retryPolicy.execute(attemptFn);
      
      // First attempt fails
      await Promise.resolve();
      expect(attemptFn).toHaveBeenCalledTimes(1);
      
      // Retry after delay
      jest.advanceTimersByTime(100);
      await Promise.resolve();
      expect(attemptFn).toHaveBeenCalledTimes(2);
      
      const result = await promise;
      expect(result).toBe('success');
    });

    test('should not retry on non-transient errors', async () => {
      const permanentError = new Error('Invalid configuration');
      permanentError.code = 'EINVAL';
      
      const attemptFn = jest.fn().mockRejectedValue(permanentError);
      
      await expect(retryPolicy.execute(attemptFn)).rejects.toThrow('Invalid configuration');
      expect(attemptFn).toHaveBeenCalledTimes(1);
    });

    test('should respect max attempts limit', async () => {
      const attemptFn = jest.fn().mockRejectedValue(new Error('Always fails'));
      
      jest.useFakeTimers();
      
      const promise = retryPolicy.execute(attemptFn);
      
      // Execute all attempts
      for (let i = 0; i < 3; i++) {
        await Promise.resolve();
        if (i < 2) {
          jest.advanceTimersByTime(100 * Math.pow(2, i));
          await Promise.resolve();
        }
      }
      
      await expect(promise).rejects.toThrow('Always fails');
      expect(attemptFn).toHaveBeenCalledTimes(3);
      
      expect(mockMetrics.emitCounter).toHaveBeenCalledWith(
        'retry_exhausted',
        1,
        expect.objectContaining({
          operation: 'test-operation',
          max_attempts: 3
        })
      );
    });
  });

  describe('Delay Calculation', () => {
    test('should calculate exponential backoff delays', () => {
      const delays = [];
      const policy = new RetryPolicy('test', {
        baseDelay: 100,
        multiplier: 2.0,
        jitter: false
      });
      
      for (let attempt = 1; attempt <= 5; attempt++) {
        delays.push(policy.calculateDelay(attempt));
      }
      
      expect(delays).toEqual([100, 200, 400, 800, 1000]); // Capped at maxDelay
    });

    test('should apply jitter when enabled', () => {
      const policy = new RetryPolicy('test', {
        baseDelay: 100,
        jitter: true
      });
      
      const delay1 = policy.calculateDelay(1);
      const delay2 = policy.calculateDelay(1);
      
      // With jitter, delays should vary
      expect(delay1).toBeGreaterThanOrEqual(50); // 50% of baseDelay
      expect(delay1).toBeLessThanOrEqual(150);  // 150% of baseDelay
      expect(delay2).toBeGreaterThanOrEqual(50);
      expect(delay2).toBeLessThanOrEqual(150);
    });

    test('should respect max delay limit', () => {
      const policy = new RetryPolicy('test', {
        baseDelay: 100,
        multiplier: 3.0,
        maxDelay: 500,
        jitter: false
      });
      
      const delay = policy.calculateDelay(5); // Would be 100 * 3^4 = 8100
      expect(delay).toBe(500); // Capped at maxDelay
    });
  });

  describe('Error Classification', () => {
    test('should classify transient errors correctly', () => {
      const transientErrors = [
        new Error('Connection timeout'),
        new Error('Network unreachable'),
        new Error('Rate limit exceeded'),
        new Error('Service temporarily unavailable')
      ];
      
      transientErrors.forEach(error => {
        expect(retryPolicy.isTransientError(error)).toBe(true);
      });
    });

    test('should classify non-transient errors correctly', () => {
      const permanentErrors = [
        new Error('Authentication failed'),
        new Error('Invalid request'),
        new Error('Not found'),
        new Error('Permission denied')
      ];
      
      permanentErrors.forEach(error => {
        expect(retryPolicy.isTransientError(error)).toBe(false);
      });
    });

    test('should support custom error classification', () => {
      const customPolicy = new RetryPolicy('test', {
        isRetryableError: (error) => error.code === 'CUSTOM_RETRY'
      });
      
      const retryableError = new Error('Custom retryable');
      retryableError.code = 'CUSTOM_RETRY';
      
      const nonRetryableError = new Error('Should not retry');
      nonRetryableError.code = 'NO_RETRY';
      
      expect(customPolicy.isRetryableError(retryableError)).toBe(true);
      expect(customPolicy.isRetryableError(nonRetryableError)).toBe(false);
    });
  });

  describe('Retry Strategies', () => {
    test('should support fixed delay strategy', async () => {
      const policy = new RetryPolicy('test', {
        strategy: RetryStrategy.FIXED,
        baseDelay: 200,
        jitter: false
      });
      
      expect(policy.calculateDelay(1)).toBe(200);
      expect(policy.calculateDelay(2)).toBe(200);
      expect(policy.calculateDelay(3)).toBe(200);
    });

    test('should support linear backoff strategy', async () => {
      const policy = new RetryPolicy('test', {
        strategy: RetryStrategy.LINEAR,
        baseDelay: 100,
        jitter: false
      });
      
      expect(policy.calculateDelay(1)).toBe(100);
      expect(policy.calculateDelay(2)).toBe(200);
      expect(policy.calculateDelay(3)).toBe(300);
    });

    test('should support exponential backoff strategy', async () => {
      const policy = new RetryPolicy('test', {
        strategy: RetryStrategy.EXPONENTIAL,
        baseDelay: 100,
        multiplier: 2.0,
        jitter: false
      });
      
      expect(policy.calculateDelay(1)).toBe(100);
      expect(policy.calculateDelay(2)).toBe(200);
      expect(policy.calculateDelay(3)).toBe(400);
    });
  });

  describe('Metrics and Monitoring', () => {
    test('should emit timing metrics for total duration', async () => {
      const slowFn = jest.fn().mockImplementation(() => 
        new Promise(resolve => setTimeout(resolve, 100))
      );
      
      jest.useFakeTimers();
      
      const promise = retryPolicy.execute(slowFn);
      jest.advanceTimersByTime(100);
      await promise;
      
      expect(mockMetrics.emitTiming).toHaveBeenCalledWith(
        'retry_operation_duration_ms',
        expect.any(Number),
        expect.objectContaining({
          operation: 'test-operation',
          success: 'true'
        })
      );
    });

    test('should emit delay distribution metrics', async () => {
      const attemptFn = jest.fn()
        .mockRejectedValueOnce(new Error('Fail'))
        .mockResolvedValue('success');
      
      jest.useFakeTimers();
      
      const promise = retryPolicy.execute(attemptFn);
      jest.advanceTimersByTime(100);
      await promise;
      
      expect(mockMetrics.emitHistogram).toHaveBeenCalledWith(
        'retry_delay_distribution_ms',
        expect.any(Number),
        expect.objectContaining({
          operation: 'test-operation',
          attempt: 1
        })
      );
    });
  });

  describe('Advanced Features', () => {
    test('should support onRetry callback', async () => {
      const onRetry = jest.fn();
      const attemptFn = jest.fn()
        .mockRejectedValueOnce(new Error('Fail'))
        .mockResolvedValue('success');
      
      const policy = new RetryPolicy('test', {
        onRetry
      });
      
      jest.useFakeTimers();
      
      const promise = policy.execute(attemptFn);
      jest.advanceTimersByTime(100);
      await promise;
      
      expect(onRetry).toHaveBeenCalledTimes(1);
      expect(onRetry).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Fail' }),
        1, // attempt number
        expect.any(Number) // delay
      );
    });

    test('should support retry condition function', async () => {
      const shouldRetry = jest.fn()
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(false);
      
      const attemptFn = jest.fn()
        .mockRejectedValue(new Error('Fail'));
      
      const policy = new RetryPolicy('test', {
        shouldRetry
      });
      
      await expect(policy.execute(attemptFn)).rejects.toThrow('Fail');
      
      expect(attemptFn).toHaveBeenCalledTimes(2);
      expect(shouldRetry).toHaveBeenCalledTimes(2);
    });

    test('should support abort controller', async () => {
      const abortController = new AbortController();
      const attemptFn = jest.fn().mockRejectedValue(new Error('Fail'));
      
      const policy = new RetryPolicy('test', {
        maxAttempts: 5
      });
      
      const promise = policy.execute(attemptFn, {
        signal: abortController.signal
      });
      
      // Abort after first attempt
      setTimeout(() => abortController.abort(), 50);
      
      await expect(promise).rejects.toThrow('Operation aborted');
      expect(attemptFn).toHaveBeenCalledTimes(1);
    });
  });

  describe('Statistics', () => {
    test('should track operation statistics', async () => {
      const attemptFn = jest.fn()
        .mockRejectedValueOnce(new Error('Fail'))
        .mockResolvedValue('success');
      
      jest.useFakeTimers();
      
      const promise = retryPolicy.execute(attemptFn);
      jest.advanceTimersByTime(100);
      await promise;
      
      const stats = retryPolicy.getStats();
      
      expect(stats.totalOperations).toBe(1);
      expect(stats.successfulOperations).toBe(1);
      expect(stats.failedOperations).toBe(0);
      expect(stats.totalRetries).toBe(1);
      expect(stats.averageRetriesPerOperation).toBe(1);
    });

    test('should provide comprehensive statistics', () => {
      const stats = retryPolicy.getStats();
      
      expect(stats).toHaveProperty('totalOperations');
      expect(stats).toHaveProperty('successfulOperations');
      expect(stats).toHaveProperty('failedOperations');
      expect(stats).toHaveProperty('totalRetries');
      expect(stats).toHaveProperty('averageRetriesPerOperation');
      expect(stats).toHaveProperty('configuration');
      expect(stats).toHaveProperty('timestamp');
    });
  });
});