#!/usr/bin/env node

import path from 'path';
import { searchCode } from '../../service.js';
import { buildScopeFiltersFromOptions } from './search.js';
import { ContextAssembler } from '../../context/assembler.js';
import { MarkdownGeneratorFactory } from '../../context/markdown-generator.js';
import { fitToBudget } from '../../progressive/token-counter.js';
import { Database } from '../../storage/database-simple.js';
import chalk from 'chalk';
import { getLogger } from '../../utils/structured-logger.js';

const logger = getLogger('cli-assemble');

/**
 * Assemble command implementation - combines search with budgeting and markdown output
 */
import { Command } from 'commander';

async function assembleCommand(query, options = {}) {
  const repoPath = path.resolve(options.repo || '.');
  const budget = options.budget ? parseInt(options.budget) : 3000;
  const markdown = options.md || false;
  const limit = parseInt(options.limit || '20');
  const enhanced = options.enhanced || false;
  
  const timed = logger.timed('assemble_command', `Assembling results for query: "${query}"`, {
    query,
    budget,
    markdown,
    limit,
    enhanced,
    repoPath
  });
  
  try {
    console.log(`${chalk.blue('🔍 Assembling')} results for: "${chalk.cyan(query)}"`);
    console.log(`${chalk.blue('💰 Budget:')} ${chalk.yellow(budget.toLocaleString())} tokens`);
    console.log(`${chalk.blue('📝 Format:')} ${markdown ? 'Markdown' : 'Plain text'}`);
    console.log(`${chalk.blue('⚡ Mode:')} ${enhanced ? 'Enhanced' : 'Standard'}`);
    console.log('');

    // Build scope filters from options
    const { scope: scopeFilters, pack } = buildScopeFiltersFromOptions(options, repoPath);
    if (pack) {
      console.log(
        `Using context pack: ${pack.name || pack.key}` +
        (pack.description ? ` – ${pack.description}` : '')
      );
    }

    let result;
    
    if (enhanced) {
      // Use enhanced assembler with full functionality
      result = await performEnhancedAssembly(query, options, repoPath, budget, limit, scopeFilters);
    } else {
      // Use standard assembly
      result = await performStandardAssembly(query, options, repoPath, budget, limit, scopeFilters);
    }

    if (!result.success) {
      logger.error('assembly_failed', 'Assembly operation failed', { 
        error: result.message,
        query,
        repoPath 
      });
      return result;
    }

    // Generate output
    await generateOutput(result, query, budget, markdown);

    timed.end('Assembly completed successfully', {
      results_count: result.results?.length || 0,
      total_tokens: result.totalTokens || 0
    });

    return result;

  } catch (error) {
    timed.end('Assembly failed', {
      error: error.message,
      stack: error.stack
    });
    
    logger.error('assembly_exception', 'Unhandled exception in assemble command', {
      error: error.message,
      stack: error.stack,
      query,
      options
    });
    
    throw error;
  }
}

/**
 * Perform enhanced assembly using ContextAssembler
 */
async function performEnhancedAssembly(query, options, repoPath, budget, limit, scopeFilters) {
  const timed = logger.timed('enhanced_assembly', 'Starting enhanced context assembly');
  
  try {
    // Initialize database
    const db = new Database(repoPath);
    
    // Create context assembler
    const assembler = new ContextAssembler(db, {
      graphEnabled: options.graph || false,
      graphOptions: {
        maxDepth: options.graphDepth || 2,
        maxNodes: options.graphNodes || 50
      }
    });

    // Assemble with explanation
    const result = await assembler.assembleWithExplanation(query, {
      budget,
      limit,
      scope: scopeFilters,
      repo: repoPath,
      intent: options.intent,
      include: ['code', 'memory']
    });

    timed.end('Enhanced assembly completed', {
      results_count: result.results?.length || 0,
      total_tokens: result.totalTokens || 0,
      explanation: result.explanation ? 'present' : 'missing'
    });

    return {
      success: true,
      results: result.results || [],
      totalTokens: result.totalTokens || 0,
      explanation: result.explanation,
      query
    };

  } catch (error) {
    timed.end('Enhanced assembly failed', {
      error: error.message
    });
    
    logger.error('enhanced_assembly_failed', 'Enhanced assembly failed', { 
      error: error.message, 
      query, 
      repoPath 
    });
    
    // Fallback to standard assembly
    return await performStandardAssembly(query, options, repoPath, budget, limit, scopeFilters);
  }
}

/**
 * Perform standard assembly using searchCode
 */
async function performStandardAssembly(query, options, repoPath, budget, limit, scopeFilters) {
  const timed = logger.timed('standard_assembly', 'Starting standard assembly');
  
  try {
    // Perform search
    const searchResults = await searchCode(query, limit, options.provider || 'auto', repoPath, scopeFilters);

    if (!searchResults.success) {
      timed.end('Search failed', {
        error: searchResults.message
      });
      return searchResults;
    }

    if (!searchResults.results || searchResults.results.length === 0) {
      timed.end('No results found');
      return {
        success: true,
        results: [],
        totalTokens: 0,
        query
      };
    }

    // Fit to budget
    const budgetedResults = fitToBudget(searchResults.results, budget);

    timed.end('Standard assembly completed', {
      original_results: searchResults.results.length,
      budgeted_results: budgetedResults.length,
      total_tokens: budgetedResults.reduce((sum, item) => sum + (item._tokens || 0), 0)
    });

    return {
      success: true,
      results: budgetedResults,
      totalTokens: budgetedResults.reduce((sum, item) => sum + (item._tokens || 0), 0),
      query
    };

  } catch (error) {
    timed.end('Standard assembly failed', {
      error: error.message
    });
    
    logger.error('standard_assembly_failed', 'Standard assembly failed', { 
      error: error.message, 
      query, 
      repoPath 
    });
    
    throw error;
  }
}

