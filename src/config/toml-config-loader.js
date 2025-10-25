import { readFileSync, existsSync, watchFile, unwatchFile } from 'fs';
import { join } from 'path';
import { parse as parseToml } from '@iarna/toml';
import { z } from 'zod';

// Configuration schema with validation
const ConfigSchema = z.object({
  logging: z.object({
    level: z.enum(['error', 'warn', 'info', 'debug', 'trace']).default('info'),
    format: z.enum(['json', 'text', 'pretty']).default('json'),
    output: z.enum(['stdout', 'stderr', 'file']).default('stdout'),
    file_path: z.string().optional(),
    max_file_size_mb: z.number().min(1).max(1000).default(100),
    enable_rotation: z.boolean().default(true),
    structured: z.boolean().default(true)
  }).default({}),

  metrics: z.object({
    enabled: z.boolean().default(true),
    sink: z.enum(['stdout', 'stderr', 'file', 'prometheus']).default('stdout'),
    sampling_rate: z.number().min(0).max(1).default(0.1),
    file_path: z.string().optional(),
    export_interval_seconds: z.number().min(1).default(60),
    labels: z.record(z.string()).default({})
  }).default({}),

  cache: z.object({
    enabled: z.boolean().default(true),
    ttl_seconds: z.number().min(1).default(3600),
    max_size_mb: z.number().min(1).max(10000).default(500),
    cleanup_interval_minutes: z.number().min(1).default(30),
    strategy: z.enum(['lru', 'lfu', 'fifo']).default('lru')
  }).default({}),

  performance: z.object({
    query_timeout_ms: z.number().min(100).max(300000).default(5000),
    max_concurrent_searches: z.number().min(1).max(100).default(10),
    sqlite_cache_size: z.number().min(100).max(100000).default(2000),
    chunk_size: z.number().min(1).max(1000).default(50),
    parallel_processing: z.boolean().default(true),
    memory_limit_mb: z.number().min(100).max(8192).default(1024)
  }).default({}),

  cli: z.object({
    deterministic_output: z.boolean().default(true),
    color_output: z.enum(['auto', 'always', 'never']).default('auto'),
    progress_bar: z.boolean().default(true),
    verbose_errors: z.boolean().default(false),
    interactive_mode: z.boolean().default(true)
  }).default({}),

  indexer: z.object({
    max_file_size_mb: z.number().min(1).max(1000).default(10),
    exclude_patterns: z.array(z.string()).default([
      'node_modules/**',
      '.git/**',
      'dist/**',
      'build/**',
      '*.min.js',
      '*.min.css',
      '.DS_Store',
      'Thumbs.db'
    ]),
    include_patterns: z.array(z.string()).default([
      '**/*.{js,ts,jsx,tsx,py,java,cpp,c,h,hpp,go,rs,php,rb,swift,kt,dart,scala,hs,ml,lua,elixir,sh,bash,zsh,fish}'
    ]),
    follow_symlinks: z.boolean().default(false),
    respect_gitignore: z.boolean().default(true)
  }).default({}),

  storage: z.object({
    type: z.enum(['sqlite', 'memory', 'postgres']).default('sqlite'),
    path: z.string().default('.pampax'),
    connection_pool_size: z.number().min(1).max(100).default(10),
    backup_enabled: z.boolean().default(true),
    backup_interval_hours: z.number().min(1).default(24)
  }).default({}),

  features: z.object({
    learning: z.boolean().default(true),
    analytics: z.boolean().default(true),
    policy_optimization: z.boolean().default(true),
    experimental_features: z.boolean().default(false),
    debug_mode: z.boolean().default(false)
  }).default({}),

  security: z.object({
    encrypt_storage: z.boolean().default(false),
    encryption_key_path: z.string().optional(),
    access_log_enabled: z.boolean().default(true),
    rate_limiting: z.boolean().default(false),
    max_requests_per_minute: z.number().min(1).default(1000)
  }).default({})
}).default({});

