import { DatabaseManager } from './database-optimized.js';
import { createDatabaseMaintenance } from './database-maintenance.js';
import { createPerformanceOptimizer } from './performance-optimizer.js';
import { createOptimizedCrudOperations } from './crud-optimized.js';
import { registerPerformanceIndexesMigration } from './migrations/add-performance-indexes.js';
import { logger } from '../config/logger.js';

export interface OptimizedDatabaseConfig {
  path: string;
  enablePerformanceMonitoring?: boolean;
  enableAutoOptimization?: boolean;
  enableMaintenance?: boolean;
  maintenanceIntervalMs?: number;
  performanceMonitoringIntervalMs?: number;
}

export interface OptimizedDatabase {
  manager: DatabaseManager;
  crud: ReturnType<typeof createOptimizedCrudOperations>;
  maintenance: ReturnType<typeof createDatabaseMaintenance>;
  optimizer: ReturnType<typeof createPerformanceOptimizer>;
  startMonitoring: () => void;
  stopMonitoring: () => void;
}

/**
 * Create an optimized database instance with all performance enhancements
 */
export function createOptimizedDatabase(config: OptimizedDatabaseConfig): OptimizedDatabase {
  const {
    path,
    enablePerformanceMonitoring = true,
    enableAutoOptimization = true,
    enableMaintenance = true,
    maintenanceIntervalMs = 60 * 60 * 1000, // 1 hour
    performanceMonitoringIntervalMs = 60 * 1000 // 1 minute
  } = config;

  logger.info('Creating optimized database', { 
    path, 
    enablePerformanceMonitoring,
    enableAutoOptimization,
    enableMaintenance 
  });

  // Create database manager with enhanced configuration
  const manager = new DatabaseManager({
    path,
    enableWAL: true,
    enableForeignKeys: true,
    readOnly: false,
    connectionPool: {
      max: 10,
      min: 1,
      acquireTimeoutMillis: 30000,
      idleTimeoutMillis: 300000
    }
  });

  // Register performance indexes migration
  registerPerformanceIndexesMigration(manager);

  // Create optimized components
  const crud = createOptimizedCrudOperations(manager);
  const maintenance = createDatabaseMaintenance(manager);
  const optimizer = createPerformanceOptimizer(manager);

  let monitoringInterval: NodeJS.Timeout | null = null;
  let maintenanceInterval: NodeJS.Timeout | null = null;

  const startMonitoring = () => {
    if (enablePerformanceMonitoring && !monitoringInterval) {
      monitoringInterval = optimizer.startPerformanceMonitoring(performanceMonitoringIntervalMs);
      logger.info('Performance monitoring started');
    }

    if (enableMaintenance && !maintenanceInterval) {
      maintenanceInterval = maintenance.schedulePeriodicMaintenance({
        intervalMs: maintenanceIntervalMs,
        vacuum: false, // Don't auto-vacuum by default (can be expensive)
        analyze: true,
        cleanupOldRecords: {
          searchLogsOlderThan: 7 * 24 * 60 * 60 * 1000, // 7 days
          rerankCacheOlderThan: 24 * 60 * 60 * 1000, // 24 hours
          jobRunsOlderThan: 30 * 24 * 60 * 60 * 1000 // 30 days
        },
        optimize: true
      });
      logger.info('Periodic maintenance scheduled');
    }
  };

  const stopMonitoring = () => {
    if (monitoringInterval) {
      clearInterval(monitoringInterval);
      monitoringInterval = null;
      logger.info('Performance monitoring stopped');
    }

    if (maintenanceInterval) {
      clearInterval(maintenanceInterval);
      maintenanceInterval = null;
      logger.info('Periodic maintenance stopped');
    }
  };

  return {
    manager,
    crud,
    maintenance,
    optimizer,
    startMonitoring,
    stopMonitoring
  };
}

/**
 * Initialize optimized database with all components
 */
export async function initializeOptimizedDatabase(config: OptimizedDatabaseConfig): Promise<OptimizedDatabase> {
  const db = createOptimizedDatabase(config);
  
  try {
    // Initialize database and run migrations
    await db.manager.initialize();
    
    // Start monitoring if enabled
    db.startMonitoring();
    
    // Log initial performance stats
    const stats = await db.manager.getStats();
    logger.info('Optimized database initialized successfully', {
      path: config.path,
      version: stats.version,
      size: stats.size,
      pageCount: stats.pageCount,
      cacheSize: stats.cacheSize
    });

    return db;
  } catch (error) {
    // Cleanup on initialization failure
    db.stopMonitoring();
    await db.manager.close().catch(() => {}); // Ignore close errors
    
    logger.error('Failed to initialize optimized database', {
      path: config.path,
      error: error instanceof Error ? error.message : String(error)
    });
    
    throw error;
  }
}

/**
 * Create a performance-optimized database for production use
 */
export function createProductionDatabase(path: string): Promise<OptimizedDatabase> {
  return initializeOptimizedDatabase({
    path,
    enablePerformanceMonitoring: true,
    enableAutoOptimization: true,
    enableMaintenance: true,
    maintenanceIntervalMs: 60 * 60 * 1000, // 1 hour
    performanceMonitoringIntervalMs: 30 * 1000 // 30 seconds for production
  });
}

/**
 * Create a lightweight database for development/testing
 */
export function createDevelopmentDatabase(path: string): Promise<OptimizedDatabase> {
  return initializeOptimizedDatabase({
    path,
    enablePerformanceMonitoring: false,
    enableAutoOptimization: false,
    enableMaintenance: false
  });
}