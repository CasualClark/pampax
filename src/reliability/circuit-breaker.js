/**
 * Circuit Breaker Implementation
 * 
 * Provides circuit breaker patterns for PAMPAX reliability with:
 * - State management (CLOSED, OPEN, HALF_OPEN)
 * - Failure threshold and recovery timeout
 * - Success threshold for recovery
 * - Bulkhead pattern for resource isolation
 * - Comprehensive metrics and monitoring
 */

const EventEmitter = require('events');

/**
 * Circuit breaker states
 */
const CircuitBreakerState = {
  CLOSED: 'CLOSED',
  OPEN: 'OPEN',
  HALF_OPEN: 'HALF_OPEN'
};

/**
 * Circuit breaker implementation
 */
class CircuitBreaker extends EventEmitter {
  constructor(serviceName, options = {}) {
    super();
    
    this.serviceName = serviceName;
    this.options = {
      failureThreshold: options.failureThreshold || 5,
      successThreshold: options.successThreshold || 2,
      recoveryTimeout: options.recoveryTimeout || 60000,
      monitoringPeriod: options.monitoringPeriod || 10000,
      maxConcurrent: options.maxConcurrent || 10,
      isTransientError: options.isTransientError || this.defaultTransientErrorChecker,
      ...options
    };
    
    this.state = CircuitBreakerState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
    this.nextAttempt = null;
    this.activeOperations = new Set();
    
    // Statistics
    this.stats = {
      totalOperations: 0,
      successCount: 0,
      failureCount: 0,
      timeoutCount: 0,
      rejectionCount: 0,
      circuitBreakerOpens: 0,
      circuitBreakerCloses: 0
    };
    
    // Metrics and logging
    this.metrics = require('../metrics/metrics-collector.js').getMetricsCollector();
    this.logger = require('../utils/structured-logger.js').getLogger(`circuit-breaker-${serviceName}`);
    
    // Start monitoring
    this.startMonitoring();
  }

  /**
   * Execute operation with circuit breaker protection
   */
  async execute(operation, options = {}) {
    const startTime = Date.now();
    const corrId = this.logger.getCorrelationId();
    
    try {
      // Check if operation should be allowed
      if (!this.canExecute()) {
        this.stats.rejectionCount++;
        this.emitRejection();
        
        // Use fallback if provided
        if (options.fallback) {
          return await options.fallback();
        }
        
        throw new Error(`Circuit breaker is ${this.state} for service: ${this.serviceName}`);
      }
      
      // Check bulkhead limit
      if (this.activeOperations.size >= this.options.maxConcurrent) {
        this.stats.rejectionCount++;
        this.metrics.emitCounter('circuit_breaker_rejections', 1, {
          service: this.serviceName,
          reason: 'bulkhead_limit',
          active_operations: this.activeOperations.size
        }, corrId);
        
        throw new Error(`Bulkhead limit exceeded for service: ${this.serviceName}`);
      }
      
      // Track operation
      const operationId = this.trackOperation();
      
      try {
        const result = await operation();
        
        // Record success
        this.recordSuccess();
        this.emitSuccess(Date.now() - startTime, corrId);
        
        return result;
      } finally {
        this.untrackOperation(operationId);
      }
      
    } catch (error) {
      // Determine if this is a transient error
      const isTransient = this.options.isTransientError(error);
      
      if (isTransient) {
        this.recordFailure();
        this.emitFailure(error, Date.now() - startTime, corrId);
      } else {
        // Non-transient errors don't affect circuit breaker state
        this.emitFailure(error, Date.now() - startTime, corrId, false);
      }
      
      throw error;
    }
  }

  /**
   * Check if operation can be executed
   */
  canExecute() {
    switch (this.state) {
      case CircuitBreakerState.CLOSED:
        return true;
        
      case CircuitBreakerState.OPEN:
        if (Date.now() >= this.nextAttempt) {
          this.state = CircuitBreakerState.HALF_OPEN;
          this.successCount = 0;
          this.emitStateChange(CircuitBreakerState.HALF_OPEN);
          return true;
        }
        return false;
        
      case CircuitBreakerState.HALF_OPEN:
        return true;
        
      default:
        return false;
    }
  }

