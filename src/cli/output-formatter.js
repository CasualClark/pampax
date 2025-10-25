#!/usr/bin/env node

/**
 * Deterministic Output Formatter for PAMPAX CLI
 * Provides consistent, machine-readable output with piped detection
 */

import { ExitCodes } from './exit-codes.js';

/**
 * Output format modes
 */
export const OutputModes = {
  INTERACTIVE: 'interactive',  // Default TTY mode with colors/decorations
  JSON: 'json',               // Stable JSON for programmatic use
  QUIET: 'quiet',             // Minimal output, only errors
  VERBOSE: 'verbose'          // Detailed debug information
};

/**
 * Detect if output is piped
 */
export function isPipedOutput() {
  return !process.stdout.isTTY;
}

/**
 * Detect appropriate output mode based on environment and options
 */
export function detectOutputMode(options = {}) {
  // Check verbosity flags first (they should override format default)
  if (options.quiet) {
    return OutputModes.QUIET;
  }
  
  if (options.verbose) {
    return OutputModes.VERBOSE;
  }

  // Auto-detect based on piped output
  if (isPipedOutput()) {
    return OutputModes.JSON;
  }

  // Explicit format option takes precedence over defaults
  if (options.format && options.format !== 'interactive') {
    switch (options.format.toLowerCase()) {
      case 'json':
        return OutputModes.JSON;
      case 'quiet':
        return OutputModes.QUIET;
      case 'verbose':
        return OutputModes.VERBOSE;
      case 'interactive':
      case 'text':
        return OutputModes.INTERACTIVE;
      default:
        console.warn(`Unknown format: ${options.format}, using interactive`);
        return OutputModes.INTERACTIVE;
    }
  }

  // Default to interactive for TTY
  return OutputModes.INTERACTIVE;
}

/**
 * Create stable JSON output with consistent key ordering
 */
export function createStableJSON(data, indent = 2) {
  // Helper function to sort object keys recursively
  function sortKeys(obj) {
    if (Array.isArray(obj)) {
      return obj.map(sortKeys);
    }
    
    if (obj !== null && typeof obj === 'object') {
      const sorted = {};
      // Define key priority order for consistency
      const keyOrder = [
        'success', 'status', 'error', 'message', 'timestamp', 'duration',
        'query', 'results', 'total', 'limit', 'offset', 'metadata',
        'path', 'file', 'line', 'symbol', 'language', 'score', 'sha'
      ];
      
      // Get all keys and sort by priority then alphabetically
      const keys = Object.keys(obj);
      const sortedKeys = keys.sort((a, b) => {
        const aIndex = keyOrder.indexOf(a);
        const bIndex = keyOrder.indexOf(b);
        
        // Both keys in priority list
        if (aIndex !== -1 && bIndex !== -1) {
          return aIndex - bIndex;
        }
        
        // Only one key in priority list
        if (aIndex !== -1) return -1;
        if (bIndex !== -1) return 1;
        
        // Neither in priority list, sort alphabetically
        return a.localeCompare(b);
      });
      
      for (const key of sortedKeys) {
        sorted[key] = sortKeys(obj[key]);
      }
      
      return sorted;
    }
    
    return obj;
  }
  
  const sortedData = sortKeys(data);
  return JSON.stringify(sortedData, null, indent);
}

/**
 * Output formatter class
 */
export class OutputFormatter {
  constructor(options = {}) {
    this.mode = detectOutputMode(options);
    this.options = options;
    this.useColors = this.mode === OutputModes.INTERACTIVE && process.stdout.isTTY;
  }

  /**
   * Format and output data based on current mode
   */
  async output(data, context = {}) {
    switch (this.mode) {
      case OutputModes.JSON:
        this.outputJSON(data, context);
        break;
      case OutputModes.QUIET:
        this.outputQuiet(data, context);
        break;
      case OutputModes.VERBOSE:
        this.outputVerbose(data, context);
        break;
      case OutputModes.INTERACTIVE:
      default:
        await this.outputInteractive(data, context);
        break;
    }
  }

  /**
   * Output stable JSON
   */
  outputJSON(data, context = {}) {
    const output = {
      ...data,
      _meta: {
        timestamp: new Date().toISOString(),
        mode: this.mode,
        version: context.version || null,
        command: context.command || null,
        duration: context.duration || null
      }
    };
    
    console.log(createStableJSON(output));
  }

