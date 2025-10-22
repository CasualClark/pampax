/**
 * Python-specific LSP Symbol Extraction
 * 
 * Converts LSP document symbols to Span objects with Python-specific
 * semantic information and enhanced metadata.
 */

import { LSPDocumentSymbol, LSPHover } from './lsp-client.js';
import { Span, SpanKind } from '../../types/core.js';

// LSP Symbol Kind mapping to Python constructs
const LSP_SYMBOL_KIND_MAP: Record<number, SpanKind> = {
    1: 'module',         // File -> Module
    2: 'module',         // Module
    5: 'class',          // Class
    6: 'method',         // Method
    7: 'property',       // Property
    10: 'enum',          // Enum
    11: 'interface',     // Interface
    12: 'function',      // Function
};

// Python-specific LSP Symbol Kind names
const PYTHON_SYMBOL_KIND_NAMES: Record<number, string> = {
    5: 'class',
    6: 'method',
    7: 'property',
    11: 'interface',    // For protocols
    12: 'function',
    13: 'variable'
};

export interface PythonSymbolInfo {
    name: string;
    kind: SpanKind;
    detail?: string;
    signature?: string;
    doc?: string;
    decorators?: string[];
    typeHints?: {
        parameters?: string[];
        returns?: string;
        variables?: string[];
    };
    isAsync: boolean;
    isStatic: boolean;
    isProperty: boolean;
    isClassMethod: boolean;
    isPrivate: boolean;
    isDunder: boolean;
    parents: string[];
    children: PythonSymbolInfo[];
    range: {
        start: { line: number; character: number };
        end: { line: number; character: number };
    };
    selectionRange: {
        start: { line: number; character: number };
        end: { line: number; character: number };
    };
}

export interface PythonSpanExtractionOptions {
    includePrivateSymbols?: boolean;
    includeDunderSymbols?: boolean;
    maxDepth?: number;
    extractTypeHints?: boolean;
    extractDecorators?: boolean;
    extractDocstrings?: boolean;
}

/**
 * Convert LSP position to byte offset in source code
 */
export function positionToByteOffset(
    source: string,
    position: { line: number; character: number }
): number {
    const lines = source.split('\n');
    let byteOffset = 0;

    for (let i = 0; i < position.line && i < lines.length; i++) {
        byteOffset += lines[i].length + 1; // +1 for newline
    }

    if (position.line < lines.length) {
        byteOffset += Math.min(position.character, lines[position.line].length);
    }

    return byteOffset;
}

/**
 * Convert LSP range to byte range in source code
 */
export function rangeToByteRange(
    source: string,
    range: {
        start: { line: number; character: number };
        end: { line: number; character: number };
    }
): { byteStart: number; byteEnd: number } {
    const byteStart = positionToByteOffset(source, range.start);
    const byteEnd = positionToByteOffset(source, range.end);
    return { byteStart, byteEnd };
}

/**
 * Extract Python-specific information from symbol name and detail
 */
function extractPythonSymbolInfo(
    name: string,
    detail: string | undefined,
    kind: number
): {
    isAsync: boolean;
    isStatic: boolean;
    isProperty: boolean;
    isClassMethod: boolean;
    isPrivate: boolean;
    isDunder: boolean;
    decorators: string[];
    typeHints: {
        parameters?: string[];
        returns?: string;
    };
} {
    const isAsync = name.startsWith('async ') || (detail && detail.includes('async'));
    const isStatic = Boolean(detail && (detail.includes('@staticmethod') || detail.includes('static')));
    const isProperty = Boolean(detail && (detail.includes('@property') || detail.includes('property')));
    const isClassMethod = Boolean(detail && (detail.includes('@classmethod') || detail.includes('classmethod')));
    const isPrivate = Boolean(name.startsWith('_') && !name.startsWith('__'));
    const isDunder = Boolean(name.startsWith('__') && name.endsWith('__') && name.length > 4);

    // Extract decorators from detail
    const decorators: string[] = [];
    if (detail) {
        const decoratorMatches = detail.match(/@(\w+)/g);
        if (decoratorMatches) {
            decorators.push(...decoratorMatches.map(d => d.slice(1)));
        }
    }

    // Extract type hints from detail
    const typeHints = {
        parameters: [] as string[],
        returns: undefined as string | undefined
    };

    if (detail) {
        // Extract parameter types
        const paramMatches = detail.match(/(\w+):\s*([^,)=]+)/g);
        if (paramMatches) {
            for (const match of paramMatches) {
                const colonIndex = match.indexOf(':');
                if (colonIndex > 0) {
                    const paramName = match.substring(0, colonIndex).trim();
                    const paramType = match.substring(colonIndex + 1).trim();
                    if (paramName !== 'def' && paramName !== 'async') {
                        typeHints.parameters.push(`${paramName}: ${paramType}`);
                    }
                }
            }
        }

        // Extract return type
        const returnMatch = detail.match(/->\s*([^{]+)/);
        if (returnMatch) {
            typeHints.returns = returnMatch[1].trim();
        }
    }

    return {
        isAsync: Boolean(isAsync),
        isStatic: Boolean(isStatic),
        isProperty: Boolean(isProperty),
        isClassMethod: Boolean(isClassMethod),
        isPrivate: Boolean(isPrivate),
        isDunder: Boolean(isDunder),
        decorators,
        typeHints
    };
}

