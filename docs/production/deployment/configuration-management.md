# Configuration Management Guide

This guide covers comprehensive configuration management for PAMPAX in production environments, including validation, hot reload, environment-specific configurations, and best practices.

## Configuration Architecture

### Configuration Loading Order

PAMPAX loads configuration in the following priority order (highest to lowest):

1. **Environment Variables** (`PAMPAX_*`)
2. **TOML Configuration Files**:
   - `pampax.toml` (current directory)
   - `.pampax.toml` (current directory)
   - `config/pampax.toml` (config subdirectory)
   - `.pampax/pampax.toml` (hidden config directory)
3. **Legacy JSON Files** (backward compatibility):
   - `pampax.config.json`
   - `.pampaxrc.json`
   - `config/pampax.json`
4. **Built-in Defaults**

### Configuration Schema Overview

```toml
# Core configuration sections
[logging]          # Structured logging settings
[metrics]          # Performance metrics collection
[cache]            # Caching system configuration
[performance]      # Performance tuning parameters
[cli]              # Command-line interface behavior
[indexer]          # File indexing behavior
[storage]          # Data storage settings
[features]         # Feature flags and toggles
[security]         # Security and access control
```

## Environment-Specific Configurations

### Development Environment

**File**: `pampax.dev.toml`

```toml
# Development configuration optimized for debugging and iteration
[logging]
level = "debug"
format = "pretty"
output = "stdout"
structured = true
max_file_size_mb = 50

[metrics]
enabled = true
sink = "stdout"
sampling_rate = 1.0  # Sample everything in development

[cache]
enabled = true
ttl_seconds = 300    # Short TTL for development
max_size_mb = 100
strategy = "lru"
cleanup_interval_minutes = 10

[performance]
query_timeout_ms = 30000  # Longer timeouts for debugging
max_concurrent_searches = 5
parallel_processing = true
memory_limit_mb = 512

[features]
learning = true
analytics = true
policy_optimization = true
experimental_features = true  # Enable experimental features
debug_mode = true

[indexer]
max_file_size_mb = 5  # Smaller files for faster indexing
exclude_patterns = [
  "node_modules/**",
  ".git/**",
  "dist/**",
  "build/**",
  "*.min.js",
  "*.min.css"
]

[security]
encrypt_storage = false
access_log_enabled = true
rate_limiting = false  # Disabled in development
```

### Staging Environment

**File**: `pampax.staging.toml`

```toml
# Staging configuration mirrors production with relaxed debugging
[logging]
level = "info"
format = "json"
output = "stdout"
structured = true
max_file_size_mb = 100

[metrics]
enabled = true
sink = "prometheus"
sampling_rate = 0.5  # Higher sampling rate for testing
export_interval_seconds = 30
labels = { 
  environment = "staging", 
  cluster = "staging-cluster",
  version = "latest"
}

[cache]
enabled = true
ttl_seconds = 1800  # 30 minutes
max_size_mb = 500
strategy = "lru"
cleanup_interval_minutes = 30

[performance]
query_timeout_ms = 10000
max_concurrent_searches = 10
parallel_processing = true
memory_limit_mb = 1024

[features]
learning = true
analytics = true
policy_optimization = true
experimental_features = false  # Disabled in staging
debug_mode = false

[security]
encrypt_storage = true
access_log_enabled = true
rate_limiting = true
max_requests_per_minute = 2000
```

### Production Environment

**File**: `pampax.prod.toml`

```toml
# Production configuration optimized for performance and reliability
[logging]
level = "warn"  # Higher level for production
format = "json"
output = "file"
file_path = "/var/log/pampax/pampax.log"
structured = true
max_file_size_mb = 200
enable_rotation = true

[metrics]
enabled = true
sink = "prometheus"
sampling_rate = 0.05  # Low sampling rate for production
export_interval_seconds = 60
labels = { 
  environment = "production", 
  cluster = "us-east-1",
  datacenter = "dc1"
}

[cache]
enabled = true
ttl_seconds = 7200  # 2 hours
max_size_mb = 2000
strategy = "lfu"    # Least Frequently Used for production
cleanup_interval_minutes = 60

[performance]
query_timeout_ms = 8000
max_concurrent_searches = 20
parallel_processing = true
memory_limit_mb = 4096
sqlite_cache_size = 5000

[features]
learning = true
analytics = true
policy_optimization = true
experimental_features = false
debug_mode = false

[security]
encrypt_storage = true
encryption_key_path = "/etc/pampax/encryption.key"
access_log_enabled = true
rate_limiting = true
max_requests_per_minute = 1000

[storage]
type = "sqlite"
path = "/data/pampax"
connection_pool_size = 20
backup_enabled = true
backup_interval_hours = 6
```

