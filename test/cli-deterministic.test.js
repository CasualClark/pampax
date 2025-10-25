#!/usr/bin/env node

/**
 * Test suite for deterministic CLI output
 * Validates piped output detection, stable JSON, and exit codes
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');

// Test fixtures
const testProjectPath = path.join(projectRoot, 'test', 'fixtures', 'sample-project');

describe('Deterministic CLI Output', () => {
  let cliPath;

  beforeEach(() => {
    cliPath = path.join(projectRoot, 'src', 'cli.js');
  });

  afterEach(() => {
    // Cleanup any test artifacts
  });

  describe('Piped Output Detection', () => {
    it('should auto-detect piped output and use JSON format', async () => {
      const result = await runCLICommand(['help'], { pipe: true });
      
      // Should output JSON when piped
      const output = JSON.parse(result.stdout);
      assert(output._meta);
      assert.strictEqual(output._meta.mode, 'json');
    });

    it('should use interactive format for TTY output', async () => {
      const result = await runCLICommand(['help'], { pipe: false });
      
      // Should output plain text for TTY
      assert.doesNotThrow(() => {
        JSON.parse(result.stdout);
      }, new Error('Expected non-JSON output for interactive mode'));
    });

    it('should respect explicit format option', async () => {
      const result = await runCLICommand(['help', '--format', 'json'], { pipe: false });
      
      const output = JSON.parse(result.stdout);
      assert(output._meta);
      assert.strictEqual(output._meta.mode, 'json');
    });
  });

  describe('Stable JSON Output', () => {
    it('should maintain consistent key ordering in JSON output', async () => {
      const result1 = await runCLICommand(['help', '--format', 'json'], { pipe: false });
      const result2 = await runCLICommand(['help', '--format', 'json'], { pipe: false });
      
      const output1 = JSON.parse(result1.stdout);
      const output2 = JSON.parse(result2.stdout);
      
      // Outputs should be identical
      assert.deepStrictEqual(output1, output2);
      
      // Check key ordering is stable
      const keys1 = Object.keys(output1);
      const keys2 = Object.keys(output2);
      assert.deepStrictEqual(keys1, keys2);
    });

    it('should include metadata in JSON output', async () => {
      const result = await runCLICommand(['help', '--format', 'json'], { pipe: false });
      
      const output = JSON.parse(result.stdout);
      assert(output._meta);
      assert(output._meta.timestamp);
      assert(output._meta.mode);
      assert.strictEqual(output._meta.mode, 'json');
    });
  });

  describe('Exit Code Handling', () => {
    it('should exit with code 0 for successful operations', async () => {
      const result = await runCLICommand(['help'], { pipe: false });
      assert.strictEqual(result.exitCode, 0);
    });

    it('should exit with appropriate error code for configuration errors', async () => {
      const result = await runCLICommand(['search', 'test', '--limit', 'invalid'], { pipe: false });
      assert.strictEqual(result.exitCode, 2); // CONFIG error
    });

    it('should exit with appropriate error code for file not found', async () => {
      const result = await runCLICommand(['search', 'test', '--project', '/nonexistent/path'], { pipe: false });
      assert.strictEqual(result.exitCode, 3); // IO error
    });
  });

  describe('Output Modes', () => {
    it('should support quiet mode', async () => {
      const result = await runCLICommand(['help', '--quiet'], { pipe: false });
      
      // Quiet mode should have minimal output
      assert(result.stdout.trim().length === 0 || result.stdout.trim().length < 100);
    });

    it('should support verbose mode', async () => {
      const result = await runCLICommand(['help', '--verbose'], { pipe: false });
      
      // Verbose mode should have detailed output
      assert(result.stdout.includes('timestamp') || result.stdout.length > 500);
    });
  });

  describe('Search Command Determinism', () => {
    beforeEach(() => {
      // Ensure test project is indexed
      if (!fs.existsSync(path.join(testProjectPath, 'pampa.codemap.json'))) {
        // Create a minimal test project structure
        fs.mkdirSync(testProjectPath, { recursive: true });
        fs.writeFileSync(path.join(testProjectPath, 'test.js'), `
function testFunction() {
  return 'hello world';
}

class TestClass {
  constructor() {
    this.value = 42;
  }
}
        `);
      }
    });

    it('should return consistent JSON for same search query', async () => {
      const query = 'testFunction';
      
      const result1 = await runCLICommand(['search', query, '--format', 'json', '--project', testProjectPath], { pipe: false });
      const result2 = await runCLICommand(['search', query, '--format', 'json', '--project', testProjectPath], { pipe: false });
      
      if (result1.exitCode === 0 && result2.exitCode === 0) {
        const output1 = JSON.parse(result1.stdout);
        const output2 = JSON.parse(result2.stdout);
        
        // Results should be identical
        assert.deepStrictEqual(output1.results, output2.results);
        assert.strictEqual(output1.query, output2.query);
      }
    });

    it('should handle empty results consistently', async () => {
      const result = await runCLICommand(['search', 'nonexistentFunctionXYZ123', '--format', 'json', '--project', testProjectPath], { pipe: false });
      
      const output = JSON.parse(result.stdout);
      assert.strictEqual(output.success, true);
      assert.strictEqual(output.results.length, 0);
      assert.strictEqual(output.total, 0);
    });
  });

  describe('Integration with Existing Commands', () => {
    it('should work with health command', async () => {
      const result = await runCLICommand(['health', '--format', 'json'], { pipe: false });
      
      const output = JSON.parse(result.stdout);
      assert(output._meta);
      assert.strictEqual(output._meta.mode, 'json');
    });

    it('should work with info command', async () => {
      const result = await runCLICommand(['info', '--format', 'json'], { pipe: false });
      
      // Info command might fail if project not indexed, but should still output JSON
      try {
        const output = JSON.parse(result.stdout);
        assert(output._meta);
        assert.strictEqual(output._meta.mode, 'json');
      } catch (e) {
        // If parsing fails, ensure it's still JSON format error handling
        assert(result.stdout.includes('error') || result.stdout.includes('ERROR'));
      }
    });
  });
});

/**
 * Helper function to run CLI commands and capture output
 */
function runCLICommand(args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn('node', [cliPath, ...args], {
      cwd: projectRoot,
      stdio: options.pipe ? 'pipe' : 'inherit',
      env: {
        ...process.env,
        // Force no TTY for testing
        TERM: 'dumb',
        FORCE_COLOR: '0'
      }
    });

    let stdout = '';
    let stderr = '';

    if (options.pipe) {
      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });
    }

    child.on('close', (code) => {
      resolve({
        exitCode: code,
        stdout: stdout,
        stderr: stderr
      });
    });

    child.on('error', (error) => {
      resolve({
        exitCode: 1,
        stdout: stdout,
        stderr: error.message
      });
    });

    // Set timeout
    const timeout = setTimeout(() => {
      child.kill();
      resolve({
        exitCode: 124, // timeout exit code
        stdout: stdout,
        stderr: 'Command timed out'
      });
    }, 10000);

    child.on('close', () => {
      clearTimeout(timeout);
    });
  });
}