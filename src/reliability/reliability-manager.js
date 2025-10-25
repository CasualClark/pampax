/**
 * Reliability Manager
 * 
 * Main coordinator for all reliability components in PAMPAX:
 * - Circuit breaker management
 * - Retry policy coordination
 * - Timeout management
 * - Graceful degradation orchestration
 * - Health monitoring and metrics
 * - Configuration management
 */

const EventEmitter = require('events');

const { CircuitBreaker } = require('./circuit-breaker.js');
const { RetryPolicy } = require('./retry-policy.js');
const { GracefulDegradation } = require('./graceful-degradation.js');
const TimeoutManager = require('./timeout-manager.js');

/**
 * Default timeout configurations
 */
const DEFAULT_TIMEOUTS = {
  search: 5000,
  assembly: 10000,
  database: 2000,
  cache: 1000,
  external: 8000
};

/**
 * Default circuit breaker configurations
 */
const DEFAULT_CIRCUIT_BREAKERS = {
  search: { failureThreshold: 5, recoveryTimeout: 30000 },
  database: { failureThreshold: 3, recoveryTimeout: 60000 },
  cache: { failureThreshold: 10, recoveryTimeout: 15000 },
  external: { failureThreshold: 3, recoveryTimeout: 45000 }
};

/**
 * Default retry policy configurations
 */
const DEFAULT_RETRY_POLICIES = {
  search: { maxAttempts: 3, baseDelay: 1000 },
  database: { maxAttempts: 5, baseDelay: 500 },
  cache: { maxAttempts: 2, baseDelay: 200 },
  external: { maxAttempts: 3, baseDelay: 2000 }
};

/**
 * Main reliability manager
 */
class ReliabilityManager extends EventEmitter {
  constructor(serviceName, options = {}) {
    super();
    
    this.serviceName = serviceName;
    this.options = {
      timeouts: { ...DEFAULT_TIMEOUTS, ...options.timeouts },
      circuitBreakers: { ...DEFAULT_CIRCUIT_BREAKERS, ...options.circuitBreakers },
      retryPolicies: { ...DEFAULT_RETRY_POLICIES, ...options.retryPolicies },
      healthCheckInterval: options.healthCheckInterval || 30000,
      enableGracefulDegradation: options.enableGracefulDegradation !== false,
      ...options
    };
    
    // Component managers
    this.circuitBreakers = new Map();
    this.retryPolicies = new Map();
    this.timeoutManager = new TimeoutManager(this.options);
    this.gracefulDegradation = null;
    
    // Statistics
    this.stats = {
      operations: {
        total: 0,
        successful: 0,
        failed: 0,
        timeouts: 0,
        retries: 0,
        circuitBreakerActivations: 0
      },
      startTime: Date.now(),
      lastHealthCheck: null
    };
    
    // Metrics and logging
    this.metrics = require('../metrics/metrics-collector.js').getMetricsCollector();
    this.logger = require('../utils/structured-logger.js').getLogger(`reliability-manager-${serviceName}`);
    
    // Initialize components
    this.initializeComponents();
    
    // Start health monitoring
    this.startHealthMonitoring();
  }