## Environment Variable Management

### Environment Variable Override Strategy

All configuration values can be overridden using environment variables with the `PAMPAX_` prefix. This is particularly useful for:

- **Secrets Management**: Never store sensitive data in configuration files
- **Container Orchestration**: Kubernetes ConfigMaps and Secrets
- **CI/CD Pipelines**: Environment-specific overrides
- **Dynamic Configuration**: Runtime adjustments without config file changes

### Environment Variable Mapping

| Configuration Path | Environment Variable | Example |
|-------------------|---------------------|---------|
| `logging.level` | `PAMPAX_LOGGING_LEVEL` | `PAMPAX_LOGGING_LEVEL=debug` |
| `logging.format` | `PAMPAX_LOGGING_FORMAT` | `PAMPAX_LOGGING_FORMAT=json` |
| `logging.output` | `PAMPAX_LOGGING_OUTPUT` | `PAMPAX_LOGGING_OUTPUT=file` |
| `logging.file_path` | `PAMPAX_LOGGING_FILE_PATH` | `PAMPAX_LOGGING_FILE_PATH=/var/log/pampax.log` |
| `metrics.enabled` | `PAMPAX_METRICS_ENABLED` | `PAMPAX_METRICS_ENABLED=true` |
| `metrics.sink` | `PAMPAX_METRICS_SINK` | `PAMPAX_METRICS_SINK=prometheus` |
| `metrics.sampling_rate` | `PAMPAX_METRICS_SAMPLING_RATE` | `PAMPAX_METRICS_SAMPLING_RATE=0.1` |
| `cache.enabled` | `PAMPAX_CACHE_ENABLED` | `PAMPAX_CACHE_ENABLED=true` |
| `cache.ttl_seconds` | `PAMPAX_CACHE_TTL_SECONDS` | `PAMPAX_CACHE_TTL_SECONDS=3600` |
| `cache.max_size_mb` | `PAMPAX_CACHE_MAX_SIZE_MB` | `PAMPAX_CACHE_MAX_SIZE_MB=1000` |
| `performance.query_timeout_ms` | `PAMPAX_PERFORMANCE_QUERY_TIMEOUT_MS` | `PAMPAX_PERFORMANCE_QUERY_TIMEOUT_MS=10000` |
| `performance.memory_limit_mb` | `PAMPAX_PERFORMANCE_MEMORY_LIMIT_MB` | `PAMPAX_PERFORMANCE_MEMORY_LIMIT_MB=2048` |
| `storage.path` | `PAMPAX_STORAGE_PATH` | `PAMPAX_STORAGE_PATH=/data/pampax` |
| `features.learning` | `PAMPAX_FEATURES_LEARNING` | `PAMPAX_FEATURES_LEARNING=false` |
| `security.encrypt_storage` | `PAMPAX_SECURITY_ENCRYPT_STORAGE` | `PAMPAX_SECURITY_ENCRYPT_STORAGE=true` |

### Production Environment Variables

```bash
# Core production settings
export NODE_ENV=production
export PAMPAX_LOGGING_LEVEL=warn
export PAMPAX_LOGGING_FORMAT=json
export PAMPAX_LOGGING_OUTPUT=file
export PAMPAX_LOGGING_FILE_PATH=/var/log/pampax/pampax.log

# Performance tuning
export PAMPAX_PERFORMANCE_QUERY_TIMEOUT_MS=8000
export PAMPAX_PERFORMANCE_MEMORY_LIMIT_MB=4096
export PAMPAX_PERFORMANCE_MAX_CONCURRENT_SEARCHES=20

# Cache configuration
export PAMPAX_CACHE_TTL_SECONDS=7200
export PAMPAX_CACHE_MAX_SIZE_MB=2000

# Storage and security
export PAMPAX_STORAGE_PATH=/data/pampax
export PAMPAX_SECURITY_ENCRYPT_STORAGE=true
export PAMPAX_SECURITY_RATE_LIMITING=true

# Feature flags
export PAMPAX_FEATURES_EXPERIMENTAL_FEATURES=false
export PAMPAX_FEATURES_DEBUG_MODE=false

# Secrets (never in config files)
export PAMPAX_SECURITY_ENCRYPTION_KEY_PATH=/etc/pampax/encryption.key
export PAMPAX_DATABASE_PASSWORD=$(cat /etc/pampax/db_password)
```

