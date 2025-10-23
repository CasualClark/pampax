#!/usr/bin/env node

import path from 'path';
import { Database } from '../../storage/database-simple.js';
import { createProgressRenderer } from '../progress/renderer.js';

/**
 * Remember command - store memories with provenance
 */
export async function rememberCommand(options = {}) {
  const repoPath = path.resolve(options.repo || '.');
  const dbPath = options.db || path.join(repoPath, '.pampax/pampax.sqlite');
  const json = options.json || false;
  const verbose = options.verbose || false;

  // Progress setup
  const isTTY = process.stdout.isTTY && !json;
  const progress = createProgressRenderer({ tty: isTTY, json });

  try {
    // Initialize database
    const db = new Database(dbPath);
    await db.initialize();

    progress.start('Creating memory...');

    // Parse memory data
    const memoryData = {
      scope: options.scope || 'repo',
      repo: options.scope === 'repo' ? repoPath : undefined,
      branch: options.branch,
      kind: options.kind,
      key: options.key,
      value: options.value,
      weight: options.weight ? parseFloat(options.weight) : 1.0,
      expires_at: options.ttl ? parseTTL(options.ttl) : undefined,
      source_json: buildSourceJson(options)
    };

    // Validate required fields
    if (!memoryData.kind) {
      throw new Error('Memory kind is required (--kind)');
    }
    if (!memoryData.value) {
      throw new Error('Memory value is required (--value)');
    }

    // Store memory
    const memoryId = await db.memory.insert(memoryData);

    progress.complete(`Memory created: ${memoryId}`);

    // Output results
    const result = {
      success: true,
      memoryId,
      scope: memoryData.scope,
      kind: memoryData.kind,
      key: memoryData.key,
      databasePath: dbPath
    };

    if (json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(`✅ Memory stored successfully`);
      console.log(`   ID: ${memoryId}`);
      console.log(`   Scope: ${memoryData.scope}`);
      console.log(`   Kind: ${memoryData.kind}`);
      if (memoryData.key) {
        console.log(`   Key: ${memoryData.key}`);
      }
      if (verbose) {
        console.log(`   Database: ${dbPath}`);
        if (memoryData.expires_at) {
          const expiresDate = new Date(memoryData.expires_at);
          console.log(`   Expires: ${expiresDate.toISOString()}`);
        }
      }
    }

    await db.close();

  } catch (error) {
    console.error('❌ Remember command failed:', error.message);
    
    if (json) {
      console.log(JSON.stringify({
        success: false,
        error: error.message,
        databasePath: dbPath
      }, null, 2));
    }
    
    process.exit(1);
  }
}

/**
 * Recall command - search and retrieve memories
 */
export async function recallCommand(query, options = {}) {
  const repoPath = path.resolve(options.repo || '.');
  const dbPath = options.db || path.join(repoPath, '.pampax/pampax.sqlite');
  const json = options.json || false;
  const verbose = options.verbose || false;
  const limit = parseInt(options.limit || '10');

  // Progress setup
  const isTTY = process.stdout.isTTY && !json;
  const progress = createProgressRenderer({ tty: isTTY, json });

  try {
    // Initialize database
    const db = new Database(dbPath);
    await db.initialize();

    progress.start(`Searching memories for: "${query}"`);

    // Search memories
    const memories = await db.memory.search(query, {
      limit,
      scope: options.scope,
      repo: options.scope === 'repo' ? repoPath : undefined,
      kind: options.kind,
      includeExpired: false
    });

    progress.complete(`Found ${memories.length} memories`);

    // Output results
    if (json) {
      console.log(JSON.stringify({
        success: true,
        query,
        memories: memories.map(m => ({
          id: m.id,
          scope: m.scope,
          kind: m.kind,
          key: m.key,
          value: m.value,
          weight: m.weight,
          created_at: m.created_at,
          rank: m.rank
        })),
        totalResults: memories.length,
        databasePath: dbPath
      }, null, 2));
    } else {
      if (memories.length === 0) {
        console.log(`No memories found for: "${query}"`);
        return;
      }

      console.log(`\nFound ${memories.length} memories for: "${query}"\n`);

      memories.forEach((memory, index) => {
        console.log(`${index + 1}. ${memory.kind} (${memory.scope})`);
        if (memory.key) {
          console.log(`   Key: ${memory.key}`);
        }
        console.log(`   Weight: ${memory.weight}`);
        console.log(`   Rank: ${memory.rank?.toFixed(3) || 'N/A'}`);
        
        // Show value preview
        const preview = memory.value.substring(0, 200);
        console.log(`   Value: ${preview}${memory.value.length > 200 ? '...' : ''}`);
        
        if (verbose) {
          const createdDate = new Date(memory.created_at);
          console.log(`   Created: ${createdDate.toISOString()}`);
          console.log(`   ID: ${memory.id}`);
        }
        
        console.log('');
      });
    }

    await db.close();

  } catch (error) {
    console.error('❌ Recall command failed:', error.message);
    
    if (json) {
      console.log(JSON.stringify({
        success: false,
        error: error.message,
        query,
        databasePath: dbPath
      }, null, 2));
    }
    
    process.exit(1);
  }
}

