import { test, describe } from 'node:test';
import assert from 'node:assert';
import { FeatureFlagManager } from '../../src/config/feature-flags.js';
import { writeFileSync, unlinkSync, mkdirSync } from 'fs';
import { join } from 'path';

describe('FeatureFlagManager', () => {
  const testConfigPath = join(__dirname, '..', 'temp', 'test-feature-flags.json');
  
  // Setup temp directory
  mkdirSync(join(__dirname, '..', 'temp'), { recursive: true });

  function cleanup() {
    try {
      unlinkSync(testConfigPath);
    } catch {
      // Ignore if file doesn't exist
    }
  }

  test('should load default configuration when no file exists', () => {
    cleanup();
    const manager = new FeatureFlagManager(testConfigPath);
    
    assert.strictEqual(manager.get('lsp').python, true);
    assert.strictEqual(manager.get('lsp').dart, true);
    assert.strictEqual(manager.get('treesitter').enabled, true);
    assert.strictEqual(manager.get('scip').read, true);
    assert.strictEqual(manager.get('vectors').sqlite_vec, true);
    assert.strictEqual(manager.get('vectors').pgvector, false);
    assert.strictEqual(manager.get('ui').json, false);
    assert.strictEqual(manager.get('ui').tty, true);
  });

  test('should load configuration from file', () => {
    cleanup();
    const testConfig = {
      lsp: { python: false, dart: true },
      treesitter: { enabled: false },
      scip: { read: false },
      vectors: { sqlite_vec: false, pgvector: true },
      ui: { json: true, tty: false }
    };

    writeFileSync(testConfigPath, JSON.stringify(testConfig));
    
    const manager = new FeatureFlagManager(testConfigPath);
    
    assert.strictEqual(manager.get('lsp').python, false);
    assert.strictEqual(manager.get('lsp').dart, true);
    assert.strictEqual(manager.get('treesitter').enabled, false);
    assert.strictEqual(manager.get('scip').read, false);
    assert.strictEqual(manager.get('vectors').sqlite_vec, false);
    assert.strictEqual(manager.get('vectors').pgvector, true);
    assert.strictEqual(manager.get('ui').json, true);
    assert.strictEqual(manager.get('ui').tty, false);
  });

  test('should check if feature is enabled', () => {
    cleanup();
    const manager = new FeatureFlagManager(testConfigPath);
    
    assert.strictEqual(manager.isEnabled('lsp.python'), true);
    assert.strictEqual(manager.isEnabled('lsp.dart'), true);
    assert.strictEqual(manager.isEnabled('treesitter.enabled'), true);
    assert.strictEqual(manager.isEnabled('vectors.pgvector'), false);
    assert.strictEqual(manager.isEnabled('ui.json'), false);
    assert.strictEqual(manager.isEnabled('nonexistent.feature'), false);
  });

  test('should reload configuration', () => {
    cleanup();
    const manager = new FeatureFlagManager(testConfigPath);
    
    assert.strictEqual(manager.get('lsp').python, true);
    
    // Write new config
    const newConfig = {
      lsp: { python: false, dart: true },
      treesitter: { enabled: true },
      scip: { read: true },
      vectors: { sqlite_vec: true, pgvector: false },
      ui: { json: false, tty: true }
    };
    
    writeFileSync(testConfigPath, JSON.stringify(newConfig));
    manager.reload();
    
    assert.strictEqual(manager.get('lsp').python, false);
  });

  test('should return all configuration', () => {
    cleanup();
    const manager = new FeatureFlagManager(testConfigPath);
    const all = manager.getAll();
    
    assert(all.hasOwnProperty('lsp'));
    assert(all.hasOwnProperty('treesitter'));
    assert(all.hasOwnProperty('scip'));
    assert(all.hasOwnProperty('vectors'));
    assert(all.hasOwnProperty('ui'));
  });

  test('should load default configuration when no file exists', () => {
    const manager = new FeatureFlagManager(testConfigPath);
    
    assert.strictEqual(manager.get('lsp').python, true);
    assert.strictEqual(manager.get('lsp').dart, true);
    assert.strictEqual(manager.get('treesitter').enabled, true);
    assert.strictEqual(manager.get('scip').read, true);
    assert.strictEqual(manager.get('vectors').sqlite_vec, true);
    assert.strictEqual(manager.get('vectors').pgvector, false);
    assert.strictEqual(manager.get('ui').json, false);
    assert.strictEqual(manager.get('ui').tty, true);
  });

  test('should load configuration from file', () => {
    const testConfig = {
      lsp: { python: false, dart: true },
      treesitter: { enabled: false },
      scip: { read: false },
      vectors: { sqlite_vec: false, pgvector: true },
      ui: { json: true, tty: false }
    };

    writeFileSync(testConfigPath, JSON.stringify(testConfig));
    
    const manager = new FeatureFlagManager(testConfigPath);
    
    assert.strictEqual(manager.get('lsp').python, false);
    assert.strictEqual(manager.get('lsp').dart, true);
    assert.strictEqual(manager.get('treesitter').enabled, false);
    assert.strictEqual(manager.get('scip').read, false);
    assert.strictEqual(manager.get('vectors').sqlite_vec, false);
    assert.strictEqual(manager.get('vectors').pgvector, true);
    assert.strictEqual(manager.get('ui').json, true);
    assert.strictEqual(manager.get('ui').tty, false);
  });

  test('should check if feature is enabled', () => {
    const manager = new FeatureFlagManager(testConfigPath);
    
    assert.strictEqual(manager.isEnabled('lsp.python'), true);
    assert.strictEqual(manager.isEnabled('lsp.dart'), true);
    assert.strictEqual(manager.isEnabled('treesitter.enabled'), true);
    assert.strictEqual(manager.isEnabled('vectors.pgvector'), false);
    assert.strictEqual(manager.isEnabled('ui.json'), false);
    assert.strictEqual(manager.isEnabled('nonexistent.feature'), false);
  });

  test('should reload configuration', () => {
    const manager = new FeatureFlagManager(testConfigPath);
    
    assert.strictEqual(manager.get('lsp').python, true);
    
    // Write new config
    const newConfig = {
      lsp: { python: false, dart: true },
      treesitter: { enabled: true },
      scip: { read: true },
      vectors: { sqlite_vec: true, pgvector: false },
      ui: { json: false, tty: true }
    };
    
    writeFileSync(testConfigPath, JSON.stringify(newConfig));
    manager.reload();
    
    assert.strictEqual(manager.get('lsp').python, false);
  });

  test('should return all configuration', () => {
    const manager = new FeatureFlagManager(testConfigPath);
    const all = manager.getAll();
    
    assert(all.hasOwnProperty('lsp'));
    assert(all.hasOwnProperty('treesitter'));
    assert(all.hasOwnProperty('scip'));
    assert(all.hasOwnProperty('vectors'));
    assert(all.hasOwnProperty('ui'));
  });
});