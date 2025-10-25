import { existsSync } from 'fs';
import { join } from 'path';
import { TomlConfigLoader } from './toml-config-loader.js';
import { ConfigLoader } from './config-loader.js';

/**
 * Unified Configuration Loader that supports both TOML and JSON configurations
 * with backward compatibility and environment variable overrides
 */
class UnifiedConfigLoader {
  constructor(configPath = null, preferToml = true) {
    this.preferToml = preferToml;
    this.configPath = configPath;
    this.tomlLoader = null;
    this.jsonLoader = null;
    this.activeLoader = null;
    this.load();
  }

  static getInstance(configPath, preferToml) {
    if (!UnifiedConfigLoader.instance) {
      UnifiedConfigLoader.instance = new UnifiedConfigLoader(configPath, preferToml);
    }
    return UnifiedConfigLoader.instance;
  }

  /**
   * Find configuration file with priority based on preference
   */
  findConfigFile() {
    const tomlPaths = [
      join(process.cwd(), 'pampax.toml'),
      join(process.cwd(), '.pampax.toml'),
      join(process.cwd(), 'config', 'pampax.toml'),
      join(process.cwd(), '.pampax', 'pampax.toml')
    ];

    const jsonPaths = [
      join(process.cwd(), 'pampax.config.json'),
      join(process.cwd(), '.pampaxrc.json'),
      join(process.cwd(), 'config', 'pampax.json')
    ];

    // Check for existing files based on preference
    const checkPaths = this.preferToml ? [...tomlPaths, ...jsonPaths] : [...jsonPaths, ...tomlPaths];

    for (const path of checkPaths) {
      if (existsSync(path)) {
        return path;
      }
    }

    // Return default based on preference
    return this.preferToml ? tomlPaths[0] : jsonPaths[0];
  }

  /**
   * Load configuration using appropriate loader
   */
  load() {
    const configPath = this.configPath || this.findConfigFile();
    const isToml = configPath.endsWith('.toml');

    try {
      if (isToml) {
        this.tomlLoader = new TomlConfigLoader(configPath);
        this.activeLoader = this.tomlLoader;
        this.jsonLoader = null;
      } else {
        this.jsonLoader = new ConfigLoader(configPath);
        this.activeLoader = this.jsonLoader;
        this.tomlLoader = null;
      }
    } catch (error) {
      console.warn(`Failed to load ${isToml ? 'TOML' : 'JSON'} config from ${configPath}, trying fallback`, { error });
      
      // Try fallback format
      try {
        if (isToml) {
          // Fallback to JSON
          const jsonPath = this.findConfigFile().replace('.toml', '.json');
          this.jsonLoader = new ConfigLoader(jsonPath);
          this.activeLoader = this.jsonLoader;
        } else {
          // Fallback to TOML
          const tomlPath = this.findConfigFile().replace('.json', '.toml');
          this.tomlLoader = new TomlConfigLoader(tomlPath);
          this.activeLoader = this.tomlLoader;
        }
      } catch (fallbackError) {
        console.error('Failed to load any configuration file, using hardcoded defaults');
        this.activeLoader = this.createDefaultConfig();
      }
    }
  }

  /**
   * Create default configuration when no files are available
   */
  createDefaultConfig() {
    const defaultConfig = {
      logging: {
        level: 'info',
        format: 'json',
        output: 'stdout',
        structured: true
      },
      metrics: {
        enabled: true,
        sink: 'stdout',
        sampling_rate: 0.1
      },
      cache: {
        enabled: true,
        ttl_seconds: 3600,
        max_size_mb: 500,
        strategy: 'lru'
      },
      performance: {
        query_timeout_ms: 5000,
        max_concurrent_searches: 10,
        sqlite_cache_size: 2000,
        parallel_processing: true,
        memory_limit_mb: 1024
      },
      cli: {
        deterministic_output: true,
        color_output: 'auto',
        progress_bar: true,
        verbose_errors: false,
        interactive_mode: true
      },
      features: {
        learning: true,
        analytics: true,
        policy_optimization: true,
        experimental_features: false,
        debug_mode: false
      },
      indexer: {
        max_file_size_mb: 10,
        exclude_patterns: [
          'node_modules/**',
          '.git/**',
          'dist/**',
          'build/**',
          '*.min.js',
          '*.min.css'
        ],
        include_patterns: [
          '**/*.{js,ts,jsx,tsx,py,java,cpp,c,h,hpp,go,rs,php,rb,swift,kt,dart,scala,hs,ml,lua,elixir,sh,bash,zsh,fish}'
        ],
        follow_symlinks: false,
        respect_gitignore: true
      },
      storage: {
        type: 'sqlite',
        path: '.pampax',
        connection_pool_size: 10,
        backup_enabled: true,
        backup_interval_hours: 24
      }
    };

    return {
      getConfig: () => defaultConfig,
      getSection: (section) => defaultConfig[section] || null,
      getValue: (path, defaultValue = null) => {
        const keys = path.split('.');
        let current = defaultConfig;
        for (const key of keys) {
          if (current && typeof current === 'object' && key in current) {
            current = current[key];
          } else {
            return defaultValue;
          }
        }
        return current;
      },
      isFeatureEnabled: (feature) => defaultConfig.features?.[feature] || false,
      reload: () => false,
      getSummary: () => ({
        configPath: 'default',
        lastLoadTime: new Date().toISOString(),
        hotReloadEnabled: false,
        environmentOverrides: 0,
        sections: Object.keys(defaultConfig)
      }),
      getLoggingConfig: () => ({
        level: 'INFO',
        jsonOutput: false,
        logToFile: false,
        persistErrors: true,
        errorHistorySize: 100
      }),
      getMetricsConfig: () => ({
        enabled: true,
        sinks: [{ type: 'stdout' }],
        sampling: {
          'default': { rate: 1.0 },
          'search_latency_ms': { rate: 1.0 },
          'cache_operation': { rate: 0.1 },
          'high_frequency': { rate: 0.01 }
        }
      }),
      getFeatureFlags: () => ({
        learning: true,
        analytics: true,
        policyOptimization: true,
        cacheEnabled: true
      })
    };
  }

