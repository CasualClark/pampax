#!/usr/bin/env node

import fg from 'fast-glob';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { Database } from '../../storage/database-simple.js';
// Simple logger fallback
const logger = {
  error: (message, meta) => console.error(`ERROR: ${message}`, meta || ''),
  info: (message, meta) => console.log(`INFO: ${message}`, meta || ''),
  warn: (message, meta) => console.warn(`WARN: ${message}`, meta || ''),
  debug: (message, meta) => process.env.DEBUG && console.log(`DEBUG: ${message}`, meta || '')
};

// Simple feature flags fallback
const featureFlags = {
  isEnabled: (flag) => false // Default to disabled for CLI
};
import { createProgressRenderer } from '../progress/renderer.js';

/**
 * Event emitter for indexing progress
 */
class IndexProgressEmitter {
  constructor() {
    this.listeners = [];
  }

  on(event, listener) {
    this.listeners.push({ event, listener });
  }

  emit(event, data) {
    this.listeners
      .filter(l => l.event === event)
      .forEach(l => l.listener(data));
  }
}

/**
 * File discovery and filtering
 */
async function discoverFiles(options) {
  const repoPath = path.resolve(options.repo || '.');
  const include = options.include || [];
  const exclude = options.exclude || [];
  
  // Default patterns if none provided
  const patterns = include.length > 0 ? include : [
    '**/*.js',
    '**/*.ts', 
    '**/*.jsx',
    '**/*.tsx',
    '**/*.py',
    '**/*.dart',
    '**/*.php',
    '**/*.java',
    '**/*.go',
    '**/*.rs',
    '**/*.cpp',
    '**/*.c',
    '**/*.h',
    '**/*.cs',
    '**/*.rb',
    '**/*.swift',
    '**/*.kt',
    '**/*.scala',
    '**/*.html',
    '**/*.css',
    '**/*.json',
    '**/*.yaml',
    '**/*.yml',
    '**/*.md'
  ];

  const globOptions = {
    cwd: repoPath,
    ignore: [
      '**/node_modules/**',
      '**/.git/**',
      '**/dist/**',
      '**/build/**',
      '**/target/**',
      '**/.pampax/**',
      '**/coverage/**',
      '**/.next/**',
      '**/.nuxt/**',
      '**/.vscode/**',
      '**/.idea/**',
      ...exclude
    ],
    absolute: true
  };

  const files = await fg(patterns, globOptions);
  
  // Filter to existing files only
  const validFiles = files.filter(file => {
    try {
      return fs.statSync(file).isFile();
    } catch {
      return false;
    }
  });

  return validFiles;
}

/**
 * Index command implementation
 */
