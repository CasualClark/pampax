/**
 * Stopping Reason Engine for Context Bundle Assembly
 * 
 * Identifies and explains why bundle assembly stopped with specific numbers
 * and actionable explanations for various stopping conditions.
 */

import { logger } from '../config/logger.js';

/**
 * Stopping condition types with their severity levels
 */
const STOPPING_TYPES = {
  BUDGET_EXHAUSTED: { severity: 'high', category: 'resource' },
  LIMIT_REACHED: { severity: 'medium', category: 'resource' },
  QUALITY_THRESHOLD: { severity: 'medium', category: 'quality' },
  SEARCH_FAILURE: { severity: 'high', category: 'error' },
  CACHE_BOUNDARY: { severity: 'low', category: 'performance' },
  GRAPH_TRAVERSAL_LIMIT: { severity: 'medium', category: 'resource' },
  TIMEOUT: { severity: 'high', category: 'performance' },
  DEGRADATION_TRIGGERED: { severity: 'medium', category: 'quality' }
};

/**
 * Stopping Reason Engine - identifies and explains bundle assembly stopping conditions
 */
export class StoppingReasonEngine {
  constructor(options = {}) {
    this.options = {
      enableDetailedLogging: options.enableDetailedLogging || false,
      cacheHitThreshold: options.cacheHitThreshold || 0.8,
      qualityScoreThreshold: options.qualityScoreThreshold || 0.3,
      budgetWarningThreshold: options.budgetWarningThreshold || 0.9,
      ...options
    };
    
    this.conditions = [];
    this.metrics = {
      startTime: null,
      endTime: null,
      totalTokens: 0,
      totalItems: 0,
      cacheHits: 0,
      cacheMisses: 0,
      searchAttempts: 0,
      searchFailures: 0
    };
  }

  /**
   * Start tracking a new assembly session
   */
  startSession(context = {}) {
    this.conditions = [];
    this.metrics = {
      startTime: Date.now(),
      endTime: null,
      totalTokens: 0,
      totalItems: 0,
      cacheHits: 0,
      cacheMisses: 0,
      searchAttempts: 0,
      searchFailures: 0,
      ...context
    };
    
    if (this.options.enableDetailedLogging) {
      logger.debug('Stopping reason engine session started', { context });
    }
  }

  /**
   * End the current assembly session and generate analysis
   */
  endSession() {
    this.metrics.endTime = Date.now();
    const analysis = this.generateAnalysis();
    
    if (this.options.enableDetailedLogging) {
      logger.debug('Stopping reason engine session ended', { 
        duration: this.metrics.endTime - this.metrics.startTime,
        conditions: this.conditions.length,
        analysis: analysis.summary
      });
    }
    
    return analysis;
  }

  /**
   * Record token budget condition
   */
  recordTokenBudget(used, budget, source = 'unknown') {
    const percentage = used / budget;
    const condition = {
      type: percentage >= 1 ? 'BUDGET_EXHAUSTED' : 'BUDGET_WARNING',
      severity: percentage >= 1 ? 'high' : 'medium',
      category: 'resource',
      source,
      values: { used, budget, percentage },
      timestamp: Date.now()
    };
    
    this.conditions.push(condition);
    this.metrics.totalTokens = used;
    
    return this.generateExplanation(condition);
  }

  /**
   * Record result limit condition
   */
  recordResultLimit(requested, allowed, source = 'unknown') {
    const condition = {
      type: requested > allowed ? 'LIMIT_REACHED' : 'LIMIT_WARNING',
      severity: requested > allowed ? 'medium' : 'low',
      category: 'resource',
      source,
      values: { requested, allowed, excess: requested - allowed },
      timestamp: Date.now()
    };
    
    this.conditions.push(condition);
    this.metrics.totalItems = allowed;
    
    return this.generateExplanation(condition);
  }

