import { DatabaseManager } from './database-optimized.js';
import { logger } from '../config/logger.js';
import { getMetricsCollector } from '../metrics/metrics-collector.js';

export interface QueryPlan {
  query: string;
  plan: any[];
  estimatedCost: number;
  usesIndex: boolean;
  indexName?: string;
}

export interface IndexRecommendation {
  table: string;
  columns: string[];
  type: 'single' | 'composite' | 'partial';
  reason: string;
  estimatedBenefit: number;
}

export interface SlowQuery {
  query: string;
  duration: number;
  timestamp: number;
  frequency: number;
  suggestedOptimization?: string;
}

/**
 * Database Performance Optimizer
 * 
 * Provides tools for analyzing and optimizing SQLite query performance
 */
export class DatabasePerformanceOptimizer {
  private db: DatabaseManager;
  private metrics = getMetricsCollector();

  constructor(database: DatabaseManager) {
    this.db = database;
  }

  /**
   * Analyze query execution plan
   */
  async analyzeQueryPlan(query: string, params: any[] = []): Promise<QueryPlan> {
    try {
      const planResult = await this.db.executeQuery('EXPLAIN QUERY PLAN ' + query, params);
      
      const usesIndex = planResult.some((row: any) => row.detail && row.detail.includes('USING INDEX'));
      const indexMatch = planResult.find((row: any) => row.detail && row.detail.match(/USING INDEX (\w+)/));
      const indexName = indexMatch ? indexMatch.detail.match(/USING INDEX (\w+)/)?.[1] : undefined;
      
      // Estimate cost (simplified)
      const estimatedCost = planResult.reduce((sum: number, row: any) => sum + (row?.cost || 0), 0);

      return {
        query,
        plan: planResult,
        estimatedCost,
        usesIndex,
        indexName
      };
    } catch (error) {
      logger.error('Failed to analyze query plan', { 
        query: query.substring(0, 100), 
        error: error instanceof Error ? error.message : String(error) 
      });
      throw error;
    }
  }

  /**
   * Identify missing indexes based on query patterns
   */
  async identifyMissingIndexes(queries: string[]): Promise<IndexRecommendation[]> {
    const recommendations: IndexRecommendation[] = [];
    
    // Common patterns that benefit from indexing
    const patterns = [
      { pattern: /WHERE\s+(\w+)\s*=\s*\?/g, type: 'single' as const },
      { pattern: /WHERE\s+(\w+)\s*=\s*\?.*AND\s+(\w+)\s*=\s*\?/g, type: 'composite' as const },
      { pattern: /ORDER\s+BY\s+(\w+)/g, type: 'single' as const },
      { pattern: /ORDER\s+BY\s+(\w+),\s*(\w+)/g, type: 'composite' as const }
    ];

    for (const query of queries) {
      for (const { pattern, type } of patterns) {
        const matches = Array.from(query.matchAll(pattern));
        
        if (matches.length > 0) {
            const columns = matches.map(match => match[1]).filter(Boolean);
            
            if (columns.length > 0) {
              const table = this.extractTableFromQuery(query);
              if (table) {
                recommendations.push({
                  table,
                  columns: Array.from(new Set(columns)), // Remove duplicates
                  type,
                  reason: `Query pattern matches ${type} index opportunity`,
                  estimatedBenefit: this.estimateIndexBenefit(query, columns.length)
                });
              }
            }
        }
      }
    }

    // Remove duplicates and sort by benefit
    const uniqueRecommendations = recommendations.filter((rec, index, self) =>
      index === self.findIndex(r => 
        r.table === rec.table && 
        JSON.stringify(r.columns.sort()) === JSON.stringify(rec.columns.sort())
      )
    );

    return uniqueRecommendations.sort((a, b) => b.estimatedBenefit - a.estimatedBenefit);
  }

  /**
   * Extract table name from SQL query
   */
  private extractTableFromQuery(query: string): string | null {
    const match = query.match(/FROM\s+(\w+)/i);
    return match ? match[1] : null;
  }

