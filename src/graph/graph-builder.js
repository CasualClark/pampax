/**
 * Graph Builder
 * 
 * Orchestrates multiple edge extractors to build a comprehensive code graph:
 * - Coordinates LSP, SCIP, and heuristic extractors
 * - Merges and deduplicates edges
 * - Applies confidence scoring and filtering
 */

import { LSPExtractor } from './edge-extractors/lsp-extractor.js';
import { SCIPExtractor } from './edge-extractors/scip-extractor.js';
import { HeuristicExtractor } from './edge-extractors/heuristic-extractor.js';

export class GraphBuilder {
  constructor(lspClient, projectRoot) {
    this.extractors = new Map();
    this.defaultOptions = {
      extractors: ['lsp', 'scip', 'heuristic'],
      timeoutMs: 50,
      maxEdgesPerExtractor: 1000,
      confidenceThreshold: 0.5
    };

    this.initializeExtractors(lspClient, projectRoot);
  }

  initializeExtractors(lspClient, projectRoot) {
    // Initialize LSP extractor if client is provided
    if (lspClient) {
      this.extractors.set('lsp', new LSPExtractor(lspClient));
    }

    // Initialize SCIP extractor if project root is provided
    if (projectRoot) {
      this.extractors.set('scip', new SCIPExtractor(projectRoot));
    }

    // Always initialize heuristic extractor as fallback
    this.extractors.set('heuristic', new HeuristicExtractor());
  }

  async buildGraph(spans, options = {}) {
    const finalOptions = { ...this.defaultOptions, ...options };
    const startTime = Date.now();
    
    console.log(`Building graph with ${spans.length} spans using extractors: ${finalOptions.extractors.join(', ')}`);

    // Run extractors in parallel
    const extractionPromises = finalOptions.extractors.map(extractorId => 
      this.runExtractor(extractorId, spans, finalOptions)
    );

    const results = await Promise.all(extractionPromises);
    const allEdges = results.flatMap(result => result.edges);

    // Process and merge edges
    const processedEdges = this.processEdges(allEdges, finalOptions);

    const durationMs = Date.now() - startTime;
    const summary = this.generateSummary(processedEdges, results, durationMs);

    console.log(`Graph building completed: ${processedEdges.length} edges in ${durationMs}ms`);

    return {
      edges: processedEdges,
      results,
      summary
    };
  }

  async runExtractor(extractorId, spans, options) {
    const extractor = this.extractors.get(extractorId);
    const startTime = Date.now();

    if (!extractor) {
      return {
        edges: [],
        extractorId,
        durationMs: 0,
        error: `Extractor ${extractorId} not found`
      };
    }

    if (!extractor.isSupported()) {
      return {
        edges: [],
        extractorId,
        durationMs: 0,
        error: `Extractor ${extractorId} not supported`
      };
    }

    try {
      console.log(`Running ${extractorId} extractor...`);
      const edges = await extractor.extractEdges(spans, {
        timeoutMs: options.timeoutMs,
        maxEdges: options.maxEdgesPerExtractor,
        includeMetadata: true
      });

      const durationMs = Date.now() - startTime;
      console.log(`${extractorId} extractor completed: ${edges.length} edges in ${durationMs}ms`);

      return {
        edges,
        extractorId,
        durationMs
      };

    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      console.warn(`${extractorId} extractor failed: ${errorMessage}`);
      
      return {
        edges: [],
        extractorId,
        durationMs,
        error: errorMessage
      };
    }
  }

  processEdges(edges, options) {
    // Filter by confidence threshold
    let filteredEdges = edges.filter(edge => edge.confidence >= options.confidenceThreshold);

    // Deduplicate edges (same source, target, and type)
    filteredEdges = this.deduplicateEdges(filteredEdges);

    // Sort by confidence (highest first)
    filteredEdges.sort((a, b) => b.confidence - a.confidence);

    // Apply global edge limit if needed
    const globalLimit = options.maxEdgesPerExtractor * options.extractors.length;
    if (filteredEdges.length > globalLimit) {
      filteredEdges = filteredEdges.slice(0, globalLimit);
    }

    return filteredEdges;
  }

