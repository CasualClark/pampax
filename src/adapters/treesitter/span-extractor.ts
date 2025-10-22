/**
 * Tree-sitter Span Extraction
 * 
 * Converts Tree-sitter syntax nodes to Span objects with proper
 * metadata extraction and relationship tracking.
 */

import { Span, SpanKind } from '../../types/core.js';
import { LanguageConfig } from './parser.js';
import Parser from 'tree-sitter';

export interface ExtractionContext {
    repo: string;
    filePath: string;
    source: string;
    config: LanguageConfig;
}

export interface SpanExtractor {
    extractSpans(tree: Parser.Tree, context: ExtractionContext): Span[];
}

/**
 * Default span extractor implementation
 */
export class DefaultSpanExtractor implements SpanExtractor {
    extractSpans(tree: Parser.Tree, context: ExtractionContext): Span[] {
        const spans: Span[] = [];
        const parentStack: string[] = [];

        this.walkNode(tree.rootNode, context, spans, parentStack);
        return spans;
    }

    private walkNode(
        node: Parser.SyntaxNode,
        context: ExtractionContext,
        spans: Span[],
        parentStack: string[]
    ): void {
        const { config, source, filePath, repo } = context;

        // Check if this node type should be extracted
        if (config.nodeTypes.includes(node.type)) {
            const span = this.extractSpan(node, context, parentStack);
            if (span) {
                spans.push(span);
                
                // Add this span to parent stack for child nodes
                parentStack.push(span.id);
                
                // Process children
                for (let i = 0; i < node.childCount; i++) {
                    const child = node.child(i);
                    if (child) {
                        this.walkNode(child, context, spans, parentStack);
                    }
                }
                
                // Remove from parent stack
                parentStack.pop();
            }
        } else {
            // Process children without adding to parent stack
            for (let i = 0; i < node.childCount; i++) {
                const child = node.child(i);
                if (child) {
                    this.walkNode(child, context, spans, parentStack);
                }
            }
        }
    }

    private extractSpan(
        node: Parser.SyntaxNode,
        context: ExtractionContext,
        parentStack: string[]
    ): Span | null {
        const { repo, filePath, source, config } = context;
        
        try {
            const name = this.extractName(node, source);
            if (!name) {
                return null;
            }

            const kind = this.mapNodeTypeToSpanKind(node.type);
            const signature = this.extractSignature(node, source);
            const doc = this.extractDocumentation(node, source, config.commentPatterns) || undefined;
            const references = this.extractReferences(node, source);

            return {
                id: this.createSpanId(repo, filePath, node, kind, name, signature, doc, parentStack),
                repo,
                path: filePath,
                byteStart: node.startIndex,
                byteEnd: node.endIndex,
                kind,
                name,
                signature,
                doc,
                parents: parentStack.length > 0 ? [...parentStack] : undefined,
                references
            };
        } catch (error) {
            console.warn(`Failed to extract span from ${node.type}:`, error);
            return null;
        }
    }

    private createSpanId(
        repo: string,
        filePath: string,
        node: Parser.SyntaxNode,
        kind: SpanKind,
        name: string,
        signature: string | undefined,
        doc: string | undefined,
        parents: string[]
    ): string {
        const crypto = require('crypto');
        const components = [
            repo,
            filePath,
            `${node.startIndex}-${node.endIndex}`,
            kind,
            name,
            signature || '',
            doc ? crypto.createHash('md5').update(doc).digest('hex').substring(0, 8) : '',
            parents.join(',')
        ];
        
        return crypto.createHash('sha256').update(components.join('|')).digest('hex').substring(0, 16);
    }

