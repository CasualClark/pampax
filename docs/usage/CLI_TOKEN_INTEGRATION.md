# CLI Token Integration for PAMPAX

This document describes the comprehensive token budgeting system integration in the PAMPAX CLI, providing model-specific token counting, budget management, and optimization features.

## Overview

The token integration system provides:
- **Model-specific tokenization** with accurate counting for different AI models
- **Session-wide budget management** with persistent storage
- **Real-time token reporting** for search results and content analysis
- **Packing profile integration** for context optimization
- **Interactive CLI commands** for token operations

## New CLI Commands

### `pampax token` - Token Management Utilities

The `token` command provides several subcommands for token operations:

#### `pampax token count <text>`

Count tokens for specific text with model-specific accuracy.

```bash
# Basic token counting
pampax token count "function hello() { return 'world'; }"

# Model-specific counting
pampax token count "your code here" --model gpt-4

# Verbose output with additional metrics
pampax token count "your code here" --model claude-3 --verbose

# JSON output for scripting
pampax token count "your code here" --model gpt-3.5-turbo --json
```

**Output Example:**
```
Token Analysis for: function hello() { return 'world'; }

Model: GPT-4 (gpt-4)
Token Count: 8
Characters: 37
Chars per Token: 4.62
Context Size: 8,192
Usage: 0.1% of context
```

#### `pampax token profile <repo>`

Display packing profile configuration for a repository.

```bash
# Show profile for current directory
pampax token profile .

# Model-specific profile
pampax token profile . --model claude-3

# Verbose profile details
pampax token profile . --model gpt-4 --verbose

# JSON output
pampax token profile . --model gpt-3.5-turbo --json
```

**Output Example:**
```
Packing Profile for: pampax (gpt-4)

=== Budget Allocation ===
Total Budget: 8,000 tokens
Must Have: 2,400 tokens (30.0%)
Important: 2,000 tokens (25.0%)
Supplementary: 1,600 tokens (20.0%)
Optional: 1,200 tokens (15.0%)
Reserve: 800 tokens (10.0%)

=== Content Priorities ===
Tests: 0.80
Code: 1.00
Comments: 0.70
Examples: 0.60
Config: 0.90
Docs: 0.70
```

#### `pampax token budget <amount>`

Set session-wide token budget with model optimization.

```bash
# Set budget for default model
pampax token budget 5000

# Model-specific budget
pampax token budget 3000 --model gpt-4

# With repository specification
pampax token budget 10000 --model claude-3 --repo ./my-project

# JSON output
pampax token budget 4000 --model gpt-3.5-turbo --json
```

**Output Example:**
```
✅ Token budget set successfully!

Budget: 3,000 tokens
Model: gpt-4
Repository: /home/user/pampax
Context Usage: 36.6% of model context
Config File: /home/user/pampax/.pampax/token-budget.json

💡 Better Model Fit:
  Claude 3 Opus would use 15% of context
  Consider using: --target-model claude-3-opus
```

#### `pampax token models`

List all supported models with their specifications.

```bash
# Basic model listing
pampax token models

# Verbose with priorities
pampax token models --verbose

# JSON output
pampax token models --json
```

**Output Example:**
```
Supported Models and Token Limits

GPT-4 (gpt-4)
  Context Size: 8,192 tokens
  Max Tokens: 8,192 tokens
  Chars per Token: 3.5
  Recommended Budget: 5,734 tokens (70%)
  Tokenizer: cl100k_base

GPT-3.5 Turbo (gpt-3.5-turbo)
  Context Size: 16,384 tokens
  Max Tokens: 4,096 tokens
  Chars per Token: 4.0
  Recommended Budget: 11,468 tokens (70%)
  Tokenizer: cl100k_base

Claude 3 (claude-3)
  Context Size: 100,000 tokens
  Max Tokens: 4,096 tokens
  Chars per Token: 4.0
  Recommended Budget: 70,000 tokens (70%)
  Tokenizer: claude
```

## Enhanced Search Command

The `search` command now includes token-aware options:

### `--target-model <model>`

