/**
 * Structured Logging System for PAMPAX
 * 
 * Provides structured JSON logging with correlation ID propagation,
 * component tagging, and configurable log levels.
 */

import { randomUUID } from 'crypto';
import { config } from '../config/config-loader.js';

// Log levels in order of severity
const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3
};

// Default log configuration
const DEFAULT_CONFIG = {
  level: 'INFO',
  jsonOutput: false,
  logToFile: false,
  persistErrors: true,
  errorHistorySize: 100
};

/**
 * Correlation Context Manager
 * Manages correlation ID propagation across async operations
 */
class CorrelationContext {
  constructor() {
    this.context = new Map();
    this.errorHistory = [];
  }

  /**
   * Set correlation ID for current context
   */
  setCorrelationId(corrId) {
    this.context.set('corr_id', corrId);
    return corrId;
  }

  /**
   * Get current correlation ID
   */
  getCorrelationId() {
    return this.context.get('corr_id') || this.generateCorrelationId();
  }

  /**
   * Generate a new correlation ID
   */
  generateCorrelationId() {
    const corrId = randomUUID();
    this.setCorrelationId(corrId);
    return corrId;
  }

  /**
   * Set context value
   */
  set(key, value) {
    this.context.set(key, value);
  }

  /**
   * Get context value
   */
  get(key) {
    return this.context.get(key);
  }

  /**
   * Get all context values
   */
  getAll() {
    return Object.fromEntries(this.context);
  }

  /**
   * Clear context
   */
  clear() {
    this.context.clear();
  }

  /**
   * Add error to history
   */
  addError(error) {
    if (this.errorHistory.length >= DEFAULT_CONFIG.errorHistorySize) {
      this.errorHistory.shift();
    }
    this.errorHistory.push({
      timestamp: Date.now(),
      error: error instanceof Error ? {
        message: error.message,
        stack: error.stack,
        name: error.name
      } : error
    });
  }

  /**
   * Get error history
   */
  getErrorHistory() {
    return [...this.errorHistory];
  }
}

/**
 * Structured Logger Implementation
 */
class StructuredLogger {
  constructor(component, options = {}) {
    this.component = component;
    // Start with defaults, then apply options, then apply config (with options having priority)
    this.options = { ...DEFAULT_CONFIG };
    this.correlationContext = new CorrelationContext();
    this.updateConfig();
    // Apply passed options last to override config defaults
    this.options = { ...this.options, ...options };
  }

  /**
   * Update logger configuration from config system
   */
  updateConfig() {
    const loggingConfig = config.getLoggingConfig();
    this.options = { ...this.options, ...loggingConfig };
  }

  /**
   * Check if log level should be emitted
   */
  shouldLog(level) {
    const currentLevel = LOG_LEVELS[this.options.level] !== undefined ? LOG_LEVELS[this.options.level] : LOG_LEVELS.INFO;
    const messageLevel = LOG_LEVELS[level] !== undefined ? LOG_LEVELS[level] : LOG_LEVELS.INFO;
    return messageLevel <= currentLevel;
  }

  /**
   * Create structured log entry
   */
  createLogEntry(level, operation, message, metadata = {}) {
    const timestamp = Date.now() / 1000; // Unix timestamp with decimal precision
    const corrId = this.correlationContext.getCorrelationId();
    
    const logEntry = {
      time: timestamp,
      level,
      component: this.component,
      op: operation,
      corr_id: corrId,
      msg: message,
      ...metadata
    };

    // Add duration if provided
    if (metadata.duration_ms !== undefined) {
      logEntry.duration_ms = metadata.duration_ms;
    }

    // Add status if provided
    if (metadata.status !== undefined) {
      logEntry.status = metadata.status;
    }

    return logEntry;
  }

  /**
   * Emit log entry
   */
  emit(logEntry, metadata = {}) {
    if (this.options.jsonOutput) {
      console.log(JSON.stringify(logEntry));
    } else {
      // Backward compatible console output
      const levelColor = {
        ERROR: '\x1b[31m', // red
        WARN: '\x1b[33m',  // yellow
        INFO: '\x1b[36m',  // cyan
        DEBUG: '\x1b[37m'  // white
      }[logEntry.level] || '';

      const reset = '\x1b[0m';
      const component = `[${logEntry.component}]`;
      const operation = logEntry.op ? `.${logEntry.op}` : '';
      const corrId = logEntry.corr_id ? ` [${logEntry.corr_id.substring(0, 8)}]` : '';
      const duration = logEntry.duration_ms ? ` (${logEntry.duration_ms}ms)` : '';
      
      console.log(
        `${levelColor}${logEntry.level}${reset} ${component}${operation}${corrId}: ${logEntry.msg}${duration}`
      );
    }

    // Persist errors if configured
    if (logEntry.level === 'ERROR' && this.options.persistErrors) {
      this.correlationContext.addError({
        level: logEntry.level,
        component: logEntry.component,
        operation: logEntry.op,
        message: logEntry.msg,
        metadata
      });
    }
  }

  /**
   * Log error message
   */
  error(operation, message, metadata = {}) {
    if (!this.shouldLog('ERROR')) return;
    
    const logEntry = this.createLogEntry('ERROR', operation, message, {
      status: 'error',
      ...metadata
    });
    
    this.emit(logEntry, metadata);
  }

