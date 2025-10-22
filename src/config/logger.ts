import { writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';

export type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: Record<string, any>;
  file?: string;
  duration?: number;
  trace?: string;
}

export interface LoggerConfig {
  level: LogLevel;
  jsonOutput: boolean;
  logToFile: boolean;
  logPath?: string;
  persistErrors: boolean;
  errorHistorySize: number;
}

class Logger {
  private config: LoggerConfig;
  private errorHistory: LogEntry[] = [];
  private errorHistoryPath: string;

  constructor(config: Partial<LoggerConfig> = {}) {
    this.config = {
      level: 'INFO',
      jsonOutput: false,
      logToFile: false,
      persistErrors: true,
      errorHistorySize: 100,
      ...config
    };
    
    this.errorHistoryPath = this.config.logPath 
      ? join(this.config.logPath, 'error-history.json')
      : join(process.cwd(), 'error-history.json');
    
    this.loadErrorHistory();
  }

  private loadErrorHistory(): void {
    if (this.config.persistErrors && existsSync(this.errorHistoryPath)) {
      try {
        const content = readFileSync(this.errorHistoryPath, 'utf-8');
        this.errorHistory = JSON.parse(content);
      } catch (error) {
        console.warn('Failed to load error history:', error);
      }
    }
  }

  private persistErrorHistory(): void {
    if (this.config.persistErrors && this.errorHistory.length > 0) {
      try {
        writeFileSync(this.errorHistoryPath, JSON.stringify(this.errorHistory, null, 2));
      } catch (error) {
        console.warn('Failed to persist error history:', error);
      }
    }
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: Record<LogLevel, number> = {
      DEBUG: 0,
      INFO: 1,
      WARN: 2,
      ERROR: 3
    };
    
    return levels[level] >= levels[this.config.level];
  }

  private formatLog(entry: LogEntry): string {
    if (this.config.jsonOutput) {
      return JSON.stringify(entry);
    }
    
    const parts = [
      `[${entry.timestamp}]`,
      entry.level,
      entry.message
    ];
    
    if (entry.file) {
      parts.push(`(${entry.file})`);
    }
    
    if (entry.duration) {
      parts.push(`[${entry.duration}ms]`);
    }
    
    let output = parts.join(' ');
    
    if (entry.context && Object.keys(entry.context).length > 0) {
      output += '\n' + JSON.stringify(entry.context, null, 2);
    }
    
    if (entry.trace) {
      output += '\n' + entry.trace;
    }
    
    return output;
  }

  private log(level: LogLevel, message: string, context?: Record<string, any>, file?: string, duration?: number, trace?: string): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context,
      file,
      duration,
      trace
    };

    const output = this.formatLog(entry);
    
    if (level === 'ERROR') {
      console.error(output);
      this.errorHistory.push(entry);
      
      // Trim error history if it exceeds the configured size
      if (this.errorHistory.length > this.config.errorHistorySize) {
        this.errorHistory = this.errorHistory.slice(-this.config.errorHistorySize);
      }
      
      this.persistErrorHistory();
    } else {
      console.log(output);
    }

    if (this.config.logToFile && this.config.logPath) {
      try {
        const logFile = join(this.config.logPath, 'pampax.log');
        writeFileSync(logFile, output + '\n', { flag: 'a' });
      } catch (error) {
        console.warn('Failed to write to log file:', error);
      }
    }
  }

  info(message: string, context?: Record<string, any>, file?: string): void {
    this.log('INFO', message, context, file);
  }

  warn(message: string, context?: Record<string, any>, file?: string): void {
    this.log('WARN', message, context, file);
  }

  error(message: string, context?: Record<string, any>, file?: string, trace?: string): void {
    this.log('ERROR', message, context, file, undefined, trace);
  }

  debug(message: string, context?: Record<string, any>, file?: string): void {
    this.log('DEBUG', message, context, file);
  }

  time<T>(operation: string, fn: () => T, context?: Record<string, any>, file?: string): T {
    const start = Date.now();
    try {
      const result = fn();
      const duration = Date.now() - start;
      this.info(`Completed ${operation}`, { ...context, duration }, file);
      return result;
    } catch (error) {
      const duration = Date.now() - start;
      this.error(`Failed ${operation}`, { ...context, duration, error: error instanceof Error ? error.message : String(error) }, file);
      throw error;
    }
  }

  async timeAsync<T>(operation: string, fn: () => Promise<T>, context?: Record<string, any>, file?: string): Promise<T> {
    const start = Date.now();
    try {
      const result = await fn();
      const duration = Date.now() - start;
      this.info(`Completed ${operation}`, { ...context, duration }, file);
      return result;
    } catch (error) {
      const duration = Date.now() - start;
      this.error(`Failed ${operation}`, { ...context, duration, error: error instanceof Error ? error.message : String(error) }, file);
      throw error;
    }
  }

  getErrorHistory(): LogEntry[] {
    return [...this.errorHistory];
  }

  clearErrorHistory(): void {
    this.errorHistory = [];
    this.persistErrorHistory();
  }

  setConfig(config: Partial<LoggerConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

export { Logger };
export const logger = new Logger();