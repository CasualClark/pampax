import { DatabaseManager } from './database-optimized.js';
import { logger } from '../config/logger.js';
import { getMetricsCollector } from '../metrics/metrics-collector.js';

export interface MaintenanceOptions {
  vacuum?: boolean;
  analyze?: boolean;
  rebuildIndexes?: boolean;
  checkIntegrity?: boolean;
  cleanupOldRecords?: {
    searchLogsOlderThan?: number; // ms
    rerankCacheOlderThan?: number; // ms
    jobRunsOlderThan?: number; // ms
  };
  optimize?: boolean;
}

export interface MaintenanceReport {
  startTime: Date;
  endTime: Date;
  duration: number;
  operations: {
    vacuum?: { success: boolean; duration: number; spaceReclaimed?: number };
    analyze?: { success: boolean; duration: number };
    rebuildIndexes?: { success: boolean; duration: number; indexesRebuilt: string[] };
    checkIntegrity?: { success: boolean; duration: number; result: string };
    cleanupOldRecords?: { 
      success: boolean; 
      duration: number; 
      deletedRecords: {
        searchLogs?: number;
        rerankCache?: number;
        jobRuns?: number;
      };
    };
    optimize?: { success: boolean; duration: number };
  };
  errors: string[];
  warnings: string[];
}

/**
 * Database maintenance utility for performance optimization
 */
export class DatabaseMaintenance {
  private db: DatabaseManager;
  private metrics = getMetricsCollector();

  constructor(database: DatabaseManager) {
    this.db = database;
  }

