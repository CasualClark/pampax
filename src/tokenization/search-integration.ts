/**
 * Integration with Search Pipeline
 * 
 * This module provides:
 * - Integration with intent-aware search results
 * - Dynamic profile selection based on query intent
 * - Real-time profile updates and learning
 * - Performance monitoring and optimization
 */

import { logger } from '../config/logger.js';
import { PackingProfileManager, PackingProfile } from './packing-profiles.js';
import { ContextOptimizer, ContentItem } from './context-optimizer.js';
import { IntentResult, IntentType } from '../intent/index.js';
import { StorageOperations } from '../storage/crud.js';

// ============================================================================
// Search Integration Interfaces
// ============================================================================

export interface SearchContext {
  query: string;
  repository: string;
  model: string;
  intent?: IntentResult;
  options?: {
    customBudget?: number;
    forceProfileRefresh?: boolean;
    enableLearning?: boolean;
    trackPerformance?: boolean;
  };
}

export interface SearchResult {
  id: string;
  content: string;
  path: string;
  spanKind?: string;
  spanName?: string;
  language?: string;
  score?: number;
  metadata?: Record<string, any>;
}

export interface OptimizedSearchResult {
  query: string;
  results: SearchResult[];
  optimized: {
    packed: any[];
    totalTokens: number;
    budgetUsed: number;
    strategy: string;
    truncated: boolean;
  };
  profile: PackingProfile;
  performance: {
    classificationTime: number;
    optimizationTime: number;
    totalTime: number;
  };
  intent?: IntentResult;
}

export interface PerformanceMetrics {
  query: string;
  repository: string;
  model: string;
  intent: IntentType;
  originalResultCount: number;
  optimizedResultCount: number;
  originalTokens: number;
  optimizedTokens: number;
  budgetUsed: number;
  truncated: boolean;
  strategy: string;
  classificationTime: number;
  optimizationTime: number;
  totalTime: number;
  timestamp: Date;
}

// ============================================================================
// Performance Monitor
// ============================================================================

export class PerformanceMonitor {
  private metrics: PerformanceMetrics[] = [];
  private maxMetrics = 1000;

  /**
   * Record performance metrics
   */
  record(metrics: PerformanceMetrics): void {
    this.metrics.push(metrics);
    
    // Keep only recent metrics
    if (this.metrics.length > this.maxMetrics) {
      this.metrics = this.metrics.slice(-this.maxMetrics);
    }

    logger.debug('Performance metrics recorded', {
      query: metrics.query,
      tokens: `${metrics.optimizedTokens}/${metrics.originalTokens}`,
      time: `${metrics.totalTime}ms`,
      truncated: metrics.truncated
    });
  }

  /**
   * Get performance statistics
   */
  getStats(repository?: string, model?: string, intent?: IntentType): {
    totalQueries: number;
    avgTokensReduced: number;
    avgBudgetUsed: number;
    truncationRate: number;
    avgTime: number;
    strategyDistribution: Record<string, number>;
  } {
    let filtered = this.metrics;

    if (repository) {
      filtered = filtered.filter(m => m.repository === repository);
    }
    if (model) {
      filtered = filtered.filter(m => m.model === model);
    }
    if (intent) {
      filtered = filtered.filter(m => m.intent === intent);
    }

    if (filtered.length === 0) {
      return {
        totalQueries: 0,
        avgTokensReduced: 0,
        avgBudgetUsed: 0,
        truncationRate: 0,
        avgTime: 0,
        strategyDistribution: {}
      };
    }

    const totalQueries = filtered.length;
    const tokensReduced = filtered.reduce((sum, m) => 
      sum + ((m.originalTokens - m.optimizedTokens) / m.originalTokens), 0);
    const budgetUsed = filtered.reduce((sum, m) => sum + m.budgetUsed, 0);
    const truncated = filtered.filter(m => m.truncated).length;
    const totalTime = filtered.reduce((sum, m) => sum + m.totalTime, 0);

    const strategyDistribution: Record<string, number> = {};
    for (const m of filtered) {
      strategyDistribution[m.strategy] = (strategyDistribution[m.strategy] || 0) + 1;
    }

    return {
      totalQueries,
      avgTokensReduced: (tokensReduced / totalQueries) * 100,
      avgBudgetUsed: budgetUsed / totalQueries,
      truncationRate: (truncated / totalQueries) * 100,
      avgTime: totalTime / totalQueries,
      strategyDistribution
    };
  }

