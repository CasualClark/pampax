#!/usr/bin/env node

import path from 'path';
import { GraphEnhancedSearchEngine } from '../search/hybrid.js';
import * as crypto from 'crypto';
import { getLogger } from '../utils/structured-logger.js';
import { getMetricsCollector } from '../metrics/metrics-collector.js';
import { getCacheManager } from '../cache/cache-manager.js';

/**
 * Context Assembler - combines code and memory search results
 */
export class ContextAssembler {
  constructor(db, options = {}) {
    this.db = db;
    this.graphEnabled = options.graphEnabled || false;
    this.graphEngine = null;
    this.cache = options.cacheEnabled !== false ? getCacheManager() : null;
    this.logger = getLogger('context-assembler');
    this.metrics = getMetricsCollector();
    this.options = options;
    this.reliabilityManager = null;
    
    // Initialize reliability manager and graph engine
    this.initializeComponents(options.graphOptions);
  }

  async initializeComponents(graphOptions = {}) {
    // Initialize reliability manager
    try {
      const { ReliabilityManager } = await import('../reliability/reliability-manager.js');
      this.reliabilityManager = new ReliabilityManager('context-assembler', {
        timeouts: {
          assembly: this.options.assemblyTimeout || 10000,
          database: this.options.databaseTimeout || 2000,
          cache: this.options.cacheTimeout || 1000,
          graph: this.options.graphTimeout || 8000
        },
        circuitBreakers: {
          assembly: { failureThreshold: 5, recoveryTimeout: 30000 },
          database: { failureThreshold: 3, recoveryTimeout: 60000 },
          cache: { failureThreshold: 10, recoveryTimeout: 15000 },
          graph: { failureThreshold: 3, recoveryTimeout: 45000 }
        },
        retryPolicies: {
          assembly: { maxAttempts: 3, baseDelay: 1000 },
          database: { maxAttempts: 5, baseDelay: 500 },
          cache: { maxAttempts: 2, baseDelay: 200 },
          graph: { maxAttempts: 2, baseDelay: 2000 }
        },
        enableGracefulDegradation: this.options.enableReliability !== false
      });
    } catch (error) {
      this.logger.warn('reliability_manager_init_failed', 'Failed to initialize reliability manager', {
        error: error.message
      });
    }

    // Initialize graph engine if enabled and storage supports it
    if (this.graphEnabled && this.db.getStorage) {
      await this.initializeGraphEngine(graphOptions);
    }
  }

  /**
   * Initialize graph-enhanced search engine
   */
  async initializeGraphEngine(options = {}) {
    const timed = this.logger.timed('graph_engine_init', 'Initializing graph-enhanced search engine');
    
    try {
      const storage = this.db.getStorage();
      const { createGraphEnhancedSearchEngine } = await import('../search/hybrid.js');
      this.graphEngine = await createGraphEnhancedSearchEngine(storage, options);
      
      timed.end('Graph engine initialized successfully');
    } catch (error) {
      timed.end('Graph engine initialization failed', {
        error: error.message,
        fallback: 'standard_context_assembly'
      });
      
      this.logger.warn('graph_engine_init_failed', 'Failed to initialize graph engine, falling back to standard context assembly', { 
        error: error.message 
      });
      this.graphEnabled = false;
    }
  }

  /**
   * Assemble context with explanation metadata
   */
  async assembleWithExplanation(query, options = {}) {
    // Ensure reliability manager is initialized
    if (!this.reliabilityManager) {
      await this.initializeComponents();
    }

    // Use reliability manager if available
    if (this.reliabilityManager) {
      return await this.reliabilityManager.executeContextAssembly(query, async () => {
        return await this.performAssemblyWithExplanation(query, options);
      }, {
        cacheKey: `assembly:${JSON.stringify({ query, include: options.include, limit: options.limit })}`,
        cache: this.cache,
        fallback: async () => {
          // Minimal fallback context
          return {
            query,
            total_tokens: 0,
            sources: [],
            assembled_at: new Date().toISOString(),
            budget_used: 0,
            degraded: true,
            explanation: {
              evidence: [],
              ranking_factors: ['Reliability fallback - minimal context'],
              stopping_conditions: ['All reliability layers failed'],
              cache_stats: { hits: 0, misses: 0, hit_rate: 0 },
              graph_enabled: false
            }
          };
        }
      });
    }

    // Fallback to standard assembly without reliability protection
    return await this.performAssemblyWithExplanation(query, options);
  }

