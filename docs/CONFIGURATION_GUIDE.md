# PAMPAX Configuration Guide

PAMPAX supports comprehensive configuration through TOML files with environment variable overrides, providing production-ready configuration management for both development and deployment scenarios.

## Configuration Files

### Primary Configuration File: `pampax.toml`

PAMPAX looks for configuration files in the following order of priority:

1. `pampax.toml` (current directory)
2. `.pampax.toml` (current directory)
3. `config/pampax.toml` (config subdirectory)
4. `.pampax/pampax.toml` (hidden config directory)

### Legacy JSON Support

For backward compatibility, PAMPAX also supports JSON configuration files:

1. `pampax.config.json`
2. `.pampaxrc.json`
3. `config/pampax.json`

## Environment Variable Overrides

All configuration values can be overridden using environment variables with the `PAMPAX_` prefix. The environment variable name follows the pattern:

```
PAMPAX_SECTION_SUBSECTION_KEY=value
```

Examples:
```bash
# Override logging level
export PAMPAX_LOGGING_LEVEL=debug

# Disable metrics
export PAMPAX_METRICS_ENABLED=false

# Set cache TTL
export PAMPAX_CACHE_TTL_SECONDS=7200

# Configure performance settings
export PAMPAX_PERFORMANCE_QUERY_TIMEOUT_MS=10000
export PAMPAX_PERFORMANCE_MAX_CONCURRENT_SEARCHES=20
```

## Configuration Schema

### `[logging]` - Logging Configuration

Controls how PAMPAX logs events and errors.

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `level` | string | `"info"` | Log level: `error`, `warn`, `info`, `debug`, `trace` |
| `format` | string | `"json"` | Log format: `json`, `text`, `pretty` |
| `output` | string | `"stdout"` | Output destination: `stdout`, `stderr`, `file` |
| `file_path` | string | optional | Path to log file when `output` is `file` |
| `max_file_size_mb` | number | `100` | Maximum log file size in MB |
| `enable_rotation` | boolean | `true` | Enable log rotation |
| `structured` | boolean | `true` | Use structured logging with correlation IDs |

Example:
```toml
[logging]
level = "debug"
format = "json"
output = "file"
file_path = "/var/log/pampax/pampax.log"
max_file_size_mb = 200
structured = true
```

### `[metrics]` - Metrics Configuration

Controls performance metrics collection and export.

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `enabled` | boolean | `true` | Enable metrics collection |
| `sink` | string | `"stdout"` | Metrics sink: `stdout`, `stderr`, `file`, `prometheus` |
| `sampling_rate` | number | `0.1` | Sampling rate (0.0 to 1.0) |
| `file_path` | string | optional | Path to metrics file when `sink` is `file` |
| `export_interval_seconds` | number | `60` | Export interval for Prometheus |
| `labels` | table | `{}` | Additional labels for all metrics |

Example:
```toml
[metrics]
enabled = true
sink = "prometheus"
sampling_rate = 0.2
export_interval_seconds = 30
labels = { service = "pampax", version = "1.15.1", environment = "production" }
```

### `[cache]` - Cache Configuration

Controls the caching system for improved performance.

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `enabled` | boolean | `true` | Enable caching system |
| `ttl_seconds` | number | `3600` | Cache time-to-live in seconds |
| `max_size_mb` | number | `500` | Maximum cache size in MB |
| `cleanup_interval_minutes` | number | `30` | Cleanup interval in minutes |
| `strategy` | string | `"lru"` | Eviction strategy: `lru`, `lfu`, `fifo` |

Example:
```toml
[cache]
enabled = true
ttl_seconds = 7200
max_size_mb = 1000
strategy = "lfu"
cleanup_interval_minutes = 15
```

### `[performance]` - Performance Configuration

Controls performance-related settings and limits.

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `query_timeout_ms` | number | `5000` | Query timeout in milliseconds |
| `max_concurrent_searches` | number | `10` | Maximum concurrent searches |
| `sqlite_cache_size` | number | `2000` | SQLite cache size |
| `chunk_size` | number | `50` | Processing chunk size |
| `parallel_processing` | boolean | `true` | Enable parallel processing |
| `memory_limit_mb` | number | `1024` | Memory limit in MB |