/**
 * Parse docstring from hover content
 */
function parseDocstringFromHover(hover: LSPHover | null): string | null {
    if (!hover) return null;

    let content = '';
    if (typeof hover.contents === 'string') {
        content = hover.contents;
    } else if (Array.isArray(hover.contents)) {
        content = hover.contents.map(item => 
            typeof item === 'string' ? item : item.value
        ).join('\n');
    } else if (hover.contents && typeof hover.contents === 'object' && 'value' in (hover.contents as any)) {
        content = (hover.contents as any).value;
    }

    // Extract docstring from markdown or other formats
    // Remove common markdown patterns
    content = content.replace(/^```python\n?/gm, '').replace(/```\n?$/gm, '');
    content = content.replace(/^```(\w+)?\n?/gm, '').replace(/```\n?$/gm, '');
    
    // Clean up whitespace
    content = content.trim();

    return content || null;
}

/**
 * Convert LSP document symbol to Python symbol info
 */
function lspSymbolToPythonSymbolInfo(
    lspSymbol: LSPDocumentSymbol,
    source: string,
    options: PythonSpanExtractionOptions,
    depth: number = 0
): PythonSymbolInfo {
    const kind = LSP_SYMBOL_KIND_MAP[lspSymbol.kind] || 'function';
    const pythonInfo = extractPythonSymbolInfo(lspSymbol.name, lspSymbol.detail, lspSymbol.kind);

    // Filter based on options
    if (!options.includePrivateSymbols && pythonInfo.isPrivate) {
        // Return a placeholder that will be filtered out later
        return {
            name: lspSymbol.name,
            kind,
            detail: lspSymbol.detail,
            parents: [],
            children: [],
            isAsync: pythonInfo.isAsync,
            isStatic: pythonInfo.isStatic,
            isProperty: pythonInfo.isProperty,
            isClassMethod: pythonInfo.isClassMethod,
            isPrivate: pythonInfo.isPrivate,
            isDunder: pythonInfo.isDunder,
            range: lspSymbol.range,
            selectionRange: lspSymbol.selectionRange
        };
    }

    if (!options.includeDunderSymbols && pythonInfo.isDunder) {
        // Return a placeholder that will be filtered out later
        return {
            name: lspSymbol.name,
            kind,
            detail: lspSymbol.detail,
            parents: [],
            children: [],
            isAsync: pythonInfo.isAsync,
            isStatic: pythonInfo.isStatic,
            isProperty: pythonInfo.isProperty,
            isClassMethod: pythonInfo.isClassMethod,
            isPrivate: pythonInfo.isPrivate,
            isDunder: pythonInfo.isDunder,
            range: lspSymbol.range,
            selectionRange: lspSymbol.selectionRange
        };
    }

    // Process children recursively
    const children = lspSymbol.children
        ? lspSymbol.children
            .filter(child => depth < (options.maxDepth || 10))
            .map(child => lspSymbolToPythonSymbolInfo(child, source, options, depth + 1))
            .filter(child => 
                (options.includePrivateSymbols || !child.isPrivate) &&
                (options.includeDunderSymbols || !child.isDunder)
            )
        : [];

    return {
        name: lspSymbol.name,
        kind,
        detail: lspSymbol.detail,
        signature: lspSymbol.detail,
        decorators: pythonInfo.decorators,
        typeHints: options.extractTypeHints ? pythonInfo.typeHints : undefined,
        isAsync: pythonInfo.isAsync,
        isStatic: pythonInfo.isStatic,
        isProperty: pythonInfo.isProperty,
        isClassMethod: pythonInfo.isClassMethod,
        isPrivate: pythonInfo.isPrivate,
        isDunder: pythonInfo.isDunder,
        parents: [],
        children,
        range: lspSymbol.range,
        selectionRange: lspSymbol.selectionRange
    };
}

/**
 * Build parent-child relationships
 */
function buildParentRelationships(symbols: PythonSymbolInfo[]): void {
    for (const symbol of symbols) {
        for (const child of symbol.children) {
            child.parents.push(symbol.name);
        }
        // Recursively build relationships for children
        buildParentRelationships(symbol.children);
    }
}

/**
 * Flatten symbol hierarchy to a list
 */