  /**
   * Initialize reliability components
   */
  initializeComponents() {
    // Initialize graceful degradation
    if (this.options.enableGracefulDegradation) {
      this.gracefulDegradation = new GracefulDegradation(this.serviceName, {
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
    }
    
    this.logger.info('reliability_manager_initialized', 'Reliability manager initialized', {
      service: this.serviceName,
      components: {
        circuitBreakers: Object.keys(this.options.circuitBreakers).length,
        retryPolicies: Object.keys(this.options.retryPolicies).length,
        timeouts: Object.keys(this.options.timeouts).length,
        gracefulDegradation: !!this.gracefulDegradation
      }
    });
  }

  /**
   * Start health monitoring
   */
  startHealthMonitoring() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    
    this.healthCheckInterval = setInterval(() => {
      this.performHealthCheck();
    }, this.options.healthCheckInterval);
  }

  /**
   * Perform comprehensive health check
   */
  async performHealthCheck() {
    try {
      this.stats.lastHealthCheck = Date.now();
      
      // Check circuit breaker health
      for (const [name, circuitBreaker] of this.circuitBreakers.entries()) {
        const health = circuitBreaker.getHealthStatus();
        if (!health.healthy) {
          this.logger.warn('circuit_breaker_unhealthy', `Circuit breaker ${name} is unhealthy`, {
            service: this.serviceName,
            circuitBreaker: name,
            state: health.state,
            stats: health.stats
          });
        }
      }
      
      // Update graceful degradation based on component health
      if (this.gracefulDegradation) {
        this.updateDegradationFromComponents();
      }
      
      // Emit health metrics
      this.emitHealthMetrics();
      
    } catch (error) {
      this.logger.error('health_check_error', 'Error during reliability health check', {
        service: this.serviceName,
        error: error.message
      });
    }
  }

  /**
   * Update graceful degradation from component health
   */
  updateDegradationFromComponents() {
    if (!this.gracefulDegradation) return;
    
    // Calculate component health scores
    const componentHealth = {};
    
    for (const [name, circuitBreaker] of this.circuitBreakers.entries()) {
      const health = circuitBreaker.getHealthStatus();
      componentHealth[name] = health.healthy ? 1.0 : 0.5;
    }
    
    // Update degradation system
    for (const [component, health] of Object.entries(componentHealth)) {
      this.gracefulDegradation.setComponentHealth(component, health);
    }
    
    this.gracefulDegradation.updateHealthFromComponents();
  }

  /**
   * Execute operation with full reliability protection
   */
  async execute(operationType, operation, options = {}) {
    const startTime = Date.now();
    const corrId = this.logger.getCorrelationId();
    
    this.stats.operations.total++;
    
    try {
      let result;
      
      // Use graceful degradation if available and enabled
      if (this.gracefulDegradation && options.useDegradation !== false) {
        result = await this.executeWithDegradation(operationType, operation, options);
      } else {
        result = await this.executeWithProtection(operationType, operation, options);
      }
      
      // Record success
      this.stats.operations.successful++;
      const duration = Date.now() - startTime;
      
      this.emitOperationMetrics(operationType, duration, true, corrId);
      
      return result;
      
    } catch (error) {
      // Record failure
      this.stats.operations.failed++;
      const duration = Date.now() - startTime;
      
      this.emitOperationMetrics(operationType, duration, false, corrId);
      
      // Try fallback if provided
      if (options.fallback) {
        try {
          const fallbackResult = await options.fallback();
          
          this.logger.info('fallback_success', 'Operation succeeded using fallback', {
            service: this.serviceName,
            operationType,
            originalError: error.message
          });
          
          return fallbackResult;
          
        } catch (fallbackError) {
          this.logger.error('fallback_failed', 'Both operation and fallback failed', {
            service: this.serviceName,
            operationType,
            originalError: error.message,
            fallbackError: fallbackError.message
          });
          
          throw fallbackError;
        }
      }
      
      throw error;
    }
  }

  /**
   * Execute with graceful degradation
   */
  async executeWithDegradation(operationType, operation, options) {
    const strategies = {
      primary: () => this.executeWithProtection(operationType, operation, options)
    };
    
    // Add cache strategy if available
    if (options.cacheKey && options.cache) {
      strategies.cache = () => this.executeWithCache(operation, options.cacheKey, options.cache);
    }
    
    // Add fallback strategy
    if (options.fallback) {
      strategies.fallback = options.fallback;
    }
    
    return await this.gracefulDegradation.execute(strategies, options);
  }

  /**
   * Execute with protection layers (timeout, circuit breaker, retry)
   */
  async executeWithProtection(operationType, operation, options = {}) {
    const timeout = options.timeout || this.options.timeouts[operationType] || 5000;
    
    // Create protected operation
    let protectedOperation = operation;
    
    // Add retry protection
    if (options.retry !== false) {
      const retryPolicy = this.getRetryPolicy(operationType);
      protectedOperation = () => retryPolicy.execute(operation, options.retryOptions);
    }
    
    // Add circuit breaker protection
    if (options.circuitBreaker !== false) {
      const circuitBreaker = this.getCircuitBreaker(operationType);
      protectedOperation = () => circuitBreaker.execute(protectedOperation, {
        fallback: options.circuitBreakerFallback
      });
    }
    
    // Add timeout protection
    return await this.timeoutManager.executeWithTimeout(operationType, protectedOperation, {
      timeout
    });
  }

  /**
   * Execute with timeout only
   */
  async executeWithTimeout(operationType, operation, options = {}) {
    const timeout = options.timeout || this.options.timeouts[operationType] || 5000;
    
    return await this.timeoutManager.executeWithTimeout(operationType, operation, {
      timeout
    });
  }

  /**
   * Execute with circuit breaker only
   */
  async executeWithCircuitBreaker(operationType, operation, options = {}) {
    const circuitBreaker = this.getCircuitBreaker(operationType);
    
    return await circuitBreaker.execute(operation, {
      fallback: options.fallback
    });
  }

  /**
   * Execute with retry only
   */
  async executeWithRetry(operationType, operation, options = {}) {
    const retryPolicy = this.getRetryPolicy(operationType);
    
    return await retryPolicy.execute(operation, options.retryOptions);
  }

  /**
   * Execute with cache
   */
  async executeWithCache(operation, cacheKey, cache) {
    try {
      // Try cache first
      const cached = await cache.get(cacheKey);
      if (cached) {
        return cached;
      }
    } catch (error) {
      this.logger.debug('cache_miss_error', 'Cache miss error', {
        service: this.serviceName,
        cacheKey,
        error: error.message
      });
    }
    
    // Execute operation
    const result = await operation();
    
    // Cache result
    try {
      await cache.set(cacheKey, result);
    } catch (error) {
      this.logger.debug('cache_set_error', 'Cache set error', {
        service: this.serviceName,
        cacheKey,
        error: error.message
      });
    }
    
    return result;
  }

  /**
   * Execute search with reliability protection
   */
  async executeSearch(query, searchFn, options = {}) {
    const startTime = Date.now();
    
    try {
      const result = await this.execute('search', () => searchFn(query), {
        ...options,
        useDegradation: true
      });
      
      // Add reliability metadata
      return {
        ...result,
        reliability: {
          protected: true,
          duration: Date.now() - startTime,
          protection: ['timeout', 'circuit-breaker', 'retry', 'degradation'],
          service: this.serviceName
        }
      };
      
    } catch (error) {
      // Return degraded search result
      return {
        results: [],
        total: 0,
        query,
        reliability: {
          protected: true,
          degraded: true,
          error: error.message,
          duration: Date.now() - startTime,
          fallback: 'empty_result',
          service: this.serviceName
        }
      };
    }
  }

  /**
   * Execute context assembly with reliability protection
   */
  async executeContextAssembly(query, assemblyFn, options = {}) {
    const startTime = Date.now();
    
    try {
      const result = await this.execute('assembly', () => assemblyFn(query), {
        ...options,
        useDegradation: true
      });
      
      // Add reliability metadata
      return {
        ...result,
        reliability: {
          protected: true,
          duration: Date.now() - startTime,
          protection: ['timeout', 'circuit-breaker', 'retry', 'degradation'],
          service: this.serviceName
        }
      };
      
    } catch (error) {
      // Return minimal context
      return {
        query,
        total_tokens: 0,
        sources: [],
        assembled_at: new Date().toISOString(),
        budget_used: 0,
        degraded: true,
        reliability: {
          protected: true,
          degraded: true,
          error: error.message,
          duration: Date.now() - startTime,
          fallback: 'minimal_context',
          service: this.serviceName
        }
      };
    }
  }

  /**
   * Get or create circuit breaker for operation type
   */
  getCircuitBreaker(operationType) {
    if (!this.circuitBreakers.has(operationType)) {
      const config = this.options.circuitBreakers[operationType] || {};
      const circuitBreaker = new CircuitBreaker(`${this.serviceName}-${operationType}`, config);
      
      // Track circuit breaker events
      circuitBreaker.on('stateChange', (event) => {
        this.stats.operations.circuitBreakerActivations++;
        this.emit('circuitBreakerStateChange', event);
      });
      
      this.circuitBreakers.set(operationType, circuitBreaker);
    }
    
    return this.circuitBreakers.get(operationType);
  }

  /**
   * Get or create retry policy for operation type
   */
  getRetryPolicy(operationType) {
    if (!this.retryPolicies.has(operationType)) {
      const config = this.options.retryPolicies[operationType] || {};
      const retryPolicy = new RetryPolicy(`${this.serviceName}-${operationType}`, config);
      
      this.retryPolicies.set(operationType, retryPolicy);
    }
    
    return this.retryPolicies.get(operationType);
  }

  /**
   * Get timeout manager
   */
  getTimeoutManager() {
    return this.timeoutManager;
  }

  /**
   * Get graceful degradation manager
   */
  getGracefulDegradation() {
    return this.gracefulDegradation;
  }

  /**
   * Get all circuit breakers
   */
  getCircuitBreakers() {
    return Object.fromEntries(this.circuitBreakers);
  }

  /**
   * Get all retry policies
   */
  getRetryPolicies() {
    return Object.fromEntries(this.retryPolicies);
  }

  /**
   * Get service name
   */
  getServiceName() {
    return this.serviceName;
  }

  /**
   * Get comprehensive health status
   */
  getHealthStatus() {
    const components = {
      circuitBreakers: {},
      retryPolicies: {},
      gracefulDegradation: null,
      timeoutManager: this.timeoutManager.getMetrics()
    };
    
    // Collect circuit breaker health
    for (const [name, circuitBreaker] of this.circuitBreakers.entries()) {
      components.circuitBreakers[name] = circuitBreaker.getHealthStatus();
    }
    
    // Collect retry policy health
    for (const [name, retryPolicy] of this.retryPolicies.entries()) {
      components.retryPolicies[name] = retryPolicy.getHealthStatus();
    }
    
    // Collect graceful degradation health
    if (this.gracefulDegradation) {
      components.gracefulDegradation = this.gracefulDegradation.getHealthStatus();
    }
    
    // Calculate overall health
    const healthIssues = [];
    let healthyComponents = 0;
    let totalComponents = 0;
    
    for (const cbHealth of Object.values(components.circuitBreakers)) {
      totalComponents++;
      if (cbHealth.healthy) healthyComponents++;
      else healthIssues.push(`Circuit breaker ${cbHealth.state}`);
    }
    
    if (components.gracefulDegradation) {
      totalComponents++;
      if (components.gracefulDegradation.healthy) healthyComponents++;
      else healthIssues.push('Graceful degradation active');
    }
    
    const overall = {
      healthy: healthIssues.length === 0 && healthyComponents === totalComponents,
      score: totalComponents > 0 ? healthyComponents / totalComponents : 1.0,
      issues: healthIssues
    };
    
    return {
      healthy: overall.healthy,
      score: overall.score,
      service: this.serviceName,
      components,
      overall,
      uptime: Date.now() - this.stats.startTime,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Get comprehensive statistics
   */
  getStats() {
    const circuitBreakerStats = {};
    const retryPolicyStats = {};
    
    // Collect circuit breaker stats
    for (const [name, circuitBreaker] of this.circuitBreakers.entries()) {
      circuitBreakerStats[name] = circuitBreaker.getStats();
    }
    
    // Collect retry policy stats
    for (const [name, retryPolicy] of this.retryPolicies.entries()) {
      retryPolicyStats[name] = retryPolicy.getStats();
    }
    
    return {
      service: this.serviceName,
      circuitBreakers: circuitBreakerStats,
      retryPolicies: retryPolicyStats,
      gracefulDegradation: this.gracefulDegradation ? this.gracefulDegradation.getStats() : null,
      timeoutManager: this.timeoutManager.getMetrics(),
      operations: { ...this.stats },
      configuration: this.options,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig) {
    // Validate configuration
    this.validateConfig(newConfig);
    
    // Update timeouts
    if (newConfig.timeouts) {
      Object.assign(this.options.timeouts, newConfig.timeouts);
      for (const [operation, timeout] of Object.entries(newConfig.timeouts)) {
        this.timeoutManager.setTimeout(operation, timeout);
      }
    }
    
    // Update circuit breakers
    if (newConfig.circuitBreakers) {
      Object.assign(this.options.circuitBreakers, newConfig.circuitBreakers);
      // Note: Existing circuit breakers won't be updated, only new ones will use new config
    }
    
    // Update retry policies
    if (newConfig.retryPolicies) {
      Object.assign(this.options.retryPolicies, newConfig.retryPolicies);
      // Note: Existing retry policies won't be updated, only new ones will use new config
    }
    
    this.logger.info('configuration_updated', 'Reliability manager configuration updated', {
      service: this.serviceName,
      updatedKeys: Object.keys(newConfig)
    });
  }

  /**
   * Validate configuration
   */
  validateConfig(config) {
    if (config.timeouts) {
      for (const [operation, timeout] of Object.entries(config.timeouts)) {
        if (typeof timeout !== 'number' || timeout <= 0) {
          throw new Error(`Invalid timeout value for ${operation}: ${timeout}`);
        }
      }
    }
    
    if (config.circuitBreakers) {
      for (const [operation, cbConfig] of Object.entries(config.circuitBreakers)) {
        if (cbConfig.failureThreshold && (typeof cbConfig.failureThreshold !== 'number' || cbConfig.failureThreshold <= 0)) {
          throw new Error(`Invalid failure threshold for ${operation}: ${cbConfig.failureThreshold}`);
        }
      }
    }
  }

  /**
   * Emit operation metrics
   */
  emitOperationMetrics(operationType, duration, success, corrId) {
    this.metrics.emitTiming('reliability_operation_duration_ms', duration, {
      service: this.serviceName,
      operationType,
      success: success.toString()
    }, corrId);
    
    this.metrics.emitCounter('reliability_operations', 1, {
      service: this.serviceName,
      operationType,
      success: success.toString()
    }, corrId);
  }

  /**
   * Emit health metrics
   */
  emitHealthMetrics() {
    const health = this.getHealthStatus();
    
    this.metrics.emitGauge('reliability_health_score', health.score, {
      service: this.serviceName
    });
    
    this.metrics.emitGauge('reliability_uptime_ms', health.uptime, {
      service: this.serviceName
    });
  }

  /**
   * Check if manager is started
   */
  isStarted() {
    return !!this.healthCheckInterval;
  }

  /**
   * Start reliability manager
   */
  start() {
    if (!this.isStarted()) {
      this.startHealthMonitoring();
      
      this.logger.info('reliability_manager_started', 'Reliability manager started', {
        service: this.serviceName
      });
    }
  }

  /**
   * Stop reliability manager
   */
  stop() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    
    this.logger.info('reliability_manager_stopped', 'Reliability manager stopped', {
      service: this.serviceName
    });
  }

  /**
   * Graceful shutdown
   */
  shutdown() {
    this.stop();
    
    // Shutdown all components
    for (const circuitBreaker of this.circuitBreakers.values()) {
      circuitBreaker.shutdown();
    }
    
    if (this.gracefulDegradation) {
      this.gracefulDegradation.stop();
    }
    
    this.removeAllListeners();
    
    this.logger.info('reliability_manager_shutdown', 'Reliability manager shutdown completed', {
      service: this.serviceName,
      finalStats: this.getStats()
    });
  }
}

module.exports = {
  ReliabilityManager,
  DEFAULT_TIMEOUTS,
  DEFAULT_CIRCUIT_BREAKERS,
  DEFAULT_RETRY_POLICIES
};