## Configuration Validation

### Schema Validation

PAMPAX uses Zod schemas for comprehensive configuration validation:

```javascript
import { config } from './src/config/unified-config-loader.js';

// Validate configuration
const validation = config.validate();

if (!validation.valid) {
  console.error('Configuration validation failed:');
  validation.errors.forEach(error => {
    console.error(`  ${error.path}: ${error.message}`);
  });
  process.exit(2);
}
```

### Validation Rules

#### Logging Configuration
- `level`: Must be one of `error`, `warn`, `info`, `debug`, `trace`
- `format`: Must be one of `json`, `text`, `pretty`
- `output`: Must be one of `stdout`, `stderr`, `file`
- `max_file_size_mb`: Must be between 1 and 1000
- `sampling_rate`: Must be between 0.0 and 1.0

#### Performance Configuration
- `query_timeout_ms`: Must be between 100 and 300000
- `max_concurrent_searches`: Must be between 1 and 100
- `memory_limit_mb`: Must be between 128 and 32768
- `sqlite_cache_size`: Must be between 100 and 100000

#### Cache Configuration
- `ttl_seconds`: Must be between 60 and 86400
- `max_size_mb`: Must be between 10 and 10000
- `strategy`: Must be one of `lru`, `lfu`, `fifo`

### Pre-Deployment Validation Script

```bash
#!/bin/bash
# validate-config.sh - Configuration validation script

set -e

echo "Validating PAMPAX configuration..."

# Check if configuration file exists
if [ ! -f "pampax.toml" ]; then
    echo "ERROR: Configuration file pampax.toml not found"
    exit 1
fi

# Validate configuration
if ! pampax config --validate; then
    echo "ERROR: Configuration validation failed"
    exit 2
fi

# Check required environment variables
required_vars=(
    "NODE_ENV"
    "PAMPAX_LOGGING_LEVEL"
    "PAMPAX_STORAGE_PATH"
)

missing_vars=()
for var in "${required_vars[@]}"; do
    if [ -z "${!var}" ]; then
        missing_vars+=("$var")
    fi
done

if [ ${#missing_vars[@]} -gt 0 ]; then
    echo "ERROR: Missing required environment variables:"
    printf '  %s\n' "${missing_vars[@]}"
    exit 3
fi

# Check storage path permissions
if [ ! -d "$PAMPAX_STORAGE_PATH" ]; then
    echo "WARNING: Storage path $PAMPAX_STORAGE_PATH does not exist"
    echo "Creating directory..."
    mkdir -p "$PAMPAX_STORAGE_PATH"
fi

if [ ! -w "$PAMPAX_STORAGE_PATH" ]; then
    echo "ERROR: Storage path $PAMPAX_STORAGE_PATH is not writable"
    exit 4
fi

# Check log file path permissions
if [ -n "$PAMPAX_LOGGING_FILE_PATH" ]; then
    log_dir=$(dirname "$PAMPAX_LOGGING_FILE_PATH")
    if [ ! -w "$log_dir" ]; then
        echo "ERROR: Log directory $log_dir is not writable"
        exit 5
    fi
fi

echo "Configuration validation passed!"
exit 0
```

## Hot Reload Configuration

### Hot Reload Capabilities

PAMPAX supports hot reloading for non-critical configuration changes:

**Hot Reloadable Settings**:
- Logging level and format
- Metrics sampling rate
- Cache TTL and cleanup intervals
- Feature flags (non-critical)
- Performance tuning parameters

