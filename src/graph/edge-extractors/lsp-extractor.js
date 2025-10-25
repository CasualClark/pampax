/**
 * LSP Edge Extractor
 * 
 * Extracts code relationships using Language Server Protocol capabilities:
 * - documentSymbol: hierarchical symbol information
 * - definition: find where symbols are defined
 * - references: find all references to symbols
 */

export class LSPExtractor {
  constructor(lspClient) {
    this.id = 'lsp';
    this.lspClient = lspClient;
    this.LSP_CONFIDENCE = 0.8;
  }

  async extractEdges(spans, options = {}) {
    if (!this.isSupported()) {
      return [];
    }

    const timeoutMs = options.timeoutMs || 50;
    const maxEdges = options.maxEdges || 1000;
    const edges = [];

    try {
      // Process spans with timeout protection
      const processPromise = this.processSpans(spans);
      const timeoutPromise = new Promise((_, reject) => {
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

  async processSpans(spans) {
    const edges = [];
    const symbolMap = new Map();

    // Build symbol lookup map
    for (const span of spans) {
      if (span.name) {
        const key = `${span.path}:${span.name}`;
        symbolMap.set(key, span);
      }
    }

    // Group spans by file for efficient processing
    const spansByFile = new Map();
    for (const span of spans) {
      if (!spansByFile.has(span.path)) {
        spansByFile.set(span.path, []);
      }
      spansByFile.get(span.path).push(span);
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

  async extractEdgesFromFile(filePath, spans, symbolMap) {
    const edges = [];
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
      const referenceEdges = await this.extractEdgesFromReferences(span, symbolMap);
      edges.push(...referenceEdges);
    }

    return edges;
  }

  async extractEdgesFromSymbol(symbol, filePath, spans, symbolMap) {
    const edges = [];

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

  async extractEdgesFromReferences(span, symbolMap) {
    const edges = [];

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

  findSpanAtPosition(spans, position) {
    for (const span of spans) {
      // Convert byte positions to line/character (simplified)
      // In a real implementation, you'd need to parse the file content
      if (this.isPositionInSpan(position, span)) {
        return span;
      }
    }
    return null;
  }

  findSpanAtLocation(location, spans) {
    return this.findSpanAtPosition(spans, location.range.start);
  }

  isPositionInSpan(position, span) {
    // Simplified check - in practice you'd need line/character mapping
    return true;
  }

  isCallableSymbol(symbol) {
    // LSP symbol kinds for callable entities
    const callableKinds = [6, 12]; // Method, Function
    return callableKinds.includes(symbol.kind);
  }

  inferEdgeType(parent, child) {
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

  isTestSymbol(symbol) {
    return /test|spec/i.test(symbol.name);
  }

  isProductionSymbol(symbol) {
    return !/test|spec/i.test(symbol.name);
  }

  isRouteSymbol(symbol) {
    return /route|endpoint|handler/i.test(symbol.name);
  }

  isConfigSymbol(symbol) {
    return /config|setting|option/i.test(symbol.name);
  }

  mapReferenceKindToEdgeType(kind) {
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

  createEdge(sourceId, targetId, type, method) {
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

  getLanguageId(filePath) {
    const ext = filePath.split('.').pop()?.toLowerCase();
    const languageMap = {
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

  getConfidence() {
    return this.LSP_CONFIDENCE;
  }

  isSupported() {
    return this.lspClient.ready;
  }
}