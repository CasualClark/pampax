/**
 * Heuristic Edge Extractor
 * 
 * Fallback edge extraction when LSP/SCIP are unavailable:
 * - Pattern-based detection of code relationships
 * - Text analysis and AST-like heuristics
 * - Lower confidence but ensures coverage
 */

import { EdgeExtractor, GraphEdge, ExtractionOptions, EdgeType } from '../types.js';
import { Span } from '../../types/core.js';
import * as fs from 'fs';

interface HeuristicPattern {
  name: string;
  pattern: RegExp;
  edgeType: EdgeType;
  confidence: number;
}

export class HeuristicExtractor implements EdgeExtractor {
  readonly id = 'heuristic';
  private readonly HEURISTIC_CONFIDENCE = 0.6;
  private readonly patterns: HeuristicPattern[];

  constructor() {
    this.patterns = this.initializePatterns();
  }

  async extractEdges(spans: Span[], options: ExtractionOptions = {}): Promise<GraphEdge[]> {
    const startTime = Date.now();
    const timeoutMs = options.timeoutMs || 50;
    const maxEdges = options.maxEdges || 1000;

    try {
      const processPromise = this.processSpans(spans);
      const timeoutPromise = new Promise<GraphEdge[]>((_, reject) => {
        setTimeout(() => reject(new Error('Heuristic extraction timeout')), timeoutMs);
      });

      const edges = await Promise.race([processPromise, timeoutPromise]);
      return edges.slice(0, maxEdges);
    } catch (error) {
      console.warn(`Heuristic extraction error: ${error instanceof Error ? error.message : String(error)}`);
      return [];
    }
  }

  private async processSpans(spans: Span[]): Promise<GraphEdge[]> {
    const edges: GraphEdge[] = [];
    const spansByFile = new Map<string, Span[]>();

    // Group spans by file
    for (const span of spans) {
      if (!spansByFile.has(span.path)) {
        spansByFile.set(span.path, []);
      }
      spansByFile.get(span.path)!.push(span);
    }

    // Process each file
    for (const [filePath, fileSpans] of Array.from(spansByFile.entries())) {
      const fileEdges = await this.extractEdgesFromFile(filePath, fileSpans, spans);
      edges.push(...fileEdges);
    }

    // Add cross-file edges based on imports and references
    const crossFileEdges = this.extractCrossFileEdges(spans);
    edges.push(...crossFileEdges);

    return edges;
  }

  private async extractEdgesFromFile(filePath: string, fileSpans: Span[], allSpans: Span[]): Promise<GraphEdge[]> {
    const edges: GraphEdge[] = [];
    
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n');

      // Extract edges using pattern matching
      for (const span of fileSpans) {
        const spanEdges = this.extractEdgesForSpan(span, content, lines, allSpans);
        edges.push(...spanEdges);
      }

      // Extract edges from file-level patterns
      const fileEdges = this.extractFileLevelEdges(content, fileSpans);
      edges.push(...fileEdges);

    } catch (error) {
      console.warn(`Failed to read file ${filePath}:`, error);
    }

