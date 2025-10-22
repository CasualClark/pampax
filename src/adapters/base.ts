/**
 * Base Adapter Interface and Utilities
 * 
 * Implements the Adapter interface from the architecture specification
 * and provides common utilities for all adapters.
 */

import { Adapter, Span, IndexProgressEvent, SpanKind } from '../types/core.js';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

export interface ParseContext {
    repo: string;
    basePath: string;
    onProgress?: (event: IndexProgressEvent) => void;
}

export interface ParseResult {
    spans: Span[];
    errors: Array<{ path: string; error: string }>;
}

/**
 * Base adapter class that implements common functionality
 */
export abstract class BaseAdapter implements Adapter {
    abstract readonly id: string;

    /**
     * Check if this adapter supports the given file path
     */
    abstract supports(filePath: string): boolean;

    /**
     * Parse the given files and return spans
     */
    abstract parse(files: string[], context?: ParseContext): Promise<Span[]>;

    /**
     * Create a unique span ID
     */
    protected createSpanId(
        repo: string,
        filePath: string,
        byteStart: number,
        byteEnd: number,
        kind: SpanKind,
        name?: string,
        signature?: string,
        doc?: string,
        parents?: string[]
    ): string {
        const components = [
            repo,
            filePath,
            `${byteStart}-${byteEnd}`,
            kind,
            name || '',
            signature || '',
            doc ? crypto.createHash('md5').update(doc).digest('hex').substring(0, 8) : '',
            parents ? parents.join(',') : ''
        ];
        
        return crypto.createHash('sha256').update(components.join('|')).digest('hex').substring(0, 16);
    }

    /**
     * Create a span object with required fields
     */
    protected createSpan(params: {
        repo: string;
        path: string;
        byteStart: number;
        byteEnd: number;
        kind: SpanKind;
        name?: string;
        signature?: string;
        doc?: string;
        parents?: string[];
        references?: Array<{ path: string; byteStart: number; byteEnd: number; kind?: "call"|"read"|"write" }>;
    }): Span {
        const id = this.createSpanId(
            params.repo,
            params.path,
            params.byteStart,
            params.byteEnd,
            params.kind,
            params.name,
            params.signature,
            params.doc,
            params.parents
        );

        return {
            id,
            repo: params.repo,
            path: params.path,
            byteStart: params.byteStart,
            byteEnd: params.byteEnd,
            kind: params.kind,
            name: params.name,
            signature: params.signature,
            doc: params.doc,
            parents: params.parents,
            references: params.references
        };
    }

    /**
     * Read file content safely
     */
    protected readFileContent(filePath: string): string | null {
        try {
            return fs.readFileSync(filePath, 'utf8');
        } catch (error) {
            console.warn(`Failed to read file ${filePath}:`, error);
            return null;
        }
    }

    /**
     * Emit progress event if callback is provided
     */
    protected emitProgress(
        context: ParseContext | undefined,
        event: IndexProgressEvent
    ): void {
        if (context?.onProgress) {
            context.onProgress(event);
        }
    }

    /**
     * Convert file path to repo-relative path
     */
    protected getRelativePath(basePath: string, filePath: string): string {
        return path.relative(basePath, filePath);
    }

    /**
     * Extract documentation comments preceding a node
     */
    protected extractDocComments(
        source: string,
        startIndex: number,
        commentPatterns: RegExp[]
    ): string | null {
        const lookbackLimit = 500; // Look back 500 characters for comments
        const searchStart = Math.max(0, startIndex - lookbackLimit);
        const beforeNode = source.slice(searchStart, startIndex);

        for (const pattern of commentPatterns) {
            const matches = beforeNode.match(pattern);
            if (matches && matches.length > 0) {
                // Return the last (closest) comment
                return matches[matches.length - 1].trim();
            }
        }

        return null;
    }

    /**
     * Parse files with error handling and progress reporting
     */
    protected async parseFilesWithProgress(
        files: string[],
        context: ParseContext | undefined,
        parseFn: (filePath: string, content: string) => Promise<Span[]>
    ): Promise<ParseResult> {
        const spans: Span[] = [];
        const errors: Array<{ path: string; error: string }> = [];

        this.emitProgress(context, { type: 'start', totalFiles: files.length });

        for (const filePath of files) {
            try {
                const content = this.readFileContent(filePath);
                if (content === null) {
                    errors.push({ path: filePath, error: 'Failed to read file' });
                    continue;
                }

                const fileSpans = await parseFn(filePath, content);
                spans.push(...fileSpans);

                this.emitProgress(context, { type: 'fileParsed', path: filePath });
                this.emitProgress(context, { 
                    type: 'spansEmitted', 
                    path: filePath, 
                    count: fileSpans.length 
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

        // Note: 'done' event is typically emitted by the caller after all adapters complete
        return { spans, errors };
    }
}

/**
 * Registry for managing adapters
 */
export class AdapterRegistry {
    private adapters: Map<string, Adapter> = new Map();

    /**
     * Register an adapter
     */
    register(adapter: Adapter): void {
        this.adapters.set(adapter.id, adapter);
    }

    /**
     * Get an adapter by ID
     */
    get(id: string): Adapter | undefined {
        return this.adapters.get(id);
    }

    /**
     * Get all adapters
     */
    getAll(): Adapter[] {
        return Array.from(this.adapters.values());
    }

    /**
     * Find adapters that support the given file path
     */
    findSupporting(filePath: string): Adapter[] {
        return Array.from(this.adapters.values()).filter(adapter => 
            adapter.supports(filePath)
        );
    }

    /**
     * Get adapters by IDs
     */
    getByIds(ids: string[]): Adapter[] {
        return ids.map(id => this.adapters.get(id)).filter(Boolean) as Adapter[];
    }
}

// Global adapter registry instance
export const adapterRegistry = new AdapterRegistry();