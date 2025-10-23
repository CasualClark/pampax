import { featureFlags, type FeatureFlags } from './feature-flags.js';
import { logger, type LoggerConfig } from './logger.js';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import type { IntentClassifierConfig } from '../intent/intent-classifier.js';
import type { PolicyConfig } from '../policy/policy-gate.js';

export interface PampaxConfig {
  featureFlags: FeatureFlags;
  logging: LoggerConfig;
  repo?: {
    root?: string;
    name?: string;
  };
  indexer?: {
    maxFileSize?: number;
    excludePatterns?: string[];
    includePatterns?: string[];
  };
  storage?: {
    path?: string;
    type?: 'sqlite' | 'postgres';
  };
  intent?: IntentClassifierConfig;
  policy?: PolicyConfig;
}

export class ConfigLoader {
  private static instance: ConfigLoader;
  private config: PampaxConfig;
  private configPath: string;

  private constructor(configPath?: string) {
    this.configPath = configPath || this.findConfigFile();
    this.config = this.loadConfig();
  }

  static getInstance(configPath?: string): ConfigLoader {
    if (!ConfigLoader.instance) {
      ConfigLoader.instance = new ConfigLoader(configPath);
    }
    return ConfigLoader.instance;
  }

  private findConfigFile(): string {
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

  private loadConfig(): PampaxConfig {
    const defaultConfig: PampaxConfig = {
      featureFlags: featureFlags.getAll(),
      logging: {
        level: 'INFO',
        jsonOutput: false,
        logToFile: false,
        persistErrors: true,
        errorHistorySize: 100
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
      logger.warn(`Failed to load config from ${this.configPath}, using defaults`, { error });
    }

    return defaultConfig;
  }

  private mergeConfig(defaults: PampaxConfig, user: Partial<PampaxConfig>): PampaxConfig {
    return {
      featureFlags: { ...defaults.featureFlags, ...user.featureFlags },
      logging: { ...defaults.logging, ...user.logging },
      repo: user.repo || defaults.repo,
      indexer: { ...defaults.indexer, ...user.indexer },
      storage: { ...defaults.storage, ...user.storage }
    };
  }

  getConfig(): PampaxConfig {
    return { ...this.config };
  }

  updateConfig(updates: Partial<PampaxConfig>): void {
    this.config = this.mergeConfig(this.config, updates);
    
    // Update feature flags and logger with new config
    if (updates.featureFlags) {
      // Note: FeatureFlagManager doesn't have a direct update method
      // In a real implementation, we'd add that capability
    }
    
    if (updates.logging) {
      logger.setConfig(updates.logging);
    }
  }

  reload(): void {
    this.config = this.loadConfig();
    logger.setConfig(this.config.logging);
  }

  getFeatureFlags(): FeatureFlags {
    return this.config.featureFlags;
  }

  getLoggingConfig(): LoggerConfig {
    return this.config.logging;
  }

  isFeatureEnabled(feature: string): boolean {
    const keys = feature.split('.');
    let value: any = this.config.featureFlags;
    
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