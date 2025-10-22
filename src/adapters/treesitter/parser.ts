/**
 * Tree-sitter Parser Management
 * 
 * Handles dynamic loading and management of Tree-sitter parsers
 * with proper error handling and fallback strategies.
 */

import Parser from 'tree-sitter';
import path from 'path';

// Dynamic imports for tree-sitter language parsers
let languageParsers: Record<string, any> = {};

/**
 * Tree-sitter language configuration
 */
export interface LanguageConfig {
    name: string;
    extensions: string[];
    parser: any;
    nodeTypes: string[];
    subdivisionTypes?: Record<string, string[]>;
    variableTypes?: string[];
    commentPatterns: RegExp[];
    regexPatterns?: Record<string, RegExp>;
}

/**
 * Initialize all available Tree-sitter parsers
 */
export async function initializeParsers(): Promise<void> {
    try {
        // Use dynamic imports with proper error handling
        const imports = await Promise.allSettled([
            import('tree-sitter-python'),
            import('tree-sitter-javascript'),
            import('tree-sitter-typescript'),
            // @ts-ignore - TSX module may not have proper types
            import('tree-sitter-typescript/bindings/node/tsx.js'),
            // @ts-ignore - Dart module may not have proper types
            import('@vokturz/tree-sitter-dart'),
            import('tree-sitter-go'),
            import('tree-sitter-java'),
            import('tree-sitter-c'),
            import('tree-sitter-cpp'),
            import('tree-sitter-c-sharp'),
            import('tree-sitter-rust'),
            import('tree-sitter-php'),
            import('tree-sitter-ruby'),
            import('tree-sitter-bash'),
            import('tree-sitter-json'),
            import('tree-sitter-html'),
            import('tree-sitter-css'),
            import('tree-sitter-scala'),
            import('tree-sitter-swift'),
            // @ts-ignore - Kotlin module may not have proper types
            import('@tree-sitter-grammars/tree-sitter-kotlin'),
            import('tree-sitter-elixir'),
            import('tree-sitter-haskell'),
            import('tree-sitter-ocaml')
        ]);

        // Map imports to language names
        const languageMap = [
            { name: 'python', module: imports[0], key: 'default' },
            { name: 'javascript', module: imports[1], key: 'default' },
            { name: 'typescript', module: imports[2], key: 'default' },
            { name: 'tsx', module: imports[3], key: 'default' },
            { name: 'dart', module: imports[4], key: 'default' },
            { name: 'go', module: imports[5], key: 'default' },
            { name: 'java', module: imports[6], key: 'default' },
            { name: 'c', module: imports[7], key: 'default' },
            { name: 'cpp', module: imports[8], key: 'default' },
            { name: 'csharp', module: imports[9], key: 'default' },
            { name: 'rust', module: imports[10], key: 'default' },
            { name: 'php', module: imports[11], key: 'default' },
            { name: 'ruby', module: imports[12], key: 'default' },
            { name: 'bash', module: imports[13], key: 'default' },
            { name: 'json', module: imports[14], key: 'default' },
            { name: 'html', module: imports[15], key: 'default' },
            { name: 'css', module: imports[16], key: 'default' },
            { name: 'scala', module: imports[17], key: 'default' },
            { name: 'swift', module: imports[18], key: 'default' },
            { name: 'kotlin', module: imports[19], key: 'default' },
            { name: 'elixir', module: imports[20], key: 'default' },
            { name: 'haskell', module: imports[21], key: 'default' },
            { name: 'ocaml', module: imports[22], key: 'default' }
        ];

        for (const { name, module, key } of languageMap) {
            if (module.status === 'fulfilled') {
                try {
                    let language = module.value[key];
                    
                    // Special handling for Dart parser
                    if (name === 'dart' && language && typeof language === 'object') {
                        if (!language.language && language.default) {
                            language = language.default;
                        }
                        if (!language.language) {
                            console.warn(`⚠️  ${name} parser missing language property`);
                            continue;
                        }
                    }
                    
                    if (language && language.language) {
                        languageParsers[name] = language;
                        console.log(`✓ ${name} parser loaded`);
                    } else {
                        console.warn(`⚠️  ${name} parser invalid structure`);
                    }
                } catch (error) {
                    console.warn(`⚠️  Failed to load ${name} parser:`, error);
                }
            } else {
                console.warn(`⚠️  ${name} parser not available:`, module.reason);
            }
        }

        console.log(`Tree-sitter parsers loaded: ${Object.keys(languageParsers).length}/${languageMap.length}`);
    } catch (error) {
        console.warn('Failed to initialize Tree-sitter parsers:', error);
    }
}

