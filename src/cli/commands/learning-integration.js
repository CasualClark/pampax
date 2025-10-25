#!/usr/bin/env node

import path from 'path';
import { Database } from '../../storage/database-simple.js';
import { MemoryOperations } from '../../storage/memory-operations.js';
import { getLearningIntegration, getLearningWorkflow } from '../../learning/index.js';
import { logger } from '../../config/logger.js';

// Simple logger fallback for CLI
const cliLogger = {
  error: (message, meta) => console.error(`ERROR: ${message}`, meta || ''),
  info: (message, meta) => console.log(`INFO: ${message}`, meta || ''),
  warn: (message, meta) => console.warn(`WARN: ${message}`, meta || ''),
  debug: (message, meta) => process.env.DEBUG && console.log(`DEBUG: ${message}`, meta || '')
};

/**
 * Initialize learning system for a repository
 */
async function initializeLearning(repoPath, options = {}) {
  try {
    const db = new Database(path.join(repoPath, '.pampax', 'pampax.sqlite'));
    const memoryOps = new MemoryOperations(db);
    
    const config = {
      enabled: true,
      analysisInterval: options.analysisInterval || 60 * 60 * 1000, // 1 hour
      minSignalsForOptimization: options.minSignals || 10,
      cacheEnabled: options.cache !== false,
      autoApplyOptimizations: options.autoApply !== false,
      performanceTracking: true,
      rollbackOnFailure: true
    };

    const learningIntegration = getLearningIntegration(memoryOps, config);
    await learningIntegration.start();

    cliLogger.info('Learning system initialized', {
      repoPath,
      config
    });

    return learningIntegration;
  } catch (error) {
    cliLogger.error('Failed to initialize learning system', {
      repoPath,
      error: error.message
    });
    throw error;
  }
}

/**
 * Run learning workflow manually
 */
async function runWorkflow(repoPath, options = {}) {
  try {
    const db = new Database(path.join(repoPath, '.pampax', 'pampax.sqlite'));
    const memoryOps = new MemoryOperations(db);
    
    const learningWorkflow = getLearningWorkflow(memoryOps, {
      integration: {
        enabled: true,
        autoApplyOptimizations: options.autoApply !== false,
        minSignalsForOptimization: options.minSignals || 10
      }
    });

    const result = await learningWorkflow.executeWorkflow(options.fromDays || 7);

    cliLogger.info('Learning workflow completed', {
      success: result.success,
      executionTime: result.executionTime,
      signalsProcessed: result.summary.signalsProcessed,
      optimizationsApplied: result.summary.optimizationsApplied,
      improvement: result.summary.improvement
    });

    if (result.context.errors.length > 0) {
      cliLogger.warn('Workflow completed with errors', {
        errors: result.context.errors
      });
    }

    return result;
  } catch (error) {
    cliLogger.error('Failed to run learning workflow', {
      repoPath,
      error: error.message
    });
    throw error;
  }
}

/**
 * Get learning statistics
 */
async function getStats(repoPath) {
  try {
    const db = new Database(path.join(repoPath, '.pampax', 'pampax.sqlite'));
    const memoryOps = new MemoryOperations(db);
    
    const learningIntegration = getLearningIntegration(memoryOps);
    const stats = await learningIntegration.getLearningStats();

    console.log('\n=== Learning System Statistics ===');
    console.log(`Active: ${stats.state.isActive ? 'Yes' : 'No'}`);
    console.log(`Total Signals: ${stats.state.totalSignals}`);
    console.log(`Last Analysis: ${stats.state.lastAnalysis ? new Date(stats.state.lastAnalysis).toLocaleString() : 'Never'}`);
    console.log(`Optimizations Applied: ${stats.state.optimizationCount}`);
    console.log(`Average Satisfaction: ${(stats.state.averageSatisfaction * 100).toFixed(1)}%`);
    console.log(`Cache Hit Rate: ${(stats.cacheStats.hitRate * 100).toFixed(1)}%`);
    console.log(`Cache Entries: ${stats.cacheStats.entries}`);
    
    return stats;
  } catch (error) {
    cliLogger.error('Failed to get learning stats', {
      repoPath,
      error: error.message
    });
    throw error;
  }
}

/**
 * CLI command handler
 */
export async function handleLearningCommand(args, options = {}) {
  const command = args[0];
  const repoPath = options.repo || process.cwd();

  if (!command) {
    console.log(`
Usage: pampax learning <command> [options]

Commands:
  init     Initialize learning system for repository
  run      Run learning workflow manually
  stats    Show learning statistics
  stop     Stop learning system

Options:
  --repo <path>           Repository path (default: current directory)
  --analysis-interval <ms> Analysis interval in milliseconds (default: 3600000)
  --min-signals <num>     Minimum signals for optimization (default: 10)
  --no-cache              Disable cache
  --no-auto-apply         Disable automatic optimization application
  --from-days <num>       Analyze interactions from last N days (default: 7)

Examples:
  pampax learning init --repo ./my-repo
  pampax learning run --from-days 14 --min-signals 20
  pampax learning stats
    `);
    return;
  }

  try {
    switch (command) {
      case 'init':
        await initializeLearning(repoPath, options);
        break;
        
      case 'run':
        await runWorkflow(repoPath, options);
        break;
        
      case 'stats':
        await getStats(repoPath);
        break;
        
      case 'stop':
        const db = new Database(path.join(repoPath, '.pampax', 'pampax.sqlite'));
        const memoryOps = new MemoryOperations(db);
        const learningIntegration = getLearningIntegration(memoryOps);
        await learningIntegration.stop();
        cliLogger.info('Learning system stopped');
        break;
        
      default:
        cliLogger.error(`Unknown command: ${command}`);
        process.exit(1);
    }
  } catch (error) {
    cliLogger.error('Command failed', {
      command,
      error: error.message
    });
    process.exit(1);
  }
}

/**
 * Record interaction outcome (for integration with other CLI commands)
 */
export async function recordInteraction(repoPath, interaction) {
  try {
    const db = new Database(path.join(repoPath, '.pampax', 'pampax.sqlite'));
    const memoryOps = new MemoryOperations(db);
    const learningIntegration = getLearningIntegration(memoryOps);
    
    await learningIntegration.recordInteraction(interaction);
    
    cliLogger.debug('Interaction recorded', {
      sessionId: interaction.sessionId,
      satisfied: interaction.satisfied
    });
  } catch (error) {
    cliLogger.warn('Failed to record interaction', {
      error: error.message
    });
  }
}

/**
 * Check learning cache for query
 */
export async function checkLearningCache(repoPath, query, intent) {
  try {
    const db = new Database(path.join(repoPath, '.pampax', 'pampax.sqlite'));
    const memoryOps = new MemoryOperations(db);
    const learningIntegration = getLearningIntegration(memoryOps);
    
    const crypto = await import('crypto');
    const querySignature = crypto.createHash('sha256')
      .update(`${query.toLowerCase()}:${intent.intent}:${Math.floor(intent.confidence * 100)}`)
      .digest('hex')
      .substring(0, 16);
    
    return await learningIntegration.checkCache(querySignature);
  } catch (error) {
    cliLogger.debug('Cache check failed', {
      error: error.message
    });
    return null;
  }
}

// If this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const options = {};
  
  // Parse options
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2).replace(/-/g, '_');
      const value = args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true;
      options[key] = value;
      if (value !== true) args.splice(i + 1, 1);
      args.splice(i, 1);
      i--;
    }
  }
  
  handleLearningCommand(args, options).catch(console.error);
}