  /**
   * Get recent metrics
   */
  getRecent(limit: number = 50): PerformanceMetrics[] {
    return this.metrics.slice(-limit);
  }

  /**
   * Clear metrics
   */
  clear(): void {
    this.metrics = [];
    logger.debug('Performance metrics cleared');
  }
}

// ============================================================================
// Profile Learning System
// ============================================================================

export class ProfileLearningSystem {
  private learningData = new Map<string, PerformanceMetrics[]>();
  private learningThreshold = 10; // Minimum samples before learning

  constructor(private profileManager: PackingProfileManager) {}

  /**
   * Record a performance event for learning
   */
  recordEvent(profileKey: string, metrics: PerformanceMetrics): void {
    if (!this.learningData.has(profileKey)) {
      this.learningData.set(profileKey, []);
    }

    const events = this.learningData.get(profileKey)!;
    events.push(metrics);

    // Keep only recent events
    if (events.length > 100) {
      events.splice(0, events.length - 100);
    }

    // Trigger learning if we have enough data
    if (events.length >= this.learningThreshold && events.length % this.learningThreshold === 0) {
      this.triggerLearning(profileKey, events);
    }
  }

  /**
   * Trigger profile learning based on performance data
   */
  private async triggerLearning(profileKey: string, events: PerformanceMetrics[]): Promise<void> {
    logger.info('Triggering profile learning', { profileKey, eventCount: events.length });

    try {
      const [repository, model] = profileKey.split(':');
      const profile = await this.profileManager.getProfile(repository, model);

      // Analyze performance patterns
      const insights = this.analyzePerformance(events);
      
      // Apply learning to profile
      const updates = this.generateProfileUpdates(profile, insights);
      
      if (Object.keys(updates).length > 0) {
        await this.profileManager.updateProfile(profile.id, updates);
        logger.info('Profile updated based on learning', { 
          profileKey, 
          updates: Object.keys(updates) 
        });
      }
    } catch (error) {
      logger.error('Failed to apply profile learning', { 
        error: error instanceof Error ? error.message : String(error),
        profileKey 
      });
    }
  }

  /**
   * Analyze performance patterns
   */
  private analyzePerformance(events: PerformanceMetrics[]): any {
    const insights = {
      truncationRate: 0,
      avgBudgetUsed: 0,
      underutilizedBudget: false,
      overTruncated: false,
      strategyEffectiveness: {} as Record<string, number>
    };

    const truncated = events.filter(e => e.truncated).length;
    insights.truncationRate = (truncated / events.length) * 100;
    insights.avgBudgetUsed = events.reduce((sum, e) => sum + e.budgetUsed, 0) / events.length;

    insights.underutilizedBudget = insights.avgBudgetUsed < 0.7;
    insights.overTruncated = insights.truncationRate > 30;

    // Analyze strategy effectiveness
    const strategyGroups = new Map<string, PerformanceMetrics[]>();
    for (const event of events) {
      if (!strategyGroups.has(event.strategy)) {
        strategyGroups.set(event.strategy, []);
      }
      strategyGroups.get(event.strategy)!.push(event);
    }

    for (const [strategy, strategyEvents] of strategyGroups) {
      const avgTokensReduced = strategyEvents.reduce((sum, e) => 
        sum + ((e.originalTokens - e.optimizedTokens) / e.originalTokens), 0) / strategyEvents.length;
      insights.strategyEffectiveness[strategy] = avgTokensReduced * 100;
    }

    return insights;
  }