  /**
   * Record successful operation
   */
  recordSuccess() {
    this.stats.successCount++;
    this.stats.totalOperations++;
    
    switch (this.state) {
      case CircuitBreakerState.CLOSED:
        // Reset failure count on success
        this.failureCount = 0;
        break;
        
      case CircuitBreakerState.HALF_OPEN:
        this.successCount++;
        if (this.successCount >= this.options.successThreshold) {
          this.closeCircuit();
        }
        break;
    }
  }

  /**
   * Record failed operation
   */
  recordFailure() {
    this.stats.failureCount++;
    this.stats.totalOperations++;
    this.failureCount++;
    this.lastFailureTime = Date.now();
    
    switch (this.state) {
      case CircuitBreakerState.CLOSED:
        if (this.failureCount >= this.options.failureThreshold) {
          this.openCircuit();
        }
        break;
        
      case CircuitBreakerState.HALF_OPEN:
        this.openCircuit();
        break;
    }
  }

  /**
   * Open circuit (failure state)
   */
  openCircuit() {
    this.state = CircuitBreakerState.OPEN;
    this.nextAttempt = Date.now() + this.options.recoveryTimeout;
    this.stats.circuitBreakerOpens++;
    
    this.logger.warn('circuit_breaker_opened', 'Circuit breaker opened due to failures', {
      service: this.serviceName,
      failureCount: this.failureCount,
      failureThreshold: this.options.failureThreshold,
      recoveryTimeout: this.options.recoveryTimeout,
      nextAttempt: new Date(this.nextAttempt).toISOString()
    });
    
    this.emitStateChange(CircuitBreakerState.OPEN);
    this.metrics.emitCounter('circuit_breaker_opens', 1, {
      service: this.serviceName,
      failure_count: this.failureCount
    });
  }

  /**
   * Close circuit (recovery state)
   */
  closeCircuit() {
    this.state = CircuitBreakerState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.stats.circuitBreakerCloses++;
    
    this.logger.info('circuit_breaker_closed', 'Circuit breaker closed after successful recovery', {
      service: this.serviceName,
      successCount: this.successCount,
      successThreshold: this.options.successThreshold
    });
    
    this.emitStateChange(CircuitBreakerState.CLOSED);
    this.metrics.emitCounter('circuit_breaker_closes', 1, {
      service: this.serviceName,
      success_count: this.successCount
    });
  }

  /**
   * Track active operation
   */
  trackOperation() {
    const operationId = Math.random().toString(36).substr(2, 9);
    this.activeOperations.add(operationId);
    return operationId;
  }

  /**
   * Untrack active operation
   */
  untrackOperation(operationId) {
    this.activeOperations.delete(operationId);
  }

  /**
   * Get current circuit breaker state
   */
  getState() {
    return this.state;
  }

  /**
   * Get comprehensive statistics
   */
  getStats() {
    const failureRate = this.stats.totalOperations > 0 
      ? this.stats.failureCount / this.stats.totalOperations 
      : 0;
    
    return {
      ...this.stats,
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      failureRate: Math.round(failureRate * 10000) / 10000,
      activeOperations: this.activeOperations.size,
      lastFailureTime: this.lastFailureTime,
      nextAttempt: this.nextAttempt,
      uptime: process.uptime()
    };
  }