Example:
```toml
[performance]
query_timeout_ms = 10000
max_concurrent_searches = 20
sqlite_cache_size = 5000
parallel_processing = true
memory_limit_mb = 2048
```

### `[cli]` - CLI Configuration

Controls command-line interface behavior.

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `deterministic_output` | boolean | `true` | Deterministic output for reproducibility |
| `color_output` | string | `"auto"` | Color output: `auto`, `always`, `never` |
| `progress_bar` | boolean | `true` | Show progress bars |
| `verbose_errors` | boolean | `false` | Show verbose error messages |
| `interactive_mode` | boolean | `true` | Enable interactive mode |

Example:
```toml
[cli]
deterministic_output = false
color_output = "always"
progress_bar = true
verbose_errors = true
```

### `[indexer]` - Indexer Configuration

Controls file indexing behavior and patterns.

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `max_file_size_mb` | number | `10` | Maximum file size to index |
| `exclude_patterns` | array | see below | Patterns to exclude |
| `include_patterns` | array | see below | Patterns to include |
| `follow_symlinks` | boolean | `false` | Follow symbolic links |
| `respect_gitignore` | boolean | `true` | Respect .gitignore files |

Default exclude patterns:
```toml
exclude_patterns = [
  "node_modules/**",
  ".git/**",
  "dist/**",
  "build/**",
  "*.min.js",
  "*.min.css",
  ".DS_Store",
  "Thumbs.db"
]
```

Default include patterns:
```toml
include_patterns = [
  "**/*.{js,ts,jsx,tsx,py,java,cpp,c,h,hpp,go,rs,php,rb,swift,kt,dart,scala,hs,ml,lua,elixir,sh,bash,zsh,fish}"
]
```

### `[storage]` - Storage Configuration

Controls data storage settings.

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `type` | string | `"sqlite"` | Storage type: `sqlite`, `memory`, `postgres` |
| `path` | string | `".pampax"` | Storage path |
| `connection_pool_size` | number | `10` | Connection pool size for PostgreSQL |
| `backup_enabled` | boolean | `true` | Enable automatic backups |
| `backup_interval_hours` | number | `24` | Backup interval in hours |

Example:
```toml
[storage]
type = "postgres"
path = "postgresql://user:pass@localhost/pampax"
connection_pool_size = 20
backup_enabled = true
backup_interval_hours = 12
```

### `[features]` - Feature Flags

Controls feature availability.

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `learning` | boolean | `true` | Enable learning system |
| `analytics` | boolean | `true` | Enable analytics collection |
| `policy_optimization` | boolean | `true` | Enable policy optimization |
| `experimental_features` | boolean | `false` | Enable experimental features |
| `debug_mode` | boolean | `false` | Enable debug mode |

### `[security]` - Security Configuration

Controls security-related settings.

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `encrypt_storage` | boolean | `false` | Encrypt storage at rest |
| `encryption_key_path` | string | optional | Path to encryption key |
| `access_log_enabled` | boolean | `true` | Enable access logging |
| `rate_limiting` | boolean | `false` | Enable rate limiting |
| `max_requests_per_minute` | number | `1000` | Maximum requests per minute |

## Hot Reload

PAMPAX supports hot reloading of configuration changes for non-critical settings. When enabled, the system will automatically detect changes to the configuration file and apply them without requiring a restart.

To enable hot reload programmatically:
```javascript
import { config } from './src/config/unified-config-loader.js';

// Enable hot reload (only works with TOML files)
config.enableHotReload();

// Register callback for configuration changes
config.onHotReload((oldConfig, newConfig) => {
  console.log('Configuration reloaded');
  console.log('Old logging level:', oldConfig.logging.level);
  console.log('New logging level:', newConfig.logging.level);
});
```

## Configuration Validation

PAMPAX validates all configuration values against a defined schema. Invalid configurations will result in helpful error messages indicating the exact problem and location.

