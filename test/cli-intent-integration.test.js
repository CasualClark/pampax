#!/usr/bin/env node

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const cliPath = path.join(__dirname, '..', 'src', 'cli-new.js');

describe('CLI Intent-Aware Search Integration', () => {
  const testRepoPath = path.join(__dirname, 'temp-intent-test');
  
  beforeEach(async () => {
    // Create test repository
    await fs.mkdir(testRepoPath, { recursive: true });
    
    // Create test files with different types of content
    await fs.writeFile(path.join(testRepoPath, 'user.js'), `
class UserService {
  constructor(database) {
    this.db = database;
  }
  
  async getUserById(id) {
    return await this.db.query('SELECT * FROM users WHERE id = ?', [id]);
  }
  
  async createUser(userData) {
    return await this.db.insert('users', userData);
  }
}

function authenticateUser(username, password) {
  // Authentication logic here
  return { success: true, token: 'jwt-token' };
}
`);

    await fs.writeFile(path.join(testRepoPath, 'config.json'), `
{
  "database": {
    "host": "localhost",
    "port": 5432,
    "name": "myapp"
  },
  "server": {
    "port": 3000,
    "host": "0.0.0.0"
  },
  "auth": {
    "jwtSecret": "secret-key",
    "tokenExpiry": "24h"
  }
}
`);

    await fs.writeFile(path.join(testRepoPath, 'routes.js'), `
const express = require('express');
const router = express.Router();

// GET /api/users/:id
router.get('/users/:id', async (req, res) => {
  try {
    const userService = new UserService();
    const user = await userService.getUserById(req.params.id);
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/users
router.post('/users', async (req, res) => {
  try {
    const userService = new UserService();
    const user = await userService.createUser(req.body);
    res.status(201).json(user);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
`);

    await fs.writeFile(path.join(testRepoPath, 'error.js'), `
class ValidationError extends Error {
  constructor(message, field) {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
  }
}

function processData(data) {
  if (!data) {
    throw new ValidationError('Data is required', 'data');
  }
  
  // Some processing logic that might fail
  if (data.invalid) {
    throw new Error('Invalid data format');
  }
  
  return data;
}
`);
  });

  afterEach(async () => {
    // Clean up test repository
    try {
      await fs.rm(testRepoPath, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  const runCli = async (args, cwd = testRepoPath) => {
    return new Promise((resolve, reject) => {
      const child = spawn('node', [cliPath, ...args], {
        cwd,
        stdio: 'pipe',
        env: { ...process.env, NODE_ENV: 'test', DEBUG: '' } // Disable debug logging
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        resolve({ code, stdout, stderr });
      });

      child.on('error', reject);
    });
  };

  const extractJson = (stdout) => {
    // Extract JSON from stdout (handle logging lines)
    const lines = stdout.split('\n').filter(line => line.trim());
    // Find the last line that starts with { and contains "success" or "intentType"
    const jsonLines = lines.filter(line => {
      const trimmed = line.trim();
      return trimmed.startsWith('{') && (trimmed.includes('"success"') || trimmed.includes('"intentType"'));
    });
    const jsonStr = jsonLines[jsonLines.length - 1] || lines[lines.length - 1];
    return JSON.parse(jsonStr);
  };

  it('should index test repository successfully', async () => {
    const result = await runCli(['migrate', '--db', '.pampax/pampax.sqlite']);
    assert.strictEqual(result.code, 0, 'Migration should succeed');

    const indexResult = await runCli(['index', '--repo', '.', '--include', '**/*.js']);
    assert.strictEqual(indexResult.code, 0, 'Indexing should succeed');
    
    // Check if database was created
    const dbExists = await fs.access(path.join(testRepoPath, '.pampax/pampax.sqlite')).then(() => true).catch(() => false);
    assert.ok(dbExists, 'Database should be created');
  });

  it('should detect symbol intent for function queries', async () => {
    // First index the repository
    await runCli(['migrate', '--db', '.pampax/pampax.sqlite']);
    await runCli(['index', '--repo', '.', '--include', '**/*.js']);

    // Test symbol intent detection
    const result = await runCli(['search', 'getUserById function', '--intent', '--json']);
    assert.strictEqual(result.code, 0, 'Search should succeed');

    const output = extractJson(result.stdout);
    assert.ok(output.success, 'Search should be successful');
    assert.strictEqual(output.intent.type, 'symbol', 'Should detect symbol intent');
    assert.ok(output.intent.confidence > 0, 'Should have confidence > 0');
    
    // Check for function entities
    const functionEntities = output.intent.entities.filter(e => e.type === 'function');
    assert.ok(functionEntities.length > 0, 'Should detect function entities');
  });

  it('should detect config intent for configuration queries', async () => {
    // First index the repository
    await runCli(['migrate', '--db', '.pampax/pampax.sqlite']);
    await runCli(['index', '--repo', '.', '--include', '**/*.js', '**/*.json']);

    // Test config intent detection
    const result = await runCli(['search', 'database configuration settings', '--intent', '--json']);
    assert.strictEqual(result.code, 0, 'Search should succeed');

    const output = extractJson(result.stdout);
    assert.ok(output.success, 'Search should be successful');
    assert.strictEqual(output.intent.type, 'config', 'Should detect config intent');
    assert.ok(output.intent.confidence > 0, 'Should have confidence > 0');
  });

  it('should detect api intent for API-related queries', async () => {
    // First index the repository
    await runCli(['migrate', '--db', '.pampax/pampax.sqlite']);
    await runCli(['index', '--repo', '.', '--include', '**/*.js']);

    // Test API intent detection
    const result = await runCli(['search', 'GET endpoint for users', '--intent', '--json']);
    assert.strictEqual(result.code, 0, 'Search should succeed');

    const output = extractJson(result.stdout);
    assert.ok(output.success, 'Search should be successful');
    assert.strictEqual(output.intent.type, 'api', 'Should detect API intent');
    assert.ok(output.intent.confidence > 0, 'Should have confidence > 0');
  });

  it('should detect incident intent for error-related queries', async () => {
    // First index the repository
    await runCli(['migrate', '--db', '.pampax/pampax.sqlite']);
    await runCli(['index', '--repo', '.', '--include', '**/*.js']);

    // Test incident intent detection
    const result = await runCli(['search', 'validation error handling', '--intent', '--json']);
    assert.strictEqual(result.code, 0, 'Search should succeed');

    const output = extractJson(result.stdout);
    assert.ok(output.success, 'Search should be successful');
    assert.strictEqual(output.intent.type, 'incident', 'Should detect incident intent');
    assert.ok(output.intent.confidence > 0, 'Should have confidence > 0');
  });

  it('should force intent type when specified', async () => {
    // First index the repository
    await runCli(['migrate', '--db', '.pampax/pampax.sqlite']);
    await runCli(['index', '--repo', '.', '--include', '**/*.js']);

    // Test forced intent
    const result = await runCli(['search', 'random query', '--force-intent', 'config', '--intent', '--json']);
    assert.strictEqual(result.code, 0, 'Search should succeed');

    const output = extractJson(result.stdout);
    assert.ok(output.success, 'Search should be successful');
    assert.strictEqual(output.intent.type, 'config', 'Should use forced config intent');
    assert.strictEqual(output.intent.confidence, 1.0, 'Forced intent should have max confidence');
    assert.strictEqual(output.intent.forced, true, 'Should indicate intent was forced');
  });

  it('should show policy information when requested', async () => {
    // First index the repository
    await runCli(['migrate', '--db', '.pampax/pampax.sqlite']);
    await runCli(['index', '--repo', '.', '--include', '**/*.js']);

    // Test policy display
    const result = await runCli(['search', 'UserService class', '--policy', '--json']);
    assert.strictEqual(result.code, 0, 'Search should succeed');

    const output = extractJson(result.stdout);
    assert.ok(output.success, 'Search should be successful');
    assert.ok(output.policy, 'Should include policy information');
    assert.ok(typeof output.policy.maxDepth === 'number', 'Should have maxDepth');
    assert.ok(typeof output.policy.earlyStopThreshold === 'number', 'Should have earlyStopThreshold');
    assert.ok(typeof output.policy.seedWeights === 'object', 'Should have seedWeights');
  });

  it('should provide intent analysis details', async () => {
    // Test intent analyze command
    const result = await runCli(['intent', 'analyze', 'getUserById function definition', '--json']);
    assert.strictEqual(result.code, 0, 'Intent analysis should succeed');

    const output = extractJson(result.stdout);
    assert.ok(output.success, 'Intent analysis should be successful');
    assert.ok(output.intent, 'Should include intent information');
    assert.ok(output.intent.entities, 'Should include entities');
    assert.ok(output.intent.suggestedPolicies, 'Should include suggested policies');
  });

  it('should show policy configuration for intent types', async () => {
    // Test policy show command
    const result = await runCli(['intent', 'show', 'symbol', '--json']);
    assert.strictEqual(result.code, 0, 'Policy show should succeed');

    const output = extractJson(result.stdout);
    assert.ok(output.success, 'Policy show should be successful');
    assert.strictEqual(output.intentType, 'symbol', 'Should show correct intent type');
    assert.ok(output.policy, 'Should include policy configuration');
    assert.ok(typeof output.policy.maxDepth === 'number', 'Should have maxDepth');
  });

  it('should handle invalid intent types gracefully', async () => {
    // Test invalid intent type
    const result = await runCli(['intent', 'show', 'invalid-intent', '--json']);
    assert.notStrictEqual(result.code, 0, 'Should fail with invalid intent');

    const output = extractJson(result.stdout);
    assert.strictEqual(output.success, false, 'Should indicate failure');
    assert.ok(output.error, 'Should include error message');
  });

  it('should maintain backward compatibility with existing search', async () => {
    // First index the repository
    await runCli(['migrate', '--db', '.pampax/pampax.sqlite']);
    await runCli(['index', '--repo', '.', '--include', '**/*.js']);

    // Test backward compatibility - no new flags
    const result = await runCli(['search', 'UserService', '--json']);
    assert.strictEqual(result.code, 0, 'Search should succeed');

    const output = extractJson(result.stdout);
    assert.ok(output.success, 'Search should be successful');
    assert.ok(output.results, 'Should include search results');
    assert.ok(Array.isArray(output.results), 'Results should be an array');
  });

  it('should handle explain-intent output format', async () => {
    // First index the repository
    await runCli(['migrate', '--db', '.pampax/pampax.sqlite']);
    await runCli(['index', '--repo', '.', '--include', '**/*.js']);

    // Test explain-intent with regular output
    const result = await runCli(['search', 'authenticateUser function', '--explain-intent']);
    assert.strictEqual(result.code, 0, 'Search should succeed');

    assert.ok(result.stdout.includes('Intent Analysis'), 'Should include intent analysis section');
    assert.ok(result.stdout.includes('Entities Found'), 'Should include entities section');
    assert.ok(result.stdout.includes('Suggested Policies'), 'Should include suggested policies section');
  });
});