/**
 * TOML Configuration Loader with environment variable overrides
 */
class TomlConfigLoader {
  constructor(configPath = null) {
    this.configPath = configPath || this.findConfigFile();
    this.config = null;
    this.watchers = new Map();
    this.hotReloadCallbacks = new Set();
    this.lastLoadTime = 0;
    this.load();
  }

  static getInstance(configPath) {
    if (!TomlConfigLoader.instance) {
      TomlConfigLoader.instance = new TomlConfigLoader(configPath);
    }
    return TomlConfigLoader.instance;
  }

  /**
   * Find configuration file in standard locations
   */
  findConfigFile() {
    const possiblePaths = [
      join(process.cwd(), 'pampax.toml'),
      join(process.cwd(), '.pampax.toml'),
      join(process.cwd(), 'config', 'pampax.toml'),
      join(process.cwd(), '.pampax', 'pampax.toml')
    ];

    for (const path of possiblePaths) {
      if (existsSync(path)) {
        return path;
      }
    }

    return possiblePaths[0]; // Return default path
  }

  /**
   * Load and parse TOML configuration
   */
  load() {
    try {
      let config = {};

      // Load TOML file if it exists
      if (existsSync(this.configPath)) {
        const fileContent = readFileSync(this.configPath, 'utf-8');
        const parsedToml = parseToml(fileContent);
        config = parsedToml;
      }

      // Apply defaults first, then environment variable overrides
      const configWithDefaults = ConfigSchema.parse(config);
      config = this.applyEnvironmentOverrides(configWithDefaults);

      // Final validation with overrides applied
      const validatedConfig = ConfigSchema.parse(config);
      this.config = validatedConfig;
      this.lastLoadTime = Date.now();

      return this.config;
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new Error(`Configuration validation failed:\n${this.formatZodError(error)}`);
      }
      throw new Error(`Failed to load configuration: ${error.message}`);
    }
  }

  /**
   * Apply environment variable overrides
   */
  applyEnvironmentOverrides(config) {
    const envOverrides = { ...config };

    // Helper function to set nested values
    const setNestedValue = (obj, path, value) => {
      const keys = path.split('.');
      let current = obj;

      for (let i = 0; i < keys.length - 1; i++) {
        if (!(keys[i] in current)) {
          current[keys[i]] = {};
        }
        current = current[keys[i]];
      }

      const finalKey = keys[keys.length - 1];
      
      // Type conversion based on existing value or defaults
      if (value === 'true' || value === 'false') {
        current[finalKey] = value === 'true';
      } else if (/^\d+$/.test(value)) {
        current[finalKey] = parseInt(value, 10);
      } else if (/^\d*\.\d+$/.test(value)) {
        current[finalKey] = parseFloat(value);
      } else {
        current[finalKey] = value;
      }
    };

    // Environment variable mappings for common patterns
    const envMappings = {
      'PAMPAX_LOGGING_LEVEL': 'logging.level',
      'PAMPAX_LOGGING_FORMAT': 'logging.format',
      'PAMPAX_LOGGING_OUTPUT': 'logging.output',
      'PAMPAX_METRICS_ENABLED': 'metrics.enabled',
      'PAMPAX_METRICS_SINK': 'metrics.sink',
      'PAMPAX_METRICS_SAMPLING_RATE': 'metrics.sampling_rate',
      'PAMPAX_CACHE_ENABLED': 'cache.enabled',
      'PAMPAX_CACHE_TTL_SECONDS': 'cache.ttl_seconds',
      'PAMPAX_CACHE_MAX_SIZE_MB': 'cache.max_size_mb',
      'PAMPAX_CACHE_STRATEGY': 'cache.strategy',
      'PAMPAX_PERFORMANCE_QUERY_TIMEOUT_MS': 'performance.query_timeout_ms',
      'PAMPAX_PERFORMANCE_MAX_CONCURRENT_SEARCHES': 'performance.max_concurrent_searches',
      'PAMPAX_PERFORMANCE_SQLITE_CACHE_SIZE': 'performance.sqlite_cache_size',
      'PAMPAX_PERFORMANCE_PARALLEL_PROCESSING': 'performance.parallel_processing',
      'PAMPAX_PERFORMANCE_MEMORY_LIMIT_MB': 'performance.memory_limit_mb',
      'PAMPAX_CLI_DETERMINISTIC_OUTPUT': 'cli.deterministic_output',
      'PAMPAX_CLI_COLOR_OUTPUT': 'cli.color_output',
      'PAMPAX_CLI_PROGRESS_BAR': 'cli.progress_bar',
      'PAMPAX_CLI_VERBOSE_ERRORS': 'cli.verbose_errors',
      'PAMPAX_CLI_INTERACTIVE_MODE': 'cli.interactive_mode',
      'PAMPAX_INDEXER_MAX_FILE_SIZE_MB': 'indexer.max_file_size_mb',
      'PAMPAX_INDEXER_FOLLOW_SYMLINKS': 'indexer.follow_symlinks',
      'PAMPAX_INDEXER_RESPECT_GITIGNORE': 'indexer.respect_gitignore',
      'PAMPAX_STORAGE_TYPE': 'storage.type',
      'PAMPAX_STORAGE_PATH': 'storage.path',
      'PAMPAX_STORAGE_CONNECTION_POOL_SIZE': 'storage.connection_pool_size',
      'PAMPAX_STORAGE_BACKUP_ENABLED': 'storage.backup_enabled',
      'PAMPAX_STORAGE_BACKUP_INTERVAL_HOURS': 'storage.backup_interval_hours',
      'PAMPAX_FEATURES_LEARNING': 'features.learning',
      'PAMPAX_FEATURES_ANALYTICS': 'features.analytics',
      'PAMPAX_FEATURES_POLICY_OPTIMIZATION': 'features.policy_optimization',
      'PAMPAX_FEATURES_EXPERIMENTAL_FEATURES': 'features.experimental_features',
      'PAMPAX_FEATURES_DEBUG_MODE': 'features.debug_mode',
      'PAMPAX_SECURITY_ENCRYPT_STORAGE': 'security.encrypt_storage',
      'PAMPAX_SECURITY_ACCESS_LOG_ENABLED': 'security.access_log_enabled',
      'PAMPAX_SECURITY_RATE_LIMITING': 'security.rate_limiting',
      'PAMPAX_SECURITY_MAX_REQUESTS_PER_MINUTE': 'security.max_requests_per_minute'
    };

    // Process all PAMPAX_ environment variables
    for (const [key, value] of Object.entries(process.env)) {
      if (key.startsWith('PAMPAX_')) {
        // Use mapping if available, otherwise convert pattern
        const configPath = envMappings[key] || key.substring(7).toLowerCase().replace(/_/g, '.');
        setNestedValue(envOverrides, configPath, value);
      }
    }

    return envOverrides;
  }

  /**
   * Format Zod validation errors for better readability
   */
  formatZodError(error) {
    return error.errors.map(err => {
      const path = err.path.join('.');
      return `  ${path}: ${err.message}`;
    }).join('\n');
  }

  /**
   * Get the full configuration object
   */
  getConfig() {
    return { ...this.config };
  }

  /**
   * Get a specific configuration section
   */
  getSection(section) {
    return this.config?.[section] || null;
  }

  /**
   * Get a specific configuration value with dot notation
   */
  getValue(path, defaultValue = null) {
    const keys = path.split('.');
    let current = this.config;

    for (const key of keys) {
      if (current && typeof current === 'object' && key in current) {
        current = current[key];
      } else {
        return defaultValue;
      }
    }

    return current;
  }

  /**
   * Check if a feature is enabled
   */
  isFeatureEnabled(feature) {
    return this.getValue(`features.${feature}`, false);
  }

  /**
   * Reload configuration from file
   */
  reload() {
    const oldConfig = { ...this.config };
    try {
      this.load();
      this.notifyHotReload(oldConfig, this.config);
      return true;
    } catch (error) {
      console.error('Failed to reload configuration:', error.message);
      return false;
    }
  }

  /**
   * Enable hot reload for configuration file
   */
  enableHotReload() {
    if (existsSync(this.configPath)) {
      watchFile(this.configPath, { interval: 1000 }, () => {
        console.log('Configuration file changed, reloading...');
        this.reload();
      });
      this.watchers.set(this.configPath, true);
    }
  }

  /**
   * Disable hot reload
   */
  disableHotReload() {
    if (this.watchers.has(this.configPath)) {
      unwatchFile(this.configPath);
      this.watchers.delete(this.configPath);
    }
  }

  /**
   * Register callback for hot reload events
   */
  onHotReload(callback) {
    this.hotReloadCallbacks.add(callback);
  }

  /**
   * Remove hot reload callback
   */
  offHotReload(callback) {
    this.hotReloadCallbacks.delete(callback);
  }

  /**
   * Notify hot reload callbacks
   */
  notifyHotReload(oldConfig, newConfig) {
    for (const callback of this.hotReloadCallbacks) {
      try {
        callback(oldConfig, newConfig);
      } catch (error) {
        console.error('Error in hot reload callback:', error);
      }
    }
  }

  /**
   * Get configuration summary for debugging
   */
  getSummary() {
    return {
      configPath: this.configPath,
      lastLoadTime: new Date(this.lastLoadTime).toISOString(),
      hotReloadEnabled: this.watchers.has(this.configPath),
      environmentOverrides: Object.keys(process.env)
        .filter(key => key.startsWith('PAMPAX_'))
        .length,
      sections: Object.keys(this.config || {})
    };
  }

  /**
   * Validate configuration against schema
   */
  validate(config = this.config) {
    try {
      ConfigSchema.parse(config);
      return { valid: true, errors: [] };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          valid: false,
          errors: error.errors.map(err => ({
            path: err.path.join('.'),
            message: err.message,
            code: err.code
          }))
        };
      }
      return { valid: false, errors: [{ message: error.message }] };
    }
  }

  /**
   * Export current configuration as TOML string
   */
  exportAsToml() {
    // This is a simplified export - in production you might want to use a proper TOML serializer
    return `# PAMPAX Configuration
# Generated on ${new Date().toISOString()}

[logging]
level = "${this.config.logging.level}"
format = "${this.config.logging.format}"
output = "${this.config.logging.output}"
structured = ${this.config.logging.structured}

[metrics]
enabled = ${this.config.metrics.enabled}
sink = "${this.config.metrics.sink}"
sampling_rate = ${this.config.metrics.sampling_rate}

[cache]
enabled = ${this.config.cache.enabled}
ttl_seconds = ${this.config.cache.ttl_seconds}
max_size_mb = ${this.config.cache.max_size_mb}
strategy = "${this.config.cache.strategy}"

[performance]
query_timeout_ms = ${this.config.performance.query_timeout_ms}
max_concurrent_searches = ${this.config.performance.max_concurrent_searches}
sqlite_cache_size = ${this.config.performance.sqlite_cache_size}
parallel_processing = ${this.config.performance.parallel_processing}

[cli]
deterministic_output = ${this.config.cli.deterministic_output}
color_output = "${this.config.cli.color_output}"
progress_bar = ${this.config.cli.progress_bar}

[features]
learning = ${this.config.features.learning}
analytics = ${this.config.features.analytics}
policy_optimization = ${this.config.features.policy_optimization}
experimental_features = ${this.config.features.experimental_features}
`;
  }

  /**
   * Cleanup resources
   */
  destroy() {
    this.disableHotReload();
    this.hotReloadCallbacks.clear();
  }
}

export { TomlConfigLoader, ConfigSchema };
export const config = TomlConfigLoader.getInstance();