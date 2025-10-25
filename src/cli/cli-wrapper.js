#!/usr/bin/env node

/**
 * CLI Wrapper for Deterministic Output
 * Provides consistent command execution with proper exit codes and output formatting
 */

import { createOutputFormatter, handleCommandOutput } from './output-formatter.js';
import { ExitCodes, determineExitCode, handleError } from './exit-codes.js';

/**
 * Wrap a command function with deterministic output handling
 */
export function wrapCommand(commandFn, options = {}) {
  return async (...args) => {
    const startTime = Date.now();
    const commandOptions = args[args.length - 1] || {};
    const formatter = createOutputFormatter(commandOptions);
    
    try {
      // Execute the command
      const result = await commandFn(...args);
      
      // Calculate duration
      const duration = Date.now() - startTime;
      
      // Handle output based on result
      await handleCommandOutput(result, commandOptions, {
        command: options.commandName || 'unknown',
        duration
      });
      
      // Exit with appropriate code
      if (result.success === false || result.error) {
        process.exit(determineExitCode(result.error || new Error('Command failed')));
      }
      
      process.exit(ExitCodes.SUCCESS);
      
    } catch (error) {
      // Calculate duration for error case
      const duration = Date.now() - startTime;
      
      // Handle error with proper output formatting
      await formatter.error(error, options.commandName || 'unknown');
      
      // Exit with appropriate error code
      process.exit(determineExitCode(error));
    }
  };
}

/**
 * Create a command with deterministic output options
 */
export function createDeterministicCommand(command, options = {}) {
  // Add common output options
  command
    .option('--format <format>', 'Output format (json|interactive|quiet|verbose)', 'interactive')
    .option('--no-color', 'Disable colored output')
    .option('--quiet', 'Minimal output, only errors')
    .option('--verbose', 'Show detailed information');
  
  // Wrap the action handler
  const originalAction = command._args[0]?.action;
  if (originalAction) {
    command.action(wrapCommand(originalAction, {
      commandName: command.name(),
      ...options
    }));
  }
  
  return command;
}

/**
 * Middleware to add deterministic options to all commands
 */
export function addDeterministicOptions(program) {
  // Add global options
  program
    .option('--format <format>', 'Global output format (json|interactive|quiet|verbose)', 'interactive')
    .option('--no-color', 'Disable colored output globally')
    .option('--quiet', 'Global quiet mode')
    .option('--verbose', 'Global verbose mode')
    .option('--exit-code', 'Use structured exit codes (default: true)', true);
  
  return program;
}

/**
 * Handle process-level error handling
 */
export function setupGlobalErrorHandling() {
  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    const formatter = createOutputFormatter();
    formatter.error(error, 'uncaughtException');
    process.exit(determineExitCode(error));
  });
  
  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason, promise) => {
    const error = reason instanceof Error ? reason : new Error(String(reason));
    const formatter = createOutputFormatter();
    formatter.error(error, 'unhandledRejection');
    process.exit(determineExitCode(error));
  });
}

/**
 * Validate command options for deterministic behavior
 */
export function validateOptions(options, commandName = '') {
  const errors = [];
  
  // Validate format option
  if (options.format && !['json', 'interactive', 'quiet', 'verbose'].includes(options.format)) {
    errors.push(`Invalid format: ${options.format}. Valid formats: json, interactive, quiet, verbose`);
  }
  
  // Validate numeric options
  if (options.limit !== undefined) {
    const limit = parseInt(options.limit, 10);
    if (isNaN(limit) || limit < 0) {
      errors.push('Limit must be a non-negative integer');
    }
  }
  
  if (options.timeout !== undefined) {
    const timeout = parseInt(options.timeout, 10);
    if (isNaN(timeout) || timeout <= 0) {
      errors.push('Timeout must be a positive integer');
    }
  }
  
  if (errors.length > 0) {
    const error = new Error(`Invalid options for ${commandName}: ${errors.join(', ')}`);
    error.code = ExitCodes.CONFIG;
    throw error;
  }
  
  return options;
}

/**
 * Create standardized response object
 */
export function createResponse(success, data = {}, error = null) {
  const response = {
    success,
    timestamp: new Date().toISOString(),
    ...data
  };
  
  if (error) {
    response.error = error.message || String(error);
    response.errorCode = error.code || ExitCodes.INTERNAL;
  }
  
  return response;
}

/**
 * Success response helper
 */
export function success(data = {}) {
  return createResponse(true, data);
}

/**
 * Error response helper
 */
export function errorResponse(error, data = {}) {
  return createResponse(false, data, error);
}

/**
 * Pagination helper for consistent output
 */
export function paginateResults(results, options = {}) {
  const limit = parseInt(options.limit, 10) || 10;
  const offset = parseInt(options.offset, 10) || 0;
  
  const paginatedResults = results.slice(offset, offset + limit);
  
  return {
    results: paginatedResults,
    pagination: {
      total: results.length,
      limit,
      offset,
      hasMore: offset + limit < results.length,
      nextPage: offset + limit < results.length ? offset + limit : null,
      prevPage: offset > 0 ? Math.max(0, offset - limit) : null
    }
  };
}