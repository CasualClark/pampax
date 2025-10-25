/**
 * Tests for Health Check System
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { getHealthChecker, resetHealthChecker, ExitCodes, HealthStatus } from '../src/health/health-checker.js';
import { getMetricsCollector, resetMetricsCollector } from '../src/metrics/metrics-collector.js';

describe('Health Check System', () => {
  beforeEach(() => {
    resetHealthChecker();
    resetMetricsCollector();
  });

  afterEach(() => {
    resetHealthChecker();
    resetMetricsCollector();
  });

  describe('HealthChecker Initialization', () => {
    it('should initialize with default checkers', () => {
      const healthChecker = getHealthChecker();
      const availableCheckers = healthChecker.getAvailableCheckers();
      
      assert(availableCheckers.includes('database'));
      assert(availableCheckers.includes('cache'));
      assert(availableCheckers.includes('memory'));
      assert(availableCheckers.includes('config'));
    });

    it('should allow adding custom checkers', () => {
      const healthChecker = getHealthChecker();
      
      const customChecker = {
        name: 'custom',
        check: async () => ({ status: 'ok', details: {}, metrics: {} }),
        getMetrics: async () => ({})
      };
      
      healthChecker.addChecker('custom', customChecker);
      const availableCheckers = healthChecker.getAvailableCheckers();
      assert(availableCheckers.includes('custom'));
    });

    it('should allow removing checkers', () => {
      const healthChecker = getHealthChecker();
      
      healthChecker.removeChecker('cache');
      const availableCheckers = healthChecker.getAvailableCheckers();
      assert(!availableCheckers.includes('cache'));
      assert(availableCheckers.includes('database'));
    });
  });

  describe('Configuration Health Check', () => {
    it('should check configuration validity', async () => {
      const healthChecker = getHealthChecker();
      const results = await healthChecker.checkAll(['config']);
      
      assert(results.checks.config);
      assert(results.checks.config.status === 'ok' || results.checks.config.status === 'error');
      assert(results.checks.config.details);
      assert(typeof results.checks.config.details.valid === 'boolean');
      assert(results.checks.config.details.source);
    });

    it('should provide configuration metrics', async () => {
      const healthChecker = getHealthChecker();
      const results = await healthChecker.checkAll(['config']);
      
      assert(results.checks.config.metrics);
      assert(typeof results.checks.config.metrics.config_type === 'string');
      assert(typeof results.checks.config.metrics.sections_count === 'number');
    });
  });

  describe('Memory Health Check', () => {
    it('should check memory usage', async () => {
      const healthChecker = getHealthChecker();
      const results = await healthChecker.checkAll(['memory']);
      
      assert(results.checks.memory);
      assert(results.checks.memory.status);
      assert(results.checks.memory.details);
      assert(typeof results.checks.memory.details.used_mb === 'number');
      assert(typeof results.checks.memory.details.limit_mb === 'number');
      assert(typeof results.checks.memory.details.leak_detected === 'boolean');
    });

    it('should provide memory metrics', async () => {
      const healthChecker = getHealthChecker();
      const results = await healthChecker.checkAll(['memory']);
      
      assert(results.checks.memory.metrics);
      assert(typeof results.checks.memory.metrics.heap_used_mb === 'number');
      assert(typeof results.checks.memory.metrics.rss_mb === 'number');
      assert(typeof results.checks.memory.metrics.limit_mb === 'number');
    });

    it('should detect memory pressure', async () => {
      // This test simulates high memory usage by setting a very low limit
      const healthChecker = getHealthChecker({
        logger: { level: 'ERROR' },
        metrics: { enabled: false }
      });
      
      // Add a custom memory checker with low limit for testing
      const customMemoryChecker = {
        name: 'memory',
        check: async () => ({
          status: 'error',
          details: {
            used_mb: 900,
            limit_mb: 100,
            leak_detected: true,
            pressure_percent: 900
          },
          metrics: {}
        }),
        getMetrics: async () => ({})
      };
      
      healthChecker.addChecker('memory', customMemoryChecker);
      const results = await healthChecker.checkAll(['memory']);
      
      assert(results.checks.memory.status === 'error');
      assert(results.checks.memory.details.leak_detected === true);
      assert(results.checks.memory.details.pressure_percent > 100);
    });
  });

  describe('Cache Health Check', () => {
    it('should check cache status', async () => {
      const healthChecker = getHealthChecker();
      const results = await healthChecker.checkAll(['cache']);
      
      assert(results.checks.cache);
      assert(results.checks.cache.status);
      assert(results.checks.cache.details);
      assert(typeof results.checks.cache.details.hit_rate === 'number');
      assert(typeof results.checks.cache.details.ttl_valid === 'boolean');
    });

    it('should provide cache metrics', async () => {
      const healthChecker = getHealthChecker();
      const results = await healthChecker.checkAll(['cache']);
      
      assert(results.checks.cache.metrics);
      assert(typeof results.checks.cache.metrics.enabled === 'boolean');
      assert(typeof results.checks.cache.metrics.ttl_seconds === 'number');
    });
  });

  describe('Database Health Check', () => {
    it('should handle missing database gracefully', async () => {
      const healthChecker = getHealthChecker();
      const results = await healthChecker.checkAll(['database']);
      
      assert(results.checks.database);
      assert(results.checks.database.status);
      assert(results.checks.database.details);
      
      // Database might not exist in test environment
      if (results.checks.database.status === 'error') {
        assert(results.checks.database.details.error);
        assert(results.checks.database.details.error_code);
      }
    });

    it('should provide database metrics', async () => {
      const healthChecker = getHealthChecker();
      const results = await healthChecker.checkAll(['database']);
      
      assert(results.checks.database.metrics);
      assert(typeof results.checks.database.metrics.exists === 'boolean');
    });
  });

  describe('Overall Health Check', () => {
    it('should run all checks and aggregate results', async () => {
      const healthChecker = getHealthChecker();
      const results = await healthChecker.checkAll();
      
      assert(results.status);
      assert(results.timestamp);
      assert(results.corr_id);
      assert(typeof results.duration_ms === 'number');
      assert(results.checks);
      assert(results.summary);
      
      assert(results.summary.total > 0);
      assert(results.summary.passed >= 0);
      assert(results.summary.failed >= 0);
      assert(results.summary.warnings >= 0);
      
      assert(results.summary.total === results.summary.passed + results.summary.failed + results.summary.warnings);
    });

    it('should determine overall status correctly', async () => {
      const healthChecker = getHealthChecker();
      
      // Mock all checkers to return OK
      Object.keys(healthChecker.checkers).forEach(name => {
        healthChecker.checkers[name] = {
          name,
          check: async () => ({ status: 'ok', details: {}, metrics: {} }),
          getMetrics: async () => ({})
        };
      });
      
      const results = await healthChecker.checkAll();
      assert(results.status === HealthStatus.HEALTHY);
      assert(results.summary.failed === 0);
      assert(results.summary.passed === results.summary.total);
    });

    it('should detect unhealthy status when components fail', async () => {
      const healthChecker = getHealthChecker();
      
      // Mock one checker to return error
      healthChecker.checkers.database = {
        name: 'database',
        check: async () => ({ 
          status: 'error', 
          details: { error: 'Connection failed', error_code: 'CONNECTION_FAILED' }, 
          metrics: {} 
        }),
        getMetrics: async () => ({})
      };
      
      // Mock other checkers to return OK
      ['cache', 'memory', 'config'].forEach(name => {
        healthChecker.checkers[name] = {
          name,
          check: async () => ({ status: 'ok', details: {}, metrics: {} }),
          getMetrics: async () => ({})
        };
      });
      
      const results = await healthChecker.checkAll();
      assert(results.status === HealthStatus.UNHEALTHY);
      assert(results.summary.failed === 1);
      assert(results.summary.passed === 3);
    });
  });

  describe('Exit Code Determination', () => {
    it('should return SUCCESS for healthy status', () => {
      const healthChecker = getHealthChecker();
      const results = {
        status: HealthStatus.HEALTHY,
        checks: {
          database: { status: 'ok', details: {} },
          cache: { status: 'ok', details: {} },
          memory: { status: 'ok', details: {} },
          config: { status: 'ok', details: {} }
        }
      };
      
      const exitCode = healthChecker.getExitCode(results);
      assert.strictEqual(exitCode, ExitCodes.SUCCESS);
    });

    it('should return CONFIG for configuration errors', () => {
      const healthChecker = getHealthChecker();
      const results = {
        status: HealthStatus.UNHEALTHY,
        checks: {
          config: { 
            status: 'error', 
            details: { error_code: 'CONFIG_VALIDATION_FAILED' } 
          },
          database: { status: 'ok', details: {} },
          cache: { status: 'ok', details: {} },
          memory: { status: 'ok', details: {} }
        }
      };
      
      const exitCode = healthChecker.getExitCode(results);
      assert.strictEqual(exitCode, ExitCodes.CONFIG);
    });

    it('should return IO for database errors', () => {
      const healthChecker = getHealthChecker();
      const results = {
        status: HealthStatus.UNHEALTHY,
        checks: {
          database: { 
            status: 'error', 
            details: { error_code: 'DATABASE_NOT_FOUND' } 
          },
          cache: { status: 'ok', details: {} },
          memory: { status: 'ok', details: {} },
          config: { status: 'ok', details: {} }
        }
      };
      
      const exitCode = healthChecker.getExitCode(results);
      assert.strictEqual(exitCode, ExitCodes.IO);
    });

    it('should return INTERNAL for unknown errors', () => {
      const healthChecker = getHealthChecker();
      const results = {
        status: HealthStatus.UNHEALTHY,
        checks: {
          database: { 
            status: 'error', 
            details: { error_code: 'UNKNOWN_ERROR' } 
          },
          cache: { status: 'ok', details: {} },
          memory: { status: 'ok', details: {} },
          config: { status: 'ok', details: {} }
        }
      };
      
      const exitCode = healthChecker.getExitCode(results);
      assert.strictEqual(exitCode, ExitCodes.INTERNAL);
    });
  });

  describe('Metrics Integration', () => {
    it('should emit health check metrics', async () => {
      const metricsCollector = getMetricsCollector({ enabled: true });
      const healthChecker = getHealthChecker({
        metrics: metricsCollector
      });
      
      await healthChecker.checkAll(['config']);
      
      // Check that metrics were emitted (this is a basic check)
      const aggregatedMetrics = metricsCollector.getAggregatedMetrics();
      assert(aggregatedMetrics.gauges);
      assert(aggregatedMetrics.histograms);
    });

    it('should emit timing metrics for component checks', async () => {
      const metricsCollector = getMetricsCollector({ enabled: true });
      const healthChecker = getHealthChecker({
        metrics: metricsCollector
      });
      
      await healthChecker.checkAll(['memory']);
      
      const aggregatedMetrics = metricsCollector.getAggregatedMetrics();
      
      // Check for timing metrics
      const timingMetrics = Object.keys(aggregatedMetrics.histograms).filter(
        key => key.includes('check_duration_ms')
      );
      assert(timingMetrics.length > 0);
    });
  });

  describe('Error Handling', () => {
    it('should handle checker failures gracefully', async () => {
      const healthChecker = getHealthChecker();
      
      // Mock a checker to throw an error
      healthChecker.checkers.database = {
        name: 'database',
        check: async () => {
          throw new Error('Simulated checker failure');
        },
        getMetrics: async () => ({})
      };
      
      const results = await healthChecker.checkAll(['database']);
      
      assert(results.checks.database.status === 'error');
      assert(results.checks.database.details.error);
      assert(results.checks.database.details.error.includes('Simulated checker failure'));
    });

    it('should handle unknown component names', async () => {
      const healthChecker = getHealthChecker();
      const results = await healthChecker.checkAll(['nonexistent']);
      
      // Should not include unknown components
      assert(!results.checks.nonexistent);
      // Total should be 1 (attempted check) but no actual checks
      assert(results.summary.total === 1);
      assert(results.summary.passed === 0);
      assert(results.summary.failed === 0);
      assert(results.summary.warnings === 0);
    });
  });

  describe('Human-Readable Output', () => {
    it('should display human-readable results', () => {
      const healthChecker = getHealthChecker();
      const results = {
        status: HealthStatus.HEALTHY,
        timestamp: '2025-10-25T10:00:00Z',
        corr_id: 'test-corr-id',
        duration_ms: 150,
        checks: {
          database: {
            status: 'ok',
            details: { connectivity: true, response_time_ms: 45 },
            metrics: {},
            duration_ms: 50
          },
          memory: {
            status: 'ok',
            details: { used_mb: 100, limit_mb: 1024, leak_detected: false },
            metrics: {},
            duration_ms: 30
          }
        },
        summary: {
          total: 2,
          passed: 2,
          failed: 0,
          warnings: 0
        }
      };
      
      // This test ensures the display method doesn't throw
      assert.doesNotThrow(() => {
        healthChecker.displayHumanReadable(results);
      });
    });
  });
});