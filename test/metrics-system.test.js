/**
 * Tests for Metrics Collection Framework
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { 
  MetricsCollector,
  MetricsAggregator,
  MetricsSink,
  getMetricsCollector,
  MetricType,
  SamplingStrategy
} from '../src/metrics/metrics-collector.js';
import { randomUUID } from 'crypto';

describe('Metrics Collection Framework', () => {
  let metricsCollector;
  let mockSink;

  beforeEach(() => {
    mockSink = {
      metrics: [],
      emit: function(metric) {
        // Store the raw metric object, not JSON string
        this.metrics.push(metric);
      },
      clear: function() {
        this.metrics = [];
      }
    };
    
    metricsCollector = new MetricsCollector({
      sinks: [mockSink],
      sampling: {
        'search_latency_ms': { rate: 1.0 }, // 100% sampling for tests
        'cache_operation': { rate: 1.0 }
      }
    });
  });

  describe('Basic Metrics Emission', () => {
    it('should emit timing metrics with correct format', async () => {
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
      
      // Wait for async emission
      await new Promise(resolve => setTimeout(resolve, 0));
      
      assert.strictEqual(mockSink.metrics.length, 1);
      
      // Parse metric from sink (it's stored as raw object)
      const parsedMetric = mockSink.metrics[0];
      assert.strictEqual(parsedMetric.metric, 'search_latency_ms');
      assert.strictEqual(parsedMetric.value, 245.7);
      assert.strictEqual(parsedMetric.tags.cache_hit, 'false');
      assert.strictEqual(parsedMetric.tags.query_type, 'hybrid');
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
    });

    it('should emit gauge metrics', () => {
      const metric = metricsCollector.emitGauge('memory_usage_mb', 512.3, {
        component: 'search'
      });

      assert.strictEqual(metric.metric, 'memory_usage_mb');
      assert.strictEqual(metric.value, 512.3);
      assert.strictEqual(metric.tags.component, 'search');
    });

    it('should emit histogram metrics', () => {
      const metric = metricsCollector.emitHistogram('response_time_ms', 150, {
        endpoint: '/search'
      });

      assert.strictEqual(metric.metric, 'response_time_ms');
      assert.strictEqual(metric.value, 150);
      assert.strictEqual(metric.tags.endpoint, '/search');
    });
  });

  describe('Correlation ID Integration', () => {
    it('should include correlation ID when provided', () => {
      const corrId = randomUUID();
      const metric = metricsCollector.emitTiming('search_latency_ms', 100, {}, corrId);

      assert.strictEqual(metric.corr_id, corrId);
    });

    it('should auto-generate correlation ID when not provided', () => {
      const metric = metricsCollector.emitTiming('search_latency_ms', 100);

      assert(metric.corr_id);
      assert(typeof metric.corr_id === 'string');
      assert(metric.corr_id.length > 0);
    });
  });

  describe('Sampling', () => {
    it('should sample high-frequency metrics', () => {
      const collector = new MetricsCollector({
        sinks: [mockSink],
        sampling: {
          'high_freq_metric': { rate: 0.1 } // 10% sampling
        }
      });

      // Emit 100 metrics
      for (let i = 0; i < 100; i++) {
        collector.emitCounter('high_freq_metric', 1);
      }

      // Should have approximately 10 metrics (allowing some variance)
      assert(mockSink.metrics.length >= 5);
      assert(mockSink.metrics.length <= 15);
    });

    it('should not sample when rate is 1.0', () => {
      // Emit 10 metrics with 100% sampling
      for (let i = 0; i < 10; i++) {
        metricsCollector.emitCounter('cache_operations', 1);
      }

      assert.strictEqual(mockSink.metrics.length, 10);
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
      
      assert.strictEqual(snapshot.counters['cache_hits:cache:l1'].value, 2);
      assert.strictEqual(snapshot.counters['cache_hits:cache:l2'].value, 1);
    });

    it('should aggregate gauge metrics', () => {
      aggregator.setGauge('memory_usage', 100, { component: 'search' });
      aggregator.setGauge('memory_usage', 200, { component: 'search' });
      aggregator.setGauge('memory_usage', 150, { component: 'indexer' });

      const snapshot = aggregator.getSnapshot();
      
      assert.strictEqual(snapshot.gauges['memory_usage:component:search'].value, 200);
      assert.strictEqual(snapshot.gauges['memory_usage:component:indexer'].value, 150);
    });

    it('should aggregate histogram metrics', () => {
      aggregator.addHistogram('response_time', 100, { endpoint: '/api' });
      aggregator.addHistogram('response_time', 200, { endpoint: '/api' });
      aggregator.addHistogram('response_time', 150, { endpoint: '/api' });

      const snapshot = aggregator.getSnapshot();
      const histogram = snapshot.histograms['response_time:endpoint:/api'];
      
      assert.strictEqual(histogram.count, 3);
      assert.strictEqual(histogram.sum, 450);
      assert.strictEqual(histogram.min, 100);
      assert.strictEqual(histogram.max, 200);
      assert.strictEqual(histogram.avg, 150);
    });
  });

  describe('Metrics Sinks', () => {
    it('should emit to stdout sink', () => {
      const stdoutSink = new MetricsSink({ type: 'stdout' });
      let capturedOutput = '';
      const originalConsoleLog = console.log;
      console.log = (message) => { capturedOutput += message + '\n'; };

      const metric = {
        metric: 'test_metric',
        value: 100,
        tags: { component: 'test' },
        timestamp: Date.now()
      };

      stdoutSink.emit(metric);

      console.log = originalConsoleLog;
      
      const parsed = JSON.parse(capturedOutput.trim());
      assert.strictEqual(parsed.metric, 'test_metric');
      assert.strictEqual(parsed.value, 100);
    });

    it('should emit to file sink', async () => {
      const tempFile = `/tmp/metrics-test-${Date.now()}.jsonl`;
      const fileSink = new MetricsSink({ 
        type: 'file', 
        path: tempFile 
      });

      const metric = {
        metric: 'test_metric',
        value: 100,
        tags: { component: 'test' },
        timestamp: Date.now()
      };

      fileSink.emit(metric);
      await fileSink.flush();

      const fs = await import('fs/promises');
      const content = await fs.readFile(tempFile, 'utf-8');
      const parsed = JSON.parse(content.trim());

      assert.strictEqual(parsed.metric, 'test_metric');
      assert.strictEqual(parsed.value, 100);

      // Cleanup
      await fs.unlink(tempFile);
    });
  });

  describe('Performance Requirements', () => {
    it('should emit metrics in under 1ms', () => {
      const iterations = 1000;
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

    it('should handle high-frequency operations without blocking', async () => {
      const promises = [];
      const startTime = Date.now();

      // Emit 1000 metrics concurrently
      for (let i = 0; i < 1000; i++) {
        promises.push(
          new Promise(resolve => {
            setImmediate(() => {
              metricsCollector.emitCounter('high_freq_test', 1);
              resolve();
            });
          })
        );
      }

      await Promise.all(promises);
      const duration = Date.now() - startTime;

      // Should complete quickly (non-blocking)
      assert(duration < 100, `High-frequency operations took too long: ${duration}ms`);
    });
  });

  describe('Integration with Structured Logging', () => {
    it('should use correlation IDs from structured logger', async () => {
      const { getLogger } = await import('../src/utils/structured-logger.js');
      const logger = getLogger('test-component');
      const corrId = logger.generateCorrelationId();

      const metric = metricsCollector.emitTiming('integrated_metric', 50, {}, corrId);

      assert.strictEqual(metric.corr_id, corrId);
    });
  });

  describe('Configuration', () => {
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