#!/usr/bin/env node

import { Command } from 'commander';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Import new command modules
import { configureMigrateCommand } from './cli/commands/migrate.js';
import { configureIndexCommand } from './cli/commands/index.js';
import { configureSearchCommand } from './cli/commands/search.js';
import { configureRerankCommand } from './cli/commands/rerank.js';
import { configureUICommand } from './cli/commands/ui.js';

// Import existing commands
import { registerContextCommands } from './cli/commands/context.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read version from package.json
const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));

const program = new Command();
program
    .name('pampax')
    .description('PAMPAX - Protocol for Augmented Memory of Project Artifacts')
    .version(packageJson.version);

// Configure all new commands
configureMigrateCommand(program);
configureIndexCommand(program);
configureSearchCommand(program);
configureRerankCommand(program);
configureUICommand(program);

// Keep existing context commands
registerContextCommands(program);

// Legacy command compatibility
program
    .command('index-legacy [path]')
    .description('Legacy index command (use new "index" command)')
    .option('-p, --provider <provider>', 'embedding provider (auto|openai|transformers|ollama|cohere)', 'auto')
    .option('--project <path>', 'alias for project path (same as [path] argument)')
    .option('--directory <path>', 'alias for project directory (same as [path] argument)')
    .option('--encrypt <mode>', 'encrypt chunk payloads when PAMPAX_ENCRYPTION_KEY is configured (on|off)')
    .action(async (projectPath = '.', options) => {
        const resolvedPath = options.project || options.directory || projectPath || '.';
        console.log('⚠️  Using legacy index command. Consider migrating to the new "pampax index" command.');
        console.log('Starting project indexing...');
        console.log(`Provider: ${options.provider}`);
        try {
            // Import the existing indexer for compatibility
            const { indexProject } = await import('./indexer.js');
            await indexProject({ repoPath: resolvedPath, provider: options.provider, encrypt: options.encrypt });
            console.log('Indexing completed successfully');
        } catch (error) {
            console.error('ERROR during indexing:', error.message);
            process.exit(1);
        }
    });

program
    .command('search-legacy <query> [path]')
    .description('Legacy search command (use new "search" command)')
    .option('-k, --limit <num>', 'maximum number of results', '10')
    .option('-p, --provider <provider>', 'embedding provider (auto|openai|transformers|ollama|cohere)', 'auto')
    .option('--project <path>', 'alias for project path (same as [path] argument)')
    .option('--directory <path>', 'alias for project directory (same as [path] argument)')
    .option('--path_glob <pattern...>', 'limit results to files matching the provided glob pattern(s)')
    .option('--tags <tag...>', 'filter results to chunks tagged with the provided values')
    .option('--lang <language...>', 'filter results to the specified languages (e.g. php, ts)')
    .option('--reranker <mode>', 'reranker strategy (off|transformers|api)', 'off')
    .option('--hybrid <mode>', 'toggle reciprocal-rank-fused hybrid search (on|off)', 'on')
    .option('--bm25 <mode>', 'toggle BM25 keyword candidate generation (on|off)', 'on')
    .option('--symbol_boost <mode>', 'toggle symbol-aware ranking boost (on|off)', 'on')
    .action(async (query, projectPath = '.', options) => {
        console.log('⚠️  Using legacy search command. Consider migrating to the new "pampax search" command.');
        try {
            const resolvedPath = options.project || options.directory || projectPath || '.';
            const limit = parseInt(options.limit);
            
            // Import existing search for compatibility
            const { buildScopeFiltersFromOptions } = await import('./cli/commands/search.js');
            const { searchCode } = await import('./service.js');
            
            const { scope: scopeFilters, pack } = buildScopeFiltersFromOptions(options, resolvedPath);
            if (pack) {
                console.log(
                    `Using context pack: ${pack.name || pack.key}` +
                    (pack.description ? ` – ${pack.description}` : '')
                );
            }
            const results = await searchCode(query, limit, options.provider, resolvedPath, scopeFilters);

            if (!results.success) {
                console.log(`No results found for: "${query}"`);
                if (results.error === 'database_not_found') {
                    console.log(`Database not found: ${results.message}`);
                    console.log('Suggestions:');
                    console.log(`  - Run: pampax index ${resolvedPath}`);
                } else {
                    console.log('Suggestions:');
                    console.log('  - Verify that the project is indexed (pampax index)');
                    console.log('  - Try with more general terms');
                    console.log(`  - Verify you use the same provider: --provider ${options.provider}`);
                    if (scopeFilters.path_glob || scopeFilters.tags || scopeFilters.lang) {
                        console.log('  - Try removing or adjusting scope filters');
                    }
                }
                return;
            }

            if (results.results.length === 0) {
                console.log(`No results found for: "${query}"`);
                console.log('Suggestions:');
                console.log('  - Verify that the project is indexed (pampax index)');
                console.log('  - Try with more general terms');
                console.log(`  - Verify you use the same provider: --provider ${options.provider}`);
                if (scopeFilters.path_glob || scopeFilters.tags || scopeFilters.lang) {
                    console.log('  - Try removing or adjusting scope filters');
                }
                return;
            }

            console.log(`Found ${results.results.length} results for: "${query}"\n`);

            results.results.forEach((result, index) => {
                console.log(`${index + 1}. FILE: ${result.path}`);
                console.log(`   SYMBOL: ${result.meta.symbol} (${result.lang})`);
                console.log(`   SIMILARITY: ${result.meta.score}`);
                console.log(`   SHA: ${result.sha}`);
                console.log('');
            });

            console.log('TIP: Use "pampax mcp" to start the MCP server and get the complete code');
        } catch (error) {
            console.error('Search error:', error.message);
            process.exit(1);
        }
    });

