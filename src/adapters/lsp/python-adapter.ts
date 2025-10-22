/**
 * Python LSP Adapter
 * 
 * Implements the Adapter interface using LSP (Language Server Protocol)
 * for Python with Pyright/basedpyright integration and Tree-sitter fallback.
 */

import { BaseAdapter, ParseContext } from '../base.js';
import { Adapter, Span } from '../../types/core.js';
import { LSPClient, LSPInitializeParams, LSPHover } from './lsp-client.js';
import { 
    extractPythonSpansFromLSP, 
    getDefaultPythonSpanOptions,
    PythonSpanExtractionOptions
} from './python-symbols.js';
import path from 'path';
import { spawn } from 'child_process';

// Import Tree-sitter adapter for fallback
import { PythonTreeSitterAdapter } from '../../../adapters/treesitter/python-adapter.js';

export interface PythonLSPAdapterOptions {
    /**
     * LSP server command (default: 'pyright-langserver')
     */
    serverCommand?: string;
    
    /**
     * LSP server arguments (default: ['--stdio'])
     */
    serverArgs?: string[];
    
    /**
     * Workspace root directory
     */
    workspaceRoot?: string;
    
    /**
     * Python executable path for LSP server
     */
    pythonPath?: string;
    
    /**
     * Configuration file path (pyrightconfig.json)
     */
    configPath?: string;
    
    /**
     * Enable fallback to Tree-sitter when LSP fails
     */
    enableFallback?: boolean;
    
    /**
     * Symbol extraction options
     */
    symbolOptions?: PythonSpanExtractionOptions;
    
    /**
     * Enable hover information extraction
     */
    enableHover?: boolean;
    
    /**
     * Enable definition/reference extraction
     */
    enableDefinitions?: boolean;
    
    /**
     * Maximum number of files to process with LSP
     */
    maxLSPFiles?: number;
}

export interface PythonLSPConfig {
    serverCommand: string;
    serverArgs: string[];
    workspaceRoot: string;
    pythonPath?: string;
    configPath?: string;
    enableFallback: boolean;
    symbolOptions: PythonSpanExtractionOptions;
    enableHover: boolean;
    enableDefinitions: boolean;
    maxLSPFiles: number;
}

export class PythonLSPAdapter extends BaseAdapter implements Adapter {
    readonly id = 'lsp-python';
    
    private lspClient: LSPClient | null = null;
    private fallbackAdapter: PythonTreeSitterAdapter;
    private config: PythonLSPConfig;
    private isLSPAvailable = false;
    private lspInitializationPromise: Promise<void> | null = null;

    constructor(options: PythonLSPAdapterOptions = {}) {
        super();
        
        this.config = {
            serverCommand: options.serverCommand || 'pyright-langserver',
            serverArgs: options.serverArgs || ['--stdio'],
            workspaceRoot: options.workspaceRoot || process.cwd(),
            pythonPath: options.pythonPath || process.env.PYTHON_PATH,
            configPath: options.configPath,
            enableFallback: options.enableFallback ?? true,
            symbolOptions: {
                ...getDefaultPythonSpanOptions(),
                ...options.symbolOptions
            },
            enableHover: options.enableHover ?? true,
            enableDefinitions: options.enableDefinitions ?? false,
            maxLSPFiles: options.maxLSPFiles || 100
        };

        this.fallbackAdapter = new PythonTreeSitterAdapter();
    }

    /**
     * Check if this adapter supports the given file path
     */
    supports(filePath: string): boolean {
        return filePath.endsWith('.py');
    }

    /**
     * Parse the given files and return spans
     */
    async parse(files: string[], context?: ParseContext): Promise<Span[]> {
        // Filter to only Python files
        const pythonFiles = files.filter(file => this.supports(file));
        if (pythonFiles.length === 0) {
            return [];
        }

        // Check feature flag
        try {
            const { featureFlags } = await import('../../config/feature-flags.js');
            const pythonLSPEnabled = featureFlags.isEnabled('lsp.python');
            if (!pythonLSPEnabled) {
                this.emitProgress(context, { 
                    type: 'error', 
                    path: '', 
                    error: 'Python LSP adapter disabled by feature flag' 
                });
                return this.fallbackAdapter.parse(pythonFiles, context);
            }
        } catch (error) {
            // Feature flags not available, continue with LSP
        }

        // Check if we should use LSP or fallback
        if (pythonFiles.length > this.config.maxLSPFiles) {
            this.emitProgress(context, { 
                type: 'error', 
                path: '', 
                error: `Too many files (${pythonFiles.length}) for LSP, using fallback` 
            });
            return this.fallbackAdapter.parse(pythonFiles, context);
        }

        // Try LSP parsing with fallback
        try {
            return await this.parseWithLSP(pythonFiles, context);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.emitProgress(context, { 
                type: 'error', 
                path: '', 
                error: `LSP parsing failed: ${errorMessage}, using fallback` 
            });
            
            if (this.config.enableFallback) {
                return this.fallbackAdapter.parse(pythonFiles, context);
            }
            
            throw error;
        }
    }