/**
 * Get parser for a specific language
 */
export function getParser(language: string): any {
    return languageParsers[language];
}

/**
 * Check if a language parser is available
 */
export function hasParser(language: string): boolean {
    return !!languageParsers[language];
}

/**
 * Get all available languages
 */
export function getAvailableLanguages(): string[] {
    return Object.keys(languageParsers);
}

/**
 * Create a new Parser instance with the specified language
 */
export function createTreeSitterParser(language: string): Parser | null {
    const languageModule = getParser(language);
    if (!languageModule) {
        return null;
    }

    try {
        const parser = new Parser();
        parser.setLanguage(languageModule);
        return parser;
    } catch (error) {
        console.warn(`Failed to create parser for ${language}:`, error);
        return null;
    }
}

/**
 * Parse source code with the specified language
 */
export function parseCode(
    source: string,
    language: string,
    options: { bufferSize?: number; chunkSize?: number } = {}
): Parser.Tree | null {
    const parser = createTreeSitterParser(language);
    if (!parser) {
        return null;
    }

    try {
        const { bufferSize = 30000, chunkSize = 30000 } = options;
        
        // Use callback-based parse for large files to avoid memory issues
        if (source.length > bufferSize) {
            return parser.parse((index, position) => {
                if (index < source.length) {
                    return source.slice(index, Math.min(index + chunkSize, source.length));
                }
                return null;
            });
        } else {
            return parser.parse(source);
        }
    } catch (error) {
        console.warn(`Failed to parse ${language} code:`, error);
        return null;
    } finally {
        // Clean up parser - tree-sitter parsers don't have a delete method in JS
        // The parser will be garbage collected
    }
}

/**
 * Get language configuration for file extensions
 */
