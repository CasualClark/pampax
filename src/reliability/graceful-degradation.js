/**
 * Graceful Degradation Implementation
 * 
 * Provides graceful degradation strategies for PAMPAX with:
 * - Multi-level degradation with configurable thresholds
 * - Component health tracking and overall health calculation
 * - Fallback strategy execution with automatic failover
 * - Search and context assembly specific degradation
 * - Comprehensive metrics and monitoring
 */

const EventEmitter = require('events');

/**
 * Degradation levels
 */
const DegradationLevel = {
  FULL: 'full',
  DEGRADED: 'degraded',
  MINIMAL: 'minimal',
  EMERGENCY: 'emergency'
};

/**
 * Fallback strategies
 */
const FallbackStrategy = {
  PRIMARY: 'primary',
  CACHE: 'cache',
  FALLBACK: 'fallback',
  TIMEOUT: 'timeout',
  CIRCUIT_BREAKER: 'circuit_breaker'
};

/**
 * Graceful degradation implementation
 */
class GracefulDegradation extends EventEmitter {
  constructor(serviceName, options = {}) {
    super();
    
    this.serviceName = serviceName;
    this.options = {
      levels: options.levels || this.getDefaultLevels(),
      healthCheckInterval: options.healthCheckInterval || 30000,
      componentWeights: options.componentWeights || {},
      ...options
    };
    
    this.currentLevel = DegradationLevel.FULL;
    this.healthScore = 1.0;
    this.componentHealth = new Map();
    this.levelHistory = [];
    this.strategyExecutions = new Map();
    
    // Metrics and logging
    this.metrics = require('../metrics/metrics-collector.js').getMetricsCollector();
    this.logger = require('../utils/structured-logger.js').getLogger(`graceful-degradation-${serviceName}`);
    
    // Initialize component health tracking
    this.initializeComponentHealth();
    
    // Start health monitoring
    this.startHealthMonitoring();
  }

  /**
   * Get default degradation levels
   */
  getDefaultLevels() {
    return [
      {
        name: DegradationLevel.FULL,
        threshold: 0.95,
        strategies: [FallbackStrategy.PRIMARY]
      },
      {
        name: DegradationLevel.DEGRADED,
        threshold: 0.8,
        strategies: [FallbackStrategy.PRIMARY, FallbackStrategy.CACHE]
      },
      {
        name: DegradationLevel.MINIMAL,
        threshold: 0.6,
        strategies: [FallbackStrategy.CACHE, FallbackStrategy.FALLBACK]
      },
      {
        name: DegradationLevel.EMERGENCY,
        threshold: 0.0,
        strategies: [FallbackStrategy.FALLBACK]
      }
    ];
  }

  /**
   * Initialize component health tracking
   */
  initializeComponentHealth() {
    const defaultComponents = ['database', 'cache', 'external-api', 'search', 'context-assembly'];
    
    for (const component of defaultComponents) {
      this.componentHealth.set(component, 1.0);
    }
  }

  /**
   * Start health monitoring interval
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
   * Perform periodic health check
   */
  async performHealthCheck() {
    try {
      // Update health score based on components
      this.updateHealthFromComponents();
      
      // Emit health metrics
      this.emitHealthMetrics();
      
    } catch (error) {
      this.logger.error('health_check_error', 'Error during health check', {
        service: this.serviceName,
        error: error.message
      });
    }
  }

  /**
   * Update health score and adjust degradation level
   */
  updateHealthScore(score) {
    const previousLevel = this.currentLevel;
    this.healthScore = Math.max(0.0, Math.min(1.0, score));
    
    // Determine new level based on health score
    const newLevel = this.determineLevel(this.healthScore);
    
    if (newLevel !== this.currentLevel) {
      this.changeLevel(previousLevel, newLevel);
    }
  }

  /**
   * Update health score from component health
   */
  updateHealthFromComponents() {
    const overallHealth = this.calculateOverallHealth();
    this.updateHealthScore(overallHealth);
  }