Specify the target model for tokenization and optimization.

```bash
# Model-specific search
pampax search "database connection" --target-model gpt-4

# Combined with other options
pampax search "user authentication" --target-model claude-3 --intent --policy
```

### `--token-report`

Display detailed token usage information for search results.

```bash
# Basic token report
pampax search "API endpoints" --token-report

# Model-specific with report
pampax search "router config" --target-model gpt-4 --token-report

# JSON output with token data
pampax search "database schema" --target-model claude-3 --token-report --json
```

**Token Report Output:**
```
=== Token Usage Report ===
Model: gpt-4
Budget: 3,000 tokens
Used: 1,680 tokens (56%)
Average per result: 168 tokens
Context Size: 8,192 tokens

💡 Tip: Low usage - you could increase results for more context.
```

### `--token-budget <amount>`

Override session budget for specific search.

```bash
# Custom budget for search
pampax search "authentication flow" --token-budget 2000 --token-report

# Combined with model
pampax search "error handling" --target-model gpt-3.5-turbo --token-budget 1500 --token-report
```

## Global Options

### `--target-model <model>`

Apply to all commands that support tokenization:

```bash
# Set global target model
pampax --target-model claude-3 search "database queries" --token-report

# Combined with budget
pampax --target-model gpt-4 --token-budget 4000 search "user management"
```

### `--token-budget <amount>`

Set session-wide budget:

```bash
# Global budget setting
pampax --token-budget 5000 search "API documentation" --token-report

# Per-command override
pampax search "error handling" --token-budget 2000
```

## JSON Output Format

All commands support JSON output with comprehensive token data:

### Token Count JSON
```json
{
  "text": "function hello() { return 'world'; }",
  "model": "gpt-4",
  "tokenCount": 8,
  "contextSize": 8192,
  "percentageUsed": 0.1,
  "characters": 37,
  "charsPerToken": "4.62",
  "config": {
    "name": "GPT-4",
    "charsPerToken": 3.5,
    "contextSize": 8192,
    "maxTokens": 8192,
    "tokenizer": "cl100k_base"
  }
}
```

### Search with Token Report JSON
```json
{
  "success": true,
  "query": "database connection",
  "model": "gpt-4",
  "results": [...],
  "totalResults": 10,
  "tokenReport": {
    "budget": 3000,
    "estimated": 1680,
    "actual": 1612,
    "model": "gpt-4",
    "usagePercentage": 54,
    "averageTokensPerResult": 161,
    "contextSize": 8192,
    "breakdown": [
      {
        "index": 1,
        "path": "src/database.js",
        "tokens": 245
      }
    ]
  }
}
```

## Session Management

Token budgets are stored in `.pampax/token-budget.json`:

```json
{
  "budget": 3000,
  "model": "gpt-4",
  "repoPath": "/home/user/project",
  "timestamp": 1699123456789
}
```

### Budget Persistence

- Budgets persist per repository and model
- Automatic loading on subsequent commands
- Override with command-line options
- Timestamp tracking for budget age

## Model Support

### Supported Models

| Model | Context Size | Max Tokens | Chars/Token | Tokenizer |
|-------|--------------|------------|-------------|-----------|
| gpt-4 | 8,192 | 8,192 | 3.5 | cl100k_base |
| gpt-4-turbo | 128,000 | 4,096 | 3.5 | cl100k_base |
| gpt-4o | 128,000 | 4,096 | 3.5 | cl100k_base |
| gpt-3.5-turbo | 16,384 | 4,096 | 4.0 | cl100k_base |
| claude-3 | 100,000 | 4,096 | 4.0 | claude |
| claude-3.5-sonnet | 200,000 | 4,096 | 4.0 | claude |
| claude-3-opus | 200,000 | 4,096 | 4.0 | claude |
| claude-3-haiku | 200,000 | 4,096 | 4.0 | claude |
| gemini-pro | 32,768 | 8,192 | 4.0 | gemini |
| llama-2 | 4,096 | 4,096 | 3.8 | llama |
| llama-3 | 8,192 | 4,096 | 3.8 | llama3 |
| mistral | 8,192 | 4,096 | 3.8 | mistral |
| mixtral | 32,768 | 4,096 | 3.8 | mixtral |

