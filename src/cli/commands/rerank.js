#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
// Simple logger fallback
const logger = {
  error: (message, meta) => console.error(`ERROR: ${message}`, meta || ''),
  info: (message, meta) => console.log(`INFO: ${message}`, meta || ''),
  warn: (message, meta) => console.warn(`WARN: ${message}`, meta || ''),
  debug: (message, meta) => process.env.DEBUG && console.log(`DEBUG: ${message}`, meta || '')
};
import { createProgressRenderer } from '../progress/renderer.js';
import { rerank, getAvailableProviders, getAvailableModels, getRerankerStats } from '../../ranking/reranker-service.js';

/**
 * RRF (Reciprocal Rank Fusion) implementation
 */
function reciprocalRankFusion(results, k = 60) {
  const fusedScores = new Map();
  
  results.forEach((resultList, listIndex) => {
    resultList.forEach((result, rank) => {
      const id = result.id || `${result.path}:${result.byteStart}`;
      const currentScore = fusedScores.get(id) || 0;
      const newScore = currentScore + (1 / (k + rank + 1));
      
      fusedScores.set(id, {
        ...result,
        fusedScore: newScore,
        sources: (fusedScores.get(id)?.sources || []).concat(listIndex)
      });
    });
  });

  return Array.from(fusedScores.values())
    .sort((a, b) => b.fusedScore - a.fusedScore);
}

/**
 * Load results from input files
 */
async function loadInputResults(inputPaths) {
  const allResults = [];
  
  for (const inputPath of inputPaths) {
    try {
      const content = fs.readFileSync(inputPath, 'utf8');
      const data = JSON.parse(content);
      
      if (Array.isArray(data)) {
        allResults.push(data);
      } else if (data.results && Array.isArray(data.results)) {
        allResults.push(data.results);
      } else {
        throw new Error(`Invalid format in ${inputPath}`);
      }
    } catch (error) {
      throw new Error(`Failed to load ${inputPath}: ${error.message}`);
    }
  }
  
  return allResults;
}

/**
 * Reranking using the new provider system
 */
async function performReranking(query, results, provider, options = {}) {
  // Prepare documents for reranking
  const documents = results.map(result => ({
    id: result.id || `${result.path}:${result.byteStart || 0}`,
    text: result.content || result.text || `${result.path}: ${result.metadata?.spanName || ''}`,
    path: result.path,
    metadata: result.metadata
  }));

  try {
    const rerankResult = await rerank(query, documents, {
      provider,
      ...options
    });

    // Map reranked results back to original results format
    return rerankResult.results.map(rerankResult => {
      const originalResult = results.find(r => 
        (r.id || `${r.path}:${r.byteStart || 0}`) === (rerankResult.document?.id || `${rerankResult.document?.path}:0`)
      );
      
      return {
        ...originalResult,
        ...rerankResult.document,
        rerankScore: rerankResult.relevance_score,
        originalScore: originalResult?.score || 0,
        fusedScore: rerankResult.fusedScore,
        cached: rerankResult.cached
      };
    });

  } catch (error) {
    logger.error('Reranking failed', { 
      error: error.message, 
      provider,
      query: query.substring(0, 100) 
    });
    throw error;
  }
}

function getDefaultBaseUrl(provider) {
  const baseUrls = {
    cohere: 'https://api.cohere.ai/v1',
    voyage: 'https://api.voyageai.com/v1'
  };
  return baseUrls[provider] || `https://api.${provider}.com/v1`;
}

function getDefaultModel(provider) {
  const models = {
    cohere: 'rerank-english-v2.0',
    voyage: 'rerank-lite-1'
  };
  return models[provider] || 'rerank-1';
}

/**
 * Cache integration for reranking results
 */
class RerankCache {
  constructor(cachePath = '.pampax/rerank-cache.json') {
    this.cachePath = cachePath;
    this.cache = this.loadCache();
  }

