/**
 * Retry Policy Implementation
 * 
 * Provides comprehensive retry mechanisms with:
 * - Multiple backoff strategies (fixed, linear, exponential)
 * - Configurable jitter to prevent thundering herd
 * - Error classification for retryable vs non-retryable errors
 * - Abort controller support for cancellation
 * - Comprehensive metrics and monitoring
 */

const EventEmitter = require('events');

/**
 * Retry strategies
 */
const RetryStrategy = {
  FIXED: 'fixed',
  LINEAR: 'linear',
  EXPONENTIAL: 'exponential'
};

/**
 * Retry policy implementation
 */
class RetryPolicy extends EventEmitter {
  constructor(operationName, options = {}) {
    super();
    
    this.operationName = operationName;
    this.options = {
      maxAttempts: options.maxAttempts || 3,
      baseDelay: options.baseDelay || 1000,
      maxDelay: options.maxDelay || 30000,
      multiplier: options.multiplier || 2.0,
      jitter: options.jitter !== false,
      strategy: options.strategy || RetryStrategy.EXPONENTIAL,
      isRetryableError: options.isRetryableError || this.defaultRetryableErrorChecker,
      shouldRetry: options.shouldRetry || null,
      onRetry: options.onRetry || null,
      ...options
    };
    
    // Statistics
    this.stats = {
      totalOperations: 0,
      successfulOperations: 0,
      failedOperations: 0,
      totalRetries: 0,
      totalDelayTime: 0
    };
    
    // Metrics and logging
    this.metrics = require('../metrics/metrics-collector.js').getMetricsCollector();
    this.logger = require('../utils/structured-logger.js').getLogger(`retry-policy-${operationName}`);
  }

  /**
   * Execute operation with retry logic
   */
  async execute(operation, options = {}) {
    const startTime = Date.now();
    const corrId = this.logger.getCorrelationId();
    let attempt = 1;
    let lastError = null;
    
    this.stats.totalOperations++;
    
    while (attempt <= this.options.maxAttempts) {
      try {
        // Check for abort signal
        if (options.signal?.aborted) {
          throw new Error('Operation aborted');
        }
        
        // Execute operation
        const result = await operation();
        
        // Success - record metrics and return result
        const duration = Date.now() - startTime;
        this.stats.successfulOperations++;
        
        if (attempt > 1) {
          this.logger.info('retry_operation_success', 'Operation succeeded after retries', {
            operation: this.operationName,
            attempts: attempt,
            duration,
            totalRetries: attempt - 1
          });
        }
        
        this.emitSuccessMetrics(duration, attempt, corrId);
        return result;
        
      } catch (error) {
        lastError = error;
        
        // Determine if we should retry
        const shouldRetry = this.shouldRetry(error, attempt);
        
        if (!shouldRetry || attempt >= this.options.maxAttempts) {
          // No more retries
          break;
        }
        
        // Calculate delay for next attempt
        const delay = this.calculateDelay(attempt);
        this.stats.totalRetries++;
        this.stats.totalDelayTime += delay;
        
        // Emit retry metrics
        this.emitRetryMetrics(error, attempt, delay, corrId);
        
        // Call onRetry callback if provided
        if (this.options.onRetry) {
          try {
            this.options.onRetry(error, attempt, delay);
          } catch (callbackError) {
            this.logger.warn('retry_callback_error', 'Error in retry callback', {
              operation: this.operationName,
              error: callbackError.message
            });
          }
        }
        
        // Wait before retry
        await this.delay(delay, options.signal);
        attempt++;
      }
    }
    
    // All attempts failed
    this.stats.failedOperations++;
    const duration = Date.now() - startTime;
    
    this.emitFailureMetrics(lastError, duration, attempt - 1, corrId);
    
    this.logger.error('retry_operation_failed', 'Operation failed after all retries', {
      operation: this.operationName,
      attempts: attempt - 1,
      duration,
      finalError: lastError.message
    });
    
    throw lastError;
  }

  /**
   * Determine if operation should be retried
   */
  shouldRetry(error, attempt) {
    // Check custom retry condition first
    if (this.options.shouldRetry) {
      return this.options.shouldRetry(error, attempt);
    }
    
    // Check if error is retryable
    if (!this.options.isRetryableError(error)) {
      return false;
    }
    
    // Check if we have attempts left
    return attempt < this.options.maxAttempts;
  }

  /**
   * Calculate delay for retry attempt
   */
  calculateDelay(attempt) {
    let delay;
    
    switch (this.options.strategy) {
      case RetryStrategy.FIXED:
        delay = this.options.baseDelay;
        break;
        
      case RetryStrategy.LINEAR:
        delay = this.options.baseDelay * attempt;
        break;
        
      case RetryStrategy.EXPONENTIAL:
      default:
        delay = this.options.baseDelay * Math.pow(this.options.multiplier, attempt - 1);
        break;
    }
    
    // Apply max delay limit
    delay = Math.min(delay, this.options.maxDelay);
    
    // Apply jitter if enabled
    if (this.options.jitter) {
      delay = this.applyJitter(delay);
    }
    
    return Math.floor(delay);
  }

  /**
   * Apply jitter to delay to prevent thundering herd
   */
  applyJitter(delay) {
    // Add random jitter between 50% and 150% of the delay
    const jitterFactor = 0.5 + (Math.random() * 1.0);
    return delay * jitterFactor;
  }

