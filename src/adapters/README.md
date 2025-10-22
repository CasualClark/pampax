# Pampax Adapter System

This directory contains the adapter system for Pampax, which provides a pluggable architecture for parsing different programming languages and extracting code spans.

## Architecture

The adapter system follows the specification from `docs/2_ARCHITECTURE_OVERVIEW.md` and implements the core `Adapter` interface:

```typescript
export interface Adapter {
    id: string;
    supports(filePath: string): boolean;
    parse(files: string[]): Promise<Span[]>;
}
```

## Components

### Base Adapter (`base.ts`)

- `BaseAdapter`: Abstract base class with common functionality
- `AdapterRegistry`: Registry for managing multiple adapters
- `ParseContext`: Context information for parsing operations
- `ParseResult`: Result structure with spans and errors

### Tree-sitter Adapter (`treesitter/`)

The Tree-sitter adapter provides structural parsing using Tree-sitter grammars:

#### Parser Management (`parser.ts`)
- Dynamic loading of Tree-sitter language parsers
- Language configuration management
- Fallback handling for missing parsers
- Support for 20+ programming languages

#### Span Extraction (`span-extractor.ts`)
- `DefaultSpanExtractor`: Converts Tree-sitter nodes to Span objects
- `RegexSpanExtractor`: Fallback regex-based extraction
- Parent-child relationship tracking
- Documentation comment extraction
- Reference detection

#### Main Adapter (`treesitter-adapter.ts`)
- `TreeSitterAdapter`: Main adapter implementation
- Progress event emission
- Error handling with fallback strategies
- Integration with the base adapter system

## Supported Languages

The Tree-sitter adapter supports the following languages:

- **Python** (.py) - Full support with classes, functions, methods
- **JavaScript** (.js) - Classes, functions, methods
- **TypeScript** (.ts, .tsx) - Classes, functions, methods, interfaces
- **Dart** (.dart) - Classes, functions, methods, enums, mixins, extensions
- **Go** (.go) - Functions, methods, packages
- **Java** (.java) - Classes, methods, interfaces
- **C/C++** (.c, .h, .cpp, .hpp, .cc) - Functions, structs, classes
- **C#** (.cs) - Classes, methods, interfaces, structs
- **Rust** (.rs) - Functions, structs, enums, traits, impls
- **PHP** (.php) - Classes, functions, methods
- **Ruby** (.rb) - Classes, modules, methods
- **Bash** (.sh, .bash) - Functions, commands
- **JSON** (.json) - Objects, arrays, key-value pairs
- **HTML** (.html, .htm) - Elements, tags
- **CSS** (.css) - Rules, selectors, declarations
- **And more...**

## Usage

### Basic Usage

```typescript
import { treeSitterAdapter } from './adapters/index.js';

// Check if adapter supports a file
if (treeSitterAdapter.supports('example.py')) {
    // Parse files
    const spans = await treeSitterAdapter.parse(['example.py'], {
        repo: 'my-repo',
        basePath: '/path/to/repo',
        onProgress: (event) => console.log(event)
    });
    
    console.log(`Extracted ${spans.length} spans`);
}
```

### Using the Registry

```typescript
import { adapterRegistry, treeSitterAdapter } from './adapters/index.js';

// Register adapter
adapterRegistry.register(treeSitterAdapter);

// Find supporting adapters for a file
const adapters = adapterRegistry.findSupporting('example.dart');
if (adapters.length > 0) {
    const adapter = adapters[0];
    const spans = await adapter.parse(['example.dart']);
}
```

### Progress Events

The adapter emits progress events during parsing:

```typescript
const context = {
    repo: 'my-repo',
    basePath: '/path/to/repo',
    onProgress: (event) => {
        switch (event.type) {
            case 'start':
                console.log(`Starting to parse ${event.totalFiles} files`);
                break;
            case 'fileParsed':
                console.log(`Parsed: ${event.path}`);
                break;
            case 'spansEmitted':
                console.log(`Extracted ${event.count} spans from ${event.path}`);
                break;
            case 'error':
                console.error(`Error parsing ${event.path}: ${event.error}`);
                break;
        }
    }
};
```

## Error Handling

The adapter system implements robust error handling:

1. **Tree-sitter Failures**: Falls back to regex-based extraction
2. **Missing Parsers**: Uses regex patterns for unsupported languages
3. **File Errors**: Continues processing other files
4. **Syntax Errors**: Attempts partial extraction

## Span Structure

Each extracted span contains:

```typescript
interface Span {
    id: string;                 // Unique identifier
    repo: string;               // Repository name
    path: string;               // File path (relative)
    byteStart: number;          // Start byte offset
    byteEnd: number;            // End byte offset
    kind: SpanKind;             // Type: 'class', 'function', 'method', etc.
    name?: string;              // Symbol name
    signature?: string;         // Full signature
    doc?: string;               // Documentation comments
    parents?: string[];         // Parent span IDs
    references?: Array<{        // References to other symbols
        path: string;
        byteStart: number;
        byteEnd: number;
        kind?: "call"|"read"|"write"
    }>;
}
```

## Testing

Run the adapter tests:

```bash
# Run all adapter tests
npm run test -- test/adapters/

# Run specific test files
npm run test -- test/adapters/treesitter-simple.test.ts
npm run test -- test/adapters/integration.test.ts
```

## Performance Considerations

- **Large Files**: Uses callback-based parsing for files >30KB
- **Memory Management**: Proper cleanup of Tree-sitter parsers
- **Batch Processing**: Efficient handling of multiple files
- **Fallback Strategies**: Minimal overhead when Tree-sitter fails

## Extending the System

### Adding a New Adapter

1. Extend `BaseAdapter`:
```typescript
export class MyAdapter extends BaseAdapter {
    readonly id = 'my-adapter';
    
    supports(filePath: string): boolean {
        return filePath.endsWith('.mylang');
    }
    
    async parse(files: string[], context?: ParseContext): Promise<Span[]> {
        return this.parseFilesWithProgress(files, context, this.parseFile);
    }
    
    private async parseFile(filePath: string, content: string): Promise<Span[]> {
        // Your parsing logic here
        return [];
    }
}
```

2. Register the adapter:
```typescript
import { adapterRegistry } from './adapters/index.js';
import { MyAdapter } from './my-adapter.js';

adapterRegistry.register(new MyAdapter());
```

### Adding Language Support

To add support for a new language to the Tree-sitter adapter:

1. Install the Tree-sitter grammar package
2. Add the language configuration to `parser.ts`
3. Test with the new language file types

## Integration with Existing System

The adapter system is designed to integrate with the existing Pampax service layer:

- **Storage Integration**: Spans can be stored in the SQLite database
- **CLI Integration**: Works with the existing index command
- **Feature Flags**: Respects `treesitter.enabled` configuration
- **Progress UI**: Integrates with existing progress reporting

## Future Enhancements

- **LSP Integration**: Language Server Protocol support
- **Additional Languages**: More Tree-sitter grammars
- **Custom Extractors**: Pluggable extraction strategies
- **Performance Optimization**: Caching and incremental updates
- **Advanced References**: Cross-file reference resolution