/**
 * Forget command - delete memories
 */
export async function forgetCommand(options = {}) {
  const repoPath = path.resolve(options.repo || '.');
  const dbPath = options.db || path.join(repoPath, '.pampax/pampax.sqlite');
  const json = options.json || false;

  try {
    // Initialize database
    const db = new Database(dbPath);
    await db.initialize();

    let deletedCount = 0;

    if (options.id) {
      // Delete specific memory by ID
      const success = await db.memory.delete(options.id);
      deletedCount = success ? 1 : 0;
    } else if (options.expired) {
      // Delete expired memories
      deletedCount = await db.memory.deleteExpired();
    } else if (options.key) {
      // Delete memories by key
      const memories = await db.memory.findByKey(options.key, options.scope);
      for (const memory of memories) {
        await db.memory.delete(memory.id);
        deletedCount++;
      }
    } else {
      throw new Error('Must specify --id, --key, or --expired');
    }

    // Output results
    const result = {
      success: true,
      deletedCount,
      databasePath: dbPath
    };

    if (json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(`✅ Deleted ${deletedCount} memories`);
    }

    await db.close();

  } catch (error) {
    console.error('❌ Forget command failed:', error.message);
    
    if (json) {
      console.log(JSON.stringify({
        success: false,
        error: error.message,
        databasePath: dbPath
      }, null, 2));
    }
    
    process.exit(1);
  }
}

/**
 * Pin command - pin spans with labels (alias for memory with kind 'name-alias')
 */
export async function pinCommand(options = {}) {
  const repoPath = path.resolve(options.repo || '.');
  const dbPath = options.db || path.join(repoPath, '.pampax/pampax.sqlite');
  const json = options.json || false;

  try {
    // Validate required arguments
    if (!options.span) {
      throw new Error('Span ID is required (--span)');
    }
    if (!options.label) {
      throw new Error('Label is required (--label)');
    }

    // Initialize database
    const db = new Database(dbPath);
    await db.initialize();

    // Create pin memory
    const memoryData = {
      scope: options.scope || 'repo',
      repo: options.scope === 'repo' ? repoPath : undefined,
      kind: 'name-alias',
      key: options.label,
      value: `Pinned span: ${options.span}`,
      weight: 2.0, // Higher weight for pins
      source_json: JSON.stringify({
        type: 'pin',
        span_id: options.span,
        label: options.label,
        created_at: new Date().toISOString()
      })
    };

    const memoryId = await db.memory.insert(memoryData);

    // Output results
    const result = {
      success: true,
      memoryId,
      span: options.span,
      label: options.label,
      databasePath: dbPath
    };

    if (json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(`✅ Pinned span "${options.span}" with label "${options.label}"`);
      console.log(`   Memory ID: ${memoryId}`);
    }

    await db.close();

  } catch (error) {
    console.error('❌ Pin command failed:', error.message);
    
    if (json) {
      console.log(JSON.stringify({
        success: false,
        error: error.message,
        databasePath: dbPath
      }, null, 2));
    }
    
    process.exit(1);
  }
}

