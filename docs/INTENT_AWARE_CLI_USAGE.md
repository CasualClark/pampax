# Intent-Aware CLI Usage Guide

This document describes the new intent-aware search capabilities integrated into the PAMPAX CLI.

## Overview

The intent-aware search system automatically classifies user queries to understand the user's intent and applies optimized search policies accordingly. This improves search relevance and performance by tailoring the search strategy to the specific type of information the user is looking for.

## Intent Types

The system recognizes five main intent types:

1. **Symbol** - Searches for code symbols (functions, classes, methods)
2. **Config** - Searches for configuration files and settings
3. **API** - Searches for API endpoints, routes, and handlers
4. **Incident** - Searches for error handling, debugging, and troubleshooting
5. **Search** - General search fallback

## Enhanced Search Command

The `pampax search` command now includes several new options:

### New Options

- `--intent` - Show classified intent information
- `--policy` - Show applied policy configuration
- `--explain-intent` - Show detailed intent classification explanation
- `--force-intent <type>` - Force specific intent type (symbol|config|api|incident|search)

### Usage Examples

#### Basic Intent-Aware Search
```bash
pampax search "getUserById function"
```
The system automatically detects this as a "symbol" intent and applies symbol-optimized search.

#### Show Intent Information
```bash
pampax search "database configuration settings" --intent
```
Output includes the detected intent type and confidence level.

#### Detailed Intent Explanation
```bash
pampax search "POST endpoint for users" --explain-intent
```
Shows detailed analysis including:
- Detected intent and confidence
- Extracted entities (functions, classes, etc.)
- Suggested policies
- Classification reasoning

#### Show Policy Configuration
```bash
pampax search "error handling in authentication" --policy
```
Displays the applied search policy including:
- Max depth settings
- Early stop thresholds
- Seed weights for different result types
- Content inclusion settings

#### Force Intent Type
```bash
pampax search "random query" --force-intent config --policy
```
Overrides automatic classification and forces a specific intent type.

#### JSON Output with Intent Information
```bash
pampax search "user authentication" --intent --policy --json
```
Returns structured JSON with all intent and policy details.

## Intent Debug Tools

### Intent Analysis Command

Analyze intent classification for any query:

```bash
pampax intent analyze <query>
```

#### Options
- `--json` - Output in JSON format
- `--verbose` - Show classifier configuration

#### Examples
```bash
# Basic analysis
pampax intent analyze "how to implement user authentication"

# JSON output
pampax intent analyze "getUserById function" --json

# With classifier details
pampax intent analyze "database connection issues" --verbose
```

### Policy Show Command

Display policy configuration for specific intent types:

```bash
pampax intent show <intentType>
```

#### Options
- `--repo <name>` - Repository name for context (default: "default")
- `--lang <language>` - Programming language for context
- `--token-budget <num>` - Token budget for context (default: "4000")
- `--json` - Output in JSON format
- `--verbose` - Show all available policies

#### Examples
```bash
# Show symbol intent policy
pampax intent show symbol

# Show policy with language context
pampax intent show api --lang typescript

# JSON output
pampax intent show incident --json

# Show all policies
pampax intent show config --verbose
```

## Intent Classification Details

### Symbol Intent

**Triggers**: function, method, class, definition, implementation, code, declaration, signature

**Example Queries**:
- "getUserById function definition"
- "UserService class implementation"
- "authentication method signature"

**Policy Characteristics**:
- Max depth: 2 (default)
- Focus on symbol definitions and declarations
- Higher weight for implementation details

### Config Intent

**Triggers**: config, configuration, setting, settings, environment, env, .env, yaml, json

**Example Queries**:
- "database configuration settings"
- "environment variables setup"
- "server config file"

**Policy Characteristics**:
- Max depth: 1 (conservative)
- Focus on configuration files
- Higher weight for settings and constants

### API Intent

**Triggers**: api, endpoint, route, handler, rest, http, get, post, put, delete

**Example Queries**:
- "POST endpoint for users"
- "API authentication middleware"
- "REST route for user management"

**Policy Characteristics**:
- Max depth: 2
- Focus on route definitions and handlers
- Higher weight for endpoint registrations

### Incident Intent

**Triggers**: error, bug, issue, crash, failure, exception, problem, debug, fix

**Example Queries**:
- "authentication error handling"
- "database connection failure"
- "null pointer exception debugging"

**Policy Characteristics**:
- Max depth: 3 (aggressive)
- Include error handling and related code
- Higher weight for error-related content

### Search Intent (Fallback)

**Triggers**: General queries that don't match other intents

**Example Queries**:
- "user management"
- "file processing"
- "data validation"

**Policy Characteristics**:
- Max depth: 2
- Balanced search approach
- General-purpose weights

