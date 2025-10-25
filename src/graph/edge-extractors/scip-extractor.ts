/**
 * SCIP Edge Extractor
 * 
 * Extracts code relationships using Source Code Intelligence Protocol (SCIP):
 * - High-precision structural data through sidecar integration
 * - Standardized format for language-agnostic code analysis
 * - Priority integration for most accurate edge extraction
 */

import { EdgeExtractor, GraphEdge, ExtractionOptions, EdgeType } from '../types.js';
import { Span } from '../../types/core.js';
import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

interface SCIPDocument {
  uri: string;
  language: string;
  text: string;
  symbols: SCIPSymbol[];
  occurrences: SCIPOccurrence[];
}

interface SCIPSymbol {
  name: string;
  kind: SCIPSymbolKind;
  documentation?: string;
  relationships: SCIPRelationship[];
}

interface SCIPOccurrence {
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
  symbol: string;
  symbol_roles: number[];
  enclosing_range?: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
}

interface SCIPRelationship {
  symbol: string;
  kind: number;
  is_implementation: boolean;
  source_symbol: string;
}

enum SCIPSymbolKind {
  Method = 0,
  Constructor = 1,
  Field = 2,
  Variable = 3,
  Interface = 4,
  Struct = 5,
  Union = 6,
  Type = 7,
  TypeParameter = 8,
  Parameter = 9,
  Enum = 10,
  EnumMember = 11,
  Function = 12,
  Package = 13,
  Macro = 14,
  Meta = 15,
  Keyword = 16,
  Modifier = 17,
  Comment = 18,
  Annotation = 19,
  TypeAlias = 20,
  Template = 21,
  Module = 22,
  Unknown = 23
}

export class SCIPExtractor implements EdgeExtractor {
  readonly id = 'scip';
  private readonly SCIP_CONFIDENCE = 1.0; // Highest confidence
  private scipProcess: ChildProcess | null = null;
  private readonly scipCommand: string;
  private readonly projectRoot: string;

  constructor(projectRoot: string, scipCommand: string = 'scip') {
    this.projectRoot = projectRoot;
    this.scipCommand = scipCommand;
  }

  async extractEdges(spans: Span[], options: ExtractionOptions = {}): Promise<GraphEdge[]> {
    if (!this.isSupported()) {
      return [];
    }

    const startTime = Date.now();
    const timeoutMs = options.timeoutMs || 50;
    const maxEdges = options.maxEdges || 1000;

    try {
      // Generate SCIP index
      const scipIndex = await this.generateSCIPIndex(spans, timeoutMs);
      
      // Parse SCIP index and extract edges
      const edges = await this.parseSCIPIndex(scipIndex, spans);
      
      return edges.slice(0, maxEdges);
    } catch (error) {
      console.warn(`SCIP extraction error: ${error instanceof Error ? error.message : String(error)}`);
      return [];
    }
  }

  private async generateSCIPIndex(spans: Span[], timeoutMs: number): Promise<any> {
    const uniquePaths = new Set(spans.map(span => span.path));
    const files = Array.from(uniquePaths);
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.cleanupSCIPProcess();
        reject(new Error('SCIP index generation timeout'));
      }, timeoutMs);

      // Run SCIP sidecar to generate index
      const args = [
        'index',
        '--project-root', this.projectRoot,
        '--output', '/dev/stdout',
        '--verbose'
      ];