/**
 * Helper functions
 */
function parseTTL(ttlStr) {
  const match = ttlStr.match(/^(\d+)([dwmy])$/);
  if (!match) {
    throw new Error('Invalid TTL format. Use: {number}{d|w|m|y} (e.g., 30d, 2w, 6m, 1y)');
  }

  const [, amount, unit] = match;
  const now = Date.now();
  const multipliers = {
    d: 24 * 60 * 60 * 1000,      // days
    w: 7 * 24 * 60 * 60 * 1000,  // weeks
    m: 30 * 24 * 60 * 60 * 1000, // months (approximate)
    y: 365 * 24 * 60 * 60 * 1000 // years (approximate)
  };

  return now + (parseInt(amount) * multipliers[unit]);
}

function buildSourceJson(options) {
  const source = {
    created_at: new Date().toISOString(),
    command: 'remember'
  };

  if (options.fromBundle) {
    source.bundle_id = options.fromBundle;
  }

  if (options.fromSpan) {
    source.span_id = options.fromSpan;
  }

  if (options.fromFile) {
    source.file_path = options.fromFile;
  }

  return JSON.stringify(source);
}

/**
 * Configure CLI commands
 */
export function configureMemoryCommands(program) {
  // Remember command
  program
    .command('remember')
    .description('Store a memory with provenance')
    .option('--scope <scope>', 'Memory scope (repo, workspace, global)', 'repo')
    .option('--kind <kind>', 'Memory kind (fact, gotcha, decision, plan, rule, name-alias, insight, exemplar)')
    .option('--key <key>', 'Memory key for lookup')
    .option('--value <value>', 'Memory value (markdown content)')
    .option('--weight <weight>', 'Memory weight for ranking', '1.0')
    .option('--ttl <ttl>', 'Time to live (e.g., 30d, 2w, 6m, 1y)')
    .option('--from-bundle <id>', 'Create memory from bundle ID')
    .option('--from-span <id>', 'Create memory from span ID')
    .option('--from-file <path>', 'Create memory from file path')
    .option('--repo <path>', 'Repository path', '.')
    .option('--db <path>', 'Database file path')
    .option('--json', 'Output in JSON format')
    .option('--verbose', 'Verbose output')
    .action(rememberCommand);

  // Recall command
  program
    .command('recall <query>')
    .description('Search and retrieve memories')
    .option('--scope <scope>', 'Filter by scope (repo, workspace, global)')
    .option('--kind <kind>', 'Filter by memory kind')
    .option('--limit <num>', 'Maximum number of results', '10')
    .option('--repo <path>', 'Repository path', '.')
    .option('--db <path>', 'Database file path')
    .option('--json', 'Output in JSON format')
    .option('--verbose', 'Verbose output')
    .action(recallCommand);

  // Forget command
  program
    .command('forget')
    .description('Delete memories')
    .option('--id <id>', 'Delete specific memory by ID')
    .option('--key <key>', 'Delete memories by key')
    .option('--scope <scope>', 'Scope for key-based deletion (repo, workspace, global)')
    .option('--expired', 'Delete all expired memories')
    .option('--repo <path>', 'Repository path', '.')
    .option('--db <path>', 'Database file path')
    .option('--json', 'Output in JSON format')
    .action(forgetCommand);

  // Pin command
  program
    .command('pin')
    .description('Pin a span with a label (creates name-alias memory)')
    .requiredOption('--span <id>', 'Span ID to pin')
    .requiredOption('--label <label>', 'Label for the pin')
    .option('--scope <scope>', 'Memory scope (repo, workspace, global)', 'repo')
    .option('--repo <path>', 'Repository path', '.')
    .option('--db <path>', 'Database file path')
    .option('--json', 'Output in JSON format')
    .action(pinCommand);
}