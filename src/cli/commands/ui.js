#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { Database } from '../../storage/database-simple.js';
// Simple logger fallback
const logger = {
  error: (message, meta) => console.error(`ERROR: ${message}`, meta || ''),
  info: (message, meta) => console.log(`INFO: ${message}`, meta || ''),
  warn: (message, meta) => console.warn(`WARN: ${message}`, meta || ''),
  debug: (message, meta) => process.env.DEBUG && console.log(`DEBUG: ${message}`, meta || '')
};
import { createProgressRenderer } from '../progress/renderer.js';
import chalk from 'chalk';

/**
 * Simple terminal UI for Pampax demo and status visualization
 */
export async function uiCommand(options = {}) {
  const repoPath = path.resolve(options.repo || '.');
  const dbPath = options.db || path.join(repoPath, '.pampax/pampax.sqlite');
  const mode = options.mode || 'demo';
  const json = options.json || false;

  try {
    const db = new Database(dbPath);

    switch (mode) {
      case 'demo':
        await runDemoMode(db, repoPath, { json });
        break;
      case 'status':
        await runStatusMode(db, repoPath, { json });
        break;
      case 'interactive':
        await runInteractiveMode(db, repoPath);
        break;
      default:
        console.error(`Unknown mode: ${mode}. Available: demo, status, interactive`);
        process.exit(1);
    }

  } catch (error) {
    logger.error('UI command failed', { error: error.message, mode, dbPath });
    console.error('❌ UI command failed:', error.message);
    process.exit(1);
  }
}

/**
 * Demo mode - showcase Pampax capabilities
 */
async function runDemoMode(db, repoPath, options = {}) {
  console.log(chalk.blue.bold('🚀 Pampax CLI Demo'));
  console.log(chalk.gray('='.repeat(50)));

  try {
    // Check database status
    const hasData = await db.hasData();
    
    if (!hasData) {
      console.log(chalk.yellow('⚠️  No indexed data found.'));
      console.log(chalk.gray('Run "pampax index" first to index your project.'));
      return;
    }

    // Get statistics
    const stats = await db.getStatistics();
    
    console.log(chalk.green('\n📊 Project Statistics:'));
    console.log(`  Files: ${chalk.cyan(stats.fileCount)}`);
    console.log(`  Spans: ${chalk.cyan(stats.spanCount)}`);
    console.log(`  Chunks: ${chalk.cyan(stats.chunkCount)}`);
    
    if (stats.languages) {
      console.log(chalk.green('\n🔤 Languages:'));
      Object.entries(stats.languages)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 10)
        .forEach(([lang, count]) => {
          console.log(`  ${lang}: ${chalk.cyan(count)} chunks`);
        });
    }

    // Demo search
    console.log(chalk.green('\n🔍 Demo Search:'));
    const demoQueries = [
      'function',
      'class',
      'import',
      'export'
    ];

    for (const query of demoQueries.slice(0, 2)) {
      console.log(chalk.gray(`\nSearching for: "${query}"`));
      const results = await db.search(query, { limit: 3 });
      
      if (results.length > 0) {
        results.forEach((result, index) => {
          console.log(`  ${index + 1}. ${chalk.cyan(result.path)}`);
          if (result.metadata?.spanName) {
            console.log(`     ${chalk.yellow(result.metadata.spanName)}`);
          }
        });
      } else {
        console.log(chalk.gray('  No results found'));
      }
    }

    console.log(chalk.green('\n✅ Demo completed!'));
    console.log(chalk.gray('Try these commands:'));
    console.log(chalk.gray('  pampax search "your query"'));
    console.log(chalk.gray('  pampax ui --mode status'));
    console.log(chalk.gray('  pampax ui --mode interactive'));

  } catch (error) {
    console.error(chalk.red('Demo failed:'), error.message);
  }
}

/**
 * Status mode - show detailed project status
 */