  /**
   * Output minimal information (quiet mode)
   */
  outputQuiet(data, context = {}) {
    if (data.error || data.status === 'error') {
      console.error(data.error || data.message);
    } else if (data.results && Array.isArray(data.results)) {
      console.log(data.results.length); // Just the count
    } else if (data.success !== undefined) {
      // Silent success
    } else {
      console.log(data.message || 'Operation completed');
    }
  }

  /**
   * Output detailed information (verbose mode)
   */
  outputVerbose(data, context = {}) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] Command: ${context.command || 'unknown'}`);
    console.log(`[${timestamp}] Mode: ${this.mode}`);
    console.log(`[${timestamp}] Data:`, data);
    
    if (context.duration) {
      console.log(`[${timestamp}] Duration: ${context.duration}ms`);
    }
  }

  /**
   * Output interactive formatted text
   */
  async outputInteractive(data, context = {}) {
    // Use chalk for colors if available
    let chalk;
    try {
      chalk = await import('chalk');
    } catch {
      chalk = null;
    }

    if (data.error || data.status === 'error') {
      const errorMsg = data.error || data.message;
      if (chalk && this.useColors) {
        console.error(chalk.red('ERROR:'), errorMsg);
      } else {
        console.error('ERROR:', errorMsg);
      }
      return;
    }

    if (data.results && Array.isArray(data.results)) {
      this.outputResultsInteractive(data.results, chalk);
    } else if (data.message) {
      if (chalk && this.useColors) {
        console.log(chalk.green(data.message));
      } else {
        console.log(data.message);
      }
    } else {
      // Fallback to simple output
      console.log(JSON.stringify(data, null, 2));
    }
  }

  /**
   * Output search results in interactive format
   */
  outputResultsInteractive(results, chalk) {
    if (results.length === 0) {
      if (chalk && this.useColors) {
        console.log(chalk.yellow('No results found'));
      } else {
        console.log('No results found');
      }
      return;
    }

    console.log(`Found ${results.length} results:\n`);

    results.forEach((result, index) => {
      const prefix = `${index + 1}.`;
      const file = result.path || result.file;
      const symbol = result.meta?.symbol || result.symbol || 'unknown';
      const lang = result.lang || result.language || 'unknown';
      const score = result.meta?.score || result.score || 'N/A';
      const sha = result.sha || 'N/A';

      if (chalk && this.useColors) {
        console.log(chalk.cyan(prefix), chalk.white('FILE:'), chalk.green(file));
        console.log('   ', chalk.white('SYMBOL:'), chalk.yellow(symbol), chalk.gray(`(${lang})`));
        console.log('   ', chalk.white('SIMILARITY:'), chalk.magenta(score));
        console.log('   ', chalk.white('SHA:'), chalk.gray(sha));
      } else {
        console.log(`${prefix} FILE: ${file}`);
        console.log(`   SYMBOL: ${symbol} (${lang})`);
        console.log(`   SIMILARITY: ${score}`);
        console.log(`   SHA: ${sha}`);
      }
      console.log('');
    });
  }

  /**
   * Handle error output with appropriate exit code
   */
  async error(error, context = '') {
    const exitCode = ExitCodes.INTERNAL;
    const errorData = {
      success: false,
      error: error.message,
      context: context,
      timestamp: new Date().toISOString()
    };

    await this.output(errorData, { ...this.options, command: context });
    process.exit(exitCode);
  }

  /**
   * Handle success with optional exit code
   */
  async success(data = {}, context = '') {
    const successData = {
      success: true,
      ...data,
      timestamp: new Date().toISOString()
    };

    await this.output(successData, { ...this.options, command: context });
  }

  /**
   * Exit with specific code and optional message
   */
  exit(code = ExitCodes.SUCCESS, message = null) {
    if (message && code !== ExitCodes.SUCCESS) {
      console.error(message);
    }
    process.exit(code);
  }
}

/**
 * Create output formatter instance
 */
export function createOutputFormatter(options = {}) {
  return new OutputFormatter(options);
}

/**
 * Helper function for commands to handle output consistently
 */
export async function handleCommandOutput(result, options = {}, context = {}) {
  const formatter = createOutputFormatter(options);
  
  if (result instanceof Error) {
    return await formatter.error(result, context.command);
  }
  
  if (result.success === false || result.error) {
    return await formatter.error(new Error(result.error || 'Operation failed'), context.command);
  }
  
  return await formatter.success(result, context.command);
}