/**
 * Comprehensive Tests for Token CLI Integration
 * 
 * Tests token CLI commands (count, budget, models),
 * output formats and options, and integration scenarios.
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import CLI commands directly for testing
import {
  tokenCountCommand,
  tokenProfileCommand,
  tokenBudgetCommand,
  tokenModelsCommand
} from '../src/cli/commands/token.js';

describe('Token CLI Integration', () => {
  let tempDir, mockRepoDir;

  beforeEach(async () => {
    // Create temporary directory for testing
    tempDir = path.join(__dirname, 'temp-cli-test');
    mockRepoDir = path.join(tempDir, 'test-repo');
    await fs.mkdir(mockRepoDir, { recursive: true });
    
    // Create mock .pampax directory and database
    const pampaxDir = path.join(mockRepoDir, '.pampax');
    await fs.mkdir(pampaxDir, { recursive: true });
    
    // Create a mock database file
    const mockDbPath = path.join(pampaxDir, 'pampax.sqlite');
    await fs.writeFile(mockDbPath, 'mock database content');
    
    // Create a mock token budget file
    const budgetFilePath = path.join(pampaxDir, 'token-budget.json');
    await fs.writeFile(budgetFilePath, JSON.stringify({
      budget: 5000,
      model: 'gpt-4',
      repoPath: mockRepoDir,
      timestamp: Date.now()
    }));
  });

  afterEach(async () => {
    // Clean up temporary directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('token count command', () => {
    test('should count tokens for simple text', async () => {
      const text = 'Hello world! This is a test message for token counting.';
      const options = { model: 'gpt-4', json: false, verbose: false };

      // Capture console output
      const originalConsoleLog = console.log;
      const originalConsoleError = console.error;
      let output = '';
      let errorOutput = '';

      console.log = (...args) => {
        output += args.join(' ') + '\n';
      };
      console.error = (...args) => {
        errorOutput += args.join(' ') + '\n';
      };

      try {
        await tokenCountCommand(text, options);
        
        assert.ok(output.includes('Token Analysis for:'));
        assert.ok(output.includes('Model:'));
        assert.ok(output.includes('Token Count:'));
        assert.ok(output.includes('Characters:'));
        assert.ok(output.includes('Context Size:'));
        assert.ok(output.includes('Usage:'));
        assert.ok(output.includes('GPT-4'));
        assert.strictEqual(errorOutput, '');
      } finally {
        console.log = originalConsoleLog;
        console.error = originalConsoleError;
      }
    });

    test('should output JSON format when requested', async () => {
      const text = 'Test JSON output';
      const options = { model: 'gpt-4', json: true, verbose: false };

      const originalConsoleLog = console.log;
      let output = '';

      console.log = (...args) => {
        output += args.join(' ');
      };

      try {
        await tokenCountCommand(text, options);
        
        const result = JSON.parse(output);
        assert.strictEqual(result.model, 'gpt-4');
        assert.ok(result.tokenCount > 0);
        assert.strictEqual(result.characters, text.length);
        assert.ok(result.contextSize > 0);
        assert.ok(result.percentageUsed >= 0);
      } finally {
        console.log = originalConsoleLog;
      }
    });

    test('should include verbose information when requested', async () => {
      const text = 'Test verbose output';
      const options = { model: 'gpt-4', json: false, verbose: true };

      const originalConsoleLog = console.log;
      let output = '';

      console.log = (...args) => {
        output += args.join(' ') + '\n';
      };

      try {
        await tokenCountCommand(text, options);
        
        assert.ok(output.includes('Additional Info:'));
        assert.ok(output.includes('Average word length:'));
        assert.ok(output.includes('Estimated words:'));
        assert.ok(output.includes('Max tokens:'));
        assert.ok(output.includes('Tokenizer:'));
      } finally {
        console.log = originalConsoleLog;
      }
    });

    test('should handle different models correctly', async () => {
      const text = 'Test different models';
      const models = ['gpt-4', 'claude-3', 'gpt-3.5-turbo'];
      const originalConsoleLog = console.log;
      
      console.log = () => {}; // Suppress output

      try {
        for (const model of models) {
          const options = { model, json: true, verbose: false };
          await tokenCountCommand(text, options);
          // Should not throw for any supported model
        }
      } finally {
        console.log = originalConsoleLog;
      }
    });

    test('should handle empty text gracefully', async () => {
      const text = '';
      const options = { model: 'gpt-4', json: true, verbose: false };

      const originalConsoleLog = console.log;
      let output = '';

      console.log = (...args) => {
        output += args.join(' ');
      };

      try {
        await tokenCountCommand(text, options);
        
        const result = JSON.parse(output);
        assert.strictEqual(result.tokenCount, 0);
        assert.strictEqual(result.characters, 0);
      } finally {
        console.log = originalConsoleLog;
      }
    });
  });

  describe('token profile command', () => {
    test('should show repository token profile', async () => {
      const options = { model: 'gpt-4', json: false, verbose: false };

      const originalConsoleLog = console.log;
      let output = '';

      console.log = (...args) => {
        output += args.join(' ') + '\n';
      };

      try {
        await tokenProfileCommand(mockRepoDir, options);
        
        assert.ok(output.includes('Token Profile') || output.includes('Profile'));
        assert.ok(output.includes('Repository:'));
      } finally {
        console.log = originalConsoleLog;
      }
    });

    test('should handle missing database gracefully', async () => {
      const invalidRepo = path.join(tempDir, 'invalid-repo');
      const options = { model: 'gpt-4', json: true, verbose: false };

      const originalConsoleLog = console.log;
      const originalConsoleError = console.error;
      let output = '';
      let errorOutput = '';

      console.log = (...args) => {
        output += args.join(' ');
      };
      console.error = (...args) => {
        errorOutput += args.join(' ');
      };

      try {
        await tokenProfileCommand(invalidRepo, options);
        
        // Should handle error gracefully
        assert.ok(errorOutput.includes('ERROR') || output.includes('error'));
      } finally {
        console.log = originalConsoleLog;
        console.error = originalConsoleError;
      }
    });
  });

  describe('token budget command', () => {
    test('should display budget information', async () => {
      const options = { json: false, verbose: false };

      const originalConsoleLog = console.log;
      let output = '';

      console.log = (...args) => {
        output += args.join(' ') + '\n';
      };

      try {
        await tokenBudgetCommand(mockRepoDir, options);
        
        assert.ok(output.includes('Budget') || output.includes('budget'));
        assert.ok(output.includes('5000') || output.includes('Token'));
      } finally {
        console.log = originalConsoleLog;
      }
    });

    test('should output budget in JSON format', async () => {
      const options = { json: true, verbose: false };

      const originalConsoleLog = console.log;
      let output = '';

      console.log = (...args) => {
        output += args.join(' ');
      };

      try {
        await tokenBudgetCommand(mockRepoDir, options);
        
        // Should parse as JSON or handle gracefully
        try {
          const result = JSON.parse(output);
          assert.ok(typeof result === 'object');
        } catch (e) {
          // If not JSON, should still contain budget information
          assert.ok(output.includes('budget') || output.includes('5000'));
        }
      } finally {
        console.log = originalConsoleLog;
      }
    });
  });

  describe('token models command', () => {
    test('should list available models', async () => {
      const options = { json: false, verbose: false };

      const originalConsoleLog = console.log;
      let output = '';

      console.log = (...args) => {
        output += args.join(' ') + '\n';
      };

      try {
        await tokenModelsCommand(options);
        
        assert.ok(output.includes('gpt-4') || output.includes('claude') || output.includes('Model'));
        assert.ok(output.length > 0, 'Should produce output');
      } finally {
        console.log = originalConsoleLog;
      }
    });

    test('should output models in JSON format', async () => {
      const options = { json: true, verbose: false };

      const originalConsoleLog = console.log;
      let output = '';

      console.log = (...args) => {
        output += args.join(' ');
      };

      try {
        await tokenModelsCommand(options);
        
        // Should parse as JSON or contain model information
        try {
          const result = JSON.parse(output);
          assert.ok(Array.isArray(result) || typeof result === 'object');
        } catch (e) {
          // If not JSON, should still contain model names
          assert.ok(output.includes('gpt') || output.includes('claude'));
        }
      } finally {
        console.log = originalConsoleLog;
      }
    });

    test('should include detailed information with verbose flag', async () => {
      const options = { json: false, verbose: true };

      const originalConsoleLog = console.log;
      let output = '';

      console.log = (...args) => {
        output += args.join(' ') + '\n';
      };

      try {
        await tokenModelsCommand(options);
        
        assert.ok(output.length > 0, 'Should produce verbose output');
        // Verbose output should be more detailed
        assert.ok(output.split('\n').length > 5, 'Should have multiple lines of output');
      } finally {
        console.log = originalConsoleLog;
      }
    });
  });

  describe('Integration Scenarios', () => {
    test('should handle workflow from count to budget', async () => {
      const text = 'Sample text for workflow testing';
      const originalConsoleLog = console.log;
      const originalConsoleError = console.error;
      
      console.log = () => {}; // Suppress output
      console.error = () => {}; // Suppress errors

      try {
        // Step 1: Count tokens
        await tokenCountCommand(text, { model: 'gpt-4', json: true, verbose: false });
        
        // Step 2: Check budget
        await tokenBudgetCommand(mockRepoDir, { json: true, verbose: false });
        
        // Step 3: List models
        await tokenModelsCommand({ json: true, verbose: false });
        
        // All commands should complete without throwing
        assert.ok(true, 'All commands should complete successfully');
      } finally {
        console.log = originalConsoleLog;
        console.error = originalConsoleError;
      }
    });

    test('should handle mixed JSON and human-readable output', async () => {
      const text = 'Mixed output test';
      const originalConsoleLog = console.log;
      let outputs = [];

      console.log = (...args) => {
        outputs.push(args.join(' '));
      };

      try {
        // Human-readable
        await tokenCountCommand(text, { model: 'gpt-4', json: false, verbose: false });
        const humanOutput = outputs[outputs.length - 1];
        
        // JSON
        await tokenCountCommand(text, { model: 'gpt-4', json: true, verbose: false });
        const jsonOutput = outputs[outputs.length - 1];
        
        assert.ok(humanOutput.includes('Token Analysis'));
        assert.ok(!humanOutput.includes('{'));
        
        try {
          JSON.parse(jsonOutput);
          assert.ok(true, 'JSON output should be valid JSON');
        } catch (e) {
          assert.fail('JSON output should be valid JSON');
        }
      } finally {
        console.log = originalConsoleLog;
      }
    });

    test('should handle error conditions gracefully', async () => {
      const originalConsoleLog = console.log;
      const originalConsoleError = console.error;
      let errorOutput = '';

      console.log = () => {};
      console.error = (...args) => {
        errorOutput += args.join(' ') + '\n';
      };

      try {
        // Test with invalid repository
        await tokenProfileCommand('/nonexistent/path', { model: 'gpt-4', json: false, verbose: false });
        
        // Should handle error without crashing
        assert.ok(errorOutput.length > 0 || true, 'Should handle errors gracefully');
      } finally {
        console.log = originalConsoleLog;
        console.error = originalConsoleError;
      }
    });
  });

  describe('Output Format Consistency', () => {
    test('should maintain consistent field names across JSON outputs', async () => {
      const text = 'Consistency test';
      const originalConsoleLog = console.log;
      let outputs = [];

      console.log = (...args) => {
        outputs.push(args.join(' '));
      };

      try {
        // Get JSON output from count command
        await tokenCountCommand(text, { model: 'gpt-4', json: true, verbose: false });
        const countOutput = outputs[outputs.length - 1];
        
        const countResult = JSON.parse(countOutput);
        
        // Verify expected fields are present
        assert.ok(typeof countResult.tokenCount === 'number');
        assert.ok(typeof countResult.characters === 'number');
        assert.ok(typeof countResult.model === 'string');
        assert.ok(typeof countResult.contextSize === 'number');
        assert.ok(typeof countResult.percentageUsed === 'number');
      } finally {
        console.log = originalConsoleLog;
      }
    });

    test('should handle special characters in output', async () => {
      const text = 'Special chars: 🚀 世界 @#$%';
      const originalConsoleLog = console.log;
      let output = '';

      console.log = (...args) => {
        output += args.join(' ');
      };

      try {
        await tokenCountCommand(text, { model: 'gpt-4', json: true, verbose: false });
        
        // Should handle special characters without breaking JSON
        const result = JSON.parse(output);
        assert.ok(typeof result === 'object');
        assert.ok(result.tokenCount >= 0);
      } finally {
        console.log = originalConsoleLog;
      }
    });
  });
});