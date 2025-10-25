/**
 * Cache Management CLI Commands for PAMPAX
 * 
 * Provides comprehensive cache management through CLI:
 * - pampax cache warm --scope search --query "test query"
 * - pampax cache clear --scope bundle --older-than 1h
 * - pampax cache status --format json
 * - pampax cache stats --detailed
 */

import { Command } from 'commander';
import { getCacheManager } from '../../cache/cache-manager.js';
import { Database } from '../../storage/database-simple.js';
import { ContextAssembler } from '../../context/assembler.js';
import { getLogger } from '../../utils/structured-logger.js';

const logger = getLogger('cache-cli');

/**
 * Parse time duration string to milliseconds
 */
function parseDuration(durationStr) {
  const match = durationStr.match(/^(\d+)([smhd])$/);
  if (!match) {
    throw new Error(`Invalid duration format: ${durationStr}. Use format like 1h, 30m, 2d`);
  }

  const [, amount, unit] = match;
  const multipliers = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000
  };

  return parseInt(amount, 10) * multipliers[unit];
}

/**
 * Format bytes to human readable string
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Format percentage
 */
function formatPercentage(value) {
  return (value * 100).toFixed(1) + '%';
}

/**
 * Warm cache command
 */
function warmCommand(dbPath) {
  return new Command('warm')
    .description('Warm cache with predefined queries or data')
    .option('-s, --scope <scope>', 'Cache namespace to warm (search|bundle|index|metadata)', 'search')
    .option('-q, --query <query>', 'Specific query to warm cache with')
    .option('-f, --file <file>', 'File containing queries to warm (one per line)')
    .option('-l, --limit <limit>', 'Number of recent queries to warm', '10')
    .option('--dry-run', 'Show what would be warmed without actually doing it')
    .action(async (options) => {
      try {
        console.log(`🔥 Warming cache for scope: ${options.scope}`);
        
        const cache = getCacheManager();
        const db = new Database(dbPath);
        await db.initialize();

        let queries = [];
        
        // Collect queries to warm
        if (options.query) {
          queries = [options.query];
        } else if (options.file) {
          const fs = await import('fs');
          const content = fs.readFileSync(options.file, 'utf8');
          queries = content.split('\n').filter(line => line.trim());
        } else {
          // Get recent queries from memory
          try {
            const recentInteractions = await db.memory.findRecentInteractions(parseInt(options.limit));
            queries = recentInteractions.map(interaction => interaction.query).filter(q => q);
          } catch (error) {
            console.warn('⚠️  Could not retrieve recent queries, using defaults');
            queries = [
              'function',
              'class',
              'import',
              'export',
              'async',
              'await',
              'error',
              'config',
              'test',
              'main'
            ];
          }
        }

        if (queries.length === 0) {
          console.log('ℹ️  No queries found to warm');
          return;
        }

        console.log(`📝 Found ${queries.length} queries to warm`);

        if (options.dryRun) {
          console.log('\n🔍 Queries that would be warmed:');
          queries.forEach((query, index) => {
            console.log(`  ${index + 1}. "${query}"`);
          });
          return;
        }

        // Warm cache based on scope
        let warmed = 0;
        const startTime = Date.now();

        if (options.scope === 'search') {
          for (const query of queries) {
            try {
              const key = cache.keyGenerator.generateSearchKey(query);
              const result = await cache.get('search', key, async () => {
                return await db.search(query, { limit: 10, includeContent: false });
              });
              
              if (result.fromCache === false) {
                warmed++;
              }
            } catch (error) {
              console.warn(`⚠️  Failed to warm query "${query}": ${error.message}`);
            }
          }
        } else if (options.scope === 'bundle') {
          const assembler = new ContextAssembler(db);
          
          for (const query of queries) {
            try {
              const bundleKey = `bundle_${cache.keyGenerator.hashPayload({ query })}`;
              const result = await cache.get('bundle', bundleKey, async () => {
                return await assembler.assembleWithExplanation(query, { limit: 5 });
              });
              
              if (result.fromCache === false) {
                warmed++;
              }
            } catch (error) {
              console.warn(`⚠️  Failed to warm bundle for query "${query}": ${error.message}`);
            }
          }
        } else {
          console.error(`❌ Cache warming not implemented for scope: ${options.scope}`);
          process.exit(1);
        }

        const duration = Date.now() - startTime;
        console.log(`\n✅ Cache warming completed`);
        console.log(`   Scope: ${options.scope}`);
        console.log(`   Total queries: ${queries.length}`);
        console.log(`   Entries warmed: ${warmed}`);
        console.log(`   Duration: ${duration}ms`);
        console.log(`   Average: ${Math.round(duration / queries.length)}ms per query`);

      } catch (error) {
        console.error('❌ Cache warming failed:', error.message);
        process.exit(1);
      }
    });
}

/**
 * Clear cache command
 */