  /**
   * Record quality threshold condition
   */
  recordQualityThreshold(score, threshold, item = null, source = 'unknown') {
    const condition = {
      type: score < threshold ? 'QUALITY_THRESHOLD' : 'QUALITY_WARNING',
      severity: score < threshold ? 'medium' : 'low',
      category: 'quality',
      source,
      values: { score, threshold, difference: threshold - score },
      metadata: { item },
      timestamp: Date.now()
    };
    
    this.conditions.push(condition);
    
    return this.generateExplanation(condition);
  }

  /**
   * Record search failure condition
   */
  recordSearchFailure(error, source = 'unknown', attempt = 1) {
    this.metrics.searchFailures++;
    
    const condition = {
      type: 'SEARCH_FAILURE',
      severity: 'high',
      category: 'error',
      source,
      values: { error: error.message, attempt },
      metadata: { stack: error.stack },
      timestamp: Date.now()
    };
    
    this.conditions.push(condition);
    
    return this.generateExplanation(condition);
  }

  /**
   * Record cache boundary condition
   */
  recordCacheBoundary(cacheSize, maxSize, hitRate = null, source = 'unknown') {
    const percentage = cacheSize / maxSize;
    const isHitRateLow = hitRate !== null && hitRate < this.options.cacheHitThreshold;
    
    const condition = {
      type: percentage >= 0.9 ? 'CACHE_BOUNDARY' : (isHitRateLow ? 'CACHE_PERFORMANCE' : 'CACHE_WARNING'),
      severity: percentage >= 0.9 ? 'low' : (isHitRateLow ? 'medium' : 'low'),
      category: 'performance',
      source,
      values: { cacheSize, maxSize, percentage, hitRate },
      timestamp: Date.now()
    };
    
    this.conditions.push(condition);
    
    if (hitRate !== null) {
      this.metrics.cacheHits = Math.floor(hitRate * 100);
      this.metrics.cacheMisses = 100 - this.metrics.cacheHits;
    }
    
    return this.generateExplanation(condition);
  }

  /**
   * Record graph traversal limit condition
   */
  recordGraphTraversalLimit(nodesVisited, maxNodes, edgesTraversed, maxEdges, source = 'graph') {
    const nodeLimitReached = nodesVisited >= maxNodes;
    const edgeLimitReached = edgesTraversed >= maxEdges;
    
    const condition = {
      type: (nodeLimitReached || edgeLimitReached) ? 'GRAPH_TRAVERSAL_LIMIT' : 'GRAPH_WARNING',
      severity: (nodeLimitReached || edgeLimitReached) ? 'medium' : 'low',
      category: 'resource',
      source,
      values: { 
        nodesVisited, 
        maxNodes, 
        edgesTraversed, 
        maxEdges,
        nodeLimitReached,
        edgeLimitReached
      },
      timestamp: Date.now()
    };
    
    this.conditions.push(condition);
    
    return this.generateExplanation(condition);
  }

  /**
   * Record timeout condition
   */
  recordTimeout(duration, maxDuration, operation = 'unknown') {
    const condition = {
      type: 'TIMEOUT',
      severity: 'high',
      category: 'performance',
      source: operation,
      values: { duration, maxDuration, excess: duration - maxDuration },
      timestamp: Date.now()
    };
    
    this.conditions.push(condition);
    
    return this.generateExplanation(condition);
  }

  /**
   * Record degradation triggered condition
   */
  recordDegradationTriggered(level, originalTokens, degradedTokens, reason = 'unknown') {
    const reduction = originalTokens - degradedTokens;
    const reductionPercentage = reduction / originalTokens;
    
    const condition = {
      type: 'DEGRADATION_TRIGGERED',
      severity: 'medium',
      category: 'quality',
      source: 'degradation-policy',
      values: { 
        level, 
        originalTokens, 
        degradedTokens, 
        reduction, 
        reductionPercentage,
        reason
      },
      timestamp: Date.now()
    };
    
    this.conditions.push(condition);
    
    return this.generateExplanation(condition);
  }