/**
 * Generate console output for assembly results
 */
async function generateOutput(result, query, budget, markdown) {
  const { results, totalTokens } = result;

  if (!results || results.length === 0) {
    console.log(`${chalk.red('❌')} No results found for: "${query}"`);
    
    if (result.message) {
      if (result.message.includes('Database not found')) {
        console.log(`Database not found: ${result.message}`);
        console.log('Suggestions:');
        console.log(`  - Run: pampax index ${path.resolve('.')}`);
      } else {
        console.log('Suggestions:');
        console.log('  - Verify that the project is indexed (pampax index)');
        console.log('  - Try with more general terms');
      }
    }
    return;
  }

  console.log(`Found ${results.length} results for: "${query}"`);
  console.log(`Total tokens: ${totalTokens.toLocaleString()} / ${budget.toLocaleString()}\n`);

  // Display results
  results.forEach((item, index) => {
    console.log(`${index + 1}. ${chalk.cyan(item.path)}`);
    console.log(`   SYMBOL: ${item.meta.symbol} (${item.lang})`);
    console.log(`   SCORE: ${item.meta.score}`);
    
    if (item._truncated) {
      console.log(`   ${chalk.yellow('⚠️ Content truncated due to budget')}`);
    }
    
    if (process.env.DEBUG) {
      console.log(`   TOKENS: ${item._tokens.toLocaleString()}`);
    }
    
    console.log('');
  });

  // Token report
  const percentage = Math.round((totalTokens / budget) * 100);
  console.log(`${chalk.blue('💰 Token Report:')} ${totalTokens.toLocaleString()} / ${budget.toLocaleString()} (${percentage}%)`);
  console.log(`${chalk.blue('📊 Items:')} ${results.length}`);

  // Display explanation if available
  if (result.explanation) {
    console.log(`${chalk.blue('🔍 Evidence Summary:')}`);
    
    if (result.explanation.evidence) {
      console.log(`   Total evidence items: ${result.explanation.evidence.length}`);
      
      if (result.explanation.cacheHits !== undefined) {
        console.log(`   Cache hits: ${result.explanation.cacheHits}/${result.explanation.evidence.length}`);
      }
    }

    if (result.explanation.stoppingReasons) {
      console.log(`${chalk.blue('⏹️ Stopping Conditions:')}`);
      result.explanation.stoppingReasons.forEach(condition => {
        console.log(`   - ${condition}`);
      });
  }
}

// Create and configure the command
const AssembleCommand = new Command('assemble')
  .description('Assemble context from search results with progressive summarization')
  .argument('<query>', 'Search query to find relevant code')
  .option('-k, --limit <num>', 'maximum number of results', '10')
  .option('-p, --provider <provider>', 'embedding provider (auto|openai|transformers|ollama|cohere)', 'auto')
  .option('--project <path>', 'alias for project path (same as [path] argument)')
  .option('--directory <path>', 'alias for project directory (same as [path] argument)')
  .option('--path_glob <pattern...>', 'limit results to files matching provided glob pattern(s)')
  .option('--tags <tag...>', 'filter results to chunks tagged with provided values')
  .option('--lang <language...>', 'filter results to specified languages (e.g. php, ts)')
  .option('--reranker <mode>', 'reranker strategy (off|transformers|api)', 'off')
  .option('--hybrid <mode>', 'toggle reciprocal-rank-fused hybrid search (on|off)', 'on')
  .option('--bm25 <mode>', 'toggle BM25 keyword candidate generation (on|off)', 'on')
  .option('--symbol_boost <mode>', 'toggle symbol-aware ranking boost (on|off)', 'on')
  .option('--callers <num>', 'include symbol callers in results (depth 1-3)', '0')
  .option('--callees <num>', 'include symbol callees in results (depth 1-3)', '0')
  .option('--graph-depth <num>', 'maximum graph traversal depth for code neighbors', '2')
  .option('--token-budget <num>', 'token budget for graph expansion', '1000')
  .option('--budget <num>', 'maximum tokens for final output', '2000')
  .option('--format <type>', 'output format (text|markdown)', 'markdown')
  .action(async (query, options) => {
    try {
      await assembleCommand(query, options);
    } catch (error) {
      console.error('Assemble error:', error.message);
      process.exit(1);
    }
  });

export { AssembleCommand };

  console.log(`${chalk.blue('💡')} Use "pampax mcp" to start the MCP server and get the complete code`);

  // Generate markdown if requested
  if (markdown) {
    const generator = MarkdownGeneratorFactory.createGenerator('default');
    const markdownOutput = generator.generate(results, {
      query,
      totalTokens,
      budget,
      explanation: result.explanation
    });
    
    console.log('\n--- Markdown Output ---');
    console.log(markdown);
  }
}