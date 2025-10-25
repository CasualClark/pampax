#!/usr/bin/env node

import path from 'path';
import { Database } from '../../storage/database-simple.js';
import { getLogger } from '../../utils/structured-logger.js';

const logger = getLogger('cli-search');
import { createProgressRenderer } from '../progress/renderer.js';
import { enhancedReciprocalRankFusion, getSeedMixConfig } from '../../search/hybrid.js';
import { intentClassifier } from '../../intent/index.js';
import { policyGate } from '../../policy/policy-gate.js';
import { PackingProfileManager, MODEL_PROFILES } from '../../tokenization/packing-profiles.js';
import { createTokenizer } from '../../tokenization/tokenizer-factory.js';
import fs from 'fs';



/**
 * Load token budget from session config
 */
function loadTokenBudget(repoPath, model) {
  try {
    const budgetFile = path.join(repoPath, '.pampax', 'token-budget.json');
    if (fs.existsSync(budgetFile)) {
      const config = JSON.parse(fs.readFileSync(budgetFile, 'utf8'));
      if (config.model === model || !config.model) {
        return config.budget;
      }
    }
  } catch (error) {
    logger.debug('Failed to load token budget', { error: error.message });
  }
  return null;
}

/**
 * Calculate token usage for search results
 */
function calculateTokenUsage(results, tokenizer) {
  let totalTokens = 0;
  const itemBreakdown = [];

  results.forEach((result, index) => {
    const itemTokens = tokenizer.countTokens(
      JSON.stringify({
        path: result.path,
        content: result.content || '',
        metadata: result.metadata || {}
      })
    );
    
    totalTokens += itemTokens;
    itemBreakdown.push({
      index: index + 1,
      path: result.path,
      tokens: itemTokens
    });
  });

  return {
    total: totalTokens,
    breakdown: itemBreakdown,
    average: Math.round(totalTokens / results.length)
  };
}

/**
 * Build scope filters from command line options
 */
export function buildScopeFiltersFromOptions(options, repoPath) {
  const scopeFilters = {};
  let pack = null;

  // Handle context packs
  if (options.pack) {
    try {
      const packPath = path.resolve(repoPath, options.pack);
      if (fs.existsSync(packPath)) {
        pack = JSON.parse(fs.readFileSync(packPath, 'utf8'));
        if (pack.scope) {
          Object.assign(scopeFilters, pack.scope);
        }
      }
    } catch (error) {
      logger.warn('Failed to load context pack', { pack: options.pack, error: error.message });
    }
  }

  // Apply CLI options with normalization
  if (options.path_glob) {
    scopeFilters.path_glob = Array.isArray(options.path_glob) 
      ? options.path_glob 
      : [options.path_glob];
  }

  if (options.tags) {
    scopeFilters.tags = Array.isArray(options.tags) 
      ? options.tags.map(tag => tag.toLowerCase())
      : [options.tags.toLowerCase()];
  }

  if (options.lang) {
    scopeFilters.lang = Array.isArray(options.lang)
      ? options.lang.map(lang => lang.toLowerCase())
      : [options.lang.toLowerCase()];
  }

  if (options.exclude) {
    scopeFilters.exclude = options.exclude;
  }

  // Handle boolean conversions
  if (options.hybrid !== undefined) {
    scopeFilters.hybrid = options.hybrid === 'on' || options.hybrid === true;
  }

  if (options.bm25 !== undefined) {
    scopeFilters.bm25 = options.bm25 === 'on' || options.bm25 === true;
  }

  if (options.reranker) {
    // Validate reranker value - only allow known providers
    const validRerankers = ['transformers', 'openai', 'cohere', 'rrf', 'off'];
    scopeFilters.reranker = validRerankers.includes(options.reranker) ? options.reranker : 'off';
  }

  // Set default values for missing options
  if (scopeFilters.reranker === undefined) {
    scopeFilters.reranker = 'off';
  }
  if (scopeFilters.hybrid === undefined) {
    scopeFilters.hybrid = true;
  }
  if (scopeFilters.bm25 === undefined) {
    scopeFilters.bm25 = true;
  }

  return { scope: scopeFilters, pack };
}

/**
 * Enhanced search command with FTS support
 */