  /**
   * Perform comprehensive database maintenance
   */
  async performMaintenance(options: MaintenanceOptions = {}): Promise<MaintenanceReport> {
    const startTime = new Date();
    const report: MaintenanceReport = {
      startTime,
      endTime: new Date(),
      duration: 0,
      operations: {},
      errors: [],
      warnings: []
    };

    logger.info('Starting database maintenance', { options });

    try {
      // Check integrity first
      if (options.checkIntegrity !== false) {
        await this.checkIntegrity(report);
      }

      // Clean up old records
      if (options.cleanupOldRecords) {
        await this.cleanupOldRecords(options.cleanupOldRecords, report);
      }

      // Rebuild indexes if requested
      if (options.rebuildIndexes) {
        await this.rebuildIndexes(report);
      }

      // Analyze database for query planner
      if (options.analyze !== false) {
        await this.analyzeDatabase(report);
      }

      // Vacuum to reclaim space
      if (options.vacuum) {
        await this.vacuumDatabase(report);
      }

      // Final optimization
      if (options.optimize !== false) {
        await this.optimizeDatabase(report);
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      report.errors.push(errorMessage);
      logger.error('Database maintenance failed', { error: errorMessage });
    }

    report.endTime = new Date();
    report.duration = report.endTime.getTime() - report.startTime.getTime();

    // Log maintenance summary
    logger.info('Database maintenance completed', {
      duration: report.duration,
      operations: Object.keys(report.operations).length,
      errors: report.errors.length,
      warnings: report.warnings.length
    });

    // Emit maintenance metrics
    this.metrics.emitTiming('database_maintenance_duration_ms', report.duration, {
      success: report.errors.length === 0 ? 'true' : 'false',
      operations_count: Object.keys(report.operations).length
    });

    return report;
  }

  /**
   * Check database integrity
   */
  private async checkIntegrity(report: MaintenanceReport): Promise<void> {
    const startTime = Date.now();
    
    try {
      logger.debug('Checking database integrity');
      
      const result = await this.db.executeQuery('PRAGMA integrity_check') as { integrity_check: string }[];
      
      const duration = Date.now() - startTime;
      const integrityResult = result[0]?.integrity_check || 'unknown';
      
      report.operations.checkIntegrity = {
        success: integrityResult === 'ok',
        duration,
        result: integrityResult
      };

      if (integrityResult !== 'ok') {
        report.errors.push(`Database integrity check failed: ${integrityResult}`);
      }

      logger.debug('Database integrity check completed', { 
        duration, 
        result: integrityResult 
      });

    } catch (error) {
      const duration = Date.now() - startTime;
      report.operations.checkIntegrity = {
        success: false,
        duration,
        result: error instanceof Error ? error.message : String(error)
      };
      throw error;
    }
  }

  /**
   * Clean up old records
   */
  private async cleanupOldRecords(options: NonNullable<MaintenanceOptions['cleanupOldRecords']>, report: MaintenanceReport): Promise<void> {
    const startTime = Date.now();
    
    try {
      logger.debug('Cleaning up old records');
      
      const deletedRecords: {
        searchLogs?: number;
        rerankCache?: number;
        jobRuns?: number;
      } = {};

      // Clean up old search logs
      if (options.searchLogsOlderThan) {
        const cutoffTime = Date.now() - options.searchLogsOlderThan;
        const result = await this.db.executeQuery(
          'DELETE FROM search_log WHERE ts < ?',
          [cutoffTime]
        ) as { changes: number };
        deletedRecords.searchLogs = result.changes;
      }

      // Clean up old rerank cache
      if (options.rerankCacheOlderThan) {
        const cutoffTime = Date.now() - options.rerankCacheOlderThan;
        const result = await this.db.executeQuery(
          'DELETE FROM rerank_cache WHERE created_at < ?',
          [cutoffTime]
        ) as { changes: number };
        deletedRecords.rerankCache = result.changes;
      }

      // Clean up old job runs
      if (options.jobRunsOlderThan) {
        const cutoffTime = Date.now() - options.jobRunsOlderThan;
        const result = await this.db.executeQuery(
          'DELETE FROM job_run WHERE started_at < ?',
          [cutoffTime]
        ) as { changes: number };
        deletedRecords.jobRuns = result.changes;
      }

      const duration = Date.now() - startTime;
      report.operations.cleanupOldRecords = {
        success: true,
        duration,
        deletedRecords
      };

      logger.debug('Old records cleanup completed', { 
        duration, 
        deletedRecords 
      });

      // Emit cleanup metrics
      Object.entries(deletedRecords).forEach(([table, count]) => {
        if (count && count > 0) {
          this.metrics.emitCounter('database_records_deleted', count, {
            table,
            operation: 'maintenance'
          });
        }
      });

    } catch (error) {
      const duration = Date.now() - startTime;
      report.operations.cleanupOldRecords = {
        success: false,
        duration,
        deletedRecords: {}
      };
      throw error;
    }
  }

  /**
   * Rebuild database indexes
   */
  private async rebuildIndexes(report: MaintenanceReport): Promise<void> {
    const startTime = Date.now();
    
    try {
      logger.debug('Rebuilding database indexes');
      
      // Get list of all indexes
      const indexes = await this.db.executeQuery(`
        SELECT name, tbl_name FROM sqlite_master 
        WHERE type = 'index' AND name NOT LIKE 'sqlite_%'
      `) as Array<{ name: string; tbl_name: string }>;

      const indexesRebuilt: string[] = [];

      // Rebuild each index by dropping and recreating
      for (const index of indexes) {
        try {
          // Get index definition
          const indexInfo = await this.db.executeQuery(`
            SELECT sql FROM sqlite_master 
            WHERE name = ? AND type = 'index'
          `, [index.name]) as Array<{ sql: string }>;

          if (indexInfo[0]?.sql) {
            // Skip auto-generated indexes that can't be recreated
            if (!indexInfo[0].sql.startsWith('CREATE AUTOMATIC INDEX')) {
              await this.db.executeQuery(`DROP INDEX IF EXISTS ${index.name}`);
              await this.db.executeQuery(indexInfo[0].sql);
              indexesRebuilt.push(index.name);
            }
          }
        } catch (error) {
          report.warnings.push(`Failed to rebuild index ${index.name}: ${error}`);
        }
      }

      const duration = Date.now() - startTime;
      report.operations.rebuildIndexes = {
        success: true,
        duration,
        indexesRebuilt
      };

      logger.debug('Index rebuild completed', { 
        duration, 
        indexesRebuilt: indexesRebuilt.length 
      });

    } catch (error) {
      const duration = Date.now() - startTime;
      report.operations.rebuildIndexes = {
        success: false,
        duration,
        indexesRebuilt: []
      };
      throw error;
    }
  }

  /**
   * Analyze database for query planner optimization
   */
  private async analyzeDatabase(report: MaintenanceReport): Promise<void> {
    const startTime = Date.now();
    
    try {
      logger.debug('Analyzing database for query planner');
      
      await this.db.executeQuery('ANALYZE');
      
      const duration = Date.now() - startTime;
      report.operations.analyze = {
        success: true,
        duration
      };

      logger.debug('Database analysis completed', { duration });

    } catch (error) {
      const duration = Date.now() - startTime;
      report.operations.analyze = {
        success: false,
        duration
      };
      throw error;
    }
  }

  /**
   * Vacuum database to reclaim space
   */
  private async vacuumDatabase(report: MaintenanceReport): Promise<void> {
    const startTime = Date.now();
    
    try {
      logger.debug('Vacuuming database to reclaim space');
      
      // Get database size before vacuum
      const statsBefore = await this.db.getStats();
      
      await this.db.executeQuery('VACUUM');
      
      // Get database size after vacuum
      const statsAfter = await this.db.getStats();
      const spaceReclaimed = statsBefore.size - statsAfter.size;
      
      const duration = Date.now() - startTime;
      report.operations.vacuum = {
        success: true,
        duration,
        spaceReclaimed
      };

      logger.debug('Database vacuum completed', { 
        duration, 
        spaceReclaimed,
        sizeBefore: statsBefore.size,
        sizeAfter: statsAfter.size
      });

      // Emit vacuum metrics
      this.metrics.emitGauge('database_size_bytes', statsAfter.size);
      if (spaceReclaimed > 0) {
        this.metrics.emitCounter('database_space_reclaimed_bytes', spaceReclaimed);
      }

    } catch (error) {
      const duration = Date.now() - startTime;
      report.operations.vacuum = {
        success: false,
        duration
      };
      throw error;
    }
  }

  /**
   * Final database optimization
   */
  private async optimizeDatabase(report: MaintenanceReport): Promise<void> {
    const startTime = Date.now();
    
    try {
      logger.debug('Running final database optimization');
      
      await this.db.optimizeDatabase();
      
      const duration = Date.now() - startTime;
      report.operations.optimize = {
        success: true,
        duration
      };

      logger.debug('Database optimization completed', { duration });

    } catch (error) {
      const duration = Date.now() - startTime;
      report.operations.optimize = {
        success: false,
        duration
      };
      throw error;
    }
  }

  /**
   * Get maintenance schedule recommendations
   */
  async getMaintenanceRecommendations(): Promise<{
    needsVacuum: boolean;
    needsAnalyze: boolean;
    needsCleanup: boolean;
    fragmentationLevel: number;
    recommendations: string[];
  }> {
    const recommendations: string[] = [];
    
    try {
      const stats = await this.db.getStats();
      
      // Check fragmentation level
      const fragmentationLevel = stats.freePages / stats.pageCount;
      
      // Check if vacuum is needed (high fragmentation)
      const needsVacuum = fragmentationLevel > 0.1; // 10% fragmentation threshold
      if (needsVacuum) {
        recommendations.push(`Database is ${(fragmentationLevel * 100).toFixed(1)}% fragmented - consider VACUUM`);
      }

      // Check if analyze is needed (could check last analyze time)
      const needsAnalyze = true; // For now, always recommend periodic analysis
      if (needsAnalyze) {
        recommendations.push('Periodic ANALYZE recommended for query planner optimization');
      }

      // Check if cleanup is needed
      const oldSearchLogs = await this.db.executeQuery(
        'SELECT COUNT(*) as count FROM search_log WHERE ts < ?',
        [Date.now() - (7 * 24 * 60 * 60 * 1000)] // 7 days ago
      ) as Array<{ count: number }>;

      const oldRerankCache = await this.db.executeQuery(
        'SELECT COUNT(*) as count FROM rerank_cache WHERE created_at < ?',
        [Date.now() - (24 * 60 * 60 * 1000)] // 24 hours ago
      ) as Array<{ count: number }>;

      const needsCleanup = (oldSearchLogs[0]?.count || 0) > 1000 || (oldRerankCache[0]?.count || 0) > 500;
      if (needsCleanup) {
        recommendations.push(`Old records cleanup recommended: ${oldSearchLogs[0]?.count || 0} old search logs, ${oldRerankCache[0]?.count || 0} old cache entries`);
      }

      return {
        needsVacuum,
        needsAnalyze,
        needsCleanup,
        fragmentationLevel,
        recommendations
      };

    } catch (error) {
      logger.error('Failed to get maintenance recommendations', { error });
      return {
        needsVacuum: true,
        needsAnalyze: true,
        needsCleanup: true,
        fragmentationLevel: 1.0,
        recommendations: ['Unable to assess database state - recommend full maintenance']
      };
    }
  }

  /**
   * Schedule periodic maintenance
   */
  schedulePeriodicMaintenance(options: MaintenanceOptions & { intervalMs: number }): NodeJS.Timeout {
    logger.info('Scheduling periodic database maintenance', { 
      intervalMs: options.intervalMs 
    });

    return setInterval(async () => {
      try {
        const recommendations = await this.getMaintenanceRecommendations();
        
        // Only run maintenance if needed
        if (recommendations.needsVacuum || recommendations.needsAnalyze || recommendations.needsCleanup) {
          logger.info('Running scheduled maintenance', { recommendations });
          
          const report = await this.performMaintenance({
            vacuum: recommendations.needsVacuum,
            analyze: recommendations.needsAnalyze,
            cleanupOldRecords: recommendations.needsCleanup ? {
              searchLogsOlderThan: 7 * 24 * 60 * 60 * 1000, // 7 days
              rerankCacheOlderThan: 24 * 60 * 60 * 1000, // 24 hours
              jobRunsOlderThan: 30 * 24 * 60 * 60 * 1000 // 30 days
            } : undefined,
            ...options
          });

          if (report.errors.length > 0) {
            logger.error('Scheduled maintenance completed with errors', { 
              errors: report.errors 
            });
          }
        } else {
          logger.debug('Skipping scheduled maintenance - no maintenance needed');
        }
      } catch (error) {
        logger.error('Scheduled maintenance failed', { error });
      }
    }, options.intervalMs);
  }
}

/**
 * Create maintenance instance for a database
 */
export function createDatabaseMaintenance(database: DatabaseManager): DatabaseMaintenance {
  return new DatabaseMaintenance(database);
}