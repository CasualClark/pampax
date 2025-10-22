/**
 * Tree-sitter Adapter Implementation
 * 
 * Main adapter that uses Tree-sitter for structural parsing
 * with fallback to regex-based extraction when needed.
 */

import { BaseAdapter, ParseContext } from '../base.js';
import { Span } from '../../types/core.js';
import { 
    initializeParsers, 
    parseCode, 
    getLanguageConfig, 
    getAvailableLanguages,
    getLanguageConfigs
} from './parser.js';
import { DefaultSpanExtractor, RegexSpanExtractor, ExtractionContext } from './span-extractor.js';

export class TreeSitterAdapter extends BaseAdapter {
    readonly id = 'treesitter';
    
    private defaultExtractor = new DefaultSpanExtractor();
    private regexExtractor = new RegexSpanExtractor();
    private initialized = false;

    constructor() {
        super();
    }

    /**
     * Initialize parsers if not already done
     */
    private async ensureInitialized(): Promise<void> {
        if (!this.initialized) {
            await initializeParsers();
            this.initialized = true;
        }
    }

    /**
     * Check if this adapter supports the given file path
     */
    supports(filePath: string): boolean {
        const config = getLanguageConfig(filePath);
        return config !== null;
    }

    /**
     * Parse files and extract spans using Tree-sitter
     */
    async parse(files: string[], context?: ParseContext): Promise<Span[]> {
        await this.ensureInitialized();

        if (!context) {
            throw new Error('ParseContext is required for TreeSitterAdapter');
        }

        const result = await this.parseFilesWithProgress(files, context, async (filePath, content) => {
            return this.parseFile(filePath, content, context);
        });
        return result.spans;
    }

    /**
     * Parse a single file and extract spans
     */
    private async parseFile(filePath: string, content: string, context: ParseContext): Promise<Span[]> {
        const config = getLanguageConfig(filePath);
        if (!config) {
            return [];
        }

        const relativePath = this.getRelativePath(context.basePath, filePath);
        const extractionContext: ExtractionContext = {
            repo: context.repo,
            filePath: relativePath,
            source: content,
            config
        };

        try {
            // Try Tree-sitter parsing first
            const tree = parseCode(content, config.name);
            if (tree && tree.rootNode) {
                return this.defaultExtractor.extractSpans(tree, extractionContext);
            }
        } catch (error) {
            console.warn(`Tree-sitter parsing failed for ${filePath}:`, error);
        }

        // Fallback to regex extraction
        if (config.regexPatterns) {
            console.log(`Using regex fallback for ${filePath}`);
            return this.regexExtractor.extractSpans(extractionContext);
        }

        console.warn(`No extraction method available for ${filePath}`);
        return [];
    }

    /**
     * Get supported file extensions
     */
    getSupportedExtensions(): string[] {
        const configs = getLanguageConfigs ? getLanguageConfigs() : {};
        return Object.keys(configs);
    }

    /**
     * Get available languages
     */
    getAvailableLanguages(): string[] {
        return getAvailableLanguages();
    }

    /**
     * Check if Tree-sitter is properly initialized
     */
    isReady(): boolean {
        return this.initialized;
    }
}

// Export singleton instance
export const treeSitterAdapter = new TreeSitterAdapter();