export async function indexCommand(options = {}) {
  const repoPath = path.resolve(options.repo || '.');
  const include = options.include || [];
  const exclude = options.exclude || [];
  const force = options.force || false;
  const json = options.json || false;
  const verbose = options.verbose || false;

  // Progress setup
  const isTTY = process.stdout.isTTY && !json;
  const progress = createProgressRenderer({ tty: isTTY, json });
  const emitter = new IndexProgressEmitter();

  try {
    // Initialize database
    const dbPath = options.db || path.join(repoPath, '.pampax/pampax.sqlite');
    const db = new Database(dbPath);

    // Ensure migrations are up to date
    await db.migrate();

    // Discover files
    progress.start('Discovering files...');
    const files = await discoverFiles({ repo: repoPath, include, exclude });
    progress.complete(`Found ${files.length} files`);

    if (files.length === 0) {
      progress.warn('No files found to index');
      return;
    }

    // Start indexing progress
    emitter.emit('start', { totalFiles: files.length });

    let processedFiles = 0;
    let totalSpans = 0;
    let totalChunks = 0;
    const errors = [];

    // Process files in batches to manage memory
    const batchSize = 50;
    for (let i = 0; i < files.length; i += batchSize) {
      const batch = files.slice(i, i + batchSize);
      
      for (const filePath of batch) {
        try {
          // Update progress
          const relativePath = path.relative(repoPath, filePath);
          progress.update(`Processing ${relativePath}... (${processedFiles + 1}/${files.length})`);
          emitter.emit('fileParsed', { path: relativePath });

          // Read file
          const content = fs.readFileSync(filePath, 'utf8');
          const stats = fs.statSync(filePath);
          
          // Store file record
          const contentHash = crypto
            .createHash('sha256')
            .update(content)
            .digest('hex');
          
          const lang = path.extname(filePath).slice(1) || 'unknown';
          
          await db.storeFile({
            repo: repoPath,
            path: relativePath,
            content: content,
            contentHash,
            lang,
            size: stats.size,
            modifiedTime: stats.mtime.getTime()
          });

          // TODO: Parse with adapters when available
          // For now, create basic chunks
          const chunks = createBasicChunks(content, relativePath, repoPath);
          
          // Store chunks
          for (const chunk of chunks) {
            await db.storeChunk(chunk);
            totalChunks++;
          }

          emitter.emit('chunksStored', { 
            path: relativePath, 
            count: chunks.length 
          });

          processedFiles++;

          if (verbose && processedFiles % 10 === 0) {
            progress.info(`Processed ${processedFiles}/${files.length} files, ${totalChunks} chunks`);
          }

        } catch (error) {
          const relativePath = path.relative(repoPath, filePath);
          errors.push({ path: relativePath, error: error.message });
          
          if (verbose) {
            progress.warn(`Error processing ${relativePath}: ${error.message}`);
          }
          
          emitter.emit('error', { path: relativePath, error: error.message });
        }
      }
    }

    // Complete indexing
    const duration = Date.now() - progress.startTime;
    emitter.emit('done', { durationMs: duration });

    // Final progress update
    progress.complete(`Indexed ${processedFiles} files, ${totalChunks} chunks`);
    
    if (errors.length > 0) {
      progress.warn(`${errors.length} files had errors`);
    }

    // Output results
    const result = {
      success: true,
      totalFiles: files.length,
      processedFiles,
      totalChunks,
      errors,
      durationMs: duration,
      databasePath: dbPath
    };

    if (json) {
      console.log(JSON.stringify(result, null, 2));
    } else if (verbose || errors.length > 0) {
      console.log('\nIndexing Summary:');
      console.log(`  Files processed: ${processedFiles}/${files.length}`);
      console.log(`  Chunks created: ${totalChunks}`);
      console.log(`  Duration: ${duration}ms`);
      console.log(`  Database: ${dbPath}`);
      
      if (errors.length > 0) {
        console.log(`\nErrors (${errors.length}):`);
        errors.slice(0, 5).forEach(err => {
          console.log(`  ${err.path}: ${err.error}`);
        });
        if (errors.length > 5) {
          console.log(`  ... and ${errors.length - 5} more`);
        }
      }
    }

  } catch (error) {
    logger.error('Indexing failed', { error: error.message, repoPath });
    
    progress.error(`Indexing failed: ${error.message}`);
    
    if (json) {
      console.log(JSON.stringify({
        success: false,
        error: error.message,
        repoPath
      }, null, 2));
    } else {
      console.error('❌ Indexing failed:', error.message);
    }
    process.exit(1);
  }
}

/**
 * Create basic chunks from file content (fallback when no adapters available)
 */
function createBasicChunks(content, filePath, repoPath) {
  const lines = content.split('\n');
  const chunks = [];
  const chunkSize = 50; // lines per chunk
  const overlap = 5; // overlapping lines

  for (let i = 0; i < lines.length; i += chunkSize - overlap) {
    const start = i;
    const end = Math.min(i + chunkSize, lines.length);
    const chunkLines = lines.slice(start, end);
    const chunkContent = chunkLines.join('\n');
    
      const chunk = {
        id: crypto
          .createHash('sha256')
          .update(`${filePath}:${start}-${end}:${chunkContent}`)
          .digest('hex'),
      spanId: `file:${filePath}`,
      repo: repoPath,
      path: filePath,
      content: chunkContent,
      metadata: {
        repo: repoPath,
        path: filePath,
        byteStart: content.indexOf(chunkContent),
        byteEnd: content.indexOf(chunkContent) + chunkContent.length,
        spanKind: 'module',
        spanName: path.basename(filePath),
        startLine: start + 1,
        endLine: end
      }
    };
    
    chunks.push(chunk);
  }

  return chunks;
}

export function configureIndexCommand(program) {
  program
    .command('index')
    .description('Index project files for search')
    .option('--repo <path>', 'Repository path', '.')
    .option('--include <patterns...>', 'File patterns to include')
    .option('--exclude <patterns...>', 'File patterns to exclude')
    .option('--db <path>', 'Database file path')
    .option('--force', 'Force re-indexing of all files')
    .option('--json', 'Output in JSON format')
    .option('--verbose', 'Verbose output')
    .action(indexCommand);
}