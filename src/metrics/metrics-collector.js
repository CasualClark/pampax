/**
 * Metrics Collection Framework for PAMPAX
 * 
 * Provides production-ready metrics collection with:
 * - OpenTelemetry-compatible format
 * - Async emission to avoid blocking
 * - Configurable sampling for high-frequency operations
 * - Integration with structured logging correlation IDs
 * - Multiple sink support (stdout, file, external)
 */

import { randomUUID } from 'crypto';
import { writeFileSync, appendFileSync, existsSync } from 'fs';
import { config } from '../config/config-loader.js';

/**
 * Metric types
 */
export const MetricType = {
  COUNTER: 'counter',
  GAUGE: 'gauge',
  HISTOGRAM: 'histogram',
  TIMING: 'timing'
};

/**
 * Sampling strategies
 */
export const SamplingStrategy = {
  ALWAYS: 1.0,
  NEVER: 0.0,
  LOW: 0.1,
  MEDIUM: 0.5,
  HIGH: 0.9
};

/**
 * Metrics Sink - handles metric output to various destinations
 */
export class MetricsSink {
  constructor(options = {}) {
    this.type = options.type || 'stdout';
    this.path = options.path;
    this.buffer = [];
    this.bufferSize = options.bufferSize || 100;
    this.flushInterval = options.flushInterval || 5000; // 5 seconds
    this.lastFlush = Date.now();
    
    if (this.type === 'file' && this.path) {
      // Ensure file exists
      if (!existsSync(this.path)) {
        writeFileSync(this.path, '');
      }
    }
    
    // Auto-flush for file sinks
    if (this.type === 'file') {
      this.setupAutoFlush();
    }
  }

  /**
   * Emit a metric to the sink
   */
  emit(metric) {
    const formattedMetric = this.formatMetric(metric);
    
    switch (this.type) {
      case 'stdout':
        console.log(formattedMetric);
        break;
        
      case 'file':
        this.buffer.push(formattedMetric);
        if (this.buffer.length >= this.bufferSize || 
            Date.now() - this.lastFlush > this.flushInterval) {
          this.flush();
        }
        break;
        
      case 'external':
        // Placeholder for external metrics systems (Prometheus, etc.)
        if (this.externalEmitter) {
          this.externalEmitter(metric);
        }
        break;
        
      default:
        console.warn(`Unknown sink type: ${this.type}`);
    }
  }

  /**
   * Format metric as OpenTelemetry-compatible JSON
   */
  formatMetric(metric) {
    return JSON.stringify({
      metric: metric.metric,
      value: metric.value,
      tags: metric.tags || {},
      timestamp: metric.timestamp || Date.now(),
      corr_id: metric.corr_id,
      type: metric.type
    });
  }

  /**
   * Flush buffered metrics to file
   */
  flush() {
    if (this.type === 'file' && this.buffer.length > 0) {
      try {
        appendFileSync(this.path, this.buffer.join('\n') + '\n');
        this.buffer = [];
        this.lastFlush = Date.now();
      } catch (error) {
        console.error('Failed to flush metrics to file:', error);
      }
    }
  }

  /**
   * Setup automatic flushing for file sinks
   */
  setupAutoFlush() {
    setInterval(() => {
      this.flush();
    }, this.flushInterval);
  }

  /**
   * Close the sink and flush any remaining metrics
   */
  close() {
    this.flush();
  }
}

/**
 * Metrics Aggregator - collects and aggregates metrics
 */
export class MetricsAggregator {
  constructor() {
    this.counters = new Map();
    this.gauges = new Map();
    this.histograms = new Map();
  }

  /**
   * Add to counter metric
   */
  addCounter(name, value = 1, tags = {}) {
    const key = this.createKey(name, tags);
    const counter = this.counters.get(key) || { value: 0, tags };
    counter.value += value;
    this.counters.set(key, counter);
  }

  /**
   * Set gauge metric value
   */
  setGauge(name, value, tags = {}) {
    const key = this.createKey(name, tags);
    this.gauges.set(key, { value, tags });
  }

  /**
   * Add value to histogram metric
   */
  addHistogram(name, value, tags = {}) {
    const key = this.createKey(name, tags);
    const histogram = this.histograms.get(key) || {
      count: 0,
      sum: 0,
      min: Infinity,
      max: -Infinity,
      values: [],
      tags
    };
    
    histogram.count++;
    histogram.sum += value;
    histogram.min = Math.min(histogram.min, value);
    histogram.max = Math.max(histogram.max, value);
    histogram.values.push(value);
    
    // Keep only last 1000 values to prevent memory issues
    if (histogram.values.length > 1000) {
      histogram.values = histogram.values.slice(-1000);
    }
    
    this.histograms.set(key, histogram);
  }

  /**
   * Get aggregated snapshot
   */
  getSnapshot() {
    const snapshot = {
      counters: {},
      gauges: {},
      histograms: {}
    };

    // Process counters
    for (const [key, counter] of this.counters.entries()) {
      snapshot.counters[key] = {
        value: counter.value,
        tags: counter.tags
      };
    }

    // Process gauges
    for (const [key, gauge] of this.gauges.entries()) {
      snapshot.gauges[key] = {
        value: gauge.value,
        tags: gauge.tags
      };
    }

    // Process histograms
    for (const [key, histogram] of this.histograms.entries()) {
      const avg = histogram.count > 0 ? histogram.sum / histogram.count : 0;
      snapshot.histograms[key] = {
        count: histogram.count,
        sum: histogram.sum,
        min: histogram.min,
        max: histogram.max,
        avg: avg,
        tags: histogram.tags
      };
    }

    return snapshot;
  }