  /**
   * Estimate benefit of creating an index
   */
  private estimateIndexBenefit(query: string, columnCount: number): number {
    // Simple heuristic: more WHERE clauses = higher benefit
    const whereCount = (query.match(/WHERE/gi) || []).length;
    const joinCount = (query.match(/JOIN/gi) || []).length;
    
    return whereCount * 10 + columnCount * 5 + joinCount * 15;
  }

  /**
   * Analyze slow queries from performance logs
   */
  async analyzeSlowQueries(): Promise<{
    slowQueries: SlowQuery[];
    patterns: Array<{ pattern: string; count: number; avgDuration: number }>;
    recommendations: string[];
  }> {
    const stats = this.db.getQueryPerformanceStats();
    const slowQueries = stats.slowQueries;
    
    // Identify common patterns in slow queries
    const patterns = this.identifyQueryPatterns(slowQueries.map(q => q.query));
    
    // Generate recommendations
    const recommendations = await this.generateOptimizationRecommendations(slowQueries, patterns);

    return {
      slowQueries: slowQueries.map(q => ({
        query: q.query,
        duration: q.duration,
        timestamp: q.timestamp,
        frequency: 1, // Would need aggregation over time
        suggestedOptimization: this.suggestQueryOptimization(q.query)
      })),
      patterns,
      recommendations
    };
  }

