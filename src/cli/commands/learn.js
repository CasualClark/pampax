#!/usr/bin/env node

import path from 'path';
import fs from 'fs';
import { Database } from '../../storage/database-simple.js';
import { MemoryOperations } from '../../storage/memory-operations.js';
import { OutcomeAnalyzer } from '../../learning/outcome-analyzer.js';
import { WeightOptimizer } from '../../learning/weight-optimizer.js';
import { SignatureCache } from '../../learning/signature-cache.js';
import { createProgressRenderer } from '../progress/renderer.js';
import chalk from 'chalk';

// Simple logger fallback
const logger = {
  error: (message, meta) => console.error(`ERROR: ${message}`, meta || ''),
  info: (message, meta) => console.log(`INFO: ${message}`, meta || ''),
  warn: (message, meta) => console.warn(`WARN: ${message}`, meta || ''),
  debug: (message, meta) => process.env.DEBUG && console.log(`DEBUG: ${message}`, meta || '')
};

/**
 * Parse time period from string (e.g., "30d", "7d", "1w")
 */
function parseTimePeriod(periodStr) {
  const match = periodStr.match(/^(\d+)([hdw])$/);
  if (!match) {
    throw new Error(`Invalid time period format: ${periodStr}. Use format like "30d", "7d", "1w"`);
  }
  
  const [, amount, unit] = match;
  const days = parseInt(amount, 10);
  
  switch (unit) {
    case 'h': return days / 24; // hours to days
    case 'd': return days;
    case 'w': return days * 7; // weeks to days
    default: throw new Error(`Unknown time unit: ${unit}`);
  }
}

/**
 * Generate performance report in different formats
 */
function generatePerformanceReport(metrics, signals, format = 'json') {
  switch (format.toLowerCase()) {
    case 'json':
      return JSON.stringify({
        timestamp: new Date().toISOString(),
        metrics,
        signalCount: signals.length,
        summary: {
          totalInteractions: metrics.totalInteractions,
          overallSatisfactionRate: Math.round(metrics.overallSatisfactionRate * 100) / 100,
          averageTimeToFix: metrics.averageTimeToFix,
          averageTokenUsage: metrics.averageTokenUsage
        }
      }, null, 2);
    
    case 'md':
    case 'markdown':
      let markdown = `# Learning System Performance Report\n\n`;
      markdown += `**Generated:** ${new Date().toISOString()}\n\n`;
      markdown += `## Summary\n\n`;
      markdown += `- **Total Interactions:** ${metrics.totalInteractions}\n`;
      markdown += `- **Overall Satisfaction Rate:** ${(metrics.overallSatisfactionRate * 100).toFixed(1)}%\n`;
      markdown += `- **Average Time to Fix:** ${metrics.averageTimeToFix ? `${Math.round(metrics.averageTimeToFix / 1000)}s` : 'N/A'}\n`;
      markdown += `- **Average Token Usage:** ${metrics.averageTokenUsage ? Math.round(metrics.averageTokenUsage) : 'N/A'}\n\n`;
      
      if (Object.keys(metrics.byIntent).length > 0) {
        markdown += `## Performance by Intent\n\n`;
        markdown += `| Intent | Total | Satisfied | Rate | Avg Time to Fix |\n`;
        markdown += `|--------|-------|-----------|------|----------------|\n`;
        
        for (const [intent, intentMetrics] of Object.entries(metrics.byIntent)) {
          markdown += `| ${intent} | ${intentMetrics.total} | ${intentMetrics.satisfied} | ${(intentMetrics.satisfactionRate * 100).toFixed(1)}% | ${intentMetrics.averageTimeToFix ? `${Math.round(intentMetrics.averageTimeToFix / 1000)}s` : 'N/A'} |\n`;
        }
        markdown += `\n`;
      }
      
      if (Object.keys(metrics.byBundleSignature).length > 0) {
        markdown += `## Top Performing Bundle Patterns\n\n`;
        const topBundles = Object.entries(metrics.byBundleSignature)
          .sort(([, a], [, b]) => b.satisfactionRate - a.satisfactionRate)
          .slice(0, 10);
        
        markdown += `| Bundle Signature | Total | Satisfied | Rate | Avg Token Usage |\n`;
        markdown += `|------------------|-------|-----------|------|----------------|\n`;
        
        for (const [signature, sigMetrics] of topBundles) {
          markdown += `| ${signature} | ${sigMetrics.total} | ${sigMetrics.satisfied} | ${(sigMetrics.satisfactionRate * 100).toFixed(1)}% | ${sigMetrics.averageTokenUsage ? Math.round(sigMetrics.averageTokenUsage) : 'N/A'} |\n`;
        }
      }
      
      return markdown;
    
    case 'csv':
      let csv = 'timestamp,intent,bundle_signature,satisfied,time_to_fix,token_usage\n';
      for (const signal of signals) {
        csv += `${new Date().toISOString()},${signal.intent},${signal.bundleSignature},${signal.satisfied},${signal.timeToFix || ''},${signal.tokenUsage}\n`;
      }
      return csv;
    
    default:
      throw new Error(`Unsupported output format: ${format}. Supported formats: json, md, csv`);
  }
}

