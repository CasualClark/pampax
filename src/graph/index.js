/**
 * Graph Module Index
 * 
 * Exports all graph-related functionality for edge extraction, code graph building,
 * and BFS traversal for Phase 5: Code Graph Neighbors.
 */

import { BFSTraversalEngine } from './graph-traversal.js';
import { CachedBFSTraversalEngine } from './cached-traversal.js';
import { GraphBuilder } from './graph-builder.js';

// Extractors
import { LSPExtractor } from './edge-extractors/lsp-extractor.js';
import { SCIPExtractor } from './edge-extractors/scip-extractor.js';
import { HeuristicExtractor } from './edge-extractors/heuristic-extractor.js';

// Core exports
export {
  // Core classes
  GraphBuilder,
  BFSTraversalEngine,
  CachedBFSTraversalEngine,
  
  // Extractors
  LSPExtractor,
  SCIPExtractor,
  HeuristicExtractor
};

// Convenience functions
export function createGraphBuilder(lspClient, projectRoot) {
  return new GraphBuilder(lspClient, projectRoot);
}

export function createBFSTraversalEngine(storage, tokenBudget) {
  return new BFSTraversalEngine(storage, tokenBudget);
}

export function createCachedBFSTraversalEngine(storage, tokenBudget) {
  return new CachedBFSTraversalEngine(storage, tokenBudget);
}

// Default configurations
export const DEFAULT_EXTRACTORS = ['lsp', 'scip', 'heuristic'];
export const DEFAULT_CONFIDENCE_THRESHOLD = 0.5;
export const DEFAULT_TIMEOUT_MS = 50;
export const DEFAULT_MAX_EDGES = 1000;
export const DEFAULT_MAX_DEPTH = 2;
export const DEFAULT_TOKEN_BUDGET = 4000;
export const DEFAULT_EDGE_TYPES = ['call', 'import', 'test-of', 'routes', 'config-key'];
export const DEFAULT_EXPANSION_STRATEGY = 'breadth';