  /**
   * Generate profile updates based on insights
   */
  private generateProfileUpdates(profile: PackingProfile, insights: any): Partial<PackingProfile> {
    const updates: Partial<PackingProfile> = {};

    // Adjust budget allocation if underutilized or over-truncated
    if (insights.underutilizedBudget) {
      updates.budgetAllocation = {
        ...profile.budgetAllocation,
        mustHave: Math.floor(profile.budgetAllocation.mustHave * 1.1),
        important: Math.floor(profile.budgetAllocation.important * 1.1)
      };
    }

    if (insights.overTruncated) {
      updates.budgetAllocation = {
        ...profile.budgetAllocation,
        total: Math.floor(profile.budgetAllocation.total * 1.2)
      };
    }

    // Adjust strategy based on effectiveness
    const bestStrategy = Object.entries(insights.strategyEffectiveness)
      .sort(([,a], [,b]) => (b as number) - (a as number))[0]?.[0];
    
    if (bestStrategy && bestStrategy !== profile.truncationStrategies.strategy) {
      updates.truncationStrategies = {
        ...profile.truncationStrategies,
        strategy: bestStrategy as any
      };
    }

    return updates;
  }

  /**
   * Get learning statistics
   */
  getStats(): { profileCount: number; totalEvents: number; learningProfiles: string[] } {
    const learningProfiles = Array.from(this.learningData.entries())
      .filter(([, events]) => events.length >= this.learningThreshold)
      .map(([profileKey]) => profileKey);

    return {
      profileCount: this.learningData.size,
      totalEvents: Array.from(this.learningData.values()).reduce((sum, events) => sum + events.length, 0),
      learningProfiles
    };
  }
}

// ============================================================================
// Search Integration Manager
// ============================================================================

export class SearchIntegrationManager {
  private performanceMonitor: PerformanceMonitor;
  private learningSystem: ProfileLearningSystem;

  constructor(
    private profileManager: PackingProfileManager,
    private storage: StorageOperations
  ) {
    this.performanceMonitor = new PerformanceMonitor();
    this.learningSystem = new ProfileLearningSystem(profileManager);
  }

  /**
   * Optimize search results using packing profiles
   */
  async optimizeSearchResults(
    query: string,
    results: SearchResult[],
    context: Partial<SearchContext>
  ): Promise<OptimizedSearchResult> {
    const startTime = Date.now();
    
    // Build full context
    const fullContext: SearchContext = {
      query,
      repository: context.repository || '',
      model: context.model || 'default',
      intent: context.intent,
      options: {
        customBudget: context.options?.customBudget,
        forceProfileRefresh: context.options?.forceProfileRefresh,
        enableLearning: context.options?.enableLearning ?? true,
        trackPerformance: context.options?.trackPerformance ?? true
      }
    };

    logger.debug('Optimizing search results', {
      query,
      resultCount: results.length,
      repository: fullContext.repository,
      model: fullContext.model
    });

    try {
      // Step 1: Get or create packing profile
      const profileStartTime = Date.now();
      const profile = await this.getProfile(fullContext);
      const profileTime = Date.now() - profileStartTime;

      // Step 2: Convert search results to content items
      const contentItems: ContentItem[] = results.map(result => ({
        id: result.id,
        content: result.content,
        path: result.path,
        spanKind: result.spanKind,
        spanName: result.spanName,
        language: result.language,
        score: result.score,
        relevance: this.calculateRelevance(result, query, fullContext.intent)
      }));

      // Step 3: Optimize content
      const optimizationStartTime = Date.now();
      const optimizer = new ContextOptimizer(profile);
      const optimized = await optimizer.optimize(
        contentItems,
        fullContext.intent,
        fullContext.options?.customBudget
      );
      const optimizationTime = Date.now() - optimizationStartTime;

      // Step 4: Build result
      const totalTime = Date.now() - startTime;
      const optimizedResult: OptimizedSearchResult = {
        query,
        results,
        optimized: {
          packed: optimized.packed,
          totalTokens: optimized.totalTokens,
          budgetUsed: optimized.budgetUsed,
          strategy: optimized.strategy,
          truncated: optimized.truncated
        },
        profile,
        performance: {
          classificationTime: profileTime,
          optimizationTime,
          totalTime
        },
        intent: fullContext.intent
      };

      // Step 5: Record performance if enabled
      if (fullContext.options?.trackPerformance) {
        const originalTokens = contentItems.reduce((sum, item) => 
          sum + this.estimateTokens(item.content), 0);

        const metrics: PerformanceMetrics = {
          query,
          repository: fullContext.repository,
          model: fullContext.model,
          intent: fullContext.intent?.intent || 'search',
          originalResultCount: results.length,
          optimizedResultCount: optimized.packed.length,
          originalTokens,
          optimizedTokens: optimized.totalTokens,
          budgetUsed: optimized.budgetUsed,
          truncated: optimized.truncated,
          strategy: optimized.strategy,
          classificationTime: profileTime,
          optimizationTime,
          totalTime,
          timestamp: new Date()
        };

        this.performanceMonitor.record(metrics);

        // Trigger learning if enabled
        if (fullContext.options?.enableLearning) {
          const profileKey = `${fullContext.repository}:${fullContext.model}`;
          this.learningSystem.recordEvent(profileKey, metrics);
        }
      }

      logger.debug('Search optimization completed', {
        originalResults: results.length,
        optimizedResults: optimized.packed.length,
        tokens: `${optimized.totalTokens}/${fullContext.options?.customBudget || profile.budgetAllocation.total}`,
        time: `${totalTime}ms`,
        truncated: optimized.truncated
      });

      return optimizedResult;

    } catch (error) {
      logger.error('Failed to optimize search results', {
        error: error instanceof Error ? error.message : String(error),
        query,
        repository: fullContext.repository
      });

      // Return unoptimized results on error
      return {
        query,
        results,
        optimized: {
          packed: results.map(r => ({
            id: r.id,
            content: r.content,
            tokens: this.estimateTokens(r.content),
            priority: 0.5,
            type: 'optional' as const,
            metadata: {
              path: r.path,
              spanKind: r.spanKind,
              spanName: r.spanName,
              language: r.language,
              score: r.score
            }
          })),
          totalTokens: results.reduce((sum, r) => sum + this.estimateTokens(r.content), 0),
          budgetUsed: 1.0,
          strategy: 'none',
          truncated: false
        },
        profile: await this.getDefaultProfile(),
        performance: {
          classificationTime: 0,
          optimizationTime: 0,
          totalTime: Date.now() - startTime
        }
      };
    }
  }