/**
 * Interactive confirmation for weight updates
 */
async function confirmWeightUpdates(result, interactive) {
  if (!interactive) {
    return true;
  }
  
  console.log(`\n${chalk.blue('=== Weight Optimization Results ===')}`);
  console.log(`Iterations: ${result.iterations}`);
  console.log(`Converged: ${result.convergence ? 'Yes' : 'No'}`);
  console.log(`Improvement: ${(result.improvement * 100).toFixed(2)}%`);
  
  if (result.improvement > 0) {
    console.log(`${chalk.green('✓ Positive improvement detected')}`);
  } else if (result.improvement < 0) {
    console.log(`${chalk.yellow('⚠ Negative improvement - weights may need adjustment')}`);
  } else {
    console.log(`${chalk.blue('ℹ No improvement - weights already optimal')}`);
  }
  
  console.log('\nUpdated weights by intent:');
  for (const [intent, weights] of Object.entries(result.optimizedWeights)) {
    console.log(`\n${chalk.cyan(intent)}:`);
    for (const [seed, weight] of Object.entries(weights)) {
      console.log(`  ${seed}: ${weight.toFixed(3)}`);
    }
  }
  
  // Simple confirmation prompt
  process.stdout.write(`\n${chalk.yellow('Apply these weight updates?')} [y/N] `);
  
  return new Promise((resolve) => {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    
    const onData = (key) => {
      if (key === 'y' || key === 'Y') {
        process.stdout.write('y\n');
        cleanup();
        resolve(true);
      } else if (key === '\u0003' || key === 'n' || key === 'N' || key === '\r' || key === '\n') {
        process.stdout.write(key === '\r' || key === '\n' ? 'N\n' : 'N\n');
        cleanup();
        resolve(false);
      }
    };
    
    const cleanup = () => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.removeListener('data', onData);
    };
    
    process.stdin.on('data', onData);
  });
}

/**
 * Main learning command implementation
 */
