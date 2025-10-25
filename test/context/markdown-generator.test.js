/**
 * Unit tests for MarkdownGenerator
 */

import { describe, it, expect } from '@jest/globals';
import { MarkdownGenerator, MarkdownGeneratorFactory } from './markdown-generator.js';

describe('MarkdownGenerator', () => {
  describe('Constructor', () => {
    it('should create generator with default options', () => {
      const generator = new MarkdownGenerator();
      expect(generator.options.includeTimestamps).toBe(true);
      expect(generator.options.emojiEnabled).toBe(true);
      expect(generator.options.maxTableRows).toBe(50);
    });

    it('should accept custom options', () => {
      const generator = new MarkdownGenerator({
        emojiEnabled: false,
        maxTableRows: 100
      });
      expect(generator.options.emojiEnabled).toBe(false);
      expect(generator.options.maxTableRows).toBe(100);
    });
  });

  describe('generateMarkdown', () => {
    it('should handle empty bundle', () => {
      const generator = new MarkdownGenerator();
      const result = generator.generateMarkdown({});
      expect(result).toContain('Context Bundle Report');
    });

    it('should include query information', () => {
      const generator = new MarkdownGenerator();
      const bundle = { query: 'test query' };
      const result = generator.generateMarkdown(bundle);
      expect(result).toContain('test query');
    });

    it('should generate evidence table', () => {
      const generator = new MarkdownGenerator();
      const bundle = {
        evidence: [
          {
            file: 'test.js',
            symbol: 'testFunc',
            reason: 'test',
            edge_type: 'code',
            rank: 0.9,
            cached: true
          }
        ]
      };
      const result = generator.generateMarkdown(bundle);
      expect(result).toContain('Evidence');
      expect(result).toContain('test.js');
      expect(result).toContain('testFunc');
    });

    it('should generate stopping reasons', () => {
      const generator = new MarkdownGenerator();
      const bundle = {
        stopping_reasons: {
          conditions: [
            {
              type: 'BUDGET_WARNING',
              severity: 'medium',
              title: 'Budget Warning',
              explanation: 'Test explanation',
              actionable: ['Test action']
            }
          ]
        }
      };
      const result = generator.generateMarkdown(bundle);
      expect(result).toContain('Stopping Reasons');
      expect(result).toContain('Budget Warning');
      expect(result).toContain('Test explanation');
    });

    it('should generate token report', () => {
      const generator = new MarkdownGenerator();
      const bundle = {
        total_tokens: 1000,
        budget: 3000,
        model: 'gpt-4-turbo',
        provider: 'openai'
      };
      const result = generator.generateMarkdown(bundle);
      expect(result).toContain('Token Report');
      expect(result).toContain('1,000');
      expect(result).toContain('3,000');
      expect(result).toContain('33.3%');
    });
  });

  describe('Factory Methods', () => {
    it('should create compact generator', () => {
      const generator = MarkdownGenerator.createCompact();
      expect(generator.options.includeMetadata).toBe(false);
      expect(generator.options.emojiEnabled).toBe(false);
      expect(generator.options.maxTableRows).toBe(20);
    });

    it('should create detailed generator', () => {
      const generator = MarkdownGenerator.createDetailed();
      expect(generator.options.includeMetadata).toBe(true);
      expect(generator.options.emojiEnabled).toBe(true);
      expect(generator.options.maxTableRows).toBe(100);
    });
  });

  describe('MarkdownGeneratorFactory', () => {
    it('should create CLI generator', () => {
      const generator = MarkdownGeneratorFactory.createForCLI();
      expect(generator.options.emojiEnabled).toBe(true);
      expect(generator.options.maxTableRows).toBe(30);
    });

    it('should create file generator', () => {
      const generator = MarkdownGeneratorFactory.createForFile();
      expect(generator.options.includeMetadata).toBe(true);
      expect(generator.options.maxTableRows).toBe(100);
    });

    it('should create API generator', () => {
      const generator = MarkdownGeneratorFactory.createForAPI();
      expect(generator.options.emojiEnabled).toBe(false);
      expect(generator.options.includeTimestamps).toBe(true);
    });
  });

  describe('Helper Methods', () => {
    it('should escape markdown characters', () => {
      const generator = new MarkdownGenerator();
      const result = generator.escapeMarkdown('text with *bold* and `code`');
      expect(result).toContain('\\*bold\\*');
      expect(result).toContain('\\`code\\`');
    });

    it('should detect language from filename', () => {
      const generator = new MarkdownGenerator();
      expect(generator.getLanguageForFile('test.js')).toBe('javascript');
      expect(generator.getLanguageForFile('test.py')).toBe('python');
      expect(generator.getLanguageForFile('test.unknown')).toBe('');
    });

    it('should estimate costs for known models', () => {
      const generator = new MarkdownGenerator();
      const cost = generator.estimateCost(1000, 'gpt-4-turbo');
      expect(cost).toBe(0.01); // 1000/1000000 * 10
    });
  });
});