  /**
   * Perform the actual context assembly with explanation
   */
  async performAssemblyWithExplanation(query, options = {}) {
    const startTime = Date.now();
    const corrId = this.logger.getCorrelationId();
    
    const {
      budget = 5000,
      include = ['code', 'memory'],
      scope,
      repo,
      limit = 10,
      graphOptions = {},
      intent = null
    } = options;

    const evidence = [];
    const rankingFactors = [];
    const stoppingConditions = [];
    let totalTokens = 0;
    let totalItems = 0;
    let cacheHits = 0;
    let cacheMisses = 0;

    const sources = [];

    // Include code search results
    if (include.includes('code')) {
      try {
        const codeLimit = Math.max(1, Math.floor(limit * 0.4)); // Allocate 40% of limit to code
        let codeResults;
        
        if (this.reliabilityManager) {
          codeResults = await this.reliabilityManager.execute('database', async () => {
            return await this.db.search(query, {
              limit: Math.min(codeLimit, limit - totalItems), // Respect remaining limit
              includeContent: true
            });
          }, {
            timeout: this.options.databaseTimeout || 2000,
            fallback: () => []
          });
        } else {
          codeResults = await this.db.search(query, {
            limit: Math.min(codeLimit, limit - totalItems), // Respect remaining limit
            includeContent: true
          });
        }

        const codeTokens = this.estimateTokens(JSON.stringify(codeResults));
        
        if (totalTokens + codeTokens <= budget && totalItems + codeResults.length <= limit) {
          // Add evidence for each code result
          codeResults.forEach((result, index) => {
            const evidenceItem = {
              type: 'code',
              file: result.file || result.path || result.id,
              symbol: result.metadata?.spanName || result.id,
              reason: this.determineSelectionReason(result, index, 'code'),
              edge_type: null, // Regular search doesn't have edge types
              rank: result.score || (1 - index / codeResults.length),
              cached: result._cached || false,
              score: result.score,
              metadata: result.metadata
            };
            evidence.push(evidenceItem);

            if (result._cached) {
              cacheHits++;
            } else {
              cacheMisses++;
            }
          });

          sources.push({
            type: 'code',
            items: codeResults,
            tokens: codeTokens
          });
          totalTokens += codeTokens;
          totalItems += codeResults.length;
          rankingFactors.push(`Code search: ${codeResults.length} results, ${codeTokens} tokens`);
        } else {
          if (totalTokens + codeTokens > budget) {
            stoppingConditions.push(`Code results exceeded token budget (${codeTokens} > ${budget - totalTokens})`);
          }
          if (totalItems + codeResults.length > limit) {
            stoppingConditions.push(`Code results would exceed item limit (${codeResults.length} > ${limit - totalItems})`);
          }
        }
      } catch (error) {
        // Code search might fail if no indexed data
        console.debug('Code search failed in context assembly', { error: error.message });
        stoppingConditions.push(`Code search failed: ${error.message}`);
      }
    }

    // Include memory search results
    if (include.includes('memory')) {
      try {
        const memoryLimit = Math.max(1, Math.floor(limit * 0.3)); // Allocate 30% of limit to memory
        let memoryResults;
        
        if (this.reliabilityManager) {
          memoryResults = await this.reliabilityManager.execute('database', async () => {
            return await this.db.memory.search(query, {
              limit: Math.min(memoryLimit, limit - totalItems), // Respect remaining limit
              scope,
              repo: scope === 'repo' ? repo : undefined
            });
          }, {
            timeout: this.options.databaseTimeout || 2000,
            fallback: () => []
          });
        } else {
          memoryResults = await this.db.memory.search(query, {
            limit: Math.min(memoryLimit, limit - totalItems), // Respect remaining limit
            scope,
            repo: scope === 'repo' ? repo : undefined
          });
        }

        const memoryTokens = this.estimateTokens(JSON.stringify(memoryResults));
        
        if (totalTokens + memoryTokens <= budget && totalItems + memoryResults.length <= limit) {
          // Add evidence for each memory result
          memoryResults.forEach((result, index) => {
            const evidenceItem = {
              type: 'memory',
              file: null, // Memories don't have files
              symbol: result.key || result.id,
              reason: this.determineSelectionReason(result, index, 'memory'),
              edge_type: null, // Memory doesn't have edge types
              rank: result.rank || result.weight || (1 - index / memoryResults.length),
              cached: result._cached || false,
              score: result.rank || result.weight,
              kind: result.kind,
              scope: result.scope
            };
            evidence.push(evidenceItem);

            if (result._cached) {
              cacheHits++;
            } else {
              cacheMisses++;
            }
          });

          sources.push({
            type: 'memory',
            items: memoryResults,
            tokens: memoryTokens
          });
          totalTokens += memoryTokens;
          totalItems += memoryResults.length;
          rankingFactors.push(`Memory search: ${memoryResults.length} results, ${memoryTokens} tokens`);
        } else {
          if (totalTokens + memoryTokens > budget) {
            stoppingConditions.push(`Memory results exceeded token budget (${memoryTokens} > ${budget - totalTokens})`);
          }
          if (totalItems + memoryResults.length > limit) {
            stoppingConditions.push(`Memory results would exceed item limit (${memoryResults.length} > ${limit - totalItems})`);
          }
        }
      } catch (error) {
        stoppingConditions.push(`Memory search failed: ${error.message}`);
      }
    }

    // Include symbol search results if available
    if (include.includes('symbols') && this.db.searchSymbols) {
      try {
        const symbolLimit = Math.max(1, Math.floor(limit * 0.2)); // Allocate 20% of limit to symbols
        const symbolResults = await this.db.searchSymbols(query, {
          limit: Math.min(symbolLimit, limit - totalItems) // Respect remaining limit
        });

        const symbolTokens = this.estimateTokens(JSON.stringify(symbolResults));
        
        if (totalTokens + symbolTokens <= budget && totalItems + symbolResults.length <= limit) {
          // Add evidence for each symbol result
          symbolResults.forEach((result, index) => {
            const evidenceItem = {
              type: 'symbol',
              file: result.file || result.path,
              symbol: result.symbol || result.name,
              reason: this.determineSelectionReason(result, index, 'symbol'),
              edge_type: null,
              rank: result.score || (1 - index / symbolResults.length),
              cached: result._cached || false,
              score: result.score,
              kind: result.kind
            };
            evidence.push(evidenceItem);

            if (result._cached) {
              cacheHits++;
            } else {
              cacheMisses++;
            }
          });

          sources.push({
            type: 'symbols',
            items: symbolResults,
            tokens: symbolTokens
          });
          totalTokens += symbolTokens;
          totalItems += symbolResults.length;
          rankingFactors.push(`Symbol search: ${symbolResults.length} results, ${symbolTokens} tokens`);
        } else {
          if (totalTokens + symbolTokens > budget) {
            stoppingConditions.push(`Symbol results exceeded token budget (${symbolTokens} > ${budget - totalTokens})`);
          }
          if (totalItems + symbolResults.length > limit) {
            stoppingConditions.push(`Symbol results would exceed item limit (${symbolResults.length} > ${limit - totalItems})`);
          }
        }
      } catch (error) {
        stoppingConditions.push(`Symbol search failed: ${error.message}`);
      }
    }

    // Try graph-enhanced search if enabled
    let graphEvidence = [];
    if (this.graphEnabled && this.graphEngine && totalItems < limit) {
      try {
        const graphLimit = Math.max(1, limit - totalItems); // Use remaining limit
        const graphResults = await this.assembleWithGraph(query, {
          budget: Math.max(0, budget - totalTokens),
          include: include.filter(i => i !== 'memory'), // Avoid double memory inclusion
          limit: graphLimit,
          graphOptions,
          intent
        });

        if (graphResults.sources.length > 0) {
          // Calculate graph items count
          const graphItemsCount = graphResults.sources.reduce((sum, source) => sum + (source.items?.length || 0), 0);
          
          // Only add graph results if we have room
          if (totalItems + graphItemsCount <= limit) {
            // Add graph evidence
            graphResults.sources.forEach(source => {
              if (source.items) {
                source.items.forEach((item, index) => {
                  if (item.graphRelationships && item.graphRelationships.length > 0) {
                    item.graphRelationships.forEach(rel => {
                      const graphEvidenceItem = {
                        type: 'graph',
                        file: item.file || item.path || item.id,
                        symbol: item.metadata?.spanName || item.id,
                        reason: `Graph relationship: ${rel.type}`,
                        edge_type: rel.type,
                        rank: rel.confidence || item.score || (1 - index / source.items.length),
                        cached: item.cache_hit || false,
                        score: item.score,
                        confidence: rel.confidence,
                        target: rel.to
                      };
                      graphEvidence.push(graphEvidenceItem);
                    });
                  }
                });
              }
            });

            // Add graph source to main sources
            sources.push(...graphResults.sources);
            totalTokens += graphResults.total_tokens;
            totalItems += graphItemsCount;
            rankingFactors.push(`Graph-enhanced: ${graphEvidence.length} relationships, ${graphResults.total_tokens} tokens`);
          } else {
            stoppingConditions.push(`Graph results would exceed item limit (${graphItemsCount} > ${limit - totalItems})`);
          }
        }
      } catch (error) {
        stoppingConditions.push(`Graph search failed: ${error.message}`);
      }
    }

    // Combine all evidence
    const allEvidence = [...evidence, ...graphEvidence];

    // Sort evidence by rank (descending)
    allEvidence.sort((a, b) => (b.rank || 0) - (a.rank || 0));

    // Add stopping condition if budget was reached
    if (totalTokens >= budget * 0.9) {
      stoppingConditions.push(`Token budget nearly exhausted (${totalTokens}/${budget} tokens)`);
    }

    // Add stopping condition if limit was reached
    if (totalItems >= limit) {
      stoppingConditions.push(`Result limit reached (${totalItems}/${limit} items)`);
    }

    const bundle = {
      query,
      total_tokens: totalTokens,
      sources,
      assembled_at: new Date().toISOString(),
      budget_used: totalTokens / budget,
      explanation: {
        evidence: allEvidence,
        graph_evidence: graphEvidence.length > 0 ? graphEvidence : undefined,
        ranking_factors: rankingFactors,
        stopping_conditions: stoppingConditions.length > 0 ? stoppingConditions : ['All sources processed within limits'],
        cache_stats: {
          hits: cacheHits,
          misses: cacheMisses,
          hit_rate: cacheHits + cacheMisses > 0 ? cacheHits / (cacheHits + cacheMisses) : 0
        },
        intent: intent,
        graph_enabled: this.graphEnabled && !!this.graphEngine
      }
    };

    // Store the bundle for later retrieval by outcome analyzer
    await this.storeBundle(bundle);
    
    // Emit assembly metrics
    const assemblyDuration = Date.now() - startTime;
    this.metrics.emitTiming('context_assembly_latency_ms', assemblyDuration, {
      sources_count: sources.length,
      total_tokens: totalTokens,
      total_items: totalItems,
      graph_enabled: this.graphEnabled ? 'true' : 'false'
    }, corrId);
    
    this.metrics.emitCounter('context_assemblies', 1, {
      success: 'true',
      graph_enabled: this.graphEnabled ? 'true' : 'false'
    }, corrId);
    
    // Emit cache metrics
    const totalCacheOps = cacheHits + cacheMisses;
    if (totalCacheOps > 0) {
      this.metrics.emitGauge('cache_hit_rate', cacheHits / totalCacheOps, {
        component: 'context_assembly'
      }, corrId);
      
      this.metrics.emitCounter('cache_operations', totalCacheOps, {
        component: 'context_assembly',
        hits: cacheHits,
        misses: cacheMisses
      }, corrId);
    }
    
    // Emit token usage metrics
    this.metrics.emitGauge('token_usage', totalTokens, {
      component: 'context_assembly',
      operation: 'assembly'
    }, corrId);
    
    this.metrics.emitGauge('budget_utilization', totalTokens / budget, {
      component: 'context_assembly'
    }, corrId);

    return bundle;
  }

