#!/usr/bin/env node

import ora from 'ora';
import cliProgress from 'cli-progress';
import chalk from 'chalk';

/**
 * Progress renderer that adapts to TTY vs non-TTY environments
 */
export function createProgressRenderer(options = {}) {
  const { tty = true, json = false } = options;
  
  if (json) {
    return new JSONProgressRenderer();
  } else if (tty) {
    return new TTYProgressRenderer();
  } else {
    return new PlainProgressRenderer();
  }
}

/**
 * Base progress renderer class
 */
class BaseProgressRenderer {
  constructor() {
    this.startTime = Date.now();
  }

  start(message) {
    this.startTime = Date.now();
    this._start(message);
  }

  update(message) {
    this._update(message);
  }

  complete(message) {
    this._complete(message);
  }

  warn(message) {
    this._warn(message);
  }

  error(message) {
    this._error(message);
  }

  info(message) {
    this._info(message);
  }

  // Abstract methods to be implemented by subclasses
  _start(message) {}
  _update(message) {}
  _complete(message) {}
  _warn(message) {}
  _error(message) {}
  _info(message) {}
}

/**
 * TTY progress renderer with spinners and progress bars
 */
class TTYProgressRenderer extends BaseProgressRenderer {
  constructor() {
    super();
    this.spinner = ora();
    this.progressBar = null;
  }

  _start(message) {
    this.spinner.start(message);
  }

  _update(message) {
    this.spinner.text = message;
  }

  _complete(message) {
    this.spinner.succeed(message);
    this.spinner = ora();
  }

  _warn(message) {
    this.spinner.warn(chalk.yellow(message));
  }

  _error(message) {
    this.spinner.fail(chalk.red(message));
  }

  _info(message) {
    this.spinner.info(chalk.blue(message));
  }

  startProgressBar(total, options = {}) {
    this.progressBar = new cliProgress.SingleBar({
      format: options.format || '{bar} {percentage}% | {value}/{total} | {filename}',
      barCompleteChar: options.barCompleteChar || '█',
      barIncompleteChar: options.barIncompleteChar || '░',
      hideCursor: true
    }, cliProgress.Presets.shades_classic);

    this.progressBar.start(total, 0, { filename: '' });
  }

  updateProgressBar(current, metadata = {}) {
    if (this.progressBar) {
      this.progressBar.update(current, metadata);
    }
  }

  stopProgressBar() {
    if (this.progressBar) {
      this.progressBar.stop();
      this.progressBar = null;
    }
  }
}

/**
 * Plain text progress renderer for non-TTY environments
 */
class PlainProgressRenderer extends BaseProgressRenderer {
  _start(message) {
    console.log(`⏳ ${message}`);
  }

  _update(message) {
    console.log(`🔄 ${message}`);
  }

  _complete(message) {
    console.log(`✅ ${message}`);
  }

  _warn(message) {
    console.log(`⚠️  ${message}`);
  }

  _error(message) {
    console.log(`❌ ${message}`);
  }

  _info(message) {
    console.log(`ℹ️  ${message}`);
  }
}

/**
 * JSON progress renderer for machine-readable output
 */
class JSONProgressRenderer extends BaseProgressRenderer {
  constructor() {
    super();
    this.events = [];
  }

  logEvent(type, message, data = {}) {
    const event = {
      timestamp: new Date().toISOString(),
      type,
      message,
      ...data
    };

    this.events.push(event);
    console.log(JSON.stringify(event));
  }

  _start(message) {
    this.logEvent('start', message);
  }

  _update(message) {
    this.logEvent('update', message);
  }

  _complete(message) {
    this.logEvent('complete', message);
  }

  _warn(message) {
    this.logEvent('warn', message);
  }

  _error(message) {
    this.logEvent('error', message);
  }

  _info(message) {
    this.logEvent('info', message);
  }

  getEvents() {
    return this.events;
  }
}

/**
 * Progress event handler for indexing operations
 */
export function createIndexProgressHandler(renderer, options = {}) {
  const { showFileProgress = true, showETA = true } = options;
  let currentFile = 0;
  let totalFiles = 0;
  let progressBar = null;

  return {
    start: (data) => {
      totalFiles = data.totalFiles;
      renderer.start(`Starting to index ${totalFiles} files...`);
      
      if (showFileProgress && renderer.startProgressBar) {
        renderer.startProgressBar(totalFiles, {
          format: 'Indexing |{bar}| {percentage}% | {value}/{total} files | {filename}',
          filename: ''
        });
      }
    },

    fileParsed: (data) => {
      currentFile++;
      const filename = data.path;
      
      if (showFileProgress && renderer.updateProgressBar) {
        renderer.updateProgressBar(currentFile, { filename });
      }
      
      if (showETA && renderer.update) {
        const elapsed = Date.now() - renderer.startTime;
        const avgTimePerFile = elapsed / currentFile;
        const remainingFiles = totalFiles - currentFile;
        const etaMs = remainingFiles * avgTimePerFile;
        const etaSeconds = Math.round(etaMs / 1000);
        
        renderer.update(
          `Processing ${filename} (${currentFile}/${totalFiles}) - ETA: ${etaSeconds}s`
        );
      }
    },

    spansEmitted: (data) => {
      if (renderer.info) {
        renderer.info(`Found ${data.count} spans in ${data.path}`);
      }
    },

    chunksStored: (data) => {
      if (renderer.info) {
        renderer.info(`Stored ${data.count} chunks for ${data.path}`);
      }
    },

    embeddingsQueued: (data) => {
      if (renderer.info) {
        renderer.info(`Queued ${data.count} embeddings for ${data.path}`);
      }
    },

    done: (data) => {
      if (progressBar && renderer.stopProgressBar) {
        renderer.stopProgressBar();
      }
      
      const duration = data.durationMs;
      const durationSeconds = (duration / 1000).toFixed(2);
      renderer.complete(
        `Indexed ${totalFiles} files in ${durationSeconds}s`
      );
    },

    error: (data) => {
      if (renderer.warn) {
        renderer.warn(`Error processing ${data.path}: ${data.error}`);
      }
    }
  };
}