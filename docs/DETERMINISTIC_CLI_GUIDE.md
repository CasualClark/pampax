# Deterministic CLI Guide

## Overview

PAMPAX CLI now provides deterministic output with piped output detection, stable JSON formatting, and structured exit codes for production-ready automation and script integration.

## Features

### 🔄 Piped Output Detection

The CLI automatically detects when output is piped to another command and switches to JSON format:

```bash
# Interactive mode (TTY)
pampax search "authentication"

# Auto-detects pipe and switches to JSON
pampax search "authentication" | jq '.results[].path'
```

### 📊 Stable JSON Output

JSON output includes:
- Consistent key ordering for reproducible results
- Metadata with timestamps and command info
- Structured error information

```json
{
  "success": true,
  "query": "authentication",
  "results": [...],
  "total": 5,
  "_meta": {
    "timestamp": "2025-10-25T10:30:00.000Z",
    "mode": "json",
    "command": "search",
    "duration": 1250
  }
}
```

### 🔢 Structured Exit Codes

Consistent exit codes for script integration:

| Exit Code | Meaning | Use Case |
|-----------|---------|----------|
| 0 | SUCCESS | Operation completed successfully |
| 2 | CONFIG | Configuration errors, invalid options |
| 3 | IO | File/database access errors |
| 4 | NETWORK | Network connectivity issues |
| 5 | TIMEOUT | Operation timeouts |
| 6 | INTERNAL | Unexpected internal errors |

## Usage Patterns

### Interactive Usage

```bash
# Default interactive mode with colors
pampax search "user authentication"
pampax index ./my-project
pampax health
```

### Script Integration

```bash
#!/bin/bash

# Force JSON output for parsing
results=$(pampax search "API endpoint" --format json --project ./src)

# Check exit code
if [ $? -eq 0 ]; then
    # Extract file paths using jq
    echo "$results" | jq -r '.results[].path'
else
    echo "Search failed with exit code: $?"
    exit 1
fi
```

### Pipeline Processing

```bash
# Auto-detects pipe, outputs JSON
pampax search "database connection" | jq '.results | length'

# Chain multiple commands
pampax search "test" --format json | jq '.results[] | select(.lang == "js")' | jq '.path'

# Process with other tools
pampax search "error handling" | grep -o '"path":"[^"]*"' | cut -d'"' -f4
```

### Quiet Mode

```bash
# Minimal output, only errors to stderr
pampax index ./project --quiet

# Use in scripts where you only care about success/failure
if pampax search "function" --quiet; then
    echo "Found results"
else
    echo "No results found"
fi
```

### Verbose Mode

```bash
# Detailed debugging information
pampax search "query" --verbose

# Include timing and metadata
pampax index ./project --verbose --format json
```

## Output Formats

### Interactive Format (Default)

```bash
pampax search "authentication"
```

Output:
```
Found 3 results for: "authentication"

1. FILE: src/auth/AuthService.js
   SYMBOL: authenticateUser (javascript)
   SIMILARITY: 0.89
   SHA: abc123...

2. FILE: src/middleware/auth.js
   SYMBOL: requireAuth (javascript)
   SIMILARITY: 0.85
   SHA: def456...
```

### JSON Format

```bash
pampax search "authentication" --format json
```

Output:
```json
{
  "success": true,
  "query": "authentication",
  "path": ".",
  "provider": "auto",
  "limit": 10,
  "results": [
    {
      "path": "src/auth/AuthService.js",
      "content": "...",
      "lang": "javascript",
      "meta": {
        "symbol": "authenticateUser",
        "score": 0.89
      },
      "sha": "abc123..."
    }
  ],
  "total": 3,
  "scopeFilters": {},
  "contextPack": null,
  "_meta": {
    "timestamp": "2025-10-25T10:30:00.000Z",
    "mode": "json",
    "command": "search",
    "duration": 1250
  }
}
```

### Quiet Format

```bash
pampax search "authentication" --quiet
```

Output:
```
3
```

### Verbose Format

```bash
pampax search "authentication" --verbose
```

Output:
```
[2025-10-25T10:30:00.000Z] Command: search
[2025-10-25T10:30:00.000Z] Mode: verbose
[2025-10-25T10:30:00.000Z] Data: { success: true, query: "authentication", ... }
[2025-10-25T10:30:01.250Z] Duration: 1250ms
```

## Error Handling

### Structured Error Output

```bash
pampax search "query" --project /nonexistent --format json
```

Output:
```json
{
  "success": false,
  "error": "Database not found: /nonexistent/.pampax/database.sqlite",
  "context": "search",
  "timestamp": "2025-10-25T10:30:00.000Z",
  "_meta": {
    "timestamp": "2025-10-25T10:30:00.000Z",
    "mode": "json",
    "command": "search",
    "duration": 50
  }
}
```

### Exit Code Examples