  /**
   * Determine selection reason for a result
   */
  determineSelectionReason(result, index, sourceType) {
    const score = result.score || result.rank || result.weight || 0;
    const reasons = [];

    if (score > 0.8) {
      reasons.push('High relevance score');
    } else if (score > 0.6) {
      reasons.push('Good relevance score');
    } else if (score > 0.4) {
      reasons.push('Moderate relevance score');
    } else {
      reasons.push('Low relevance score');
    }

    if (index === 0) {
      reasons.push('Top result');
    } else if (index < 3) {
      reasons.push('Top 3 results');
    }

    if (sourceType === 'code') {
      if (result.metadata?.spanKind) {
        reasons.push(`${result.metadata.spanKind} symbol`);
      }
      if (result.metadata?.lang) {
        reasons.push(`${result.metadata.lang} language`);
      }
    } else if (sourceType === 'memory') {
      if (result.kind) {
        reasons.push(`${result.kind} memory`);
      }
      if (result.scope) {
        reasons.push(`${result.scope} scope`);
      }
    } else if (sourceType === 'symbol') {
      if (result.kind) {
        reasons.push(`${result.kind} symbol`);
      }
    }

    if (result._cached) {
      reasons.push('Cache hit');
    }

    return reasons.join(', ');
  }

  /**
   * Assemble context from multiple sources
   */
  async assemble(query, options = {}) {
    const {
      budget = 5000,
      include = ['code', 'memory'],
      scope,
      repo,
      limit = 10
    } = options;

    const sources = [];
    let totalTokens = 0;

    // Include code search results
    if (include.includes('code')) {
      try {
        const codeResults = await this.db.search(query, {
          limit,
          includeContent: true
        });

        const codeTokens = this.estimateTokens(JSON.stringify(codeResults));
        
        if (totalTokens + codeTokens <= budget) {
          sources.push({
            type: 'code',
            items: codeResults,
            tokens: codeTokens
          });
          totalTokens += codeTokens;
        }
      } catch (error) {
        // Code search might fail if no indexed data
        console.debug('Code search failed in context assembly', { error: error.message });
      }
    }

    // Include memory search results
    if (include.includes('memory')) {
      const memoryResults = await this.db.memory.search(query, {
        limit: Math.max(1, Math.floor(limit * 0.5)), // Allocate half the limit to memories
        scope,
        repo: scope === 'repo' ? repo : undefined
      });

      const memoryTokens = this.estimateTokens(JSON.stringify(memoryResults));
      
      if (totalTokens + memoryTokens <= budget) {
        sources.push({
          type: 'memory',
          items: memoryResults,
          tokens: memoryTokens
        });
        totalTokens += memoryTokens;
      }
    }

    const bundle = {
      query,
      total_tokens: totalTokens,
      sources,
      assembled_at: new Date().toISOString(),
      budget_used: totalTokens / budget
    };

    // Store the bundle for later retrieval by outcome analyzer
    await this.storeBundle(bundle);

    return bundle;
  }