Example validation error:
```
Configuration validation failed:
  logging.level: Invalid enum value. Expected 'error' | 'warn' | 'info' | 'debug' | 'trace', received 'invalid'
  metrics.sampling_rate: Number must be less than or equal to 1
  performance.query_timeout_ms: Number must be greater than or equal to 100
```

## Production Deployment Examples

### Docker Environment

```dockerfile
# Dockerfile
FROM node:18-alpine

# Install PAMPAX
COPY . /app
WORKDIR /app
RUN npm install -g .

# Create configuration directory
RUN mkdir -p /etc/pampax

# Copy production configuration
COPY pampax.toml /etc/pampax/pampax.toml

# Set environment variables
ENV PAMPAX_LOGGING_LEVEL=info
ENV PAMPAX_METRICS_SINK=file
ENV PAMPAX_METRICS_FILE_PATH=/var/log/pampax/metrics.log
ENV PAMPAX_STORAGE_PATH=/data/pampax

EXPOSE 3000
CMD ["pampax", "mcp"]
```

### Kubernetes ConfigMap

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: pampax-config
data:
  pampax.toml: |
    [logging]
    level = "info"
    format = "json"
    output = "stdout"
    structured = true

    [metrics]
    enabled = true
    sink = "prometheus"
    sampling_rate = 0.1
    labels = { service = "pampax", environment = "production" }

    [cache]
    enabled = true
    ttl_seconds = 3600
    max_size_mb = 1000
    strategy = "lru"

    [performance]
    query_timeout_ms = 10000
    max_concurrent_searches = 20
    parallel_processing = true
    memory_limit_mb = 2048

    [storage]
    type = "sqlite"
    path = "/data/pampax"
    backup_enabled = true
    backup_interval_hours = 6

---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: pampax
spec:
  replicas: 3
  selector:
    matchLabels:
      app: pampax
  template:
    metadata:
      labels:
        app: pampax
    spec:
      containers:
      - name: pampax
        image: pampax:latest
        env:
        - name: PAMPAX_LOGGING_LEVEL
          value: "debug"
        - name: PAMPAX_METRICS_SAMPLING_RATE
          value: "0.2"
        volumeMounts:
        - name: config
          mountPath: /etc/pampax
        - name: data
          mountPath: /data/pampax
      volumes:
      - name: config
        configMap:
          name: pampax-config
      - name: data
        persistentVolumeClaim:
          claimName: pampax-data
```

### Environment-Specific Configurations

#### Development (`pampax.dev.toml`)
```toml
[logging]
level = "debug"
format = "pretty"
output = "stdout"

[metrics]
enabled = true
sink = "stdout"
sampling_rate = 1.0

[features]
debug_mode = true
experimental_features = true

[performance]
query_timeout_ms = 30000
memory_limit_mb = 512
```

#### Production (`pampax.prod.toml`)
```toml
[logging]
level = "info"
format = "json"
output = "file"
file_path = "/var/log/pampax/pampax.log"
structured = true

[metrics]
enabled = true
sink = "prometheus"
sampling_rate = 0.05
labels = { environment = "production", cluster = "us-east-1" }

[cache]
ttl_seconds = 7200
max_size_mb = 2000
cleanup_interval_minutes = 60

[security]
encrypt_storage = true
rate_limiting = true
max_requests_per_minute = 500
```

## Migration from JSON to TOML

If you're migrating from JSON configuration, use this conversion guide:

### JSON to TOML Mapping

**JSON:**
```json
{
  "logging": {
    "level": "INFO",
    "jsonOutput": true,
    "logToFile": false
  },
  "metrics": {
    "enabled": true,
    "sinks": [
      { "type": "stdout" }
    ]
  }
}
```

**TOML:**
```toml
[logging]
level = "info"        # Convert to lowercase
format = "json"       # jsonOutput -> format
output = "stdout"     # logToFile -> output

[metrics]
enabled = true
sink = "stdout"       # sinks[0].type -> sink
```

### Automated Migration Script

```javascript
import { readFileSync, writeFileSync } from 'fs';
import { config } from './src/config/unified-config-loader.js';

