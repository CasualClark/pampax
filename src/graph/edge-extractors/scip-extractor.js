/**
 * SCIP Edge Extractor
 * 
 * Extracts code relationships using Source Code Intelligence Protocol (SCIP):
 * - High-precision structural data through sidecar integration
 * - Standardized format for language-agnostic code analysis
 * - Priority integration for most accurate edge extraction
 */

import { spawn } from 'child_process';
import fs from 'fs';

const SCIPSymbolKind = {
  Method: 0,
  Constructor: 1,
  Field: 2,
  Variable: 3,
  Interface: 4,
  Struct: 5,
  Union: 6,
  Type: 7,
  TypeParameter: 8,
  Parameter: 9,
  Enum: 10,
  EnumMember: 11,
  Function: 12,
  Package: 13,
  Macro: 14,
  Meta: 15,
  Keyword: 16,
  Modifier: 17,
  Comment: 18,
  Annotation: 19,
  TypeAlias: 20,
  Template: 21,
  Module: 22,
  Unknown: 23
};

export class SCIPExtractor {
  constructor(projectRoot, scipCommand = 'scip') {
    this.id = 'scip';
    this.SCIP_CONFIDENCE = 1.0; // Highest confidence
    this.scipProcess = null;
    this.scipCommand = scipCommand;
    this.projectRoot = projectRoot;
  }

  async extractEdges(spans, options = {}) {
    if (!this.isSupported()) {
      return [];
    }

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

  async generateSCIPIndex(spans, timeoutMs) {
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

  async parseSCIPIndex(scipIndex, spans) {
    const edges = [];
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

  buildSymbolMap(scipIndex, spans) {
    const symbolMap = new Map();

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

  extractEdgesFromDocument(document, symbolMap) {
    const edges = [];

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

  extractEdgesFromSymbol(symbol, symbolMap) {
    const edges = [];
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

  extractEdgesFromOccurrence(occurrence, symbolMap) {
    const edges = [];
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

  findSpanForOccurrence(occurrence, spans) {
    // Find span that matches the occurrence range
    // This is simplified - in practice you'd need precise line/character to byte mapping
    for (const span of spans) {
      if (this.isOccurrenceInSpan(occurrence, span)) {
        return span;
      }
    }
    return null;
  }

  isOccurrenceInSpan(occurrence, span) {
    // Simplified check - in practice you'd need precise line/character mapping
    return true;
  }

  mapSCIPRelationshipToEdgeType(relationshipKind) {
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

  mapSCIPRoleToEdgeType(role) {
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

  cleanupSCIPProcess() {
    if (this.scipProcess) {
      this.scipProcess.kill();
      this.scipProcess = null;
    }
  }

  getConfidence() {
    return this.SCIP_CONFIDENCE;
  }

  isSupported() {
    // Check if SCIP command is available
    try {
      const command = this.scipCommand.split(' ')[0];
      fs.accessSync(command, fs.constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  async cleanup() {
    this.cleanupSCIPProcess();
  }
}

export { SCIPSymbolKind };