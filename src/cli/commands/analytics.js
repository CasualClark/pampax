#!/usr/bin/env node

import path from 'path';
import fs from 'fs';
import { Database } from '../../storage/database-simple.js';
import { MemoryOperations } from '../../storage/memory-operations.js';
import { OutcomeAnalyzer } from '../../learning/outcome-analyzer.js';
import { PerformanceTracker } from '../../analytics/performance-tracker.js';
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
 * Generate comprehensive analytics report
 */
function generateAnalyticsReport(metrics, comparison, trends, options = {}) {
  const { format = 'json', includeDetails = false } = options;
  
  switch (format.toLowerCase()) {
    case 'json':
      return JSON.stringify({
        timestamp: new Date().toISOString(),
        period: options.period || 'unknown',
        summary: {
          totalInteractions: metrics.totalInteractions,
          overallSatisfactionRate: Math.round(metrics.overallSatisfactionRate * 100) / 100,
          overallCostEfficiency: Math.round(metrics.overallCostEfficiency * 100) / 100,
          totalCost: metrics.tokenCostAnalysis.totalCost,
          totalTokens: metrics.tokenCostAnalysis.totalTokens
        },
        performance: {
          winRates: metrics.winRates,
          intentPerformance: metrics.intentPerformance,
          languagePerformance: metrics.languagePerformance,
          repositoryPerformance: includeDetails ? metrics.repositoryPerformance : Object.keys(metrics.repositoryPerformance).length
        },
        costAnalysis: metrics.tokenCostAnalysis,
        comparison: comparison,
        trends: trends,
        satisfactionTrends: metrics.satisfactionTrends
      }, null, 2);
    
    case 'md':
    case 'markdown':
      let markdown = `# Analytics Performance Report\n\n`;
      markdown += `**Generated:** ${new Date().toISOString()}\n`;
      markdown += `**Period:** Last ${options.period || 'unknown'}\n\n`;
      
      // Executive Summary
      markdown += `## Executive Summary\n\n`;
      markdown += `| Metric | Value |\n`;
      markdown += `|--------|-------|\n`;
      markdown += `| Total Interactions | ${metrics.totalInteractions} |\n`;
      markdown += `| Satisfaction Rate | ${(metrics.overallSatisfactionRate * 100).toFixed(1)}% |\n`;
      markdown += `| Cost Efficiency | ${metrics.overallCostEfficiency.toFixed(2)} |\n`;
      markdown += `| Total Cost | $${metrics.tokenCostAnalysis.totalCost.toFixed(4)} |\n`;
      markdown += `| Total Tokens | ${metrics.tokenCostAnalysis.totalTokens.toLocaleString()} |\n\n`;
      
      // Win Rates by Dimension
      if (Object.keys(metrics.winRates).length > 0) {
        markdown += `## Win Rates by Dimension\n\n`;
        markdown += `| Dimension | Win Rate |\n`;
        markdown += `|-----------|----------|\n`;
        
        Object.entries(metrics.winRates)
          .sort(([, a], [, b]) => b - a)
          .forEach(([dimension, rate]) => {
            const displayName = dimension.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            markdown += `| ${displayName} | ${(rate * 100).toFixed(1)}% |\n`;
          });
        markdown += `\n`;
      }
      
      // Intent Performance Analysis
      if (Object.keys(metrics.intentPerformance).length > 0) {
        markdown += `## Intent Performance Analysis\n\n`;
        markdown += `| Intent | Interactions | Win Rate | Avg Tokens | Cost Efficiency | Avg Time to Fix |\n`;
        markdown += `|--------|-------------|----------|------------|-----------------|-----------------|\n`;
        
        const sortedIntents = Object.entries(metrics.intentPerformance)
          .sort(([, a], [, b]) => b.totalInteractions - a.totalInteractions);
        
        for (const [intent, data] of sortedIntents) {
          markdown += `| ${intent} | ${data.totalInteractions} | ${(data.winRate * 100).toFixed(1)}% | ${Math.round(data.averageTokenUsage)} | ${data.costEfficiency.toFixed(2)} | ${data.averageTimeToFix ? `${Math.round(data.averageTimeToFix / 1000)}s` : 'N/A'} |\n`;
        }
        markdown += `\n`;
      }
      
      // Cost Analysis
      markdown += `## Cost Analysis\n\n`;
      markdown += `| Metric | Value |\n`;
      markdown += `|--------|-------|\n`;
      markdown += `| Total Tokens | ${metrics.tokenCostAnalysis.totalTokens.toLocaleString()} |\n`;
      markdown += `| Total Cost | $${metrics.tokenCostAnalysis.totalCost.toFixed(4)} |\n`;
      markdown += `| Average Cost per Interaction | $${metrics.tokenCostAnalysis.averageCostPerInteraction.toFixed(6)} |\n`;
      markdown += `| Cost Efficiency | ${metrics.tokenCostAnalysis.costEfficiency.toFixed(2)} |\n\n`;
      
      if (Object.keys(metrics.tokenCostAnalysis.costByIntent).length > 0) {
        markdown += `### Cost by Intent\n\n`;
        markdown += `| Intent | Cost |\n`;
        markdown += `|--------|------|\n`;
        
        Object.entries(metrics.tokenCostAnalysis.costByIntent)
          .sort(([, a], [, b]) => b - a)
          .forEach(([intent, cost]) => {
            markdown += `| ${intent} | $${cost.toFixed(4)} |\n`;
          });
        markdown += `\n`;
      }
      
      // Comparison Analysis (if available)
      if (comparison) {
        markdown += `## Before/After Comparison\n\n`;
        markdown += `| Metric | Before | After | Change | Impact |\n`;
        markdown += `|--------|--------|-------|--------|--------|\n`;
        
        if (comparison.improvements.overallSatisfactionRate) {
          markdown += `| Satisfaction Rate | ${(comparison.beforeMetrics.overallSatisfactionRate * 100).toFixed(1)}% | ${(comparison.afterMetrics.overallSatisfactionRate * 100).toFixed(1)}% | +${(comparison.improvements.overallSatisfactionRate * 100).toFixed(1)}% | ✅ Positive |\n`;
        }
        if (comparison.regressions.overallSatisfactionRate) {
          markdown += `| Satisfaction Rate | ${(comparison.beforeMetrics.overallSatisfactionRate * 100).toFixed(1)}% | ${(comparison.afterMetrics.overallSatisfactionRate * 100).toFixed(1)}% | -${(comparison.regressions.overallSatisfactionRate * 100).toFixed(1)}% | ⚠️ Negative |\n`;
        }
        
        markdown += `| **Net Impact** | - | - | - | **${comparison.netImpact > 0 ? '✅' : '⚠️'} ${comparison.netImpact > 0 ? '+' : ''}${comparison.netImpact.toFixed(2)}** |\n\n`;
        
        if (comparison.recommendations.length > 0) {
          markdown += `### Recommendations\n\n`;
          comparison.recommendations.forEach(rec => {
            markdown += `- ${rec}\n`;
          });
          markdown += `\n`;
        }
      }
      
      // Trend Analysis (if available)
      if (trends && Object.keys(trends.trends).length > 0) {
        markdown += `## Trend Analysis\n\n`;
        markdown += `| Metric | Direction | Rate | Confidence |\n`;
        markdown += `|--------|-----------|------|------------|\n`;
        
        Object.entries(trends.trends).forEach(([metric, data]) => {
          const direction = data.direction === 'improving' ? '📈 Improving' : 
                           data.direction === 'declining' ? '📉 Declining' : '➡️ Stable';
          markdown += `| ${metric} | ${direction} | ${data.rate.toFixed(4)} | ${(data.confidence * 100).toFixed(1)}% |\n`;
        });
        markdown += `\n`;
        
        if (trends.insights.length > 0) {
          markdown += `### Key Insights\n\n`;
          trends.insights.forEach(insight => {
            markdown += `- ${insight}\n`;
          });
          markdown += `\n`;
        }
      }
      
      return markdown;
    
    case 'csv':
      let csv = 'timestamp,period,metric,category,value,unit\n';
      csv += `${new Date().toISOString()},${options.period || 'unknown'},total_interactions,summary,${metrics.totalInteractions},count\n`;
      csv += `${new Date().toISOString()},${options.period || 'unknown'},satisfaction_rate,summary,${metrics.overallSatisfactionRate},rate\n`;
      csv += `${new Date().toISOString()},${options.period || 'unknown'},cost_efficiency,summary,${metrics.overallCostEfficiency},efficiency\n`;
      csv += `${new Date().toISOString()},${options.period || 'unknown'},total_cost,summary,${metrics.tokenCostAnalysis.totalCost},cost\n`;
      csv += `${new Date().toISOString()},${options.period || 'unknown'},total_tokens,summary,${metrics.tokenCostAnalysis.totalTokens},tokens\n`;
      
      // Add win rates
      Object.entries(metrics.winRates).forEach(([dimension, rate]) => {
        csv += `${new Date().toISOString()},${options.period || 'unknown'},${dimension},win_rate,${rate},rate\n`;
      });
      
      // Add intent performance
      Object.entries(metrics.intentPerformance).forEach(([intent, data]) => {
        csv += `${new Date().toISOString()},${options.period || 'unknown'},${intent}_win_rate,intent,${data.winRate},rate\n`;
        csv += `${new Date().toISOString()},${options.period || 'unknown'},${intent}_interactions,intent,${data.totalInteractions},count\n`;
        csv += `${new Date().toISOString()},${options.period || 'unknown'},${intent}_tokens,intent,${data.averageTokenUsage},tokens\n`;
        csv += `${new Date().toISOString()},${options.period || 'unknown'},${intent}_cost_efficiency,intent,${data.costEfficiency},efficiency\n`;
      });
      
      return csv;
    
    default:
      throw new Error(`Unsupported output format: ${format}. Supported formats: json, md, csv`);
  }
}

