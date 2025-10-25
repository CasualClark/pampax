#!/usr/bin/env node
import { spawn } from 'child_process';
import { Command } from 'commander';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { registerContextCommands } from './cli/commands/context.js';
import { buildScopeFiltersFromOptions } from './cli/commands/search.js';
import { configureLearnCommand } from './cli/commands/learn.js';
import { configureLearnReportCommand } from './cli/commands/learn-report.js';
import { configureAnalyticsCommand } from './cli/commands/analytics.js';
import { addDeterministicOptions, setupGlobalErrorHandling } from './cli/cli-wrapper.js';

import configCommand from './cli/commands/config.js';
import healthCommand from './cli/commands/health.js';
import { configureReliabilityCommand } from './cli/commands/reliability.js';
import { readCodemap } from './codemap/io.js';
import { indexProject } from './indexer.js';
import { startWatch } from './indexer/watch.js';
import { searchCode } from './service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read version from package.json
const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));

// Setup global error handling
setupGlobalErrorHandling();

const program = new Command();
program
    .name('pampa')
    .description('PAMPA - Protocol for Augmented Memory of Project Artifacts (MCP)')
    .version(packageJson.version);

// Add deterministic output options
addDeterministicOptions(program);

program
    .command('index [path]')
    .description('Index project and build/update pampa.codemap.json')
    .option('-p, --provider <provider>', 'embedding provider (auto|openai|transformers|ollama|cohere)', 'auto')
    .option('--project <path>', 'alias for project path (same as [path] argument)')
    .option('--directory <path>', 'alias for project directory (same as [path] argument)')
    .option('--encrypt <mode>', 'encrypt chunk payloads when PAMPAX_ENCRYPTION_KEY is configured (on|off)')
    .action(async (projectPath = '.', options) => {
        const { handleCommandOutput, success, errorResponse, validateOptions } = await import('./cli/cli-wrapper.js');
        
        try {
            // Validate options
            validateOptions(options, 'index');
            
            const resolvedPath = options.project || options.directory || projectPath || '.';
            
            await indexProject({ repoPath: resolvedPath, provider: options.provider, encrypt: options.encrypt });
            
            const responseData = {
                path: resolvedPath,
                provider: options.provider,
                encrypt: options.encrypt,
                message: 'Indexing completed successfully'
            };
            
            return await handleCommandOutput(success(responseData), options, { command: 'index' });
            
        } catch (error) {
            return await handleCommandOutput(errorResponse(error), options, { command: 'index' });
        }
    });

program
    .command('update [path]')
    .description('Update index by re-scanning all files (recommended after code changes)')
    .option('-p, --provider <provider>', 'embedding provider (auto|openai|transformers|ollama|cohere)', 'auto')
    .option('--project <path>', 'alias for project path (same as [path] argument)')
    .option('--directory <path>', 'alias for project directory (same as [path] argument)')
    .option('--encrypt <mode>', 'encrypt chunk payloads when PAMPAX_ENCRYPTION_KEY is configured (on|off)')
    .action(async (projectPath = '.', options) => {
        const { handleCommandOutput, success, errorResponse, validateOptions } = await import('./cli/cli-wrapper.js');
        
        try {
            // Validate options
            validateOptions(options, 'update');
            
            const resolvedPath = options.project || options.directory || projectPath || '.';
            
            await indexProject({ repoPath: resolvedPath, provider: options.provider, encrypt: options.encrypt });
            
            const responseData = {
                path: resolvedPath,
                provider: options.provider,
                encrypt: options.encrypt,
                message: 'Index updated successfully',
                note: 'Your AI agents now have access to the latest code changes'
            };
            
            return await handleCommandOutput(success(responseData), options, { command: 'update' });
            
        } catch (error) {
            return await handleCommandOutput(errorResponse(error), options, { command: 'update' });
        }
    });