  /**
   * Calculate overall health from components
   */
  calculateOverallHealth() {
    if (this.componentHealth.size === 0) {
      return 1.0;
    }
    
    let totalWeight = 0;
    let weightedHealth = 0;
    
    for (const [component, health] of this.componentHealth.entries()) {
      const weight = this.options.componentWeights[component] || 1.0;
      totalWeight += weight;
      weightedHealth += health * weight;
    }
    
    return totalWeight > 0 ? weightedHealth / totalWeight : 1.0;
  }

  /**
   * Determine degradation level based on health score
   */
  determineLevel(healthScore) {
    for (const level of this.options.levels) {
      if (healthScore >= level.threshold) {
        return level.name;
      }
    }
    
    return DegradationLevel.EMERGENCY;
  }

  /**
   * Change degradation level
   */
  changeLevel(from, to) {
    this.currentLevel = to;
    
    // Record level change
    this.levelHistory.push({
      from,
      to,
      timestamp: Date.now(),
      healthScore: this.healthScore
    });
    
    // Keep history limited
    if (this.levelHistory.length > 100) {
      this.levelHistory = this.levelHistory.slice(-50);
    }
    
    // Log level change
    const isRecovery = this.getLevelPriority(to) > this.getLevelPriority(from);
    
    this.logger[isRecovery ? 'info' : 'warn'](
      'degradation_level_changed',
      `Degradation level ${isRecovery ? 'recovered' : 'degraded'} from ${from} to ${to}`,
      {
        service: this.serviceName,
        from,
        to,
        healthScore: this.healthScore,
        isRecovery
      }
    );
    
    // Emit metrics
    this.metrics.emitCounter('degradation_level_changes', 1, {
      service: this.serviceName,
      from,
      to,
      isRecovery: isRecovery.toString()
    });
    
    // Emit event
    this.emit('levelChange', { from, to, healthScore: this.healthScore });
  }

  /**
   * Get level priority for comparison
   */
  getLevelPriority(level) {
    const priorities = {
      [DegradationLevel.FULL]: 4,
      [DegradationLevel.DEGRADED]: 3,
      [DegradationLevel.MINIMAL]: 2,
      [DegradationLevel.EMERGENCY]: 1
    };
    
    return priorities[level] || 0;
  }

  /**
   * Execute strategies with fallback
   */
  async execute(strategies, options = {}) {
    const startTime = Date.now();
    const corrId = this.logger.getCorrelationId();
    const currentLevelConfig = this.getCurrentLevelConfig();
    
    let lastError = null;
    
    // Try strategies in order of preference for current level
    for (const strategy of currentLevelConfig.strategies) {
      if (!strategies[strategy]) {
        continue;
      }
      
      try {
        const result = await this.executeStrategy(strategy, strategies[strategy], options);
        
        // Record successful strategy execution
        this.recordStrategyExecution(strategy, true, Date.now() - startTime);
        
        this.metrics.emitCounter('degradation_strategy_executions', 1, {
          service: this.serviceName,
          strategy,
          level: this.currentLevel,
          success: 'true'
        }, corrId);
        
        return result;
        
      } catch (error) {
        lastError = error;
        
        // Record failed strategy execution
        this.recordStrategyExecution(strategy, false, Date.now() - startTime);
        
        this.logger.warn('strategy_failed', `Strategy ${strategy} failed`, {
          service: this.serviceName,
          strategy,
          error: error.message
        });
        
        this.metrics.emitCounter('degradation_strategy_executions', 1, {
          service: this.serviceName,
          strategy,
          level: this.currentLevel,
          success: 'false',
          error_type: error.constructor.name
        }, corrId);
      }
    }
    
    // All strategies failed
    throw new Error(`All degradation strategies failed: ${lastError?.message || 'Unknown error'}`);
  }

