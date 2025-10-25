/**
 * Graph Traversal Engine for Phase 5: Code Graph Neighbors
 *
 * Implements token-guarded BFS expansion with r≤2 limits for flow-aware search.
 * Provides breadth-first expansion with configurable depth, real-time token budget
 * enforcement, edge filtering, and performance optimization.
 */
import { TokenizerFactory } from '../tokenization/tokenizer-factory.js';
import { logger } from '../config/logger.js';
/**
 * Token Guard for real-time budget enforcement
 */
export class TokenGuard {
    tokenizer;
    budget;
    used;
    constructor(budget, model = 'default') {
        this.budget = budget;
        this.used = 0;
        this.tokenizer = TokenizerFactory.create(model);
    }
    /**
     * Estimate tokens for content
     */
    estimateTokens(content) {
        if (typeof content === 'string') {
            return this.tokenizer.countTokens(content);
        }
        else if (typeof content === 'object') {
            const json = JSON.stringify(content, null, 2);
            return this.tokenizer.countTokens(json);
        }
        return 0;
    }
    /**
     * Check if adding content would exceed budget
     */
    canFit(content) {
        const tokens = this.estimateTokens(content);
        return this.used + tokens <= this.budget;
    }
    /**
     * Try to add content, returns success status
     */
    tryAdd(content) {
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
    getRemaining() {
        return Math.max(0, this.budget - this.used);
    }
    /**
     * Get usage statistics
     */
    getUsage() {
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
    reset() {
        this.used = 0;
    }
}
/**
 * BFS Traversal Engine
 */
export class BFSTraversalEngine {
    storage;
    tokenGuard;
    defaultMaxDepth = 2;
    performance_threshold_ms = 100;
    constructor(storage, defaultTokenBudget = 4000) {
        this.storage = storage;
        this.tokenGuard = new TokenGuard(defaultTokenBudget);
    }
    /**
     * Perform breadth-first graph expansion with token guard
     */
    async expandGraph(expansion) {
        const startTime = Date.now();
        // Initialize traversal state
        const state = {
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
    async expandLevel(state, expansion) {
        const nextFrontier = [];
        const levelEdges = [];
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
                    if (state.accumulated_edges.some(e => `${e.sourceId}:${e.targetId}:${e.type}` === edgeKey)) {
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
                if (state.truncated)
                    break;
            }
            catch (error) {
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
    createResult(expansion, state, startTime, cacheHit = false) {
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
    getPerformanceStats() {
        return {
            threshold_ms: this.performance_threshold_ms
            // TODO: Track average traversal time across multiple runs
        };
    }
    /**
     * Update performance threshold
     */
    setPerformanceThreshold(thresholdMs) {
        this.performance_threshold_ms = thresholdMs;
    }
}