  /**
   * Generate human-readable explanation for a condition
   */
  generateExplanation(condition) {
    const { type, severity, category, source, values, metadata } = condition;
    
    switch (type) {
      case 'BUDGET_EXHAUSTED':
        return {
          title: 'Token Budget Exhausted',
          explanation: `Assembly stopped because token budget was fully consumed. Used ${values.used.toLocaleString()} tokens of ${values.budget.toLocaleString()} available (${(values.percentage * 100).toFixed(1)}%).`,
          actionable: [
            'Increase token budget with --token-budget flag',
            'Use more selective search filters',
            'Enable content degradation policies',
            'Reduce result limits with --limit flag'
          ],
          severity,
          category,
          source
        };
        
      case 'BUDGET_WARNING':
        return {
          title: 'Token Budget Warning',
          explanation: `Assembly approaching token budget limit. Used ${values.used.toLocaleString()} of ${values.budget.toLocaleString()} tokens (${(values.percentage * 100).toFixed(1)}%).`,
          actionable: [
            'Monitor remaining token usage',
            'Consider enabling content optimization',
            'Use more specific search queries'
          ],
          severity,
          category,
          source
        };
        
      case 'LIMIT_REACHED':
        return {
          title: 'Result Limit Reached',
          explanation: `Assembly stopped because result limit was exceeded. Requested ${values.requested} results but only ${values.allowed} allowed (${values.excess} excess).`,
          actionable: [
            'Increase result limit with --limit flag',
            'Use more targeted search filters',
            'Enable result ranking to prioritize best matches'
          ],
          severity,
          category,
          source
        };
        
      case 'QUALITY_THRESHOLD':
        return {
          title: 'Quality Threshold Not Met',
          explanation: `Result excluded due to low quality score. Score ${values.score.toFixed(3)} below threshold ${values.threshold.toFixed(3)} (${values.difference.toFixed(3)} difference).`,
          actionable: [
            'Lower quality threshold if results are too restrictive',
            'Improve search query specificity',
            'Check if content is properly indexed',
            metadata?.item ? `Review item: ${metadata.item.path || metadata.item.id}` : null
          ].filter(Boolean),
          severity,
          category,
          source
        };
        
      case 'SEARCH_FAILURE':
        return {
          title: 'Search Operation Failed',
          explanation: `Search operation failed on attempt ${values.attempt}: ${values.error}`,
          actionable: [
            'Check search service availability',
            'Verify database connectivity',
            'Review search configuration',
            'Try alternative search providers'
          ],
          severity,
          category,
          source
        };
        
      case 'CACHE_BOUNDARY':
        return {
          title: 'Cache Size Limit Reached',
          explanation: `Cache reached size boundary. Current size ${values.cacheSize.toLocaleString()} of ${values.maxSize.toLocaleString()} (${(values.percentage * 100).toFixed(1)}% full).`,
          actionable: [
            'Clear old cache entries',
            'Increase cache size limits',
            'Implement cache eviction policies',
            'Monitor cache hit rates'
          ],
          severity,
          category,
          source
        };
        
      case 'CACHE_PERFORMANCE':
        return {
          title: 'Low Cache Hit Rate',
          explanation: `Cache performance below optimal threshold. Hit rate ${(values.hitRate * 100).toFixed(1)}% below target ${(this.options.cacheHitThreshold * 100).toFixed(1)}%.`,
          actionable: [
            'Review cache key generation strategy',
            'Increase cache retention periods',
            'Analyze cache miss patterns',
            'Optimize cache warming strategies'
          ],
          severity,
          category,
          source
        };
        
      case 'GRAPH_TRAVERSAL_LIMIT':
        return {
          title: 'Graph Traversal Limit Reached',
          explanation: `Graph expansion stopped due to limits. Visited ${values.nodesVisited} of ${values.maxNodes} nodes and ${values.edgesTraversed} of ${values.maxEdges} edges.`,
          actionable: [
            values.nodeLimitReached ? 'Increase node traversal limit' : null,
            values.edgeLimitReached ? 'Increase edge traversal limit' : null,
            'Use more focused graph queries',
            'Implement graph pruning strategies'
          ].filter(Boolean),
          severity,
          category,
          source
        };
        
      case 'TIMEOUT':
        return {
          title: 'Operation Timeout',
          explanation: `Operation exceeded time limit. Took ${values.duration}ms but limit was ${values.maxDuration}ms (${values.excess}ms excess).`,
          actionable: [
            'Increase timeout limits for complex operations',
            'Optimize query performance',
            'Consider async processing for large operations',
            'Review resource constraints'
          ],
          severity,
          category,
          source
        };
        
      case 'DEGRADATION_TRIGGERED':
        return {
          title: 'Content Degradation Applied',
          explanation: `Content degraded to fit constraints. Level ${values.level} reduced tokens by ${values.reduction.toLocaleString()} (${(values.reductionPercentage * 100).toFixed(1)}%) from ${values.originalTokens.toLocaleString()} to ${values.degradedTokens.toLocaleString()}.`,
          actionable: [
            'Review degradation level appropriateness',
            'Consider increasing token budget',
            'Optimize content selection strategies',
            `Adjust degradation policy: ${values.reason}`
          ],
          severity,
          category,
          source
        };
        
      default:
        return {
          title: 'Unknown Condition',
          explanation: `Unknown stopping condition detected: ${type}`,
          actionable: ['Review system logs for details'],
          severity,
          category,
          source
        };
    }
  }