  /**
   * Execute individual strategy
   */
  async executeStrategy(strategy, strategyFn, options) {
    switch (strategy) {
      case FallbackStrategy.TIMEOUT:
        return this.executeWithTimeout(strategyFn, options.timeout || 5000);
        
      case FallbackStrategy.CIRCUIT_BREAKER:
        return this.executeWithCircuitBreaker(strategyFn, options.circuitBreaker);
        
      case FallbackStrategy.CACHE:
        return this.executeWithCache(strategyFn, options.cacheKey, options.cache);
        
      default:
        return strategyFn();
    }
  }

  /**
   * Execute with timeout fallback
   */
  async executeWithTimeout(fn, timeoutMs) {
    return Promise.race([
      fn(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Strategy timeout')), timeoutMs)
      )
    ]);
  }

  /**
   * Execute with circuit breaker fallback
   */
  async executeWithCircuitBreaker(fn, circuitBreaker) {
    if (circuitBreaker) {
      return circuitBreaker.execute(fn);
    }
    return fn();
  }

  /**
   * Execute with cache fallback
   */
  async executeWithCache(fn, cacheKey, cache) {
    if (cache && cacheKey) {
      try {
        // Try cache first
        const cached = await cache.get(cacheKey);
        if (cached) {
          return cached;
        }
      } catch (error) {
        this.logger.debug('cache_fallback_failed', 'Cache fallback failed', {
          cacheKey,
          error: error.message
        });
      }
    }
    
    // Execute function and cache result if successful
    const result = await fn();
    
    if (cache && cacheKey) {
      try {
        await cache.set(cacheKey, result);
      } catch (error) {
        this.logger.debug('cache_set_failed', 'Failed to cache result', {
          cacheKey,
          error: error.message
        });
      }
    }
    
    return result;
  }

  /**
   * Execute search with degradation
   */
  async executeSearch(strategies, options = {}) {
    const startTime = Date.now();
    
    try {
      const result = await this.execute(strategies, options);
      
      // Add degradation metadata
      return {
        ...result,
        degradation: {
          level: this.currentLevel,
          healthScore: this.healthScore,
          duration: Date.now() - startTime,
          strategies: this.getCurrentLevelConfig().strategies
        }
      };
      
    } catch (error) {
      // Return minimal search result on total failure
      return {
        results: [],
        total: 0,
        degraded: true,
        degradation: {
          level: this.currentLevel,
          healthScore: this.healthScore,
          error: error.message,
          fallback: 'empty_result'
        }
      };
    }
  }

  /**
   * Execute context assembly with degradation
   */
  async executeContextAssembly(strategies, options = {}) {
    const startTime = Date.now();
    
    try {
      const result = await this.execute(strategies, options);
      
      // Add degradation metadata
      return {
        ...result,
        degradation: {
          level: this.currentLevel,
          healthScore: this.healthScore,
          duration: Date.now() - startTime
        }
      };
      
    } catch (error) {
      // Return minimal context on total failure
      return {
        query: options.query || 'unknown',
        total_tokens: 0,
        sources: [],
        assembled_at: new Date().toISOString(),
        budget_used: 0,
        degraded: true,
        degradation: {
          level: this.currentLevel,
          healthScore: this.healthScore,
          error: error.message,
          fallback: 'minimal_context'
        }
      };
    }
  }

  /**
   * Get current level configuration
   */
  getCurrentLevelConfig() {
    return this.options.levels.find(level => level.name === this.currentLevel) ||
           this.options.levels[this.options.levels.length - 1];
  }

  /**
   * Record strategy execution
   */
  recordStrategyExecution(strategy, success, duration) {
    if (!this.strategyExecutions.has(strategy)) {
      this.strategyExecutions.set(strategy, {
        total: 0,
        successful: 0,
        failed: 0,
        totalDuration: 0
      });
    }
    
    const stats = this.strategyExecutions.get(strategy);
    stats.total++;
    stats.totalDuration += duration;
    
    if (success) {
      stats.successful++;
    } else {
      stats.failed++;
    }
  }