  deduplicateEdges(edges) {
    const edgeMap = new Map();

    for (const edge of edges) {
      const key = `${edge.sourceId}:${edge.targetId}:${edge.type}`;
      
      const existing = edgeMap.get(key);
      if (!existing || edge.confidence > existing.confidence) {
        edgeMap.set(key, edge);
      }
    }

    return Array.from(edgeMap.values());
  }

  generateSummary(edges, results, totalDurationMs) {
    const edgesByType = {};
    const edgesByExtractor = {};

    // Count edges by type
    for (const edge of edges) {
      edgesByType[edge.type] = (edgesByType[edge.type] || 0) + 1;
    }

    // Count edges by extractor
    for (const result of results) {
      edgesByExtractor[result.extractorId] = result.edges.length;
    }

    // Calculate average confidence
    const totalConfidence = edges.reduce((sum, edge) => sum + edge.confidence, 0);
    const averageConfidence = edges.length > 0 ? totalConfidence / edges.length : 0;

    return {
      totalEdges: edges.length,
      edgesByType,
      edgesByExtractor,
      averageConfidence: Math.round(averageConfidence * 100) / 100,
      durationMs: totalDurationMs
    };
  }

  /**
   * Get available extractors and their status
   */
  getExtractorStatus() {
    return Array.from(this.extractors.values()).map(extractor => ({
      id: extractor.id,
      supported: extractor.isSupported(),
      confidence: extractor.getConfidence()
    }));
  }

  /**
   * Add a custom extractor
   */
  addExtractor(extractor) {
    this.extractors.set(extractor.id, extractor);
  }

  /**
   * Remove an extractor
   */
  removeExtractor(extractorId) {
    return this.extractors.delete(extractorId);
  }

  /**
   * Get extractor by ID
   */
  getExtractor(extractorId) {
    return this.extractors.get(extractorId);
  }

  /**
   * Build graph incrementally with progressive enhancement
   */
  async buildGraphIncremental(spans, options = {}) {
    const finalOptions = { ...this.defaultOptions, ...options };

    // Try LSP first (highest quality after SCIP)
    const lspExtractor = this.extractors.get('lsp');
    if (lspExtractor?.isSupported()) {
      try {
        const lspEdges = await lspExtractor.extractEdges(spans, {
          timeoutMs: finalOptions.timeoutMs,
          maxEdges: finalOptions.maxEdgesPerExtractor
        });
        
        if (lspEdges.length > 0) {
          return {
            edges: lspEdges,
            stage: 'lsp',
            confidence: this.calculateOverallConfidence(lspEdges)
          };
        }
      } catch (error) {
        console.warn('LSP extraction failed, falling back to SCIP:', error);
      }
    }

    // Try SCIP next (highest quality)
    const scipExtractor = this.extractors.get('scip');
    if (scipExtractor?.isSupported()) {
      try {
        const scipEdges = await scipExtractor.extractEdges(spans, {
          timeoutMs: finalOptions.timeoutMs,
          maxEdges: finalOptions.maxEdgesPerExtractor
        });
        
        if (scipEdges.length > 0) {
          return {
            edges: scipEdges,
            stage: 'scip',
            confidence: this.calculateOverallConfidence(scipEdges)
          };
        }
      } catch (error) {
        console.warn('SCIP extraction failed, falling back to heuristic:', error);
      }
    }

    // Fallback to heuristic extractor
    const heuristicExtractor = this.extractors.get('heuristic');
    if (heuristicExtractor?.isSupported()) {
      try {
        const heuristicEdges = await heuristicExtractor.extractEdges(spans, {
          timeoutMs: finalOptions.timeoutMs,
          maxEdges: finalOptions.maxEdgesPerExtractor
        });
        
        return {
          edges: heuristicEdges,
          stage: 'heuristic',
          confidence: this.calculateOverallConfidence(heuristicEdges)
        };
      } catch (error) {
        console.warn('Heuristic extraction failed:', error);
      }
    }

    // No extractors available
    return {
      edges: [],
      stage: 'complete',
      confidence: 0
    };
  }

  calculateOverallConfidence(edges) {
    if (edges.length === 0) return 0;
    
    const totalConfidence = edges.reduce((sum, edge) => sum + edge.confidence, 0);
    return Math.round((totalConfidence / edges.length) * 100) / 100;
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    for (const extractor of this.extractors.values()) {
      if (typeof extractor.cleanup === 'function') {
        await extractor.cleanup();
      }
    }
    this.extractors.clear();
  }
}