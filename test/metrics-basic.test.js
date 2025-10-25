/**
 * Basic tests for the Metrics Collection Framework
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { 
  MetricsCollector,
  MetricsAggregator,
  MetricsSink
} from '../src/metrics/metrics-collector.js';

describe('Metrics Collection Framework - Basic Tests', () => {
  let metricsCollector;
  let mockSink;

  beforeEach(() => {
    mockSink = {
      metrics: [],
      emit: function(metric) {
        this.metrics.push(metric);
      },
      clear: function() {
        this.metrics = [];
      }
    };
    
    metricsCollector = new MetricsCollector({
      sinks: [mockSink],
      sampling: {
        'default': { rate: 1.0 } // 100% sampling for tests
      }
    });
  });

  describe('Basic Metrics Emission', () => {
    it('should emit timing metrics with correct structure', () => {
      const metric = metricsCollector.emitTiming('search_latency_ms', 245.7, {
        cache_hit: 'false',
        query_type: 'hybrid'
      });

      assert.strictEqual(metric.metric, 'search_latency_ms');
      assert.strictEqual(metric.value, 245.7);
      assert.strictEqual(metric.tags.cache_hit, 'false');
      assert.strictEqual(metric.tags.query_type, 'hybrid');
      assert(typeof metric.timestamp === 'number');
      assert(metric.timestamp > 0);
      assert(typeof metric.corr_id === 'string');
      assert.strictEqual(metric.type, 'timing');
    });

    it('should emit counter metrics', () => {
      const metric = metricsCollector.emitCounter('cache_operations', 1, {
        operation: 'get',
        result: 'hit'
      });

      assert.strictEqual(metric.metric, 'cache_operations');
      assert.strictEqual(metric.value, 1);
      assert.strictEqual(metric.tags.operation, 'get');
      assert.strictEqual(metric.tags.result, 'hit');
      assert.strictEqual(metric.type, 'counter');
    });

    it('should emit gauge metrics', () => {
      const metric = metricsCollector.emitGauge('memory_usage_mb', 512.3, {
        component: 'search'
      });

      assert.strictEqual(metric.metric, 'memory_usage_mb');
      assert.strictEqual(metric.value, 512.3);
      assert.strictEqual(metric.tags.component, 'search');
      assert.strictEqual(metric.type, 'gauge');
    });

    it('should emit histogram metrics', () => {
      const metric = metricsCollector.emitHistogram('response_time_ms', 150, {
        endpoint: '/search'
      });

      assert.strictEqual(metric.metric, 'response_time_ms');
      assert.strictEqual(metric.value, 150);
      assert.strictEqual(metric.tags.endpoint, '/search');
      assert.strictEqual(metric.type, 'histogram');
    });
  });

  describe('Metrics Aggregation', () => {
    let aggregator;

    beforeEach(() => {
      aggregator = new MetricsAggregator();
    });

    it('should aggregate counter metrics', () => {
      aggregator.addCounter('cache_hits', 1, { cache: 'l1' });
      aggregator.addCounter('cache_hits', 1, { cache: 'l1' });
      aggregator.addCounter('cache_hits', 1, { cache: 'l2' });

      const snapshot = aggregator.getSnapshot();
      
      console.log('Snapshot counters:', Object.keys(snapshot.counters));
      console.log('Snapshot:', snapshot);
      
      assert(snapshot.counters['cache_hits:cache:l1'], 'cache_hits:cache:l1 should exist');
      assert.strictEqual(snapshot.counters['cache_hits:cache:l1'].value, 2);
      assert(snapshot.counters['cache_hits:cache:l2'], 'cache_hits:cache:l2 should exist');
      assert.strictEqual(snapshot.counters['cache_hits:cache:l2'].value, 1);
    });

    it('should aggregate gauge metrics', () => {
      aggregator.setGauge('memory_usage', 100, { component: 'search' });
      aggregator.setGauge('memory_usage', 200, { component: 'search' });
      aggregator.setGauge('memory_usage', 150, { component: 'indexer' });

      const snapshot = aggregator.getSnapshot();
      
      assert(snapshot.gauges['memory_usage:component:search'], 'memory_usage:component:search should exist');
      assert.strictEqual(snapshot.gauges['memory_usage:component:search'].value, 200);
      assert(snapshot.gauges['memory_usage:component:indexer'], 'memory_usage:component:indexer should exist');
      assert.strictEqual(snapshot.gauges['memory_usage:component:indexer'].value, 150);
    });

    it('should aggregate histogram metrics', () => {
      aggregator.addHistogram('response_time', 100, { endpoint: '/api' });
      aggregator.addHistogram('response_time', 200, { endpoint: '/api' });
      aggregator.addHistogram('response_time', 150, { endpoint: '/api' });

      const snapshot = aggregator.getSnapshot();
      const histogram = snapshot.histograms['response_time:endpoint:/api'];
      
      assert(histogram, 'response_time:endpoint:/api should exist');
      assert.strictEqual(histogram.count, 3);
      assert.strictEqual(histogram.sum, 450);
      assert.strictEqual(histogram.min, 100);
      assert.strictEqual(histogram.max, 200);
      assert.strictEqual(histogram.avg, 150);
    });
  });

  describe('Performance Requirements', () => {
    it('should emit metrics in under 1ms per operation', () => {
      const iterations = 100;
      const startTime = process.hrtime.bigint();

      for (let i = 0; i < iterations; i++) {
        metricsCollector.emitTiming('test_metric', 100, { test: 'performance' });
      }

      const endTime = process.hrtime.bigint();
      const avgTimeNs = Number(endTime - startTime) / iterations;
      const avgTimeMs = avgTimeNs / 1000000;

      // Should be under 1ms per metric
      assert(avgTimeMs < 1, `Average time per metric: ${avgTimeMs}ms`);
    });
  });

  describe('Configuration Integration', () => {
    it('should load configuration from config system', async () => {
      const { config } = await import('../src/config/config-loader.js');
      
      // Mock metrics config
      const originalConfig = config.getConfig();
      config.updateConfig({
        metrics: {
          enabled: true,
          sinks: [{ type: 'stdout' }],
          sampling: {
            'default': { rate: 0.1 }
          }
        }
      });

      const collector = new MetricsCollector();
      assert(collector.enabled);

      // Restore original config
      config.updateConfig(originalConfig);
    });
  });
});