    private mapNodeTypeToSpanKind(nodeType: string): SpanKind {
        const mapping: Record<string, SpanKind> = {
            'function_definition': 'function',
            'function_declaration': 'function',
            'function_signature': 'function',
            'method_definition': 'method',
            'method_declaration': 'method',
            'class_definition': 'class',
            'class_declaration': 'class',
            'interface_declaration': 'interface',
            'enum_declaration': 'enum',
            'mixin_declaration': 'class',
            'extension_declaration': 'class',
            'struct_specifier': 'class',
            'struct_declaration': 'class',
            'struct_item': 'class',
            'trait_declaration': 'interface',
            'impl_item': 'class',
            'module': 'module',
            'module_definition': 'module',
            'property_declaration': 'property',
            'field_declaration': 'property',
            'variable_declaration': 'property',
            'top_level_variable_declaration': 'property',
            'initialized_variable_declaration': 'property',
            'const_declaration': 'property',
            'let_declaration': 'property',
            'assignment_expression': 'property'
        };

        return mapping[nodeType] as SpanKind || 'function';
    }

    private extractName(node: Parser.SyntaxNode, source: string): string | null {
        // Try different strategies to extract the name based on node type
        switch (node.type) {
            case 'function_definition':
            case 'function_declaration':
            case 'function_signature':
                return this.extractFunctionName(node, source);
            
            case 'method_definition':
            case 'method_declaration':
                return this.extractMethodName(node, source);
            
            case 'class_definition':
            case 'class_declaration':
            case 'interface_declaration':
            case 'enum_declaration':
            case 'mixin_declaration':
            case 'extension_declaration':
            case 'struct_specifier':
            case 'struct_declaration':
            case 'struct_item':
            case 'trait_declaration':
                return this.extractTypeName(node, source);
            
            case 'module':
            case 'module_definition':
                return this.extractModuleName(node, source);
            
            case 'property_declaration':
            case 'field_declaration':
            case 'variable_declaration':
            case 'top_level_variable_declaration':
            case 'initialized_variable_declaration':
            case 'const_declaration':
            case 'let_declaration':
                return this.extractVariableName(node, source);
            
            default:
                return this.extractGenericName(node, source);
        }
    }

    private extractFunctionName(node: Parser.SyntaxNode, source: string): string | null {
        // Look for identifier child
        for (let i = 0; i < node.childCount; i++) {
            const child = node.child(i);
            if (child && (child.type === 'identifier' || child.type === 'property_identifier')) {
                return source.slice(child.startIndex, child.endIndex);
            }
        }
        return null;
    }

    private extractMethodName(node: Parser.SyntaxNode, source: string): string | null {
        // Method names can be deeper in the tree
        function findIdentifier(n: Parser.SyntaxNode): string | null {
            if (n.type === 'identifier' || n.type === 'property_identifier') {
                const text = source.slice(n.startIndex, n.endIndex);
                // Skip keywords
                if (!['public', 'private', 'protected', 'static', 'function', 'abstract', 'final'].includes(text)) {
                    return text;
                }
            }
            
            for (let i = 0; i < n.childCount; i++) {
                const result = findIdentifier(n.child(i)!);
                if (result) return result;
            }
            return null;
        }
        
        return findIdentifier(node);
    }

    private extractTypeName(node: Parser.SyntaxNode, source: string): string | null {
        for (let i = 0; i < node.childCount; i++) {
            const child = node.child(i);
            if (child && (child.type === 'identifier' || child.type === 'type_identifier' || child.type === 'name')) {
                const text = source.slice(child.startIndex, child.endIndex);
                // Skip keywords
                if (!['class', 'interface', 'enum', 'struct', 'trait', 'mixin', 'extension'].includes(text)) {
                    return text;
                }
            }
        }
        return null;
    }

    private extractModuleName(node: Parser.SyntaxNode, source: string): string | null {
        return this.extractTypeName(node, source);
    }

    private extractVariableName(node: Parser.SyntaxNode, source: string): string | null {
        // For variables, look for the identifier being assigned
        for (let i = 0; i < node.childCount; i++) {
            const child = node.child(i);
            if (child && (child.type === 'identifier' || child.type === 'property_identifier')) {
                return source.slice(child.startIndex, child.endIndex);
            }
        }
        return null;
    }