  /**
   * Create markdown representation of context
   */
  async assembleMarkdown(query, options = {}) {
    const bundle = await this.assemble(query, options);
    
    let markdown = `# Context Bundle: ${query}\n\n`;
    markdown += `**Generated:** ${bundle.assembled_at}\n`;
    markdown += `**Total Tokens:** ${bundle.total_tokens}\n`;
    markdown += `**Budget Used:** ${(bundle.budget_used * 100).toFixed(1)}%\n\n`;

    for (const source of bundle.sources) {
      markdown += `## ${source.type.charAt(0).toUpperCase() + source.type.slice(1)} Results\n\n`;
      
      if (source.items.length === 0) {
        markdown += `No ${source.type} results found.\n\n`;
        continue;
      }

      for (let index = 0; index < source.items.length; index++) {
        const item = source.items[index];
        markdown += `### ${index + 1}. `;
        
        if (source.type === 'code') {
          markdown += `${item.path}\n\n`;
          markdown += `- **Path:** \`${item.path}\`\n`;
          if (item.metadata?.spanName) {
            markdown += `- **Symbol:** ${item.metadata.spanName} (${item.metadata.spanKind})\n`;
          }
          if (item.metadata?.lang) {
            markdown += `- **Language:** ${item.metadata.lang}\n`;
          }
          markdown += `- **Score:** ${item.score?.toFixed(3) || 'N/A'}\n`;
          
          if (item.content) {
            markdown += `\n\`\`\`${item.metadata?.lang || ''}\n${item.content}\n\`\`\`\n\n`;
          }
        } else if (source.type === 'memory') {
          markdown += `${item.kind} Memory\n\n`;
          markdown += `- **ID:** ${item.id}\n`;
          markdown += `- **Kind:** ${item.kind}\n`;
          markdown += `- **Scope:** ${item.scope}\n`;
          if (item.key) {
            markdown += `- **Key:** ${item.key}\n`;
          }
          markdown += `- **Weight:** ${item.weight}\n`;
          markdown += `- **Rank:** ${item.rank?.toFixed(3) || 'N/A'}\n`;
          
          const createdDate = new Date(item.created_at);
          markdown += `- **Created:** ${createdDate.toISOString()}\n`;
          
          markdown += `\n**Value:**\n\n${item.value}\n\n`;
        }
      }
    }

    return markdown;
  }

