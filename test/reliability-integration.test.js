/**
 * Reliability Integration Tests
 * 
 * Test the complete reliability system integrated with PAMPAX components
 */

const { ReliabilityManager } = require('../src/reliability/reliability-manager.js');
const { ContextAssembler } = require('../src/context/assembler.js');
const { getCacheManager } = require('../src/cache/cache-manager.js');
const { getMetricsCollector } = require('../src/metrics/metrics-collector.js');
const { getLogger } = require('../src/utils/structured-logger.js');

describe('Reliability Integration', () => {
  let reliabilityManager;
  let contextAssembler;
  let cacheManager;
  let mockDatabase;
  let mockMetrics;
  let mockLogger;

  beforeEach(() => {
    // Mock database
    mockDatabase = {
      search: jest.fn(),
      memory: {
        search: jest.fn()
      }
    };

    // Mock metrics and logger
    mockMetrics = {
      emitCounter: jest.fn(),
      emitGauge: jest.fn(),
      emitTiming: jest.fn()
    };
    
    mockLogger = {
      warn: jest.fn(),
      info: jest.fn(),
      debug: jest.fn(),
      error: jest.fn(),
      getCorrelationId: jest.fn().mockReturnValue('test-corr-id')
    };

    jest.spyOn(require('../src/metrics/metrics-collector.js'), 'getMetricsCollector').mockReturnValue(mockMetrics);
    jest.spyOn(require('../src/utils/structured-logger.js'), 'getLogger').mockReturnValue(mockLogger);

    // Initialize components
    reliabilityManager = new ReliabilityManager('test-integration', {
      timeouts: {
        search: 2000,
        assembly: 5000
      },
      circuitBreakers: {
        search: { failureThreshold: 2 },
        assembly: { failureThreshold: 3 }
      },
      retryPolicies: {
        search: { maxAttempts: 2 },
        assembly: { maxAttempts: 3 }
      }
    });

    cacheManager = getCacheManager();
    contextAssembler = new ContextAssembler(mockDatabase, {
      cacheEnabled: true,
      graphEnabled: false
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (reliabilityManager) {
      reliabilityManager.shutdown();
    }
  });

  describe('Search with Reliability', () => {
    test('should execute search with full reliability protection', async () => {
      const searchResults = [
        { id: 1, content: 'result 1', score: 0.9 },
        { id: 2, content: 'result 2', score: 0.8 }
      ];

      mockDatabase.search.mockResolvedValue(searchResults);

      const searchFn = async (query) => {
        return await mockDatabase.search(query, { limit: 10 });
      };

      const result = await reliabilityManager.executeSearch('test query', searchFn);

      expect(result.results).toEqual(searchResults);
      expect(result.reliability.protected).toBe(true);
      expect(result.reliability.protection).toContain('timeout');
      expect(result.reliability.protection).toContain('circuit-breaker');
      expect(result.reliability.protection).toContain('retry');
      expect(result.reliability.protection).toContain('degradation');
      expect(result.reliability.service).toBe('test-integration');
    });

    test('should handle search failures with graceful degradation', async () => {
      mockDatabase.search.mockRejectedValue(new Error('Search service unavailable'));

      const searchFn = async (query) => {
        return await mockDatabase.search(query, { limit: 10 });
      };

      const result = await reliabilityManager.executeSearch('test query', searchFn);

      expect(result.results).toEqual([]);
      expect(result.total).toBe(0);
      expect(result.reliability.degraded).toBe(true);
      expect(result.reliability.fallback).toBe('empty_result');
    });

    test('should retry transient search failures', async () => {
      mockDatabase.search
        .mockRejectedValueOnce(new Error('Network timeout'))
        .mockResolvedValue([{ id: 1, content: 'result', score: 0.9 }]);

      const searchFn = async (query) => {
        return await mockDatabase.search(query, { limit: 10 });
      };

      const result = await reliabilityManager.executeSearch('test query', searchFn);

      expect(result.results).toHaveLength(1);
      expect(mockDatabase.search).toHaveBeenCalledTimes(2);
    });

    test('should timeout slow search operations', async () => {
      mockDatabase.search.mockImplementation(() => 
        new Promise(resolve => setTimeout(resolve, 5000))
      );

      const searchFn = async (query) => {
        return await mockDatabase.search(query, { limit: 10 });
      };

      const result = await reliabilityManager.executeSearch('test query', searchFn);

      expect(result.results).toEqual([]);
      expect(result.reliability.degraded).toBe(true);
    });
  });

  describe('Context Assembly with Reliability', () => {
    test('should execute context assembly with reliability protection', async () => {
      const mockBundle = {
        query: 'test query',
        total_tokens: 100,
        sources: [
          { type: 'code', items: [], tokens: 100 }
        ],
        assembled_at: new Date().toISOString(),
        budget_used: 0.5
      };

      jest.spyOn(contextAssembler, 'assembleWithExplanation').mockResolvedValue(mockBundle);

      const assemblyFn = async (query) => {
        return await contextAssembler.assembleWithExplanation(query, { budget: 500 });
      };

      const result = await reliabilityManager.executeContextAssembly('test query', assemblyFn);

      expect(result.query).toBe('test query');
      expect(result.total_tokens).toBe(100);
      expect(result.reliability.protected).toBe(true);
      expect(result.reliability.protection).toContain('timeout');
      expect(result.reliability.protection).toContain('circuit-breaker');
      expect(result.reliability.protection).toContain('retry');
    });

    test('should handle assembly failures with minimal context', async () => {
      jest.spyOn(contextAssembler, 'assembleWithExplanation')
        .mockRejectedValue(new Error('Assembly service failed'));

      const assemblyFn = async (query) => {
        return await contextAssembler.assembleWithExplanation(query, { budget: 500 });
      };

      const result = await reliabilityManager.executeContextAssembly('test query', assemblyFn);

      expect(result.query).toBe('test query');
      expect(result.total_tokens).toBe(0);
      expect(result.degraded).toBe(true);
      expect(result.reliability.degraded).toBe(true);
      expect(result.reliability.fallback).toBe('minimal_context');
    });

    test('should use cache fallback for context assembly', async () => {
      const cachedBundle = {
        query: 'test query',
        total_tokens: 80,
        sources: [
          { type: 'code', items: [], tokens: 80 }
        ],
        assembled_at: new Date().toISOString(),
        budget_used: 0.4,
        cached: true
      };

      // Set up cache
      const cacheKey = 'context-test-query';
      await cacheManager.set('bundle', cacheKey, cachedBundle);

      jest.spyOn(contextAssembler, 'assembleWithExplanation')
        .mockRejectedValue(new Error('Assembly failed'));

      const assemblyFn = async (query) => {
        return await contextAssembler.assembleWithExplanation(query, { budget: 500 });
      };

      const result = await reliabilityManager.executeContextAssembly('test query', assemblyFn, {
        cacheKey,
        cache: cacheManager
      });

      expect(result.total_tokens).toBe(80);
      expect(result.cached).toBe(true);
    });
  });

  describe('Circuit Breaker Integration', () => {
    test('should open circuit breaker on repeated failures', async () => {
      mockDatabase.search.mockRejectedValue(new Error('Service unavailable'));

      const searchFn = async (query) => {
        return await mockDatabase.search(query, { limit: 10 });
      };

      // Execute multiple times to trigger circuit breaker
      for (let i = 0; i < 3; i++) {
        try {
          await reliabilityManager.executeSearch('test query', searchFn);
        } catch (error) {
          // Expected to fail
        }
      }

      const circuitBreaker = reliabilityManager.getCircuitBreaker('search');
      expect(circuitBreaker.getState()).toBe('OPEN');

      // Next call should be rejected immediately
      const result = await reliabilityManager.executeSearch('test query', searchFn);
      expect(result.results).toEqual([]);
      expect(result.reliability.degraded).toBe(true);
    });

    test('should recover circuit breaker after timeout', async () => {
      const circuitBreaker = reliabilityManager.getCircuitBreaker('search');
      
      // Manually open circuit breaker
      circuitBreaker.openCircuit();
      expect(circuitBreaker.getState()).toBe('OPEN');

      // Wait for recovery timeout (shortened for test)
      circuitBreaker.options.recoveryTimeout = 100;
      
      await new Promise(resolve => setTimeout(resolve, 150));

      mockDatabase.search.mockResolvedValue([{ id: 1, content: 'recovered', score: 0.9 }]);

      const searchFn = async (query) => {
        return await mockDatabase.search(query, { limit: 10 });
      };

      const result = await reliabilityManager.executeSearch('test query', searchFn);

      expect(result.results).toHaveLength(1);
      expect(circuitBreaker.getState()).toBe('CLOSED');
    });
  });

  describe('Health Monitoring Integration', () => {
    test('should provide comprehensive health status', () => {
      const health = reliabilityManager.getHealthStatus();

      expect(health).toHaveProperty('healthy');
      expect(health).toHaveProperty('score');
      expect(health).toHaveProperty('service');
      expect(health).toHaveProperty('components');
      expect(health).toHaveProperty('overall');
      expect(health).toHaveProperty('uptime');
      expect(health).toHaveProperty('timestamp');

      expect(health.service).toBe('test-integration');
      expect(health.components).toHaveProperty('circuitBreakers');
      expect(health.components).toHaveProperty('timeoutManager');
      expect(health.components).toHaveProperty('gracefulDegradation');
    });

    test('should track component health changes', async () => {
      // Force a failure
      mockDatabase.search.mockRejectedValue(new Error('Service down'));

      const searchFn = async (query) => {
        return await mockDatabase.search(query, { limit: 10 });
      };

      // Execute to trigger failure tracking
      try {
        await reliabilityManager.executeSearch('test query', searchFn);
      } catch (error) {
        // Expected
      }

      const health = reliabilityManager.getHealthStatus();
      expect(health.components.circuitBreakers).toHaveProperty('search');
    });

    test('should emit reliability metrics', async () => {
      mockDatabase.search.mockResolvedValue([{ id: 1, content: 'result', score: 0.9 }]);

      const searchFn = async (query) => {
        return await mockDatabase.search(query, { limit: 10 });
      };

      await reliabilityManager.executeSearch('test query', searchFn);

      expect(mockMetrics.emitTiming).toHaveBeenCalledWith(
        'reliability_operation_duration_ms',
        expect.any(Number),
        expect.objectContaining({
          service: 'test-integration',
          operationType: 'search',
          success: 'true'
        })
      );

      expect(mockMetrics.emitCounter).toHaveBeenCalledWith(
        'reliability_operations',
        1,
        expect.objectContaining({
          service: 'test-integration',
          operationType: 'search',
          success: 'true'
        })
      );
    });
  });

  describe('Performance Impact', () => {
    test('should have minimal performance overhead', async () => {
      mockDatabase.search.mockResolvedValue([{ id: 1, content: 'result', score: 0.9 }]);

      const searchFn = async (query) => {
        return await mockDatabase.search(query, { limit: 10 });
      };

      // Measure execution with reliability
      const startTime = Date.now();
      await reliabilityManager.executeSearch('test query', searchFn);
      const reliabilityDuration = Date.now() - startTime;

      // Measure execution without reliability
      const directStartTime = Date.now();
      await searchFn('test query');
      const directDuration = Date.now() - directStartTime;

      // Overhead should be less than 50ms (5% of typical operation)
      const overhead = reliabilityDuration - directDuration;
      expect(overhead).toBeLessThan(50);
    });

    test('should handle concurrent operations efficiently', async () => {
      mockDatabase.search.mockResolvedValue([{ id: 1, content: 'result', score: 0.9 }]);

      const searchFn = async (query) => {
        return await mockDatabase.search(query, { limit: 10 });
      };

      // Execute multiple concurrent searches
      const promises = Array.from({ length: 10 }, (_, i) => 
        reliabilityManager.executeSearch(`query ${i}`, searchFn)
      );

      const startTime = Date.now();
      const results = await Promise.all(promises);
      const duration = Date.now() - startTime;

      expect(results).toHaveLength(10);
      results.forEach(result => {
        expect(result.results).toHaveLength(1);
      });

      // Should complete in reasonable time (less than 1 second for 10 concurrent ops)
      expect(duration).toBeLessThan(1000);
    });
  });

  describe('Configuration Integration', () => {
    test('should allow dynamic configuration updates', async () => {
      // Update configuration
      reliabilityManager.updateConfig({
        timeouts: { search: 1000 },
        circuitBreakers: { search: { failureThreshold: 1 } }
      });

      const timeoutManager = reliabilityManager.getTimeoutManager();
      expect(timeoutManager.getTimeout('search')).toBe(1000);

      const circuitBreaker = reliabilityManager.getCircuitBreaker('search');
      expect(circuitBreaker.options.failureThreshold).toBe(1);
    });

    test('should validate configuration changes', () => {
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

  describe('Error Handling Integration', () => {
    test('should handle mixed error types gracefully', async () => {
      // Test different error types
      const errors = [
        new Error('Network timeout'),
        new Error('Connection refused'),
        new Error('Service unavailable')
      ];

      for (const error of errors) {
        mockDatabase.search.mockRejectedValueOnce(error);

        const searchFn = async (query) => {
          return await mockDatabase.search(query, { limit: 10 });
        };

        const result = await reliabilityManager.executeSearch('test query', searchFn);

        // Should degrade gracefully for all error types
        expect(result.reliability).toBeDefined();
      }
    });

    test('should preserve error context through reliability layers', async () => {
      const originalError = new Error('Database connection failed');
      originalError.code = 'ECONNREFUSED';
      
      mockDatabase.search.mockRejectedValue(originalError);

      const searchFn = async (query) => {
        return await mockDatabase.search(query, { limit: 10 });
      };

      const result = await reliabilityManager.executeSearch('test query', searchFn);

      expect(result.reliability.error).toContain('Database connection failed');
    });
  });
});