import { Command } from 'commander';
import { getHealthChecker, ExitCodes } from '../../health/health-checker.js';
import chalk from 'chalk';

/**
 * Health Check CLI Command
 */
const healthCommand = new Command('health');

healthCommand
  .description('Check PAMPAX system health and production readiness')
  .option('--components <components...>', 'Specific components to check (database, cache, memory, config)')
  .option('--format <format>', 'Output format (json|text)', 'json')
  .option('--timeout <ms>', 'Health check timeout in milliseconds', '30000')
  .option('--verbose', 'Show detailed health information', false)
  .option('--quiet', 'Only show errors', false)
  .option('--exit-code', 'Exit with appropriate code based on health status', true)
  .option('--no-exit-code', 'Do not exit with health-based code (always 0)')
  .action(async (options) => {
    try {
      // Parse timeout
      const timeoutMs = parseInt(options.timeout, 10);
      if (isNaN(timeoutMs) || timeoutMs <= 0) {
        console.error(chalk.red('Invalid timeout value. Must be a positive number.'));
        process.exit(ExitCodes.CONFIG);
      }

      // Validate components
      if (options.components) {
        const validComponents = ['database', 'cache', 'memory', 'config'];
        const invalidComponents = options.components.filter(c => !validComponents.includes(c));
        
        if (invalidComponents.length > 0) {
          console.error(chalk.red(`Invalid components: ${invalidComponents.join(', ')}`));
          console.error(chalk.yellow(`Valid components: ${validComponents.join(', ')}`));
          process.exit(ExitCodes.CONFIG);
        }
      }

      // Create health checker with options
      const healthChecker = getHealthChecker({
        logger: {
          level: options.quiet ? 'ERROR' : options.verbose ? 'DEBUG' : 'INFO',
          jsonOutput: options.format === 'json'
        },
        metrics: {
          enabled: true,
          sinks: [{ type: 'stdout' }]
        }
      });

      // Set up timeout
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Health check timeout after ${timeoutMs}ms`));
        }, timeoutMs);
      });

      // Run health check with timeout
      const healthPromise = healthChecker.checkAll(options.components);

      let results;
      try {
        results = await Promise.race([healthPromise, timeoutPromise]);
      } catch (error) {
        if (error.message.includes('timeout')) {
          const timeoutResult = {
            status: 'unhealthy',
            timestamp: new Date().toISOString(),
            error: `Health check timeout after ${timeoutMs}ms`,
            timeout_ms: timeoutMs,
            checks: {},
            summary: { total: 0, passed: 0, failed: 0, warnings: 0 }
          };

          if (options.format === 'json') {
            console.log(JSON.stringify(timeoutResult, null, 2));
          } else {
            console.error(chalk.red(`Health check timeout after ${timeoutMs}ms`));
          }

          if (options.exitCode !== false) {
            process.exit(ExitCodes.TIMEOUT);
          }
          return;
        }
        throw error;
      }

      // Output results
      if (options.format === 'json') {
        console.log(JSON.stringify(results, null, 2));
      } else {
        displayHealthResults(results, options);
      }

      // Exit with appropriate code
      if (options.exitCode !== false) {
        const exitCode = healthChecker.getExitCode(results);
        process.exit(exitCode);
      }

    } catch (error) {
      console.error(chalk.red(`Health check failed: ${error.message}`));
      
      if (options.format === 'json') {
        console.log(JSON.stringify({
          status: 'error',
          error: error.message,
          timestamp: new Date().toISOString()
        }, null, 2));
      }

      if (options.exitCode !== false) {
        process.exit(ExitCodes.INTERNAL);
      }
    }
  });

/**
 * Display health check results in human-readable format
 */
function displayHealthResults(results, options) {
  const { verbose, quiet } = options;

  if (quiet && results.status === 'healthy') {
    return; // Don't output anything if quiet and healthy
  }

  // Header
  const statusColor = results.status === 'healthy' ? chalk.green : 
                     results.status === 'degraded' ? chalk.yellow : 
                     chalk.red;
  
  console.log(`\n${chalk.bold('PAMPAX Health Check')} - ${statusColor(results.status.toUpperCase())}`);
  console.log(`Timestamp: ${results.timestamp}`);
  console.log(`Duration: ${results.duration_ms}ms`);
  if (verbose) {
    console.log(`Correlation ID: ${results.corr_id}`);
  }
  console.log('');

  // Summary
  if (!quiet) {
    console.log(chalk.bold('Summary:'));
    console.log(`  Total checks: ${results.summary.total}`);
    console.log(`  Passed: ${chalk.green(results.summary.passed)}`);
    if (results.summary.warnings > 0) {
      console.log(`  Warnings: ${chalk.yellow(results.summary.warnings)}`);
    }
    if (results.summary.failed > 0) {
      console.log(`  Failed: ${chalk.red(results.summary.failed)}`);
    }
    console.log('');
  }

  // Component details
  if (verbose || results.summary.failed > 0 || results.summary.warnings > 0) {
    console.log(chalk.bold('Component Details:'));
    
    Object.entries(results.checks).forEach(([component, check]) => {
      const statusIcon = check.status === 'ok' ? '✓' : 
                        check.status === 'warning' ? '⚠' : 
                        '✗';
      const statusColor = check.status === 'ok' ? chalk.green : 
                        check.status === 'warning' ? chalk.yellow : 
                        chalk.red;
      
      console.log(`  ${statusIcon} ${component}: ${statusColor(check.status.toUpperCase())} (${check.duration_ms}ms)`);
      
      // Show errors
      if (check.details.error) {
        console.log(`    ${chalk.red('Error:')} ${check.details.error}`);
      }

      // Show component-specific details
      if (verbose || check.status !== 'ok') {
        switch (component) {
          case 'database':
            if (check.details.connectivity !== undefined) {
              console.log(`    Connectivity: ${check.details.connectivity ? chalk.green('OK') : chalk.red('Failed')}`);
            }
            if (check.details.response_time_ms !== undefined) {
              console.log(`    Response time: ${check.details.response_time_ms}ms`);
            }
            if (check.details.integrity_check !== undefined) {
              const integrityColor = check.details.integrity_check === 'ok' ? chalk.green : chalk.red;
              console.log(`    Integrity: ${integrityColor(check.details.integrity_check)}`);
            }
            if (check.details.index_ready !== undefined) {
              console.log(`    Index ready: ${check.details.index_ready ? chalk.green('Yes') : chalk.red('No')}`);
            }
            if (check.details.file_count !== undefined) {
              console.log(`    Files indexed: ${check.details.file_count}`);
            }
            if (check.details.chunk_count !== undefined) {
              console.log(`    Chunks indexed: ${check.details.chunk_count}`);
            }
            break;

          case 'memory':
            if (check.details.used_mb !== undefined && check.details.limit_mb !== undefined) {
              const pressure = Math.round((check.details.used_mb / check.details.limit_mb) * 100);
              const pressureColor = pressure > 90 ? chalk.red : pressure > 70 ? chalk.yellow : chalk.green;
              console.log(`    Memory usage: ${check.details.used_mb}MB / ${check.details.limit_mb}MB (${pressureColor(pressure + '%')})`);
            }
            if (check.details.leak_detected !== undefined) {
              console.log(`    Leak detected: ${check.details.leak_detected ? chalk.red('Yes') : chalk.green('No')}`);
            }
            if (check.details.rss_mb !== undefined) {
              console.log(`    RSS memory: ${check.details.rss_mb}MB`);
            }
            if (check.details.external_mb !== undefined) {
              console.log(`    External memory: ${check.details.external_mb}MB`);
            }
            break;

          case 'cache':
            if (check.details.hit_rate !== undefined) {
              console.log(`    Hit rate: ${Math.round(check.details.hit_rate * 100)}%`);
            }
            if (check.details.size_mb !== undefined) {
              console.log(`    Size: ${check.details.size_mb}MB`);
            }
            if (check.details.ttl_valid !== undefined) {
              console.log(`    TTL valid: ${check.details.ttl_valid ? chalk.green('Yes') : chalk.red('No')}`);
            }
            if (check.details.status === 'disabled') {
              console.log(`    Status: ${chalk.yellow('Disabled')}`);
            }
            break;

          case 'config':
            if (check.details.valid !== undefined) {
              console.log(`    Valid: ${check.details.valid ? chalk.green('Yes') : chalk.red('No')}`);
            }
            if (check.details.source !== undefined) {
              console.log(`    Source: ${check.details.source}`);
            }
            if (check.details.config_type !== undefined) {
              console.log(`    Type: ${check.details.config_type}`);
            }
            if (check.details.last_load_time !== undefined) {
              console.log(`    Last loaded: ${check.details.last_load_time}`);
            }
            if (check.details.validation_errors && check.details.validation_errors.length > 0) {
              console.log(`    Validation errors:`);
              check.details.validation_errors.forEach(error => {
                console.log(`      - ${chalk.red(error.path)}: ${error.message}`);
              });
            }
            break;
        }
      }

      // Show metrics if verbose
      if (verbose && check.metrics && Object.keys(check.metrics).length > 0) {
        console.log(`    Metrics: ${JSON.stringify(check.metrics, null, 6)}`);
      }
    });
    
    console.log('');
  }

  // Exit code information
  if (verbose && options.exitCode !== false) {
    const healthChecker = getHealthChecker();
    const exitCode = healthChecker.getExitCode(results);
    const exitCodeNames = Object.entries(ExitCodes)
      .find(([_, code]) => code === exitCode)?.[0] || 'UNKNOWN';
    
    console.log(chalk.bold('Exit Information:'));
    console.log(`  Exit code: ${exitCode} (${exitCodeNames})`);
    console.log('');
  }

  // Recommendations
  if (results.status !== 'healthy') {
    console.log(chalk.bold('Recommendations:'));
    
    Object.entries(results.checks).forEach(([component, check]) => {
      if (check.status === 'error' || check.status === 'warning') {
        switch (component) {
          case 'database':
            if (check.details.error_code === 'DATABASE_NOT_FOUND') {
              console.log(`  • ${chalk.cyan('Database')}: Run ${chalk.yellow('pampax index')} to create the database`);
            } else if (check.details.integrity_check !== 'ok') {
              console.log(`  • ${chalk.cyan('Database')}: Check database integrity or rebuild index`);
            } else if (!check.details.index_ready) {
              console.log(`  • ${chalk.cyan('Database')}: Run ${chalk.yellow('pampax index')} to populate the index`);
            } else {
              console.log(`  • ${chalk.cyan('Database')}: Check database connectivity and permissions`);
            }
            break;

          case 'memory':
            if (check.details.leak_detected) {
              console.log(`  • ${chalk.cyan('Memory')}: Restart application to free memory`);
            } else {
              console.log(`  • ${chalk.cyan('Memory')}: Consider increasing memory limit or reducing workload`);
            }
            break;

          case 'config':
            console.log(`  • ${chalk.cyan('Config')}: Run ${chalk.yellow('pampax config --validate')} to fix configuration issues`);
            break;

          case 'cache':
            if (!check.details.ttl_valid) {
              console.log(`  • ${chalk.cyan('Cache')}: Fix cache TTL configuration`);
            } else {
              console.log(`  • ${chalk.cyan('Cache')}: Check cache system configuration`);
            }
            break;
        }
      }
    });
    
    console.log('');
  }
}

export default healthCommand;