  /**
   * Log warning message
   */
  warn(operation, message, metadata = {}) {
    if (!this.shouldLog('WARN')) return;
    
    const logEntry = this.createLogEntry('WARN', operation, message, {
      status: 'warning',
      ...metadata
    });
    
    this.emit(logEntry, metadata);
  }

  /**
   * Log info message
   */
  info(operation, message, metadata = {}) {
    if (!this.shouldLog('INFO')) return;
    
    const logEntry = this.createLogEntry('INFO', operation, message, {
      status: 'ok',
      ...metadata
    });
    
    this.emit(logEntry, metadata);
  }

  /**
   * Log debug message
   */
  debug(operation, message, metadata = {}) {
    if (!this.shouldLog('DEBUG')) return;
    
    const logEntry = this.createLogEntry('DEBUG', operation, message, {
      ...metadata
    });
    
    this.emit(logEntry, metadata);
  }

  /**
   * Log operation start
   */
  start(operation, message, metadata = {}) {
    this.info(operation, message, {
      ...metadata,
      event: 'start'
    });
  }

  /**
   * Log operation completion with duration
   */
  end(operation, message, startTime, metadata = {}) {
    const duration = Date.now() - startTime;
    this.info(operation, message, {
      ...metadata,
      event: 'end',
      duration_ms: duration
    });
  }

  /**
   * Log operation with automatic timing
   */
  timed(operation, message, metadata = {}) {
    const startTime = Date.now();
    this.start(operation, message, metadata);
    
    return {
      end: (endMessage, endMetadata = {}) => {
        this.end(operation, endMessage || message, startTime, {
          ...metadata,
          ...endMetadata
        });
      },
      startTime
    };
  }

  /**
   * Set correlation ID for current context
   */
  setCorrelationId(corrId) {
    return this.correlationContext.setCorrelationId(corrId);
  }

  /**
   * Get current correlation ID
   */
  getCorrelationId() {
    return this.correlationContext.getCorrelationId();
  }

  /**
   * Generate new correlation ID
   */
  generateCorrelationId() {
    return this.correlationContext.generateCorrelationId();
  }

  /**
   * Set context value
   */
  setContext(key, value) {
    this.correlationContext.set(key, value);
  }

  /**
   * Get context value
   */
  getContext(key) {
    return this.correlationContext.get(key);
  }

  /**
   * Get error history
   */
  getErrorHistory() {
    return this.correlationContext.getErrorHistory();
  }

  /**
   * Create child logger with inherited context
   */
  child(component, additionalContext = {}) {
    const childLogger = new StructuredLogger(component, this.options);
    
    // Copy correlation context
    const currentContext = this.correlationContext.getAll();
    Object.entries(currentContext).forEach(([key, value]) => {
      childLogger.correlationContext.set(key, value);
    });
    
    // Add additional context
    Object.entries(additionalContext).forEach(([key, value]) => {
      childLogger.correlationContext.set(key, value);
    });
    
    return childLogger;
  }

  /**
   * Wrap async function with correlation ID propagation
   */
  async withCorrelation(fn, corrId = null) {
    const originalCorrId = this.getCorrelationId();
    const newCorrId = corrId || this.generateCorrelationId();
    
    try {
      this.setCorrelationId(newCorrId);
      return await fn();
    } finally {
      this.setCorrelationId(originalCorrId);
    }
  }

  /**
   * Wrap function with automatic timing and error handling
   */
  wrap(operation, fn, options = {}) {
    return async (...args) => {
      const startTime = Date.now();
      const timed = this.timed(operation, options.startMessage || `Starting ${operation}`, {
        args: options.logArgs ? args.map(arg => typeof arg === 'object' ? '[Object]' : arg) : undefined
      });

      try {
        const result = await fn(...args);
        timed.end(options.endMessage || `Completed ${operation}`, {
          result: options.logResult ? typeof result === 'object' ? '[Object]' : result : undefined
        });
        return result;
      } catch (error) {
        this.error(operation, `Failed ${operation}: ${error.message}`, {
          error: error instanceof Error ? {
            message: error.message,
            stack: error.stack,
            name: error.name
          } : error,
          duration_ms: Date.now() - startTime
        });
        throw error;
      }
    };
  }
}

/**
 * Logger Factory
 */
class LoggerFactory {
  constructor() {
    this.loggers = new Map();
  }

  /**
   * Get or create logger for component
   */
  getLogger(component, options = {}) {
    if (!this.loggers.has(component)) {
      this.loggers.set(component, new StructuredLogger(component, options));
    }
    return this.loggers.get(component);
  }

  /**
   * Clear all loggers
   */
  clear() {
    this.loggers.clear();
  }

  /**
   * Update configuration for all loggers
   */
  updateAllConfigs() {
    this.loggers.forEach(logger => logger.updateConfig());
  }
}

// Global logger factory instance
const loggerFactory = new LoggerFactory();

/**
 * Get structured logger for component
 */
export function getLogger(component, options = {}) {
  return loggerFactory.getLogger(component, options);
}

/**
 * Update logging configuration globally
 */
export function updateLoggingConfig() {
  loggerFactory.updateAllConfigs();
}

/**
 * Create correlation context for async operations
 */
export async function withCorrelation(component, fn, corrId = null) {
  const logger = getLogger(component);
  return await logger.withCorrelation(fn, corrId);
}

/**
 * Generate correlation ID
 */
export function generateCorrelationId() {
  return randomUUID();
}

// Export classes for advanced usage
export { StructuredLogger, CorrelationContext, LoggerFactory };

// Export default logger factory
export default loggerFactory;