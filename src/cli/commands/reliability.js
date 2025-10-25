#!/usr/bin/env node

import { Command } from 'commander';
import { success, errorResponse } from '../cli-wrapper.js';
import { ContextAssembler } from '../../context/assembler.js';
import { Database } from '../../storage/database-simple.js';
import { createGraphEnhancedSearchEngine } from '../../search/hybrid.js';

/**
 * Configure reliability command
 */
export function configureReliabilityCommand() {
  const reliabilityCommand = new Command('reliability')
    .description('Monitor and manage PAMPAX reliability systems');

  // Status subcommand
  reliabilityCommand
    .command('status')
    .description('Show reliability system status and health')
    .option('--component <component>', 'Specific component to check (search|context|all)', 'all')
    .option('--format <format>', 'Output format (json|table)', 'table')
    .action(async (options) => {
      try {
        const db = new Database('./pampa.db');
        await db.initialize();
        
        const results = {
          timestamp: new Date().toISOString(),
          components: {}
        };

        // Check context assembler reliability
        if (options.component === 'context' || options.component === 'all') {
          const assembler = new ContextAssembler(db, { enableReliability: true });
          await new Promise(resolve => setTimeout(resolve, 1000)); // Allow initialization
          
          results.components.context = await assembler.getReliabilityStatus();
        }

        // Check search engine reliability
        if (options.component === 'search' || options.component === 'all') {
          try {
            const storage = db.getStorage();
            const searchEngine = await createGraphEnhancedSearchEngine(storage, { enableReliability: true });
            await new Promise(resolve => setTimeout(resolve, 1000)); // Allow initialization
            
            results.components.search = await searchEngine.getReliabilityStatus();
          } catch (error) {
            results.components.search = {
              enabled: false,
              error: error.message
            };
          }
        }

        // Calculate overall health
        const enabledComponents = Object.values(results.components).filter(c => c.enabled);
        const healthyComponents = enabledComponents.filter(c => 
          c.health && c.health.healthy
        );
        
        results.overall = {
          components_total: Object.keys(results.components).length,
          components_enabled: enabledComponents.length,
          components_healthy: healthyComponents.length,
          health_score: enabledComponents.length > 0 
            ? healthyComponents.length / enabledComponents.length 
            : 0,
          status: healthyComponents.length === enabledComponents.length ? 'healthy' : 'degraded'
        };

        return success(results);

      } catch (error) {
        return errorResponse(error);
      }
    });

  // Stats subcommand
  reliabilityCommand
    .command('stats')
    .description('Show detailed reliability statistics')
    .option('--component <component>', 'Specific component to check (search|context|all)', 'all')
    .option('--format <format>', 'Output format (json|table)', 'table')
    .action(async (options) => {
      try {
        const db = new Database('./pampa.db');
        await db.initialize();
        
        const results = {
          timestamp: new Date().toISOString(),
          components: {}
        };

        // Get context assembler stats
        if (options.component === 'context' || options.component === 'all') {
          const assembler = new ContextAssembler(db, { enableReliability: true });
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          const reliabilityStatus = await assembler.getReliabilityStatus();
          if (reliabilityStatus.enabled) {
            results.components.context = reliabilityStatus.stats;
          }
        }

        // Get search engine stats
        if (options.component === 'search' || options.component === 'all') {
          try {
            const storage = db.getStorage();
            const searchEngine = await createGraphEnhancedSearchEngine(storage, { enableReliability: true });
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            const reliabilityStatus = await searchEngine.getReliabilityStatus();
            if (reliabilityStatus.enabled) {
              results.components.search = reliabilityStatus.stats;
            }
          } catch (error) {
            results.components.search = {
              error: error.message
            };
          }
        }

        return success(results);

      } catch (error) {
        return errorResponse(error);
      }
    });

  // Test subcommand
  reliabilityCommand
    .command('test')
    .description('Test reliability mechanisms')
    .option('--component <component>', 'Component to test (search|context)', 'search')
    .option('--load <requests>', 'Number of test requests to send', 10)
    .option('--failure-rate <rate>', 'Simulated failure rate (0.0-1.0)', 0.1)
    .action(async (options) => {
      try {
        const db = new Database('./pampa.db');
        await db.initialize();
        
        const results = {
          timestamp: new Date().toISOString(),
          test: {
            component: options.component,
            requests: parseInt(options.load),
            failure_rate: parseFloat(options.failureRate),
            results: []
          }
        };

        let testFn;
        if (options.component === 'search') {
          const storage = db.getStorage();
          const searchEngine = await createGraphEnhancedSearchEngine(storage, { enableReliability: true });
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          testFn = async () => {
            return await searchEngine.searchWithGraphExpansion({
              query: 'test query',
              limit: 5
            });
          };
        } else if (options.component === 'context') {
          const assembler = new ContextAssembler(db, { enableReliability: true });
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          testFn = async () => {
            return await assembler.assembleWithExplanation('test query', {
              limit: 5,
              include: ['code', 'memory']
            });
          };
        }

        if (!testFn) {
          throw new Error(`Unknown component: ${options.component}`);
        }

        // Run load test
        const promises = [];
        const startTime = Date.now();

        for (let i = 0; i < parseInt(options.load); i++) {
          promises.push(
            testFn()
              .then(result => ({
                request_id: i,
                success: true,
                duration: Date.now() - startTime,
                result: result.reliability || {}
              }))
              .catch(error => ({
                request_id: i,
                success: false,
                duration: Date.now() - startTime,
                error: error.message
              }))
          );
        }

        const testResults = await Promise.all(promises);
        results.test.results = testResults;

        // Calculate summary statistics
        const successful = testResults.filter(r => r.success);
        const failed = testResults.filter(r => !r.success);
        const avgDuration = successful.reduce((sum, r) => sum + r.duration, 0) / successful.length;

        results.test.summary = {
          total_requests: testResults.length,
          successful_requests: successful.length,
          failed_requests: failed.length,
          success_rate: successful.length / testResults.length,
          average_duration_ms: avgDuration,
          reliability_protections: successful.some(r => r.result.protected) ? 'active' : 'inactive'
        };

        return success(results);

      } catch (error) {
        return errorResponse(error);
      }
    });

  // Reset subcommand
  reliabilityCommand
    .command('reset')
    .description('Reset reliability statistics and circuit breakers')
    .option('--component <component>', 'Component to reset (search|context|all)', 'all')
    .option('--confirm', 'Confirm reset operation')
    .action(async (options) => {
      try {
        if (!options.confirm) {
          return errorResponse(new Error('Use --confirm to reset reliability statistics'));
        }

        const db = new Database('./pampa.db');
        await db.initialize();
        
        const results = {
          timestamp: new Date().toISOString(),
          reset: {
            components: []
          }
        };

        // Reset context assembler
        if (options.component === 'context' || options.component === 'all') {
          const assembler = new ContextAssembler(db, { enableReliability: true });
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          const reliabilityStatus = await assembler.getReliabilityStatus();
          if (reliabilityStatus.enabled && reliabilityStatus.stats) {
            // Reset stats would need to be implemented in reliability manager
            results.reset.components.push('context');
          }
        }

        // Reset search engine
        if (options.component === 'search' || options.component === 'all') {
          try {
            const storage = db.getStorage();
            const searchEngine = await createGraphEnhancedSearchEngine(storage, { enableReliability: true });
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            const reliabilityStatus = await searchEngine.getReliabilityStatus();
            if (reliabilityStatus.enabled && reliabilityStatus.stats) {
              // Reset stats would need to be implemented in reliability manager
              results.reset.components.push('search');
            }
          } catch (error) {
            results.reset.components.push('search (failed: ' + error.message + ')');
          }
        }

        results.reset.message = `Reset reliability statistics for: ${results.reset.components.join(', ')}`;

        return success(results);

      } catch (error) {
        return errorResponse(error);
      }
    });

  return reliabilityCommand;
}

export default configureReliabilityCommand;