  /**
   * Get packing profile for context
   */
  private async getProfile(context: SearchContext): Promise<PackingProfile> {
    if (context.options?.forceProfileRefresh) {
      return await this.profileManager.optimizeProfile(context.repository, context.model);
    }

    return await this.profileManager.getProfile(context.repository, context.model);
  }

  /**
   * Get default profile
   */
  private async getDefaultProfile(): Promise<PackingProfile> {
    return await this.profileManager.getProfile('default', 'default');
  }

  /**
   * Calculate relevance score for a result
   */
  private calculateRelevance(result: SearchResult, query: string, intent?: IntentResult): number {
    let relevance = result.score || 0.5;

    // Boost based on intent entities
    if (intent) {
      for (const entity of intent.entities) {
        if (entity.type === 'function' && result.spanName) {
          if (result.spanName.toLowerCase().includes(entity.value.toLowerCase())) {
            relevance += 0.2;
          }
        }
        
        if (entity.type === 'file' && result.path) {
          if (result.path.toLowerCase().includes(entity.value.toLowerCase())) {
            relevance += 0.15;
          }
        }
      }
    }

    // Boost based on query term matches in content
    const queryTerms = query.toLowerCase().split(/\s+/);
    const content = result.content.toLowerCase();
    
    for (const term of queryTerms) {
      if (term.length > 2 && content.includes(term)) {
        relevance += 0.05;
      }
    }

    return Math.min(1.0, relevance);
  }

  /**
   * Simple token estimation
   */
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  /**
   * Get performance statistics
   */
  getPerformanceStats(repository?: string, model?: string, intent?: IntentType) {
    return this.performanceMonitor.getStats(repository, model, intent);
  }

  /**
   * Get learning statistics
   */
  getLearningStats() {
    return this.learningSystem.getStats();
  }

  /**
   * Clear performance data
   */
  clearPerformanceData(): void {
    this.performanceMonitor.clear();
  }

  /**
   * Cleanup expired profiles
   */
  async cleanupExpiredProfiles(): Promise<number> {
    return await this.profileManager.cleanupExpired();
  }

  /**
   * Get profile manager for direct access
   */
  getProfileManager(): PackingProfileManager {
    return this.profileManager;
  }
}

export default SearchIntegrationManager;