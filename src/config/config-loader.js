import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

/**
 * Simple Config Loader for JavaScript modules
 */
class ConfigLoader {
  constructor(configPath) {
    this.configPath = configPath || this.findConfigFile();
    this.config = this.loadConfig();
  }

  static getInstance(configPath) {
    if (!ConfigLoader.instance) {
      ConfigLoader.instance = new ConfigLoader(configPath);
    }
    return ConfigLoader.instance;
  }

  findConfigFile() {
    const possiblePaths = [
      join(process.cwd(), 'pampax.config.json'),
      join(process.cwd(), '.pampaxrc.json'),
      join(process.cwd(), 'config', 'pampax.json')
    ];

    for (const path of possiblePaths) {
      if (existsSync(path)) {
        return path;
      }
    }

    // Return default path
    return possiblePaths[0];
  }

  loadConfig() {
    const defaultConfig = {
      featureFlags: {
        learning: true,
        analytics: true,
        policyOptimization: true,
        cacheEnabled: true
      },
      logging: {
        level: 'INFO',
        jsonOutput: false,
        logToFile: false,
        persistErrors: true,
        errorHistorySize: 100
      },
      metrics: {
        enabled: true,
        sinks: [
          {
            type: 'stdout'
          }
        ],
        sampling: {
          'default': { rate: 1.0 },
          'search_latency_ms': { rate: 1.0 },
          'cache_operation': { rate: 0.1 },
          'high_frequency': { rate: 0.01 }
        }
      },
      indexer: {
        maxFileSize: 10 * 1024 * 1024, // 10MB
        excludePatterns: [
          'node_modules/**',
          '.git/**',
          'dist/**',
          'build/**',
          '*.min.js',
          '*.min.css'
        ],
        includePatterns: ['**/*.{js,ts,py,java,cpp,c,h,go,rs,php,rb,swift,kt,dart}']
      },
      storage: {
        path: join(process.cwd(), '.pampax'),
        type: 'sqlite'
      }
    };

    try {
      if (existsSync(this.configPath)) {
        const fileContent = readFileSync(this.configPath, 'utf-8');
        const userConfig = JSON.parse(fileContent);
        
        // Deep merge with defaults
        return this.mergeConfig(defaultConfig, userConfig);
      }
    } catch (error) {
      console.warn(`Failed to load config from ${this.configPath}, using defaults`, { error });
    }

    return defaultConfig;
  }

  mergeConfig(defaults, user) {
    return {
      featureFlags: { ...defaults.featureFlags, ...user.featureFlags },
      logging: { ...defaults.logging, ...user.logging },
      metrics: { ...defaults.metrics, ...user.metrics },
      repo: user.repo || defaults.repo,
      indexer: { ...defaults.indexer, ...user.indexer },
      storage: { ...defaults.storage, ...user.storage }
    };
  }

  getConfig() {
    return { ...this.config };
  }

  updateConfig(updates) {
    this.config = this.mergeConfig(this.config, updates);
  }

  reload() {
    this.config = this.loadConfig();
  }

  getFeatureFlags() {
    return this.config.featureFlags;
  }

  getLoggingConfig() {
    return this.config.logging;
  }

  getMetricsConfig() {
    return this.config.metrics;
  }

  isFeatureEnabled(feature) {
    const keys = feature.split('.');
    let value = this.config.featureFlags;
    
    for (const key of keys) {
      if (value && typeof value === 'object' && key in value) {
        value = value[key];
      } else {
        return false;
      }
    }
    
    return Boolean(value);
  }
}

export const config = ConfigLoader.getInstance();
export { ConfigLoader };