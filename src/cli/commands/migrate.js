#!/usr/bin/env node

import { Database } from '../../storage/database-simple.js';
// Simple logger fallback
const logger = {
  error: (message, meta) => console.error(`ERROR: ${message}`, meta || ''),
  info: (message, meta) => console.log(`INFO: ${message}`, meta || ''),
  warn: (message, meta) => console.warn(`WARN: ${message}`, meta || ''),
  debug: (message, meta) => process.env.DEBUG && console.log(`DEBUG: ${message}`, meta || '')
};
// Simple feature flags fallback
const featureFlags = {
  isEnabled: (flag) => false // Default to disabled for CLI
};

/**
 * Database migration command
 */
export async function migrateCommand(options = {}) {
  const dbPath = options.db || '.pampax/pampax.sqlite';
  const rollback = options.rollback || false;
  const status = options.status || false;
  const json = options.json || false;

  try {
    const db = new Database(dbPath);

    if (status) {
      // Show migration status
      const currentVersion = await db.getCurrentVersion();
      const pendingMigrations = await db.getPendingMigrations();
      
      if (json) {
        console.log(JSON.stringify({
          currentVersion,
          pendingMigrations: pendingMigrations.length,
          databasePath: dbPath
        }, null, 2));
      } else {
        console.log(`Database: ${dbPath}`);
        console.log(`Current version: ${currentVersion}`);
        console.log(`Pending migrations: ${pendingMigrations.length}`);
        
        if (pendingMigrations.length > 0) {
          console.log('\nPending migrations:');
          pendingMigrations.forEach(mig => {
            console.log(`  - ${mig.version}: ${mig.name}`);
          });
        }
      }
      return;
    }

    if (rollback) {
      // Rollback last migration
      const result = await db.rollback();
      
      if (json) {
        console.log(JSON.stringify({
          success: true,
          rollback: result,
          message: `Rolled back to version ${result.version}`
        }, null, 2));
      } else {
        console.log(`✅ Rolled back to version ${result.version}`);
      }
      return;
    }

    // Run migrations
    const startTime = Date.now();
    const result = await db.migrate();
    const duration = Date.now() - startTime;

    if (json) {
      console.log(JSON.stringify({
        success: true,
        migrations: result,
        durationMs: duration,
        databasePath: dbPath
      }, null, 2));
    } else {
      console.log(`✅ Database migrated successfully`);
      console.log(`   Applied ${result.length} migrations`);
      console.log(`   Duration: ${duration}ms`);
      console.log(`   Database: ${dbPath}`);
    }

  } catch (error) {
    logger.error('Migration failed', { error: error.message, dbPath });
    
    if (json) {
      console.log(JSON.stringify({
        success: false,
        error: error.message,
        databasePath: dbPath
      }, null, 2));
    } else {
      console.error('❌ Migration failed:', error.message);
      if (error.code === 'SQLITE_BUSY') {
        console.error('   Database is locked. Please close other connections.');
      } else if (error.code === 'SQLITE_READONLY') {
        console.error('   Database is read-only. Check file permissions.');
      }
    }
    process.exit(1);
  }
}

export function configureMigrateCommand(program) {
  program
    .command('migrate')
    .description('Manage database migrations')
    .option('--db <path>', 'Database file path', '.pampax/pampax.sqlite')
    .option('--rollback', 'Rollback the last migration')
    .option('--status', 'Show migration status')
    .option('--json', 'Output in JSON format')
    .action(migrateCommand);
}