  /**
   * Delay execution with abort support
   */
  async delay(ms, signal) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => resolve(), ms);
      
      const onAbort = () => {
        clearTimeout(timeout);
        reject(new Error('Operation aborted'));
      };
      
      if (signal) {
        if (signal.aborted) {
          onAbort();
          return;
        }
        
        signal.addEventListener('abort', onAbort, { once: true });
      }
    });
  }

  /**
   * Default retryable error checker
   */
  defaultRetryableErrorChecker(error) {
    // Network-related errors
    const networkPatterns = [
      /timeout/i,
      /connection/i,
      /network/i,
      /unreachable/i,
      /ECONNRESET/i,
      /ETIMEDOUT/i,
      /ENOTFOUND/i,
      /ECONNREFUSED/i
    ];
    
    // HTTP status codes that should be retried
    const retryableStatusCodes = [408, 429, 500, 502, 503, 504];
    
    // Check error message
    const errorMessage = error.message || '';
    const isNetworkError = networkPatterns.some(pattern => 
      pattern.test(errorMessage)
    );
    
    // Check HTTP status code
    const isRetryableStatus = retryableStatusCodes.includes(error.status || error.statusCode);
    
    // Check error code
    const retryableCodes = [
      'ETIMEDOUT', 'ECONNRESET', 'ENOTFOUND', 'ECONNREFUSED',
      'EPIPE', 'EHOSTUNREACH', 'ENETUNREACH'
    ];
    const isRetryableCode = retryableCodes.includes(error.code);
    
    // Check for rate limiting
    const isRateLimit = /rate.?limit/i.test(errorMessage) || error.status === 429;
    
    return isNetworkError || isRetryableStatus || isRetryableCode || isRateLimit;
  }

  /**
   * Check if error is transient (legacy method)
   */
  isTransientError(error) {
    return this.options.isRetryableError(error);
  }

  /**
   * Check if error is retryable (alias for isTransientError)
   */
  isRetryableError(error) {
    return this.options.isRetryableError(error);
  }

  /**
   * Get comprehensive statistics
   */
  getStats() {
    const averageRetries = this.stats.totalOperations > 0 
      ? this.stats.totalRetries / this.stats.totalOperations 
      : 0;
    
    return {
      ...this.stats,
      averageRetriesPerOperation: Math.round(averageRetries * 100) / 100,
      successRate: this.stats.totalOperations > 0 
        ? this.stats.successfulOperations / this.stats.totalOperations 
        : 0,
      failureRate: this.stats.totalOperations > 0 
        ? this.stats.failedOperations / this.stats.totalOperations 
        : 0,
      averageDelayTime: this.stats.totalRetries > 0 
        ? this.stats.totalDelayTime / this.stats.totalRetries 
        : 0,
      configuration: {
        maxAttempts: this.options.maxAttempts,
        baseDelay: this.options.baseDelay,
        maxDelay: this.options.maxDelay,
        multiplier: this.options.multiplier,
        strategy: this.options.strategy,
        jitter: this.options.jitter
      },
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      totalOperations: 0,
      successfulOperations: 0,
      failedOperations: 0,
      totalRetries: 0,
      totalDelayTime: 0
    };
    
    this.logger.info('retry_stats_reset', 'Retry policy statistics reset', {
      operation: this.operationName
    });
  }

  /**
   * Emit success metrics
   */
  emitSuccessMetrics(duration, attempts, corrId) {
    this.metrics.emitTiming('retry_operation_duration_ms', duration, {
      operation: this.operationName,
      success: 'true',
      attempts
    }, corrId);
    
    this.metrics.emitCounter('retry_operations', 1, {
      operation: this.operationName,
      success: 'true',
      attempts
    }, corrId);
  }

  /**
   * Emit retry metrics
   */
  emitRetryMetrics(error, attempt, delay, corrId) {
    this.logger.warn('retry_attempt', 'Retrying operation after failure', {
      operation: this.operationName,
      attempt,
      delay,
      error: error.message,
      errorType: error.constructor.name
    });
    
    this.metrics.emitCounter('retry_attempts', 1, {
      operation: this.operationName,
      attempt,
      error_type: error.constructor.name
    }, corrId);
    
    this.metrics.emitHistogram('retry_delay_distribution_ms', delay, {
      operation: this.operationName,
      attempt
    }, corrId);
  }

  /**
   * Emit failure metrics
   */
  emitFailureMetrics(error, duration, attempts, corrId) {
    this.metrics.emitTiming('retry_operation_duration_ms', duration, {
      operation: this.operationName,
      success: 'false',
      attempts,
      error_type: error.constructor.name
    }, corrId);
    
    this.metrics.emitCounter('retry_operations', 1, {
      operation: this.operationName,
      success: 'false',
      attempts,
      error_type: error.constructor.name
    }, corrId);
    
    this.metrics.emitCounter('retry_exhausted', 1, {
      operation: this.operationName,
      max_attempts: this.options.maxAttempts,
      final_attempts: attempts
    }, corrId);
  }

  /**
   * Create a wrapped function with retry logic
   */
  wrap(fn, options = {}) {
    return (...args) => this.execute(() => fn(...args), options);
  }

  /**
   * Get health status
   */
  getHealthStatus() {
    const stats = this.getStats();
    const healthy = stats.successRate > 0.8 && stats.averageRetriesPerOperation < 2;
    
    return {
      healthy,
      operation: this.operationName,
      stats,
      config: this.options,
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = {
  RetryPolicy,
  RetryStrategy
};