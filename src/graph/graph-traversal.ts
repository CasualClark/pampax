/**
 * Graph Traversal Engine for Phase 5: Code Graph Neighbors
 * 
 * Implements token-guarded BFS expansion with r≤2 limits for flow-aware search.
 * Provides breadth-first expansion with configurable depth, real-time token budget
 * enforcement, edge filtering, and performance optimization.
 */

import { EdgeType, GraphEdge } from './types.js';

// Re-export GraphEdge for convenience
export { GraphEdge };
import { TokenizerFactory } from '../tokenization/tokenizer-factory.js';
import { logger } from '../config/logger.js';

/**
 * Graph expansion configuration
 */
export interface GraphExpansion {
  query: string;
  start_symbols: string[];
  max_depth: number;        // r≤2 default
  token_budget: number;
  edge_types: EdgeType[];
  expansion_strategy: 'breadth' | 'quality-first';
}

/**
 * Traversal result with metadata
 */
export interface TraversalResult {
  query: string;
  start_symbols: string[];
  visited_nodes: Set<string>;
  edges: GraphEdge[];
  expansion_depth: number;
  tokens_used: number;
  token_budget: number;
  truncated: boolean;
  performance_ms: number;
  cache_hit: boolean;
}

/**
 * BFS traversal state
 */
interface TraversalState {
  current_depth: number;
  visited_nodes: Set<string>;
  frontier: string[];
  accumulated_edges: GraphEdge[];
  tokens_used: number;
  truncated: boolean;
}

/**
 * Graph Storage Interface (abstracted for different storage backends)
 */
export interface GraphStorage {
  /**
   * Get edges outgoing from a node
   */
  getOutgoingEdges(nodeId: string, edgeTypes?: EdgeType[]): Promise<GraphEdge[]>;
  
  /**
   * Get edges incoming to a node
   */
  getIncomingEdges(nodeId: string, edgeTypes?: EdgeType[]): Promise<GraphEdge[]>;
  
  /**
   * Get edges between two specific nodes
   */
  getEdgesBetween(sourceId: string, targetId: string, edgeTypes?: EdgeType[]): Promise<GraphEdge[]>;
  
  /**
   * Check if a node exists
   */
  nodeExists(nodeId: string): Promise<boolean>;
  
  /**
   * Get node metadata for token estimation
   */
  getNodeMetadata(nodeId: string): Promise<any>;
}

/**
 * Token Guard for real-time budget enforcement
 */
export class TokenGuard {
  private tokenizer: any;
  private budget: number;
  private used: number;

  constructor(budget: number, model: string = 'default') {
    this.budget = budget;
    this.used = 0;
    this.tokenizer = TokenizerFactory.create(model);
  }

  /**
   * Estimate tokens for content
   */
  estimateTokens(content: any): number {
    if (typeof content === 'string') {
      return this.tokenizer.countTokens(content);
    } else if (typeof content === 'object') {
      const json = JSON.stringify(content, null, 2);
      return this.tokenizer.countTokens(json);
    }
    return 0;
  }

  /**
   * Check if adding content would exceed budget
   */
  canFit(content: any): boolean {
    const tokens = this.estimateTokens(content);
    return this.used + tokens <= this.budget;
  }

  /**
   * Try to add content, returns success status
   */
  tryAdd(content: any): boolean {
    const tokens = this.estimateTokens(content);
    if (this.used + tokens <= this.budget) {
      this.used += tokens;
      return true;
    }
    return false;
  }

  /**
   * Get remaining budget
   */
  getRemaining(): number {
    return Math.max(0, this.budget - this.used);
  }

  /**
   * Get usage statistics
   */
  getUsage(): { budget: number; used: number; remaining: number; percentage: number } {
    return {
      budget: this.budget,
      used: this.used,
      remaining: this.getRemaining(),
      percentage: Math.round((this.used / this.budget) * 100)
    };
  }

  /**
   * Reset the guard
   */
  reset(): void {
    this.used = 0;
  }
}

/**
 * BFS Traversal Engine
 */
export class BFSTraversalEngine {
  private storage: GraphStorage;
  private tokenGuard: TokenGuard;
  private defaultMaxDepth: number = 2;
  private performance_threshold_ms: number = 100;

  constructor(storage: GraphStorage, defaultTokenBudget: number = 4000) {
    this.storage = storage;
    this.tokenGuard = new TokenGuard(defaultTokenBudget);
  }