**Requires Restart**:
- Storage path and type
- Security encryption settings
- Database connection settings
- Network-related configurations

### Enabling Hot Reload

```javascript
import { config } from './src/config/unified-config-loader.js';

// Enable hot reload (TOML files only)
config.enableHotReload();

// Register callback for configuration changes
config.onHotReload((oldConfig, newConfig) => {
  console.log('Configuration reloaded at:', new Date().toISOString());
  
  // Log specific changes
  if (oldConfig.logging.level !== newConfig.logging.level) {
    console.log(`Logging level changed: ${oldConfig.logging.level} → ${newConfig.logging.level}`);
  }
  
  if (oldConfig.cache.ttl_seconds !== newConfig.cache.ttl_seconds) {
    console.log(`Cache TTL changed: ${oldConfig.cache.ttl_seconds} → ${newConfig.cache.ttl_seconds}`);
  }
});

// Graceful shutdown
process.on('SIGINT', () => {
  config.disableHotReload();
  process.exit(0);
});
```

### Hot Reload CLI Command

```bash
# Enable hot reload for monitoring configuration changes
pampax config --hot-reload

# This will watch the configuration file and display changes in real-time
```

## Configuration Management Best Practices

### 1. Version Control Strategy

**Include in Version Control**:
- Default configuration templates
- Development and staging configurations
- Configuration schemas and documentation

**Exclude from Version Control**:
- Production-specific configurations with secrets
- Environment-specific overrides
- Encryption keys and certificates

**Git Configuration**:
```gitignore
# .gitignore
pampax.prod.toml
*.key
*.pem
.env.local
.env.production
```

### 2. Environment-Specific Files

Use a consistent naming convention:
- `pampax.base.toml` - Common base configuration
- `pampax.dev.toml` - Development overrides
- `pampax.staging.toml` - Staging overrides
- `pampax.prod.toml` - Production overrides

### 3. Configuration Templates

Create templates for different deployment scenarios:

```bash
# Template generation script
#!/bin/bash
# generate-config.sh

ENVIRONMENT=${1:-dev}
OUTPUT_FILE="pampax.${ENVIRONMENT}.toml"

cat > "$OUTPUT_FILE" << EOF
# PAMPAX Configuration - $ENVIRONMENT Environment
# Generated on $(date)

# Base configuration
include = "pampax.base.toml"

# Environment-specific overrides
[logging]
level = "$(get_logging_level $ENVIRONMENT)"
format = "$(get_log_format $ENVIRONMENT)"

[performance]
memory_limit_mb = $(get_memory_limit $ENVIRONMENT)
query_timeout_ms = $(get_timeout $ENVIRONMENT)

[features]
debug_mode = $(is_debug_enabled $ENVIRONMENT)
experimental_features = $(is_experimental_enabled $ENVIRONMENT)
EOF

echo "Generated $OUTPUT_FILE"
```

### 4. Configuration Testing

Add configuration validation to CI/CD pipeline:

```yaml
# .github/workflows/config-validation.yml
name: Configuration Validation

on:
  pull_request:
    paths:
      - 'pampax*.toml'
      - 'src/config/**'

jobs:
  validate-config:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v3
    
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18'
        
    - name: Install dependencies
      run: npm ci
      
    - name: Validate configuration files
      run: |
        for config in pampax.*.toml; do
          echo "Validating $config..."
          PAMPAX_CONFIG_FILE="$config" node -e "
            import { config } from './src/config/unified-config-loader.js';
            const validation = config.validate();
            if (!validation.valid) {
              console.error('Configuration validation failed for $config:');
              validation.errors.forEach(error => {
                console.error('  ' + error.path + ': ' + error.message);
              });
              process.exit(1);
            }
            console.log('✓ $config is valid');
          "
        done
```

### 5. Secrets Management

Never store sensitive information in configuration files:

```bash
# Use environment variables for secrets
export PAMPAX_DATABASE_PASSWORD=$(aws secretsmanager get-secret-value \
  --secret-id pampax/db-password \
  --query SecretString --output text)

export PAMPAX_ENCRYPTION_KEY=$(vault kv get -field=key secret/pampax/encryption)

# Or use Kubernetes secrets
apiVersion: v1
kind: Secret
metadata:
  name: pampax-secrets
type: Opaque
stringData:
  db-password: "super-secret-password"
  encryption-key: "32-byte-encryption-key-here"
```