function clearCommand(dbPath) {
  return new Command('clear')
    .description('Clear cache entries')
    .option('-s, --scope <scope>', 'Cache namespace to clear (search|bundle|index|metadata|all)', 'all')
    .option('--older-than <duration>', 'Clear entries older than duration (e.g., 1h, 30m, 2d)')
    .option('--expired-only', 'Clear only expired entries')
    .option('--dry-run', 'Show what would be cleared without actually doing it')
    .action(async (options) => {
      try {
        const cache = getCacheManager();
        
        if (options.dryRun) {
          console.log('🔍 Dry run mode - showing what would be cleared:');
        }

        let totalCleared = 0;

        if (options.scope === 'all') {
          if (options.olderThan) {
            const olderThan = parseDuration(options.olderThan);
            for (const namespace of ['search', 'bundle', 'index', 'metadata']) {
              const cleared = options.dryRun ? 0 : cache.invalidateOlderThan(namespace, olderThan);
              console.log(`   ${namespace}: ${cleared} entries would be cleared`);
              totalCleared += cleared;
            }
          } else if (options.expiredOnly) {
            for (const [namespace, cacheInstance] of cache.caches.entries()) {
              const expiredCount = cacheInstance.cleanupExpired();
              console.log(`   ${namespace}: ${expiredCount} expired entries found`);
              totalCleared += expiredCount;
            }
          } else {
            const cleared = options.dryRun ? 0 : cache.clearAll();
            console.log(`   All namespaces: ${cleared} entries would be cleared`);
            totalCleared = cleared;
          }
        } else {
          if (options.olderThan) {
            const olderThan = parseDuration(options.olderThan);
            const cleared = options.dryRun ? 0 : cache.invalidateOlderThan(options.scope, olderThan);
            console.log(`   ${options.scope}: ${cleared} entries would be cleared`);
            totalCleared = cleared;
          } else if (options.expiredOnly) {
            const cacheInstance = cache.getCache(options.scope);
            const expiredCount = cacheInstance.cleanupExpired();
            console.log(`   ${options.scope}: ${expiredCount} expired entries found`);
            totalCleared = expiredCount;
          } else {
            const cleared = options.dryRun ? 0 : cache.clear(options.scope);
            console.log(`   ${options.scope}: ${cleared} entries would be cleared`);
            totalCleared = cleared;
          }
        }

        if (!options.dryRun) {
          console.log(`\n✅ Cache clearing completed`);
          console.log(`   Total entries cleared: ${totalCleared}`);
        } else {
          console.log(`\n🔍 Total entries that would be cleared: ${totalCleared}`);
          console.log('   Run without --dry-run to actually clear');
        }

      } catch (error) {
        console.error('❌ Cache clearing failed:', error.message);
        process.exit(1);
      }
    });
}

/**
 * Status command
 */
function statusCommand() {
  return new Command('status')
    .description('Show cache status and health')
    .option('-f, --format <format>', 'Output format (table|json)', 'table')
    .option('--health-only', 'Show only health status')
    .action(async (options) => {
      try {
        const cache = getCacheManager();
        
        if (options.healthOnly) {
          const health = cache.getHealthStatus();
          
          if (options.format === 'json') {
            console.log(JSON.stringify(health, null, 2));
          } else {
            console.log('🏥 Cache Health Status');
            console.log('===================');
            console.log(`Status: ${health.healthy ? '✅ Healthy' : '⚠️  Issues detected'}`);
            
            if (health.issues.length > 0) {
              console.log('\n⚠️  Issues:');
              health.issues.forEach(issue => {
                console.log(`   - ${issue}`);
              });
            }
            
            console.log(`\nTimestamp: ${health.timestamp}`);
          }
          return;
        }

        const stats = cache.getStats();
        const health = cache.getHealthStatus();

        if (options.format === 'json') {
          console.log(JSON.stringify({ stats, health }, null, 2));
        } else {
          console.log('📊 Cache Status');
          console.log('===============');
          console.log(`Version: ${stats.version}`);
          console.log(`Global Hit Rate: ${formatPercentage(stats.summary.globalHitRate)}`);
          console.log(`Total Operations: ${stats.summary.totalOperations.toLocaleString()}`);
          console.log(`Total Memory Usage: ${formatBytes(stats.summary.totalMemoryUsage)}`);
          console.log(`Total Entries: ${stats.summary.totalEntries.toLocaleString()}`);
          console.log(`Health: ${health.healthy ? '✅ Healthy' : '⚠️  Issues detected'}`);
          
          if (health.issues.length > 0) {
            console.log('\n⚠️  Issues:');
            health.issues.forEach(issue => {
              console.log(`   - ${issue}`);
            });
          }

          console.log('\n📈 Namespace Statistics:');
          console.log('------------------------');
          
          for (const [namespace, nsStats] of Object.entries(stats.namespaces)) {
            console.log(`\n${namespace.toUpperCase()}:`);
            console.log(`   Entries: ${nsStats.currentSize.toLocaleString()} / ${nsStats.maxSize.toLocaleString()}`);
            console.log(`   Hit Rate: ${formatPercentage(nsStats.hitRate)}`);
            console.log(`   Operations: ${nsStats.totalOperations.toLocaleString()}`);
            console.log(`   Memory: ${formatBytes(nsStats.memoryUsage)}`);
            console.log(`   Evictions: ${nsStats.evictions.toLocaleString()}`);
            console.log(`   Expirations: ${nsStats.expirations.toLocaleString()}`);
          }
        }

      } catch (error) {
        console.error('❌ Status check failed:', error.message);
        process.exit(1);
      }
    });
}