export async function searchCommand(query, options = {}) {
  const repoPath = path.resolve(options.repo || '.');
  const limit = parseInt(options.k || options.limit || '10');
  const json = options.json || false;
  const verbose = options.verbose || false;
  const dbPath = options.db || path.join(repoPath, '.pampax/pampax.sqlite');
  
  // Token-aware options
  const targetModel = options.targetModel || options.model || 'default';
  const tokenReport = options.tokenReport || false;
  const tokenBudget = options.tokenBudget ? parseInt(options.tokenBudget) : null;
  
  // Intent-aware options
  const showIntent = options.intent || false;
  const showPolicy = options.policy || false;
  const explainIntent = options.explainIntent || false;
  const forceIntent = options.forceIntent || null;

  // Graph expansion options
  const callers = options.callers ? parseInt(options.callers) : 0;
  const callees = options.callees ? parseInt(options.callees) : 0;

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

    // Classify intent for optimized search
    let intent = intentClassifier.classify(query);
    
    // Handle forced intent override
    if (forceIntent) {
      const validIntents = ['symbol', 'config', 'api', 'incident', 'search'];
      if (!validIntents.includes(forceIntent)) {
        const error = `Invalid intent type: ${forceIntent}. Valid types: ${validIntents.join(', ')}`;
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
      
      // Override intent while preserving other properties
      intent = {
        ...intent,
        intent: forceIntent,
        confidence: 1.0 // Forced intent gets maximum confidence
      };
      logger.debug('Intent forced by user', { forcedIntent: forceIntent });
    }
    
    logger.debug('Search intent classified', { intent: intent.intent, confidence: intent.confidence });

    // Initialize tokenizer for token calculations
    const tokenizer = createTokenizer(targetModel);
    
    // Load session token budget or use command line option
    const sessionBudget = loadTokenBudget(repoPath, targetModel) || tokenBudget;
    const effectiveBudget = sessionBudget || 4000;
    
    // Get search context for policy evaluation
    const searchContext = {
      repo: path.basename(repoPath),
      queryLength: query.length,
      budget: effectiveBudget,
      model: targetModel,
      language: options.lang?.[0]
    };

    // Evaluate policy for intent-aware search
    const policy = policyGate.evaluate(intent, searchContext);
    logger.debug('Search policy evaluated', { maxDepth: policy.maxDepth, earlyStopThreshold: policy.earlyStopThreshold });

    // Perform search with intent-aware optimization
    const startTime = Date.now();
    
    // Get seed mix configuration for this intent and policy
    const seedConfig = getSeedMixConfig(intent, policy);
    
    // Perform multi-source search (simulated here - in real implementation would query different sources)
    const searchResults = await db.search(query, {
      limit: Math.max(limit, seedConfig.earlyStopThreshold * 2), // Get more results for better fusion
      includeContent: options.includeContent || false,
      filters: {
        pathGlob: options.path_glob,
        tags: options.tags,
        lang: options.lang
      }
    });

    // Apply enhanced RRF with intent-aware weighting
    let results;
    if (options.useEnhancedSearch !== false) {
      // For demonstration, split results into different sources
      // In a real implementation, these would come from different search engines
      const midPoint = Math.floor(searchResults.length / 2);
      const vectorResults = searchResults.slice(0, midPoint);
      const bm25Results = searchResults.slice(midPoint);
      
      results = enhancedReciprocalRankFusion({
        vectorResults,
        bm25Results,
        intent,
        policy,
        limit
      });
    } else {
      // Fallback to original search results
      results = searchResults.slice(0, limit);
    }

    // Apply graph expansion if requested
    let graphExpansion = null;
    if (callers > 0 || callees > 0) {
      try {
        // Import graph traversal engine
        const { BFSTraversalEngine } = await import('../../graph/graph-traversal.js');
        const traversalEngine = new BFSTraversalEngine(db, effectiveBudget);
        
        // Extract symbols from search results
        const symbolIds = results
          .filter(result => result.metadata?.spanId)
          .map(result => result.metadata.spanId);
        
        if (symbolIds.length > 0) {
          // Determine expansion depth
          const maxDepth = Math.max(callers, callees);
          const edgeTypes = [];
          
          if (callers > 0) edgeTypes.push('call');
          if (callees > 0) edgeTypes.push('call'); // For simplicity, use 'call' for both directions
          
          // Perform graph expansion
          const expansion = {
            query: `Graph expansion for search: ${query}`,
            start_symbols: symbolIds,
            max_depth: maxDepth,
            edge_types: edgeTypes,
            expansion_strategy: 'quality-first',
            token_budget: Math.floor(effectiveBudget * 0.3) // Use 30% of budget for expansion
          };
          
          graphExpansion = await traversalEngine.expandGraph(expansion);
          
          if (verbose && !json) {
            console.log(`\n${chalk.blue('=== Graph Expansion ===')}`);
            console.log(`Expanded ${symbolIds.length} symbols to ${graphExpansion.visited_nodes.size} nodes`);
            console.log(`Found ${graphExpansion.edges.length} additional relationships`);
            console.log(`Expansion depth: ${graphExpansion.expansion_depth}/${maxDepth}`);
          }
        }
      } catch (error) {
        logger.warn('Graph expansion failed', { error: error.message });
        if (verbose && !json) {
          console.log(`\n${chalk.yellow('⚠️  Graph expansion failed:')} ${error.message}`);
        }
      }
    }

    const duration = Date.now() - startTime;

    progress.complete(`Found ${results.length} results in ${duration}ms (intent: ${intent.intent}, confidence: ${(intent.confidence * 100).toFixed(1)}%)`);

    // Show intent explanation if requested
    if (explainIntent && !json) {
      console.log(`\n${chalk.blue('=== Intent Analysis ===')}`);
      console.log(`Detected Intent: ${chalk.cyan(intent.intent)} (${chalk.yellow((intent.confidence * 100).toFixed(1) + '%')})`);
      
      if (intent.entities.length > 0) {
        console.log(`\n${chalk.green('Entities Found:')}`);
        intent.entities.forEach(entity => {
          console.log(`  • ${entity.type}: "${chalk.white(entity.value)}" (position: ${entity.position})`);
        });
      }
      
      if (intent.suggestedPolicies.length > 0) {
        console.log(`\n${chalk.green('Suggested Policies:')}`);
        intent.suggestedPolicies.forEach(policy => {
          console.log(`  • ${policy}`);
        });
      }
      
      if (forceIntent) {
        console.log(`\n${chalk.yellow('⚠ Intent was forced by user override')}`);
      }
      console.log('');
    }

    // Show policy details if requested
    if (showPolicy && !json) {
      console.log(`\n${chalk.blue('=== Applied Policy ===')}`);
      console.log(`Max Depth: ${chalk.cyan(policy.maxDepth)}`);
      console.log(`Early Stop Threshold: ${chalk.cyan(policy.earlyStopThreshold)}`);
      console.log(`Include Symbols: ${chalk.cyan(policy.includeSymbols)}`);
      console.log(`Include Files: ${chalk.cyan(policy.includeFiles)}`);
      console.log(`Include Content: ${chalk.cyan(policy.includeContent)}`);
      
      console.log(`\n${chalk.green('Seed Weights:')}`);
      Object.entries(policy.seedWeights).forEach(([key, weight]) => {
        console.log(`  • ${key}: ${chalk.yellow(weight.toFixed(2))}`);
      });
      console.log('');
    }

    // Show intent summary if requested (but not full explanation)
    if (showIntent && !explainIntent && !json) {
      console.log(`\n${chalk.blue('Intent:')} ${chalk.cyan(intent.intent)} (${chalk.yellow((intent.confidence * 100).toFixed(1) + '%')})`);
      if (intent.entities.length > 0) {
        console.log(`${chalk.blue('Entities:')} ${intent.entities.map(e => `${e.type}:"${e.value}"`).join(', ')}`);
      }
      console.log('');
    }

    // Calculate token usage if requested
    let tokenUsage = null;
    if (tokenReport) {
      tokenUsage = calculateTokenUsage(results, tokenizer);
    }

    // Format and output results
    if (json) {
      const output = {
        success: true,
        query,
        model: targetModel,
        intent: showIntent || explainIntent ? {
          type: intent.intent,
          confidence: intent.confidence,
          entities: intent.entities,
          suggestedPolicies: intent.suggestedPolicies,
          forced: forceIntent !== null
        } : undefined,
        policy: showPolicy ? {
          maxDepth: policy.maxDepth,
          earlyStopThreshold: policy.earlyStopThreshold,
          includeSymbols: policy.includeSymbols,
          includeFiles: policy.includeFiles,
          includeContent: policy.includeContent,
          seedWeights: policy.seedWeights
        } : undefined,
        optimization: {
          seedConfig: {
            vectorWeight: seedConfig.vectorWeight,
            bm25Weight: seedConfig.bm25Weight,
            memoryWeight: seedConfig.memoryWeight,
            symbolWeight: seedConfig.symbolWeight,
            maxDepth: seedConfig.maxDepth,
            earlyStopThreshold: seedConfig.earlyStopThreshold
          },
          useEnhancedSearch: options.useEnhancedSearch !== false
        },
        results: results.map(result => ({
          id: result.id,
          path: result.path,
          content: result.content,
          score: result.score,
          metadata: result.metadata,
          rankInfo: {
            vectorRank: result.vectorRank,
            bm25Rank: result.bm25Rank,
            memoryRank: result.memoryRank,
            symbolRank: result.symbolRank
          }
        })),
        graphExpansion: graphExpansion ? {
          callers: callers,
          callees: callees,
          visitedNodes: Array.from(graphExpansion.visited_nodes),
          edgesFound: graphExpansion.edges.length,
          expansionDepth: graphExpansion.expansion_depth,
          tokensUsed: graphExpansion.tokens_used,
          truncated: graphExpansion.truncated
        } : undefined,
        totalResults: results.length,
        durationMs: duration,
        databasePath: dbPath
      };

      // Add token report if requested
      if (tokenReport && tokenUsage) {
        output.tokenReport = {
          budget: effectiveBudget,
          estimated: tokenUsage.total,
          actual: tokenUsage.total,
          model: targetModel,
          usagePercentage: Math.round((tokenUsage.total / effectiveBudget) * 100),
          averageTokensPerResult: tokenUsage.average,
          contextSize: tokenizer.getContextSize(),
          breakdown: verbose ? tokenUsage.breakdown : undefined
        };
      }

      console.log(JSON.stringify(output, null, 2));
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

      // Show token report if requested
      if (tokenReport && tokenUsage) {
        const usagePercentage = Math.round((tokenUsage.total / effectiveBudget) * 100);
        const usageColor = usagePercentage > 90 ? chalk.red : usagePercentage > 70 ? chalk.yellow : chalk.green;
        
        console.log(`\n${chalk.blue('=== Token Usage Report ===')}`);
        console.log(`Model: ${chalk.yellow(targetModel)}`);
        console.log(`Budget: ${chalk.cyan(effectiveBudget.toLocaleString())} tokens`);
        console.log(`Used: ${usageColor(tokenUsage.total.toLocaleString())} tokens (${usagePercentage}%)`);
        console.log(`Average per result: ${chalk.yellow(tokenUsage.average.toLocaleString())} tokens`);
        console.log(`Context Size: ${chalk.blue(tokenizer.getContextSize().toLocaleString())} tokens`);
        
        if (usagePercentage > 90) {
          console.log(`${chalk.red('⚠️  Warning: High token usage! Consider reducing results or budget.')}`);
        } else if (usagePercentage < 20) {
          console.log(`${chalk.blue('💡 Tip: Low usage - you could increase results for more context.')}`);
        }
        
        if (verbose && tokenUsage.breakdown.length > 0) {
          console.log(`\n${chalk.blue('Token Breakdown:')}`);
          tokenUsage.breakdown.forEach(item => {
            const percentage = Math.round((item.tokens / tokenUsage.total) * 100);
            console.log(`  ${item.index}. ${chalk.cyan(item.path)}: ${chalk.yellow(item.tokens)} tokens (${percentage}%)`);
          });
        }
      }

      if (verbose) {
        console.log(`\nSearch completed in ${duration}ms`);
        console.log(`Database: ${dbPath}`);
        if (sessionBudget) {
          console.log(`Session Budget: ${chalk.cyan(sessionBudget.toLocaleString())} tokens`);
        }
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
    
    const results = await db.search(query, {
      limit: parseInt(options.k || '10'),
      includeContent: true,
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
    .description('Search indexed code with FTS support and intent-aware optimization')
    .option('--repo <path>', 'Repository path', '.')
    .option('--db <path>', 'Database file path')
    .option('-k, --limit <num>', 'Maximum number of results', '10')
    .option('--path_glob <pattern...>', 'Limit results to files matching glob pattern(s)')
    .option('--tags <tag...>', 'Filter results by tags')
    .option('--lang <language...>', 'Filter results by language')
    .option('--include-content', 'Include content in results')
    .option('--json', 'Output in JSON format')
    .option('--verbose', 'Verbose output')
    .option('--target-model <model>', 'Target model for tokenization (gpt-4, gpt-3.5-turbo, claude-3, etc.)', 'default')
    .option('--token-budget <num>', 'Token budget for search optimization')
    .option('--token-report', 'Show detailed token usage information')
    .option('--no-enhanced-search', 'Disable intent-aware search optimization')
    .option('--intent', 'Show classified intent information')
    .option('--policy', 'Show applied policy configuration')
    .option('--explain-intent', 'Show detailed intent classification explanation')
    .option('--force-intent <type>', 'Force specific intent type (symbol|config|api|incident|search)')
    .option('--callers <num>', 'Include symbol callers in results (depth 1-3)', '0')
    .option('--callees <num>', 'Include symbol callees in results (depth 1-3)', '0')
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