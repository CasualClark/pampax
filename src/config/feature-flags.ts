import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

export interface FeatureFlags {
  lsp: {
    python: boolean;
    dart: boolean;
  };
  treesitter: {
    enabled: boolean;
  };
  scip: {
    read: boolean;
  };
  vectors: {
    sqlite_vec: boolean;
    pgvector: boolean;
  };
  ui: {
    json: boolean;
    tty: boolean;
  };
}

class FeatureFlagManager {
  private config: FeatureFlags;
  private configPath: string;

  constructor(configPath?: string) {
    this.configPath = configPath || join(process.cwd(), 'config', 'feature-flags.json');
    this.config = this.loadConfig();
  }

  private loadConfig(): FeatureFlags {
    try {
      if (existsSync(this.configPath)) {
        const content = readFileSync(this.configPath, 'utf-8');
        return JSON.parse(content) as FeatureFlags;
      }
    } catch (error) {
      console.warn(`Failed to load feature flags from ${this.configPath}, using defaults`);
    }

    // Default configuration
    return {
      lsp: { python: true, dart: true },
      treesitter: { enabled: true },
      scip: { read: true },
      vectors: { sqlite_vec: true, pgvector: false },
      ui: { json: false, tty: true }
    };
  }

  get<K extends keyof FeatureFlags>(key: K): FeatureFlags[K] {
    return this.config[key];
  }

  isEnabled(feature: string): boolean {
    const keys = feature.split('.');
    let value: any = this.config;
    
    for (const key of keys) {
      if (value && typeof value === 'object' && key in value) {
        value = value[key];
      } else {
        return false;
      }
    }
    
    return Boolean(value);
  }

  reload(): void {
    this.config = this.loadConfig();
  }

  getAll(): FeatureFlags {
    return { ...this.config };
  }
}

export { FeatureFlagManager };
export const featureFlags = new FeatureFlagManager();