  /**
   * Generate comprehensive analysis of all conditions
   */
  generateAnalysis() {
    const explanations = this.conditions.map(condition => this.generateExplanation(condition));
    
    // Group conditions by severity
    const grouped = {
      high: explanations.filter(e => e.severity === 'high'),
      medium: explanations.filter(e => e.severity === 'medium'),
      low: explanations.filter(e => e.severity === 'low')
    };
    
    // Calculate metrics
    const duration = this.metrics.endTime ? this.metrics.endTime - this.metrics.startTime : 0;
    const cacheHitRate = this.metrics.cacheHits + this.metrics.cacheMisses > 0 
      ? this.metrics.cacheHits / (this.metrics.cacheHits + this.metrics.cacheMisses) 
      : 0;
    
    return {
      summary: {
        totalConditions: this.conditions.length,
        highSeverityCount: grouped.high.length,
        mediumSeverityCount: grouped.medium.length,
        lowSeverityCount: grouped.low.length,
        duration,
        tokensUsed: this.metrics.totalTokens,
        itemsProcessed: this.metrics.totalItems,
        cacheHitRate,
        searchSuccessRate: this.metrics.searchAttempts > 0 
          ? (this.metrics.searchAttempts - this.metrics.searchFailures) / this.metrics.searchAttempts 
          : 1
      },
      conditions: explanations,
      grouped,
      metrics: this.metrics,
      recommendations: this.generateRecommendations(grouped)
    };
  }

  /**
   * Generate actionable recommendations based on conditions
   */
  generateRecommendations(grouped) {
    const recommendations = [];
    
    // High severity recommendations
    if (grouped.high.length > 0) {
      recommendations.push({
        priority: 'immediate',
        title: 'Address Critical Issues',
        description: `${grouped.high.length} high-severity conditions require immediate attention.`,
        actions: grouped.high.flatMap(c => c.actionable.slice(0, 2))
      });
    }
    
    // Resource optimization recommendations
    const resourceIssues = [...grouped.high, ...grouped.medium].filter(c => c.category === 'resource');
    if (resourceIssues.length > 0) {
      recommendations.push({
        priority: 'high',
        title: 'Optimize Resource Usage',
        description: 'Resource limits are impacting assembly performance.',
        actions: [
          'Review and adjust token budget allocations',
          'Implement smarter result limiting strategies',
          'Consider content degradation policies',
          'Use intent-based prioritization'
        ]
      });
    }
    
    // Quality recommendations
    const qualityIssues = [...grouped.high, ...grouped.medium].filter(c => c.category === 'quality');
    if (qualityIssues.length > 0) {
      recommendations.push({
        priority: 'medium',
        title: 'Improve Content Quality',
        description: 'Quality thresholds are excluding potentially useful content.',
        actions: [
          'Review quality scoring algorithms',
          'Adjust quality thresholds based on use case',
          'Improve content indexing and metadata',
          'Consider context-aware quality adjustments'
        ]
      });
    }
    
    // Performance recommendations
    const performanceIssues = [...grouped.medium, ...grouped.low].filter(c => c.category === 'performance');
    if (performanceIssues.length > 0) {
      recommendations.push({
        priority: 'medium',
        title: 'Enhance Performance',
        description: 'Performance bottlenecks detected during assembly.',
        actions: [
          'Optimize cache strategies and hit rates',
          'Review timeout configurations',
          'Implement parallel processing where possible',
          'Monitor and optimize graph traversal efficiency'
        ]
      });
    }
    
    return recommendations;
  }