    /**
     * Parse files using LSP
     */
    private async parseWithLSP(files: string[], context?: ParseContext): Promise<Span[]> {
        // Initialize LSP client if needed
        if (!this.lspClient) {
            await this.initializeLSP(context);
        }

        if (!this.lspClient || !this.lspClient.ready) {
            throw new Error('LSP client not ready');
        }

        const allSpans: Span[] = [];
        const errors: Array<{ path: string; error: string }> = [];

        this.emitProgress(context, { type: 'start', totalFiles: files.length });

        // Process files in batches to avoid overwhelming the LSP server
        const batchSize = 10;
        for (let i = 0; i < files.length; i += batchSize) {
            const batch = files.slice(i, i + batchSize);
            
            for (const filePath of batch) {
                try {
                    const spans = await this.parseFileWithLSP(filePath, context);
                    allSpans.push(...spans);
                    
                    this.emitProgress(context, { type: 'fileParsed', path: filePath });
                    this.emitProgress(context, { 
                        type: 'spansEmitted', 
                        path: filePath, 
                        count: spans.length 
                    });
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    errors.push({ path: filePath, error: errorMessage });
                    this.emitProgress(context, { 
                        type: 'error', 
                        path: filePath, 
                        error: errorMessage 
                    });
                }
            }
        }

        return allSpans;
    }

    /**
     * Parse a single file using LSP
     */
    private async parseFileWithLSP(filePath: string, context?: ParseContext): Promise<Span[]> {
        if (!this.lspClient || !this.lspClient.ready) {
            throw new Error('LSP client not ready');
        }

        // Read file content
        const content = this.readFileContent(filePath);
        if (content === null) {
            throw new Error('Failed to read file');
        }

        const repo = context?.repo || 'unknown';
        const fileUri = this.fileToUri(filePath);

        // Open document in LSP server
        await this.lspClient.openDocument(fileUri, 'python', 1, content);

        // Get document symbols
        const lspSymbols = await this.lspClient.getDocumentSymbols(fileUri);

        // Extract hover information if enabled
        let hoverInfo: Map<string, LSPHover> | undefined;
        if (this.config.enableHover && lspSymbols.length > 0) {
            hoverInfo = await this.extractHoverInfo(fileUri, lspSymbols, content);
        }

        // Convert LSP symbols to spans
        const spans = extractPythonSpansFromLSP(
            lspSymbols,
            repo,
            filePath,
            content,
            this.config.symbolOptions,
            hoverInfo
        );

        // Generate span IDs using BaseAdapter method
        return spans.map(span => {
            const id = this.createSpanId(
                span.repo,
                span.path,
                span.byteStart,
                span.byteEnd,
                span.kind,
                span.name,
                span.signature,
                span.doc,
                span.parents
            );

            return { ...span, id };
        });
    }

    /**
     * Extract hover information for symbols
     */
    private async extractHoverInfo(
        fileUri: string, 
        lspSymbols: any[], 
        content: string
    ): Promise<Map<string, LSPHover>> {
        const hoverInfo = new Map<string, LSPHover>();

        if (!this.lspClient || !this.config.enableHover) {
            return hoverInfo;
        }

        // Extract hover for top-level symbols only to avoid too many requests
        for (const symbol of lspSymbols.slice(0, 20)) { // Limit to 20 symbols
            try {
                const hover = await this.lspClient.getHover(fileUri, symbol.selectionRange.start);
                if (hover) {
                    hoverInfo.set(symbol.name, hover);
                }
            } catch (error) {
                // Hover is optional, ignore errors
            }
        }

        return hoverInfo;
    }