  /**
   * Reset all metrics
   */
  reset() {
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
  }

  /**
   * Create key from name and tags
   */
  createKey(name, tags) {
    const tagStr = Object.entries(tags)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}:${v}`)
      .join(',');
    return tagStr ? `${name}:${tagStr}` : name;
  }
}

/**
 * Main Metrics Collector
 */
export class MetricsCollector {
  constructor(options = {}) {
    this.enabled = options.enabled !== false;
    this.sinks = options.sinks || [new MetricsSink({ type: 'stdout' })];
    this.sampling = options.sampling || {};
    this.aggregator = new MetricsAggregator();
    this.defaultSamplingRate = options.defaultSamplingRate || 1.0;
    
    // Load configuration if available
    this.loadConfig();
  }

  /**
   * Load configuration from config system
   */
  loadConfig() {
    try {
      const appConfig = config.getConfig();
      if (appConfig.metrics) {
        const metricsConfig = appConfig.metrics;
        
        this.enabled = metricsConfig.enabled !== false;
        
        // Setup sinks from config
        if (metricsConfig.sinks && Array.isArray(metricsConfig.sinks)) {
          this.sinks = metricsConfig.sinks.map(sinkConfig => 
            new MetricsSink(sinkConfig)
          );
        }
        
        // Setup sampling from config
        if (metricsConfig.sampling) {
          this.sampling = { ...this.sampling, ...metricsConfig.sampling };
        }
      }
    } catch (error) {
      console.warn('Failed to load metrics configuration:', error.message);
    }
  }

  /**
   * Check if metric should be sampled
   */
  shouldSample(metricName) {
    const samplingConfig = this.sampling[metricName] || 
                          this.sampling['default'] || 
                          { rate: this.defaultSamplingRate };
    
    const rate = samplingConfig.rate || this.defaultSamplingRate;
    
    if (rate >= 1.0) return true;
    if (rate <= 0.0) return false;
    
    return Math.random() < rate;
  }

  /**
   * Emit metric to all sinks
   */
  emit(metric) {
    if (!this.enabled) return;
    
    // Add timestamp if not provided
    if (!metric.timestamp) {
      metric.timestamp = Date.now();
    }
    
    // Add correlation ID if not provided
    if (!metric.corr_id) {
      metric.corr_id = randomUUID();
    }
    
    // Emit to all sinks asynchronously
    setImmediate(() => {
      this.sinks.forEach(sink => {
        try {
          sink.emit(metric);
        } catch (error) {
          console.error('Failed to emit metric to sink:', error);
        }
      });
    });
  }

  /**
   * Emit timing metric
   */
  emitTiming(name, valueMs, tags = {}, corrId = null) {
    if (!this.shouldSample(name)) return;
    
    const metric = {
      metric: name,
      value: valueMs,
      tags,
      corr_id: corrId,
      type: MetricType.TIMING
    };
    
    this.emit(metric);
    this.aggregator.addHistogram(name, valueMs, tags);
    
    return metric;
  }

  /**
   * Emit counter metric
   */
  emitCounter(name, value = 1, tags = {}, corrId = null) {
    if (!this.shouldSample(name)) return;
    
    const metric = {
      metric: name,
      value,
      tags,
      corr_id: corrId,
      type: MetricType.COUNTER
    };
    
    this.emit(metric);
    this.aggregator.addCounter(name, value, tags);
    
    return metric;
  }

  /**
   * Emit gauge metric
   */
  emitGauge(name, value, tags = {}, corrId = null) {
    if (!this.shouldSample(name)) return;
    
    const metric = {
      metric: name,
      value,
      tags,
      corr_id: corrId,
      type: MetricType.GAUGE
    };
    
    this.emit(metric);
    this.aggregator.setGauge(name, value, tags);
    
    return metric;
  }

  /**
   * Emit histogram metric
   */
  emitHistogram(name, value, tags = {}, corrId = null) {
    if (!this.shouldSample(name)) return;
    
    const metric = {
      metric: name,
      value,
      tags,
      corr_id: corrId,
      type: MetricType.HISTOGRAM
    };
    
    this.emit(metric);
    this.aggregator.addHistogram(name, value, tags);
    
    return metric;
  }

  /**
   * Time a function and emit timing metric
   */
  async timeFunction(name, fn, tags = {}, corrId = null) {
    const startTime = Date.now();
    
    try {
      const result = await fn();
      const duration = Date.now() - startTime;
      
      this.emitTiming(name, duration, { ...tags, success: 'true' }, corrId);
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      
      this.emitTiming(name, duration, { ...tags, success: 'false', error: error.name }, corrId);
      throw error;
    }
  }

  /**
   * Get aggregated metrics snapshot
   */
  getAggregatedMetrics() {
    return this.aggregator.getSnapshot();
  }

  /**
   * Reset aggregated metrics
   */
  resetMetrics() {
    this.aggregator.reset();
  }

  /**
   * Close all sinks
   */
  close() {
    this.sinks.forEach(sink => sink.close());
  }
}

// Global metrics collector instance
let globalMetricsCollector = null;

/**
 * Get global metrics collector instance
 */
export function getMetricsCollector(options = {}) {
  if (!globalMetricsCollector) {
    globalMetricsCollector = new MetricsCollector(options);
  }
  return globalMetricsCollector;
}

/**
 * Reset global metrics collector (useful for testing)
 */
export function resetMetricsCollector() {
  if (globalMetricsCollector) {
    globalMetricsCollector.close();
  }
  globalMetricsCollector = null;
}

// Export default instance
export default getMetricsCollector();