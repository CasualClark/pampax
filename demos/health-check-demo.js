#!/usr/bin/env node

/**
 * Demo script for PAMPAX Health Check System
 * 
 * This script demonstrates the health check functionality by:
 * 1. Running health checks in different formats
 * 2. Showing JSON and text output
 * 3. Testing specific component checks
 * 4. Demonstrating exit code behavior
 */

import { getHealthChecker, ExitCodes } from '../src/health/health-checker.js';
import chalk from 'chalk';

console.log(chalk.bold.blue('PAMPAX Health Check System Demo'));
console.log('=====================================\n');

async function runDemo() {
  const healthChecker = getHealthChecker();

  // Demo 1: Basic health check (JSON output)
  console.log(chalk.yellow('1. Basic Health Check (JSON output):'));
  console.log(chalk.gray('Running all component checks...\n'));
  
  try {
    const results = await healthChecker.checkAll();
    console.log(JSON.stringify(results, null, 2));
    console.log('\n' + '='.repeat(50) + '\n');
  } catch (error) {
    console.error(chalk.red('Health check failed:'), error.message);
  }

  // Demo 2: Component-specific checks
  console.log(chalk.yellow('2. Component-Specific Checks:'));
  
  const components = ['config', 'memory'];
  console.log(chalk.gray(`Checking specific components: ${components.join(', ')}\n`));
  
  try {
    const results = await healthChecker.checkAll(components);
    console.log(JSON.stringify(results, null, 2));
    console.log('\n' + '='.repeat(50) + '\n');
  } catch (error) {
    console.error(chalk.red('Component check failed:'), error.message);
  }

  // Demo 3: Human-readable output
  console.log(chalk.yellow('3. Human-Readable Output:'));
  console.log(chalk.gray('Displaying results in text format...\n'));
  
  try {
    const results = await healthChecker.checkAll();
    healthChecker.displayHumanReadable(results);
    console.log('\n' + '='.repeat(50) + '\n');
  } catch (error) {
    console.error(chalk.red('Display failed:'), error.message);
  }

  // Demo 4: Exit code determination
  console.log(chalk.yellow('4. Exit Code Determination:'));
  
  try {
    const results = await healthChecker.checkAll();
    const exitCode = healthChecker.getExitCode(results);
    const exitCodeNames = Object.entries(ExitCodes)
      .find(([_, code]) => code === exitCode)?.[0] || 'UNKNOWN';
    
    console.log(`Overall Status: ${results.status}`);
    console.log(`Exit Code: ${exitCode} (${exitCodeNames})`);
    console.log(`Summary: ${results.summary.passed} passed, ${results.summary.failed} failed, ${results.summary.warnings} warnings`);
    console.log('\n' + '='.repeat(50) + '\n');
  } catch (error) {
    console.error(chalk.red('Exit code determination failed:'), error.message);
  }

  // Demo 5: Custom component checker
  console.log(chalk.yellow('5. Custom Component Checker:'));
  console.log(chalk.gray('Adding a custom checker for demonstration...\n'));
  
  const customChecker = {
    name: 'demo',
    check: async () => {
      // Simulate some work
      await new Promise(resolve => setTimeout(resolve, 100));
      
      return {
        status: 'ok',
        details: {
          demo_feature: 'working',
          random_value: Math.random(),
          timestamp: new Date().toISOString()
        },
        metrics: {
          demo_operations: 42,
          demo_success_rate: 1.0
        }
      };
    },
    getMetrics: async () => ({
      demo_enabled: true,
      demo_version: '1.0.0'
    })
  };
  
  healthChecker.addChecker('demo', customChecker);
  
  try {
    const results = await healthChecker.checkAll(['demo']);
    console.log(JSON.stringify(results, null, 2));
    console.log('\n' + '='.repeat(50) + '\n');
  } catch (error) {
    console.error(chalk.red('Custom checker failed:'), error.message);
  }

  // Demo 6: Metrics integration
  console.log(chalk.yellow('6. Metrics Integration:'));
  console.log(chalk.gray('Showing health check metrics...\n'));
  
  try {
    const results = await healthChecker.checkAll(['memory', 'config']);
    
    console.log('Component Metrics:');
    Object.entries(results.checks).forEach(([component, check]) => {
      console.log(`\n${chalk.cyan(component)}:`);
      console.log(JSON.stringify(check.metrics, null, 4));
    });
    console.log('\n' + '='.repeat(50) + '\n');
  } catch (error) {
    console.error(chalk.red('Metrics demo failed:'), error.message);
  }

  // Demo 7: Error handling
  console.log(chalk.yellow('7. Error Handling:'));
  console.log(chalk.gray('Testing error handling with invalid component...\n'));
  
  try {
    const results = await healthChecker.checkAll(['nonexistent']);
    console.log('Results for nonexistent component:');
    console.log(JSON.stringify(results, null, 2));
  } catch (error) {
    console.error(chalk.red('Error handling test:'), error.message);
  }

  console.log(chalk.green('\n✅ Demo completed successfully!'));
  console.log(chalk.blue('\nTo use the health check CLI:'));
  console.log(chalk.gray('  node src/cli.js health                    # Basic health check'));
  console.log(chalk.gray('  node src/cli.js health --format text      # Human-readable output'));
  console.log(chalk.gray('  node src/cli.js health --components memory config  # Specific components'));
  console.log(chalk.gray('  node src/cli.js health --verbose           # Detailed output'));
  console.log(chalk.gray('  node src/cli.js health --quiet             # Only show errors'));
  console.log(chalk.gray('  node src/cli.js health --timeout 5000     # Custom timeout'));
}

// Run the demo
runDemo().catch(error => {
  console.error(chalk.red('Demo failed:'), error);
  process.exit(1);
});