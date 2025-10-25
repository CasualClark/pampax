/**
 * Timeout Manager
 * 
 * Provides configurable timeout management for different operation types.
 * Supports per-operation timeout overrides and graceful timeout handling.
 */

const EventEmitter = require('events');

class TimeoutManager extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.defaultTimeouts = {
      database: 30000,      // 30s
      external_api: 10000,  // 10s
      cache: 5000,          // 5s
      bundle_assembly: 60000, // 60s
      file_operations: 15000,  // 15s
      graph_operations: 20000, // 20s
      search: 25000,        // 25s
      ...options.timeouts
    };
    
    this.activeOperations = new Map();
    this.metrics = {
      timeouts: 0,
      operations: 0,
      byType: {}
    };
  }

  /**
   * Execute an operation with a timeout
   * @param {string} operationType - Type of operation
   * @param {Function} operation - Operation to execute
   * @param {Object} options - Options including timeout override
   * @returns {Promise} Operation result
   */
  async executeWithTimeout(operationType, operation, options = {}) {
    const operationId = this.generateOperationId();
    const timeout = options.timeout || this.defaultTimeouts[operationType] || 10000;
    
    // Initialize metrics for this type if needed
    if (!this.metrics.byType[operationType]) {
      this.metrics.byType[operationType] = { timeouts: 0, operations: 0 };
    }
    
    this.metrics.operations++;
    this.metrics.byType[operationType].operations++;
    
    return new Promise((resolve, reject) => {
      let timeoutId;
      let completed = false;
      
      const cleanup = () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        this.activeOperations.delete(operationId);
      };
      
      const timeoutPromise = new Promise((_, timeoutReject) => {
        timeoutId = setTimeout(() => {
          if (!completed) {
            completed = true;
            this.metrics.timeouts++;
            this.metrics.byType[operationType].timeouts++;
            
            const error = new Error(`Operation ${operationType} timed out after ${timeout}ms`);
            error.code = 'TIMEOUT';
            error.operationType = operationType;
            error.timeout = timeout;
            error.operationId = operationId;
            
            this.emit('timeout', {
              operationId,
              operationType,
              timeout,
              timestamp: Date.now()
            });
            
            cleanup();
            timeoutReject(error);
          }
        }, timeout);
      });
      
      const operationPromise = Promise.resolve(operation());
      
      Promise.race([operationPromise, timeoutPromise])
        .then(result => {
          if (!completed) {
            completed = true;
            this.emit('operationCompleted', {
              operationId,
              operationType,
              success: true,
              timestamp: Date.now()
            });
            cleanup();
            resolve(result);
          }
        })
        .catch(error => {
          if (!completed) {
            completed = true;
            this.emit('operationCompleted', {
              operationId,
              operationType,
              success: false,
              error: error.message,
              timestamp: Date.now()
            });
            cleanup();
            reject(error);
          }
        });
      
      // Track active operation
      this.activeOperations.set(operationId, {
        type: operationType,
        startTime: Date.now(),
        timeout
      });
    });
  }

  /**
   * Create a wrapped version of a function with timeout
   * @param {string} operationType - Type of operation
   * @param {Function} fn - Function to wrap
   * @param {Object} defaultOptions - Default options
   * @returns {Function} Wrapped function
   */
  wrap(operationType, fn, defaultOptions = {}) {
    return async (...args) => {
      const options = typeof args[args.length - 1] === 'object' && args[args.length - 1].timeout !== undefined
        ? args.pop()
        : defaultOptions;
      
      return this.executeWithTimeout(operationType, () => fn(...args), options);
    };
  }

  /**
   * Get active operations
   * @returns {Array} Active operations
   */
  getActiveOperations() {
    return Array.from(this.activeOperations.entries()).map(([id, info]) => ({
      id,
      ...info,
      duration: Date.now() - info.startTime
    }));
  }

  /**
   * Get metrics
   * @returns {Object} Timeout metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      activeOperations: this.activeOperations.size,
      timeoutRate: this.metrics.operations > 0 ? this.metrics.timeouts / this.metrics.operations : 0
    };
  }

  /**
   * Reset metrics
   */
  resetMetrics() {
    this.metrics = {
      timeouts: 0,
      operations: 0,
      byType: {}
    };
  }

  /**
   * Generate unique operation ID
   * @returns {string} Operation ID
   */
  generateOperationId() {
    return `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Check if an operation type is configured
   * @param {string} operationType - Operation type to check
   * @returns {boolean} Whether the type is configured
   */
  hasTimeout(operationType) {
    return this.defaultTimeouts.hasOwnProperty(operationType);
  }

  /**
   * Get timeout for operation type
   * @param {string} operationType - Operation type
   * @returns {number} Timeout in milliseconds
   */
  getTimeout(operationType) {
    return this.defaultTimeouts[operationType];
  }

  /**
   * Update timeout for operation type
   * @param {string} operationType - Operation type
   * @param {number} timeout - Timeout in milliseconds
   */
  setTimeout(operationType, timeout) {
    this.defaultTimeouts[operationType] = timeout;
  }
}

module.exports = TimeoutManager;