  loadCache() {
    try {
      if (fs.existsSync(this.cachePath)) {
        return JSON.parse(fs.readFileSync(this.cachePath, 'utf8'));
      }
    } catch (error) {
      logger.warn('Failed to load rerank cache', { error: error.message });
    }
    return {};
  }

  saveCache() {
    try {
      const dir = path.dirname(this.cachePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.cachePath, JSON.stringify(this.cache, null, 2));
    } catch (error) {
      logger.warn('Failed to save rerank cache', { error: error.message });
    }
  }

  get(query, provider, documents) {
    const key = this.generateKey(query, provider, documents);
    return this.cache[key];
  }

  set(query, provider, documents, results) {
    const key = this.generateKey(query, provider, documents);
    this.cache[key] = {
      results,
      timestamp: Date.now()
    };
    this.saveCache();
  }

  generateKey(query, provider, documents) {
    const docHash = documents
      .map(d => d.id || d.text?.substring(0, 100))
      .sort()
      .join('|');
    
    return `${provider}:${crypto
      .createHash('sha256')
      .update(`${query}:${docHash}`)
      .digest('hex')
      .substring(0, 16)}`;
  }
}

/**
 * Main rerank command implementation
 */
export async function rerankCommand(query, options = {}) {
  const provider = options.provider || 'local';
  const input = options.input || [];
  const topK = parseInt(options.topK || options.k || '20');
  const json = options.json || false;
  const verbose = options.verbose || false;
  const useCache = !options.noCache;
  const listProviders = options.listProviders || false;
  const listModels = options.listModels || false;
  const stats = options.stats || false;

  // Handle special commands
  if (listProviders) {
    const providers = await getAvailableProviders();
    if (json) {
      console.log(JSON.stringify(providers, null, 2));
    } else {
      console.log('\nAvailable Reranker Providers:\n');
      providers.forEach(p => {
        console.log(`${p.name}: ${p.description}`);
        console.log(`  Available: ${p.available ? '✓' : '✗'}`);
        if (p.error) console.log(`  Error: ${p.error}`);
        if (p.models.length > 0) {
          console.log(`  Models: ${p.models.slice(0, 3).join(', ')}${p.models.length > 3 ? '...' : ''}`);
        }
        console.log('');
      });
    }
    return;
  }

  if (listModels) {
    const models = await getAvailableModels(provider);
    if (json) {
      console.log(JSON.stringify({ provider, models }, null, 2));
    } else {
      console.log(`\nAvailable models for ${provider}:\n`);
      if (models.length === 0) {
        console.log('No models available (provider may not be configured)');
      } else {
        models.forEach(model => console.log(`  - ${model}`));
      }
      console.log('');
    }
    return;
  }

  if (stats) {
    const rerankerStats = await getRerankerStats();
    if (json) {
      console.log(JSON.stringify(rerankerStats, null, 2));
    } else {
      console.log('\nReranker Service Statistics:\n');
      console.log(`Available providers: ${rerankerStats.available_providers}/${rerankerStats.total_providers}`);
      console.log(`Default provider: ${rerankerStats.default_provider}`);
      console.log(`Fallback provider: ${rerankerStats.fallback_provider}`);
      console.log(`Cache enabled: ${rerankerStats.cache_enabled ? '✓' : '✗'}`);
      console.log('\nProvider Details:');
      rerankerStats.providers.forEach(p => {
        console.log(`  ${p.name}: ${p.available ? '✓' : '✗'} (${p.model_count} models)`);
      });
      console.log('');
    }
    return;
  }

  // Progress setup
  const isTTY = process.stdout.isTTY && !json;
  const progress = createProgressRenderer({ tty: isTTY, json });

  try {
    let results = [];
    let startTime = Date.now();

    // Load input results
    if (input.length > 0) {
      progress.start('Loading input results...');
      const inputResults = await loadInputResults(input);
      
      if (provider === 'rrf') {
        progress.update('Performing RRF fusion...');
        results = reciprocalRankFusion(inputResults);
      } else {
        // Flatten results for reranking
        results = inputResults.flat();
      }
      
      progress.complete(`Loaded ${inputResults.length} result lists`);
    } else {
      progress.error('No input files provided. Use --input to specify result files.');
      process.exit(1);
    }

    // Apply reranking
    if (provider !== 'rrf') {
      progress.update(`Reranking with ${provider}...`);
      results = await performReranking(query, results, provider, {
        ...options,
        noCache: !useCache
      });
      progress.complete(`Reranked ${results.length} results with ${provider}`);
    }

    // Limit results
    const finalResults = results.slice(0, topK);
    const duration = Date.now() - startTime;

    // Output results
    if (json) {
      console.log(JSON.stringify({
        success: true,
        query,
        provider,
        results: finalResults.map(result => ({
          id: result.id,
          path: result.path,
          score: result.score,
          fusedScore: result.fusedScore,
          rerankScore: result.rerankScore,
          cached: result.cached,
          metadata: result.metadata
        })),
        totalResults: finalResults.length,
        durationMs: duration
      }, null, 2));
    } else {
      console.log(`\nReranked results for: "${query}" (Provider: ${provider})\n`);
      
      finalResults.forEach((result, index) => {
        console.log(`${index + 1}. ${result.path}`);
        
        if (result.fusedScore !== undefined) {
          console.log(`   Fused Score: ${result.fusedScore.toFixed(4)}`);
        }
        
        if (result.rerankScore !== undefined) {
          console.log(`   Rerank Score: ${result.rerankScore.toFixed(4)}`);
        }
        
        if (result.score !== undefined) {
          console.log(`   Original Score: ${result.score.toFixed(4)}`);
        }
        
        if (result.cached !== undefined) {
          console.log(`   Cached: ${result.cached ? '✓' : '✗'}`);
        }
        
        if (result.metadata?.spanName) {
          console.log(`   Symbol: ${result.metadata.spanName}`);
        }
        
        console.log('');
      });

      if (verbose) {
        console.log(`Reranking completed in ${duration}ms`);
        console.log(`Provider: ${provider}`);
        console.log(`Total results: ${finalResults.length}/${results.length}`);
        const cachedCount = finalResults.filter(r => r.cached).length;
        if (cachedCount > 0) {
          console.log(`Cached results: ${cachedCount}`);
        }
      }
    }

  } catch (error) {
    logger.error('Rerank failed', { error: error.message, query, provider });
    
    progress.error(`Rerank failed: ${error.message}`);
    
    if (json) {
      console.log(JSON.stringify({
        success: false,
        error: error.message,
        query,
        provider
      }, null, 2));
    } else {
      console.error('❌ Rerank failed:', error.message);
    }
    process.exit(1);
  }
}

export function configureRerankCommand(program) {
  program
    .command('rerank [query]')
    .description('Rerank search results using local cross-encoders, API providers, or RRF fusion')
    .option('--provider <provider>', 'Reranking provider (local|api|rrf|cohere|voyage)', 'local')
    .option('--input <files...>', 'Input result files (JSON format)')
    .option('--topK <num>', 'Number of top results to return', '20')
    .option('-k, --k <num>', 'Alias for --topK')
    .option('--model <model>', 'Model name for reranking provider')
    .option('--api-key <key>', 'API key for cloud providers')
    .option('--api-url <url>', 'API URL for cloud providers')
    .option('--max-candidates <num>', 'Maximum candidates to rerank', '50')
    .option('--max-tokens <num>', 'Maximum tokens per document', '512')
    .option('--no-cache', 'Disable caching')
    .option('--json', 'Output in JSON format')
    .option('--verbose', 'Verbose output')
    .option('--list-providers', 'List available reranking providers')
    .option('--list-models', 'List available models for provider')
    .option('--stats', 'Show reranker service statistics')
    .action(rerankCommand);
}