```bash
# Success
pampax search "existing function"
echo $?  # 0

# Configuration error
pampax search "test" --limit invalid
echo $?  # 2

# File not found
pampax search "test" --project /nonexistent
echo $?  # 3
```

## Command Reference

### Global Options

All commands support these deterministic output options:

- `--format <format>`: Output format (json|interactive|quiet|verbose)
- `--no-color`: Disable colored output
- `--quiet`: Minimal output, only errors
- `--verbose`: Show detailed information

### Search Command

```bash
pampax search <query> [path] [options]
```

Deterministic output features:
- Stable result ordering
- Consistent metadata structure
- Predictable pagination

### Index Command

```bash
pampax index [path] [options]
```

Deterministic output features:
- Progress reporting in all formats
- Structured error messages
- Completion status with details

### Health Command

```bash
pampax health [options]
```

Deterministic output features:
- Component status in structured format
- Performance metrics
- Consistent error reporting

### Info Command

```bash
pampax info [options]
```

Deterministic output features:
- Project statistics in stable format
- Language breakdown
- File analysis results

## Integration Examples

### Shell Script Integration

```bash
#!/bin/bash

# Function to search and process results
search_and_process() {
    local query="$1"
    local project_path="$2"
    
    # Search with JSON output
    local results
    results=$(pampax search "$query" --project "$project_path" --format json 2>/dev/null)
    
    # Check if search succeeded
    if [ $? -ne 0 ]; then
        echo "Search failed for query: $query"
        return 1
    fi
    
    # Process results
    local count
    count=$(echo "$results" | jq '.total')
    
    if [ "$count" -eq 0 ]; then
        echo "No results found for: $query"
        return 0
    fi
    
    echo "Found $count results for: $query"
    
    # Extract file paths
    echo "$results" | jq -r '.results[].path'
}

# Usage
search_and_process "authentication" "./src"
```

### Node.js Integration

```javascript
import { spawn } from 'child_process';

async function searchPampax(query, options = {}) {
    return new Promise((resolve, reject) => {
        const args = ['search', query, '--format', 'json'];
        
        if (options.project) {
            args.push('--project', options.project);
        }
        
        if (options.limit) {
            args.push('--limit', options.limit.toString());
        }
        
        const child = spawn('pampax', args);
        let stdout = '';
        let stderr = '';
        
        child.stdout.on('data', (data) => {
            stdout += data.toString();
        });
        
        child.stderr.on('data', (data) => {
            stderr += data.toString();
        });
        
        child.on('close', (code) => {
            if (code === 0) {
                try {
                    const results = JSON.parse(stdout);
                    resolve(results);
                } catch (error) {
                    reject(new Error(`Failed to parse JSON: ${error.message}`));
                }
            } else {
                reject(new Error(`Command failed with exit code ${code}: ${stderr}`));
            }
        });
        
        child.on('error', reject);
    });
}

// Usage
try {
    const results = await searchPampax('authentication', {
        project: './src',
        limit: 5
    });
    
    console.log(`Found ${results.total} results`);
    results.results.forEach(result => {
        console.log(`- ${result.path}: ${result.meta.symbol}`);
    });
} catch (error) {
    console.error('Search failed:', error.message);
    process.exit(1);
}
```

### CI/CD Integration

```yaml
# GitHub Actions example
- name: Search for TODO comments
  run: |
    results=$(pampax search "TODO" --format json --project . || true)
    
    if [ $? -eq 0 ]; then
      count=$(echo "$results" | jq '.total')
      if [ "$count" -gt 0 ]; then
        echo "Found $count TODO items:"
        echo "$results" | jq -r '.results[].path' | sort | uniq
        exit 1
      fi
    fi
```

## Best Practices

### For Script Writers

1. **Always use `--format json`** for programmatic processing
2. **Check exit codes** before processing output
3. **Use `--quiet`** when you only need success/failure status
4. **Redirect stderr** to separate error handling from output processing
5. **Validate JSON structure** before accessing nested properties

### For Interactive Users

1. **Let the CLI auto-detect** when output is piped
2. **Use `--verbose`** for debugging and detailed information
3. **Use `--no-color`** when piping to tools that don't handle ANSI codes
4. **Combine with other tools** using shell pipelines

### For CI/CD Systems

1. **Use structured exit codes** for decision making
2. **Parse JSON output** for detailed status information
3. **Set timeouts** to prevent hanging operations
4. **Log both stdout and stderr** for troubleshooting

## Troubleshooting

### Common Issues

**JSON parsing fails:**
```bash
# Ensure you're requesting JSON format
pampax search "query" --format json
```

**Exit codes not working:**
```bash
# Check if command is being piped (affects exit code propagation)
pampax search "query"; echo $?
```

**Colors in piped output:**
```bash
# Disable colors explicitly
pampax search "query" --no-color | other-command
```

### Debug Mode

Enable verbose output for troubleshooting:

```bash
pampax search "query" --verbose --format json
```

This will show detailed timing, metadata, and internal processing information.