/**
 * Stats command
 */
function statsCommand() {
  return new Command('stats')
    .description('Show detailed cache statistics')
    .option('-s, --scope <scope>', 'Show stats for specific namespace only')
    .option('-f, --format <format>', 'Output format (table|json)', 'table')
    .option('--reset', 'Reset statistics counters')
    .action(async (options) => {
      try {
        const cache = getCacheManager();
        
        if (options.reset) {
          // Reset stats by creating new cache manager
          const currentOptions = {
            version: cache.version,
            metricsEnabled: cache.metricsEnabled
          };
          cache.shutdown();
          const newCache = getCacheManager(currentOptions);
          
          console.log('✅ Cache statistics reset');
          return;
        }

        const stats = cache.getStats(options.scope);

        if (options.format === 'json') {
          console.log(JSON.stringify(stats, null, 2));
        } else {
          if (options.scope) {
            // Single namespace stats
            const nsStats = stats;
            console.log(`📈 ${nsStats.namespace.toUpperCase()} Statistics`);
            console.log('================================');
            console.log(`Current Size: ${nsStats.currentSize.toLocaleString()} / ${nsStats.maxSize.toLocaleString()}`);
            console.log(`Hit Rate: ${formatPercentage(nsStats.hitRate)}`);
            console.log(`Total Operations: ${nsStats.totalOperations.toLocaleString()}`);
            console.log(`  Hits: ${nsStats.hits.toLocaleString()}`);
            console.log(`  Misses: ${nsStats.misses.toLocaleString()}`);
            console.log(`Memory Usage: ${formatBytes(nsStats.memoryUsage)}`);
            console.log(`Evictions: ${nsStats.evictions.toLocaleString()}`);
            console.log(`Expirations: ${nsStats.expirations.toLocaleString()}`);
          } else {
            // All namespaces with detailed breakdown
            console.log('📈 Detailed Cache Statistics');
            console.log('============================');
            console.log(`Version: ${stats.version}`);
            console.log(`Timestamp: ${new Date().toISOString()}`);
            
            console.log('\n📊 Summary:');
            console.log(`   Global Hit Rate: ${formatPercentage(stats.summary.globalHitRate)}`);
            console.log(`   Total Operations: ${stats.summary.totalOperations.toLocaleString()}`);
            console.log(`   Total Hits: ${stats.summary.totalHits.toLocaleString()}`);
            console.log(`   Total Misses: ${stats.summary.totalMisses.toLocaleString()}`);
            console.log(`   Total Evictions: ${stats.summary.totalEvictions.toLocaleString()}`);
            console.log(`   Total Expirations: ${stats.summary.totalExpirations.toLocaleString()}`);
            console.log(`   Total Memory: ${formatBytes(stats.summary.totalMemoryUsage)}`);
            console.log(`   Total Entries: ${stats.summary.totalEntries.toLocaleString()}`);

            console.log('\n📋 Namespace Breakdown:');
            for (const [namespace, nsStats] of Object.entries(stats.namespaces)) {
              console.log(`\n   ${namespace.toUpperCase()}:`);
              console.log(`     Size: ${nsStats.currentSize.toLocaleString()}/${nsStats.maxSize.toLocaleString()} (${formatPercentage(nsStats.currentSize/nsStats.maxSize)})`);
              console.log(`     Hit Rate: ${formatPercentage(nsStats.hitRate)} (${nsStats.hits.toLocaleString()}/${nsStats.totalOperations.toLocaleString()})`);
              console.log(`     Memory: ${formatBytes(nsStats.memoryUsage)}`);
              console.log(`     Evictions: ${nsStats.evictions.toLocaleString()}`);
              console.log(`     Expirations: ${nsStats.expirations.toLocaleString()}`);
            }
          }
        }

      } catch (error) {
        console.error('❌ Statistics failed:', error.message);
        process.exit(1);
      }
    });
}

/**
 * Main cache command
 */
export default function cacheCommand(dbPath) {
  const cache = new Command('cache')
    .description('Cache management commands');

  cache.addCommand(warmCommand(dbPath));
  cache.addCommand(clearCommand(dbPath));
  cache.addCommand(statusCommand());
  cache.addCommand(statsCommand());

  return cache;
}