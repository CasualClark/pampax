#!/usr/bin/env node

import path from 'path';
import { Database } from '../../storage/database-simple.js';
import { BFSTraversalEngine } from '../../graph/graph-traversal.js';
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
 * Parse edge types from comma-separated string
 */
function parseEdgeTypes(typesStr) {
  if (!typesStr) return ['call', 'import'];
  return typesStr.split(',').map(t => t.trim()).filter(t => t);
}

/**
 * Validate edge types
 */
function validateEdgeTypes(types) {
  const validTypes = ['call', 'import', 'inherit', 'implement', 'reference', 'define'];
  const invalid = types.filter(t => !validTypes.includes(t));
  if (invalid.length > 0) {
    throw new Error(`Invalid edge types: ${invalid.join(', ')}. Valid types: ${validTypes.join(', ')}`);
  }
  return types;
}

/**
 * Create text-based graph visualization
 */
function visualizeGraph(edges, options = {}) {
  const { maxNodes = 50, showTokens = false, compact = false } = options;
  
  if (edges.length === 0) {
    return chalk.yellow('No graph edges found');
  }

  // Build node map
  const nodes = new Map();
  const nodeConnections = new Map();
  
  edges.forEach(edge => {
    // Add source node
    if (!nodes.has(edge.sourceId)) {
      nodes.set(edge.sourceId, {
        id: edge.sourceId,
        name: edge.sourceName || edge.sourceId,
        type: edge.sourceType || 'unknown',
        file: edge.sourceFile || 'unknown'
      });
    }
    
    // Add target node
    if (!nodes.has(edge.targetId)) {
      nodes.set(edge.targetId, {
        id: edge.targetId,
        name: edge.targetName || edge.targetId,
        type: edge.targetType || 'unknown',
        file: edge.targetFile || 'unknown'
      });
    }
    
    // Track connections
    if (!nodeConnections.has(edge.sourceId)) {
      nodeConnections.set(edge.sourceId, []);
    }
    nodeConnections.get(edge.sourceId).push({
      target: edge.targetId,
      type: edge.type,
      confidence: edge.confidence
    });
  });

  // Limit nodes for display
  const nodeIds = Array.from(nodes.keys()).slice(0, maxNodes);
  const limitedNodes = new Map(nodeIds.map(id => [id, nodes.get(id)]));

  let output = [];
  
  if (!compact) {
    output.push(chalk.blue('=== Graph Visualization ==='));
    output.push(`Nodes: ${limitedNodes.size} (showing first ${maxNodes})`);
    output.push(`Edges: ${edges.length}`);
    output.push('');
  }

  // Display nodes and their connections
  limitedNodes.forEach((node, nodeId) => {
    const connections = nodeConnections.get(nodeId) || [];
    
    if (compact) {
      output.push(`${chalk.cyan(node.name)} (${node.type})`);
    } else {
      output.push(`${chalk.cyan(node.name)} ${chalk.gray(`(${node.type})`)}`);
      output.push(`  File: ${chalk.yellow(node.file)}`);
    }
    
    connections.forEach(conn => {
      const targetNode = limitedNodes.get(conn.target);
      if (targetNode) {
        const edgeColor = getEdgeTypeColor(conn.type);
        const confidence = conn.confidence ? ` (${(conn.confidence * 100).toFixed(1)}%)` : '';
        
        if (compact) {
          output.push(`  ${edgeColor('→')} ${targetNode.name} ${chalk.gray(`[${conn.type}]`)}${confidence}`);
        } else {
          output.push(`  ${edgeColor('├─')} ${chalk.white(targetNode.name)} ${chalk.gray(`[${conn.type}]`)}${confidence}`);
          output.push(`  │  └─ File: ${chalk.yellow(targetNode.file)}`);
        }
      }
    });
    
    if (!compact && connections.length > 0) {
      output.push('');
    }
  });

  // Show token usage if requested
  if (showTokens && edges.length > 0) {
    const totalTokens = edges.reduce((sum, edge) => {
      return sum + JSON.stringify(edge).length / 4; // Rough estimate
    }, 0);
    
    output.push('');
    output.push(chalk.blue('=== Token Usage ==='));
    output.push(`Estimated tokens: ${chalk.yellow(Math.round(totalTokens))}`);
  }

  return output.join('\n');
}

/**
 * Get color for edge type
 */
function getEdgeTypeColor(type) {
  switch (type) {
    case 'call': return chalk.green;
    case 'import': return chalk.blue;
    case 'inherit': return chalk.magenta;
    case 'implement': return chalk.cyan;
    case 'reference': return chalk.yellow;
    case 'define': return chalk.red;
    default: return chalk.gray;
  }
}

/**
 * Find symbols by name or pattern
 */