  /**
   * Get session context with recent interactions
   */
  async getSessionContext(sessionId, options = {}) {
    const { limit = 5 } = options;
    
    const interactions = await this.db.memory.findInteractionsBySession(sessionId);
    const recentInteractions = interactions.slice(-limit);
    
    return {
      session_id: sessionId,
      interactions: recentInteractions,
      total_interactions: interactions.length
    };
  }

  /**
   * Create a new session and track interaction
   */
  async createInteraction(tool, query, bundleId, satisfied, notes, bundleData = null) {
    // If no bundleId provided but bundleData is, store the bundle first
    if (!bundleId && bundleData) {
      bundleId = await this.storeBundle(bundleData);
    }

    // Create or get active session
    const activeSessions = await this.db.memory.findActiveSessions(tool);
    let sessionId;
    
    if (activeSessions.length > 0) {
      sessionId = activeSessions[0].id;
    } else {
      sessionId = await this.db.memory.createSession({
        tool,
        repo: process.cwd()
      });
    }

    // Create interaction
    const interactionId = await this.db.memory.createInteraction({
      session_id: sessionId,
      query,
      bundle_id: bundleId,
      satisfied: satisfied ? 1 : 0,
      notes
    });

    return {
      session_id: sessionId,
      interaction_id: interactionId,
      bundle_id: bundleId
    };
  }

