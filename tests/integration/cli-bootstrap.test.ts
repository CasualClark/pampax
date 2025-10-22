import { test, describe } from 'node:test';
import assert from 'node:assert';
import { execSync } from 'child_process';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { IntegrationTest } from '../framework/integration-test.js';

describe('CLI Bootstrap Integration Tests', () => {
  const tempDir = join(__dirname, '..', 'temp', 'cli-test');

  beforeEach(() => {
    // Clean up any existing test directory
    if (existsSync(tempDir)) {
      execSync(`rm -rf "${tempDir}"`);
    }
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    // Clean up
    if (existsSync(tempDir)) {
      execSync(`rm -rf "${tempDir}"`);
    }
  });

  test('should bootstrap CLI with default config', async () => {
    const test = new IntegrationTest({
      repoPath: tempDir,
      command: 'node src/cli/bootstrap.js',
      expectedExitCode: 0,
      timeout: 5000,
      cleanup: false
    });

    const result = await test.run();
    
    assert(result.success, 'CLI should bootstrap successfully');
    assert(result.stdout.includes('PAMPAX CLI bootstrapped'), 'Should show bootstrap message');
    assert(result.stdout.includes('CLI ready'), 'Should show ready message');
  });

  test('should handle missing storage config gracefully', async () => {
    // Create a broken config file
    const brokenConfig = {
      logging: { level: 'INFO' },
      storage: {} // Missing path
    };

    require('fs').writeFileSync(
      join(tempDir, 'pampax.config.json'),
      JSON.stringify(brokenConfig, null, 2)
    );

    const test = new IntegrationTest({
      repoPath: tempDir,
      command: 'node src/cli/bootstrap.js',
      expectedExitCode: 1, // Should exit with error
      timeout: 5000,
      cleanup: false
    });

    const result = await test.run();
    
    assert(!result.success, 'CLI should fail with missing storage config');
    assert(result.stderr.includes('Storage path not configured'), 'Should show specific error');
  });

  test('should load custom feature flags', async () => {
    const customConfig = {
      featureFlags: {
        lsp: { python: false, dart: true },
        treesitter: { enabled: false },
        scip: { read: true },
        vectors: { sqlite_vec: false, pgvector: true },
        ui: { json: true, tty: false }
      },
      logging: { level: 'DEBUG' },
      storage: { path: join(tempDir, '.pampax'), type: 'sqlite' }
    };

    require('fs').writeFileSync(
      join(tempDir, 'pampax.config.json'),
      JSON.stringify(customConfig, null, 2)
    );

    const test = new IntegrationTest({
      repoPath: tempDir,
      command: 'node src/cli/bootstrap.js',
      expectedExitCode: 0,
      timeout: 5000,
      cleanup: false
    });

    const result = await test.run();
    
    assert(result.success, 'CLI should bootstrap with custom config');
    assert(result.stdout.includes('DEBUG'), 'Should use DEBUG log level');
  });
});

// Helper function for beforeEach/afterEach in Node.js test
function beforeEach(fn: () => void) {
  fn();
}

function afterEach(fn: () => void) {
  fn();
}