  /**
   * Identify common query patterns
   */
  private identifyQueryPatterns(queries: string[]): Array<{ pattern: string; count: number; avgDuration: number }> {
    const patterns: Map<string, { count: number; totalDuration: number }> = new Map();
    
    for (const query of queries) {
      // Normalize query for pattern matching
      const normalized = query
        .replace(/\d+/g, '?') // Replace numbers with placeholders
        .replace(/'[^']*'/g, '?') // Replace strings with placeholders
        .replace(/\s+/g, ' ') // Normalize whitespace
        .trim();
      
      const existing = patterns.get(normalized) || { count: 0, totalDuration: 0 };
      patterns.set(normalized, {
        count: existing.count + 1,
        totalDuration: existing.totalDuration + 0 // Would need actual duration
      });
    }

    return Array.from(patterns.entries())
      .map(([pattern, data]) => ({
        pattern,
        count: data.count,
        avgDuration: data.totalDuration / data.count
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10); // Top 10 patterns
  }

  /**
   * Generate optimization recommendations
   */
  private async generateOptimizationRecommendations(
    slowQueries: any[], 
    patterns: Array<{ pattern: string; count: number; avgDuration: number }>
  ): Promise<string[]> {
    const recommendations: string[] = [];

    // Analyze patterns
    const highFrequencyPatterns = patterns.filter(p => p.count > 5);
    if (highFrequencyPatterns.length > 0) {
      recommendations.push(
        `Found ${highFrequencyPatterns.length} high-frequency query patterns that could benefit from optimization`
      );
    }

    // Check for missing indexes
    const missingIndexes = await this.identifyMissingIndexes(slowQueries.map(q => q.query));
    if (missingIndexes.length > 0) {
      recommendations.push(
        `Consider creating ${missingIndexes.length} new indexes for frequently queried columns`
      );
    }

    // Check for full table scans
    const fullTableScans = slowQueries.filter(q => 
      q.query.includes('SCAN') || q.duration > 100
    );
    if (fullTableScans.length > 0) {
      recommendations.push(
        `Detected ${fullTableScans.length} queries performing full table scans`
      );
    }

    // Check for complex joins
    const complexJoins = slowQueries.filter(q => 
      (q.query.match(/JOIN/gi) || []).length > 2
    );
    if (complexJoins.length > 0) {
      recommendations.push(
        `Found ${complexJoins.length} queries with complex joins that may need optimization`
      );
    }

    return recommendations;
  }

  /**
   * Suggest optimization for a specific query
   */
  private suggestQueryOptimization(query: string): string {
    const suggestions: string[] = [];

    // Check for missing WHERE clauses
    if (!query.includes('WHERE') && query.includes('SELECT')) {
      suggestions.push('Consider adding WHERE clause to limit results');
    }

    // Check for missing LIMIT
    if (!query.includes('LIMIT') && query.includes('SELECT')) {
      suggestions.push('Consider adding LIMIT clause to prevent large result sets');
    }

    // Check for SELECT *
    if (query.includes('SELECT *')) {
      suggestions.push('Consider selecting only specific columns instead of *');
    }

    // Check for missing indexes
    const whereMatches = query.match(/WHERE\s+(\w+)\s*=/gi);
    if (whereMatches && whereMatches.length > 1) {
      suggestions.push('Consider composite index for multiple WHERE conditions');
    }

    return suggestions.join('; ') || 'Query appears optimized';
  }

  /**
   * Create recommended indexes
   */
  async createRecommendedIndexes(recommendations: IndexRecommendation[]): Promise<void> {
    const startTime = Date.now();
    
    try {
      logger.info(`Creating ${recommendations.length} recommended indexes`);
      
      for (const rec of recommendations) {
        const indexName = `idx_${rec.table}_${rec.columns.join('_')}`;
        const columnsStr = rec.columns.join(', ');
        
        await this.db.executeQuery(
          `CREATE INDEX IF NOT EXISTS ${indexName} ON ${rec.table}(${columnsStr})`
        );
        
        logger.debug(`Created index ${indexName}`, {
          table: rec.table,
          columns: rec.columns,
          benefit: rec.estimatedBenefit
        });
      }

      const duration = Date.now() - startTime;
      this.metrics.emitTiming('index_creation_duration_ms', duration, {
        index_count: recommendations.length
      });

      // Analyze database after creating indexes
      await this.db.executeQuery('ANALYZE');
      
      logger.info('Index creation completed', { 
        duration, 
        indexCount: recommendations.length 
      });

    } catch (error) {
      logger.error('Failed to create recommended indexes', { 
        error: error instanceof Error ? error.message : String(error) 
      });
      throw error;
    }
  }

  /**
   * Get comprehensive performance report
   */
  async getPerformanceReport(): Promise<{
    queryStats: any;
    slowQueries: SlowQuery[];
    indexRecommendations: IndexRecommendation[];
    databaseStats: any;
    recommendations: string[];
  }> {
    const [queryStats, slowQueriesAnalysis, databaseStats] = await Promise.all([
      Promise.resolve(this.db.getQueryPerformanceStats()),
      this.analyzeSlowQueries(),
      this.db.getStats()
    ]);

    // Get index recommendations from recent queries
    const recentQueries = queryStats.recentQueries.map(q => q.query);
    const indexRecommendations = await this.identifyMissingIndexes(recentQueries);

    return {
      queryStats,
      slowQueries: slowQueriesAnalysis.slowQueries,
      indexRecommendations,
      databaseStats,
      recommendations: slowQueriesAnalysis.recommendations
    };
  }

  /**
   * Monitor query performance in real-time
   */
  startPerformanceMonitoring(intervalMs: number = 60000): NodeJS.Timeout {
    logger.info('Starting performance monitoring', { intervalMs });
    
    return setInterval(async () => {
      try {
        const stats = this.db.getQueryPerformanceStats();
        
        // Emit performance metrics
        this.metrics.emitGauge('sqlite_avg_query_duration_ms', stats.averageDuration);
        this.metrics.emitGauge('sqlite_p95_query_duration_ms', stats.p95Duration);
        this.metrics.emitGauge('sqlite_p99_query_duration_ms', stats.p99Duration);
        this.metrics.emitGauge('sqlite_slow_query_count', stats.slowQueries.length);
        this.metrics.emitGauge('sqlite_total_query_count', stats.totalQueries);

        // Alert on performance degradation
        if (stats.p95Duration > 100) {
          logger.warn('Query performance degradation detected', {
            p95Duration: stats.p95Duration,
            slowQueries: stats.slowQueries.length
          });
        }

        // Auto-optimize if needed
        if (stats.slowQueries.length > 10) {
          logger.info('High slow query count detected, triggering optimization');
          await this.autoOptimize();
        }

      } catch (error) {
        logger.error('Performance monitoring error', { 
          error: error instanceof Error ? error.message : String(error) 
        });
      }
    }, intervalMs);
  }

  /**
   * Automatic optimization based on performance metrics
   */
  private async autoOptimize(): Promise<void> {
    try {
      const report = await this.getPerformanceReport();
      
      // Create high-benefit indexes automatically
      const highBenefitIndexes = report.indexRecommendations
        .filter(rec => rec.estimatedBenefit > 50)
        .slice(0, 3); // Limit to top 3
      
      if (highBenefitIndexes.length > 0) {
        logger.info('Auto-creating high-benefit indexes', { 
          count: highBenefitIndexes.length 
        });
        await this.createRecommendedIndexes(highBenefitIndexes);
      }

      // Optimize database if fragmented
      if (report.databaseStats.freePages > report.databaseStats.pageCount * 0.1) {
        logger.info('Database fragmentation detected, triggering optimization');
        await this.db.optimizeDatabase();
      }

    } catch (error) {
      logger.error('Auto-optimization failed', { 
        error: error instanceof Error ? error.message : String(error) 
      });
    }
  }

  /**
   * Validate existing indexes
   */
  async validateIndexes(): Promise<{
    validIndexes: Array<{ name: string; table: string; columns: string[] }>;
    invalidIndexes: Array<{ name: string; error: string }>;
    unusedIndexes: Array<{ name: string; table: string }>;
  }> {
    const validIndexes: Array<{ name: string; table: string; columns: string[] }> = [];
    const invalidIndexes: Array<{ name: string; error: string }> = [];
    const unusedIndexes: Array<{ name: string; table: string }> = [];

    try {
      // Get all indexes
      const indexes = await this.db.executeQuery(`
        SELECT name, tbl_name, sql FROM sqlite_master 
        WHERE type = 'index' AND name NOT LIKE 'sqlite_%'
      `) as Array<{ name: string; tbl_name: string; sql: string }>;

      for (const index of indexes) {
        try {
          // Test index by running a query that should use it
          const testQuery = `EXPLAIN QUERY PLAN SELECT * FROM ${index.tbl_name} WHERE 1=0`;
          const plan = await this.db.executeQuery(testQuery);
          
          if (plan && plan.length > 0) {
            // Extract columns from index definition
            const columnMatch = index.sql.match(/\(([^)]+)\)/);
            const columns = columnMatch 
              ? columnMatch[1].split(',').map(col => col.trim().replace(/ASC|DESC/i, '').trim())
              : [];
            
            validIndexes.push({
              name: index.name,
              table: index.tbl_name,
              columns
            });
          }
        } catch (error) {
          invalidIndexes.push({
            name: index.name,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }

      // Check for unused indexes (simplified check)
      const indexUsage = await this.db.executeQuery(`
        SELECT name FROM sqlite_master 
        WHERE type = 'index' AND name NOT LIKE 'sqlite_%'
        AND sql NOT NULL
      `) as Array<{ name: string }>;

      // This is a simplified check - real usage tracking would be more complex
      for (const index of indexUsage) {
        // Mark as unused if it's not a primary index and not recently used
        if (!index.name.includes('autoindex') && !index.name.includes('primary')) {
          unusedIndexes.push({
            name: index.name,
            table: 'unknown' // Would need to parse from SQL
          });
        }
      }

    } catch (error) {
      logger.error('Index validation failed', { 
        error: error instanceof Error ? error.message : String(error) 
      });
    }

    return {
      validIndexes,
      invalidIndexes,
      unusedIndexes
    };
  }
}

/**
 * Create performance optimizer for a database
 */
export function createPerformanceOptimizer(database: DatabaseManager): DatabasePerformanceOptimizer {
  return new DatabasePerformanceOptimizer(database);
}