## Entity Extraction

The system extracts various entities from queries:

- **Functions**: getUserById, authenticateUser, calculateTotal
- **Classes**: UserService, DatabaseManager, AuthController
- **Files**: config.json, user.js, database.sql
- **Config**: .env, settings.yaml, database.config
- **Routes**: /api/users, GET /users, POST /auth

## Policy Optimization

Policies are automatically adjusted based on:

### Confidence Levels
- **High confidence** (>80%): More aggressive search (higher max depth, more results)
- **Low confidence** (<50%): Conservative search (lower max depth, fewer results)

### Query Length
- **Short queries** (<10 chars): Broader search scope
- **Long queries** (>50 chars): More focused search

### Token Budget
- **Low budget** (<2000): Disable content inclusion, reduce early stop threshold
- **High budget**: Full content and comprehensive search

### Language Context
- **Python**: Higher weight for definitions and implementations
- **JavaScript/TypeScript**: Higher weight for handlers and middleware
- **Java**: Higher weight for class definitions
- **Go**: Higher weight for package structures

## Backward Compatibility

All existing CLI functionality remains unchanged:

```bash
# Traditional search still works
pampax search "user authentication"
pampax search "database query" --k 20
pampax search "error handling" --json
```

The intent-aware features are opt-in through the new flags.

## Performance Considerations

### Intent Classification
- Fast pattern-based classification (typically <1ms)
- Cached results for repeated queries
- Graceful fallback to "search" intent on errors

### Policy Application
- Minimal overhead for policy evaluation
- Optimized seed mix configurations
- Early stop thresholds prevent excessive processing

### Search Optimization
- Intent-specific seed weights improve relevance
- Context-aware depth limits reduce unnecessary processing
- Language-specific optimizations when available

## Troubleshooting

### Common Issues

1. **Incorrect Intent Classification**
   - Use `--explain-intent` to understand classification
   - Try `--force-intent` to override automatic classification
   - Check query wording for intent-triggering keywords

2. **Unexpected Search Results**
   - Use `--policy` to see applied search policy
   - Try `pampax intent show <type>` to understand policy behavior
   - Consider using `--force-intent` with appropriate type

3. **Performance Issues**
   - Check token budget with `--verbose` output
   - Use `--policy` to see early stop thresholds
   - Consider more specific queries for better intent classification

### Debug Commands

```bash
# Analyze why a query got a specific intent
pampax intent analyze "your query" --verbose

# Check what policy will be applied
pampax intent show symbol --lang your_lang

# Test with forced intent to compare results
pampax search "query" --force-intent incident --policy
```

## Integration with Existing Workflows

### CI/CD Integration
```bash
# Use intent-aware search in scripts
INTENT_TYPE=$(pampax intent analyze "your query" --json | jq -r '.intent.type')
pampax search "your query" --force-intent "$INTENT_TYPE" --json
```

### Development Workflow
```bash
# Quick intent debugging during development
pampax intent analyze "current feature implementation" --explain-intent

# Policy-aware search for code reviews
pampax search "authentication flow" --policy --verbose
```

### Documentation Generation
```bash
# Extract API information
pampax search "API endpoints" --force-intent api --json > api-docs.json

# Configuration documentation
pampax search "environment settings" --force-intent config --explain-intent
```

## Examples by Use Case

### Code Navigation
```bash
# Find function definitions
pampax search "getUserById implementation" --explain-intent

# Locate class definitions
pampax search "UserService class" --intent

# Find API endpoints
pampax search "user authentication endpoint" --policy
```

### Debugging
```bash
# Find error handling
pampax search "authentication error" --force-intent incident --explain-intent

# Locate configuration issues
pampax search "database connection config" --intent --policy
```

### Documentation
```bash
# Extract API documentation
pampax search "REST API routes" --force-intent api --json

# Configuration documentation
pampax search "server configuration" --force-intent config --explain-intent
```

## Migration Guide

### From Legacy Search

**Before:**
```bash
pampax search "user authentication function"
```

**After (with intent awareness):**
```bash
pampax search "user authentication function" --explain-intent
pampax search "user authentication function" --policy
pampax search "user authentication function" --force-intent symbol
```

### Script Updates

**Legacy Script:**
```bash
pampax search "$QUERY" --json > results.json
```

**Enhanced Script:**
```bash
# Get intent information
INTENT_INFO=$(pampax intent analyze "$QUERY" --json)
INTENT_TYPE=$(echo "$INTENT_INFO" | jq -r '.intent.type')

# Search with intent context
pampax search "$QUERY" --intent --policy --json > enhanced_results.json
```

This enhanced CLI provides powerful intent-aware search capabilities while maintaining full backward compatibility with existing workflows.