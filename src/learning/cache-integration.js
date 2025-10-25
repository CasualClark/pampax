import { logger } from '../config/logger.js';
import { SignatureCache, CacheEntry } from './signature-cache.js';
import * as crypto from 'crypto';

/**
 * Integration layer for signature cache with search pipeline
 * 
 * This module provides the integration points for the signature cache
 * to work with the existing search pipeline, including query signature
 * generation and cache management.
 */
export class CacheIntegration {
  constructor(options = {}) {
    this.cache = new SignatureCache({
      maxSize: options.maxSize || 1000,
      defaultTtl: options.defaultTtl || 7 * 24 * 60 * 60 * 1000, // 7 days
      cleanupInterval: options.cleanupInterval || 60 * 60 * 1000, // 1 hour
      satisfactionThreshold: options.satisfactionThreshold || 0.8
    });
    
    logger.debug('CacheIntegration initialized', {
      maxSize: options.maxSize,
      satisfactionThreshold: options.satisfactionThreshold
    }, 'cache-integration');
  }

  /**
   * Generate a consistent query signature for caching
   * @param {string} query - The search query
   * @param {Object} intent - Intent result from intent classifier
   * @param {Object} context - Additional context (repo, language, etc.)
   * @returns {string} Query signature
   */
  generateQuerySignature(query, intent = null, context = {}) {
    try {
      const features = [];
      
      // Normalize query (lowercase, trim)
      const normalizedQuery = query.toLowerCase().trim();
      features.push(`q:${normalizedQuery}`);
      
      // Add intent information if available
      if (intent) {
        features.push(`intent:${intent.intent}:${Math.floor(intent.confidence * 100)}`);
      }
      
      // Add context information
      if (context.repo) {
        const repoName = context.repo.split('/').pop() || context.repo;
        features.push(`repo:${repoName}`);
      }
      
      if (context.language) {
        features.push(`lang:${context.language}`);
      }
      
      if (context.filePatterns && context.filePatterns.length > 0) {
        const patterns = context.filePatterns.slice(0, 3).sort(); // Limit to 3 patterns
        features.push(`patterns:${patterns.join(',')}`);
      }
      
      // Create hash from features
      const featureString = features.join('|');
      const signature = crypto.createHash('sha256')
        .update(featureString)
        .digest('hex')
        .substring(0, 16);
      
      return `q_${signature}`;
    } catch (error) {
      logger.warn('Failed to generate query signature', {
        query,
        error: error instanceof Error ? error.message : String(error)
      }, 'cache-integration');
      
      // Fallback to simple hash
      return `q_${crypto.createHash('sha256').update(query).digest('hex').substring(0, 16)}`;
    }
  }

  /**
   * Check cache for a matching query pattern
   * @param {string} querySignature - Query signature to look up
   * @returns {Promise<CacheEntry|null>} Cached entry or null
   */
  async getCachedResult(querySignature) {
    const startTime = Date.now();
    
    try {
      const result = await this.cache.get(querySignature);
      
      const lookupTime = Date.now() - startTime;
      
      if (result) {
        logger.debug('Cache hit for query', {
          querySignature,
          bundleId: result.bundleId,
          satisfaction: result.satisfaction,
          lookupTime
        }, 'cache-integration');
        
        return result;
      } else {
        logger.debug('Cache miss for query', {
          querySignature,
          lookupTime
        }, 'cache-integration');
        
        return null;
      }
    } catch (error) {
      logger.error('Error during cache lookup', {
        querySignature,
        error: error instanceof Error ? error.message : String(error)
      }, 'cache-integration');
      return null;
    }
  }

  /**
   * Cache a successful search result
   * @param {string} querySignature - Query signature
   * @param {string} bundleId - Bundle identifier
   * @param {number} satisfaction - Satisfaction score (0-1)
   * @param {Object} metadata - Additional metadata
   * @returns {Promise<void>}
   */
  async cacheResult(querySignature, bundleId, satisfaction, metadata = {}) {
    try {
      const entry = new CacheEntry(
        querySignature,
        bundleId,
        satisfaction,
        1, // Initial usage count
        Date.now(),
        Date.now(),
        0 // Use default TTL
      );
      
      await this.cache.set(entry);
      
      logger.debug('Result cached', {
        querySignature,
        bundleId,
        satisfaction,
        metadata
      }, 'cache-integration');
    } catch (error) {
      logger.error('Error caching result', {
        querySignature,
        bundleId,
        error: error instanceof Error ? error.message : String(error)
      }, 'cache-integration');
    }
  }

  /**
   * Update cache entry with new satisfaction data
   * @param {string} querySignature - Query signature
   * @param {number} satisfaction - New satisfaction score
   * @returns {Promise<void>}
   */
  async updateSatisfaction(querySignature, satisfaction) {
    try {
      const entry = await this.cache.get(querySignature);
      
      if (entry) {
        entry.satisfaction = satisfaction;
        await this.cache.set(entry);
        
        logger.debug('Updated satisfaction for cached entry', {
          querySignature,
          newSatisfaction: satisfaction
        }, 'cache-integration');
      }
    } catch (error) {
      logger.error('Error updating satisfaction', {
        querySignature,
        satisfaction,
        error: error instanceof Error ? error.message : String(error)
      }, 'cache-integration');
    }
  }

  /**
   * Invalidate cache entries matching a pattern
   * @param {string} [pattern] - Pattern to match (optional)
   * @returns {Promise<void>}
   */
  async invalidateCache(pattern) {
    try {
      await this.cache.invalidate(pattern);
      
      logger.info('Cache invalidated', {
        pattern: pattern || 'all'
      }, 'cache-integration');
    } catch (error) {
      logger.error('Error invalidating cache', {
        pattern,
        error: error instanceof Error ? error.message : String(error)
      }, 'cache-integration');
    }
  }

  /**
   * Get cache performance statistics
   * @returns {Promise<Object>} Cache statistics
   */
  async getCacheStats() {
    try {
      return await this.cache.getStats();
    } catch (error) {
      logger.error('Error getting cache stats', {
        error: error instanceof Error ? error.message : String(error)
      }, 'cache-integration');
      return {
        hitRate: 0,
        totalRequests: 0,
        cacheHits: 0,
        cacheMisses: 0,
        entries: 0
      };
    }
  }

  /**
   * Process outcome signals to update cache entries
   * @param {Array} signals - Array of outcome signals
   * @returns {Promise<void>}
   */
  async processOutcomeSignals(signals) {
    try {
      let updatedCount = 0;
      
      for (const signal of signals) {
        if (signal.bundleSignature && signal.satisfied !== undefined) {
          // Convert satisfaction to 0-1 scale
          const satisfaction = signal.satisfied ? 1.0 : 0.0;
          
          await this.updateSatisfaction(signal.bundleSignature, satisfaction);
          updatedCount++;
        }
      }
      
      logger.debug('Processed outcome signals', {
        totalSignals: signals.length,
        updatedEntries: updatedCount
      }, 'cache-integration');
    } catch (error) {
      logger.error('Error processing outcome signals', {
        signalCount: signals.length,
        error: error instanceof Error ? error.message : String(error)
      }, 'cache-integration');
    }
  }

  /**
   * Clean up expired entries and destroy cache
   * @returns {Promise<void>}
   */
  async destroy() {
    try {
      await this.cache.destroy();
      logger.info('CacheIntegration destroyed', {}, 'cache-integration');
    } catch (error) {
      logger.error('Error destroying cache integration', {
        error: error instanceof Error ? error.message : String(error)
      }, 'cache-integration');
    }
  }
}