    private extractGenericName(node: Parser.SyntaxNode, source: string): string | null {
        // Generic fallback - look for any identifier
        function findAnyIdentifier(n: Parser.SyntaxNode): string | null {
            if (n.type === 'identifier' || n.type === 'property_identifier' || n.type === 'type_identifier') {
                return source.slice(n.startIndex, n.endIndex);
            }
            
            for (let i = 0; i < n.childCount; i++) {
                const result = findAnyIdentifier(n.child(i)!);
                if (result) return result;
            }
            return null;
        }
        
        return findAnyIdentifier(node);
    }

    private extractSignature(node: Parser.SyntaxNode, source: string): string | undefined {
        // Extract the full text of the node as the signature
        const text = source.slice(node.startIndex, node.endIndex);
        
        // For large spans, truncate to reasonable signature length
        if (text.length > 200) {
            const lines = text.split('\n');
            if (lines.length > 1) {
                // Return first line + indicator
                return lines[0] + '...';
            } else {
                return text.substring(0, 200) + '...';
            }
        }
        
        return text;
    }

    private extractDocumentation(
        node: Parser.SyntaxNode,
        source: string,
        commentPatterns: RegExp[]
    ): string | null {
        const lookbackLimit = 500;
        const searchStart = Math.max(0, node.startIndex - lookbackLimit);
        const beforeNode = source.slice(searchStart, node.startIndex);

        for (const pattern of commentPatterns) {
            const matches = beforeNode.match(pattern);
            if (matches && matches.length > 0) {
                return matches[matches.length - 1].trim();
            }
        }

        return null;
    }

    private extractReferences(
        node: Parser.SyntaxNode,
        source: string
    ): Array<{ path: string; byteStart: number; byteEnd: number; kind?: "call"|"read"|"write" }> | undefined {
        const references: Array<{ path: string; byteStart: number; byteEnd: number; kind?: "call"|"read"|"write" }> = [];
        
        // Look for function calls, variable reads, etc. within this span
        this.findReferencesInNode(node, source, references);
        
        return references.length > 0 ? references : undefined;
    }

    private findReferencesInNode(
        node: Parser.SyntaxNode,
        source: string,
        references: Array<{ path: string; byteStart: number; byteEnd: number; kind?: "call"|"read"|"write" }>
    ): void {
        // Look for call expressions
        if (node.type === 'call_expression') {
            const functionNode = node.childForFieldName('function');
            if (functionNode && (functionNode.type === 'identifier' || functionNode.type === 'property_identifier')) {
                references.push({
                    path: '', // Will be filled in by caller
                    byteStart: functionNode.startIndex,
                    byteEnd: functionNode.endIndex,
                    kind: 'call'
                });
            }
        }
        
        // Look for identifier references (variable reads)
        if (node.type === 'identifier') {
            // Skip if this is the definition of the identifier
            const parent = node.parent;
            if (parent && !this.isDefinitionContext(node, parent)) {
                references.push({
                    path: '', // Will be filled in by caller
                    byteStart: node.startIndex,
                    byteEnd: node.endIndex,
                    kind: 'read'
                });
            }
        }
        
        // Recursively check children
        for (let i = 0; i < node.childCount; i++) {
            const child = node.child(i);
            if (child) {
                this.findReferencesInNode(child, source, references);
            }
        }
    }

    private isDefinitionContext(node: Parser.SyntaxNode, parent: Parser.SyntaxNode): boolean {
        // Check if this identifier is being defined (not referenced)
        const definitionContexts = [
            'function_definition',
            'function_declaration',
            'function_signature',
            'method_definition',
            'method_declaration',
            'class_definition',
            'class_declaration',
            'variable_declaration',
            'assignment_expression'
        ];
        
        return definitionContexts.includes(parent.type);
    }
}

/**
 * Fallback span extractor using regex patterns
 */
