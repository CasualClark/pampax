/**
 * Graceful Degradation Tests
 * 
 * Test-driven implementation of graceful degradation strategies
 */

const { GracefulDegradation, DegradationLevel, FallbackStrategy } = require('./graceful-degradation.js');
const { getMetricsCollector } = require('../metrics/metrics-collector.js');
const { getLogger } = require('../utils/structured-logger.js');

describe('GracefulDegradation', () => {
  let degradation;
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

    degradation = new GracefulDegradation('test-service', {
      levels: [
        {
          name: 'full',
          threshold: 0.95,
          strategies: ['primary']
        },
        {
          name: 'degraded',
          threshold: 0.8,
          strategies: ['primary', 'cache']
        },
        {
          name: 'minimal',
          threshold: 0.6,
          strategies: ['cache', 'fallback']
        },
        {
          name: 'emergency',
          threshold: 0.0,
          strategies: ['fallback']
        }
      ]
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Initialization', () => {
    test('should initialize with default configuration', () => {
      const defaultDegradation = new GracefulDegradation('test');
      expect(defaultDegradation.getCurrentLevel()).toBe(DegradationLevel.FULL);
      expect(defaultDegradation.getHealthScore()).toBe(1.0);
    });

    test('should accept custom degradation levels', () => {
      const customDegradation = new GracefulDegradation('test', {
        levels: [
          { name: 'full', threshold: 0.9, strategies: ['primary'] },
          { name: 'reduced', threshold: 0.5, strategies: ['cache'] }
        ]
      });

      expect(customDegradation.getLevels()).toHaveLength(2);
      expect(customDegradation.getLevels()[0].name).toBe('full');
    });
  });

  describe('Health Score Management', () => {
    test('should start with full health score', () => {
      expect(degradation.getHealthScore()).toBe(1.0);
      expect(degradation.getCurrentLevel()).toBe(DegradationLevel.FULL);
    });

    test('should update health score and adjust level', () => {
      degradation.updateHealthScore(0.85);
      
      expect(degradation.getHealthScore()).toBe(0.85);
      expect(degradation.getCurrentLevel()).toBe(DegradationLevel.DEGRADED);
      
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Degradation level changed'),
        expect.any(String),
        expect.objectContaining({
          service: 'test-service',
          from: 'full',
          to: 'degraded',
          healthScore: 0.85
        })
      );
    });

    test('should emit metrics on level change', () => {
      degradation.updateHealthScore(0.7);
      
      expect(mockMetrics.emitGauge).toHaveBeenCalledWith(
        'degradation_health_score',
        0.7,
        expect.objectContaining({
          service: 'test-service'
        })
      );
      
      expect(mockMetrics.emitCounter).toHaveBeenCalledWith(
        'degradation_level_changes',
        1,
        expect.objectContaining({
          service: 'test-service',
          from: 'full',
          to: 'minimal'
        })
      );
    });

    test('should not change level if health score is within current level', () => {
      degradation.updateHealthScore(0.92);
      
      expect(degradation.getCurrentLevel()).toBe(DegradationLevel.FULL);
      expect(mockLogger.warn).not.toHaveBeenCalled();
    });
  });

  describe('Strategy Execution', () => {
    test('should execute primary strategy in full health', async () => {
      const primaryFn = jest.fn().mockResolvedValue('primary-result');
      const cacheFn = jest.fn().mockResolvedValue('cache-result');
      const fallbackFn = jest.fn().mockResolvedValue('fallback-result');

      const result = await degradation.execute({
        primary: primaryFn,
        cache: cacheFn,
        fallback: fallbackFn
      });

      expect(result).toBe('primary-result');
      expect(primaryFn).toHaveBeenCalledTimes(1);
      expect(cacheFn).not.toHaveBeenCalled();
      expect(fallbackFn).not.toHaveBeenCalled();
    });

    test('should execute cache strategy in degraded health', async () => {
      degradation.updateHealthScore(0.85);
      
      const primaryFn = jest.fn().mockRejectedValue(new Error('Primary failed'));
      const cacheFn = jest.fn().mockResolvedValue('cache-result');
      const fallbackFn = jest.fn().mockResolvedValue('fallback-result');

      const result = await degradation.execute({
        primary: primaryFn,
        cache: cacheFn,
        fallback: fallbackFn
      });

      expect(result).toBe('cache-result');
      expect(primaryFn).toHaveBeenCalledTimes(1);
      expect(cacheFn).toHaveBeenCalledTimes(1);
      expect(fallbackFn).not.toHaveBeenCalled();
    });

    test('should execute fallback strategy in emergency mode', async () => {
      degradation.updateHealthScore(0.4);
      
      const primaryFn = jest.fn();
      const cacheFn = jest.fn();
      const fallbackFn = jest.fn().mockResolvedValue('fallback-result');

      const result = await degradation.execute({
        primary: primaryFn,
        cache: cacheFn,
        fallback: fallbackFn
      });

      expect(result).toBe('fallback-result');
      expect(primaryFn).not.toHaveBeenCalled();
      expect(cacheFn).not.toHaveBeenCalled();
      expect(fallbackFn).toHaveBeenCalledTimes(1);
    });

    test('should handle strategy failures gracefully', async () => {
      degradation.updateHealthScore(0.85);
      
      const primaryFn = jest.fn().mockRejectedValue(new Error('Primary failed'));
      const cacheFn = jest.fn().mockRejectedValue(new Error('Cache failed'));
      const fallbackFn = jest.fn().mockResolvedValue('fallback-result');

      const result = await degradation.execute({
        primary: primaryFn,
        cache: cacheFn,
        fallback: fallbackFn
      });

      expect(result).toBe('fallback-result');
      expect(primaryFn).toHaveBeenCalledTimes(1);
      expect(cacheFn).toHaveBeenCalledTimes(1);
      expect(fallbackFn).toHaveBeenCalledTimes(1);
    });

    test('should throw error if all strategies fail', async () => {
      const primaryFn = jest.fn().mockRejectedValue(new Error('Primary failed'));
      const cacheFn = jest.fn().mockRejectedValue(new Error('Cache failed'));
      const fallbackFn = jest.fn().mockRejectedValue(new Error('Fallback failed'));

      await expect(degradation.execute({
        primary: primaryFn,
        cache: cacheFn,
        fallback: fallbackFn
      })).rejects.toThrow('All degradation strategies failed');
    });
  });

  describe('Component Health Tracking', () => {
    test('should track individual component health', () => {
      degradation.setComponentHealth('database', 0.9);
      degradation.setComponentHealth('cache', 0.7);
      degradation.setComponentHealth('external-api', 0.3);

      expect(degradation.getComponentHealth('database')).toBe(0.9);
      expect(degradation.getComponentHealth('cache')).toBe(0.7);
      expect(degradation.getComponentHealth('external-api')).toBe(0.3);
    });

    test('should calculate overall health from components', () => {
      degradation.setComponentHealth('database', 0.8);
      degradation.setComponentHealth('cache', 0.6);
      degradation.setComponentHealth('external-api', 0.4);

      const overallHealth = degradation.calculateOverallHealth();
      expect(overallHealth).toBeCloseTo(0.6, 2); // Average of components
    });

    test('should update health score based on components', () => {
      degradation.setComponentHealth('database', 0.7);
      degradation.setComponentHealth('cache', 0.5);
      degradation.setComponentHealth('external-api', 0.3);

      degradation.updateHealthFromComponents();

      expect(degradation.getHealthScore()).toBeCloseTo(0.5, 2);
      expect(degradation.getCurrentLevel()).toBe(DegradationLevel.MINIMAL);
    });

    test('should handle missing components gracefully', () => {
      expect(degradation.getComponentHealth('nonexistent')).toBe(1.0);
    });
  });

  describe('Fallback Strategies', () => {
    test('should support timeout fallback', async () => {
      const slowFn = jest.fn().mockImplementation(() => 
        new Promise(resolve => setTimeout(resolve, 200))
      );
      const fastFn = jest.fn().mockResolvedValue('fast-result');

      const result = await degradation.executeWithTimeout({
        primary: slowFn,
        fallback: fastFn
      }, 100);

      expect(result).toBe('fast-result');
      expect(slowFn).toHaveBeenCalledTimes(1);
      expect(fastFn).toHaveBeenCalledTimes(1);
    });

    test('should support circuit breaker fallback', async () => {
      const mockCircuitBreaker = {
        execute: jest.fn().mockRejectedValue(new Error('Circuit open'))
      };

      const fallbackFn = jest.fn().mockResolvedValue('fallback-result');

      const result = await degradation.executeWithCircuitBreaker({
        primary: mockCircuitBreaker.execute,
        fallback: fallbackFn
      });

      expect(result).toBe('fallback-result');
      expect(mockCircuitBreaker.execute).toHaveBeenCalledTimes(1);
      expect(fallbackFn).toHaveBeenCalledTimes(1);
    });

    test('should support cache fallback', async () => {
      const mockCache = {
        get: jest.fn().mockResolvedValue(null),
        set: jest.fn()
      };

      const primaryFn = jest.fn().mockRejectedValue(new Error('Primary failed'));
      const cacheKey = 'test-key';

      const result = await degradation.executeWithCache({
        primary: primaryFn,
        cacheKey
      }, mockCache);

      expect(primaryFn).toHaveBeenCalledTimes(1);
      expect(mockCache.get).toHaveBeenCalledWith(cacheKey);
    });
  });

  describe('Search-Specific Degradation', () => {
    test('should degrade search gracefully', async () => {
      const searchFn = jest.fn().mockRejectedValue(new Error('Search failed'));
      const cacheFn = jest.fn().mockResolvedValue([{ id: 1, content: 'cached' }]);
      const basicFn = jest.fn().mockResolvedValue([{ id: 2, content: 'basic' }]);

      const result = await degradation.executeSearch({
        advanced: searchFn,
        cache: cacheFn,
        basic: basicFn
      });

      expect(result).toEqual([{ id: 1, content: 'cached' }]);
    });

    test('should return partial results on partial failure', async () => {
      degradation.updateHealthScore(0.7);

      const searchFn = jest.fn().mockResolvedValue([{ id: 1, content: 'partial' }]);
      const fallbackFn = jest.fn().mockResolvedValue([{ id: 2, content: 'fallback' }]);

      const result = await degradation.executeSearchWithPartial({
        primary: searchFn,
        fallback: fallbackFn
      });

      expect(result).toEqual([{ id: 1, content: 'partial' }]);
    });
  });

  describe('Context Assembly Degradation', () => {
    test('should degrade context assembly gracefully', async () => {
      const advancedAssembly = jest.fn().mockRejectedValue(new Error('Advanced assembly failed'));
      const basicAssembly = jest.fn().mockResolvedValue({
        query: 'test',
        total_tokens: 100,
        sources: [{ type: 'basic', items: [], tokens: 100 }]
      });

      const result = await degradation.executeContextAssembly({
        advanced: advancedAssembly,
        basic: basicAssembly
      });

      expect(result.query).toBe('test');
      expect(result.total_tokens).toBe(100);
      expect(basicAssembly).toHaveBeenCalledTimes(1);
    });

    test('should return minimal context on emergency', async () => {
      degradation.updateHealthScore(0.3);

      const minimalAssembly = jest.fn().mockResolvedValue({
        query: 'test',
        total_tokens: 50,
        sources: [{ type: 'minimal', items: [], tokens: 50 }],
        degraded: true
      });

      const result = await degradation.executeContextAssembly({
        minimal: minimalAssembly
      });

      expect(result.degraded).toBe(true);
      expect(result.total_tokens).toBe(50);
    });
  });

  describe('Metrics and Monitoring', () => {
    test('should emit degradation metrics', async () => {
      const primaryFn = jest.fn().mockResolvedValue('success');
      
      await degradation.execute({ primary: primaryFn });

      expect(mockMetrics.emitCounter).toHaveBeenCalledWith(
        'degradation_strategy_executions',
        1,
        expect.objectContaining({
          service: 'test-service',
          strategy: 'primary',
          level: 'full'
        })
      );
    });

    test('should track strategy performance', async () => {
      const slowFn = jest.fn().mockImplementation(() => 
        new Promise(resolve => setTimeout(resolve, 100))
      );

      await degradation.execute({ primary: slowFn });

      expect(mockMetrics.emitTiming).toHaveBeenCalledWith(
        'degradation_strategy_duration_ms',
        expect.any(Number),
        expect.objectContaining({
          service: 'test-service',
          strategy: 'primary'
        })
      );
    });
  });

  describe('Recovery', () => {
    test('should recover to full health when components improve', () => {
      degradation.setComponentHealth('database', 0.5);
      degradation.updateHealthFromComponents();
      expect(degradation.getCurrentLevel()).toBe(DegradationLevel.MINIMAL);

      degradation.setComponentHealth('database', 0.95);
      degradation.updateHealthFromComponents();
      expect(degradation.getCurrentLevel()).toBe(DegradationLevel.FULL);
    });

    test('should emit recovery metrics', () => {
      degradation.updateHealthScore(0.7);
      degradation.updateHealthScore(0.98);

      expect(mockMetrics.emitCounter).toHaveBeenCalledWith(
        'degradation_recoveries',
        1,
        expect.objectContaining({
          service: 'test-service',
          from: 'minimal',
          to: 'full'
        })
      );
    });
  });

  describe('Statistics and Health', () => {
    test('should provide comprehensive statistics', () => {
      degradation.updateHealthScore(0.8);
      degradation.setComponentHealth('database', 0.7);

      const stats = degradation.getStats();

      expect(stats).toHaveProperty('currentLevel');
      expect(stats).toHaveProperty('healthScore');
      expect(stats).toHaveProperty('componentHealth');
      expect(stats).toHaveProperty('levelHistory');
      expect(stats).toHaveProperty('strategyExecutions');
      expect(stats).toHaveProperty('timestamp');
    });

    test('should provide health status', () => {
      const health = degradation.getHealthStatus();

      expect(health).toHaveProperty('healthy');
      expect(health).toHaveProperty('level');
      expect(health).toHaveProperty('healthScore');
      expect(health).toHaveProperty('components');
      expect(health).toHaveProperty('timestamp');
    });
  });
});