/**
 * Analytics command implementation
 */
export async function analyticsCommand(options = {}) {
  const repoPath = path.resolve(options.repo || '.');
  const dbPath = options.db || path.join(repoPath, '.pampax/pampax.sqlite');
  const json = options.json || false;
  const format = options.format || 'json';
  const outputPath = options.output || options.write;
  const includeDetails = options.details || false;
  
  // Parse time periods
  let fromDays = 30; // default for current period
  let compareDays = null; // optional comparison period
  
  if (options.from) {
    try {
      fromDays = parseTimePeriod(options.from);
    } catch (error) {
      console.error(`Error parsing time period: ${error.message}`);
      process.exit(1);
    }
  }
  
  if (options.compare) {
    try {
      compareDays = parseTimePeriod(options.compare);
    } catch (error) {
      console.error(`Error parsing comparison period: ${error.message}`);
      process.exit(1);
    }
  }
  
  // Progress setup
  const isTTY = process.stdout.isTTY && !json;
  const progress = createProgressRenderer({ tty: isTTY, json });
  
  try {
    // Initialize database and components
    progress.start('Initializing analytics system...');
    const db = new Database(dbPath);
    await db.initialize();
    const memoryOps = new MemoryOperations(db);
    const outcomeAnalyzer = new OutcomeAnalyzer(memoryOps);
    const performanceTracker = new PerformanceTracker({
      tokenCostPerMillion: options.tokenCost || 0.002,
      enableCache: !options.noCache
    });
    
    // Ensure database has data
    const hasData = await db.hasData();
    if (!hasData) {
      const error = 'No indexed data found. Please run "pampax index" first.';
      progress.error(error);
      process.exit(1);
    }
    
    progress.complete('Analytics system initialized');
    
    // Step 1: Extract outcome signals
    progress.start(`Extracting outcome signals from last ${fromDays} days...`);
    const signals = await outcomeAnalyzer.analyzeInteractions(fromDays);
    
    if (signals.length === 0) {
      progress.warn(`No interactions found in the last ${fromDays} days`);
      console.log('\nNo analytics data available.');
      console.log('Try:');
      console.log('  - Increasing the time period with --from');
      console.log('  - Running some searches to generate interaction data');
      process.exit(0);
    }
    
    progress.complete(`Extracted ${signals.length} outcome signals`);
    
    // Step 2: Define time period
    const now = new Date();
    const period = {
      start: new Date(now.getTime() - fromDays * 24 * 60 * 60 * 1000),
      end: now
    };
    
    // Step 3: Compute performance metrics
    progress.start('Computing performance metrics...');
    const metrics = await performanceTracker.trackMetrics(signals, period);
    progress.complete(`Computed metrics for ${metrics.totalInteractions} interactions`);
    
    // Step 4: Optional comparison analysis
    let comparison = null;
    if (compareDays) {
      progress.start(`Computing comparison with last ${compareDays} days...`);
      const comparePeriod = {
        start: new Date(now.getTime() - compareDays * 24 * 60 * 60 * 1000),
        end: new Date(now.getTime() - fromDays * 24 * 60 * 60 * 1000)
      };
      
      const compareSignals = await outcomeAnalyzer.analyzeInteractions(compareDays);
      if (compareSignals.length > 0) {
        const compareMetrics = await performanceTracker.trackMetrics(compareSignals, comparePeriod);
        comparison = await performanceTracker.generateComparisonReport(compareMetrics, metrics);
        progress.complete(`Comparison analysis completed`);
      } else {
        progress.warn('No data available for comparison period');
      }
    }
    
    // Step 5: Optional trend analysis
    let trends = null;
    if (options.trends && fromDays >= 7) {
      progress.start('Analyzing trends...');
      // Create multiple periods for trend analysis
      const trendPeriods = [];
      const trendMetrics = [];
      const periodLength = Math.max(1, Math.floor(fromDays / 5)); // Use 5 periods for trend analysis
      
      for (let i = 0; i < 5; i++) {
        const periodStart = now.getTime() - (i + 1) * periodLength * 24 * 60 * 60 * 1000;
        const periodEnd = now.getTime() - i * periodLength * 24 * 60 * 60 * 1000;
        
        const trendPeriod = {
          start: new Date(periodStart),
          end: new Date(periodEnd)
        };
        
        // For trend analysis, we'd ideally filter signals by period
        // For now, we'll use the same signals with synthetic time distribution
        const trendMetric = await performanceTracker.trackMetrics(
          signals.slice(Math.floor(i * signals.length / 5), Math.floor((i + 1) * signals.length / 5)),
          trendPeriod
        );
        
        trendPeriods.push(trendPeriod);
        trendMetrics.push(trendMetric);
      }
      
      trends = await performanceTracker.analyzeTrends(trendMetrics.reverse(), trendPeriods.reverse());
      progress.complete('Trend analysis completed');
    }
    
    // Step 6: Generate report
    progress.start('Generating analytics report...');
    const reportContent = generateAnalyticsReport(metrics, comparison, trends, {
      format,
      includeDetails,
      period: `${fromDays}d`
    });
    
    progress.complete('Analytics report generated');
    
    // Step 7: Output report
    if (outputPath) {
      const reportPath = path.resolve(outputPath);
      fs.writeFileSync(reportPath, reportContent);
      progress.complete(`Report saved to ${reportPath}`);
      
      if (!json) {
        console.log(`\n${chalk.green('✅')} Analytics report saved to ${chalk.cyan(reportPath)}`);
        console.log(`Format: ${format.toUpperCase()}`);
        console.log(`Period: Last ${fromDays} days`);
        console.log(`Interactions: ${signals.length}`);
        if (comparison) {
          console.log(`Comparison: Last ${compareDays} days`);
        }
      }
    } else {
      console.log('\n' + reportContent);
    }
    
    if (json) {
      const output = {
        success: true,
        fromDays,
        compareDays: compareDays || null,
        signals: signals.length,
        outputPath: outputPath || null,
        format,
        summary: {
          totalInteractions: metrics.totalInteractions,
          satisfactionRate: metrics.overallSatisfactionRate,
          costEfficiency: metrics.overallCostEfficiency,
          totalCost: metrics.tokenCostAnalysis.totalCost,
          totalTokens: metrics.tokenCostAnalysis.totalTokens
        }
      };
      
      console.log(JSON.stringify(output, null, 2));
    }
    
  } catch (error) {
    logger.error('Analytics generation failed', { error: error.message, repoPath });
    
    progress.error(`Analytics generation failed: ${error.message}`);
    
    if (json) {
      console.log(JSON.stringify({
        success: false,
        error: error.message,
        repoPath
      }, null, 2));
    } else {
      console.error('❌ Analytics generation failed:', error.message);
    }
    process.exit(1);
  }
}

