import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { writeFileSync, unlinkSync, existsSync } from 'fs';
import { join } from 'path';
import { config } from '../src/config/unified-config-loader.js';

describe('Configuration Integration Tests', () => {
  const testConfigPath = join(process.cwd(), 'test-integration.toml');
  
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

  test('should integrate with logging system', () => {
    const tomlContent = `
[logging]
level = "debug"
format = "text"
output = "stderr"
structured = false
`;

    writeFileSync(testConfigPath, tomlContent);
    
    // Reload config to pick up new file
    config.reload();
    
    const loggingConfig = config.getLoggingConfig();
    
    assert.strictEqual(loggingConfig.level, 'DEBUG');
    assert.strictEqual(loggingConfig.jsonOutput, false);
    assert.strictEqual(loggingConfig.structured, false);
  });

  test('should integrate with metrics system', () => {
    const tomlContent = `
[metrics]
enabled = false
sink = "file"
sampling_rate = 0.05
file_path = "/tmp/metrics.log"
`;

    writeFileSync(testConfigPath, tomlContent);
    config.reload();
    
    const metricsConfig = config.getMetricsConfig();
    
    assert.strictEqual(metricsConfig.enabled, false);
    assert.strictEqual(metricsConfig.sinks[0].type, 'file');
    assert.strictEqual(metricsConfig.sampling['default'].rate, 0.05);
  });

  test('should integrate with feature flags', () => {
    const tomlContent = `
[features]
learning = false
analytics = false
policy_optimization = false
experimental_features = true
debug_mode = true

[cache]
enabled = false
`;

    writeFileSync(testConfigPath, tomlContent);
    config.reload();
    
    const featureFlags = config.getFeatureFlags();
    
    assert.strictEqual(featureFlags.learning, false);
    assert.strictEqual(featureFlags.analytics, false);
    assert.strictEqual(featureFlags.policyOptimization, false);
    assert.strictEqual(featureFlags.cacheEnabled, false);
  });

  test('should handle performance configuration', () => {
    const tomlContent = `
[performance]
query_timeout_ms = 10000
max_concurrent_searches = 20
sqlite_cache_size = 5000
parallel_processing = false
memory_limit_mb = 2048
chunk_size = 100
`;

    writeFileSync(testConfigPath, tomlContent);
    config.reload();
    
    const performanceConfig = config.getSection('performance');
    
    assert.strictEqual(performanceConfig.query_timeout_ms, 10000);
    assert.strictEqual(performanceConfig.max_concurrent_searches, 20);
    assert.strictEqual(performanceConfig.sqlite_cache_size, 5000);
    assert.strictEqual(performanceConfig.parallel_processing, false);
    assert.strictEqual(performanceConfig.memory_limit_mb, 2048);
    assert.strictEqual(performanceConfig.chunk_size, 100);
  });

  test('should handle indexer configuration', () => {
    const tomlContent = `
[indexer]
max_file_size_mb = 20
exclude_patterns = [
  "test/**",
  "docs/**",
  "*.tmp"
]
include_patterns = [
  "**/*.js",
  "**/*.ts",
  "**/*.py"
]
follow_symlinks = true
respect_gitignore = false
`;

    writeFileSync(testConfigPath, tomlContent);
    config.reload();
    
    const indexerConfig = config.getSection('indexer');
    
    assert.strictEqual(indexerConfig.max_file_size_mb, 20);
    assert.deepStrictEqual(indexerConfig.exclude_patterns, ['test/**', 'docs/**', '*.tmp']);
    assert.deepStrictEqual(indexerConfig.include_patterns, ['**/*.js', '**/*.ts', '**/*.py']);
    assert.strictEqual(indexerConfig.follow_symlinks, true);
    assert.strictEqual(indexerConfig.respect_gitignore, false);
  });

  test('should handle storage configuration', () => {
    const tomlContent = `
[storage]
type = "postgres"
path = "postgresql://user:pass@localhost/pampax"
connection_pool_size = 20
backup_enabled = false
backup_interval_hours = 12
`;

    writeFileSync(testConfigPath, tomlContent);
    config.reload();
    
    const storageConfig = config.getSection('storage');
    
    assert.strictEqual(storageConfig.type, 'postgres');
    assert.strictEqual(storageConfig.path, 'postgresql://user:pass@localhost/pampax');
    assert.strictEqual(storageConfig.connection_pool_size, 20);
    assert.strictEqual(storageConfig.backup_enabled, false);
    assert.strictEqual(storageConfig.backup_interval_hours, 12);
  });

  test('should handle security configuration', () => {
    const tomlContent = `
[security]
encrypt_storage = true
encryption_key_path = "/etc/pampax/key.pem"
access_log_enabled = false
rate_limiting = true
max_requests_per_minute = 500
`;

    writeFileSync(testConfigPath, tomlContent);
    config.reload();
    
    const securityConfig = config.getSection('security');
    
    assert.strictEqual(securityConfig.encrypt_storage, true);
    assert.strictEqual(securityConfig.encryption_key_path, '/etc/pampax/key.pem');
    assert.strictEqual(securityConfig.access_log_enabled, false);
    assert.strictEqual(securityConfig.rate_limiting, true);
    assert.strictEqual(securityConfig.max_requests_per_minute, 500);
  });

  test('should handle environment variable overrides in integration', () => {
    // Set environment variables
    const originalEnv = { ...process.env };
    process.env.PAMPAX_LOGGING_LEVEL = 'error';
    process.env.PAMPAX_METRICS_ENABLED = 'false';
    process.env.PAMPAX_CACHE_TTL_SECONDS = '1800';
    process.env.PAMPAX_FEATURES_LEARNING = 'false';

    try {
      const tomlContent = `
[logging]
level = "info"

[metrics]
enabled = true

[cache]
ttl_seconds = 3600

[features]
learning = true
`;

      writeFileSync(testConfigPath, tomlContent);
      config.reload();
      
      const loggingConfig = config.getLoggingConfig();
      const metricsConfig = config.getMetricsConfig();
      const cacheConfig = config.getSection('cache');
      const featureFlags = config.getFeatureFlags();
      
      assert.strictEqual(loggingConfig.level, 'ERROR');
      assert.strictEqual(metricsConfig.enabled, false);
      assert.strictEqual(cacheConfig.ttl_seconds, 1800);
      assert.strictEqual(featureFlags.learning, false);
    } finally {
      // Restore environment variables
      process.env = originalEnv;
    }
  });

  test('should handle CLI configuration', () => {
    const tomlContent = `
[cli]
deterministic_output = false
color_output = "never"
progress_bar = false
verbose_errors = true
interactive_mode = false
`;

    writeFileSync(testConfigPath, tomlContent);
    config.reload();
    
    const cliConfig = config.getSection('cli');
    
    assert.strictEqual(cliConfig.deterministic_output, false);
    assert.strictEqual(cliConfig.color_output, 'never');
    assert.strictEqual(cliConfig.progress_bar, false);
    assert.strictEqual(cliConfig.verbose_errors, true);
    assert.strictEqual(cliConfig.interactive_mode, false);
  });

  test('should provide comprehensive configuration access', () => {
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
    config.reload();
    
    // Test various access methods
    assert.strictEqual(config.getValue('logging.level'), 'warn');
    assert.strictEqual(config.getValue('metrics.sampling_rate'), 0.2);
    assert.strictEqual(config.getValue('cache.strategy'), 'lfu');
    assert.strictEqual(config.getValue('nonexistent', 'default'), 'default');
    
    assert.strictEqual(config.isFeatureEnabled('debug_mode'), true);
    assert.strictEqual(config.isFeatureEnabled('experimental_features'), true);
    assert.strictEqual(config.isFeatureEnabled('learning'), true); // default value
    assert.strictEqual(config.isFeatureEnabled('nonexistent'), false);
    
    // Test section access
    const loggingSection = config.getSection('logging');
    assert.strictEqual(loggingSection.level, 'warn');
    
    const metricsSection = config.getSection('metrics');
    assert.strictEqual(metricsSection.enabled, true);
    
    const nonExistentSection = config.getSection('nonexistent');
    assert.strictEqual(nonExistentSection, null);
  });

  test('should validate configuration in integration', () => {
    const invalidToml = `
[logging]
level = "invalid_level"

[metrics]
sampling_rate = 1.5

[performance]
query_timeout_ms = 50
`;

    writeFileSync(testConfigPath, invalidToml);
    
    // Should throw validation error
    assert.throws(() => {
      config.reload();
    }, /Configuration validation failed/);
  });
});