export async function learnCommand(options = {}) {
  const repoPath = path.resolve(options.repo || '.');
  const dbPath = options.db || path.join(repoPath, '.pampax/pampax.sqlite');
  const json = options.json || false;
  const verbose = options.verbose || false;
  const dryRun = options.dryRun || false;
  const interactive = options.interactive || false;
  const updateWeights = options.updateWeights || false;
  const generateReport = options.report || false;
  const format = options.format || 'json';
  const outputPath = options.write || options.output;
  
  // Parse time period
  let fromDays = 30; // default
  if (options.fromSessions) {
    try {
      fromDays = parseTimePeriod(options.fromSessions);
    } catch (error) {
      console.error(`Error parsing time period: ${error.message}`);
      process.exit(1);
    }
  }
  
  // Progress setup
  const isTTY = process.stdout.isTTY && !json;
  const progress = createProgressRenderer({ tty: isTTY, json });
  
  try {
    // Initialize database and components
    progress.start('Initializing learning system...');
    const db = new Database(dbPath);
    await db.initialize();
    const memoryOps = db.memory; // Use the memory operations from database
    const outcomeAnalyzer = new OutcomeAnalyzer(memoryOps);
    const weightOptimizer = new WeightOptimizer();
    const signatureCache = new SignatureCache();
    
    // Ensure database has data
    const hasData = await db.hasData();
    if (!hasData) {
      const error = 'No indexed data found. Please run "pampax index" first.';
      progress.error(error);
      process.exit(1);
    }
    
    progress.complete('Learning system initialized');
    
    // Step 1: Analyze interactions
    progress.start(`Analyzing interactions from last ${fromDays} days...`);
    const signals = await outcomeAnalyzer.analyzeInteractions(fromDays);
    
    if (signals.length === 0) {
      progress.warn(`No interactions found in the last ${fromDays} days`);
      console.log('\nNo learning data available. Try:');
      console.log('  - Increasing the time period with --from-sessions');
      console.log('  - Running some searches to generate interaction data');
      process.exit(0);
    }
    
    progress.complete(`Analyzed ${signals.length} interactions`);
    
    // Step 2: Compute satisfaction metrics
    progress.start('Computing satisfaction metrics...');
    const metrics = await outcomeAnalyzer.computeSatisfactionMetrics(signals);
    progress.complete(`Computed metrics for ${metrics.totalInteractions} interactions`);
    
    // Step 3: Generate report if requested
    if (generateReport) {
      progress.start('Generating performance report...');
      const reportContent = generatePerformanceReport(metrics, signals, format);
      
      if (outputPath) {
        const reportPath = path.resolve(outputPath);
        fs.writeFileSync(reportPath, reportContent);
        progress.complete(`Report saved to ${reportPath}`);
      } else {
        console.log('\n' + reportContent);
        progress.complete('Report generated');
      }
    }
    
    // Step 4: Weight optimization if requested
    let optimizationResult = null;
    if (updateWeights && signals.length > 0) {
      progress.start('Optimizing weights...');
      
      // Get current weights from policy gate
      const currentWeights = {};
      const intents = ['symbol', 'config', 'api', 'incident', 'search'];
      
      for (const intent of intents) {
        // Mock current weights - in real implementation, get from policy gate
        currentWeights[intent] = {
          vector: 1.0,
          bm25: 1.0,
          memory: 0.5,
          symbol: 0.8
        };
      }
      
      optimizationResult = await weightOptimizer.optimizeWeights(signals, currentWeights, {
        learningRate: 0.1,
        maxIterations: 50,
        minSignalsPerIntent: 3
      });
      
      progress.complete(`Weight optimization completed in ${optimizationResult.iterations} iterations`);
      
      // Apply weights if not dry run and confirmed
      if (!dryRun) {
        const shouldApply = await confirmWeightUpdates(optimizationResult, interactive);
        
        if (shouldApply) {
          progress.start('Applying weight updates...');
          await weightOptimizer.applyWeightUpdates(optimizationResult.optimizedWeights);
          progress.complete('Weight updates applied successfully');
        } else {
          progress.info('Weight updates cancelled by user');
        }
      } else {
        progress.info('Dry run mode - weight updates not applied');
      }
    }
    
    // Step 5: Update signature cache
    progress.start('Updating signature cache...');
    let cacheUpdates = 0;
    
    for (const signal of signals) {
      if (signal.satisfied && signal.bundleSignature !== 'unknown') {
        const entry = {
          querySignature: signal.bundleSignature,
          bundleId: signal.bundleSignature,
          satisfaction: 1.0,
          usageCount: 1,
          createdAt: Date.now(),
          lastUsed: Date.now(),
          ttl: 7 * 24 * 60 * 60 * 1000 // 7 days
        };
        
        await signatureCache.set(entry);
        cacheUpdates++;
      }
    }
    
    progress.complete(`Updated ${cacheUpdates} cache entries`);
    
    // Final summary
    const cacheStats = await signatureCache.getStats();
    
    if (json) {
      const output = {
        success: true,
        fromDays,
        signals: {
          total: signals.length,
          satisfied: metrics.satisfiedInteractions,
          unsatisfied: metrics.unsatisfiedInteractions,
          satisfactionRate: metrics.overallSatisfactionRate
        },
        metrics: {
          averageTimeToFix: metrics.averageTimeToFix,
          averageTokenUsage: metrics.averageTokenUsage
        },
        cache: {
          entries: cacheStats.entries,
          hitRate: cacheStats.hitRate,
          updates: cacheUpdates
        },
        optimization: optimizationResult ? {
          iterations: optimizationResult.iterations,
          converged: optimizationResult.convergence,
          improvement: optimizationResult.improvement,
          applied: !dryRun && updateWeights
        } : null,
        databasePath: dbPath
      };
      
      console.log(JSON.stringify(output, null, 2));
    } else {
      console.log(`\n${chalk.blue('=== Learning Session Complete ===')}`);
      console.log(`Time Period: Last ${fromDays} days`);
      console.log(`Interactions Analyzed: ${signals.length}`);
      console.log(`Satisfaction Rate: ${(metrics.overallSatisfactionRate * 100).toFixed(1)}%`);
      
      if (metrics.averageTimeToFix) {
        console.log(`Average Time to Fix: ${Math.round(metrics.averageTimeToFix / 1000)}s`);
      }
      
      if (metrics.averageTokenUsage) {
        console.log(`Average Token Usage: ${Math.round(metrics.averageTokenUsage)}`);
      }
      
      console.log(`Cache Entries: ${cacheStats.entries}`);
      console.log(`Cache Hit Rate: ${(cacheStats.hitRate * 100).toFixed(1)}%`);
      
      if (optimizationResult) {
        console.log(`\n${chalk.cyan('Weight Optimization:')}`);
        console.log(`Iterations: ${optimizationResult.iterations}`);
        console.log(`Converged: ${optimizationResult.convergence ? 'Yes' : 'No'}`);
        console.log(`Improvement: ${(optimizationResult.improvement * 100).toFixed(2)}%`);
        console.log(`Applied: ${!dryRun && updateWeights ? 'Yes' : 'No'}`);
      }
      
      if (verbose) {
        console.log(`\n${chalk.blue('Performance by Intent:')}`);
        for (const [intent, intentMetrics] of Object.entries(metrics.byIntent)) {
          console.log(`  ${intent}: ${(intentMetrics.satisfactionRate * 100).toFixed(1)}% (${intentMetrics.satisfied}/${intentMetrics.total})`);
        }
      }
    }
    
    // Cleanup
    await signatureCache.destroy();
    
  } catch (error) {
    logger.error('Learning command failed', { error: error.message, repoPath });
    
    progress.error(`Learning failed: ${error.message}`);
    
    if (json) {
      console.log(JSON.stringify({
        success: false,
        error: error.message,
        repoPath
      }, null, 2));
    } else {
      console.error('❌ Learning failed:', error.message);
    }
    process.exit(1);
  }
}

