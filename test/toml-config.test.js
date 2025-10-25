import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { writeFileSync, unlinkSync, existsSync } from 'fs';
import { join } from 'path';
import { TomlConfigLoader } from '../src/config/toml-config-loader.js';
import { UnifiedConfigLoader } from '../src/config/unified-config-loader.js';

describe('TOML Configuration Loader', () => {
  const testConfigPath = join(process.cwd(), 'test-pampax.toml');
  
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

  test('should load default configuration when no file exists', () => {
    const loader = new TomlConfigLoader(testConfigPath);
    const config = loader.getConfig();
    
    assert.strictEqual(config.logging.level, 'info');
    assert.strictEqual(config.metrics.enabled, true);
    assert.strictEqual(config.cache.enabled, true);
    assert.strictEqual(config.performance.query_timeout_ms, 5000);
    assert.strictEqual(config.cli.deterministic_output, true);
  });

  test('should parse valid TOML configuration', () => {
    const tomlContent = `
[logging]
level = "debug"
format = "text"
output = "stderr"

[metrics]
enabled = false
sampling_rate = 0.5

[cache]
ttl_seconds = 7200
max_size_mb = 1000

[performance]
query_timeout_ms = 10000
max_concurrent_searches = 20
`;

    writeFileSync(testConfigPath, tomlContent);
    const loader = new TomlConfigLoader(testConfigPath);
    const config = loader.getConfig();

    assert.strictEqual(config.logging.level, 'debug');
    assert.strictEqual(config.logging.format, 'text');
    assert.strictEqual(config.logging.output, 'stderr');
    assert.strictEqual(config.metrics.enabled, false);
    assert.strictEqual(config.metrics.sampling_rate, 0.5);
    assert.strictEqual(config.cache.ttl_seconds, 7200);
    assert.strictEqual(config.cache.max_size_mb, 1000);
    assert.strictEqual(config.performance.query_timeout_ms, 10000);
    assert.strictEqual(config.performance.max_concurrent_searches, 20);
  });

  test('should apply environment variable overrides', () => {
    // Set environment variables
    const originalEnv = { ...process.env };
    process.env.PAMPAX_LOGGING_LEVEL = 'error';
    process.env.PAMPAX_METRICS_ENABLED = 'false';
    process.env.PAMPAX_CACHE_TTL_SECONDS = '1800';
    process.env.PAMPAX_PERFORMANCE_QUERY_TIMEOUT_MS = '3000';
    process.env.PAMPAX_CLI_COLOR_OUTPUT = 'never';

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
`;

      writeFileSync(testConfigPath, tomlContent);
      const loader = new TomlConfigLoader(testConfigPath);
      const config = loader.getConfig();



      assert.strictEqual(config.logging.level, 'error');
      assert.strictEqual(config.metrics.enabled, false);
      assert.strictEqual(config.cache.ttl_seconds, 1800);
      assert.strictEqual(config.performance.query_timeout_ms, 3000);
      assert.strictEqual(config.cli.color_output, 'never');
    } finally {
      // Restore environment variables
      process.env = originalEnv;
    }
  });

  test('should validate configuration schema', () => {
    const invalidToml = `
[logging]
level = "invalid_level"

[metrics]
sampling_rate = 1.5

[performance]
query_timeout_ms = 50
`;

    writeFileSync(testConfigPath, invalidToml);
    
    assert.throws(() => {
      new TomlConfigLoader(testConfigPath);
    }, /Configuration validation failed/);
  });

  test('should handle nested configuration access', () => {
    const tomlContent = `
[features]
learning = true
analytics = false
experimental_features = true

[security]
encrypt_storage = true
rate_limiting = false
`;

    writeFileSync(testConfigPath, tomlContent);
    const loader = new TomlConfigLoader(testConfigPath);

    assert.strictEqual(loader.getValue('features.learning'), true);
    assert.strictEqual(loader.getValue('features.analytics'), false);
    assert.strictEqual(loader.getValue('features.experimental_features'), true);
    assert.strictEqual(loader.getValue('security.encrypt_storage'), true);
    assert.strictEqual(loader.getValue('security.rate_limiting'), false);
    
    // Test default values
    assert.strictEqual(loader.getValue('nonexistent.path', 'default'), 'default');
    assert.strictEqual(loader.getValue('features.nonexistent', false), false);
  });

  test('should check feature flags', () => {
    const tomlContent = `
[features]
learning = true
analytics = false
policy_optimization = true
`;

    writeFileSync(testConfigPath, tomlContent);
    const loader = new TomlConfigLoader(testConfigPath);

    assert.strictEqual(loader.isFeatureEnabled('learning'), true);
    assert.strictEqual(loader.isFeatureEnabled('analytics'), false);
    assert.strictEqual(loader.isFeatureEnabled('policy_optimization'), true);
    assert.strictEqual(loader.isFeatureEnabled('nonexistent'), false);
  });

  test('should reload configuration', () => {
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
level = "debug"

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
  });

  test('should handle complex array configurations', () => {
    const tomlContent = `
[indexer]
exclude_patterns = [
  "node_modules/**",
  ".git/**",
  "*.min.js"
]
include_patterns = [
  "**/*.js",
  "**/*.ts",
  "**/*.py"
]
`;

    writeFileSync(testConfigPath, tomlContent);
    const loader = new TomlConfigLoader(testConfigPath);
    const config = loader.getConfig();

    assert(Array.isArray(config.indexer.exclude_patterns));
    assert.strictEqual(config.indexer.exclude_patterns.length, 3);
    assert.strictEqual(config.indexer.exclude_patterns[0], 'node_modules/**');
    
    assert(Array.isArray(config.indexer.include_patterns));
    assert.strictEqual(config.indexer.include_patterns.length, 3);
    assert.strictEqual(config.indexer.include_patterns[0], '**/*.js');
  });

  test('should handle table configurations with labels', () => {
    const tomlContent = `
[metrics]
labels = { service = "pampax", version = "1.0.0", environment = "test" }
`;

    writeFileSync(testConfigPath, tomlContent);
    const loader = new TomlConfigLoader(testConfigPath);
    const config = loader.getConfig();

    assert(typeof config.metrics.labels === 'object');
    assert.strictEqual(config.metrics.labels.service, 'pampax');
    assert.strictEqual(config.metrics.labels.version, '1.0.0');
    assert.strictEqual(config.metrics.labels.environment, 'test');
  });
});

describe('Unified Configuration Loader', () => {
  const testTomlPath = join(process.cwd(), 'test-unified.toml');
  const testJsonPath = join(process.cwd(), 'test-unified.json');

  beforeEach(() => {
    // Clean up any existing test configs
    [testTomlPath, testJsonPath].forEach(path => {
      if (existsSync(path)) {
        unlinkSync(path);
      }
    });
  });

  afterEach(() => {
    // Clean up test configs
    [testTomlPath, testJsonPath].forEach(path => {
      if (existsSync(path)) {
        unlinkSync(path);
      }
    });
  });

  test('should prefer TOML when configured', () => {
    const tomlContent = `
[logging]
level = "debug"
`;

    const jsonContent = {
      logging: {
        level: 'info'
      }
    };

    writeFileSync(testTomlPath, tomlContent);
    writeFileSync(testJsonPath, JSON.stringify(jsonContent));

    // Create loader with specific paths to ensure proper file discovery
    const loader = new UnifiedConfigLoader(testTomlPath, true);
    const config = loader.getConfig();

    assert.strictEqual(config.logging.level, 'debug');
  });

  test('should prefer JSON when configured', () => {
    const tomlContent = `
[logging]
level = "debug"
`;

    const jsonContent = {
      logging: {
        level: 'info'
      }
    };

    writeFileSync(testTomlPath, tomlContent);
    writeFileSync(testJsonPath, JSON.stringify(jsonContent));

    const loader = new UnifiedConfigLoader(null, false);
    const config = loader.getConfig();

    assert.strictEqual(config.logging.level, 'info');
  });

  test('should provide backward compatibility for logging config', () => {
    const tomlContent = `
[logging]
level = "warn"
format = "text"
output = "file"
file_path = "/tmp/pampax.log"
structured = false
`;

    writeFileSync(testTomlPath, tomlContent);
    const loader = new UnifiedConfigLoader(testTomlPath, true);
    const loggingConfig = loader.getLoggingConfig();

    assert.strictEqual(loggingConfig.level, 'WARN');
    assert.strictEqual(loggingConfig.jsonOutput, false);
    assert.strictEqual(loggingConfig.logToFile, true);
    assert.strictEqual(loggingConfig.filePath, '/tmp/pampax.log');
    assert.strictEqual(loggingConfig.structured, false);
  });

  test('should provide backward compatibility for metrics config', () => {
    const tomlContent = `
[metrics]
enabled = false
sink = "file"
sampling_rate = 0.3
`;

    writeFileSync(testTomlPath, tomlContent);
    const loader = new UnifiedConfigLoader(testTomlPath, true);
    const metricsConfig = loader.getMetricsConfig();

    assert.strictEqual(metricsConfig.enabled, false);
    assert.strictEqual(metricsConfig.sinks[0].type, 'file');
    assert.strictEqual(metricsConfig.sampling['default'].rate, 0.3);
  });

  test('should provide backward compatibility for feature flags', () => {
    const tomlContent = `
[features]
learning = false
analytics = false
policy_optimization = false

[cache]
enabled = false
`;

    writeFileSync(testTomlPath, tomlContent);
    const loader = new UnifiedConfigLoader(testTomlPath, true);
    const featureFlags = loader.getFeatureFlags();

    assert.strictEqual(featureFlags.learning, false);
    assert.strictEqual(featureFlags.analytics, false);
    assert.strictEqual(featureFlags.policyOptimization, false);
    assert.strictEqual(featureFlags.cacheEnabled, false);
  });

  test('should fallback to default configuration when no files exist', () => {
    const loader = new UnifiedConfigLoader('/nonexistent/config.toml', true);
    const config = loader.getConfig();

    assert(config.logging);
    assert(config.metrics);
    assert(config.cache);
    assert(config.performance);
    assert(config.cli);
    assert.strictEqual(config.logging.level, 'info');
    assert.strictEqual(config.metrics.enabled, true);
  });

  test('should provide comprehensive summary', () => {
    const tomlContent = `
[logging]
level = "trace"
`;

    writeFileSync(testTomlPath, tomlContent);
    const loader = new UnifiedConfigLoader(testTomlPath, true);
    const summary = loader.getSummary();

    assert.strictEqual(summary.configType, 'toml');
    assert.strictEqual(summary.preferToml, true);
    assert.strictEqual(summary.hotReloadSupported, true);
    assert(Array.isArray(summary.sections));
  });
});