  /**
   * Get current session metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      currentConditions: this.conditions.length,
      isRunning: this.metrics.startTime && !this.metrics.endTime
    };
  }

  /**
   * Check if assembly should stop based on current conditions
   */
  shouldStop() {
    // Stop if any high-severity conditions exist
    const hasHighSeverity = this.conditions.some(c => 
      STOPPING_TYPES[c.type]?.severity === 'high'
    );
    
    // Stop if budget is exhausted
    const budgetExhausted = this.conditions.some(c => 
      c.type === 'BUDGET_EXHAUSTED'
    );
    
    // Stop if multiple search failures occurred
    const multipleFailures = this.conditions.filter(c => 
      c.type === 'SEARCH_FAILURE'
    ).length >= 3;
    
    return hasHighSeverity || budgetExhausted || multipleFailures;
  }

  /**
   * Export conditions in machine-readable format
   */
  exportConditions(format = 'json') {
    const analysis = this.generateAnalysis();
    
    switch (format) {
      case 'json':
        return JSON.stringify(analysis, null, 2);
        
      case 'csv':
        const headers = ['type', 'severity', 'category', 'source', 'timestamp', 'explanation'];
        const rows = this.conditions.map(c => [
          c.type,
          c.severity,
          c.category,
          c.source,
          c.timestamp,
          this.generateExplanation(c).explanation
        ]);
        return [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
        
      default:
        return analysis;
    }
  }
}

/**
 * Create a stopping reason engine with default configuration
 */
export function createStoppingReasonEngine(options = {}) {
  return new StoppingReasonEngine(options);
}

/**
 * Utility function to integrate with existing context assembler
 */
export function integrateWithAssembler(assembler, engineOptions = {}) {
  const engine = new StoppingReasonEngine(engineOptions);
  
  // Wrap assembler methods to add stopping reason tracking
  const originalAssembleWithExplanation = assembler.assembleWithExplanation.bind(assembler);
  
  assembler.assembleWithExplanation = async function(query, options = {}) {
    engine.startSession({ query, options });
    
    try {
      const result = await originalAssembleWithExplanation(query, options);
      
      // Analyze the result for stopping conditions
      if (result.explanation?.stopping_conditions) {
        result.explanation.stopping_conditions.forEach(condition => {
          // Parse existing stopping conditions and record them
          if (condition.includes('token budget')) {
            engine.recordTokenBudget(result.total_tokens, options.budget || 5000, 'context-assembler');
          } else if (condition.includes('item limit') || condition.includes('result limit')) {
            engine.recordResultLimit(result.sources.reduce((sum, s) => sum + (s.items?.length || 0), 0), options.limit || 10, 'context-assembler');
          } else if (condition.includes('failed')) {
            engine.recordSearchFailure(new Error(condition), condition.split(' ')[0].toLowerCase());
          }
        });
      }
      
      // Add stopping reason analysis to the result
      const analysis = engine.endSession();
      result.explanation.stopping_reasons = analysis;
      
      return result;
    } catch (error) {
      engine.recordSearchFailure(error, 'context-assembler');
      const analysis = engine.endSession();
      throw error;
    }
  };
  
  return engine;
}