program
    .command('mcp')
    .description('Start MCP server for AI agent integration')
    .action(async () => {
        // Execute MCP server directly without console output that interferes with MCP protocol
        const serverPath = path.join(__dirname, 'mcp-server.js');
        const { spawn } = await import('child_process');
        const mcpServer = spawn('node', [serverPath], {
            stdio: 'inherit'
        });

        mcpServer.on('error', (error) => {
            // Log to stderr instead of stdout to avoid MCP protocol interference
            process.stderr.write(`ERROR starting MCP server: ${error.message}\n`);
            process.exit(1);
        });

        mcpServer.on('exit', (code) => {
            if (code !== 0) {
                process.stderr.write(`MCP server terminated with code: ${code}\n`);
                process.exit(code);
            }
        });

        // Handle signals to close cleanly
        process.on('SIGINT', () => {
            mcpServer.kill('SIGINT');
        });

        process.on('SIGTERM', () => {
            mcpServer.kill('SIGTERM');
        });
    });

program
    .command('info')
    .description('Show information about the indexed project')
    .action(async () => {
        try {
            const { readCodemap } = await import('./codemap/io.js');
            const codemapPath = 'pampa.codemap.json';

            if (!fs.existsSync(codemapPath)) {
                console.log('Project not indexed');
                console.log('TIP: Run "pampax index" to index the project');
                return;
            }

            const codemap = readCodemap(codemapPath);
            const chunks = Object.values(codemap);

            // Statistics by language
            const langStats = chunks.reduce((acc, chunk) => {
                acc[chunk.lang] = (acc[chunk.lang] || 0) + 1;
                return acc;
            }, {});

            // Statistics by file
            const fileStats = chunks.reduce((acc, chunk) => {
                acc[chunk.file] = (acc[chunk.file] || 0) + 1;
                return acc;
            }, {});

            const topFiles = Object.entries(fileStats)
                .sort(([, a], [, b]) => b - a)
                .slice(0, 10);

            console.log('PAMPA project information\n');
            console.log(`Total indexed functions: ${chunks.length}`);
            console.log('');

            console.log('By language:');
            Object.entries(langStats).forEach(([lang, count]) => {
                console.log(`  ${lang}: ${count} functions`);
            });
            console.log('');

            console.log('Files with most functions:');
            topFiles.forEach(([file, count]) => {
                console.log(`  ${file}: ${count} functions`);
            });

        } catch (error) {
            console.error('ERROR getting information:', error.message);
            process.exit(1);
        }
    });

// Help command for new CLI
program
    .command('cli-help')
    .description('Show help for the new CLI structure')
    .action(() => {
        console.log(`
PAMPAX CLI - New Command Structure

Core Commands:
  migrate      Manage database migrations
  index        Index project files for search
  search       Search indexed code with FTS support
  rerank       Rerank search results using RRF or cross-encoder
  ui           Interactive UI and status visualization

Legacy Commands:
  index-legacy Legacy indexing (deprecated)
  search-legacy Legacy search (deprecated)
  mcp          Start MCP server
  info         Show project information
  context      Context pack management

Examples:
  pampax migrate --db .pampax/pampax.sqlite
  pampax index --repo ./myrepo --include "src/**/*.py"
  pampax search "router init" --k 20
  pampax rerank "http server" --provider rrf --input results.json
  pampax ui --mode status

Migration from legacy:
  The new CLI uses SQLite storage instead of JSON codemap.
  Run "pampax migrate" to set up the database, then "pampax index" 
  to re-index your project with the new system.
        `);
    });

// Show help if no command is provided
if (process.argv.length <= 2) {
    program.help();
}

program.parse(process.argv);