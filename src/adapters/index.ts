/**
 * Adapters Module Index
 * 
 * Exports all adapter-related functionality
 */

export { BaseAdapter, AdapterRegistry, adapterRegistry } from './base.js';
export type { ParseContext, ParseResult } from './base.js';

export { TreeSitterAdapter, treeSitterAdapter } from './treesitter/treesitter-adapter.js';
export type { LanguageConfig } from './treesitter/parser.js';
export { 
    initializeParsers, 
    parseCode, 
    getLanguageConfig, 
    getLanguageConfigs,
    getAvailableLanguages,
    createTreeSitterParser 
} from './treesitter/parser.js';
export { 
    DefaultSpanExtractor, 
    RegexSpanExtractor,
    SpanExtractor,
    ExtractionContext 
} from './treesitter/span-extractor.js';