export function getLanguageConfigs(): Record<string, LanguageConfig> {
    const configs: Record<string, LanguageConfig> = {};

    // Python
    if (hasParser('python')) {
        configs['.py'] = {
            name: 'python',
            extensions: ['.py'],
            parser: getParser('python'),
            nodeTypes: ['function_definition', 'class_definition'],
            subdivisionTypes: {
                'class_definition': ['function_definition'],
                'function_definition': ['function_definition', 'if_statement', 'try_statement', 'with_statement']
            },
            variableTypes: ['assignment', 'expression_statement'],
            commentPatterns: [/"""[\s\S]*?"""|'''[\s\S]*?'''/g]
        };
    }

    // JavaScript
    if (hasParser('javascript')) {
        configs['.js'] = {
            name: 'javascript',
            extensions: ['.js'],
            parser: getParser('javascript'),
            nodeTypes: ['function_declaration', 'method_definition', 'class_declaration'],
            subdivisionTypes: {
                'class_declaration': ['method_definition', 'field_definition'],
                'function_declaration': ['function_declaration', 'if_statement', 'try_statement'],
                'method_definition': ['function_declaration', 'if_statement', 'try_statement']
            },
            variableTypes: ['const_declaration', 'let_declaration', 'variable_declaration'],
            commentPatterns: [/\/\*\*[\s\S]*?\*\//g]
        };
    }

    // TypeScript
    if (hasParser('typescript')) {
        configs['.ts'] = {
            name: 'typescript',
            extensions: ['.ts'],
            parser: getParser('typescript'),
            nodeTypes: ['function_declaration', 'method_definition', 'class_declaration'],
            subdivisionTypes: {
                'class_declaration': ['method_definition', 'field_definition'],
                'function_declaration': ['function_declaration', 'if_statement', 'try_statement'],
                'method_definition': ['function_declaration', 'if_statement', 'try_statement']
            },
            variableTypes: ['const_declaration', 'let_declaration', 'variable_declaration'],
            commentPatterns: [/\/\*\*[\s\S]*?\*\//g]
        };
    }

    // TSX
    if (hasParser('tsx')) {
        configs['.tsx'] = {
            name: 'tsx',
            extensions: ['.tsx'],
            parser: getParser('tsx'),
            nodeTypes: ['function_declaration', 'class_declaration'],
            variableTypes: ['const_declaration', 'let_declaration', 'variable_declaration'],
            commentPatterns: [/\/\*\*[\s\S]*?\*\//g]
        };
    }

    // Dart
    if (hasParser('dart')) {
        configs['.dart'] = {
            name: 'dart',
            extensions: ['.dart'],
            parser: getParser('dart'),
            nodeTypes: ['function_signature', 'class_definition', 'method_declaration', 'constructor_signature', 'mixin_declaration', 'enum_declaration', 'extension_declaration'],
            subdivisionTypes: {
                'class_definition': ['function_signature', 'method_declaration'],
                'mixin_declaration': ['function_signature', 'method_declaration'],
                'extension_declaration': ['function_signature', 'method_declaration'],
                'function_signature': ['if_statement', 'try_statement', 'for_statement', 'while_statement', 'switch_statement']
            },
            variableTypes: ['variable_declaration', 'top_level_variable_declaration', 'initialized_variable_declaration', 'field_declaration'],
            commentPatterns: [/\/\/\/.*|\/\*\*[\s\S]*?\*\//g],
            regexPatterns: {
                class: /(?:class|abstract\s+class|mixin)\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?:extends\s+[A-Za-z_][A-Za-z0-9_]*\s*)?(?:with\s+[A-Za-z_][A-Za-z0-9_]*(?:\s*,\s*[A-Za-z_][A-Za-z0-9_]*)*\s*)?(?:implements\s+[A-Za-z_][A-Za-z0-9_]*(?:\s*,\s*[A-Za-z_][A-Za-z0-9_]*)*\s*)?\{/g,
                function: /(?:\s+(?:async\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*\([^)]*\)\s*(?:async\s+)?(?:=>|{))|(?:([A-Za-z_][A-Za-z0-9_]*)\s*\([^)]*\)\s*[:{])|(?:void\s+([A-Za-z_][A-Za-z0-9_]*)\s*\()|(?:[A-Za-z_][A-Za-z0-9_<>]*\s+([A-Za-z_][A-Za-z0-9_]*)\s*\([^)]*\)\s*(?:{|=>))/g,
                method: /(?:\s+(?:async\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*\([^)]*\)\s*(?:async\s+)?(?:=>|{))|(?:([A-Za-z_][A-Za-z0-9_]*)\s*\([^)]*\)\s*[:{])|(?:void\s+([A-Za-z_][A-Za-z0-9_]*)\s*\()|(?:[A-Za-z_][A-Za-z0-9_<>]*\s+([A-Za-z_][A-Za-z0-9_]*)\s*\([^)]*\)\s*(?:{|=>))/g,
                constructor: /([A-Za-z_][A-Za-z0-9_]*)\s*\([^)]*\)\s*(?:[:{])/g,
                variable: /(?:late\s+)?(?:final\s+|const\s+)?[A-Za-z_][A-Za-z0-9_<>]*\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?:=|;)/g,
                enum: /enum\s+([A-Za-z_][A-Za-z0-9_]*)\s*{/g,
                extension: /extension\s+([A-Za-z_][A-Za-z0-9_]*)\s+(?:on\s+[A-Za-z_][A-Za-z0-9_<>]+\s+)?{/g
            }
        };
    }

    // Go
    if (hasParser('go')) {
        configs['.go'] = {
            name: 'go',
            extensions: ['.go'],
            parser: getParser('go'),
            nodeTypes: ['function_declaration', 'method_declaration'],
            variableTypes: ['const_declaration', 'var_declaration'],
            commentPatterns: [/\/\*[\s\S]*?\*\//g]
        };
    }

    // Java
    if (hasParser('java')) {
        configs['.java'] = {
            name: 'java',
            extensions: ['.java'],
            parser: getParser('java'),
            nodeTypes: ['method_declaration', 'class_declaration'],
            variableTypes: ['variable_declaration', 'field_declaration'],
            commentPatterns: [/\/\*\*[\s\S]*?\*\//g]
        };
    }

    // C/C++
    if (hasParser('c')) {
        configs['.c'] = {
            name: 'c',
            extensions: ['.c', '.h'],
            parser: getParser('c'),
            nodeTypes: ['function_definition', 'struct_specifier', 'declaration'],
            subdivisionTypes: {
                'struct_specifier': ['field_declaration']
            },
            variableTypes: ['declaration'],
            commentPatterns: [/\/\*[\s\S]*?\*\//g]
        };
    }

    if (hasParser('cpp')) {
        configs['.cpp'] = {
            name: 'cpp',
            extensions: ['.cpp', '.hpp', '.cc', '.cxx'],
            parser: getParser('cpp'),
            nodeTypes: ['function_definition', 'class_specifier', 'struct_specifier', 'namespace_definition'],
            subdivisionTypes: {
                'class_specifier': ['function_definition', 'field_declaration'],
                'struct_specifier': ['function_definition', 'field_declaration'],
                'namespace_definition': ['function_definition', 'class_specifier', 'struct_specifier']
            },
            variableTypes: ['declaration', 'field_declaration'],
            commentPatterns: [/\/\*[\s\S]*?\*\//g]
        };
    }

    // C#
    if (hasParser('csharp')) {
        configs['.cs'] = {
            name: 'csharp',
            extensions: ['.cs'],
            parser: getParser('csharp'),
            nodeTypes: ['method_declaration', 'class_declaration', 'struct_declaration', 'interface_declaration'],
            subdivisionTypes: {
                'class_declaration': ['method_declaration', 'property_declaration', 'field_declaration'],
                'struct_declaration': ['method_declaration', 'property_declaration', 'field_declaration'],
                'interface_declaration': ['method_declaration', 'property_declaration'],
                'method_declaration': ['if_statement', 'try_statement', 'foreach_statement']
            },
            variableTypes: ['variable_declaration', 'field_declaration', 'property_declaration'],
            commentPatterns: [/\/\*\*[\s\S]*?\*\//g]
        };
    }

    // Rust
    if (hasParser('rust')) {
        configs['.rs'] = {
            name: 'rust',
            extensions: ['.rs'],
            parser: getParser('rust'),
            nodeTypes: ['function_item', 'impl_item', 'struct_item', 'enum_item', 'trait_item', 'mod_item'],
            subdivisionTypes: {
                'impl_item': ['function_item'],
                'mod_item': ['function_item', 'struct_item', 'enum_item', 'trait_item'],
                'trait_item': ['function_signature']
            },
            variableTypes: ['let_declaration', 'const_item', 'static_item'],
            commentPatterns: [/\/\/\/.*|\/\*\*[\s\S]*?\*\//g]
        };
    }

    // PHP
    if (hasParser('php')) {
        configs['.php'] = {
            name: 'php',
            extensions: ['.php'],
            parser: getParser('php'),
            nodeTypes: ['function_definition', 'method_declaration'],
            subdivisionTypes: {
                'class_declaration': ['method_declaration', 'function_definition'],
                'function_definition': ['function_definition', 'if_statement', 'try_statement'],
                'method_declaration': ['function_definition', 'if_statement', 'try_statement']
            },
            variableTypes: ['const_declaration', 'assignment_expression'],
            commentPatterns: [/\/\*\*[\s\S]*?\*\//g]
        };
    }

    // Ruby
    if (hasParser('ruby')) {
        configs['.rb'] = {
            name: 'ruby',
            extensions: ['.rb'],
            parser: getParser('ruby'),
            nodeTypes: ['method', 'class', 'module', 'singleton_method'],
            subdivisionTypes: {
                'class': ['method', 'singleton_method'],
                'module': ['method', 'singleton_method']
            },
            variableTypes: ['assignment', 'instance_variable', 'class_variable'],
            commentPatterns: [/#.*$/gm]
        };
    }

    // Bash
    if (hasParser('bash')) {
        configs['.sh'] = configs['.bash'] = {
            name: 'bash',
            extensions: ['.sh', '.bash'],
            parser: getParser('bash'),
            nodeTypes: ['function_definition', 'command'],
            subdivisionTypes: {
                'function_definition': ['command', 'if_statement', 'for_statement', 'while_statement']
            },
            variableTypes: ['variable_assignment'],
            commentPatterns: [/#.*$/gm]
        };
    }

    // JSON
    if (hasParser('json')) {
        configs['.json'] = {
            name: 'json',
            extensions: ['.json'],
            parser: getParser('json'),
            nodeTypes: ['object', 'array', 'pair'],
            subdivisionTypes: {
                'object': ['pair'],
                'array': ['object', 'array']
            },
            variableTypes: [],
            commentPatterns: []
        };
    }

    // HTML
    if (hasParser('html')) {
        configs['.html'] = configs['.htm'] = {
            name: 'html',
            extensions: ['.html', '.htm'],
            parser: getParser('html'),
            nodeTypes: ['element', 'start_tag', 'script_element', 'style_element'],
            subdivisionTypes: {
                'element': ['element']
            },
            variableTypes: [],
            commentPatterns: [/<!--[\s\S]*?-->/g]
        };
    }

    // CSS
    if (hasParser('css')) {
        configs['.css'] = {
            name: 'css',
            extensions: ['.css'],
            parser: getParser('css'),
            nodeTypes: ['rule_set', 'declaration', 'selector'],
            subdivisionTypes: {
                'rule_set': ['declaration']
            },
            variableTypes: [],
            commentPatterns: [/\/\*[\s\S]*?\*\//g]
        };
    }

    return configs;
}

/**
 * Get language configuration for a file path
 */
export function getLanguageConfig(filePath: string): LanguageConfig | null {
    const ext = path.extname(filePath).toLowerCase();
    const configs = getLanguageConfigs();
    return configs[ext] || null;
}