export class RegexSpanExtractor {
    extractSpans(context: ExtractionContext): Span[] {
        const { config, source, filePath, repo } = context;
        const spans: Span[] = [];

        if (!config.regexPatterns) {
            return spans;
        }

        // Extract classes
        if (config.regexPatterns.class) {
            this.extractWithRegex(
                source,
                config.regexPatterns.class,
                'class',
                (match, className) => {
                    return {
                        id: this.createRegexSpanId(repo, filePath, match.index || 0, 'class', className),
                        repo,
                        path: filePath,
                        byteStart: match.index || 0,
                        byteEnd: (match.index || 0) + match[0].length,
                        kind: 'class' as SpanKind,
                        name: className,
                        signature: match[0]
                    };
                },
                spans
            );
        }

        // Extract functions
        if (config.regexPatterns.function) {
            this.extractWithRegex(
                source,
                config.regexPatterns.function,
                'function',
                (match, functionName) => {
                    return {
                        id: this.createRegexSpanId(repo, filePath, match.index || 0, 'function', functionName),
                        repo,
                        path: filePath,
                        byteStart: match.index || 0,
                        byteEnd: (match.index || 0) + match[0].length,
                        kind: 'function' as SpanKind,
                        name: functionName,
                        signature: match[0]
                    };
                },
                spans
            );
        }

        // Extract variables
        if (config.regexPatterns.variable) {
            this.extractWithRegex(
                source,
                config.regexPatterns.variable,
                'variable',
                (match, varName) => {
                    return {
                        id: this.createRegexSpanId(repo, filePath, match.index || 0, 'property', varName),
                        repo,
                        path: filePath,
                        byteStart: match.index || 0,
                        byteEnd: (match.index || 0) + match[0].length,
                        kind: 'property' as SpanKind,
                        name: varName,
                        signature: match[0]
                    };
                },
                spans
            );
        }

        return spans;
    }

    private extractWithRegex(
        source: string,
        regex: RegExp,
        type: string,
        createSpan: (match: RegExpMatchArray, name: string) => Omit<Span, 'parents' | 'references' | 'doc'>,
        spans: Span[]
    ): void {
        let match;
        // Reset regex lastIndex to ensure fresh search
        regex.lastIndex = 0;
        
        while ((match = regex.exec(source)) !== null) {
            const name = match[1] || match[2] || match[3] || match[4];
            if (name && !this.isKeyword(name)) {
                const spanData = createSpan(match, name);
                spans.push({
                    ...spanData,
                    parents: undefined,
                    references: undefined,
                    doc: undefined
                });
            }
        }
    }

    private createRegexSpanId(
        repo: string,
        filePath: string,
        startIndex: number,
        kind: string,
        name: string
    ): string {
        const crypto = require('crypto');
        const components = [repo, filePath, `${startIndex}`, kind, name];
        return crypto.createHash('sha256').update(components.join('|')).digest('hex').substring(0, 16);
    }

    private findClassEnd(source: string, startIndex: number): number {
        let braceCount = 0;
        let inString = false;
        let stringChar = '';
        
        for (let i = startIndex; i < source.length; i++) {
            const char = source[i];
            
            if (!inString) {
                if (char === '"' || char === "'" || char === '`') {
                    inString = true;
                    stringChar = char;
                } else if (char === '{') {
                    braceCount++;
                } else if (char === '}') {
                    braceCount--;
                    if (braceCount === 0) {
                        return source.substring(0, i + 1).split('\n').length;
                    }
                }
            } else {
                if (char === stringChar && source[i - 1] !== '\\') {
                    inString = false;
                }
            }
        }
        return source.substring(0, startIndex).split('\n').length + 1;
    }

    private isKeyword(name: string): boolean {
        const keywords = new Set([
            'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'default', 'break', 'continue',
            'return', 'throw', 'try', 'catch', 'finally', 'class', 'interface', 'extends', 'implements',
            'import', 'export', 'from', 'as', 'new', 'this', 'super', 'static', 'final', 'const',
            'var', 'let', 'void', 'bool', 'int', 'double', 'String', 'List', 'Map', 'Set',
            'abstract', 'async', 'await', 'yield', 'sync', 'native', 'external', 'factory',
            'get', 'set', 'operator', 'with', 'mixin', 'on', 'show', 'hide', 'deferred',
            'required', 'part', 'of', 'in', 'is', 'assert', 'rethrow', 'null', 'true', 'false'
        ]);
        return keywords.has(name);
    }
}