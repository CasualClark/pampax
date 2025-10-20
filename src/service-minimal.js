/**
 * PAMPA Core Service - Minimal Version
 * 
 * This module contains the core business logic for PAMPA
 * separated from presentation concerns (logging, console output).
 * Functions are agnostic and return structured data.
 * 
 * This version gracefully handles missing native dependencies.
 */

import crypto from 'crypto';
import fg from 'fast-glob';
import fs from 'fs';
import path from 'path';
import { createEmbeddingProvider, getModelProfile, countChunkSize, getSizeLimits } from './providers.js';

// Try to import native dependencies, but provide fallbacks
let sqlite3;
let Parser;
let languageParsers = {};

try {
  sqlite3 = await import('sqlite3');
  console.log('✅ SQLite3 loaded');
} catch (error) {
  console.warn('⚠️  SQLite3 not available, using memory storage');
  sqlite3 = null;
}

try {
  Parser = (await import('tree-sitter')).default;
  console.log('✅ Tree-sitter loaded');
  
  // Try to load language parsers
  const languageModules = [
    { name: 'bash', module: 'tree-sitter-bash' },
    { name: 'c', module: 'tree-sitter-c' },
    { name: 'c_sharp', module: 'tree-sitter-c-sharp' },
    { name: 'cpp', module: 'tree-sitter-cpp' },
    { name: 'css', module: 'tree-sitter-css' },
    { name: 'dart', module: 'tree-sitter-dart' },
    { name: 'elixir', module: 'tree-sitter-elixir' },
    { name: 'go', module: 'tree-sitter-go' },
    { name: 'haskell', module: 'tree-sitter-haskell' },
    { name: 'html', module: 'tree-sitter-html' },
    { name: 'java', module: 'tree-sitter-java' },
    { name: 'javascript', module: 'tree-sitter-javascript' },
    { name: 'json', module: 'tree-sitter-json' },
    { name: 'kotlin', module: '@tree-sitter-grammars/tree-sitter-kotlin' },
    { name: 'lua', module: 'tree-sitter-lua' },
    { name: 'ocaml', module: 'tree-sitter-ocaml' },
    { name: 'php', module: 'tree-sitter-php' },
    { name: 'python', module: 'tree-sitter-python' },
    { name: 'ruby', module: 'tree-sitter-ruby' },
    { name: 'rust', module: 'tree-sitter-rust' },
    { name: 'scala', module: 'tree-sitter-scala' },
    { name: 'swift', module: 'tree-sitter-swift' },
    { name: 'typescript', module: 'tree-sitter-typescript/bindings/node/typescript.js' },
    { name: 'tsx', module: 'tree-sitter-typescript/bindings/node/tsx.js' }
  ];

  for (const lang of languageModules) {
    try {
      languageParsers[lang.name] = (await import(lang.module)).default;
      console.log(`✅ Loaded ${lang.name} parser`);
    } catch (error) {
      console.warn(`⚠️  Could not load ${lang.name} parser`);
    }
  }
} catch (error) {
  console.warn('⚠️  Tree-sitter not available, symbol extraction will be limited');
  Parser = null;
}

// In-memory storage fallback
let memoryStorage = {
  chunks: [],
  embeddings: [],
  metadata: {}
};

// Database wrapper that works with or without sqlite3
class DatabaseWrapper {
  constructor(dbPath) {
    this.dbPath = dbPath;
    this.db = null;
    this.isMemory = !sqlite3;
    
    if (!this.isMemory) {
      try {
        this.db = new sqlite3.Database(dbPath);
        console.log('✅ Using SQLite database');
      } catch (error) {
        console.warn('⚠️  Failed to initialize SQLite, using memory');
        this.isMemory = true;
      }
    } else {
      console.log('✅ Using in-memory storage');
    }
  }

  async run(query, params = []) {
    if (this.isMemory) {
      // Simple in-memory implementation for basic operations
      return Promise.resolve();
    }
    
    return new Promise((resolve, reject) => {
      this.db.run(query, params, function(err) {
        if (err) reject(err);
        else resolve(this);
      });
    });
  }

  async get(query, params = []) {
    if (this.isMemory) {
      // Return mock data for missing dependencies
      return Promise.resolve(null);
    }
    
    return new Promise((resolve, reject) => {
      this.db.get(query, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  async all(query, params = []) {
    if (this.isMemory) {
      return Promise.resolve([]);
    }
    
    return new Promise((resolve, reject) => {
      this.db.all(query, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  close() {
    if (this.db) {
      this.db.close();
    }
  }
}

// Simplified symbol extraction without tree-sitter
function extractSymbolsBasic(content, filePath) {
  const symbols = [];
  
  // Basic regex-based extraction for common patterns
  const patterns = {
    function: /(?:function|def|func|fn)\s+(\w+)/g,
    class: /(?:class|interface|type)\s+(\w+)/g,
    variable: /(?:let|var|const|val)\s+(\w+)/g,
    import: /(?:import|include|require)\s+.*?(\w+)/g
  };

  for (const [type, pattern] of Object.entries(patterns)) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      symbols.push({
        name: match[1],
        type: type,
        file: filePath,
        line: content.substring(0, match.index).split('\n').length
      });
    }
  }

  return symbols;
}

// Tree-sitter based extraction (if available)
function extractSymbolsAdvanced(content, filePath, language) {
  if (!Parser || !languageParsers[language]) {
    return extractSymbolsBasic(content, filePath);
  }

  try {
    const parser = new Parser();
    parser.setLanguage(languageParsers[language]);
    const tree = parser.parse(content);
    
    const symbols = [];
    const visitNode = (node) => {
      // Extract symbols based on node types
      if (node.type === 'function_definition' || 
          node.type === 'class_definition' ||
          node.type === 'identifier') {
        symbols.push({
          name: node.text,
          type: node.type,
          file: filePath,
          line: node.startPosition.row + 1
        });
      }
      
      for (let child = node.firstChild; child; child = child.nextSibling) {
        visitNode(child);
      }
    };
    
    visitNode(tree.rootNode);
    return symbols;
  } catch (error) {
    console.warn(`Tree-sitter extraction failed for ${filePath}:`, error.message);
    return extractSymbolsBasic(content, filePath);
  }
}

// Export the main service functions
export { 
  DatabaseWrapper,
  extractSymbolsBasic,
  extractSymbolsAdvanced,
  memoryStorage,
  Parser,
  languageParsers
};

// Re-export all the original functions from providers.js
export {
  createEmbeddingProvider,
  getModelProfile,
  countChunkSize,
  getSizeLimits
};