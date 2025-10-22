#!/usr/bin/env node

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

/**
 * Enhanced search command with FTS support
 */
export async function searchCommand(query, options = {}) {
  const repoPath = path.resolve(options.repo || '.');
  const limit = parseInt(options.k || options.limit || '10');
  const json = options.json || false;
  const verbose = options.verbose || false;
  const dbPath = options.db || path.join(repoPath, '.pampax/pampax.sqlite');

  // Progress setup
  const isTTY = process.stdout.isTTY && !json;
  const progress = createProgressRenderer({ tty: isTTY, json });

  try {
    // Initialize database
    const db = new Database(dbPath);

    // Check if database exists and has data
    const hasData = await db.hasData();
    if (!hasData) {
      const error = 'No indexed data found. Please run "pampax index" first.';
      
      if (json) {
        console.log(JSON.stringify({
          success: false,
          error,
          query,
          databasePath: dbPath
        }, null, 2));
      } else {
        progress.error(error);
      }
      process.exit(1);
    }

    progress.start(`Searching for: "${query}"`);

    // Perform search
    const startTime = Date.now();
    const results = await db.search(query, {
      limit,
      includeContent: options.includeContent || false,
      filters: {
        pathGlob: options.path_glob,
        tags: options.tags,
        lang: options.lang
      }
    });
    const duration = Date.now() - startTime;

    progress.complete(`Found ${results.length} results in ${duration}ms`);

    // Format and output results
    if (json) {
      console.log(JSON.stringify({
        success: true,
        query,
        results: results.map(result => ({
          id: result.id,
          path: result.path,
          content: result.content,
          score: result.score,
          metadata: result.metadata
        })),
        totalResults: results.length,
        durationMs: duration,
        databasePath: dbPath
      }, null, 2));
    } else {
      if (results.length === 0) {
        console.log(`No results found for: "${query}"`);
        console.log('Suggestions:');
        console.log('  - Try more general terms');
        console.log('  - Check spelling');
        console.log('  - Use different keywords');
        return;
      }

      console.log(`\nFound ${results.length} results for: "${query}"\n`);

      results.forEach((result, index) => {
        console.log(`${index + 1}. ${chalk.cyan(result.path)}`);
        console.log(`   Score: ${chalk.green(result.score.toFixed(3))}`);
        
        if (result.metadata?.spanName) {
          console.log(`   Symbol: ${chalk.yellow(result.metadata.spanName)} (${result.metadata.spanKind})`);
        }
        
        if (result.metadata?.lang) {
          console.log(`   Language: ${chalk.blue(result.metadata.lang)}`);
        }

        // Show content preview
        if (options.includeContent && result.content) {
          const preview = result.content.substring(0, 200);
          console.log(`   Preview: ${chalk.gray(preview)}${result.content.length > 200 ? '...' : ''}`);
        }

        console.log('');
      });

      if (verbose) {
        console.log(`Search completed in ${duration}ms`);
        console.log(`Database: ${dbPath}`);
      }
    }

  } catch (error) {
    logger.error('Search failed', { error: error.message, query, dbPath });
    
    progress.error(`Search failed: ${error.message}`);
    
    if (json) {
      console.log(JSON.stringify({
        success: false,
        error: error.message,
        query,
        databasePath: dbPath
      }, null, 2));
    } else {
      console.error('❌ Search failed:', error.message);
    }
    process.exit(1);
  }
}

/**
 * FTS-specific search with advanced options
 */
export async function ftsSearchCommand(query, options = {}) {
  const repoPath = path.resolve(options.repo || '.');
  const dbPath = options.db || path.join(repoPath, '.pampax/pampax.sqlite');
  const json = options.json || false;

  try {
    const db = new Database(dbPath);
    
    const results = await db.ftsSearch(query, {
      limit: parseInt(options.k || '10'),
      offset: parseInt(options.offset || '0'),
      orderBy: options.orderBy || 'rank',
      filters: {
        pathGlob: options.path_glob,
        lang: options.lang,
        spanKind: options.spanKind
      }
    });

    if (json) {
      console.log(JSON.stringify({
        success: true,
        query,
        results,
        totalResults: results.length
      }, null, 2));
    } else {
      console.log(`FTS Results for "${query}":\n`);
      results.forEach((result, index) => {
        console.log(`${index + 1}. ${result.path}`);
        console.log(`   Rank: ${result.rank}`);
        console.log(`   Snippet: ${result.snippet}`);
        console.log('');
      });
    }

  } catch (error) {
    console.error('FTS search failed:', error.message);
    process.exit(1);
  }
}

export function configureSearchCommand(program) {
  const searchCmd = program
    .command('search <query>')
    .description('Search indexed code with FTS support')
    .option('--repo <path>', 'Repository path', '.')
    .option('--db <path>', 'Database file path')
    .option('-k, --limit <num>', 'Maximum number of results', '10')
    .option('--path_glob <pattern...>', 'Limit results to files matching glob pattern(s)')
    .option('--tags <tag...>', 'Filter results by tags')
    .option('--lang <language...>', 'Filter results by language')
    .option('--include-content', 'Include content in results')
    .option('--json', 'Output in JSON format')
    .option('--verbose', 'Verbose output')
    .action(searchCommand);

  // Add FTS subcommand
  searchCmd
    .command('fts <query>')
    .description('Full-text search with advanced options')
    .option('--repo <path>', 'Repository path', '.')
    .option('--db <path>', 'Database file path')
    .option('-k, --limit <num>', 'Maximum number of results', '10')
    .option('--offset <num>', 'Results offset', '0')
    .option('--order-by <field>', 'Order by field (rank, path)', 'rank')
    .option('--path_glob <pattern...>', 'Limit results to files matching glob pattern(s)')
    .option('--lang <language...>', 'Filter results by language')
    .option('--span-kind <kind...>', 'Filter by span kind')
    .option('--json', 'Output in JSON format')
    .action(ftsSearchCommand);
}

// Import chalk for colored output
import chalk from 'chalk';