  /**
   * Set component health
   */
  setComponentHealth(component, health) {
    const previousHealth = this.componentHealth.get(component) || 1.0;
    this.componentHealth.set(component, Math.max(0.0, Math.min(1.0, health)));
    
    if (Math.abs(previousHealth - health) > 0.1) {
      this.logger.info('component_health_changed', `Component ${component} health changed`, {
        service: this.serviceName,
        component,
        from: previousHealth,
        to: health
      });
    }
  }

  /**
   * Get component health
   */
  getComponentHealth(component) {
    return this.componentHealth.get(component) || 1.0;
  }

  /**
   * Get current health score
   */
  getHealthScore() {
    return this.healthScore;
  }

  /**
   * Get current degradation level
   */
  getCurrentLevel() {
    return this.currentLevel;
  }

  /**
   * Get all degradation levels
   */
  getLevels() {
    return this.options.levels;
  }

  /**
   * Get comprehensive statistics
   */
  getStats() {
    const strategyStats = {};
    for (const [strategy, stats] of this.strategyExecutions.entries()) {
      strategyStats[strategy] = {
        ...stats,
        successRate: stats.total > 0 ? stats.successful / stats.total : 0,
        averageDuration: stats.total > 0 ? stats.totalDuration / stats.total : 0
      };
    }
    
    return {
      currentLevel: this.currentLevel,
      healthScore: this.healthScore,
      componentHealth: Object.fromEntries(this.componentHealth),
      levelHistory: this.levelHistory.slice(-10),
      strategyExecutions: strategyStats,
      configuration: {
        levels: this.options.levels,
        componentWeights: this.options.componentWeights
      },
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Get health status
   */
  getHealthStatus() {
    const stats = this.getStats();
    const healthy = this.currentLevel === DegradationLevel.FULL && this.healthScore > 0.9;
    
    return {
      healthy,
      level: this.currentLevel,
      healthScore: this.healthScore,
      components: Object.fromEntries(this.componentHealth),
      issues: this.identifyHealthIssues(),
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Identify health issues
   */
  identifyHealthIssues() {
    const issues = [];
    
    // Check component health
    for (const [component, health] of this.componentHealth.entries()) {
      if (health < 0.7) {
        issues.push(`Low health for ${component}: ${(health * 100).toFixed(1)}%`);
      }
    }
    
    // Check overall health
    if (this.healthScore < 0.8) {
      issues.push(`Low overall health: ${(this.healthScore * 100).toFixed(1)}%`);
    }
    
    // Check degradation level
    if (this.currentLevel !== DegradationLevel.FULL) {
      issues.push(`System degraded: ${this.currentLevel}`);
    }
    
    return issues;
  }

  /**
   * Emit health metrics
   */
  emitHealthMetrics() {
    this.metrics.emitGauge('degradation_health_score', this.healthScore, {
      service: this.serviceName
    });
    
    this.metrics.emitGauge('degradation_level', this.getLevelPriority(this.currentLevel), {
      service: this.serviceName,
      level: this.currentLevel
    });
    
    // Emit component health metrics
    for (const [component, health] of this.componentHealth.entries()) {
      this.metrics.emitGauge('component_health_score', health, {
        service: this.serviceName,
        component
      });
    }
  }

  /**
   * Reset degradation state
   */
  reset() {
    this.currentLevel = DegradationLevel.FULL;
    this.healthScore = 1.0;
    this.componentHealth.clear();
    this.levelHistory = [];
    this.strategyExecutions.clear();
    
    this.initializeComponentHealth();
    
    this.logger.info('degradation_reset', 'Graceful degradation reset', {
      service: this.serviceName
    });
  }

  /**
   * Stop health monitoring
   */
  stop() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    
    this.removeAllListeners();
    
    this.logger.info('degradation_stopped', 'Graceful degradation stopped', {
      service: this.serviceName,
      finalStats: this.getStats()
    });
  }
}

module.exports = {
  GracefulDegradation,
  DegradationLevel,
  FallbackStrategy
};