  /**
   * Perform breadth-first graph expansion with token guard
   */
  async expandGraph(expansion: GraphExpansion): Promise<TraversalResult> {
    const startTime = Date.now();
    
    // Initialize traversal state
    const state: TraversalState = {
      current_depth: 0,
      visited_nodes: new Set(expansion.start_symbols),
      frontier: [...expansion.start_symbols],
      accumulated_edges: [],
      tokens_used: 0,
      truncated: false
    };

    // Reset token guard for this traversal
    this.tokenGuard.reset();
    
    // Apply query to initial token estimation
    const queryTokens = this.tokenGuard.estimateTokens(expansion.query);
    if (!this.tokenGuard.tryAdd({ query: expansion.query })) {
      logger.warn('Query alone exceeds token budget', { 
        query: expansion.query,
        queryTokens,
        budget: expansion.token_budget 
      });
      
      return this.createResult(expansion, state, startTime, false);
    }

    // Perform BFS expansion
    while (state.current_depth < expansion.max_depth && 
           state.frontier.length > 0 && 
           !state.truncated) {
      
      await this.expandLevel(state, expansion);
      state.current_depth++;
    }

    const duration = Date.now() - startTime;
    
    // Log performance warnings
    if (duration > this.performance_threshold_ms) {
      logger.warn('Graph traversal exceeded performance threshold', {
        duration,
        threshold: this.performance_threshold_ms,
        nodesVisited: state.visited_nodes.size,
        edgesFound: state.accumulated_edges.length
      });
    }

    return this.createResult(expansion, state, startTime, false);
  }

  /**
   * Expand one level of the BFS
   */
  private async expandLevel(state: TraversalState, expansion: GraphExpansion): Promise<void> {
    const nextFrontier: string[] = [];
    const levelEdges: GraphEdge[] = [];

    // Process all nodes at current depth
    for (const nodeId of state.frontier) {
      try {
        // Get outgoing edges
        const outgoingEdges = await this.storage.getOutgoingEdges(nodeId, expansion.edge_types);
        
        // Get incoming edges for bidirectional traversal
        const incomingEdges = await this.storage.getIncomingEdges(nodeId, expansion.edge_types);
        
        const allEdges = [...outgoingEdges, ...incomingEdges];
        
        // Filter and process edges
        for (const edge of allEdges) {
          // Skip if we already have this edge (avoid duplicates)
          const edgeKey = `${edge.sourceId}:${edge.targetId}:${edge.type}`;
          if (state.accumulated_edges.some(e => 
            `${e.sourceId}:${e.targetId}:${e.type}` === edgeKey)) {
            continue;
          }

          // Check token budget before adding edge
          if (!this.tokenGuard.tryAdd(edge)) {
            state.truncated = true;
            logger.info('Traversal truncated due to token budget', {
              tokensUsed: this.tokenGuard.getUsage().used,
              budget: expansion.token_budget,
              nodesVisited: state.visited_nodes.size
            });
            break;
          }

          levelEdges.push(edge);
          
          // Add target to next frontier if not visited
          const targetNode = edge.targetId === nodeId ? edge.sourceId : edge.targetId;
          if (!state.visited_nodes.has(targetNode)) {
            state.visited_nodes.add(targetNode);
            nextFrontier.push(targetNode);
          }
        }

        if (state.truncated) break;
        
      } catch (error) {
        logger.error('Error processing node during traversal', {
          nodeId,
          error: error instanceof Error ? error.message : String(error)
        });
        // Continue with other nodes
      }
    }

    // Sort edges by strategy
    if (expansion.expansion_strategy === 'quality-first') {
      levelEdges.sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
    }

    // Add level edges to accumulated results
    state.accumulated_edges.push(...levelEdges);
    
    // Update frontier for next level
    state.frontier = nextFrontier;
  }

  /**
   * Create traversal result
   */
  private createResult(
    expansion: GraphExpansion, 
    state: TraversalState, 
    startTime: number,
    cacheHit: boolean = false
  ): TraversalResult {
    const usage = this.tokenGuard.getUsage();
    
    return {
      query: expansion.query,
      start_symbols: expansion.start_symbols,
      visited_nodes: state.visited_nodes,
      edges: state.accumulated_edges,
      expansion_depth: state.current_depth,
      tokens_used: usage.used,
      token_budget: usage.budget,
      truncated: state.truncated,
      performance_ms: Date.now() - startTime,
      cache_hit: cacheHit
    };
  }

  /**
   * Get performance statistics
   */
  getPerformanceStats(): { threshold_ms: number; avg_traversal_time_ms?: number } {
    return {
      threshold_ms: this.performance_threshold_ms
      // TODO: Track average traversal time across multiple runs
    };
  }

  /**
   * Update performance threshold
   */
  setPerformanceThreshold(thresholdMs: number): void {
    this.performance_threshold_ms = thresholdMs;
  }
}