  /**
   * Get health status
   */
  getHealthStatus() {
    const stats = this.getStats();
    const healthy = this.state === CircuitBreakerState.CLOSED && 
                   stats.failureRate < 0.5 && 
                   stats.activeOperations < this.options.maxConcurrent;
    
    return {
      healthy,
      state: this.state,
      stats,
      config: {
        failureThreshold: this.options.failureThreshold,
        successThreshold: this.options.successThreshold,
        recoveryTimeout: this.options.recoveryTimeout,
        maxConcurrent: this.options.maxConcurrent
      },
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Reset circuit breaker to initial state
   */
  reset() {
    this.state = CircuitBreakerState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
    this.nextAttempt = null;
    this.activeOperations.clear();
    
    // Reset stats (except configuration-related)
    this.stats.totalOperations = 0;
    this.stats.successCount = 0;
    this.stats.failureCount = 0;
    this.stats.timeoutCount = 0;
    this.stats.rejectionCount = 0;
    
    this.logger.info('circuit_breaker_reset', 'Circuit breaker reset to initial state', {
      service: this.serviceName
    });
    
    this.emitStateChange(CircuitBreakerState.CLOSED);
  }

  /**
   * Default transient error checker
   */
  defaultTransientErrorChecker(error) {
    // Consider common transient errors as recoverable
    const transientPatterns = [
      /timeout/i,
      /connection/i,
      /network/i,
      /temporary/i,
      /unavailable/i,
      /rate.?limit/i,
      /ECONNRESET/i,
      /ETIMEDOUT/i,
      /ENOTFOUND/i
    ];
    
    const errorMessage = error.message || '';
    const errorCode = error.code || '';
    
    return transientPatterns.some(pattern => 
      pattern.test(errorMessage) || pattern.test(errorCode)
    );
  }

  /**
   * Emit state change event
   */
  emitStateChange(newState) {
    this.emit('stateChange', {
      service: this.serviceName,
      from: this.state,
      to: newState,
      timestamp: Date.now()
    });
    
    this.metrics.emitGauge('circuit_breaker_state', this.getStateValue(newState), {
      service: this.serviceName,
      state: newState
    });
  }

  /**
   * Emit success metrics
   */
  emitSuccess(duration, corrId) {
    this.metrics.emitTiming('circuit_breaker_operation_duration_ms', duration, {
      service: this.serviceName,
      state: this.state,
      success: 'true'
    }, corrId);
    
    this.metrics.emitCounter('circuit_breaker_operations', 1, {
      service: this.serviceName,
      state: this.state,
      success: 'true'
    }, corrId);
  }

  /**
   * Emit failure metrics
   */
  emitFailure(error, duration, corrId, isTransient = true) {
    this.metrics.emitTiming('circuit_breaker_operation_duration_ms', duration, {
      service: this.serviceName,
      state: this.state,
      success: 'false',
      error_type: error.constructor.name,
      transient: isTransient.toString()
    }, corrId);
    
    this.metrics.emitCounter('circuit_breaker_operations', 1, {
      service: this.serviceName,
      state: this.state,
      success: 'false',
      error_type: error.constructor.name
    }, corrId);
    
    if (isTransient) {
      this.metrics.emitCounter('circuit_breaker_failures', 1, {
        service: this.serviceName,
        state: this.state,
        error_type: error.constructor.name
      }, corrId);
    }
  }

  /**
   * Emit rejection metrics
   */
  emitRejection() {
    this.metrics.emitCounter('circuit_breaker_rejections', 1, {
      service: this.serviceName,
      state: this.state
    });
  }

  /**
   * Get numeric state value for metrics
   */
  getStateValue(state) {
    switch (state) {
      case CircuitBreakerState.CLOSED: return 0;
      case CircuitBreakerState.OPEN: return 1;
      case CircuitBreakerState.HALF_OPEN: return 2;
      default: return -1;
    }
  }

  /**
   * Start monitoring interval
   */
  startMonitoring() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }
    
    this.monitoringInterval = setInterval(() => {
      this.emitMonitoringMetrics();
    }, this.options.monitoringPeriod);
  }

  /**
   * Emit periodic monitoring metrics
   */
  emitMonitoringMetrics() {
    const stats = this.getStats();
    
    this.metrics.emitGauge('circuit_breaker_failure_rate', stats.failureRate, {
      service: this.serviceName
    });
    
    this.metrics.emitGauge('circuit_breaker_active_operations', stats.activeOperations, {
      service: this.serviceName
    });
    
    this.metrics.emitGauge('circuit_breaker_total_operations', stats.totalOperations, {
      service: this.serviceName
    });
  }

  /**
   * Stop monitoring
   */
  stopMonitoring() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
  }

  /**
   * Graceful shutdown
   */
  shutdown() {
    this.stopMonitoring();
    this.removeAllListeners();
    
    this.logger.info('circuit_breaker_shutdown', 'Circuit breaker shutdown completed', {
      service: this.serviceName,
      finalStats: this.getStats()
    });
  }
}

module.exports = {
  CircuitBreaker,
  CircuitBreakerState
};