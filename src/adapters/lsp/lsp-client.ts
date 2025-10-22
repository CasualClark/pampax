/**
 * Generic LSP Client Utilities
 * 
 * Provides JSON-RPC communication with Language Server Protocol servers
 * over stdio with proper message framing and error handling.
 */

import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';

export interface LSPInitializeParams {
    processId: number | null;
    rootUri: string | null;
    workspaceFolders?: Array<{ uri: string; name: string }>;
    initializationOptions?: any;
    capabilities: LSPClientCapabilities;
}

export interface LSPClientCapabilities {
    textDocument?: {
        documentSymbol?: {
            dynamicRegistration?: boolean;
            hierarchicalDocumentSymbolSupport?: boolean;
        };
        hover?: {
            dynamicRegistration?: boolean;
            contentFormat?: string[];
        };
        definition?: {
            dynamicRegistration?: boolean;
        };
        references?: {
            dynamicRegistration?: boolean;
        };
    };
    workspace?: {
        configuration?: boolean;
    };
}

export interface LSPDocumentSymbol {
    name: string;
    detail?: string;
    kind: number;
    kindName?: string;
    deprecated?: boolean;
    range: {
        start: { line: number; character: number };
        end: { line: number; character: number };
    };
    selectionRange: {
        start: { line: number; character: number };
        end: { line: number; character: number };
    };
    children?: LSPDocumentSymbol[];
}

export interface LSPLocation {
    uri: string;
    range: {
        start: { line: number; character: number };
        end: { line: number; character: number };
    };
}

export interface LSPHover {
    contents: string | { kind: string; value: string }[];
    range?: {
        start: { line: number; character: number };
        end: { line: number; character: number };
    };
}

export interface LSPMessage {
    jsonrpc: '2.0';
    id?: number | string;
    method?: string;
    params?: any;
    result?: any;
    error?: {
        code: number;
        message: string;
        data?: any;
    };
}

export class LSPClient extends EventEmitter {
    private process: ChildProcess | null = null;
    private messageId = 1;
    private pendingRequests = new Map<number | string, {
        resolve: (value: any) => void;
        reject: (error: Error) => void;
        timeout: NodeJS.Timeout;
    }>();
    private isInitialized = false;
    private isReady = false;

    constructor(
        private serverCommand: string,
        private serverArgs: string[] = [],
        private options: {
            cwd?: string;
            env?: NodeJS.ProcessEnv;
            timeout?: number;
        } = {}
    ) {
        super();
        this.options.timeout = this.options.timeout || 30000; // 30 seconds default
    }

    /**
     * Start the LSP server process
     */
    async start(): Promise<void> {
        if (this.process) {
            throw new Error('LSP client already started');
        }

        return new Promise((resolve, reject) => {
            try {
                this.process = spawn(this.serverCommand, this.serverArgs, {
                    stdio: ['pipe', 'pipe', 'pipe'],
                    cwd: this.options.cwd,
                    env: { ...process.env, ...this.options.env }
                });

                if (!this.process.stdin || !this.process.stdout || !this.process.stderr) {
                    throw new Error('Failed to create stdio pipes for LSP server');
                }

                let buffer = '';
                this.process.stdout.on('data', (data) => {
                    buffer += data.toString();
                    this.processMessages(buffer);
                    buffer = '';
                });

                this.process.stderr.on('data', (data) => {
                    const message = data.toString();
                    this.emit('stderr', message);
                });

                this.process.on('error', (error) => {
                    this.emit('error', error);
                    reject(error);
                });

                this.process.on('exit', (code, signal) => {
                    this.emit('exit', code, signal);
                    this.cleanup();
                });

                this.process.on('close', () => {
                    this.cleanup();
                });

                resolve();
            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Initialize the LSP server
     */
    async initialize(params: LSPInitializeParams): Promise<any> {
        if (!this.process) {
            throw new Error('LSP client not started');
        }

        if (this.isInitialized) {
            throw new Error('LSP client already initialized');
        }

        const result = await this.sendRequest('initialize', params);
        this.isInitialized = true;

        // Send initialized notification
        await this.sendNotification('initialized', {});

        this.isReady = true;
        this.emit('ready');

        return result;
    }

    /**
     * Open a document in the LSP server
     */
    async openDocument(uri: string, languageId: string, version: number, text: string): Promise<void> {
        await this.sendNotification('textDocument/didOpen', {
            textDocument: {
                uri,
                languageId,
                version,
                text
            }
        });
    }

    /**
     * Get document symbols
     */
    async getDocumentSymbols(uri: string): Promise<LSPDocumentSymbol[]> {
        const result = await this.sendRequest('textDocument/documentSymbol', {
            textDocument: { uri }
        });

        // Handle both flat and hierarchical symbol formats
        if (Array.isArray(result)) {
            return result;
        } else if (result && Array.isArray(result)) {
            return result;
        }
        return [];
    }

    /**
     * Get hover information
     */
    async getHover(uri: string, position: { line: number; character: number }): Promise<LSPHover | null> {
        try {
            const result = await this.sendRequest('textDocument/hover', {
                textDocument: { uri },
                position
            });
            return result;
        } catch (error) {
            // Hover is optional, so don't throw
            return null;
        }
    }

    /**
     * Get definitions
     */
    async getDefinition(uri: string, position: { line: number; character: number }): Promise<LSPLocation[]> {
        try {
            const result = await this.sendRequest('textDocument/definition', {
                textDocument: { uri },
                position
            });

            if (Array.isArray(result)) {
                return result;
            } else if (result) {
                return [result];
            }
            return [];
        } catch (error) {
            // Definition is optional
            return [];
        }
    }

    /**
     * Get references
     */
    async getReferences(
        uri: string, 
        position: { line: number; character: number },
        includeDeclaration: boolean = true
    ): Promise<LSPLocation[]> {
        try {
            const result = await this.sendRequest('textDocument/references', {
                textDocument: { uri },
                position,
                context: { includeDeclaration }
            });

            if (Array.isArray(result)) {
                return result;
            }
            return [];
        } catch (error) {
            // References is optional
            return [];
        }
    }

    /**
     * Send a request and wait for response
     */
    private async sendRequest(method: string, params: any): Promise<any> {
        if (!this.process || !this.process.stdin) {
            throw new Error('LSP client not connected');
        }

        const id = this.messageId++;
        const message: LSPMessage = {
            jsonrpc: '2.0',
            id,
            method,
            params
        };

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.pendingRequests.delete(id);
                reject(new Error(`LSP request timeout: ${method}`));
            }, this.options.timeout);

            this.pendingRequests.set(id, { resolve, reject, timeout });

            this.sendMessage(message);
        });
    }