    /**
     * Initialize LSP client
     */
    private async initializeLSP(context?: ParseContext): Promise<void> {
        if (this.lspInitializationPromise) {
            return this.lspInitializationPromise;
        }

        this.lspInitializationPromise = this.doInitializeLSP(context);
        return this.lspInitializationPromise;
    }

    /**
     * Perform LSP initialization
     */
    private async doInitializeLSP(context?: ParseContext): Promise<void> {
        try {
            // Check if LSP server is available
            const serverAvailable = await this.checkLSPServerAvailability();
            if (!serverAvailable) {
                throw new Error('LSP server not available');
            }

            // Create LSP client
            this.lspClient = new LSPClient(
                this.config.serverCommand,
                this.config.serverArgs,
                {
                    cwd: this.config.workspaceRoot,
                    env: {
                        ...process.env,
                        PYTHONPATH: this.config.pythonPath || process.env.PYTHON_PATH
                    },
                    timeout: 30000
                }
            );

            // Start LSP server
            await this.lspClient.start();

            // Initialize LSP server
            const initParams: LSPInitializeParams = {
                processId: process.pid,
                rootUri: this.pathToUri(this.config.workspaceRoot),
                capabilities: {
                    textDocument: {
                        documentSymbol: {
                            dynamicRegistration: false,
                            hierarchicalDocumentSymbolSupport: true
                        },
                        hover: {
                            dynamicRegistration: false,
                            contentFormat: ['markdown', 'plaintext']
                        },
                        definition: {
                            dynamicRegistration: false
                        }
                    },
                    workspace: {
                        configuration: true
                    }
                }
            };

            await this.lspClient.initialize(initParams);
            this.isLSPAvailable = true;

            this.emitProgress(context, { 
                type: 'fileParsed', 
                path: 'LSP server initialized' 
            });

        } catch (error) {
            this.isLSPAvailable = false;
            this.lspClient = null;
            throw error;
        }
    }

    /**
     * Check if LSP server is available
     */
    private async checkLSPServerAvailability(): Promise<boolean> {
        return new Promise((resolve) => {
            const child = spawn(this.config.serverCommand, ['--version'], {
                stdio: 'pipe',
                timeout: 5000
            });

            child.on('error', () => {
                resolve(false);
            });

            child.on('exit', (code) => {
                resolve(code === 0);
            });

            // Kill process after timeout
            setTimeout(() => {
                child.kill();
                resolve(false);
            }, 5000);
        });
    }

    /**
     * Convert file path to URI
     */
    private fileToUri(filePath: string): string {
        return this.pathToUri(path.resolve(filePath));
    }

    /**
     * Convert path to URI
     */
    private pathToUri(filePath: string): string {
        const absolutePath = path.resolve(filePath);
        return `file://${absolutePath}`;
    }

    /**
     * Check if LSP is available
     */
    get lspAvailable(): boolean {
        return this.isLSPAvailable;
    }

    /**
     * Get current configuration
     */
    getConfiguration(): PythonLSPConfig {
        return { ...this.config };
    }

    /**
     * Update configuration
     */
    updateConfiguration(updates: Partial<PythonLSPAdapterOptions>): void {
        this.config = {
            ...this.config,
            ...updates,
            symbolOptions: {
                ...this.config.symbolOptions,
                ...updates.symbolOptions
            }
        };
    }

    /**
     * Cleanup resources
     */
    async cleanup(): Promise<void> {
        if (this.lspClient) {
            try {
                await this.lspClient.shutdown();
            } catch (error) {
                // Ignore shutdown errors
            }
            this.lspClient = null;
        }
        this.isLSPAvailable = false;
        this.lspInitializationPromise = null;
    }

    /**
     * Get supported file extensions
     */
    getSupportedExtensions(): string[] {
        return ['.py'];
    }

    /**
     * Get adapter capabilities
     */
    getCapabilities(): {
        lsp: boolean;
        fallback: boolean;
        hover: boolean;
        definitions: boolean;
        typeHints: boolean;
        decorators: boolean;
    } {
        return {
            lsp: this.isLSPAvailable,
            fallback: this.config.enableFallback,
            hover: this.config.enableHover,
            definitions: this.config.enableDefinitions,
            typeHints: this.config.symbolOptions.extractTypeHints ?? true,
            decorators: this.config.symbolOptions.extractDecorators ?? true
        };
    }
}