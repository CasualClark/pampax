import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { writeFileSync, unlinkSync, existsSync } from 'fs';
import { join } from 'path';
import { TomlConfigLoader } from '../src/config/toml-config-loader.js';

describe('Final Configuration Integration Tests', () => {
  const testConfigPath = join(process.cwd(), 'test-final-integration.toml');
  
  beforeEach(() => {
    // Clean up any existing test config
    if (existsSync(testConfigPath)) {
      unlinkSync(testConfigPath);
    }
  });

  afterEach(() => {
    // Clean up test config
    if (existsSync(testConfigPath)) {
      unlinkSync(testConfigPath);
    }
  });

  test('should load complete TOML configuration with all sections', () => {
    const tomlContent = `
[logging]
level = "debug"
format = "text"
output = "stderr"
structured = false

[metrics]
enabled = false
sink = "file"
sampling_rate = 0.05
file_path = "/tmp/metrics.log"
export_interval_seconds = 30
labels = { service = "test-pampax", environment = "testing" }

[cache]
enabled = true
ttl_seconds = 7200
max_size_mb = 1000
cleanup_interval_minutes = 15
strategy = "lfu"

[performance]
query_timeout_ms = 15000
max_concurrent_searches = 25
sqlite_cache_size = 8000
parallel_processing = false
memory_limit_mb = 4096
chunk_size = 100

[cli]
deterministic_output = false
color_output = "never"
progress_bar = false
verbose_errors = true
interactive_mode = false

[indexer]
max_file_size_mb = 50
exclude_patterns = ["test/**", "docs/**", "*.tmp"]
include_patterns = ["**/*.js", "**/*.ts", "**/*.py"]
follow_symlinks = true
respect_gitignore = false

[storage]
type = "postgres"
path = "postgresql://user:pass@localhost/pampax"
connection_pool_size = 20
backup_enabled = false
backup_interval_hours = 12

[features]
learning = false
analytics = false
policy_optimization = false
experimental_features = true
debug_mode = true

[security]
encrypt_storage = true
encryption_key_path = "/etc/pampax/key.pem"
access_log_enabled = false
rate_limiting = true
max_requests_per_minute = 500
`;

    writeFileSync(testConfigPath, tomlContent);
    
    const loader = new TomlConfigLoader(testConfigPath);
    const config = loader.getConfig();
    
    // Test all sections are loaded correctly
    assert.strictEqual(config.logging.level, 'debug');
    assert.strictEqual(config.logging.format, 'text');
    assert.strictEqual(config.logging.output, 'stderr');
    assert.strictEqual(config.logging.structured, false);
    
    assert.strictEqual(config.metrics.enabled, false);
    assert.strictEqual(config.metrics.sink, 'file');
    assert.strictEqual(config.metrics.sampling_rate, 0.05);
    assert.strictEqual(config.metrics.file_path, '/tmp/metrics.log');
    assert.strictEqual(config.metrics.export_interval_seconds, 30);
    assert.deepStrictEqual(config.metrics.labels, {
      service: 'test-pampax',
      environment: 'testing'
    });
    
    assert.strictEqual(config.cache.enabled, true);
    assert.strictEqual(config.cache.ttl_seconds, 7200);
    assert.strictEqual(config.cache.max_size_mb, 1000);
    assert.strictEqual(config.cache.cleanup_interval_minutes, 15);
    assert.strictEqual(config.cache.strategy, 'lfu');
    
    assert.strictEqual(config.performance.query_timeout_ms, 15000);
    assert.strictEqual(config.performance.max_concurrent_searches, 25);
    assert.strictEqual(config.performance.sqlite_cache_size, 8000);
    assert.strictEqual(config.performance.parallel_processing, false);
    assert.strictEqual(config.performance.memory_limit_mb, 4096);
    assert.strictEqual(config.performance.chunk_size, 100);
    
    assert.strictEqual(config.cli.deterministic_output, false);
    assert.strictEqual(config.cli.color_output, 'never');
    assert.strictEqual(config.cli.progress_bar, false);
    assert.strictEqual(config.cli.verbose_errors, true);
    assert.strictEqual(config.cli.interactive_mode, false);
    
    assert.strictEqual(config.indexer.max_file_size_mb, 50);
    assert.deepStrictEqual(config.indexer.exclude_patterns, ['test/**', 'docs/**', '*.tmp']);
    assert.deepStrictEqual(config.indexer.include_patterns, ['**/*.js', '**/*.ts', '**/*.py']);
    assert.strictEqual(config.indexer.follow_symlinks, true);
    assert.strictEqual(config.indexer.respect_gitignore, false);
    
    assert.strictEqual(config.storage.type, 'postgres');
    assert.strictEqual(config.storage.path, 'postgresql://user:pass@localhost/pampax');
    assert.strictEqual(config.storage.connection_pool_size, 20);
    assert.strictEqual(config.storage.backup_enabled, false);
    assert.strictEqual(config.storage.backup_interval_hours, 12);
    
    assert.strictEqual(config.features.learning, false);
    assert.strictEqual(config.features.analytics, false);
    assert.strictEqual(config.features.policy_optimization, false);
    assert.strictEqual(config.features.experimental_features, true);
    assert.strictEqual(config.features.debug_mode, true);
    
    assert.strictEqual(config.security.encrypt_storage, true);
    assert.strictEqual(config.security.encryption_key_path, '/etc/pampax/key.pem');
    assert.strictEqual(config.security.access_log_enabled, false);
    assert.strictEqual(config.security.rate_limiting, true);
    assert.strictEqual(config.security.max_requests_per_minute, 500);
  });

  test('should handle environment variable overrides with all mappings', () => {
    // Set environment variables
    const originalEnv = { ...process.env };
    process.env.PAMPAX_LOGGING_LEVEL = 'error';
    process.env.PAMPAX_METRICS_ENABLED = 'false';
    process.env.PAMPAX_CACHE_TTL_SECONDS = '1800';
    process.env.PAMPAX_PERFORMANCE_QUERY_TIMEOUT_MS = '3000';
    process.env.PAMPAX_CLI_COLOR_OUTPUT = 'never';
    process.env.PAMPAX_FEATURES_LEARNING = 'false';
    process.env.PAMPAX_FEATURES_EXPERIMENTAL_FEATURES = 'true';
    process.env.PAMPAX_SECURITY_ENCRYPT_STORAGE = 'true';

    try {
      const tomlContent = `
[logging]
level = "info"

[metrics]
enabled = true

[cache]
ttl_seconds = 3600

[performance]
query_timeout_ms = 5000

[cli]
color_output = "auto"

[features]
learning = true
experimental_features = false

[security]
encrypt_storage = false
`;

      writeFileSync(testConfigPath, tomlContent);
      
      const loader = new TomlConfigLoader(testConfigPath);
      const config = loader.getConfig();

      assert.strictEqual(config.logging.level, 'error');
      assert.strictEqual(config.metrics.enabled, false);
      assert.strictEqual(config.cache.ttl_seconds, 1800);
      assert.strictEqual(config.performance.query_timeout_ms, 3000);
      assert.strictEqual(config.cli.color_output, 'never');
      assert.strictEqual(config.features.learning, false);
      assert.strictEqual(config.features.experimental_features, true);
      assert.strictEqual(config.security.encrypt_storage, true);
    } finally {
      // Restore environment variables
      process.env = originalEnv;
    }
  });

  test('should validate configuration and reject invalid values', () => {
    const invalidToml = `
[logging]
level = "invalid_level"

[metrics]
sampling_rate = 1.5

[performance]
query_timeout_ms = 50
`;

    writeFileSync(testConfigPath, invalidToml);
    
    let threw = false;
    try {
      new TomlConfigLoader(testConfigPath);
    } catch (error) {
      threw = true;
      assert.match(error.message, /Configuration validation failed/);
      assert.match(error.message, /logging\.level/);
      assert.match(error.message, /metrics\.sampling_rate/);
      assert.match(error.message, /performance\.query_timeout_ms/);
    }
    assert.strictEqual(threw, true, 'Should have thrown validation error');
  });

  test('should provide comprehensive configuration access methods', () => {
    const tomlContent = `
[logging]
level = "warn"

[metrics]
enabled = true
sampling_rate = 0.2

[cache]
enabled = true
strategy = "lfu"

[features]
debug_mode = true
experimental_features = true
`;

    writeFileSync(testConfigPath, tomlContent);
    
    const loader = new TomlConfigLoader(testConfigPath);
    
    // Test getValue method
    assert.strictEqual(loader.getValue('logging.level'), 'warn');
    assert.strictEqual(loader.getValue('metrics.sampling_rate'), 0.2);
    assert.strictEqual(loader.getValue('cache.strategy'), 'lfu');
    assert.strictEqual(loader.getValue('nonexistent', 'default'), 'default');
    
    // Test isFeatureEnabled method
    assert.strictEqual(loader.isFeatureEnabled('debug_mode'), true);
    assert.strictEqual(loader.isFeatureEnabled('experimental_features'), true);
    assert.strictEqual(loader.isFeatureEnabled('learning'), true); // default value
    assert.strictEqual(loader.isFeatureEnabled('nonexistent'), false);
    
    // Test getSection method
    const loggingSection = loader.getSection('logging');
    assert.strictEqual(loggingSection.level, 'warn');
    
    const metricsSection = loader.getSection('metrics');
    assert.strictEqual(metricsSection.enabled, true);
    
    const nonExistentSection = loader.getSection('nonexistent');
    assert.strictEqual(nonExistentSection, null);
  });

  test('should handle configuration reload', () => {
    const initialToml = `
[logging]
level = "info"
[cache]
ttl_seconds = 3600
`;

    writeFileSync(testConfigPath, initialToml);
    const loader = new TomlConfigLoader(testConfigPath);
    
    assert.strictEqual(loader.getValue('logging.level'), 'info');
    assert.strictEqual(loader.getValue('cache.ttl_seconds'), 3600);

    // Update file
    const updatedToml = `
[logging]
level = "debug"
[cache]
ttl_seconds = 7200
`;

    writeFileSync(testConfigPath, updatedToml);
    const reloaded = loader.reload();
    
    assert.strictEqual(reloaded, true);
    assert.strictEqual(loader.getValue('logging.level'), 'debug');
    assert.strictEqual(loader.getValue('cache.ttl_seconds'), 7200);
  });

  test('should provide configuration summary', () => {
    const tomlContent = `
[logging]
level = "trace"

[metrics]
enabled = true
`;

    writeFileSync(testConfigPath, tomlContent);
    
    const loader = new TomlConfigLoader(testConfigPath);
    const summary = loader.getSummary();
    
    assert.strictEqual(summary.configPath, testConfigPath);
    assert.strictEqual(summary.hotReloadEnabled, false);
    assert(Array.isArray(summary.sections));
    assert(summary.sections.includes('logging'));
    assert(summary.sections.includes('metrics'));
    assert(summary.sections.includes('cache'));
    assert(summary.sections.includes('performance'));
    assert(summary.sections.includes('cli'));
    assert(summary.sections.includes('features'));
    assert(summary.sections.includes('security'));
  });

  test('should export configuration as TOML', () => {
    const tomlContent = `
[logging]
level = "debug"
format = "json"

[metrics]
enabled = true
sampling_rate = 0.2
`;

    writeFileSync(testConfigPath, tomlContent);
    
    const loader = new TomlConfigLoader(testConfigPath);
    const exported = loader.exportAsToml();

    assert(typeof exported === 'string');
    assert(exported.includes('[logging]'));
    assert(exported.includes('level = "debug"'));
    assert(exported.includes('[metrics]'));
    assert(exported.includes('enabled = true'));
    assert(exported.includes('sampling_rate = 0.2'));
  });

  test('should handle complex array configurations', () => {
    const tomlContent = `
[indexer]
max_file_size_mb = 50
follow_symlinks = true
respect_gitignore = false
`;

    writeFileSync(testConfigPath, tomlContent);
    const loader = new TomlConfigLoader(testConfigPath);
    const config = loader.getConfig();

    // Test that arrays are properly loaded from defaults
    assert(Array.isArray(config.indexer.exclude_patterns));
    assert(Array.isArray(config.indexer.include_patterns));
    assert.strictEqual(config.indexer.max_file_size_mb, 50);
    assert.strictEqual(config.indexer.follow_symlinks, true);
    assert.strictEqual(config.indexer.respect_gitignore, false);
    
    // Verify default patterns are present
    assert(config.indexer.exclude_patterns.length > 0);
    assert(config.indexer.include_patterns.length > 0);
    assert(config.indexer.exclude_patterns.includes('node_modules/**'));
  });

  test('should handle table configurations with labels', () => {
    const tomlContent = `
[metrics]
labels = { service = "pampax", version = "1.0.0", environment = "production", cluster = "us-east-1", region = "aws" }
`;

    writeFileSync(testConfigPath, tomlContent);
    const loader = new TomlConfigLoader(testConfigPath);
    const config = loader.getConfig();

    assert(typeof config.metrics.labels === 'object');
    assert.strictEqual(config.metrics.labels.service, 'pampax');
    assert.strictEqual(config.metrics.labels.version, '1.0.0');
    assert.strictEqual(config.metrics.labels.environment, 'production');
    assert.strictEqual(config.metrics.labels.cluster, 'us-east-1');
    assert.strictEqual(config.metrics.labels.region, 'aws');
  });
});