### 6. Configuration Auditing

Track configuration changes for compliance and debugging:

```javascript
// Configuration change logger
config.onHotReload((oldConfig, newConfig) => {
  const change = {
    timestamp: new Date().toISOString(),
    user: process.env.USER || 'system',
    changes: detectChanges(oldConfig, newConfig)
  };
  
  // Log to audit trail
  logger.info('Configuration changed', {
    component: 'config-manager',
    op: 'hot_reload',
    audit: change
  });
});

function detectChanges(oldConfig, newConfig) {
  const changes = [];
  
  // Compare all configuration sections
  const sections = ['logging', 'metrics', 'cache', 'performance', 'features'];
  
  sections.forEach(section => {
    if (JSON.stringify(oldConfig[section]) !== JSON.stringify(newConfig[section])) {
      changes.push({
        section,
        old: oldConfig[section],
        new: newConfig[section]
      });
    }
  });
  
  return changes;
}
```

## Troubleshooting Configuration Issues

### Common Configuration Problems

#### 1. Configuration File Not Found

**Symptoms**: `Configuration file not found` error

**Solutions**:
```bash
# Check file locations
ls -la pampax.toml .pampax.toml config/pampax.toml

# Create default configuration
pampax config --init

# Check file permissions
chmod 644 pampax.toml
```

#### 2. Validation Errors

**Symptoms**: Schema validation failures

**Diagnosis**:
```bash
# Validate configuration
pampax config --validate

# Show current configuration
pampax config --show

# Check environment variable overrides
pampax config --env-overrides
```

#### 3. Environment Variable Issues

**Symptoms**: Environment variables not applied

**Diagnosis**:
```bash
# Check environment variables
env | grep PAMPAX_

# Test specific override
PAMPAX_LOGGING_LEVEL=debug pampax config --show | grep level

# Check variable naming (must use underscores, not dots)
export PAMPAX_LOGGING_LEVEL=debug  # Correct
export PAMPAX.LOGGING.LEVEL=debug  # Incorrect
```

#### 4. Hot Reload Not Working

**Symptoms**: Configuration changes not applied

**Solutions**:
```bash
# Ensure using TOML file (JSON doesn't support hot reload)
ls -la pampax.toml

# Check file permissions
chmod 644 pampax.toml

# Test hot reload manually
pampax config --hot-reload
```

### Configuration Debugging Tools

```javascript
// debug-config.js - Configuration debugging utility
import { config } from './src/config/unified-config-loader.js';

console.log('=== Configuration Debug Information ===');
console.log('');

// 1. Configuration sources
console.log('Configuration Sources:');
console.log('  Config file:', config.getConfigPath());
console.log('  Environment variables:', Object.keys(process.env)
  .filter(key => key.startsWith('PAMPAX_')).length);
console.log('');

// 2. Current configuration summary
console.log('Configuration Summary:');
const summary = config.getSummary();
Object.entries(summary).forEach(([key, value]) => {
  console.log(`  ${key}:`, value);
});
console.log('');

// 3. Validation status
console.log('Validation Status:');
const validation = config.validate();
if (validation.valid) {
  console.log('  ✓ Configuration is valid');
} else {
  console.log('  ✗ Configuration validation failed:');
  validation.errors.forEach(error => {
    console.log(`    ${error.path}: ${error.message}`);
  });
}
console.log('');

// 4. Environment variable overrides
console.log('Environment Variable Overrides:');
const envOverrides = Object.keys(process.env)
  .filter(key => key.startsWith('PAMPAX_'))
  .sort();

if (envOverrides.length === 0) {
  console.log('  None');
} else {
  envOverrides.forEach(envVar => {
    const configPath = envVar.substring(7).toLowerCase().replace(/_/g, '.');
    const currentValue = config.getValue(configPath);
    console.log(`  ${envVar} → ${configPath}: ${currentValue}`);
  });
}
```

This comprehensive configuration management guide provides all the tools and best practices needed to effectively manage PAMPAX configurations across different environments while maintaining security, reliability, and operational efficiency.