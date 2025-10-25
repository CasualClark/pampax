/**
 * Comprehensive Tests for Tokenizer Factory
 * 
 * Tests core tokenizer functionality for main models (GPT-4, Claude-3, GPT-3.5),
 * caching and performance, and error handling.
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';

// Mock logger before importing tokenizer factory
global.logger = {
  error: (msg, meta) => console.error(`ERROR: ${msg}`, meta || ''),
  info: (msg, meta) => console.log(`INFO: ${msg}`, meta || ''),
  warn: (msg, meta) => console.warn(`WARN: ${msg}`, meta || ''),
  debug: (msg, meta) => process.env.DEBUG && console.log(`DEBUG: ${msg}`, meta || '')
};

// Now import tokenizer factory
import { 
  TokenizerFactory, 
  createTokenizer, 
  countTokens, 
  countTokensBatch, 
  estimateTokensFromChars,
  getModelRecommendations,
  MODEL_CONFIGS 
} from '../src/tokenization/tokenizer-factory.js';

describe('Tokenizer Factory', () => {
  beforeEach(() => {
    // Clear any existing instances for clean testing
    TokenizerFactory.instances.clear();
  });

  afterEach(() => {
    // Clean up after each test
    TokenizerFactory.clearAllCaches();
  });

  describe('Core Model Support', () => {
    test('should support GPT-4 model with correct configuration', () => {
      const tokenizer = createTokenizer('gpt-4');
      const config = tokenizer.getConfig();
      
      assert.strictEqual(config.name, 'GPT-4');
      assert.strictEqual(config.charsPerToken, 3.5);
      assert.strictEqual(config.contextSize, 8192);
      assert.strictEqual(config.maxTokens, 8192);
      assert.strictEqual(config.tokenizer, 'cl100k_base');
      assert.strictEqual(tokenizer.getModel(), 'gpt-4');
    });

    test('should support Claude-3 model with correct configuration', () => {
      const tokenizer = createTokenizer('claude-3');
      const config = tokenizer.getConfig();
      
      assert.strictEqual(config.name, 'Claude 3');
      assert.strictEqual(config.charsPerToken, 4.0);
      assert.strictEqual(config.contextSize, 100000);
      assert.strictEqual(config.maxTokens, 4096);
      assert.strictEqual(config.tokenizer, 'claude');
      assert.strictEqual(tokenizer.getModel(), 'claude-3');
    });

    test('should support GPT-3.5-turbo model with correct configuration', () => {
      const tokenizer = createTokenizer('gpt-3.5-turbo');
      const config = tokenizer.getConfig();
      
      assert.strictEqual(config.name, 'GPT-3.5 Turbo');
      assert.strictEqual(config.charsPerToken, 4.0);
      assert.strictEqual(config.contextSize, 16384);
      assert.strictEqual(config.maxTokens, 4096);
      assert.strictEqual(config.tokenizer, 'cl100k_base');
      assert.strictEqual(tokenizer.getModel(), 'gpt-3.5-turbo');
    });

    test('should handle unknown models gracefully with fallback to default', () => {
      const tokenizer = createTokenizer('unknown-model');
      const config = tokenizer.getConfig();
      
      assert.strictEqual(config.name, 'Default');
      assert.strictEqual(tokenizer.getModel(), 'default');
      assert.strictEqual(config.charsPerToken, 4.0);
      assert.strictEqual(config.contextSize, 4096);
    });
  });

  describe('Token Counting Accuracy', () => {
    test('should count tokens accurately for main models', () => {
      const testText = 'Hello world! This is a test message for tokenization.';
      const models = ['gpt-4', 'claude-3', 'gpt-3.5-turbo'];
      
      models.forEach(model => {
        const tokenizer = createTokenizer(model);
        const count = tokenizer.countTokens(testText);
        
        assert.ok(count > 0, `Should count tokens for ${model}`);
        assert.ok(count < testText.length, `Token count should be less than character count for ${model}`);
        assert.strictEqual(typeof count, 'number', `Should return number for ${model}`);
      });
    });

    test('should provide consistent results across multiple calls', () => {
      const testText = 'Consistency test message for multiple calls.';
      const tokenizer = createTokenizer('gpt-4');
      
      const count1 = tokenizer.countTokens(testText);
      const count2 = tokenizer.countTokens(testText);
      const count3 = tokenizer.countTokens(testText);
      
      assert.strictEqual(count1, count2, 'First and second calls should match');
      assert.strictEqual(count2, count3, 'Second and third calls should match');
    });

    test('should handle edge cases gracefully', () => {
      const tokenizer = createTokenizer('gpt-4');
      
      assert.strictEqual(tokenizer.countTokens(''), 0, 'Empty string should return 0');
      assert.strictEqual(tokenizer.countTokens(null), 0, 'Null should return 0');
      assert.strictEqual(tokenizer.countTokens(undefined), 0, 'Undefined should return 0');
      assert.strictEqual(tokenizer.countTokens(123), 0, 'Number should return 0');
      assert.strictEqual(tokenizer.countTokens({}), 0, 'Object should return 0');
      assert.strictEqual(tokenizer.countTokens([]), 0, 'Array should return 0');
    });

    test('should handle special characters and Unicode', () => {
      const tokenizer = createTokenizer('gpt-4');
      
      const specialText = '🚀 Hello 世界! \n\t Test with special chars: @#$%^&*()';
      const unicodeText = '测试中文 🇨🇳 Тест русский العربية';
      
      const specialCount = tokenizer.countTokens(specialText);
      const unicodeCount = tokenizer.countTokens(unicodeText);
      
      assert.ok(specialCount > 0, 'Should handle special characters');
      assert.ok(unicodeCount > 0, 'Should handle Unicode text');
      assert.strictEqual(typeof specialCount, 'number', 'Should return number for special chars');
      assert.strictEqual(typeof unicodeCount, 'number', 'Should return number for Unicode');
    });
  });

  describe('Caching Mechanisms', () => {
    test('should cache tokenizer instances for same model', () => {
      const tokenizer1 = createTokenizer('gpt-4');
      const tokenizer2 = createTokenizer('gpt-4');
      
      assert.strictEqual(tokenizer1, tokenizer2, 'Should return same cached instance');
    });

    test('should create separate instances for different models', () => {
      const gpt4Tokenizer = createTokenizer('gpt-4');
      const claudeTokenizer = createTokenizer('claude-3');
      
      assert.notStrictEqual(gpt4Tokenizer, claudeTokenizer, 'Should create separate instances');
      assert.strictEqual(gpt4Tokenizer.getModel(), 'gpt-4');
      assert.strictEqual(claudeTokenizer.getModel(), 'claude-3');
    });

    test('should create separate instances for different options', () => {
      const tokenizer1 = createTokenizer('gpt-4', {});
      const tokenizer2 = createTokenizer('gpt-4', { advanced: true });
      
      assert.notStrictEqual(tokenizer1, tokenizer2, 'Should create separate instances with different options');
    });

    test('should clear all caches properly', () => {
      createTokenizer('gpt-4');
      createTokenizer('claude-3');
      createTokenizer('gpt-3.5-turbo');
      
      let stats = TokenizerFactory.getStats();
      assert.ok(stats.totalInstances > 0, 'Should have cached instances');
      
      TokenizerFactory.clearAllCaches();
      stats = TokenizerFactory.getStats();
      assert.strictEqual(stats.totalInstances, 0, 'Should clear all instances');
    });

    test('should provide accurate statistics', () => {
      createTokenizer('gpt-4');
      createTokenizer('claude-3');
      createTokenizer('gpt-4', { advanced: true });
      
      const stats = TokenizerFactory.getStats();
      
      assert.strictEqual(stats.totalInstances, 3, 'Should track 3 instances');
      assert.strictEqual(stats.instances.length, 3, 'Should list all instances');
      
      const instanceModels = stats.instances.map(i => i.model);
      assert.ok(instanceModels.includes('gpt-4'), 'Should include gpt-4 instance');
      assert.ok(instanceModels.includes('claude-3'), 'Should include claude-3 instance');
    });
  });

  describe('Performance Characteristics', () => {
    test('should count tokens efficiently for single text', () => {
      const tokenizer = createTokenizer('gpt-4');
      const testText = 'Performance test text '.repeat(100);
      
      const startTime = Date.now();
      const count = tokenizer.countTokens(testText);
      const endTime = Date.now();
      
      assert.ok(count > 0, 'Should count tokens');
      assert.ok(endTime - startTime < 50, 'Should complete quickly (< 50ms)');
    });

    test('should handle batch processing efficiently', () => {
      const texts = Array.from({ length: 100 }, (_, i) => `Test text ${i} for batch processing.`);
      
      const startTime = Date.now();
      const counts = countTokensBatch(texts);
      const endTime = Date.now();
      
      assert.strictEqual(counts.length, texts.length, 'Should return count for each text');
      assert.ok(endTime - startTime < 100, 'Batch processing should be efficient (< 100ms)');
      
      counts.forEach(count => {
        assert.ok(count > 0, 'Each count should be greater than 0');
      });
    });

    test('should maintain performance with large texts', () => {
      const tokenizer = createTokenizer('gpt-4');
      const longText = 'a'.repeat(100000); // 100k characters
      
      const startTime = Date.now();
      const count = tokenizer.countTokens(longText);
      const endTime = Date.now();
      
      assert.ok(count > 0, 'Should handle large text');
      assert.ok(count < longText.length, 'Token count should be less than character count');
      assert.ok(endTime - startTime < 100, 'Should handle large text efficiently (< 100ms)');
    });

    test('should be performant with repeated calls', () => {
      const testText = 'Repeated calls performance test';
      const iterations = 1000;
      
      const startTime = Date.now();
      
      for (let i = 0; i < iterations; i++) {
        countTokens(testText);
      }
      
      const endTime = Date.now();
      const totalTime = endTime - startTime;
      const avgTime = totalTime / iterations;
      
      assert.ok(avgTime < 1, `Should be efficient (< 1ms per call), got ${avgTime}ms`);
      assert.ok(totalTime < 1000, `Should complete quickly (< 1s total), got ${totalTime}ms`);
    });
  });

  describe('Error Handling', () => {
    test('should handle invalid model names gracefully', () => {
      assert.doesNotThrow(() => createTokenizer('invalid-model-name'));
      assert.doesNotThrow(() => createTokenizer(''));
      assert.doesNotThrow(() => createTokenizer(null));
      assert.doesNotThrow(() => createTokenizer(undefined));
    });

    test('should handle malformed inputs without crashing', () => {
      const tokenizer = createTokenizer('gpt-4');
      
      // Should not throw errors for malformed inputs
      assert.doesNotThrow(() => tokenizer.countTokens(123));
      assert.doesNotThrow(() => tokenizer.countTokens({}));
      assert.doesNotThrow(() => tokenizer.countTokens([]));
      assert.doesNotThrow(() => tokenizer.countTokens(false));
      assert.doesNotThrow(() => tokenizer.countTokens(NaN));
    });

    test('should handle extreme text lengths', () => {
      const tokenizer = createTokenizer('gpt-4');
      
      // Very long text (1M characters)
      const veryLongText = 'x'.repeat(1000000);
      assert.doesNotThrow(() => tokenizer.countTokens(veryLongText));
      
      const count = tokenizer.countTokens(veryLongText);
      assert.ok(count > 0, 'Should handle very long text');
      assert.ok(count < veryLongText.length, 'Token count should be reasonable');
    });
  });

  describe('Context Management', () => {
    test('should provide context size information', () => {
      const gpt4Tokenizer = createTokenizer('gpt-4');
      const claudeTokenizer = createTokenizer('claude-3');
      const gpt35Tokenizer = createTokenizer('gpt-3.5-turbo');
      
      assert.strictEqual(gpt4Tokenizer.getContextSize(), 8192);
      assert.strictEqual(claudeTokenizer.getContextSize(), 100000);
      assert.strictEqual(gpt35Tokenizer.getContextSize(), 16384);
    });

    test('should fit content to context with truncation', () => {
      const tokenizer = createTokenizer('gpt-4');
      const longText = 'This is a test. '.repeat(1000); // Long text
      
      const result = tokenizer.fitToContext(longText, 1000);
      
      assert.ok(result.text.length <= longText.length, 'Should truncate if necessary');
      assert.ok(result.tokens <= 8192 - 1000, 'Should fit within context minus reserve');
      assert.strictEqual(typeof result.truncated, 'boolean', 'Should indicate if truncated');
    });

    test('should fit content without truncation when possible', () => {
      const tokenizer = createTokenizer('gpt-4');
      const shortText = 'Short text that fits easily';
      
      const result = tokenizer.fitToContext(shortText, 1000);
      
      assert.strictEqual(result.text, shortText, 'Should not truncate short text');
      assert.strictEqual(result.truncated, false, 'Should not be truncated');
    });
  });

  describe('Utility Functions', () => {
    test('should estimate tokens from character count', () => {
      const charCount = 100;
      const gpt4Tokens = estimateTokensFromChars(charCount, 'gpt-4');
      const claudeTokens = estimateTokensFromChars(charCount, 'claude-3');
      
      assert.ok(gpt4Tokens > 0, 'Should estimate positive tokens for GPT-4');
      assert.ok(claudeTokens > 0, 'Should estimate positive tokens for Claude');
      assert.ok(gpt4Tokens <= charCount, 'Should not exceed character count');
      assert.ok(claudeTokens <= charCount, 'Should not exceed character count');
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
    });

    test('should sort recommendations by quality', () => {
      const recommendations = getModelRecommendations(5000);
      
      // Should be sorted by recommendation quality (good first)
      const qualityOrder = { 'good': 0, 'underutilized': 1, 'acceptable': 2, 'poor': 3 };
      for (let i = 0; i < recommendations.length - 1; i++) {
        const current = recommendations[i];
        const next = recommendations[i + 1];
        
        const currentQuality = qualityOrder[current.recommendation];
        const nextQuality = qualityOrder[next.recommendation];
        
        assert.ok(currentQuality <= nextQuality, 'Should be sorted by recommendation quality');
      }
    });
  });

  describe('Advanced Features', () => {
    test('should check advanced tokenizer availability', () => {
      const isAvailable = TokenizerFactory.isAdvancedAvailable();
      assert.strictEqual(typeof isAvailable, 'boolean', 'Should return boolean');
    });

    test('should handle async token counting in advanced mode', async () => {
      const tokenizer = createTokenizer('gpt-4', { advanced: true });
      const testText = 'Test async token counting';
      
      // Should not throw even for async method
      const count = await tokenizer.countTokens(testText);
      assert.ok(count > 0, 'Should return valid token count');
    });

    test('should provide cache statistics for advanced tokenizer', () => {
      const tokenizer = createTokenizer('gpt-4', { advanced: true });
      
      if (tokenizer.getCacheStats) {
        const stats = tokenizer.getCacheStats();
        assert.ok(typeof stats.size === 'number', 'Should have cache size');
        assert.ok(typeof stats.maxSize === 'number', 'Should have max cache size');
      }
    });
  });

  describe('Integration Tests', () => {
    test('should work with real-world code content', () => {
      const code = `function calculateTotal(items) {
        return items.reduce((sum, item) => sum + item.price, 0);
      }
      
      class Calculator {
        constructor() {
          this.history = [];
        }
        
        add(a, b) {
          const result = a + b;
          this.history.push({ operation: 'add', a, b, result });
          return result;
        }
      }`;
      
      const tokenizer = createTokenizer('gpt-4');
      const count = tokenizer.countTokens(code);
      
      assert.ok(count > 0, 'Should handle code content');
      assert.ok(count < code.length, 'Token count should be less than character count');
    });

    test('should handle mixed content types', () => {
      const mixedContent = `
# API Documentation

This endpoint allows you to retrieve user information.

## Request
\`\`\`json
GET /api/users/{id}
\`\`\`

## Response
\`\`\`json
{
  "id": 123,
  "name": "John Doe",
  "email": "john@example.com"
}
\`\`\`

## Usage Examples
- JavaScript: \`fetch('/api/users/123')\`
- Python: \`requests.get('/api/users/123')\`
      `.trim();
      
      const tokenizer = createTokenizer('gpt-4');
      const count = tokenizer.countTokens(mixedContent);
      
      assert.ok(count > 0, 'Should handle mixed content');
    });

    test('should maintain consistency across model families', () => {
      const text = 'Family consistency test across models';
      const gptModels = ['gpt-4', 'gpt-4-turbo', 'gpt-4o'];
      
      const counts = gptModels.map(model => {
        const tokenizer = createTokenizer(model);
        return tokenizer.countTokens(text);
      });
      
      // GPT-4 family should use same tokenizer (cl100k_base)
      const [gpt4, gpt4Turbo, gpt4o] = counts;
      assert.ok(Math.abs(gpt4 - gpt4Turbo) <= 1, 'GPT-4 and GPT-4 Turbo should be similar');
      assert.ok(Math.abs(gpt4 - gpt4o) <= 1, 'GPT-4 and GPT-4o should be similar');
    });
  });
});