### Tokenizer Accuracy

- **Character-based approximation**: Fast, ~95% accuracy
- **Model-specific tuning**: Optimized for each model's tokenizer
- **Fallback support**: Graceful degradation for unknown models
- **Caching**: Performance optimization for repeated calculations

## Integration Examples

### Basic Workflow

```bash
# 1. Set budget for your project
pampax token budget 4000 --model gpt-4

# 2. Search with token awareness
pampax search "user authentication" --token-report

# 3. Check specific code token count
pampax token count "$(cat src/auth.js)" --model gpt-4

# 4. View repository profile
pampax token profile . --model gpt-4 --verbose
```

### Model Comparison

```bash
# Compare token usage across models
for model in gpt-4 gpt-3.5-turbo claude-3; do
  echo "=== $model ==="
  pampax token count "function authenticateUser(token) { /* verify JWT */ }" --model $model
done
```

### Budget Optimization

```bash
# Find optimal model for your content
pampax token count "$(cat src/large-file.js)" --model gpt-4 --verbose

# Get recommendation
pampax token budget 5000 --model gpt-4  # Shows better model alternatives
```

### Script Integration

```bash
#!/bin/bash
# Search with automatic budget adjustment

CONTENT=$(cat src/feature.js)
TOKENS=$(pampax token count "$CONTENT" --model gpt-4 --json | jq '.tokenCount')

if [ $TOKENS -gt 2000 ]; then
  echo "Content too large, using claude-3 for larger context"
  pampax search "implementation details" --target-model claude-3 --token-report
else
  pampax search "implementation details" --target-model gpt-4 --token-report
fi
```

## Performance Considerations

### Token Counting Performance

- **Simple approximation**: ~1ms per 1KB of text
- **Cached results**: ~0.1ms for repeated content
- **Batch operations**: Optimized for multiple texts
- **Memory usage**: Minimal with LRU caching

### Recommendations

1. **Use appropriate models**: Match model to content size
2. **Set realistic budgets**: 70% of context is optimal
3. **Monitor usage**: Use `--token-report` for awareness
4. **Cache when possible**: Reuse tokenizers for repeated operations

## Troubleshooting

### Common Issues

**Unknown model error:**
```bash
pampax token models  # List supported models
```

**Budget not persisting:**
```bash
# Check .pampax directory permissions
ls -la .pampax/token-budget.json
```

**Inaccurate token counts:**
```bash
# Use verbose mode for debugging
pampax token count "text" --model gpt-4 --verbose
```

### Debug Mode

Enable debug logging for troubleshooting:

```bash
DEBUG=1 pampax search "query" --token-report --verbose
```

## API Integration

The token system integrates with existing PAMPAX APIs:

### Search Integration
```javascript
import { createTokenizer } from './src/tokenization/tokenizer-factory.js';

const tokenizer = createTokenizer('gpt-4');
const tokens = tokenizer.countTokens(content);
```

### Profile Integration
```javascript
import { PackingProfileManager } from './src/tokenization/packing-profiles.js';

const manager = new PackingProfileManager(storage);
const profile = await manager.getProfile(repo, model);
```

## Future Enhancements

Planned improvements to the token integration system:

1. **Advanced tokenizers**: Integration with tiktoken for 100% accuracy
2. **Dynamic budgeting**: ML-powered budget optimization
3. **Real-time monitoring**: Live token usage tracking
4. **Cost estimation**: Model-specific cost calculations
5. **Batch operations**: Efficient processing of multiple files
6. **Plugin system**: Custom tokenizer implementations

## Contributing

To contribute to the token integration system:

1. **Model support**: Add new models to `tokenizer-factory.js`
2. **Accuracy improvements**: Enhance token counting algorithms
3. **Performance**: Optimize caching and batch operations
4. **Documentation**: Update this guide and CLI help
5. **Tests**: Add comprehensive test coverage

See the [development guide](../README.md) for contribution guidelines.