  /**
   * Get the full configuration object
   */
  getConfig() {
    return this.activeLoader.getConfig();
  }

  /**
   * Get a specific configuration section
   */
  getSection(section) {
    return this.activeLoader.getSection(section);
  }

  /**
   * Get a specific configuration value with dot notation
   */
  getValue(path, defaultValue = null) {
    return this.activeLoader.getValue(path, defaultValue);
  }

  /**
   * Check if a feature is enabled
   */
  isFeatureEnabled(feature) {
    return this.activeLoader.isFeatureEnabled(feature);
  }

  /**
   * Get logging configuration (backward compatibility)
   */
  getLoggingConfig() {
    const logging = this.getSection('logging');
    if (logging) {
      return {
        level: logging.level?.toUpperCase() || 'INFO',
        jsonOutput: logging.format === 'json',
        logToFile: logging.output === 'file',
        persistErrors: true,
        errorHistorySize: 100,
        structured: logging.structured,
        filePath: logging.file_path
      };
    }
    
    // Fallback to JSON loader format
    if (this.jsonLoader) {
      return this.jsonLoader.getLoggingConfig();
    }
    
    return {
      level: 'INFO',
      jsonOutput: false,
      logToFile: false,
      persistErrors: true,
      errorHistorySize: 100
    };
  }

  /**
   * Get metrics configuration (backward compatibility)
   */
  getMetricsConfig() {
    const metrics = this.getSection('metrics');
    if (metrics) {
      return {
        enabled: metrics.enabled,
        sinks: [{
          type: metrics.sink
        }],
        sampling: {
          'default': { rate: metrics.sampling_rate },
          'search_latency_ms': { rate: 1.0 },
          'cache_operation': { rate: 0.1 },
          'high_frequency': { rate: 0.01 }
        }
      };
    }
    
    // Fallback to JSON loader format
    if (this.jsonLoader) {
      return this.jsonLoader.getMetricsConfig();
    }
    
    return {
      enabled: true,
      sinks: [{ type: 'stdout' }],
      sampling: {
        'default': { rate: 1.0 },
        'search_latency_ms': { rate: 1.0 },
        'cache_operation': { rate: 0.1 },
        'high_frequency': { rate: 0.01 }
      }
    };
  }

  /**
   * Get feature flags (backward compatibility)
   */
  getFeatureFlags() {
    const features = this.getSection('features');
    if (features) {
      return {
        learning: features.learning,
        analytics: features.analytics,
        policyOptimization: features.policy_optimization,
        cacheEnabled: this.getSection('cache')?.enabled ?? true
      };
    }
    
    // Fallback to JSON loader format
    if (this.jsonLoader) {
      return this.jsonLoader.getFeatureFlags();
    }
    
    return {
      learning: true,
      analytics: true,
      policyOptimization: true,
      cacheEnabled: true
    };
  }

  /**
   * Reload configuration
   */
  reload() {
    try {
      this.load();
      return true;
    } catch (error) {
      console.error('Failed to reload configuration:', error.message);
      return false;
    }
  }

  /**
   * Enable hot reload (only for TOML configurations)
   */
  enableHotReload() {
    if (this.tomlLoader) {
      this.tomlLoader.enableHotReload();
      return true;
    }
    return false;
  }

  /**
   * Disable hot reload
   */
  disableHotReload() {
    if (this.tomlLoader) {
      this.tomlLoader.disableHotReload();
    }
  }

  /**
   * Register hot reload callback
   */
  onHotReload(callback) {
    if (this.tomlLoader) {
      this.tomlLoader.onHotReload(callback);
    }
  }

  /**
   * Get configuration summary
   */
  getSummary() {
    const baseSummary = this.activeLoader.getSummary();
    return {
      ...baseSummary,
      configType: this.tomlLoader ? 'toml' : 'json',
      preferToml: this.preferToml,
      hotReloadSupported: !!this.tomlLoader
    };
  }

  /**
   * Validate current configuration
   */
  validate() {
    if (this.tomlLoader) {
      return this.tomlLoader.validate();
    }
    return { valid: true, errors: [] }; // JSON loader doesn't have validation
  }

  /**
   * Export configuration as TOML (only if TOML loader is active)
   */
  exportAsToml() {
    if (this.tomlLoader) {
      return this.tomlLoader.exportAsToml();
    }
    return null;
  }

  /**
   * Cleanup resources
   */
  destroy() {
    if (this.tomlLoader) {
      this.tomlLoader.destroy();
    }
  }
}

// Create singleton instances for different use cases
export const tomlConfig = new UnifiedConfigLoader(null, true);
export const jsonConfig = new UnifiedConfigLoader(null, false);
export const config = UnifiedConfigLoader.getInstance();

export { UnifiedConfigLoader };