    return edges;
  }

  private extractEdgesForSpan(span: Span, content: string, lines: string[], allSpans: Span[]): GraphEdge[] {
    const edges: GraphEdge[] = [];

    if (!span.name) {
      return edges;
    }

    // Extract call edges
    const callEdges = this.extractCallEdges(span, content, allSpans);
    edges.push(...callEdges);

    // Extract import edges
    const importEdges = this.extractImportEdges(span, content, allSpans);
    edges.push(...importEdges);

    // Extract configuration edges
    const configEdges = this.extractConfigEdges(span, content, allSpans);
    edges.push(...configEdges);

    // Extract route edges
    const routeEdges = this.extractRouteEdges(span, content, allSpans);
    edges.push(...routeEdges);

    return edges;
  }

  private extractCallEdges(span: Span, content: string, allSpans: Span[]): GraphEdge[] {
    const edges: GraphEdge[] = [];

    if (span.kind !== 'function' && span.kind !== 'method') {
      return edges;
    }

    // Pattern to find function calls within the span
    const callPatterns = [
      /\b(\w+)\s*\(/g,  // function_name(
      /\b(\w+)\.(\w+)\s*\(/g,  // object.method(
      /\bawait\s+(\w+)\s*\(/g,  // await function_name(
    ];

    for (const pattern of callPatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const calledFunction = match[1] || match[2];
        if (calledFunction && calledFunction !== span.name) {
          const targetSpan = this.findSpanByName(calledFunction, allSpans);
          if (targetSpan && targetSpan.id !== span.id) {
            edges.push(this.createEdge(span.id, targetSpan.id, 'call', 'pattern-match', pattern.source));
          }
        }
      }
    }

    return edges;
  }

  private extractImportEdges(span: Span, content: string, allSpans: Span[]): GraphEdge[] {
    const edges: GraphEdge[] = [];

    if (span.kind !== 'module') {
      return edges;
    }

    // Import patterns for different languages
    const importPatterns = [
      /import\s+(?:.*\s+from\s+)?['"]([^'"]+)['"]/g,  // Python/JS imports
      /from\s+(\w+(?:\.\w+)*)\s+import/g,  // Python from imports
      /#include\s+[<"]([^>"]+)[>"]/g,  // C/C++ includes
      /package\s+(\w+(?:\.\w+)*)/g,  // Java/Go packages
    ];

    for (const pattern of importPatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const importedModule = match[1];
        if (importedModule) {
          const targetSpan = this.findSpanByModule(importedModule, allSpans);
          if (targetSpan && targetSpan.id !== span.id) {
            edges.push(this.createEdge(span.id, targetSpan.id, 'import', 'import-pattern', pattern.source));
          }
        }
      }
    }

    return edges;
  }

  private extractConfigEdges(span: Span, content: string, allSpans: Span[]): GraphEdge[] {
    const edges: GraphEdge[] = [];

    // Configuration patterns
    const configPatterns = [
      /config\.(\w+)/g,  // config.key
      /process\.env\.(\w+)/g,  // process.env.KEY
      /os\.getenv\(['"]([^'"]+)['"]\)/g,  // os.getenv('KEY')
      /getenv\(['"]([^'"]+)['"]\)/g,  // getenv('KEY')
    ];

    for (const pattern of configPatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const configKey = match[1];
        if (configKey) {
          const targetSpan = this.findSpanByName(configKey, allSpans);
          if (targetSpan && targetSpan.id !== span.id) {
            edges.push(this.createEdge(span.id, targetSpan.id, 'config-key', 'config-pattern', pattern.source));
          }
        }
      }
    }

    return edges;
  }

  private extractRouteEdges(span: Span, content: string, allSpans: Span[]): GraphEdge[] {
    const edges: GraphEdge[] = [];

    // Route patterns for web frameworks
    const routePatterns = [
      /@app\.route\(['"]([^'"]+)['"]\)/g,  // Flask
      /router\.get\(['"]([^'"]+)['"]\)/g,  // Express
      /@GetMapping\(['"]([^'"]+)['"]\)/g,  // Spring
      /@RequestMapping\(['"]([^'"]+)['"]\)/g,  // Spring
      /def\s+(\w+).*request.*:/g,  // Generic request handler
    ];

    for (const pattern of routePatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const routePath = match[1] || match[2];
        if (routePath) {
          const targetSpan = this.findSpanByName(routePath, allSpans) || 
                           this.findSpanByName(span.name + '_handler', allSpans);
          if (targetSpan && targetSpan.id !== span.id) {
            edges.push(this.createEdge(span.id, targetSpan.id, 'routes', 'route-pattern', pattern.source));
          }
        }
      }
    }

    return edges;
  }

  private extractFileLevelEdges(content: string, fileSpans: Span[]): GraphEdge[] {
    const edges: GraphEdge[] = [];

    // Extract test relationships
    const testEdges = this.extractTestEdges(content, fileSpans);
    edges.push(...testEdges);

    return edges;
  }

  private extractTestEdges(content: string, fileSpans: Span[]): GraphEdge[] {
    const edges: GraphEdge[] = [];

    // Find test functions and their relationships to production code
    const testSpans = fileSpans.filter(span => 
      span.name && /test|spec/i.test(span.name)
    );

    const productionSpans = fileSpans.filter(span => 
      span.name && !/test|spec/i.test(span.name)
    );

    for (const testSpan of testSpans) {
      for (const prodSpan of productionSpans) {
        if (this.testReferencesProduction(testSpan, prodSpan, content)) {
          edges.push(this.createEdge(testSpan.id, prodSpan.id, 'test-of', 'test-pattern', 'test-reference'));
        }
      }
    }

    return edges;
  }

  private testReferencesProduction(testSpan: Span, prodSpan: Span, content: string): boolean {
    if (!prodSpan.name) return false;

    // Simple heuristic: test function mentions production function name
    const testPattern = new RegExp(`\\b${prodSpan.name}\\b`, 'i');
    return testPattern.test(content);
  }

  private extractCrossFileEdges(spans: Span[]): GraphEdge[] {
    const edges: GraphEdge[] = [];

    // Group spans by file type and find potential cross-file relationships
    const spansByFileType = new Map<string, Span[]>();
    
    for (const span of spans) {
      const ext = span.path.split('.').pop()?.toLowerCase() || '';
      if (!spansByFileType.has(ext)) {
        spansByFileType.set(ext, []);
      }
      spansByFileType.get(ext)!.push(span);
    }

    // Look for test files referencing production files
    const testFiles = ['test.js', 'test.py', 'spec.js', 'spec.py'];
    for (const testFile of testFiles) {
      const testSpans = spans.filter(span => span.path.includes(testFile));
      const prodSpans = spans.filter(span => !span.path.includes(testFile));

      for (const testSpan of testSpans) {
        for (const prodSpan of prodSpans) {
          if (this.isTestOfRelation(testSpan, prodSpan)) {
            edges.push(this.createEdge(testSpan.id, prodSpan.id, 'test-of', 'cross-file-test', 'filename-pattern'));
          }
        }
      }
    }

    return edges;
  }

  private isTestOfRelation(testSpan: Span, prodSpan: Span): boolean {
    if (!testSpan.name || !prodSpan.name) return false;

    // Check if test name is derived from production name
    const baseTestName = testSpan.name.replace(/test|spec/gi, '').replace(/_/g, '');
    const baseProdName = prodSpan.name.replace(/_/g, '');

    return baseTestName.includes(baseProdName) || baseProdName.includes(baseTestName);
  }

  private findSpanByName(name: string, spans: Span[]): Span | null {
    return spans.find(span => 
      span.name && (span.name === name || span.name.includes(name) || name.includes(span.name))
    ) || null;
  }

  private findSpanByModule(module: string, spans: Span[]): Span | null {
    // Extract module name from path (e.g., 'package.module' -> 'module')
    const moduleName = module.split('.').pop() || module;
    return this.findSpanByName(moduleName, spans);
  }

  private createEdge(
    sourceId: string,
    targetId: string,
    type: EdgeType,
    method: string,
    pattern: string
  ): GraphEdge {
    return {
      sourceId,
      targetId,
      type,
      confidence: this.HEURISTIC_CONFIDENCE,
      metadata: {
        extractor: this.id,
        heuristicPattern: pattern,
        timestamp: Date.now()
      }
    };
  }

  private initializePatterns(): HeuristicPattern[] {
    return [
      {
        name: 'function-call',
        pattern: /\b(\w+)\s*\(/g,
        edgeType: 'call',
        confidence: this.HEURISTIC_CONFIDENCE
      },
      {
        name: 'method-call',
        pattern: /\.(\w+)\s*\(/g,
        edgeType: 'call',
        confidence: this.HEURISTIC_CONFIDENCE
      },
      {
        name: 'import-statement',
        pattern: /import\s+.*\s+from\s+['"]([^'"]+)['"]/g,
        edgeType: 'import',
        confidence: this.HEURISTIC_CONFIDENCE
      },
      {
        name: 'config-access',
        pattern: /config\.(\w+)/g,
        edgeType: 'config-key',
        confidence: this.HEURISTIC_CONFIDENCE
      },
      {
        name: 'route-definition',
        pattern: /@.*route\(['"]([^'"]+)['"]\)/g,
        edgeType: 'routes',
        confidence: this.HEURISTIC_CONFIDENCE
      }
    ];
  }

  getConfidence(): number {
    return this.HEURISTIC_CONFIDENCE;
  }

  isSupported(): boolean {
    return true; // Heuristic extractor is always available as fallback
  }
}