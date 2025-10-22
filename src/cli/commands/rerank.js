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
 * Cross-encoder reranking with API providers
 */
async function crossEncoderRerank(query, results, provider, options = {}) {
  const apiKey = options.apiKey || process.env[`${provider.toUpperCase()}_API_KEY`];
  
  if (!apiKey) {
    throw new Error(`API key required for ${provider}. Set ${provider.toUpperCase()}_API_KEY environment variable.`);
  }

  const baseUrl = options.baseUrl || getDefaultBaseUrl(provider);
  
  // Prepare documents for reranking
  const documents = results.map(result => ({
    id: result.id || `${result.path}:${result.byteStart}`,
    text: result.content || result.text || `${result.path}: ${result.metadata?.spanName || ''}`
  }));

  try {
    const response = await fetch(`${baseUrl}/rerank`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: options.model || getDefaultModel(provider),
        query,
        documents,
        top_k: options.topK || results.length
      })
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    // Map reranked results back to original results
    const rerankedResults = data.results.map(rerankResult => {
      const originalResult = results.find(r => 
        (r.id || `${r.path}:${r.byteStart}`) === rerankResult.document.id
      );
      
      return {
        ...originalResult,
        rerankScore: rerankResult.relevance_score,
        originalScore: originalResult.score || 0
      };
    });

    return rerankedResults.sort((a, b) => b.rerankScore - a.rerankScore);

  } catch (error) {
    logger.error('Cross-encoder reranking failed', { 
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
  const provider = options.provider || 'rrf';
  const input = options.input || [];
  const topK = parseInt(options.topK || options.k || '20');
  const json = options.json || false;
  const verbose = options.verbose || false;
  const useCache = !options.noCache;

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
        // Flatten results for cross-encoder reranking
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
      
      const cache = useCache ? new RerankCache() : null;
      
      // Check cache first
      if (cache) {
        const cached = cache.get(query, provider, results);
        if (cached) {
          progress.complete(`Using cached results from ${new Date(cached.timestamp).toISOString()}`);
          results = cached.results;
        } else {
          results = await crossEncoderRerank(query, results, provider, options);
          cache.set(query, provider, results, results);
          progress.complete(`Reranked ${results.length} results with ${provider}`);
        }
      } else {
        results = await crossEncoderRerank(query, results, provider, options);
        progress.complete(`Reranked ${results.length} results with ${provider}`);
      }
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
        
        if (result.metadata?.spanName) {
          console.log(`   Symbol: ${result.metadata.spanName}`);
        }
        
        console.log('');
      });

      if (verbose) {
        console.log(`Reranking completed in ${duration}ms`);
        console.log(`Provider: ${provider}`);
        console.log(`Total results: ${finalResults.length}/${results.length}`);
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
    .command('rerank <query>')
    .description('Rerank search results using RRF fusion or cross-encoder providers')
    .option('--provider <provider>', 'Reranking provider (rrf|cohere|voyage)', 'rrf')
    .option('--input <files...>', 'Input result files (JSON format)')
    .option('--topK <num>', 'Number of top results to return', '20')
    .option('-k, --k <num>', 'Alias for --topK')
    .option('--api-key <key>', 'API key for cross-encoder providers')
    .option('--model <model>', 'Model name for cross-encoder providers')
    .option('--base-url <url>', 'Base URL for API')
    .option('--no-cache', 'Disable caching')
    .option('--json', 'Output in JSON format')
    .option('--verbose', 'Verbose output')
    .action(rerankCommand);
}