function flattenSymbols(symbols: PythonSymbolInfo[]): PythonSymbolInfo[] {
    const result: PythonSymbolInfo[] = [];
    
    for (const symbol of symbols) {
        result.push(symbol);
        if (symbol.children.length > 0) {
            result.push(...flattenSymbols(symbol.children));
        }
    }
    
    return result;
}

/**
 * Convert Python symbol info to Span
 */
function pythonSymbolInfoToSpan(
    symbol: PythonSymbolInfo,
    repo: string,
    filePath: string,
    source: string,
    doc?: string
): Span {
    const { byteStart, byteEnd } = rangeToByteRange(source, symbol.range);
    const { byteStart: selectionStart, byteEnd: selectionEnd } = rangeToByteRange(source, symbol.selectionRange);

    // Build enhanced signature
    let signature = symbol.signature || symbol.name;
    
    if (symbol.decorators && symbol.decorators.length > 0) {
        signature = symbol.decorators.map(d => `@${d}`).join('\n') + '\n' + signature;
    }

    if (symbol.typeHints) {
        // Enhance signature with type hints if not already present
        if (!signature.includes('->') && symbol.typeHints.returns) {
            signature += ` -> ${symbol.typeHints.returns}`;
        }
    }

    // Build documentation
    let documentation = doc;
    if (!documentation && symbol.detail) {
        documentation = symbol.detail;
    }

    // Add metadata to documentation
    if (symbol.isAsync || symbol.isStatic || symbol.isProperty || symbol.isClassMethod) {
        const modifiers = [];
        if (symbol.isAsync) modifiers.push('async');
        if (symbol.isStatic) modifiers.push('static');
        if (symbol.isProperty) modifiers.push('property');
        if (symbol.isClassMethod) modifiers.push('classmethod');
        
        if (modifiers.length > 0) {
            documentation = documentation ? 
                `${modifiers.join(' ')} ${documentation}` : 
                modifiers.join(' ');
        }
    }

    return {
        id: '', // Will be generated by BaseAdapter
        repo,
        path: filePath,
        byteStart: selectionStart, // Use selection range for more precise spans
        byteEnd: selectionEnd,
        kind: symbol.kind,
        name: symbol.name,
        signature,
        doc: documentation,
        parents: symbol.parents,
        references: [] // Could be populated with definition/reference requests
    };
}

/**
 * Extract Python spans from LSP document symbols
 */
export function extractPythonSpansFromLSP(
    lspSymbols: LSPDocumentSymbol[],
    repo: string,
    filePath: string,
    source: string,
    options: PythonSpanExtractionOptions = {},
    hoverInfo?: Map<string, LSPHover>
): Span[] {
    // Convert LSP symbols to Python symbol info
    const pythonSymbols = lspSymbols
        .map(lspSymbol => lspSymbolToPythonSymbolInfo(lspSymbol, source, options))
        .filter(symbol => 
            (options.includePrivateSymbols || !symbol.isPrivate) &&
            (options.includeDunderSymbols || !symbol.isDunder)
        );

    // Build parent-child relationships
    buildParentRelationships(pythonSymbols);

    // Flatten hierarchy
    const flatSymbols = flattenSymbols(pythonSymbols);

    // Convert to spans
    const spans = flatSymbols.map(symbol => {
        const doc = hoverInfo?.get(symbol.name);
        const documentation = options.extractDocstrings ? 
            parseDocstringFromHover(doc || null) : undefined;
        
        return pythonSymbolInfoToSpan(symbol, repo, filePath, source, documentation || undefined);
    });

    // Add module span if not present
    const moduleSpan = spans.find(s => s.kind === 'module');
    if (!moduleSpan) {
        const moduleName = filePath.split('/').pop()?.replace('.py', '') || 'module';
        spans.push({
            id: '', // Will be generated by BaseAdapter
            repo,
            path: filePath,
            byteStart: 0,
            byteEnd: source.length,
            kind: 'module',
            name: moduleName,
            doc: undefined,
            parents: [],
            references: []
        });
    }

    return spans;
}

/**
 * Get default Python span extraction options
 */
export function getDefaultPythonSpanOptions(): PythonSpanExtractionOptions {
    return {
        includePrivateSymbols: false,
        includeDunderSymbols: false,
        maxDepth: 10,
        extractTypeHints: true,
        extractDecorators: true,
        extractDocstrings: true
    };
}

/**
 * Check if a symbol should be included based on visibility
 */
export function shouldIncludeSymbol(
    symbol: PythonSymbolInfo,
    options: PythonSpanExtractionOptions
): boolean {
    if (!options.includePrivateSymbols && symbol.isPrivate) {
        return false;
    }
    
    if (!options.includeDunderSymbols && symbol.isDunder) {
        return false;
    }
    
    return true;
}