// Add specific files if provided
    if (files.length > 0) {
      args.push('--files', ...Array.from(files));
    }

      this.scipProcess = spawn(this.scipCommand, args, {
        cwd: this.projectRoot,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      if (!this.scipProcess.stdout) {
        clearTimeout(timeout);
        reject(new Error('Failed to create SCIP process stdout'));
        return;
      }

      let output = '';
      let errorOutput = '';

      this.scipProcess.stdout.on('data', (data) => {
        output += data.toString();
      });

      this.scipProcess.stderr?.on('data', (data) => {
        errorOutput += data.toString();
      });

      this.scipProcess.on('close', (code) => {
        clearTimeout(timeout);
        
        if (code !== 0) {
          reject(new Error(`SCIP process failed with code ${code}: ${errorOutput}`));
          return;
        }

        try {
          const scipData = JSON.parse(output);
          resolve(scipData);
        } catch (parseError) {
          reject(new Error(`Failed to parse SCIP output: ${parseError}`));
        }
      });

      this.scipProcess.on('error', (error) => {
        clearTimeout(timeout);
        reject(new Error(`SCIP process error: ${error.message}`));
      });
    });
  }

  private async parseSCIPIndex(scipIndex: any, spans: Span[]): Promise<GraphEdge[]> {
    const edges: GraphEdge[] = [];
    const symbolMap = this.buildSymbolMap(scipIndex, spans);

    if (!scipIndex.documents || !Array.isArray(scipIndex.documents)) {
      return edges;
    }

    for (const document of scipIndex.documents) {
      const documentEdges = this.extractEdgesFromDocument(document, symbolMap);
      edges.push(...documentEdges);
    }

    return edges;
  }

  private buildSymbolMap(scipIndex: any, spans: Span[]): Map<string, Span> {
    const symbolMap = new Map<string, Span>();

    // Map SCIP symbols to spans
    for (const document of scipIndex.documents || []) {
      for (const occurrence of document.occurrences || []) {
        const span = this.findSpanForOccurrence(occurrence, spans);
        if (span && occurrence.symbol) {
          symbolMap.set(occurrence.symbol, span);
        }
      }
    }

    return symbolMap;
  }

  private extractEdgesFromDocument(document: SCIPDocument, symbolMap: Map<string, Span>): GraphEdge[] {
    const edges: GraphEdge[] = [];

    // Extract edges from symbol relationships
    for (const symbol of document.symbols || []) {
      const symbolEdges = this.extractEdgesFromSymbol(symbol, symbolMap);
      edges.push(...symbolEdges);
    }

    // Extract edges from occurrences
    for (const occurrence of document.occurrences || []) {
      const occurrenceEdges = this.extractEdgesFromOccurrence(occurrence, symbolMap);
      edges.push(...occurrenceEdges);
    }

    return edges;
  }

  private extractEdgesFromSymbol(symbol: SCIPSymbol, symbolMap: Map<string, Span>): GraphEdge[] {
    const edges: GraphEdge[] = [];
    const sourceSpan = symbolMap.get(symbol.name);

    if (!sourceSpan) {
      return edges;
    }

    for (const relationship of symbol.relationships || []) {
      const targetSpan = symbolMap.get(relationship.symbol);
      
      if (targetSpan && targetSpan.id !== sourceSpan.id) {
        const edgeType = this.mapSCIPRelationshipToEdgeType(relationship.kind);
        
        edges.push({
          sourceId: sourceSpan.id,
          targetId: targetSpan.id,
          type: edgeType,
          confidence: this.SCIP_CONFIDENCE,
          metadata: {
            extractor: this.id,
            scipProtocol: 'relationship',
            timestamp: Date.now()
          }
        });
      }
    }

    return edges;
  }

  private extractEdgesFromOccurrence(occurrence: SCIPOccurrence, symbolMap: Map<string, Span>): GraphEdge[] {
    const edges: GraphEdge[] = [];
    const span = symbolMap.get(occurrence.symbol);

    if (!span) {
      return edges;
    }

    // Extract edges based on symbol roles
    for (const role of occurrence.symbol_roles || []) {
      const edgeType = this.mapSCIPRoleToEdgeType(role);
      
      if (edgeType) {
        // For occurrences, we need to find the enclosing scope
        if (occurrence.enclosing_range) {
          // This would require finding the span for the enclosing range
          // For now, we'll skip this complexity
        }
      }
    }

    return edges;
  }

  private findSpanForOccurrence(occurrence: SCIPOccurrence, spans: Span[]): Span | null {
    // Find span that matches the occurrence range
    // This is simplified - in practice you'd need precise line/character to byte mapping
    for (const span of spans) {
      if (this.isOccurrenceInSpan(occurrence, span)) {
        return span;
      }
    }
    return null;
  }

  private isOccurrenceInSpan(occurrence: SCIPOccurrence, span: Span): boolean {
    // Simplified check - in practice you'd need precise line/character mapping
    return true;
  }

  private mapSCIPRelationshipToEdgeType(relationshipKind: number): EdgeType {
    // Map SCIP relationship kinds to edge types
    switch (relationshipKind) {
      case 0: // Reference
        return 'call';
      case 1: // Type definition
        return 'import';
      case 2: // Implementation
        return 'call';
      case 3: // Inheritance
        return 'import';
      case 4: // Override
        return 'call';
      default:
        return 'call';
    }
  }

  private mapSCIPRoleToEdgeType(role: number): EdgeType | null {
    // Map SCIP symbol roles to edge types
    switch (role) {
      case 1: // Definition
        return null; // Not an edge
      case 2: // Reference
        return 'call';
      case 3: // Import
        return 'import';
      case 4: // Test
        return 'test-of';
      case 5: // Implementation
        return 'call';
      case 6: // Type definition
        return 'import';
      default:
        return null;
    }
  }

  private cleanupSCIPProcess(): void {
    if (this.scipProcess) {
      this.scipProcess.kill();
      this.scipProcess = null;
    }
  }

  getConfidence(): number {
    return this.SCIP_CONFIDENCE;
  }

  isSupported(): boolean {
    // Check if SCIP command is available
    try {
      const command = this.scipCommand.split(' ')[0];
      fs.accessSync(command, fs.constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  async cleanup(): Promise<void> {
    this.cleanupSCIPProcess();
  }
}