/**
 * Database migration for packing profiles
 */

import { Migration } from '../storage/database-async.js';

export const packingProfilesMigration: Migration = {
  version: 3,
  name: 'create_packing_profiles_table',
  up: async (db) => {
    // Create packing_profiles table
    await new Promise<void>((resolve, reject) => {
      db.run(`
        CREATE TABLE IF NOT EXISTS packing_profile (
          id TEXT PRIMARY KEY,
          repository TEXT NOT NULL,
          model TEXT NOT NULL,
          priorities TEXT NOT NULL,
          budget_allocation TEXT NOT NULL,
          capsule_strategies TEXT NOT NULL,
          truncation_strategies TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          ttl INTEGER,
          version INTEGER NOT NULL DEFAULT 1,
          metadata TEXT
        )
      `, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // Create indexes
    await new Promise<void>((resolve, reject) => {
      db.run('CREATE INDEX IF NOT EXISTS idx_packing_profile_repository ON packing_profile(repository)', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    await new Promise<void>((resolve, reject) => {
      db.run('CREATE INDEX IF NOT EXISTS idx_packing_profile_model ON packing_profile(model)', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    await new Promise<void>((resolve, reject) => {
      db.run('CREATE INDEX IF NOT EXISTS idx_packing_profile_repo_model ON packing_profile(repository, model)', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    await new Promise<void>((resolve, reject) => {
      db.run('CREATE INDEX IF NOT EXISTS idx_packing_profile_updated_at ON packing_profile(updated_at)', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    await new Promise<void>((resolve, reject) => {
      db.run('CREATE INDEX IF NOT EXISTS idx_packing_profile_ttl ON packing_profile(ttl)', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  },
  down: async (db) => {
    await new Promise<void>((resolve, reject) => {
      db.run('DROP TABLE IF EXISTS packing_profile', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
};