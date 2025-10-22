#!/usr/bin/env node

import { config } from '../config/config-loader.js';
import { logger } from '../config/logger.js';
import { featureFlags } from '../config/feature-flags.js';

export function bootstrapCli(): void {
  try {
    // Load configuration
    const appConfig = config.getConfig();
    
    // Configure logger
    logger.setConfig(appConfig.logging);
    
    logger.info('PAMPAX CLI bootstrapped', {
      version: process.env.npm_package_version || '1.15.1-oak.2',
      nodeVersion: process.version,
      configPath: config['configPath']
    });

    // Log feature flags status
    const featureStatus = {
      'lsp.python': featureFlags.isEnabled('lsp.python'),
      'lsp.dart': featureFlags.isEnabled('lsp.dart'),
      'treesitter.enabled': featureFlags.isEnabled('treesitter.enabled'),
      'scip.read': featureFlags.isEnabled('scip.read'),
      'vectors.sqlite_vec': featureFlags.isEnabled('vectors.sqlite_vec'),
      'ui.tty': featureFlags.isEnabled('ui.tty')
    };

    logger.debug('Feature flags status', featureStatus);

    // Validate critical configuration
    if (!appConfig.storage?.path) {
      throw new Error('Storage path not configured');
    }

    logger.info('CLI ready', {
      storagePath: appConfig.storage.path,
      storageType: appConfig.storage?.type,
      logLevel: appConfig.logging.level
    });

  } catch (error) {
    logger.error('Failed to bootstrap CLI', { 
      error: error instanceof Error ? error.message : String(error) 
    });
    process.exit(1);
  }
}

// Auto-bootstrap if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  bootstrapCli();
}