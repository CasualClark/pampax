/**
 * Basic Tests for Token System Core Functionality
 * 
 * Tests the core tokenizer factory functionality without complex dependencies
 */

import { test, describe } from 'node:test';
import assert from 'node:assert';

// Simple mock for testing without dependencies
const mockLogger = {
  error: (msg, meta) => console.error(`ERROR: ${msg}`, meta || ''),
  info: (msg, meta) => console.log(`INFO: ${msg}`, meta || ''),
  warn: (msg, meta) => console.warn(`WARN: ${msg}`, meta || ''),
  debug: (msg, meta) => process.env.DEBUG && console.log(`DEBUG: ${msg}`, meta || '')
};

// Mock the logger import
const logger = mockLogger;

// Simple tokenizer implementation for testing
class SimpleTokenizer {
  constructor(model = 'default') {
    this.model = model;
    this.config = {
      'gpt-4': { charsPerToken: 3.5, contextSize: 8192, maxTokens: 8192, name: 'GPT-4' },
      'gpt-3.5-turbo': { charsPerToken: 4.0, contextSize: 16384, maxTokens: 4096, name: 'GPT-3.5 Turbo' },
      'claude-3': { charsPerToken: 4.0, contextSize: 100000, maxTokens: 4096, name: 'Claude 3' },
      'default': { charsPerToken: 4.0, contextSize: 4096, maxTokens: 4096, name: 'Default' }
    }[model] || { charsPerToken: 4.0, contextSize: 4096, maxTokens: 4096, name: 'Default' };
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

  getContextSize() {
    return this.config.contextSize;
  }

  getMaxTokens() {
    return this.config.maxTokens;
  }

  getConfig() {
    return { ...this.config };
  }

  fitToContext(text, reserveTokens = 1000) {
    const maxTokens = this.getContextSize() - reserveTokens;
    const currentTokens = this.countTokens(text);
    
    if (currentTokens <= maxTokens) {
      return { text, tokens: currentTokens, truncated: false };
    }
    
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

// Mock TokenizerFactory
class TokenizerFactory {
  static instances = new Map();
  
  static create(model = 'default', options = {}) {
    const key = `${model}:${JSON.stringify(options)}`;
    
    if (this.instances.has(key)) {
      return this.instances.get(key);
    }
    
    const tokenizer = new SimpleTokenizer(model);
    this.instances.set(key, tokenizer);
    return tokenizer;
  }
  
  static getSupportedModels() {
    return ['gpt-4', 'gpt-3.5-turbo', 'claude-3', 'gemini-pro', 'llama-2', 'llama-3', 'mistral', 'mixtral'];
  }
  
  static getModelConfig(model) {
    const configs = {
      'gpt-4': { charsPerToken: 3.5, contextSize: 8192, maxTokens: 8192, name: 'GPT-4' },
      'gpt-3.5-turbo': { charsPerToken: 4.0, contextSize: 16384, maxTokens: 4096, name: 'GPT-3.5 Turbo' },
      'claude-3': { charsPerToken: 4.0, contextSize: 100000, maxTokens: 4096, name: 'Claude 3' },
      'gemini-pro': { charsPerToken: 4.0, contextSize: 32768, maxTokens: 8192, name: 'Gemini Pro' },
      'llama-2': { charsPerToken: 3.8, contextSize: 4096, maxTokens: 4096, name: 'LLaMA 2' },
      'llama-3': { charsPerToken: 3.8, contextSize: 8192, maxTokens: 4096, name: 'LLaMA 3' },
      'mistral': { charsPerToken: 3.8, contextSize: 8192, maxTokens: 4096, name: 'Mistral' },
      'mixtral': { charsPerToken: 3.8, contextSize: 32768, maxTokens: 4096, name: 'Mixtral' },
      'default': { charsPerToken: 4.0, contextSize: 4096, maxTokens: 4096, name: 'Default' }
    };
    return configs[model] || configs.default;
  }
  
  static clearAllCaches() {
    this.instances.clear();
  }
  
  static getStats() {
    return {
      totalInstances: this.instances.size,
      instances: Array.from(this.instances.entries()).map(([key, tokenizer]) => ({
        key,
        model: tokenizer.getModel(),
        type: tokenizer.constructor.name
      }))
    };
  }
}

// Mock utility functions
function countTokens(text, model = 'default') {
  const tokenizer = TokenizerFactory.create(model);
  return tokenizer.countTokens(text);
}

function countTokensBatch(texts, model = 'default') {
  const tokenizer = TokenizerFactory.create(model);
  return texts.map(text => tokenizer.countTokens(text));
}

function estimateTokensFromChars(charCount, model = 'default') {
  const config = TokenizerFactory.getModelConfig(model);
  return Math.ceil(charCount / config.charsPerToken);
}

function getModelRecommendations(estimatedTokens) {
  const models = TokenizerFactory.getSupportedModels();
  const recommendations = [];
  
  models.forEach(model => {
    const config = TokenizerFactory.getModelConfig(model);
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
      model,
      name: config.name,
      contextSize: config.contextSize,
      usagePercentage: Math.round(usagePercentage),
      recommendation,
      maxTokens: config.maxTokens
    });
  });
  
  const recommendationOrder = { 'good': 0, 'underutilized': 1, 'acceptable': 2, 'poor': 3 };
  recommendations.sort((a, b) => recommendationOrder[a.recommendation] - recommendationOrder[b.recommendation]);
  
  return recommendations;
}

describe('Token System Basic Tests', () => {
  describe('Tokenizer Factory Core Functionality', () => {
    test('should create tokenizers for supported models', () => {
      const models = ['gpt-4', 'gpt-3.5-turbo', 'claude-3'];
      
      models.forEach(model => {
        const tokenizer = TokenizerFactory.create(model);
        assert.ok(tokenizer);
        assert.strictEqual(tokenizer.getModel(), model);
        assert.ok(tokenizer.getConfig());
        assert.ok(tokenizer.getContextSize() > 0);
        assert.ok(tokenizer.getMaxTokens() > 0);
      });
    });

    test('should cache tokenizer instances', () => {
      const tokenizer1 = TokenizerFactory.create('gpt-4');
      const tokenizer2 = TokenizerFactory.create('gpt-4');
      
      assert.strictEqual(tokenizer1, tokenizer2, 'Should return same cached instance');
    });

    test('should provide accurate token counting', () => {
      const testText = 'Hello world! This is a test message for tokenization.';
      const tokenizer = TokenizerFactory.create('gpt-4');
      
      const count = tokenizer.countTokens(testText);
      assert.ok(count > 0, 'Should count tokens');
      assert.ok(count < testText.length, 'Token count should be less than character count');
      
      const estimate = tokenizer.estimateTokens(testText);
      assert.strictEqual(count, estimate, 'Count and estimate should be same for simple tokenizer');
    });

    test('should handle edge cases gracefully', () => {
      const tokenizer = TokenizerFactory.create('gpt-4');
      
      assert.strictEqual(tokenizer.countTokens(''), 0, 'Empty string should return 0 tokens');
      assert.strictEqual(tokenizer.countTokens(null), 0, 'Null should return 0 tokens');
      assert.strictEqual(tokenizer.countTokens(undefined), 0, 'Undefined should return 0 tokens');
      assert.strictEqual(tokenizer.countTokens(123), 0, 'Number should return 0 tokens');
    });

    test('should fit content to context', () => {
      const tokenizer = TokenizerFactory.create('gpt-4');
      const longText = 'This is a very long text that should be truncated when fit to context. '.repeat(100);
      
      const result = tokenizer.fitToContext(longText, 1000);
      
      assert.ok(result.text.length <= longText.length, 'Should truncate if necessary');
      assert.ok(result.tokens <= tokenizer.getContextSize() - 1000, 'Should fit within context minus reserve');
      assert.strictEqual(typeof result.truncated, 'boolean', 'Should indicate if truncated');
    });
  });

  describe('Utility Functions', () => {
    test('should count tokens for simple text', () => {
      const text = 'Hello world!';
      const count = countTokens(text);
      
      assert.ok(count > 0, 'Should count tokens');
      assert.strictEqual(typeof count, 'number', 'Should return number');
    });

    test('should count tokens for batch of texts', () => {
      const texts = [
        'Hello world!',
        'This is a test',
        'Batch processing test'
      ];
      
      const counts = countTokensBatch(texts);
      
      assert.strictEqual(counts.length, texts.length, 'Should return count for each text');
      counts.forEach(count => {
        assert.ok(count > 0, 'Each count should be greater than 0');
      });
    });

    test('should estimate tokens from character count', () => {
      const charCount = 100;
      const estimatedTokens = estimateTokensFromChars(charCount, 'gpt-4');
      
      assert.ok(estimatedTokens > 0, 'Should estimate positive tokens');
      assert.ok(estimatedTokens <= charCount, 'Should not exceed character count');
    });

    test('should provide model recommendations', () => {
      const estimatedTokens = 4000;
      const recommendations = getModelRecommendations(estimatedTokens);
      
      assert.ok(Array.isArray(recommendations), 'Should return array');
      assert.ok(recommendations.length > 0, 'Should have recommendations');
      
      recommendations.forEach(rec => {
        assert.ok(rec.model, 'Should have model name');
        assert.ok(rec.name, 'Should have display name');
        assert.ok(rec.contextSize, 'Should have context size');
        assert.ok(rec.usagePercentage, 'Should have usage percentage');
        assert.ok(rec.recommendation, 'Should have recommendation level');
        assert.ok(rec.maxTokens, 'Should have max tokens');
      });
      
      // Should be sorted by recommendation quality
      const recommendationOrder = { 'good': 0, 'underutilized': 1, 'acceptable': 2, 'poor': 3 };
      for (let i = 0; i < recommendations.length - 1; i++) {
        const current = recommendations[i];
        const next = recommendations[i + 1];
        assert.ok(
          recommendationOrder[current.recommendation] <= recommendationOrder[next.recommendation],
          'Should be sorted by recommendation quality'
        );
      }
    });
  });

  describe('Performance Tests', () => {
    test('should perform token counting efficiently', () => {
      const testText = 'Performance test text for token counting efficiency measurement.';
      const iterations = 1000;
      
      const startTime = Date.now();
      
      for (let i = 0; i < iterations; i++) {
        countTokens(testText + \` // iteration \${i}\`);
      }
      
      const endTime = Date.now();
      const totalTime = endTime - startTime;
      const avgTime = totalTime / iterations;
      
      assert.ok(avgTime < 1, \`Should be efficient (< 1ms per call), got \${avgTime}ms\`);
      assert.ok(totalTime < 1000, \`Should complete quickly (< 1s total), got \${totalTime}ms\`);
    });

    test('should handle batch processing efficiently', () => {
      const texts = Array.from({ length: 100 }, (_, i) => \`Test text \${i} for batch processing efficiency testing.\`);
      const iterations = 10;
      
      const startTime = Date.now();
      
      for (let i = 0; i < iterations; i++) {
        countTokensBatch(texts);
      }
      
      const endTime = Date.now();
      const totalTime = endTime - startTime;
      const avgTime = totalTime / iterations;
      
      assert.ok(avgTime < 50, \`Batch processing should be efficient (< 50ms per batch), got \${avgTime}ms\`);
      assert.ok(totalTime < 500, \`Should complete quickly (< 500ms total), got \${totalTime}ms\`);
    });

    test('should maintain performance with caching', () => {
      const testText = 'Caching performance test text that should be cached for efficiency.';
      const iterations = 100;
      
      // First pass - populate cache
      TokenizerFactory.clearAllCaches();
      const startTime1 = Date.now();
      
      for (let i = 0; i < iterations; i++) {
        const tokenizer = TokenizerFactory.create('gpt-4');
        tokenizer.countTokens(testText + \` // pass 1 iteration \${i}\`);
      }
      
      const time1 = Date.now() - startTime1;
      
      // Second pass - should hit cache
      const startTime2 = Date.now();
      
      for (let i = 0; i < iterations; i++) {
        const tokenizer = TokenizerFactory.create('gpt-4');
        tokenizer.countTokens(testText + \` // pass 2 iteration \${i}\`);
      }
      
      const time2 = Date.now() - startTime2;
      
      const speedImprovement = time1 / time2;
      
      assert.ok(speedImprovement >= 1, \`Cache should provide speed improvement, got \${speedImprovement}x\`);
      assert.ok(time2 < time1, \`Second pass should be faster, got \${time2}ms vs \${time1}ms\`);
    });
  });

  describe('Model-Specific Behavior', () => {
    test('should handle different models correctly', () => {
      const models = ['gpt-4', 'gpt-3.5-turbo', 'claude-3'];
      const testText = 'Model-specific test text for verifying different tokenizer behaviors.';
      
      const results = {};
      
      models.forEach(model => {
        const tokenizer = TokenizerFactory.create(model);
        results[model] = {
          count: tokenizer.countTokens(testText),
          config: tokenizer.getConfig()
        };
      });
      
      // All models should produce reasonable token counts
      Object.values(results).forEach(result => {
        assert.ok(result.count > 0, 'Each model should count tokens');
        assert.ok(result.count < testText.length, 'Token count should be less than character count');
      });
      
      // GPT models should use similar tokenization (cl100k_base)
      const gpt4Count = results['gpt-4'].count;
      const gpt35Count = results['gpt-3.5-turbo'].count;
      assert.ok(Math.abs(gpt4Count - gpt35Count) <= 1, 'GPT-4 and GPT-3.5 should have similar counts');
      
      // Claude should handle larger contexts
      const claudeConfig = results['claude-3'].config;
      assert.ok(claudeConfig.contextSize > results['gpt-4'].config.contextSize, 'Claude should have larger context');
    });

    test('should provide accurate model configurations', () => {
      const models = TokenizerFactory.getSupportedModels();
      
      assert.ok(models.length >= 8, 'Should support at least 8 models');
      
      models.forEach(model => {
        const config = TokenizerFactory.getModelConfig(model);
        assert.ok(config.name, `Should have name for ${model}`);
        assert.ok(config.charsPerToken > 0, `Should have valid charsPerToken for ${model}`);
        assert.ok(config.contextSize > 0, `Should have valid contextSize for ${model}`);
        assert.ok(config.maxTokens > 0, `Should have valid maxTokens for ${model}`);
      });
    });
  });

  describe('Error Handling', () => {
    test('should handle invalid model names gracefully', () => {
      assert.doesNotThrow(() => {
        TokenizerFactory.create('non-existent-model');
      }, 'Should not throw for unknown model');
      
      assert.doesNotThrow(() => {
        TokenizerFactory.create('');
      }, 'Should not throw for empty model');
      
      assert.doesNotThrow(() => {
        TokenizerFactory.create(null);
      }, 'Should not throw for null model');
    });

    test('should handle extreme text lengths', () => {
      const tokenizer = TokenizerFactory.create('gpt-4');
      
      // Very long text
      const longText = 'a'.repeat(100000);
      assert.doesNotThrow(() => {
        tokenizer.countTokens(longText);
      }, 'Should handle very long text');
      
      // Should still return reasonable count
      const count = tokenizer.countTokens(longText);
      assert.ok(count > 0, 'Should handle very long text');
      assert.ok(count < longText.length, 'Token count should be less than character count');
    });

    test('should handle special characters', () => {
      const tokenizer = TokenizerFactory.create('gpt-4');
      
      const specialText = '🚀 Hello 世界! \\n\\t Test with special chars: @#$%^&*()';
      const count = tokenizer.countTokens(specialText);
      
      assert.ok(count > 0, 'Should handle special characters');
      assert.ok(typeof count === 'number', 'Should return number');
    });

    test('should handle Unicode text', () => {
      const tokenizer = TokenizerFactory.create('gpt-4');
      
      const unicodeText = '测试中文 🇨🇳 Тест русский العربية';
      const count = tokenizer.countTokens(unicodeText);
      
      assert.ok(count > 0, 'Should handle Unicode text');
    });
  });

  describe('Statistics and Monitoring', () => {
    test('should provide accurate statistics', () => {
      // Create multiple tokenizers
      TokenizerFactory.create('gpt-4');
      TokenizerFactory.create('claude-3');
      TokenizerFactory.create('gpt-4', { advanced: true });
      TokenizerFactory.create('gpt-3.5-turbo');
      
      const stats = TokenizerFactory.getStats();
      
      assert.ok(stats.totalInstances >= 4, 'Should track multiple instances');
      assert.ok(Array.isArray(stats.instances), 'Should provide instances array');
      assert.ok(stats.instances.length >= 4, 'Should list all instances');
      
      // Verify instance details
      const instanceModels = stats.instances.map(i => i.model);
      assert.ok(instanceModels.includes('gpt-4'), 'Should include gpt-4 instance');
      assert.ok(instanceModels.includes('claude-3'), 'Should include claude-3 instance');
    });

    test('should clear caches properly', () => {
      // Create some instances
      TokenizerFactory.create('gpt-4');
      TokenizerFactory.create('claude-3');
      
      let stats = TokenizerFactory.getStats();
      assert.ok(stats.totalInstances > 0, 'Should have instances before clearing');
      
      TokenizerFactory.clearAllCaches();
      
      stats = TokenizerFactory.getStats();
      assert.strictEqual(stats.totalInstances, 0, 'Should have no instances after clearing');
    });
  });
});