program
    .command('watch [path]')
    .description('Watch project files and incrementally update the index as changes occur')
    .option('-p, --provider <provider>', 'embedding provider (auto|openai|transformers|ollama|cohere)', 'auto')
    .option('--project <path>', 'alias for project path (same as [path] argument)')
    .option('--directory <path>', 'alias for project directory (same as [path] argument)')
    .option('-d, --debounce <ms>', 'debounce interval in milliseconds (default 500)', '500')
    .option('--encrypt <mode>', 'encrypt chunk payloads when PAMPAX_ENCRYPTION_KEY is configured (on|off)')
    .action(async (projectPath = '.', options) => {
        const resolvedPath = options.project || options.directory || projectPath || '.';
        const parsedDebounce = Number.parseInt(options.debounce, 10);
        const debounceMs = Number.isFinite(parsedDebounce) ? Math.max(parsedDebounce, 50) : undefined;

        console.log(`👀 Watching ${resolvedPath} for changes...`);
        console.log(`Provider: ${options.provider}`);
        console.log(`Debounce window: ${debounceMs ?? 500}ms`);
        if (typeof options.encrypt === 'string') {
            console.log(`Encryption: ${options.encrypt}`);
        }

        try {
            const controller = startWatch({
                repoPath: resolvedPath,
                provider: options.provider,
                debounceMs,
                encrypt: options.encrypt,
                onBatch: ({ changed, deleted }) => {
                    console.log(
                        `🔁 Indexed ${changed.length} changed / ${deleted.length} deleted files`
                    );
                }
            });

            await controller.ready;
            console.log('✅ Watcher active. Press Ctrl+C to stop.');

            await new Promise(resolve => {
                const shutdown = async () => {
                    console.log('\nStopping watcher...');
                    await controller.close();
                    process.off('SIGINT', shutdown);
                    process.off('SIGTERM', shutdown);
                    resolve();
                };

                process.on('SIGINT', shutdown);
                process.on('SIGTERM', shutdown);
            });
        } catch (error) {
            console.error('❌ Failed to start watcher:', error.message);
            process.exit(1);
        }
    });

program
    .command('search <query> [path]')
    .description('Search indexed code with optional path/tag/lang filters, provider overrides, reranker, symbol-aware boosts, and graph expansion')
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
    .option('--callers <num>', 'include symbol callers in results (depth 1-3)', '0')
    .option('--callees <num>', 'include symbol callees in results (depth 1-3)', '0')
    .option('--graph-depth <num>', 'maximum graph traversal depth for code neighbors', '2')
    .option('--token-budget <num>', 'token budget for graph expansion', '1000')
    .addHelpText('after', `\nExamples:\n  $ pampa search "create checkout session" --path_glob "app/Services/**" --tags stripe --lang php\n  $ pampa search "payment intent status" --provider openai --reranker transformers\n  $ pampa search "token validation" --symbol_boost off --reranker api\n  $ pampa search "user authentication" --project /path/to/project\n  $ pampa search "database connection" --directory ~/my-laravel-app\n  $ pampa search "main function" --callers 2 --callees 1 --graph-depth 2\n  $ pampa search "api endpoint" --token-budget 2000 --callers 1\n`)
    .action(async (query, projectPath = '.', options) => {
        try {
            // Import deterministic CLI functions
            const { createOutputFormatter, isPipedOutput, createStableJSON, ExitCodes } = await import('./cli/output-formatter.js');
            const { determineExitCode } = await import('./cli/exit-codes.js');
            
            // Merge global and command options for formatter
            const globalOptions = program.opts() || {};
            const allOptions = { ...globalOptions, ...options };
            
            // Create formatter based on merged options and piped detection
            const formatter = createOutputFormatter(allOptions);
            const startTime = Date.now();
            
            // Resolve project path from various options
            const resolvedPath = options.project || options.directory || projectPath || '.';

            const limit = parseInt(options.limit);
            const { scope: scopeFilters, pack } = buildScopeFiltersFromOptions(options, resolvedPath);
            
            const results = await searchCode(query, limit, options.provider, resolvedPath, scopeFilters);

            const duration = Date.now() - startTime;

            if (!results.success) {
                const errorData = {
                    success: false,
                    query,
                    path: resolvedPath,
                    provider: options.provider,
                    error: results.error,
                    message: results.message,
                    suggestions: results.error === 'database_not_found' 
                        ? [`Run: pampa index ${resolvedPath}`]
                        : [
                            'Verify that the project is indexed (pampa index)',
                            'Try with more general terms',
                            `Verify you use the same provider: --provider ${options.provider}`,
                            ...(scopeFilters.path_glob || scopeFilters.tags || scopeFilters.lang 
                                ? ['Try removing or adjusting scope filters'] 
                                : [])
                        ],
                    timestamp: new Date().toISOString(),
                    _meta: {
                        timestamp: new Date().toISOString(),
                        duration,
                        command: 'search',
                        mode: formatter.mode
                    }
                };
                
                await formatter.output(errorData, { command: 'search' });
                process.exit(determineExitCode(new Error(results.message || 'Search failed')));
            }

            // Format results for deterministic output
            const responseData = {
                success: true,
                query,
                path: resolvedPath,
                provider: options.provider,
                limit,
                results: results.results || [],
                total: results.results?.length || 0,
                scopeFilters,
                contextPack: pack ? {
                    name: pack.name || pack.key,
                    description: pack.description
                } : null,
                timestamp: new Date().toISOString(),
                _meta: {
                    timestamp: new Date().toISOString(),
                    duration,
                    command: 'search',
                    mode: formatter.mode
                }
            };

            await formatter.output(responseData, { command: 'search' });
            
        } catch (error) {
            // Fallback error handling
            console.error('Search error:', error.message);
            process.exit(1);
        }
    });

