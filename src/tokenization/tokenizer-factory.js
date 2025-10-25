/**
 * Tokenizer Factory for PAMPAX
 * 
 * Provides a unified interface for different tokenization methods
 * and model-specific token counting with fallbacks and caching.
 */

import { logger } from '../config/logger.js';

// Model configurations based on actual tokenizer specifications
const MODEL_CONFIGS = {
  // OpenAI models
  'gpt-4': {
    name: 'GPT-4',
    charsPerToken: 3.5,
    contextSize: 8192,
    maxTokens: 8192,
    tokenizer: 'cl100k_base'
  },
  'gpt-4-turbo': {
    name: 'GPT-4 Turbo',
    charsPerToken: 3.5,
    contextSize: 128000,
    maxTokens: 4096,
    tokenizer: 'cl100k_base'
  },
  'gpt-4o': {
    name: 'GPT-4o',
    charsPerToken: 3.5,
    contextSize: 128000,
    maxTokens: 4096,
    tokenizer: 'cl100k_base'
  },
  'gpt-3.5-turbo': {
    name: 'GPT-3.5 Turbo',
    charsPerToken: 4.0,
    contextSize: 16384,
    maxTokens: 4096,
    tokenizer: 'cl100k_base'
  },
  
  // Anthropic models
  'claude-3': {
    name: 'Claude 3',
    charsPerToken: 4.0,
    contextSize: 100000,
    maxTokens: 4096,
    tokenizer: 'claude'
  },
  'claude-3.5-sonnet': {
    name: 'Claude 3.5 Sonnet',
    charsPerToken: 4.0,
    contextSize: 200000,
    maxTokens: 4096,
    tokenizer: 'claude'
  },
  'claude-3-opus': {
    name: 'Claude 3 Opus',
    charsPerToken: 4.0,
    contextSize: 200000,
    maxTokens: 4096,
    tokenizer: 'claude'
  },
  'claude-3-haiku': {
    name: 'Claude 3 Haiku',
    charsPerToken: 4.0,
    contextSize: 200000,
    maxTokens: 4096,
    tokenizer: 'claude'
  },
  
  // Google models
  'gemini-pro': {
    name: 'Gemini Pro',
    charsPerToken: 4.0,
    contextSize: 32768,
    maxTokens: 8192,
    tokenizer: 'gemini'
  },
  
  // Open source models
  'llama-2': {
    name: 'LLaMA 2',
    charsPerToken: 3.8,
    contextSize: 4096,
    maxTokens: 4096,
    tokenizer: 'llama'
  },
  'llama-3': {
    name: 'LLaMA 3',
    charsPerToken: 3.8,
    contextSize: 8192,
    maxTokens: 4096,
    tokenizer: 'llama3'
  },
  'mistral': {
    name: 'Mistral',
    charsPerToken: 3.8,
    contextSize: 8192,
    maxTokens: 4096,
    tokenizer: 'mistral'
  },
  'mixtral': {
    name: 'Mixtral',
    charsPerToken: 3.8,
    contextSize: 32768,
    maxTokens: 4096,
    tokenizer: 'mixtral'
  },
  
  // Default fallback
  'default': {
    name: 'Default',
    charsPerToken: 4.0,
    contextSize: 4096,
    maxTokens: 4096,
    tokenizer: 'default'
  }
};

/**
 * Simple character-based tokenizer (fallback)
 */
class SimpleTokenizer {
  constructor(model = 'default') {
    this.model = model;
    this.config = MODEL_CONFIGS[model] || MODEL_CONFIGS.default;
  }

  countTokens(text) {
    if (!text || typeof text !== 'string') return 0;
    return Math.ceil(text.length / this.config.charsPerToken);
  }

  estimateTokens(text) {
    return this.countTokens(text);
  }

  getModel() {
    return this.model;
  }

  getConfig() {
    return { ...this.config };
  }

  getContextSize() {
    return this.config.contextSize;
  }

  getMaxTokens() {
    return this.config.maxTokens;
  }

  getCharsPerToken() {
    return this.config.charsPerToken;
  }

  fitToContext(text, reserveTokens = 1000) {
    const maxTokens = this.getContextSize() - reserveTokens;
    const currentTokens = this.countTokens(text);
    
    if (currentTokens <= maxTokens) {
      return { text, tokens: currentTokens, truncated: false };
    }
    
    // Simple truncation strategy
    const ratio = maxTokens / currentTokens;
    const maxChars = Math.floor(text.length * ratio);
    const truncated = text.substring(0, maxChars);
    
    return {
      text: truncated,
      tokens: this.countTokens(truncated),
      truncated: true,
      originalTokens: currentTokens
    };
  }
}

/**
 * Advanced tokenizer with caching (if tiktoken is available)
 */
class AdvancedTokenizer extends SimpleTokenizer {
  constructor(model = 'default') {
    super(model);
    this.cache = new Map();
    this.cacheSize = 1000;
  }