async function runStatusMode(db, repoPath, options = {}) {
  console.log(chalk.blue.bold('📈 Pampax Status'));
  console.log(chalk.gray('='.repeat(50)));

  try {
    const hasData = await db.hasData();
    
    if (!hasData) {
      console.log(chalk.red('❌ No indexed data'));
      console.log(chalk.gray('Repository:'), repoPath);
      console.log(chalk.gray('Database:'), dbPath);
      return;
    }

    // Database info
    const stats = await db.getStatistics();
    const dbInfo = await db.getDatabaseInfo();

    console.log(chalk.green('\n🗄️  Database Information:'));
    console.log(`  Path: ${chalk.cyan(dbPath)}`);
    console.log(`  Version: ${chalk.cyan(dbInfo.version)}`);
    console.log(`  Size: ${chalk.cyan(formatBytes(dbInfo.size))}`);
    console.log(`  Last Updated: ${chalk.cyan(new Date(dbInfo.lastUpdated).toLocaleString())}`);

    // Project statistics
    console.log(chalk.green('\n📊 Project Statistics:'));
    console.log(`  Repository: ${chalk.cyan(repoPath)}`);
    console.log(`  Files Indexed: ${chalk.cyan(stats.fileCount)}`);
    console.log(`  Code Spans: ${chalk.cyan(stats.spanCount)}`);
    console.log(`  Searchable Chunks: ${chalk.cyan(stats.chunkCount)}`);

    // Language breakdown
    if (stats.languages && Object.keys(stats.languages).length > 0) {
      console.log(chalk.green('\n🔤 Language Distribution:'));
      
      const total = Object.values(stats.languages).reduce((sum, count) => sum + count, 0);
      const sorted = Object.entries(stats.languages)
        .sort(([,a], [,b]) => b - a);

      sorted.forEach(([lang, count]) => {
        const percentage = ((count / total) * 100).toFixed(1);
        const bar = '█'.repeat(Math.round(percentage / 2));
        console.log(`  ${lang.padEnd(12)} ${chalk.cyan(count.toString().padStart(6))} ${chalk.gray(bar)} ${percentage}%`);
      });
    }

    // Recent activity
    console.log(chalk.green('\n🕒 Recent Activity:'));
    const recentFiles = await db.getRecentFiles(5);
    
    if (recentFiles.length > 0) {
      recentFiles.forEach((file, index) => {
        const date = new Date(file.modifiedTime).toLocaleDateString();
        console.log(`  ${index + 1}. ${chalk.cyan(file.path)} ${chalk.gray(`(${date})`)}`);
      });
    } else {
      console.log(chalk.gray('  No recent activity'));
    }

    // Search performance
    console.log(chalk.green('\n⚡ Search Performance:'));
    const searchStats = await db.getSearchStatistics();
    
    if (searchStats) {
      console.log(`  Total Searches: ${chalk.cyan(searchStats.totalSearches || 0)}`);
      console.log(`  Avg Response Time: ${chalk.cyan(`${(searchStats.avgResponseTime || 0).toFixed(2)}ms`)}`);
      console.log(`  Cache Hit Rate: ${chalk.cyan(`${(searchStats.cacheHitRate || 0).toFixed(1)}%`)}`);
    } else {
      console.log(chalk.gray('  No search statistics available'));
    }

    if (options.json) {
      console.log(chalk.green('\n📄 JSON Export:'));
      console.log(JSON.stringify({
        database: dbInfo,
        statistics: stats,
        recentFiles,
        searchStats
      }, null, 2));
    }

  } catch (error) {
    console.error(chalk.red('Status check failed:'), error.message);
  }
}

/**
 * Interactive mode - simple interactive search interface
 */
async function runInteractiveMode(db, repoPath) {
  const readline = await import('readline');
  
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: chalk.blue('pampax> ')
  });

  console.log(chalk.blue.bold('🔍 Pampax Interactive Search'));
  console.log(chalk.gray('Type your search queries or "help" for commands. Type "exit" to quit.'));
  console.log(chalk.gray('='.repeat(50)));

  rl.prompt();

  rl.on('line', async (input) => {
    const command = input.trim().toLowerCase();
    
    if (command === 'exit' || command === 'quit') {
      rl.close();
      return;
    }

    if (command === 'help') {
      console.log(chalk.green('\nAvailable commands:'));
      console.log('  help     - Show this help');
      console.log('  status   - Show database status');
      console.log('  stats    - Show detailed statistics');
      console.log('  exit     - Exit interactive mode');
      console.log('  Any other text will be used as a search query\n');
      rl.prompt();
      return;
    }

    if (command === 'status') {
      await runStatusMode(db, repoPath);
      rl.prompt();
      return;
    }

    if (command === 'stats') {
      const stats = await db.getStatistics();
      console.log(chalk.green('\n📊 Statistics:'));
      console.log(JSON.stringify(stats, null, 2));
      console.log();
      rl.prompt();
      return;
    }

    if (command === '') {
      rl.prompt();
      return;
    }

    // Perform search
    try {
      console.log(chalk.gray(`\nSearching for: "${input}"`));
      const startTime = Date.now();
      const results = await db.search(input, { limit: 10 });
      const duration = Date.now() - startTime;

      if (results.length === 0) {
        console.log(chalk.yellow('No results found.'));
      } else {
        console.log(chalk.green(`Found ${results.length} results in ${duration}ms:\n`));
        
        results.forEach((result, index) => {
          console.log(`${chalk.cyan((index + 1).toString())}. ${result.path}`);
          if (result.metadata?.spanName) {
            console.log(`   ${chalk.yellow(result.metadata.spanName)} (${result.metadata.spanKind})`);
          }
          if (result.score !== undefined) {
            console.log(`   Score: ${result.score.toFixed(3)}`);
          }
          console.log();
        });
      }
    } catch (error) {
      console.error(chalk.red('Search failed:'), error.message);
    }

    rl.prompt();
  });

  rl.on('close', () => {
    console.log(chalk.green('\n👋 Goodbye!'));
    process.exit(0);
  });
}

/**
 * Format bytes to human readable format
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export function configureUICommand(program) {
  program
    .command('ui')
    .description('Interactive UI and status visualization')
    .option('--repo <path>', 'Repository path', '.')
    .option('--db <path>', 'Database file path')
    .option('--mode <mode>', 'UI mode (demo|status|interactive)', 'demo')
    .option('--json', 'Output status in JSON format')
    .action(uiCommand);
}