registerContextCommands(program);

// Register learning system commands
configureLearnCommand(program);
configureLearnReportCommand(program);
configureAnalyticsCommand(program);

// Register config command
program.addCommand(configCommand);
program.addCommand(healthCommand);
program.addCommand(configureReliabilityCommand());
program.addCommand(cacheCommand('.'));

program
    .command('mcp')
    .description('Start MCP server for AI agent integration')
    .action(() => {
        // Execute MCP server directly without console output that interferes with MCP protocol
        const serverPath = path.join(__dirname, 'mcp-server.js');
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
    .action(async (options) => {
        try {
            const { createOutputFormatter } = await import('./cli/output-formatter.js');
            
            // Merge global and command options
            const globalOptions = program.opts() || {};
            const allOptions = { ...globalOptions, ...options };
            
            // Create formatter
            const formatter = createOutputFormatter(allOptions);
            
            const fs = await import('fs');
            const path = await import('path');

            const codemapPath = 'pampa.codemap.json';

            if (!fs.existsSync(codemapPath)) {
                const errorData = {
                    success: false,
                    message: 'Project not indexed',
                    suggestion: 'Run "pampa index" to index the project',
                    timestamp: new Date().toISOString(),
                    _meta: {
                        timestamp: new Date().toISOString(),
                        command: 'info',
                        mode: formatter.mode
                    }
                };
                
                await formatter.output(errorData, { command: 'info' });
                process.exit(3); // IO error
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

            const responseData = {
                success: true,
                totalFunctions: chunks.length,
                languageStats: langStats,
                topFiles: topFiles.map(([file, count]) => ({ file, count })),
                codemapPath,
                lastIndexed: fs.statSync(codemapPath).mtime.toISOString(),
                timestamp: new Date().toISOString(),
                _meta: {
                    timestamp: new Date().toISOString(),
                    command: 'info',
                    mode: formatter.mode
                }
            };

            await formatter.output(responseData, { command: 'info' });

        } catch (error) {
            const { createOutputFormatter } = await import('./cli/output-formatter.js');
            const formatter = createOutputFormatter(options);
            
            const errorData = {
                success: false,
                error: error.message,
                timestamp: new Date().toISOString(),
                _meta: {
                    timestamp: new Date().toISOString(),
                    command: 'info',
                    mode: formatter.mode
                }
            };
            
            await formatter.output(errorData, { command: 'info' });
            process.exit(1);
        }
    });

// Add custom help command for deterministic output
program
    .command('help [command]')
    .description('Display help for command')
    .action(async (commandName, options, command) => {
        const { handleCommandOutput, success, createOutputFormatter } = await import('./cli/cli-wrapper.js');
        const formatter = createOutputFormatter(command.parent.opts());
        
        if (commandName) {
            // Show help for specific command
            const cmd = command.parent.commands.find(c => c.name() === commandName);
            if (cmd) {
                const helpText = cmd.helpInformation();
                const helpData = {
                    command: `help ${commandName}`,
                    usage: helpText.trim(),
                    version: packageJson.version
                };
                return await handleCommandOutput(success(helpData), command.parent.opts(), { command: `help ${commandName}` });
            } else {
                const error = new Error(`Unknown command: ${commandName}`);
                error.code = 2; // CONFIG error
                return await handleCommandOutput({ success: false, error: error.message }, command.parent.opts(), { command: 'help' });
            }
        } else {
            // Show general help
            const helpText = program.helpInformation();
            const commandList = program.commands.map(cmd => ({
                name: cmd.name(),
                description: cmd.description()
            }));
            
            const helpData = {
                command: 'help',
                usage: helpText.trim(),
                commands: commandList,
                version: packageJson.version,
                message: 'PAMPA CLI help information'
            };
            
            return await handleCommandOutput(success(helpData), command.parent.opts(), { command: 'help' });
        }
    });

// Show help if no command is provided
if (process.argv.length <= 2) {
    program.outputHelp();
    process.exit(0);
}

program.parse(process.argv);