// Load existing JSON config
const jsonConfig = JSON.parse(readFileSync('pampax.config.json', 'utf-8'));

// Create TOML config with equivalent values
const tomlConfig = config.exportAsToml();

// Write new TOML config
writeFileSync('pampax.toml', tomlConfig);
console.log('Migration complete! Review pampax.toml and update as needed.');
```

## Troubleshooting

### Common Issues

1. **Configuration not loading**
   - Check file permissions
   - Verify TOML syntax using an online validator
   - Ensure file is in one of the expected locations

2. **Environment variables not working**
   - Verify `PAMPAX_` prefix
   - Check for typos in variable names
   - Use underscores instead of dots in variable names

3. **Validation errors**
   - Review error messages for specific issues
   - Check data types and value ranges
   - Refer to the schema documentation

### Debug Configuration Loading

```javascript
import { config } from './src/config/unified-config-loader.js';

// Get configuration summary
const summary = config.getSummary();
console.log('Configuration Summary:', summary);

// Validate configuration
const validation = config.validate();
if (!validation.valid) {
  console.error('Configuration Errors:', validation.errors);
}

// Export current configuration
const tomlExport = config.exportAsToml();
if (tomlExport) {
  console.log('Current Configuration (TOML):');
  console.log(tomlExport);
}
```

## Best Practices

1. **Use environment variables for secrets**: Never store sensitive information in configuration files
2. **Version control your configuration**: Keep `pampax.toml` in version control with sensible defaults
3. **Environment-specific configs**: Use different files for different environments
4. **Monitor configuration changes**: Use hot reload callbacks to track configuration changes
5. **Validate in CI**: Add configuration validation to your CI pipeline
6. **Document overrides**: Clearly document which environment variables are used in your deployment

## API Reference

### UnifiedConfigLoader

The main configuration interface with the following methods:

- `getConfig()` - Get full configuration object
- `getSection(section)` - Get specific configuration section
- `getValue(path, defaultValue)` - Get nested value with dot notation
- `isFeatureEnabled(feature)` - Check if feature is enabled
- `getLoggingConfig()` - Get logging config (backward compatible)
- `getMetricsConfig()` - Get metrics config (backward compatible)
- `getFeatureFlags()` - Get feature flags (backward compatible)
- `reload()` - Reload configuration from file
- `enableHotReload()` - Enable hot reload (TOML only)
- `disableHotReload()` - Disable hot reload
- `onHotReload(callback)` - Register hot reload callback
- `getSummary()` - Get configuration summary
- `validate()` - Validate configuration
- `exportAsToml()` - Export as TOML string
- `destroy()` - Cleanup resources

### Environment Variable Mapping

| TOML Path | Environment Variable | Example |
|-----------|---------------------|---------|
| `logging.level` | `PAMPAX_LOGGING_LEVEL` | `PAMPAX_LOGGING_LEVEL=debug` |
| `metrics.enabled` | `PAMPAX_METRICS_ENABLED` | `PAMPAX_METRICS_ENABLED=false` |
| `cache.ttl_seconds` | `PAMPAX_CACHE_TTL_SECONDS` | `PAMPAX_CACHE_TTL_SECONDS=7200` |
| `performance.query_timeout_ms` | `PAMPAX_PERFORMANCE_QUERY_TIMEOUT_MS` | `PAMPAX_PERFORMANCE_QUERY_TIMEOUT_MS=10000` |
| `cli.color_output` | `PAMPAX_CLI_COLOR_OUTPUT` | `PAMPAX_CLI_COLOR_OUTPUT=never` |
| `features.learning` | `PAMPAX_FEATURES_LEARNING` | `PAMPAX_FEATURES_LEARNING=false` |
| `security.encrypt_storage` | `PAMPAX_SECURITY_ENCRYPT_STORAGE` | `PAMPAX_SECURITY_ENCRYPT_STORAGE=true` |

This comprehensive configuration system provides production-ready configuration management for PAMPAX with validation, hot reload, environment variable overrides, and full backward compatibility.