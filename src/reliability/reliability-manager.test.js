/**
 * Reliability Manager Tests
 * 
 * Test-driven implementation of the main reliability coordinator
 */

const { ReliabilityManager } = require('./reliability-manager.js');
const { CircuitBreaker } = require('./circuit-breaker.js');
const { RetryPolicy } = require('./retry-policy.js');
const { GracefulDegradation } = require('./graceful-degradation.js');
const TimeoutManager = require('./timeout-manager.js');
const { getMetricsCollector } = require('../metrics/metrics-collector.js');
const { getLogger } = require('../utils/structured-logger.js');

describe('ReliabilityManager', () => {
  let reliabilityManager;
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
      debug: jest.fn(),
      error: jest.fn()
    };

    jest.spyOn(require('../metrics/metrics-collector.js'), 'getMetricsCollector').mockReturnValue(mockMetrics);
    jest.spyOn(require('../utils/structured-logger.js'), 'getLogger').mockReturnValue(mockLogger);

    reliabilityManager = new ReliabilityManager('test-service', {
      timeouts: {
        search: 5000,
        assembly: 10000,
        database: 2000
      },
      circuitBreakers: {
        search: { failureThreshold: 3 },
        database: { failureThreshold: 5 }
      },
      retryPolicies: {
        search: { maxAttempts: 3 },
        database: { maxAttempts: 5 }
      }
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Initialization', () => {
    test('should initialize with default configuration', () => {
      const defaultManager = new ReliabilityManager('test');
      
      expect(defaultManager).toBeInstanceOf(ReliabilityManager);
      expect(defaultManager.getServiceName()).toBe('test');
      expect(defaultManager.getCircuitBreakers()).toBeDefined();
      expect(defaultManager.getRetryPolicies()).toBeDefined();
      expect(defaultManager.getGracefulDegradation()).toBeDefined();
      expect(defaultManager.getTimeoutManager()).toBeDefined();
    });

    test('should accept custom configuration', () => {
      const customManager = new ReliabilityManager('custom-service', {
        timeouts: { search: 3000 },
        circuitBreakers: { search: { failureThreshold: 2 } },
        retryPolicies: { search: { maxAttempts: 4 } }
      });

      expect(customManager.getServiceName()).toBe('custom-service');
      
      const searchCircuitBreaker = customManager.getCircuitBreaker('search');
      expect(searchCircuitBreaker.options.failureThreshold).toBe(2);
      
      const searchRetryPolicy = customManager.getRetryPolicy('search');
      expect(searchRetryPolicy.maxAttempts).toBe(4);
    });
  });

  describe('Circuit Breaker Management', () => {
    test('should create and manage circuit breakers', () => {
      const searchCircuitBreaker = reliabilityManager.getCircuitBreaker('search');
      const databaseCircuitBreaker = reliabilityManager.getCircuitBreaker('database');
      
      expect(searchCircuitBreaker).toBeInstanceOf(CircuitBreaker);
      expect(databaseCircuitBreaker).toBeInstanceOf(CircuitBreaker);
      expect(searchCircuitBreaker.serviceName).toBe('test-service-search');
    });

    test('should reuse existing circuit breakers', () => {
      const cb1 = reliabilityManager.getCircuitBreaker('search');
      const cb2 = reliabilityManager.getCircuitBreaker('search');
      
      expect(cb1).toBe(cb2);
    });

    test('should execute with circuit breaker protection', async () => {
      const successFn = jest.fn().mockResolvedValue('success');
      
      const result = await reliabilityManager.executeWithCircuitBreaker('search', successFn);
      
      expect(result).toBe('success');
      expect(successFn).toHaveBeenCalledTimes(1);
    });

    test('should handle circuit breaker rejections', async () => {
      const failureFn = jest.fn().mockRejectedValue(new Error('Service error'));
      
      // Force circuit breaker open
      const cb = reliabilityManager.getCircuitBreaker('search');
      for (let i = 0; i < 3; i++) {
        try { await cb.execute(failureFn); } catch {}
      }
      
      const rejectFn = jest.fn();
      
      await expect(reliabilityManager.executeWithCircuitBreaker('search', rejectFn))
        .rejects.toThrow('Circuit breaker is OPEN');
      
      expect(rejectFn).not.toHaveBeenCalled();
    });
  });

  describe('Retry Policy Management', () => {
    test('should create and manage retry policies', () => {
      const searchRetryPolicy = reliabilityManager.getRetryPolicy('search');
      const databaseRetryPolicy = reliabilityManager.getRetryPolicy('database');
      
      expect(searchRetryPolicy).toBeInstanceOf(RetryPolicy);
      expect(databaseRetryPolicy).toBeInstanceOf(RetryPolicy);
      expect(searchRetryPolicy.operationName).toBe('test-service-search');
    });

    test('should reuse existing retry policies', () => {
      const rp1 = reliabilityManager.getRetryPolicy('search');
      const rp2 = reliabilityManager.getRetryPolicy('search');
      
      expect(rp1).toBe(rp2);
    });

    test('should execute with retry protection', async () => {
      const attemptFn = jest.fn()
        .mockRejectedValueOnce(new Error('Network timeout'))
        .mockResolvedValue('success');
      
      const result = await reliabilityManager.executeWithRetry('search', attemptFn);
      
      expect(result).toBe('success');
      expect(attemptFn).toHaveBeenCalledTimes(2);
    });

    test('should exhaust retries and fail', async () => {
      const failureFn = jest.fn().mockRejectedValue(new Error('Always fails'));
      
      await expect(reliabilityManager.executeWithRetry('search', failureFn))
        .rejects.toThrow('Always fails');
      
      expect(failureFn).toHaveBeenCalledTimes(3); // maxAttempts
    });
  });

  describe('Timeout Management', () => {
    test('should execute with timeout protection', async () => {
      const fastFn = jest.fn().mockResolvedValue('fast');
      
      const result = await reliabilityManager.executeWithTimeout('search', fastFn);
      
      expect(result).toBe('fast');
      expect(fastFn).toHaveBeenCalledTimes(1);
    });

    test('should timeout slow operations', async () => {
      const slowFn = jest.fn().mockImplementation(() => 
        new Promise(resolve => setTimeout(resolve, 10000))
      );
      
      await expect(reliabilityManager.executeWithTimeout('search', slowFn))
        .rejects.toThrow('timed out');
      
      expect(slowFn).toHaveBeenCalledTimes(1);
    });

    test('should use custom timeout', async () => {
      const slowFn = jest.fn().mockImplementation(() => 
        new Promise(resolve => setTimeout(resolve, 2000))
      );
      
      await expect(reliabilityManager.executeWithTimeout('search', slowFn, { timeout: 1000 }))
        .rejects.toThrow('timed out');
    });
  });

  describe('Combined Protection', () => {
    test('should execute with all protection layers', async () => {
      const successFn = jest.fn().mockResolvedValue('success');
      
      const result = await reliabilityManager.execute('search', successFn);
      
      expect(result).toBe('success');
      expect(successFn).toHaveBeenCalledTimes(1);
    });

    test('should handle failures through all layers', async () => {
      const transientError = new Error('Network timeout');
      transientError.code = 'ETIMEDOUT';
      
      const attemptFn = jest.fn()
        .mockRejectedValueOnce(transientError)
        .mockResolvedValue('success');
      
      const result = await reliabilityManager.execute('search', attemptFn);
      
      expect(result).toBe('success');
      expect(attemptFn).toHaveBeenCalledTimes(2); // 1 failure + 1 success
    });

    test('should use fallback when all layers fail', async () => {
      const failureFn = jest.fn().mockRejectedValue(new Error('Permanent failure'));
      const fallbackFn = jest.fn().mockResolvedValue('fallback-result');
      
      const result = await reliabilityManager.execute('search', failureFn, {
        fallback: fallbackFn
      });
      
      expect(result).toBe('fallback-result');
      expect(fallbackFn).toHaveBeenCalledTimes(1);
    });
  });

  describe('Search Operations', () => {
    test('should execute search with reliability protection', async () => {
      const searchFn = jest.fn().mockResolvedValue({
        results: [{ id: 1, content: 'result' }],
        total: 1
      });
      
      const result = await reliabilityManager.executeSearch('test query', searchFn);
      
      expect(result.results).toHaveLength(1);
      expect(result.reliability).toBeDefined();
      expect(result.reliability.protection).toEqual(['timeout', 'circuit-breaker', 'retry']);
    });

    test('should degrade search on failures', async () => {
      const searchFn = jest.fn().mockRejectedValue(new Error('Search failed'));
      const cacheFn = jest.fn().mockResolvedValue({
        results: [{ id: 1, content: 'cached' }],
        total: 1,
        cached: true
      });
      
      const result = await reliabilityManager.executeSearch('test query', searchFn, {
        fallbacks: { cache: cacheFn }
      });
      
      expect(result.results).toHaveLength(1);
      expect(result.cached).toBe(true);
      expect(result.reliability.degraded).toBe(true);
    });
  });

  describe('Context Assembly Operations', () => {
    test('should execute context assembly with reliability protection', async () => {
      const assemblyFn = jest.fn().mockResolvedValue({
        query: 'test',
        total_tokens: 100,
        sources: [{ type: 'code', items: [], tokens: 100 }]
      });
      
      const result = await reliabilityManager.executeContextAssembly('test query', assemblyFn);
      
      expect(result.query).toBe('test');
      expect(result.total_tokens).toBe(100);
      expect(result.reliability).toBeDefined();
    });

    test('should degrade context assembly on failures', async () => {
      const assemblyFn = jest.fn().mockRejectedValue(new Error('Assembly failed'));
      const minimalFn = jest.fn().mockResolvedValue({
        query: 'test',
        total_tokens: 50,
        sources: [],
        degraded: true
      });
      
      const result = await reliabilityManager.executeContextAssembly('test query', assemblyFn, {
        fallbacks: { minimal: minimalFn }
      });
      
      expect(result.degraded).toBe(true);
      expect(result.total_tokens).toBe(50);
    });
  });

  describe('Health Monitoring', () => {
    test('should provide comprehensive health status', () => {
      const health = reliabilityManager.getHealthStatus();
      
      expect(health).toHaveProperty('healthy');
      expect(health).toHaveProperty('service');
      expect(health).toHaveProperty('components');
      expect(health).toHaveProperty('overall');
      expect(health).toHaveProperty('timestamp');
      
      expect(health.service).toBe('test-service');
      expect(health.components).toHaveProperty('circuitBreakers');
      expect(health.components).toHaveProperty('retryPolicies');
      expect(health.components).toHaveProperty('gracefulDegradation');
      expect(health.components).toHaveProperty('timeoutManager');
    });

    test('should track component health changes', () => {
      // Force a circuit breaker to open
      const cb = reliabilityManager.getCircuitBreaker('search');
      cb.openCircuit();
      
      const health = reliabilityManager.getHealthStatus();
      
      expect(health.healthy).toBe(false);
      expect(health.components.circuitBreakers.search.state).toBe('OPEN');
    });

    test('should emit health metrics', () => {
      reliabilityManager.emitHealthMetrics();
      
      expect(mockMetrics.emitGauge).toHaveBeenCalledWith(
        'reliability_health_score',
        expect.any(Number),
        expect.objectContaining({
          service: 'test-service'
        })
      );
    });
  });

  describe('Statistics and Metrics', () => {
    test('should provide comprehensive statistics', () => {
      const stats = reliabilityManager.getStats();
      
      expect(stats).toHaveProperty('service');
      expect(stats).toHaveProperty('circuitBreakers');
      expect(stats).toHaveProperty('retryPolicies');
      expect(stats).toHaveProperty('gracefulDegradation');
      expect(stats).toHaveProperty('timeoutManager');
      expect(stats).toHaveProperty('operations');
      expect(stats).toHaveProperty('timestamp');
      
      expect(stats.service).toBe('test-service');
    });

    test('should track operation statistics', async () => {
      const successFn = jest.fn().mockResolvedValue('success');
      
      await reliabilityManager.execute('search', successFn);
      await reliabilityManager.execute('search', successFn);
      
      const stats = reliabilityManager.getStats();
      
      expect(stats.operations.total).toBe(2);
      expect(stats.operations.successful).toBe(2);
      expect(stats.operations.failed).toBe(0);
    });
  });

  describe('Configuration Management', () => {
    test('should update configuration dynamically', () => {
      reliabilityManager.updateConfig({
        timeouts: { search: 8000 },
        circuitBreakers: { search: { failureThreshold: 4 } }
      });
      
      const timeoutManager = reliabilityManager.getTimeoutManager();
      expect(timeoutManager.getTimeout('search')).toBe(8000);
      
      const circuitBreaker = reliabilityManager.getCircuitBreaker('search');
      expect(circuitBreaker.options.failureThreshold).toBe(4);
    });

    test('should validate configuration', () => {
      expect(() => {
        reliabilityManager.updateConfig({
          timeouts: { search: -1000 }
        });
      }).toThrow('Invalid timeout value');
      
      expect(() => {
        reliabilityManager.updateConfig({
          circuitBreakers: { search: { failureThreshold: 0 } }
        });
      }).toThrow('Invalid failure threshold');
    });
  });

  describe('Lifecycle Management', () => {
    test('should start and stop reliability manager', () => {
      const manager = new ReliabilityManager('test');
      
      expect(manager.isStarted()).toBe(true);
      
      manager.stop();
      expect(manager.isStarted()).toBe(false);
      
      manager.start();
      expect(manager.isStarted()).toBe(true);
    });

    test('should perform graceful shutdown', () => {
      const manager = new ReliabilityManager('test');
      
      manager.shutdown();
      
      expect(manager.isStarted()).toBe(false);
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('shutdown'),
        expect.any(String),
        expect.objectContaining({
          service: 'test'
        })
      );
    });
  });

  describe('Error Handling', () => {
    test('should handle invalid operation names gracefully', async () => {
      const fn = jest.fn().mockResolvedValue('success');
      
      // Should use default configuration for unknown operations
      const result = await reliabilityManager.execute('unknown-operation', fn);
      
      expect(result).toBe('success');
    });

    test('should handle missing fallbacks gracefully', async () => {
      const failureFn = jest.fn().mockRejectedValue(new Error('Failed'));
      
      await expect(reliabilityManager.execute('search', failureFn))
        .rejects.toThrow('Failed');
    });
  });
});