  /**
   * Store bundle data in memory for later retrieval
   */
  async storeBundle(bundle) {
    try {
      // Generate a unique bundle ID based on content hash
      const bundleId = this.generateBundleId(bundle);
      
      // Store bundle as a memory entry with the bundle ID as key
      // Use 'fact' as allowed kind since 'bundle' is not in the constraint list
      await this.db.memory.insert({
        scope: 'repo',
        repo: process.cwd(), // Current repository
        kind: 'fact', // Use allowed kind value
        key: bundleId,
        value: JSON.stringify(bundle),
        weight: 1.0,
        expires_at: Date.now() + (7 * 24 * 60 * 60 * 1000), // 7 days TTL
        source_json: JSON.stringify({
          generated_at: bundle.assembled_at,
          total_tokens: bundle.total_tokens,
          source_count: bundle.sources.length,
          type: 'bundle' // Mark as bundle in source_json
        })
      });
      
      console.debug('Bundle stored in memory', {
        bundleId,
        sourceCount: bundle.sources.length,
        totalTokens: bundle.total_tokens
      });
      
      return bundleId;
    } catch (error) {
      console.warn('Failed to store bundle in memory', {
        error: error.message,
        bundleQuery: bundle.query
      });
      return null;
    }
  }

  /**
   * Generate a unique bundle ID based on content
   */
  generateBundleId(bundle) {
    // Create a hash from key bundle characteristics
    const content = {
      query: bundle.query,
      sourceTypes: bundle.sources.map(s => s.type).sort(),
      sourceCounts: bundle.sources.map(s => s.items?.length || 0).sort(),
      totalTokens: bundle.total_tokens
    };
    
    const hash = crypto.createHash('sha256')
      .update(JSON.stringify(content))
      .digest('hex')
      .substring(0, 16);
    
    return `bundle_${hash}`;
  }

  /**
   * Estimate tokens for text content
   */
  estimateTokens(text) {
    // Rough estimation: ~4 characters per token
    return Math.ceil(text.length / 4);
  }

  /**
   * Get memory statistics
   */
  async getMemoryStats(scope, repo) {
    return await this.db.memory.getMemoryStats(scope, repo);
  }

  /**
   * Clean up expired memories
   */
  async cleanupExpiredMemories() {
    return await this.db.memory.deleteExpired();
  }