async function findSymbols(db, pattern, options = {}) {
  const { limit = 10, language = null } = options;
  
  let query = `
    SELECT DISTINCT id, name, kind, path
    FROM span 
    WHERE (name LIKE ? OR id LIKE ?)
  `;
  
  const params = [`%${pattern}%`, `%${pattern}%`];
  
  if (language) {
    query += ` AND path LIKE '%.${language}'`;
  }
  
  query += ` ORDER BY 
    CASE 
      WHEN name = ? THEN 1
      WHEN name LIKE ? THEN 2
      ELSE 3
    END,
    LENGTH(name)
    LIMIT ?`;
  
  params.push(pattern, `${pattern}%`, limit);
  
  return await db.all(query, params);
}

/**
 * Main graph command implementation
 */
export async function graphCommand(options = {}) {
  const repoPath = path.resolve(options.repo || '.');
  const dbPath = options.db || path.join(repoPath, '.pampax/pampax.sqlite');
  const json = options.json || false;
  const verbose = options.verbose || false;
  
  // Graph options
  const symbol = options.symbol;
  const neighbors = parseInt(options.neighbors || '2');
  const typesStr = options.types || 'call,import';
  const maxNodes = parseInt(options.maxNodes || '50');
  const showTokens = options.tokenReport || false;
  const compact = options.compact || false;
  const tokenBudget = parseInt(options.tokenBudget || '4000');
  
  // Progress setup
  const isTTY = process.stdout.isTTY && !json;
  const progress = createProgressRenderer({ tty: isTTY, json });

  try {
    // Validate inputs
    if (neighbors < 1 || neighbors > 5) {
      throw new Error('--neighbors must be between 1 and 5');
    }
    
    const edgeTypes = validateEdgeTypes(parseEdgeTypes(typesStr));
    
    if (maxNodes < 1 || maxNodes > 200) {
      throw new Error('--max-nodes must be between 1 and 200');
    }

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
          databasePath: dbPath
        }, null, 2));
      } else {
        progress.error(error);
      }
      process.exit(1);
    }

    progress.start('Analyzing code graph...');

    // Find symbol if provided
    let startSymbols = [];
    if (symbol) {
      const symbols = await findSymbols(db, symbol, { 
        limit: 5, 
        language: options.lang 
      });
      
      if (symbols.length === 0) {
        progress.error(`No symbols found matching: ${symbol}`);
        process.exit(1);
      }
      
      startSymbols = symbols.map(s => s.id);
      
      if (verbose && !json) {
        console.log(`\n${chalk.blue('Found symbols:')}`);
        symbols.forEach((s, i) => {
          console.log(`  ${i + 1}. ${chalk.cyan(s.name)} (${chalk.yellow(s.kind)}) in ${chalk.gray(s.path)}`);
        });
        console.log('');
      }
    } else {
      progress.error('--symbol is required for graph analysis');
      process.exit(1);
    }

    // Initialize traversal engine
    const traversalEngine = new BFSTraversalEngine(db, tokenBudget);

    // Perform graph expansion
    const expansion = {
      query: `Graph analysis for symbol: ${symbol}`,
      start_symbols: startSymbols,
      max_depth: neighbors,
      edge_types: edgeTypes,
      expansion_strategy: 'quality-first',
      token_budget: tokenBudget
    };

    const result = await traversalEngine.expandGraph(expansion);
    const duration = result.performance_ms;

    progress.complete(`Graph analysis complete in ${duration}ms`);

    // Prepare output
    const output = {
      success: true,
      query: expansion.query,
      symbol: symbol,
      startSymbols: startSymbols,
      edgeTypes: edgeTypes,
      maxDepth: neighbors,
      visitedNodes: Array.from(result.visited_nodes),
      edges: result.edges,
      expansionDepth: result.expansion_depth,
      tokensUsed: result.tokens_used,
      tokenBudget: result.token_budget,
      truncated: result.truncated,
      performance: {
        durationMs: duration,
        nodesVisited: result.visited_nodes.size,
        edgesFound: result.edges.length
      },
      databasePath: dbPath
    };

    if (json) {
      console.log(JSON.stringify(output, null, 2));
    } else {
      // Display text visualization
      console.log(`\n${chalk.blue('=== Graph Analysis Results ===')}`);
      console.log(`Symbol: ${chalk.cyan(symbol)}`);
      console.log(`Start nodes: ${chalk.yellow(startSymbols.length)}`);
      console.log(`Expansion depth: ${chalk.yellow(result.expansion_depth)}/${neighbors}`);
      console.log(`Nodes visited: ${chalk.yellow(result.visited_nodes.size)}`);
      console.log(`Edges found: ${chalk.yellow(result.edges.length)}`);
      console.log(`Duration: ${chalk.yellow(duration)}ms`);
      
      if (result.truncated) {
        console.log(`${chalk.red('⚠️  Truncated due to token budget')}`);
      }
      
      console.log('');
      
      // Show graph visualization
      const visualization = visualizeGraph(result.edges, {
        maxNodes: maxNodes,
        showTokens: showTokens,
        compact: compact
      });
      
      console.log(visualization);
      
      // Show verbose information
      if (verbose) {
        console.log(`\n${chalk.blue('=== Detailed Information ===')}`);
        console.log(`Database: ${dbPath}`);
        console.log(`Edge types: ${edgeTypes.join(', ')}`);
        console.log(`Token usage: ${result.tokens_used}/${result.token_budget} (${Math.round((result.tokens_used / result.token_budget) * 100)}%)`);
        
        if (result.edges.length > 0) {
          console.log(`\n${chalk.blue('Edge Types Found:')}`);
          const edgeTypeCounts = {};
          result.edges.forEach(edge => {
            edgeTypeCounts[edge.type] = (edgeTypeCounts[edge.type] || 0) + 1;
          });
          
          Object.entries(edgeTypeCounts).forEach(([type, count]) => {
            const color = getEdgeTypeColor(type);
            console.log(`  ${color(type)}: ${chalk.yellow(count)}`);
          });
        }
      }
    }

  } catch (error) {
    logger.error('Graph analysis failed', { error: error.message, symbol, dbPath });
    
    progress.error(`Graph analysis failed: ${error.message}`);
    
    if (json) {
      console.log(JSON.stringify({
        success: false,
        error: error.message,
        symbol,
        databasePath: dbPath
      }, null, 2));
    } else {
      console.error('❌ Graph analysis failed:', error.message);
    }
    process.exit(1);
  }
}