  async countTokens(text) {
    if (!text || typeof text !== 'string') return 0;
    
    // Check cache first
    const cacheKey = `${this.model}:${text.length}:${text.substring(0, 50)}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }
    
    let count;
    try {
      // Try to use tiktoken if available
      count = await this.tokenizeWithTiktoken(text);
    } catch (error) {
      // Fallback to simple counting
      count = super.countTokens(text);
      logger.debug('Using fallback tokenizer', { model: this.model, error: error.message });
    }
    
    // Update cache
    if (this.cache.size >= this.cacheSize) {
      // Remove oldest entry (simple FIFO)
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(cacheKey, count);
    
    return count;
  }

  async tokenizeWithTiktoken(text) {
    // This would integrate with tiktoken if available
    // For now, use the simple fallback
    return super.countTokens(text);
  }

  clearCache() {
    this.cache.clear();
  }

  getCacheStats() {
    return {
      size: this.cache.size,
      maxSize: this.cacheSize
    };
  }
}

/**
 * Tokenizer Factory
 */
export class TokenizerFactory {
  static instances = new Map();
  
  static create(model = 'default', options = {}) {
    const key = `${model}:${JSON.stringify(options)}`;
    
    if (this.instances.has(key)) {
      return this.instances.get(key);
    }
    
    // Validate model
    if (!MODEL_CONFIGS[model]) {
      logger.warn('Unknown model, using default', { model, available: Object.keys(MODEL_CONFIGS) });
      model = 'default';
    }
    
    // Create tokenizer instance
    let tokenizer;
    if (options.advanced && this.isAdvancedAvailable()) {
      tokenizer = new AdvancedTokenizer(model);
    } else {
      tokenizer = new SimpleTokenizer(model);
    }
    
    this.instances.set(key, tokenizer);
    return tokenizer;
  }
  
  static isAdvancedAvailable() {
    // Check if tiktoken or other advanced tokenizers are available
    try {
      // Would check for tiktoken availability here
      return false; // For now, always use simple tokenizer
    } catch {
      return false;
    }
  }
  
  static getSupportedModels() {
    return Object.keys(MODEL_CONFIGS).filter(model => model !== 'default');
  }
  
  static getModelConfig(model) {
    return MODEL_CONFIGS[model] || MODEL_CONFIGS.default;
  }
  
  static validateModel(model) {
    return model in MODEL_CONFIGS;
  }
  
  static clearAllCaches() {
    this.instances.forEach(tokenizer => {
      if (tokenizer.clearCache) {
        tokenizer.clearCache();
      }
    });
    this.instances.clear();
  }
  
  static getStats() {
    const stats = {
      totalInstances: this.instances.size,
      instances: []
    };
    
    this.instances.forEach((tokenizer, key) => {
      const instanceStats = {
        key,
        model: tokenizer.getModel(),
        type: tokenizer.constructor.name
      };
      
      if (tokenizer.getCacheStats) {
        instanceStats.cache = tokenizer.getCacheStats();
      }
      
      stats.instances.push(instanceStats);
    });
    
    return stats;
  }
}

/**
 * Convenience function for creating tokenizers
 */
export function createTokenizer(model = 'default', options = {}) {
  return TokenizerFactory.create(model, options);
}

/**
 * Quick token counting utility
 */
export function countTokens(text, model = 'default') {
  const tokenizer = TokenizerFactory.create(model);
  return tokenizer.countTokens(text);
}

/**
 * Batch token counting for multiple texts
 */
export function countTokensBatch(texts, model = 'default') {
  const tokenizer = TokenizerFactory.create(model);
  return texts.map(text => tokenizer.countTokens(text));
}

/**
 * Estimate tokens from character count (fast approximation)
 */
export function estimateTokensFromChars(charCount, model = 'default') {
  const config = MODEL_CONFIGS[model] || MODEL_CONFIGS.default;
  return Math.ceil(charCount / config.charsPerToken);
}

/**
 * Get model recommendations based on token requirements
 */
export function getModelRecommendations(estimatedTokens) {
  const recommendations = [];
  
  for (const [modelKey, config] of Object.entries(MODEL_CONFIGS)) {
    if (modelKey === 'default') continue;
    
    const usagePercentage = (estimatedTokens / config.contextSize) * 100;
    let recommendation = 'good';
    
    if (usagePercentage > 90) {
      recommendation = 'poor';
    } else if (usagePercentage > 70) {
      recommendation = 'acceptable';
    } else if (usagePercentage < 20) {
      recommendation = 'underutilized';
    }
    
    recommendations.push({
      model: modelKey,
      name: config.name,
      contextSize: config.contextSize,
      usagePercentage: Math.round(usagePercentage),
      recommendation,
      maxTokens: config.maxTokens
    });
  }
  
  // Sort by recommendation quality
  const recommendationOrder = { 'good': 0, 'underutilized': 1, 'acceptable': 2, 'poor': 3 };
  recommendations.sort((a, b) => recommendationOrder[a.recommendation] - recommendationOrder[b.recommendation]);
  
  return recommendations;
}

// Export model configs for reference
export { MODEL_CONFIGS };

// Default export
export default {
  TokenizerFactory,
  createTokenizer,
  countTokens,
  countTokensBatch,
  estimateTokensFromChars,
  getModelRecommendations,
  MODEL_CONFIGS
};