    /**
     * Send a notification (no response expected)
     */
    private async sendNotification(method: string, params: any): Promise<void> {
        if (!this.process || !this.process.stdin) {
            throw new Error('LSP client not connected');
        }

        const message: LSPMessage = {
            jsonrpc: '2.0',
            method,
            params
        };

        this.sendMessage(message);
    }

    /**
     * Send a message to the LSP server
     */
    private sendMessage(message: LSPMessage): void {
        if (!this.process || !this.process.stdin) {
            throw new Error('LSP client not connected');
        }

        const content = JSON.stringify(message);
        const header = `Content-Length: ${Buffer.byteLength(content, 'utf-8')}\r\n\r\n`;

        this.process.stdin.write(header + content, 'utf-8');
    }

    /**
     * Process incoming messages from the LSP server
     */
    private processMessages(data: string): void {
        // Parse Content-Length headers
        const lines = data.split('\r\n');
        let contentLength = 0;
        let headerEnd = 0;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (line === '') {
                headerEnd = i + 1;
                break;
            }
            const match = line.match(/^Content-Length:\s*(\d+)$/);
            if (match) {
                contentLength = parseInt(match[1], 10);
            }
        }

        if (contentLength === 0) {
            return;
        }

        // Extract the JSON content
        const messageStart = lines.slice(headerEnd).join('\r\n').trim();
        if (messageStart.length === 0) {
            return;
        }

        try {
            const message: LSPMessage = JSON.parse(messageStart);
            this.handleMessage(message);
        } catch (error) {
            this.emit('error', new Error(`Failed to parse LSP message: ${error}`));
        }
    }

    /**
     * Handle a received message
     */
    private handleMessage(message: LSPMessage): void {
        if (message.id !== undefined) {
            // Response to a request
            const pending = this.pendingRequests.get(message.id);
            if (pending) {
                clearTimeout(pending.timeout);
                this.pendingRequests.delete(message.id);

                if (message.error) {
                    pending.reject(new Error(`LSP error: ${message.error.message}`));
                } else {
                    pending.resolve(message.result);
                }
            }
        } else if (message.method) {
            // Notification or request from server
            this.emit(message.method, message.params);
        }
    }

    /**
     * Shutdown the LSP server
     */
    async shutdown(): Promise<void> {
        if (!this.process) {
            return;
        }

        try {
            if (this.isReady) {
                await this.sendRequest('shutdown', null);
                await this.sendNotification('exit', null);
            }
        } catch (error) {
            // Ignore errors during shutdown
        }

        this.cleanup();
    }

    /**
     * Force stop the LSP server
     */
    stop(): void {
        this.cleanup();
    }

    /**
     * Clean up resources
     */
    private cleanup(): void {
        // Clear pending requests
        for (const [id, pending] of this.pendingRequests) {
            clearTimeout(pending.timeout);
            pending.reject(new Error('LSP client disconnected'));
        }
        this.pendingRequests.clear();

        // Kill process
        if (this.process) {
            this.process.kill();
            this.process = null;
        }

        this.isInitialized = false;
        this.isReady = false;
    }

    /**
     * Check if the client is ready
     */
    get ready(): boolean {
        return this.isReady;
    }

    /**
     * Check if the client is initialized
     */
    get initialized(): boolean {
        return this.isInitialized;
    }
}