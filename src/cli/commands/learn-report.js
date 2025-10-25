#!/usr/bin/env node

import path from 'path';
import fs from 'fs';
import { Database } from '../../storage/database-simple.js';
import { MemoryOperations } from '../../storage/memory-operations.js';
import { OutcomeAnalyzer } from '../../learning/outcome-analyzer.js';
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
 * Generate comprehensive learning report
 */
function generateLearningReport(metrics, signals, cacheStats, options = {}) {
  const { format = 'json', includeDetails = false } = options;
  
  switch (format.toLowerCase()) {
    case 'json':
      return JSON.stringify({
        timestamp: new Date().toISOString(),
        period: options.period || 'unknown',
        summary: {
          totalInteractions: metrics.totalInteractions,
          satisfiedInteractions: metrics.satisfiedInteractions,
          unsatisfiedInteractions: metrics.unsatisfiedInteractions,
          overallSatisfactionRate: Math.round(metrics.overallSatisfactionRate * 100) / 100,
          averageTimeToFix: metrics.averageTimeToFix,
          averageTokenUsage: metrics.averageTokenUsage
        },
        metrics: {
          byIntent: metrics.byIntent,
          byBundleSignature: includeDetails ? metrics.byBundleSignature : Object.keys(metrics.byBundleSignature).length
        },
        cache: {
          entries: cacheStats.entries,
          hitRate: cacheStats.hitRate,
          totalRequests: cacheStats.totalRequests,
          cacheHits: cacheStats.cacheHits,
          cacheMisses: cacheStats.cacheMisses
        },
        signals: includeDetails ? signals : {
          total: signals.length,
          satisfied: signals.filter(s => s.satisfied).length,
          unsatisfied: signals.filter(s => !s.satisfied).length
        }
      }, null, 2);
    
    case 'md':
    case 'markdown':
      let markdown = `# Learning System Report\n\n`;
      markdown += `**Generated:** ${new Date().toISOString()}\n`;
      markdown += `**Period:** Last ${options.period || 'unknown'}\n\n`;
      
      // Executive Summary
      markdown += `## Executive Summary\n\n`;
      markdown += `| Metric | Value |\n`;
      markdown += `|--------|-------|\n`;
      markdown += `| Total Interactions | ${metrics.totalInteractions} |\n`;
      markdown += `| Satisfaction Rate | ${(metrics.overallSatisfactionRate * 100).toFixed(1)}% |\n`;
      markdown += `| Satisfied | ${metrics.satisfiedInteractions} |\n`;
      markdown += `| Unsatisfied | ${metrics.unsatisfiedInteractions} |\n`;
      markdown += `| Avg Time to Fix | ${metrics.averageTimeToFix ? `${Math.round(metrics.averageTimeToFix / 1000)}s` : 'N/A'} |\n`;
      markdown += `| Avg Token Usage | ${metrics.averageTokenUsage ? Math.round(metrics.averageTokenUsage) : 'N/A'} |\n\n`;
      
      // Performance by Intent
      if (Object.keys(metrics.byIntent).length > 0) {
        markdown += `## Performance by Intent\n\n`;
        markdown += `| Intent | Total | Satisfied | Rate | Avg Time | Avg Tokens |\n`;
        markdown += `|--------|-------|-----------|------|----------|------------|\n`;
        
        const sortedIntents = Object.entries(metrics.byIntent)
          .sort(([, a], [, b]) => b.total - a.total);
        
        for (const [intent, intentMetrics] of sortedIntents) {
          markdown += `| ${intent} | ${intentMetrics.total} | ${intentMetrics.satisfied} | ${(intentMetrics.satisfactionRate * 100).toFixed(1)}% | ${intentMetrics.averageTimeToFix ? `${Math.round(intentMetrics.averageTimeToFix / 1000)}s` : 'N/A'} | ${intentMetrics.averageTokenUsage ? Math.round(intentMetrics.averageTokenUsage) : 'N/A'} |\n`;
        }
        markdown += `\n`;
      }
      
      // Cache Performance
      markdown += `## Cache Performance\n\n`;
      markdown += `| Metric | Value |\n`;
      markdown += `|--------|-------|\n`;
      markdown += `| Total Entries | ${cacheStats.entries} |\n`;
      markdown += `| Hit Rate | ${(cacheStats.hitRate * 100).toFixed(1)}% |\n`;
      markdown += `| Total Requests | ${cacheStats.totalRequests} |\n`;
      markdown += `| Cache Hits | ${cacheStats.cacheHits} |\n`;
      markdown += `| Cache Misses | ${cacheStats.cacheMisses} |\n\n`;
      
      // Top Bundle Patterns
      if (Object.keys(metrics.byBundleSignature).length > 0) {
        markdown += `## Top Bundle Patterns\n\n`;
        const topBundles = Object.entries(metrics.byBundleSignature)
          .sort(([, a], [, b]) => b.satisfactionRate - a.satisfactionRate)
          .slice(0, 15);
        
        markdown += `| Rank | Bundle Signature | Total | Satisfied | Rate | Avg Tokens |\n`;
        markdown += `|------|------------------|-------|-----------|------|------------|\n`;
        
        topBundles.forEach(([signature, sigMetrics], index) => {
          markdown += `| ${index + 1} | \`${signature}\` | ${sigMetrics.total} | ${sigMetrics.satisfied} | ${(sigMetrics.satisfactionRate * 100).toFixed(1)}% | ${sigMetrics.averageTokenUsage ? Math.round(sigMetrics.averageTokenUsage) : 'N/A'} |\n`;
        });
        markdown += `\n`;
      }
      
      // Recommendations
      markdown += `## Recommendations\n\n`;
      
      if (metrics.overallSatisfactionRate < 0.7) {
        markdown += `⚠️ **Low Satisfaction Rate** (${(metrics.overallSatisfactionRate * 100).toFixed(1)}%)\n`;
        markdown += `- Consider running weight optimization with \`pampax learn --update-weights\`\n`;
        markdown += `- Review unsatisfied interactions for patterns\n\n`;
      } else if (metrics.overallSatisfactionRate > 0.9) {
        markdown += `✅ **Excellent Satisfaction Rate** (${(metrics.overallSatisfactionRate * 100).toFixed(1)}%)\n`;
        markdown += `- Current policies are performing well\n`;
        markdown += `- Consider monitoring for consistency\n\n`;
      }
      
      if (cacheStats.hitRate < 0.3) {
        markdown += `📊 **Low Cache Hit Rate** (${(cacheStats.hitRate * 100).toFixed(1)}%)\n`;
        markdown += `- Cache may need more time to build up\n`;
        markdown += `- Consider adjusting cache configuration\n\n`;
      }
      
      const lowPerformingIntents = Object.entries(metrics.byIntent)
        .filter(([, metrics]) => metrics.satisfactionRate < 0.6)
        .map(([intent]) => intent);
      
      if (lowPerformingIntents.length > 0) {
        markdown += `🎯 **Low-Performing Intents**\n`;
        markdown += `- Focus optimization on: ${lowPerformingIntents.join(', ')}\n`;
        markdown += `- Consider intent-specific policy adjustments\n\n`;
      }
      
      return markdown;
    
    case 'csv':
      let csv = 'timestamp,period,intent,bundle_signature,total_interactions,satisfied_interactions,unsatisfied_interactions,satisfaction_rate,average_time_to_fix,average_token_usage,cache_entries,cache_hit_rate\n';
      csv += `${new Date().toISOString()},${options.period || 'unknown'},ALL,ALL,${metrics.totalInteractions},${metrics.satisfiedInteractions},${metrics.unsatisfiedInteractions},${metrics.overallSatisfactionRate},${metrics.averageTimeToFix || ''},${metrics.averageTokenUsage || ''},${cacheStats.entries},${cacheStats.hitRate}\n`;
      
      // Add intent-specific rows
      for (const [intent, intentMetrics] of Object.entries(metrics.byIntent)) {
        csv += `${new Date().toISOString()},${options.period || 'unknown'},${intent},ALL,${intentMetrics.total},${intentMetrics.satisfied},${intentMetrics.total - intentMetrics.satisfied},${intentMetrics.satisfactionRate},${intentMetrics.averageTimeToFix || ''},${intentMetrics.averageTokenUsage || ''},,\n`;
      }
      
      return csv;
    
    default:
      throw new Error(`Unsupported output format: ${format}. Supported formats: json, md, csv`);
  }
}