/**
 * Configure the learn command for CLI
 */
export function configureLearnCommand(program) {
  program
    .command('learn')
    .description('Analyze interactions and optimize retrieval policies')
    .option('--repo <path>', 'Repository path', '.')
    .option('--db <path>', 'Database file path')
    .option('--from-sessions <period>', 'Analyze interactions from last N days (e.g., 30d, 7d, 1w)', '30d')
    .option('--update-weights', 'Apply weight optimizations based on learning data')
    .option('--write <path>', 'Write output to file (for reports or policy updates)')
    .option('--output <path>', 'Alias for --write')
    .option('--dry-run', 'Preview changes without applying them')
    .option('--report', 'Generate performance report')
    .option('--format <format>', 'Output format for reports (json, md, csv)', 'json')
    .option('--interactive', 'Interactive confirmation for weight updates')
    .option('--json', 'Output in JSON format')
    .option('--verbose', 'Verbose output')
    .addHelpText('after', `\nExamples:\n  # Basic learning with weight updates\n  pampax learn --from-sessions 30d --update-weights --write out/policy.json\n\n  # Dry run to preview changes\n  pampax learn --from-sessions 7d --dry-run --format md\n\n  # Generate performance report only\n  pampax learn --report --from-sessions 30d --format json --output report.json\n\n  # Interactive learning with confirmation\n  pampax learn --from-sessions 14d --update-weights --interactive`)
    .action(learnCommand);
}