  /**
   * Assemble context with graph-enhanced search
   */
  async assembleWithGraph(query, options = {}) {
    const {
      budget = 5000,
      include = ['code', 'memory'],
      scope,
      repo,
      limit = 10,
      graphOptions = {},
      intent = null
    } = options;

    // If graph engine not available, fallback to standard assembly
    if (!this.graphEngine) {
      return await this.assemble(query, options);
    }

    try {
      // Get search results from different sources
      const searchResults = await this.getSearchResults(query, { limit, include });
      
      // Perform graph-enhanced search
      const graphEnhancedResults = await this.graphEngine.searchWithGraphExpansion({
        query,
        vectorResults: searchResults.vectorResults || [],
        bm25Results: searchResults.bm25Results || [],
        memoryResults: searchResults.memoryResults || [],
        symbolResults: searchResults.symbolResults || [],
        intent,
        graphOptions,
        limit
      });

      // Process results into context format
      const sources = [];
      let totalTokens = 0;

      // Add graph-enhanced code results
      if (graphEnhancedResults.results && graphEnhancedResults.results.length > 0) {
        const codeTokens = this.estimateTokens(JSON.stringify(graphEnhancedResults.results));
        
        if (totalTokens + codeTokens <= budget) {
          sources.push({
            type: 'graph-enhanced-code',
            items: graphEnhancedResults.results,
            tokens: codeTokens,
            graphExpansion: graphEnhancedResults.graphExpansion,
            performance_ms: graphEnhancedResults.performance_ms
          });
          totalTokens += codeTokens;
        }
      }

      // Add memory results if requested
      if (include.includes('memory')) {
        const memoryResults = await this.db.memory.search(query, {
          limit: Math.max(1, Math.floor(limit * 0.3)),
          scope,
          repo: scope === 'repo' ? repo : undefined
        });

        const memoryTokens = this.estimateTokens(JSON.stringify(memoryResults));
        
        if (totalTokens + memoryTokens <= budget) {
          sources.push({
            type: 'memory',
            items: memoryResults,
            tokens: memoryTokens
          });
          totalTokens += memoryTokens;
        }
      }

      const bundle = {
        query,
        total_tokens: totalTokens,
        sources,
        assembled_at: new Date().toISOString(),
        budget_used: totalTokens / budget,
        graph_enhanced: true,
        intent: graphEnhancedResults.intent,
        graph_performance: {
          expansion_time_ms: graphEnhancedResults.performance_ms,
          tokens_used: graphEnhancedResults.tokens_used,
          truncated: graphEnhancedResults.truncated
        }
      };

      // Store the graph-enhanced bundle for later retrieval
      await this.storeBundle(bundle);

      return bundle;

    } catch (error) {
      console.warn('Graph-enhanced context assembly failed, falling back to standard', { 
        error: error.message 
      });
      return await this.assemble(query, options);
    }
  }

  /**
   * Get search results from different sources
   */
  async getSearchResults(query, options = {}) {
    const { limit = 10, include = ['code', 'memory'] } = options;
    const results = {};

    try {
      // Get vector search results
      if (include.includes('code') && this.db.search) {
        results.vectorResults = await this.db.search(query, {
          limit: Math.floor(limit * 0.6),
          includeContent: true
        });
      }

      // Get BM25 results if available
      if (include.includes('code') && this.db.searchBM25) {
        results.bm25Results = await this.db.searchBM25(query, {
          limit: Math.floor(limit * 0.4)
        });
      }

      // Get memory results
      if (include.includes('memory')) {
        results.memoryResults = await this.db.memory.search(query, {
          limit: Math.floor(limit * 0.3)
        });
      }

      // Get symbol results if available
      if (include.includes('symbols') && this.db.searchSymbols) {
        results.symbolResults = await this.db.searchSymbols(query, {
          limit: Math.floor(limit * 0.3)
        });
      }

    } catch (error) {
      console.warn('Error getting search results', { error: error.message });
    }

    return results;
  }

