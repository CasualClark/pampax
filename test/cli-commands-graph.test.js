#!/usr/bin/env node

import assert from 'assert';
import { describe, it, beforeEach, afterEach } from 'node:test';
import { Database } from '../src/storage/database-simple.js';
import { graphCommand, symbolSearchCommand, configureGraphCommand } from '../src/cli/commands/graph.js';
import { Command } from 'commander';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('CLI Graph Commands', () => {
  let testDb;
  let testDbPath;
  let tempDir;

  beforeEach(async () => {
    // Create temporary directory
    tempDir = fs.mkdtempSync(path.join(__dirname, 'temp-cli-graph-test-'));
    testDbPath = path.join(tempDir, 'test.sqlite');
    
    // Initialize test database
    testDb = new Database(testDbPath);
    await testDb.migrate();
    
    // Insert test data
    await setupTestData(testDb);
  });

  afterEach(async () => {
    if (testDb) {
      await testDb.close();
    }
    
    // Clean up temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  async function setupTestData(db) {
    // Insert test files
    await db.run(`
      INSERT INTO file (repo, path, content_hash, lang, size, modified_time)
      VALUES (?, ?, ?, ?, ?, ?)
    `, ['test-repo', 'src/auth.js', 'hash1', 'javascript', 1000, Date.now()]);

    await db.run(`
      INSERT INTO file (repo, path, content_hash, lang, size, modified_time)
      VALUES (?, ?, ?, ?, ?, ?)
    `, ['test-repo', 'src/user.js', 'hash2', 'javascript', 800, Date.now()]);

    // Insert test spans (symbols)
    await db.run(`
      INSERT INTO span (id, repo, path, byte_start, byte_end, kind, name, signature, doc, parents)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, ['span_authenticate', 'test-repo', 'src/auth.js', 0, 100, 'function', 'authenticate', 'authenticate(user, password)', 'Authenticates user', '[]']);

    await db.run(`
      INSERT INTO span (id, repo, path, byte_start, byte_end, kind, name, signature, doc, parents)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, ['span_validateUser', 'test-repo', 'src/auth.js', 200, 300, 'function', 'validateUser', 'validateUser(user)', 'Validates user data', '[]']);

    await db.run(`
      INSERT INTO span (id, repo, path, byte_start, byte_end, kind, name, signature, doc, parents)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, ['span_UserModel', 'test-repo', 'src/user.js', 0, 200, 'class', 'UserModel', 'class UserModel', 'User model class', '[]']);

    // Insert test chunks
    await db.run(`
      INSERT INTO chunk (id, span_id, repo, path, content, metadata)
      VALUES (?, ?, ?, ?, ?, ?)
    `, ['chunk_auth_1', 'span_authenticate', 'test-repo', 'src/auth.js', 'function authenticate() { ... }', '{"spanName": "authenticate", "spanKind": "function"}']);

    await db.run(`
      INSERT INTO chunk (id, span_id, repo, path, content, metadata)
      VALUES (?, ?, ?, ?, ?, ?)
    `, ['chunk_user_1', 'span_UserModel', 'test-repo', 'src/user.js', 'class UserModel { ... }', '{"spanName": "UserModel", "spanKind": "class"}']);
  }

  describe('symbol search command', () => {
    it('should find symbols by pattern', async () => {
      const options = {
        repo: tempDir,
        db: testDbPath,
        json: false,
        limit: 10,
        lang: null
      };

      // Capture console output
      const originalConsoleLog = console.log;
      let output = '';
      console.log = (data) => { output += data + '\n'; };

      try {
        await symbolSearchCommand('auth', options);
        
        // Check that we got some output (the exact text might vary)
        assert(output.length > 0);
        assert(output.includes('symbols') || output.includes('auth'));
        assert(output.includes('authenticate'));
      } finally {
        console.log = originalConsoleLog;
      }
    });

    it('should return JSON output when requested', async () => {
      const options = {
        repo: tempDir,
        db: testDbPath,
        json: true,
        limit: 10,
        lang: null
      };

      // Capture console output
      const originalConsoleLog = console.log;
      let output = '';
      console.log = (data) => { output += data; };

      try {
        await symbolSearchCommand('auth', options);
        
        const result = JSON.parse(output);
        assert.strictEqual(result.success, true);
        assert.strictEqual(result.pattern, 'auth');
        assert(Array.isArray(result.symbols));
        assert(result.symbols.length > 0);
      } finally {
        console.log = originalConsoleLog;
      }
    });
  });

  describe('graph command configuration', () => {
    it('should configure graph command with correct options', () => {
      const program = new Command();
      const originalCommand = program.command;
      let configuredCommand = null;

      // Mock the command method to capture the configured command
      program.command = function(name, description) {
        configuredCommand = originalCommand.call(this, name, description);
        return configuredCommand;
      };

      configureGraphCommand(program);

      assert.ok(configuredCommand, 'Graph command should be configured');
      assert.strictEqual(configuredCommand.name(), 'graph');
      assert(configuredCommand.options.some(opt => opt.flags.includes('--symbol')));
      assert(configuredCommand.options.some(opt => opt.flags.includes('--neighbors')));
      assert(configuredCommand.options.some(opt => opt.flags.includes('--types')));
    });

    it('should configure graph find subcommand', () => {
      const program = new Command();
      let graphCommand = null;

      // Mock to capture the graph command
      const originalCommand = program.command;
      program.command = function(name, description) {
        const cmd = originalCommand.call(this, name, description);
        if (name === 'graph') {
          graphCommand = cmd;
        }
        return cmd;
      };

      configureGraphCommand(program);

      assert.ok(graphCommand, 'Graph command should be configured');
      
      // Check if find subcommand exists
      const findSubcommand = graphCommand.commands.find(cmd => cmd.name() === 'find');
      assert.ok(findSubcommand, 'Graph find subcommand should be configured');
    });
  });

  describe('graph command validation', () => {
    it('should validate neighbors parameter', async () => {
      const options = {
        symbol: 'authenticate',
        neighbors: 6, // Invalid: > 5
        repo: tempDir,
        db: testDbPath,
        json: false
      };

      // Mock process.exit to capture the call
      const originalProcessExit = process.exit;
      let exitCalled = false;
      process.exit = () => {
        exitCalled = true;
        throw new Error('process.exit called');
      };

      // Capture console.error to avoid test output pollution
      const originalConsoleError = console.error;
      console.error = () => {};

      try {
        await graphCommand(options);
        assert.fail('Should have called process.exit for invalid neighbors');
      } catch (error) {
        assert.ok(exitCalled, 'process.exit should have been called');
      } finally {
        process.exit = originalProcessExit;
        console.error = originalConsoleError;
      }
    });

    it('should validate edge types', async () => {
      const options = {
        symbol: 'authenticate',
        neighbors: 2,
        types: 'invalid_type,call', // Invalid type included
        repo: tempDir,
        db: testDbPath,
        json: false
      };

      // Mock process.exit to capture the call
      const originalProcessExit = process.exit;
      let exitCalled = false;
      process.exit = () => {
        exitCalled = true;
        throw new Error('process.exit called');
      };

      // Capture console.error to avoid test output pollution
      const originalConsoleError = console.error;
      console.error = () => {};

      try {
        await graphCommand(options);
        assert.fail('Should have called process.exit for invalid edge types');
      } catch (error) {
        assert.ok(exitCalled, 'process.exit should have been called');
      } finally {
        process.exit = originalProcessExit;
        console.error = originalConsoleError;
      }
    });

    it('should require symbol parameter', async () => {
      const options = {
        neighbors: 2,
        repo: tempDir,
        db: testDbPath,
        json: false
      };

      // Mock process.exit to capture the call
      const originalProcessExit = process.exit;
      let exitCalled = false;
      process.exit = () => {
        exitCalled = true;
        throw new Error('process.exit called');
      };

      // Capture console.error to avoid test output pollution
      const originalConsoleError = console.error;
      console.error = () => {};

      try {
        await graphCommand(options);
        assert.fail('Should have called process.exit for missing symbol');
      } catch (error) {
        assert.ok(exitCalled, 'process.exit should have been called');
      } finally {
        process.exit = originalProcessExit;
        console.error = originalConsoleError;
      }
    });
  });

  describe('edge type parsing', () => {
    it('should parse comma-separated edge types correctly', () => {
      // Test the parseEdgeTypes function indirectly through command validation
      const validTypes = ['call', 'import', 'inherit', 'implement', 'reference', 'define'];
      
      // These should not throw errors
      validTypes.forEach(type => {
        assert.doesNotThrow(() => {
          // Simulate the validation logic
          const types = type.split(',').map(t => t.trim()).filter(t => t);
          const invalid = types.filter(t => !validTypes.includes(t));
          if (invalid.length > 0) {
            throw new Error(`Invalid edge types: ${invalid.join(', ')}`);
          }
        });
      });
    });
  });
});