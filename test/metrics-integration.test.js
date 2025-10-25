/**
 * Integration tests for Metrics Collection Framework
 * Tests integration with search and context assembly
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { getMetricsCollector, resetMetricsCollector } from '../src/metrics/metrics-collector.js';
import { getLogger } from '../src/utils/structured-logger.js';

describe('Metrics Integration Tests', () => {
  let metricsCollector;
  let mockSink;
  let logger;

  beforeEach(() => {
    // Reset global metrics collector
    resetMetricsCollector();
    
    mockSink = {
      metrics: [],
      emit: function(metric) {
        this.metrics.push(JSON.parse(metric)); // Parse JSON string
      },
      clear: function() {
        this.metrics = [];
      }
    };
    
    metricsCollector = getMetricsCollector({
      sinks: [mockSink],
      sampling: {
        'default': { rate: 1.0 }
      }
    });
    
    logger = getLogger('test-component');
  });

  afterEach(() => {
    resetMetricsCollector();
  });

  describe('Search Integration', () => {
    it('should emit search latency metrics', async () => {
      // Simulate search operation with correlation ID
      const corrId = logger.generateCorrelationId();
      
      const metric = metricsCollector.emitTiming('search_latency_ms', 150, {
        search_type: 'hybrid',
        results_count: 10,
        cache_hit: 'false'
      }, corrId);

      assert.strictEqual(metric.metric, 'search_latency_ms');
      assert.strictEqual(metric.value, 150);
      assert.strictEqual(metric.tags.search_type, 'hybrid');
      assert.strictEqual(metric.corr_id, corrId);
    });

    it('should emit search operation counters', () => {
      const corrId = logger.generateCorrelationId();
      
      metricsCollector.emitCounter('search_operations', 1, {
        search_type: 'graph_enhanced',
        success: 'true'
      }, corrId);
      
      metricsCollector.emitCounter('search_errors', 1, {
        search_type: 'hybrid',
        error_type: 'TimeoutError'
      }, corrId);

      // Wait for async emission
      setTimeout(() => {
        const searchOps = mockSink.metrics.filter(m => m.metric === 'search_operations');
        const searchErrors = mockSink.metrics.filter(m => m.metric === 'search_errors');
        
        assert.strictEqual(searchOps.length, 1);
        assert.strictEqual(searchErrors.length, 1);
        assert.strictEqual(searchOps[0].tags.success, 'true');
        assert.strictEqual(searchErrors[0].tags.error_type, 'TimeoutError');
      }, 10);
    });
  });

  describe('Context Assembly Integration', () => {
    it('should emit context assembly metrics', () => {
      const corrId = logger.generateCorrelationId();
      
      metricsCollector.emitTiming('context_assembly_latency_ms', 85, {
        sources_count: 3,
        total_tokens: 2500,
        total_items: 8,
        graph_enabled: 'true'
      }, corrId);
      
      metricsCollector.emitCounter('context_assemblies', 1, {
        success: 'true',
        graph_enabled: 'true'
      }, corrId);

      // Wait for async emission
      setTimeout(() => {
        const assemblyMetrics = mockSink.metrics.filter(m => 
          m.metric === 'context_assembly_latency_ms' || m.metric === 'context_assemblies'
        );
        
        assert.strictEqual(assemblyMetrics.length, 2);
        
        const latencyMetric = assemblyMetrics.find(m => m.metric === 'context_assembly_latency_ms');
        const counterMetric = assemblyMetrics.find(m => m.metric === 'context_assemblies');
        
        assert.strictEqual(latencyMetric.value, 85);
        assert.strictEqual(latencyMetric.tags.graph_enabled, 'true');
        assert.strictEqual(counterMetric.tags.success, 'true');
      }, 10);
    });

    it('should emit cache metrics', () => {
      const corrId = logger.generateCorrelationId();
      
      metricsCollector.emitGauge('cache_hit_rate', 0.75, {
        component: 'context_assembly'
      }, corrId);
      
      metricsCollector.emitCounter('cache_operations', 20, {
        component: 'context_assembly',
        hits: 15,
        misses: 5
      }, corrId);

      // Wait for async emission
      setTimeout(() => {
        const cacheMetrics = mockSink.metrics.filter(m => 
          m.metric === 'cache_hit_rate' || m.metric === 'cache_operations'
        );
        
        assert.strictEqual(cacheMetrics.length, 2);
        
        const hitRateMetric = cacheMetrics.find(m => m.metric === 'cache_hit_rate');
        const opsMetric = cacheMetrics.find(m => m.metric === 'cache_operations');
        
        assert.strictEqual(hitRateMetric.value, 0.75);
        assert.strictEqual(opsMetric.value, 20);
        assert.strictEqual(opsMetric.tags.hits, 15);
        assert.strictEqual(opsMetric.tags.misses, 5);
      }, 10);
    });

    it('should emit token usage metrics', () => {
      const corrId = logger.generateCorrelationId();
      
      metricsCollector.emitGauge('token_usage', 3500, {
        component: 'context_assembly',
        operation: 'assembly'
      }, corrId);
      
      metricsCollector.emitGauge('budget_utilization', 0.7, {
        component: 'context_assembly'
      }, corrId);

      // Wait for async emission
      setTimeout(() => {
        const tokenMetrics = mockSink.metrics.filter(m => 
          m.metric === 'token_usage' || m.metric === 'budget_utilization'
        );
        
        assert.strictEqual(tokenMetrics.length, 2);
        
        const usageMetric = tokenMetrics.find(m => m.metric === 'token_usage');
        const budgetMetric = tokenMetrics.find(m => m.metric === 'budget_utilization');
        
        assert.strictEqual(usageMetric.value, 3500);
        assert.strictEqual(budgetMetric.value, 0.7);
      }, 10);
    });
  });

  describe('Correlation ID Integration', () => {
    it('should propagate correlation IDs across related metrics', () => {
      const corrId = logger.generateCorrelationId();
      
      // Simulate a complete operation flow
      metricsCollector.emitTiming('search_latency_ms', 120, {}, corrId);
      metricsCollector.emitTiming('context_assembly_latency_ms', 80, {}, corrId);
      metricsCollector.emitCounter('cache_operations', 5, {}, corrId);
      metricsCollector.emitGauge('token_usage', 2000, {}, corrId);

      // Wait for async emission
      setTimeout(() => {
        // All metrics should have the same correlation ID
        mockSink.metrics.forEach(metric => {
          assert.strictEqual(metric.corr_id, corrId, 
            `Metric ${metric.metric} should have correlation ID ${corrId}`);
        });
      }, 10);
    });
  });

  describe('Performance Requirements', () => {
    it('should handle high-frequency metrics without blocking', async () => {
      const startTime = Date.now();
      const promises = [];
      
      // Emit 1000 metrics concurrently
      for (let i = 0; i < 1000; i++) {
        promises.push(
          new Promise(resolve => {
            setImmediate(() => {
              metricsCollector.emitCounter('high_freq_test', 1, { iteration: i });
              resolve();
            });
          })
        );
      }

      await Promise.all(promises);
      const duration = Date.now() - startTime;

      // Should complete quickly (non-blocking)
      assert(duration < 200, `High-frequency operations took too long: ${duration}ms`);
      
      // Should have emitted all metrics
      assert.strictEqual(mockSink.metrics.length, 1000);
    });
  });
});