#!/usr/bin/env node

/**
 * Standardized exit codes for Pampax CLI
 * Provides deterministic behavior for script integration
 */
export const ExitCodes = {
  SUCCESS: 0,
  CONFIG: 2,      // Configuration errors
  IO: 3,         // File system I/O errors  
  NETWORK: 4,    // Network/external service errors
  TIMEOUT: 5,    // Operation timeout errors
  INTERNAL: 6    // Unexpected internal errors
};

/**
 * Exit code descriptions for error messages
 */
export const ExitCodeDescriptions = {
  [ExitCodes.SUCCESS]: 'Success',
  [ExitCodes.CONFIG]: 'Configuration error',
  [ExitCodes.IO]: 'File system I/O error',
  [ExitCodes.NETWORK]: 'Network/external service error',
  [ExitCodes.TIMEOUT]: 'Operation timeout error',
  [ExitCodes.INTERNAL]: 'Unexpected internal error'
};

/**
 * Determine appropriate exit code based on error type
 */
export function determineExitCode(error) {
  if (!error) return ExitCodes.SUCCESS;
  
  const message = error.message || error.toString().toLowerCase();
  
  // Configuration errors
  if (message.includes('config') || 
      message.includes('invalid') || 
      message.includes('missing') ||
      message.includes('required') ||
      message.includes('malformed') ||
      message.includes('permission denied')) {
    return ExitCodes.CONFIG;
  }
  
  // File system I/O errors
  if (message.includes('enoent') || 
      message.includes('eacces') || 
      message.includes('eisdir') ||
      message.includes('emfile') ||
      message.includes('enfile') ||
      message.includes('not found') ||
      message.includes('directory') ||
      message.includes('file') ||
      message.includes('read') ||
      message.includes('write')) {
    return ExitCodes.IO;
  }
  
  // Network errors
  if (message.includes('network') || 
      message.includes('timeout') || 
      message.includes('connection') ||
      message.includes('fetch') ||
      message.includes('request') ||
      message.includes('http') ||
      message.includes('ssl') ||
      message.includes('certificate') ||
      message.includes('dns') ||
      message.includes('host')) {
    return ExitCodes.NETWORK;
  }
  
  // Timeout errors
  if (message.includes('timeout') || 
      message.includes('timed out') || 
      message.includes('deadline')) {
    return ExitCodes.TIMEOUT;
  }
  
  // Default to internal error for unexpected issues
  return ExitCodes.INTERNAL;
}

/**
 * Exit process with appropriate code and optional message
 */
export function exitWithCode(code, message = null) {
  if (message && code !== ExitCodes.SUCCESS) {
    console.error(message);
  }
  process.exit(code);
}

/**
 * Handle error and exit with appropriate code
 */
export function handleError(error, context = '') {
  const exitCode = determineExitCode(error);
  const description = ExitCodeDescriptions[exitCode];
  
  if (context) {
    console.error(`Error in ${context}: ${error.message}`);
  } else {
    console.error(`${description}: ${error.message}`);
  }
  
  if (process.env.DEBUG) {
    console.error('\nStack trace:');
    console.error(error.stack);
  }
  
  process.exit(exitCode);
}