  /**
   * Create markdown representation with graph information
   */
  async assembleMarkdownWithGraph(query, options = {}) {
    const bundle = await this.assembleWithGraph(query, options);
    
    let markdown = `# Graph-Enhanced Context Bundle: ${query}\n\n`;
    markdown += `**Generated:** ${bundle.assembled_at}\n`;
    markdown += `**Total Tokens:** ${bundle.total_tokens}\n`;
    markdown += `**Budget Used:** ${(bundle.budget_used * 100).toFixed(1)}%\n`;
    
    if (bundle.graph_enhanced) {
      markdown += `**Graph Enhanced:** Yes\n`;
      markdown += `**Intent:** ${bundle.intent?.intent || 'unknown'} (${bundle.intent?.confidence?.toFixed(2) || 0})\n`;
      if (bundle.graph_performance) {
        markdown += `**Graph Expansion:** ${bundle.graph_performance.expansion_time_ms}ms\n`;
        markdown += `**Graph Tokens:** ${bundle.graph_performance.tokens_used}\n`;
        if (bundle.graph_performance.truncated) {
          markdown += `**⚠️ Graph Truncated:** Yes\n`;
        }
      }
    }
    markdown += '\n';

    for (const source of bundle.sources) {
      let sourceTitle = source.type.charAt(0).toUpperCase() + source.type.slice(1).replace(/-/g, ' ');
      markdown += `## ${sourceTitle}\n\n`;
      
      if (source.items.length === 0) {
        markdown += `No results found.\n\n`;
        continue;
      }

      // Add graph-specific information
      if (source.type === 'graph-enhanced-code' && source.graphExpansion) {
        markdown += `**Graph Stats:** ${source.graphExpansion.visited_nodes.size} nodes, ${source.graphExpansion.edges.length} edges\n`;
        markdown += `**Performance:** ${source.performance_ms}ms\n\n`;
      }

      for (let index = 0; index < source.items.length; index++) {
        const item = source.items[index];
        markdown += `### ${index + 1}. `;
        
        if (source.type.includes('code')) {
          markdown += `${item.file || item.path || item.id}\n\n`;
          markdown += `- **Score:** ${item.score?.toFixed(3) || 'N/A'}\n`;
          
          if (item.graphRelationships && item.graphRelationships.length > 0) {
            markdown += `- **Graph Relationships:** ${item.graphRelationships.length} connections\n`;
            for (const rel of item.graphRelationships.slice(0, 3)) {
              markdown += `  - ${rel.type} → ${rel.to} (${rel.confidence?.toFixed(2) || 'N/A'})\n`;
            }
          }
          
          if (item.graphEnhancementScore) {
            markdown += `- **Graph Enhancement:** ${item.graphEnhancementScore.toFixed(3)}\n`;
          }
          
          if (item.metadata?.spanName) {
            markdown += `- **Symbol:** ${item.metadata.spanName} (${item.metadata.spanKind})\n`;
          }
          if (item.metadata?.lang) {
            markdown += `- **Language:** ${item.metadata.lang}\n`;
          }
          
          if (item.content) {
            markdown += `\n\`\`\`${item.metadata?.lang || ''}\n${item.content}\n\`\`\`\n\n`;
          }
        } else if (source.type === 'memory') {
          markdown += `${item.kind} Memory\n\n`;
          markdown += `- **ID:** ${item.id}\n`;
          markdown += `- **Kind:** ${item.kind}\n`;
          markdown += `- **Weight:** ${item.weight}\n`;
          markdown += `- **Rank:** ${item.rank?.toFixed(3) || 'N/A'}\n`;
          markdown += `\n**Value:**\n\n${item.value}\n\n`;
        }
      }
    }

    return markdown;
  }

  /**
   * Enable/disable graph functionality
   */
  async setGraphEnabled(enabled, options = {}) {
    this.graphEnabled = enabled;
    
    if (enabled && !this.graphEngine) {
      await this.initializeGraphEngine(options);
    } else if (!enabled) {
      this.graphEngine = null;
    }
  }

  /**
   * Get graph engine performance stats
   */
  getGraphPerformanceStats() {
    return this.graphEngine ? this.graphEngine.getPerformanceStats() : null;
  }

  /**
   * Get reliability status
   */
  async getReliabilityStatus() {
    if (!this.reliabilityManager) {
      await this.initializeComponents();
    }
    
    return this.reliabilityManager ? {
      enabled: true,
      health: this.reliabilityManager.getHealthStatus(),
      stats: this.reliabilityManager.getStats()
    } : {
      enabled: false,
      reason: 'Reliability manager not initialized'
    };
  }

  /**
   * Get comprehensive performance stats including reliability
   */
  async getPerformanceStats() {
    const baseStats = {
      graphEngine: this.getGraphPerformanceStats(),
      graphEnabled: this.graphEnabled
    };

    if (this.reliabilityManager) {
      baseStats.reliability = await this.getReliabilityStatus();
    }

    return baseStats;
  }
}

/**
 * Create context assembler from database path
 */
export async function createContextAssembler(dbPath) {
  const { Database } = await import('../storage/database-simple.js');
  const db = new Database(dbPath);
  await db.initialize();
  
  return new ContextAssembler(db);
}