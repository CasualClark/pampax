/**
 * Graph Module Index
 * 
 * Exports all graph-related functionality for edge extraction, code graph building,
 * and BFS traversal for Phase 5: Code Graph Neighbors.
 */

import { GraphStorage, BFSTraversalEngine } from './graph-traversal.js';
import { CachedBFSTraversalEngine } from './cached-traversal.js';
import { EdgeType } from './types.js';

// Core types and interfaces
export type {
  GraphEdge,
  ExtractionOptions,
  EdgeExtractor,
  ExtractionResult,
  GraphBuilderOptions
} from './types.js';

export type { EdgeType } from './types.js';

// Extractors
export { LSPExtractor } from './edge-extractors/lsp-extractor.js';
export { SCIPExtractor } from './edge-extractors/scip-extractor.js';
export { HeuristicExtractor } from './edge-extractors/heuristic-extractor.js';

// Graph builder
import { GraphBuilder } from './graph-builder.js';
export { GraphBuilder } from './graph-builder.js';

// Graph traversal (Phase 5: Code Graph Neighbors)
export type {
  GraphExpansion,
  TraversalResult,
  GraphStorage
} from './graph-traversal.js';

export {
  BFSTraversalEngine,
  TokenGuard
} from './graph-traversal.js';

export {
  TraversalCacheManager
} from './cache-manager.js';

export {
  CachedBFSTraversalEngine
} from './cached-traversal.js';

// Convenience function for creating a graph builder with default configuration
export function createGraphBuilder(lspClient?: any, projectRoot?: string): GraphBuilder {
  return new GraphBuilder(lspClient, projectRoot);
}

// Convenience function for creating a BFS traversal engine
export function createBFSTraversalEngine(storage: GraphStorage, tokenBudget?: number): BFSTraversalEngine {
  return new BFSTraversalEngine(storage, tokenBudget);
}

// Convenience function for creating a cached BFS traversal engine
export function createCachedBFSTraversalEngine(storage: GraphStorage, tokenBudget?: number): CachedBFSTraversalEngine {
  return new CachedBFSTraversalEngine(storage, tokenBudget);
}

// Default extractor configuration
export const DEFAULT_EXTRACTORS = ['lsp', 'scip', 'heuristic'];
export const DEFAULT_CONFIDENCE_THRESHOLD = 0.5;
export const DEFAULT_TIMEOUT_MS = 50;
export const DEFAULT_MAX_EDGES = 1000;

// Default traversal configuration
export const DEFAULT_MAX_DEPTH = 2;
export const DEFAULT_TOKEN_BUDGET = 4000;
export const DEFAULT_EDGE_TYPES: EdgeType[] = ['call', 'import', 'test-of', 'routes', 'config-key'];
export const DEFAULT_EXPANSION_STRATEGY = 'breadth' as const;