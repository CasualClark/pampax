#!/usr/bin/env node

import { logger } from '../config/logger.js';
import crypto from 'crypto';

/**
 * EvidenceTracker - Captures and organizes evidence for context items
 * 
 * Tracks search score breakdown, graph relationships, intent classification matches,
 * learning system signals, and cache status for comprehensive evidence management.
 */
export class EvidenceTracker {
  constructor(options = {}) {
    this.maxEvidenceItems = options.maxEvidenceItems || 1000;
    this.enableDetailedLogging = options.enableDetailedLogging || false;
    this.evidenceStore = new Map(); // In-memory evidence storage
    this.sessionId = options.sessionId || this.generateSessionId();
    
    // Evidence type configurations
    this.evidenceTypes = {
      SEARCH: 'search',
      GRAPH: 'graph', 
      INTENT: 'intent',
      LEARNING: 'learning',
      CACHE: 'cache',
      PERFORMANCE: 'performance'
    };
  }

  /**
   * Generate a unique session ID
   */
  generateSessionId() {
    return `session_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  }

  /**
   * Add evidence for a search result
   */
  addSearchEvidence(itemId, evidence) {
    const evidenceItem = {
      id: this.generateEvidenceId(itemId, this.evidenceTypes.SEARCH),
      type: this.evidenceTypes.SEARCH,
      itemId,
      timestamp: Date.now(),
      sessionId: this.sessionId,
      data: {
        score: evidence.score || 0,
        scoreBreakdown: evidence.scoreBreakdown || {},
        rank: evidence.rank || 0,
        query: evidence.query || '',
        searchType: evidence.searchType || 'vector', // vector, bm25, hybrid
        matchType: evidence.matchType || 'semantic',
        termFrequency: evidence.termFrequency || {},
        idfScore: evidence.idfScore || 0,
        bm25Score: evidence.bm25Score || 0,
        vectorSimilarity: evidence.vectorSimilarity || 0,
        contentLength: evidence.contentLength || 0,
        metadata: evidence.metadata || {}
      }
    };

    this.storeEvidence(evidenceItem);
    
    if (this.enableDetailedLogging) {
      logger.debug('Added search evidence', {
        itemId,
        score: evidence.score,
        searchType: evidence.searchType
      }, 'evidence-tracker');
    }

    return evidenceItem.id;
  }

  /**
   * Add evidence for graph relationships
   */
  addGraphEvidence(itemId, evidence) {
    const evidenceItem = {
      id: this.generateEvidenceId(itemId, this.evidenceTypes.GRAPH),
      type: this.evidenceTypes.GRAPH,
      itemId,
      timestamp: Date.now(),
      sessionId: this.sessionId,
      data: {
        relationships: evidence.relationships || [],
        graphExpansionScore: evidence.graphExpansionScore || 0,
        nodeCentrality: evidence.nodeCentrality || 0,
        pathLength: evidence.pathLength || 0,
        relationshipTypes: evidence.relationshipTypes || [],
        connectedNodes: evidence.connectedNodes || [],
        confidence: evidence.confidence || 0,
        expansionDepth: evidence.expansionDepth || 0,
        traversalTime: evidence.traversalTime || 0,
        graphMetrics: evidence.graphMetrics || {}
      }
    };

    this.storeEvidence(evidenceItem);
    
    if (this.enableDetailedLogging) {
      logger.debug('Added graph evidence', {
        itemId,
        relationships: evidence.relationships?.length || 0,
        confidence: evidence.confidence
      }, 'evidence-tracker');
    }

    return evidenceItem.id;
  }

  /**
   * Add evidence for intent classification matches
   */
  addIntentEvidence(itemId, evidence) {
    const evidenceItem = {
      id: this.generateEvidenceId(itemId, this.evidenceTypes.INTENT),
      type: this.evidenceTypes.INTENT,
      itemId,
      timestamp: Date.now(),
      sessionId: this.sessionId,
      data: {
        intent: evidence.intent || 'unknown',
        confidence: evidence.confidence || 0,
        entities: evidence.entities || [],
        suggestedPolicies: evidence.suggestedPolicies || [],
        queryMatch: evidence.queryMatch || false,
        contextualRelevance: evidence.contextualRelevance || 0,
        intentScore: evidence.intentScore || 0,
        entityMatches: evidence.entityMatches || [],
        policyAlignment: evidence.policyAlignment || {},
        classificationTime: evidence.classificationTime || 0
      }
    };

    this.storeEvidence(evidenceItem);
    
    if (this.enableDetailedLogging) {
      logger.debug('Added intent evidence', {
        itemId,
        intent: evidence.intent,
        confidence: evidence.confidence
      }, 'evidence-tracker');
    }

    return evidenceItem.id;
  }

  /**
   * Add evidence from learning system signals
   */
  addLearningEvidence(itemId, evidence) {
    const evidenceItem = {
      id: this.generateEvidenceId(itemId, this.evidenceTypes.LEARNING),
      type: this.evidenceTypes.LEARNING,
      itemId,
      timestamp: Date.now(),
      sessionId: this.sessionId,
      data: {
        signal: evidence.signal || 'neutral',
        weight: evidence.weight || 0,
        historicalPerformance: evidence.historicalPerformance || {},
        userSatisfaction: evidence.userSatisfaction || 0,
        outcomeScore: evidence.outcomeScore || 0,
        learningSignal: evidence.learningSignal || {},
        adaptationFactor: evidence.adaptationFactor || 1.0,
        feedbackScore: evidence.feedbackScore || 0,
        optimizationMetrics: evidence.optimizationMetrics || {},
        patternMatches: evidence.patternMatches || []
      }
    };

    this.storeEvidence(evidenceItem);
    
    if (this.enableDetailedLogging) {
      logger.debug('Added learning evidence', {
        itemId,
        signal: evidence.signal,
        weight: evidence.weight
      }, 'evidence-tracker');
    }

    return evidenceItem.id;
  }

  /**
   * Add evidence for cache status
   */
  addCacheEvidence(itemId, evidence) {
    const evidenceItem = {
      id: this.generateEvidenceId(itemId, this.evidenceTypes.CACHE),
      type: this.evidenceTypes.CACHE,
      itemId,
      timestamp: Date.now(),
      sessionId: this.sessionId,
      data: {
        cacheHit: evidence.cacheHit || false,
        cacheKey: evidence.cacheKey || '',
        cacheAge: evidence.cacheAge || 0,
        ttl: evidence.ttl || 0,
        retrievalTime: evidence.retrievalTime || 0,
        cacheType: evidence.cacheType || 'memory', // memory, disk, redis
        evictionPolicy: evidence.evictionPolicy || 'lru',
        hitRate: evidence.hitRate || 0,
        missPenalty: evidence.missPenalty || 0,
        size: evidence.size || 0
      }
    };

    this.storeEvidence(evidenceItem);
    
    if (this.enableDetailedLogging) {
      logger.debug('Added cache evidence', {
        itemId,
        cacheHit: evidence.cacheHit,
        cacheType: evidence.cacheType
      }, 'evidence-tracker');
    }

    return evidenceItem.id;
  }

  /**
   * Add performance evidence
   */
  addPerformanceEvidence(itemId, evidence) {
    const evidenceItem = {
      id: this.generateEvidenceId(itemId, this.evidenceTypes.PERFORMANCE),
      type: this.evidenceTypes.PERFORMANCE,
      itemId,
      timestamp: Date.now(),
      sessionId: this.sessionId,
      data: {
        responseTime: evidence.responseTime || 0,
        processingTime: evidence.processingTime || 0,
        tokenCount: evidence.tokenCount || 0,
        memoryUsage: evidence.memoryUsage || 0,
        cpuTime: evidence.cpuTime || 0,
        networkLatency: evidence.networkLatency || 0,
        throughput: evidence.throughput || 0,
        errorRate: evidence.errorRate || 0,
        bottlenecks: evidence.bottlenecks || [],
        optimizationHints: evidence.optimizationHints || []
      }
    };

    this.storeEvidence(evidenceItem);
    
    if (this.enableDetailedLogging) {
      logger.debug('Added performance evidence', {
        itemId,
        responseTime: evidence.responseTime,
        tokenCount: evidence.tokenCount
      }, 'evidence-tracker');
    }

    return evidenceItem.id;
  }

  /**
   * Store evidence in memory store
   */
  storeEvidence(evidenceItem) {
    // Implement size limit
    if (this.evidenceStore.size >= this.maxEvidenceItems) {
      // Remove oldest evidence (simple FIFO)
      const firstKey = this.evidenceStore.keys().next().value;
      this.evidenceStore.delete(firstKey);
    }
    
    this.evidenceStore.set(evidenceItem.id, evidenceItem);
  }

  /**
   * Generate unique evidence ID
   */
  generateEvidenceId(itemId, type) {
    const hash = crypto.createHash('md5')
      .update(`${itemId}_${type}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`)
      .digest('hex')
      .substring(0, 8);
    return `evidence_${hash}`;
  }

  /**
   * Get all evidence for a specific item
   */
  getEvidenceForItem(itemId) {
    const evidence = [];
    for (const [id, evidenceItem] of this.evidenceStore) {
      if (evidenceItem.itemId === itemId) {
        evidence.push(evidenceItem);
      }
    }
    return evidence.sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Get evidence by type
   */
  getEvidenceByType(type) {
    const evidence = [];
    for (const [id, evidenceItem] of this.evidenceStore) {
      if (evidenceItem.type === type) {
        evidence.push(evidenceItem);
      }
    }
    return evidence.sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Get evidence for a session
   */
  getEvidenceForSession(sessionId = this.sessionId) {
    const evidence = [];
    for (const [id, evidenceItem] of this.evidenceStore) {
      if (evidenceItem.sessionId === sessionId) {
        evidence.push(evidenceItem);
      }
    }
    return evidence.sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Filter evidence based on criteria
   */
  filterEvidence(filters = {}) {
    let evidence = Array.from(this.evidenceStore.values());

    // Filter by item ID
    if (filters.itemId) {
      evidence = evidence.filter(item => item.itemId === filters.itemId);
    }

    // Filter by type
    if (filters.type) {
      evidence = evidence.filter(item => item.type === filters.type);
    }

    // Filter by session ID
    if (filters.sessionId) {
      evidence = evidence.filter(item => item.sessionId === filters.sessionId);
    }

    // Filter by time range
    if (filters.startTime) {
      evidence = evidence.filter(item => item.timestamp >= filters.startTime);
    }
    if (filters.endTime) {
      evidence = evidence.filter(item => item.timestamp <= filters.endTime);
    }

    // Filter by score threshold
    if (filters.minScore) {
      evidence = evidence.filter(item => {
        const score = item.data.score || item.data.confidence || 0;
        return score >= filters.minScore;
      });
    }

    // Filter by custom predicate
    if (filters.predicate && typeof filters.predicate === 'function') {
      evidence = evidence.filter(filters.predicate);
    }

    return evidence.sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Serialize evidence to structured format
   */
  serializeEvidence(evidence = null, format = 'json') {
    const evidenceToSerialize = evidence || Array.from(this.evidenceStore.values());

    switch (format.toLowerCase()) {
      case 'json':
        return JSON.stringify(evidenceToSerialize, null, 2);
      
      case 'compact':
        return JSON.stringify(evidenceToSerialize);
      
      case 'summary':
        return this.serializeSummary(evidenceToSerialize);
      
      case 'csv':
        return this.serializeToCSV(evidenceToSerialize);
      
      default:
        throw new Error(`Unsupported serialization format: ${format}`);
    }
  }

  /**
   * Serialize evidence to summary format
   */
  serializeSummary(evidence) {
    const summary = {
      totalEvidence: evidence.length,
      sessionCounts: {},
      typeCounts: {},
      itemCounts: {},
      timeRange: {
        earliest: null,
        latest: null
      },
      averageScores: {},
      cacheHitRate: 0,
      performanceMetrics: {
        avgResponseTime: 0,
        avgTokenCount: 0,
        totalProcessingTime: 0
      }
    };

    let totalResponseTime = 0;
    let totalTokenCount = 0;
    let cacheHits = 0;
    let cacheTotal = 0;
    const scoresByType = {};

    evidence.forEach(item => {
      // Session counts
      summary.sessionCounts[item.sessionId] = (summary.sessionCounts[item.sessionId] || 0) + 1;
      
      // Type counts
      summary.typeCounts[item.type] = (summary.typeCounts[item.type] || 0) + 1;
      
      // Item counts
      summary.itemCounts[item.itemId] = (summary.itemCounts[item.itemId] || 0) + 1;
      
      // Time range
      if (!summary.timeRange.earliest || item.timestamp < summary.timeRange.earliest) {
        summary.timeRange.earliest = item.timestamp;
      }
      if (!summary.timeRange.latest || item.timestamp > summary.timeRange.latest) {
        summary.timeRange.latest = item.timestamp;
      }
      
      // Scores by type
      const score = item.data.score || item.data.confidence || 0;
      if (!scoresByType[item.type]) {
        scoresByType[item.type] = { total: 0, count: 0 };
      }
      scoresByType[item.type].total += score;
      scoresByType[item.type].count += 1;
      
      // Cache statistics
      if (item.type === this.evidenceTypes.CACHE) {
        cacheTotal++;
        if (item.data.cacheHit) {
          cacheHits++;
        }
      }
      
      // Performance metrics
      if (item.type === this.evidenceTypes.PERFORMANCE) {
        totalResponseTime += item.data.responseTime || 0;
        totalTokenCount += item.data.tokenCount || 0;
        summary.performanceMetrics.totalProcessingTime += item.data.processingTime || 0;
      }
    });

    // Calculate average scores by type
    Object.keys(scoresByType).forEach(type => {
      summary.averageScores[type] = scoresByType[type].total / scoresByType[type].count;
    });

    // Calculate cache hit rate
    summary.cacheHitRate = cacheTotal > 0 ? cacheHits / cacheTotal : 0;

    // Calculate average performance metrics
    const performanceEvidence = evidence.filter(item => item.type === this.evidenceTypes.PERFORMANCE);
    if (performanceEvidence.length > 0) {
      summary.performanceMetrics.avgResponseTime = totalResponseTime / performanceEvidence.length;
      summary.performanceMetrics.avgTokenCount = totalTokenCount / performanceEvidence.length;
    }

    return JSON.stringify(summary, null, 2);
  }

  /**
   * Serialize evidence to CSV format
   */
  serializeToCSV(evidence) {
    if (evidence.length === 0) return '';

    const headers = ['id', 'type', 'itemId', 'timestamp', 'sessionId', 'data'];
    const rows = evidence.map(item => [
      item.id,
      item.type,
      item.itemId,
      item.timestamp,
      item.sessionId,
      JSON.stringify(item.data)
    ]);

    return [headers, ...rows].map(row => row.join(',')).join('\n');
  }

  /**
   * Analyze evidence patterns
   */
  analyzeEvidence(itemId = null) {
    const targetEvidence = itemId ? 
      this.getEvidenceForItem(itemId) : 
      Array.from(this.evidenceStore.values());

    const analysis = {
      totalItems: targetEvidence.length,
      typeDistribution: {},
      scoreDistribution: {},
      temporalPatterns: {
        hourlyActivity: {},
        dailyActivity: {}
      },
      performanceInsights: {
        bottlenecks: [],
        optimizations: []
      },
      learningSignals: {
        positiveSignals: 0,
        negativeSignals: 0,
        neutralSignals: 0
      },
      cacheEfficiency: {
        hitRate: 0,
        avgRetrievalTime: 0
      }
    };

    let totalCacheHits = 0;
    let totalCacheRequests = 0;
    let totalRetrievalTime = 0;

    targetEvidence.forEach(item => {
      // Type distribution
      analysis.typeDistribution[item.type] = (analysis.typeDistribution[item.type] || 0) + 1;

      // Score distribution
      const score = item.data.score || item.data.confidence || 0;
      const scoreRange = this.getScoreRange(score);
      analysis.scoreDistribution[scoreRange] = (analysis.scoreDistribution[scoreRange] || 0) + 1;

      // Temporal patterns
      const date = new Date(item.timestamp);
      const hour = date.getHours();
      const day = date.getDay();
      analysis.temporalPatterns.hourlyActivity[hour] = (analysis.temporalPatterns.hourlyActivity[hour] || 0) + 1;
      analysis.temporalPatterns.dailyActivity[day] = (analysis.temporalPatterns.dailyActivity[day] || 0) + 1;

      // Learning signals
      if (item.type === this.evidenceTypes.LEARNING) {
        const signal = item.data.signal || 'neutral';
        if (signal === 'positive' || item.data.userSatisfaction > 0.7) {
          analysis.learningSignals.positiveSignals++;
        } else if (signal === 'negative' || item.data.userSatisfaction < 0.3) {
          analysis.learningSignals.negativeSignals++;
        } else {
          analysis.learningSignals.neutralSignals++;
        }
      }

      // Cache efficiency
      if (item.type === this.evidenceTypes.CACHE) {
        totalCacheRequests++;
        if (item.data.cacheHit) {
          totalCacheHits++;
        }
        totalRetrievalTime += item.data.retrievalTime || 0;
      }

      // Performance bottlenecks
      if (item.type === this.evidenceTypes.PERFORMANCE) {
        if (item.data.responseTime > 1000) {
          analysis.performanceInsights.bottlenecks.push({
            itemId: item.itemId,
            type: 'high_response_time',
            value: item.data.responseTime
          });
        }
        if (item.data.tokenCount > 5000) {
          analysis.performanceInsights.bottlenecks.push({
            itemId: item.itemId,
            type: 'high_token_usage',
            value: item.data.tokenCount
          });
        }
      }
    });

    // Calculate cache efficiency
    analysis.cacheEfficiency.hitRate = totalCacheRequests > 0 ? totalCacheHits / totalCacheRequests : 0;
    analysis.cacheEfficiency.avgRetrievalTime = totalCacheRequests > 0 ? totalRetrievalTime / totalCacheRequests : 0;

    return analysis;
  }

  /**
   * Get score range for distribution analysis
   */
  getScoreRange(score) {
    if (score >= 0.9) return '0.9-1.0';
    if (score >= 0.8) return '0.8-0.9';
    if (score >= 0.7) return '0.7-0.8';
    if (score >= 0.6) return '0.6-0.7';
    if (score >= 0.5) return '0.5-0.6';
    if (score >= 0.4) return '0.4-0.5';
    if (score >= 0.3) return '0.3-0.4';
    if (score >= 0.2) return '0.2-0.3';
    if (score >= 0.1) return '0.1-0.2';
    return '0.0-0.1';
  }

  /**
   * Clear evidence for a specific item or all evidence
   */
  clearEvidence(itemId = null) {
    if (itemId) {
      // Remove evidence for specific item
      for (const [id, evidenceItem] of this.evidenceStore) {
        if (evidenceItem.itemId === itemId) {
          this.evidenceStore.delete(id);
        }
      }
    } else {
      // Clear all evidence
      this.evidenceStore.clear();
    }
  }

  /**
   * Get evidence statistics
   */
  getStatistics() {
    const evidence = Array.from(this.evidenceStore.values());
    const typeCounts = {};
    const sessionCounts = {};

    evidence.forEach(item => {
      typeCounts[item.type] = (typeCounts[item.type] || 0) + 1;
      sessionCounts[item.sessionId] = (sessionCounts[item.sessionId] || 0) + 1;
    });

    return {
      totalEvidence: evidence.length,
      evidenceByType: typeCounts,
      evidenceBySession: sessionCounts,
      currentSession: this.sessionId,
      memoryUsage: process.memoryUsage(),
      storeSize: this.evidenceStore.size,
      maxCapacity: this.maxEvidenceItems
    };
  }

  /**
   * Export evidence for external analysis
   */
  exportEvidence(format = 'json', filters = {}) {
    const filteredEvidence = this.filterEvidence(filters);
    return this.serializeEvidence(filteredEvidence, format);
  }

  /**
   * Import evidence from external source
   */
  importEvidence(evidenceData, format = 'json') {
    try {
      let evidence;
      
      switch (format.toLowerCase()) {
        case 'json':
          evidence = typeof evidenceData === 'string' ? 
            JSON.parse(evidenceData) : evidenceData;
          break;
        default:
          throw new Error(`Unsupported import format: ${format}`);
      }

      if (!Array.isArray(evidence)) {
        throw new Error('Evidence data must be an array');
      }

      evidence.forEach(item => {
        if (this.isValidEvidenceItem(item)) {
          this.storeEvidence(item);
        }
      });

      logger.info('Imported evidence', {
        count: evidence.length,
        sessionId: this.sessionId
      }, 'evidence-tracker');

      return evidence.length;
    } catch (error) {
      logger.error('Failed to import evidence', {
        error: error.message,
        format
      }, 'evidence-tracker');
      throw error;
    }
  }

  /**
   * Validate evidence item structure
   */
  isValidEvidenceItem(item) {
    return !!(item && 
           typeof item === 'object' &&
           typeof item.id === 'string' &&
           typeof item.type === 'string' &&
           typeof item.itemId === 'string' &&
           typeof item.timestamp === 'number' &&
           typeof item.data === 'object');
  }
}

/**
 * Create evidence tracker with default configuration
 */
export function createEvidenceTracker(options = {}) {
  return new EvidenceTracker(options);
}

/**
 * Evidence tracker factory for different use cases
 */
export const EvidenceTrackerFactory = {
  /**
   * Create tracker for development/debugging
   */
  createDevelopmentTracker() {
    return new EvidenceTracker({
      maxEvidenceItems: 500,
      enableDetailedLogging: true
    });
  },

  /**
   * Create tracker for production
   */
  createProductionTracker() {
    return new EvidenceTracker({
      maxEvidenceItems: 2000,
      enableDetailedLogging: false
    });
  },

  /**
   * Create tracker for testing
   */
  createTestTracker() {
    return new EvidenceTracker({
      maxEvidenceItems: 100,
      enableDetailedLogging: false,
      sessionId: 'test_session'
    });
  }
};

export default EvidenceTracker;