/**
 * Symbol search command for finding symbols before graph analysis
 */
export async function symbolSearchCommand(pattern, options = {}) {
  const repoPath = path.resolve(options.repo || '.');
  const dbPath = options.db || path.join(repoPath, '.pampax/pampax.sqlite');
  const json = options.json || false;
  const limit = parseInt(options.limit || '10');
  const language = options.lang || null;

  try {
    const db = new Database(dbPath);
    
    const hasData = await db.hasData();
    if (!hasData) {
      const error = 'No indexed data found. Please run "pampax index" first.';
      
      if (json) {
        console.log(JSON.stringify({
          success: false,
          error,
          databasePath: dbPath
        }, null, 2));
      } else {
        console.error(error);
      }
      process.exit(1);
    }

    const symbols = await findSymbols(db, pattern, { limit, language });

    if (json) {
      console.log(JSON.stringify({
        success: true,
        pattern,
        symbols,
        totalFound: symbols.length
      }, null, 2));
    } else {
      if (symbols.length === 0) {
        console.log(`No symbols found matching: ${pattern}`);
        return;
      }

      console.log(`Found ${symbols.length} symbols matching: ${pattern}\n`);
      
      symbols.forEach((symbol, index) => {
        console.log(`${index + 1}. ${chalk.cyan(symbol.name)} (${chalk.yellow(symbol.kind)})`);
        console.log(`   ID: ${chalk.gray(symbol.id)}`);
        console.log(`   File: ${chalk.blue(symbol.path)}`);
        console.log('');
      });
    }

  } catch (error) {
    console.error('Symbol search failed:', error.message);
    process.exit(1);
  }
}

/**
 * Configure graph command for CLI
 */
export function configureGraphCommand(program) {
  // Main graph command
  program
    .command('graph')
    .description('Analyze code graph with symbol neighbors and relationships')
    .requiredOption('--symbol <name>', 'Symbol name to analyze')
    .option('--neighbors <num>', 'Maximum expansion depth (1-5)', '2')
    .option('--types <types>', 'Edge types to include (comma-separated)', 'call,import')
    .option('--max-nodes <num>', 'Maximum nodes to display (1-200)', '50')
    .option('--repo <path>', 'Repository path', '.')
    .option('--db <path>', 'Database file path')
    .option('--lang <language>', 'Filter symbols by language')
    .option('--json', 'Output in JSON format')
    .option('--verbose', 'Verbose output')
    .option('--token-report', 'Show token usage information')
    .option('--compact', 'Compact visualization')
    .option('--token-budget <num>', 'Token budget for graph expansion', '4000')
    .addHelpText('after', `\nExamples:
  $ pampax graph --symbol "authenticate" --neighbors 2
  $ pampax graph --symbol "UserModel" --types call,inherit --max-nodes 20
  $ pampax graph --symbol "router" --neighbors 3 --types call,import,reference --json
  $ pampax graph --symbol "Database" --lang python --verbose --token-report
  $ pampax graph --symbol "express" --compact --neighbors 1`)
    .action(graphCommand);

  // Symbol search command (separate from graph)
  program
    .command('graph-find <pattern>')
    .description('Find symbols by name or pattern')
    .option('--repo <path>', 'Repository path', '.')
    .option('--db <path>', 'Database file path')
    .option('--limit <num>', 'Maximum results', '10')
    .option('--lang <language>', 'Filter by language')
    .option('--json', 'Output in JSON format')
    .action(symbolSearchCommand);
}