/**
 * Learning report command implementation
 */
export async function learnReportCommand(options = {}) {
  const repoPath = path.resolve(options.repo || '.');
  const dbPath = options.db || path.join(repoPath, '.pampax/pampax.sqlite');
  const json = options.json || false;
  const format = options.format || 'json';
  const outputPath = options.output || options.write;
  const includeDetails = options.details || false;
  
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
    progress.start('Initializing report generation...');
    const db = new Database(dbPath);
    await db.initialize();
    const memoryOps = new MemoryOperations(db);
    const outcomeAnalyzer = new OutcomeAnalyzer(memoryOps);
    const signatureCache = new SignatureCache();
    
    // Ensure database has data
    const hasData = await db.hasData();
    if (!hasData) {
      const error = 'No indexed data found. Please run "pampax index" first.';
      progress.error(error);
      process.exit(1);
    }
    
    progress.complete('Report system initialized');
    
    // Step 1: Analyze interactions
    progress.start(`Analyzing interactions from last ${fromDays} days...`);
    const signals = await outcomeAnalyzer.analyzeInteractions(fromDays);
    
    if (signals.length === 0) {
      progress.warn(`No interactions found in the last ${fromDays} days`);
      console.log('\nNo learning data available for report generation.');
      console.log('Try:');
      console.log('  - Increasing the time period with --from-sessions');
      console.log('  - Running some searches to generate interaction data');
      process.exit(0);
    }
    
    progress.complete(`Analyzed ${signals.length} interactions`);
    
    // Step 2: Compute satisfaction metrics
    progress.start('Computing satisfaction metrics...');
    const metrics = await outcomeAnalyzer.computeSatisfactionMetrics(signals);
    progress.complete(`Computed metrics for ${metrics.totalInteractions} interactions`);
    
    // Step 3: Get cache statistics
    progress.start('Gathering cache statistics...');
    const cacheStats = await signatureCache.getStats();
    progress.complete(`Gathered cache statistics`);
    
    // Step 4: Generate report
    progress.start('Generating report...');
    const reportContent = generateLearningReport(metrics, signals, cacheStats, {
      format,
      includeDetails,
      period: `${fromDays}d`
    });
    
    progress.complete('Report generated');
    
    // Step 5: Output report
    if (outputPath) {
      const reportPath = path.resolve(outputPath);
      fs.writeFileSync(reportPath, reportContent);
      progress.complete(`Report saved to ${reportPath}`);
      
      if (!json) {
        console.log(`\n${chalk.green('✅')} Report saved to ${chalk.cyan(reportPath)}`);
        console.log(`Format: ${format.toUpperCase()}`);
        console.log(`Period: Last ${fromDays} days`);
        console.log(`Interactions: ${signals.length}`);
      }
    } else {
      console.log('\n' + reportContent);
    }
    
    // Cleanup
    await signatureCache.destroy();
    
    if (json) {
      const output = {
        success: true,
        fromDays,
        signals: signals.length,
        outputPath: outputPath || null,
        format,
        metrics: {
          totalInteractions: metrics.totalInteractions,
          satisfactionRate: metrics.overallSatisfactionRate,
          averageTimeToFix: metrics.averageTimeToFix,
          averageTokenUsage: metrics.averageTokenUsage
        },
        cache: cacheStats
      };
      
      console.log(JSON.stringify(output, null, 2));
    }
    
  } catch (error) {
    logger.error('Report generation failed', { error: error.message, repoPath });
    
    progress.error(`Report generation failed: ${error.message}`);
    
    if (json) {
      console.log(JSON.stringify({
        success: false,
        error: error.message,
        repoPath
      }, null, 2));
    } else {
      console.error('❌ Report generation failed:', error.message);
    }
    process.exit(1);
  }
}

/**
 * Configure the learn report command for CLI
 */
export function configureLearnReportCommand(program) {
  program
    .command('learn-report')
    .description('Generate comprehensive learning system performance reports')
    .option('--repo <path>', 'Repository path', '.')
    .option('--db <path>', 'Database file path')
    .option('--from-sessions <period>', 'Analyze interactions from last N days (e.g., 30d, 7d, 1w)', '30d')
    .option('--output <path>', 'Write report to file')
    .option('--write <path>', 'Alias for --output')
    .option('--format <format>', 'Output format (json, md, csv)', 'json')
    .option('--details', 'Include detailed signal data in report')
    .option('--json', 'Output in JSON format')
    .option('--verbose', 'Verbose output')
    .addHelpText('after', `\nExamples:\n  # Generate markdown report for last 30 days\n  pampax learn-report --from-sessions 30d --format md --output report.md\n\n  # Generate detailed JSON report\n  pampax learn-report --details --format json --output detailed-report.json\n\n  # Generate CSV for data analysis\n  pampax learn-report --format csv --output learning-data.csv`)
    .action(learnReportCommand);
}