/**
 * Configure the analytics command for CLI
 */
export function configureAnalyticsCommand(program) {
  program
    .command('analytics')
    .description('Generate comprehensive analytics and performance reports')
    .option('--repo <path>', 'Repository path', '.')
    .option('--db <path>', 'Database file path')
    .option('--from <period>', 'Analyze interactions from last N days (e.g., 30d, 7d, 1w)', '30d')
    .option('--compare <period>', 'Compare with previous period (e.g., 60d, 2w)')
    .option('--trends', 'Include trend analysis in report')
    .option('--output <path>', 'Write report to file')
    .option('--write <path>', 'Alias for --output')
    .option('--format <format>', 'Output format (json, md, csv)', 'json')
    .option('--details', 'Include detailed metrics in report')
    .option('--token-cost <cost>', 'Token cost per million tokens', '0.002')
    .option('--no-cache', 'Disable caching for faster but less efficient processing')
    .option('--json', 'Output in JSON format')
    .option('--verbose', 'Verbose output')
    .addHelpText('after', `\nExamples:\n  # Generate comprehensive analytics report\n  pampax analytics --from 30d --format md --output analytics.md\n\n  # Compare current performance with previous period\n  pampax analytics --from 7d --compare 30d --trends\n\n  # Generate CSV for data analysis\n  pampax analytics --format csv --output performance-data.csv\n\n  # Detailed JSON report with trend analysis\n  pampax analytics --details --trends --format json --output detailed-analytics.json`)
    .action(analyticsCommand);
}