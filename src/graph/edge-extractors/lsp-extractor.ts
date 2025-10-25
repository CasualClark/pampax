/**
 * LSP Edge Extractor
 * 
 * Extracts code relationships using Language Server Protocol capabilities:
 * - documentSymbol: hierarchical symbol information
 * - definition: find where symbols are defined
 * - references: find all references to symbols
 */

import { LSPClient, LSPDocumentSymbol, LSPLocation } from '../../adapters/lsp/lsp-client.js';
import { EdgeExtractor, GraphEdge, ExtractionOptions, EdgeType } from '../types.js';
import { Span } from '../../types/core.js';

export class LSPExtractor implements EdgeExtractor {
  readonly id = 'lsp';
  private readonly lspClient: LSPClient;
  private readonly LSP_CONFIDENCE = 0.8;

  constructor(lspClient: LSPClient) {
    this.lspClient = lspClient;
  }

  async extractEdges(spans: Span[], options: ExtractionOptions = {}): Promise<GraphEdge[]> {
    if (!this.isSupported()) {
      return [];
    }

    const startTime = Date.now();
    const timeoutMs = options.timeoutMs || 50;
    const maxEdges = options.maxEdges || 1000;
    const edges: GraphEdge[] = [];

    try {
      // Process spans with timeout protection
      const processPromise = this.processSpans(spans);
      const timeoutPromise = new Promise<GraphEdge[]>((_, reject) => {
        setTimeout(() => reject(new Error('Extraction timeout')), timeoutMs);
      });

      const extractedEdges = await Promise.race([processPromise, timeoutPromise]);
      edges.push(...extractedEdges);

    } catch (error) {
      // Log error but don't fail the entire extraction
      console.warn(`LSP extraction error: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Limit edges to prevent memory issues
    return edges.slice(0, maxEdges);
  }

  private async processSpans(spans: Span[]): Promise<GraphEdge[]> {
    const edges: GraphEdge[] = [];
    const symbolMap = new Map<string, Span>();

    // Build symbol lookup map
    for (const span of spans) {
      if (span.name) {
        const key = `${span.path}:${span.name}`;
        symbolMap.set(key, span);
      }
    }

    // Group spans by file for efficient processing
    const spansByFile = new Map<string, Span[]>();
    for (const span of spans) {
      if (!spansByFile.has(span.path)) {
        spansByFile.set(span.path, []);
      }
      spansByFile.get(span.path)!.push(span);
    }

    // Process each file
    for (const [filePath, fileSpans] of Array.from(spansByFile.entries())) {
      try {
        const fileEdges = await this.extractEdgesFromFile(filePath, fileSpans, symbolMap);
        edges.push(...fileEdges);
      } catch (error) {
        console.warn(`Failed to extract edges from ${filePath}:`, error);
      }
    }

    return edges;
  }

  private async extractEdgesFromFile(
    filePath: string,
    spans: Span[],
    symbolMap: Map<string, Span>
  ): Promise<GraphEdge[]> {
    const edges: GraphEdge[] = [];
    const fileUri = `file://${filePath}`;

    // Open document in LSP server
    await this.lspClient.openDocument(fileUri, this.getLanguageId(filePath), 1, '');

    // Get document symbols
    const symbols = await this.lspClient.getDocumentSymbols(fileUri);

    // Extract edges from LSP symbols
    for (const symbol of symbols) {
      const symbolEdges = await this.extractEdgesFromSymbol(symbol, filePath, spans, symbolMap);
      edges.push(...symbolEdges);
    }

    // Extract edges from span references
    for (const span of spans) {
      const referenceEdges = await this.extractEdgesFromReferences(span, filePath, symbolMap);
      edges.push(...referenceEdges);
    }

    return edges;
  }

  private async extractEdgesFromSymbol(
    symbol: LSPDocumentSymbol,
    filePath: string,
    spans: Span[],
    symbolMap: Map<string, Span>
  ): Promise<GraphEdge[]> {
    const edges: GraphEdge[] = [];

    // Find corresponding span
    const span = this.findSpanAtPosition(spans, symbol.selectionRange.start);
    if (!span) {
      return edges;
    }

    // Extract definition-reference relationships
    if (this.isCallableSymbol(symbol)) {
      const references = await this.lspClient.getReferences(
        `file://${filePath}`,
        symbol.selectionRange.start,
        false // exclude declaration
      );

      for (const ref of references) {
        const targetSpan = this.findSpanAtLocation(ref, spans);
        if (targetSpan && targetSpan.id !== span.id) {
          edges.push(this.createEdge(span.id, targetSpan.id, 'call', 'references'));
        }
      }
    }

    // Process hierarchical relationships (parent-child)
    if (symbol.children) {
      for (const child of symbol.children) {
        const childSpan = this.findSpanAtPosition(spans, child.selectionRange.start);
        if (childSpan) {
          // Parent-child relationship (could be various types)
          const edgeType = this.inferEdgeType(symbol, child);
          edges.push(this.createEdge(span.id, childSpan.id, edgeType, 'hierarchy'));
        }
      }
    }

    return edges;
  }

  private async extractEdgesFromReferences(
    span: Span,
    filePath: string,
    symbolMap: Map<string, Span>
  ): Promise<GraphEdge[]> {
    const edges: GraphEdge[] = [];

    if (!span.references) {
      return edges;
    }

    for (const ref of span.references) {
      // Find target span by name lookup
      const targetKey = `${ref.path}:${span.name}`;
      const targetSpan = symbolMap.get(targetKey);
      
      if (targetSpan && targetSpan.id !== span.id) {
        const edgeType = this.mapReferenceKindToEdgeType(ref.kind);
        edges.push(this.createEdge(span.id, targetSpan.id, edgeType, 'span-references'));
      }
    }

    return edges;
  }

  private findSpanAtPosition(spans: Span[], position: { line: number; character: number }): Span | null {
    for (const span of spans) {
      // Convert byte positions to line/character (simplified)
      // In a real implementation, you'd need to parse the file content
      if (this.isPositionInSpan(position, span)) {
        return span;
      }
    }
    return null;
  }

  private findSpanAtLocation(location: LSPLocation, spans: Span[]): Span | null {
    return this.findSpanAtPosition(spans, location.range.start);
  }

  private isPositionInSpan(position: { line: number; character: number }, span: Span): boolean {
    // Simplified check - in practice you'd need line/character mapping
    return true;
  }

  private isCallableSymbol(symbol: LSPDocumentSymbol): boolean {
    // LSP symbol kinds for callable entities
    const callableKinds = [6, 12]; // Method, Function
    return callableKinds.includes(symbol.kind);
  }

  private inferEdgeType(parent: LSPDocumentSymbol, child: LSPDocumentSymbol): EdgeType {
    // Infer edge type based on symbol kinds and names
    if (this.isTestSymbol(child) && this.isProductionSymbol(parent)) {
      return 'test-of';
    }
    
    if (this.isRouteSymbol(child)) {
      return 'routes';
    }
    
    if (this.isConfigSymbol(child)) {
      return 'config-key';
    }
    
    return 'call'; // Default to call for hierarchical relationships
  }

  private isTestSymbol(symbol: LSPDocumentSymbol): boolean {
    return /test|spec/i.test(symbol.name);
  }

  private isProductionSymbol(symbol: LSPDocumentSymbol): boolean {
    return !/test|spec/i.test(symbol.name);
  }

  private isRouteSymbol(symbol: LSPDocumentSymbol): boolean {
    return /route|endpoint|handler/i.test(symbol.name);
  }

  private isConfigSymbol(symbol: LSPDocumentSymbol): boolean {
    return /config|setting|option/i.test(symbol.name);
  }

  private mapReferenceKindToEdgeType(kind?: 'call' | 'read' | 'write'): EdgeType {
    switch (kind) {
      case 'call':
        return 'call';
      case 'read':
        return 'import';
      case 'write':
        return 'config-key';
      default:
        return 'call';
    }
  }

  private createEdge(
    sourceId: string,
    targetId: string,
    type: EdgeType,
    method: string
  ): GraphEdge {
    return {
      sourceId,
      targetId,
      type,
      confidence: this.LSP_CONFIDENCE,
      metadata: {
        extractor: this.id,
        lspMethod: method,
        timestamp: Date.now()
      }
    };
  }

  private getLanguageId(filePath: string): string {
    const ext = filePath.split('.').pop()?.toLowerCase();
    const languageMap: Record<string, string> = {
      'ts': 'typescript',
      'js': 'javascript',
      'py': 'python',
      'java': 'java',
      'go': 'go',
      'rs': 'rust',
      'cpp': 'cpp',
      'c': 'c',
      'cs': 'csharp',
      'php': 'php'
    };
    return languageMap[ext || ''] || 'plaintext';
  }

  getConfidence(): number {
    return this.LSP_CONFIDENCE;
  }

  isSupported(): boolean {
    return this.lspClient.ready;
  }
}