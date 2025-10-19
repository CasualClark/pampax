---
trigger: always_on
---

# PAMPA Testing & Examples Guide

This guide explains how to test PAMPA functionality using the provided examples and testing tools.

## Available Examples

### Chat App Example

-   **Location**: [examples/chat-app/](mdc:examples/chat-app)
-   **Purpose**: Real-world JavaScript project for testing indexing and search
-   **Features**: Multiple modules, utility functions, complex codebase structure
-   **Use Case**: Test semantic search on actual code patterns

### Test Implementations (Private)

-   **Location**: `test/test-implementations/`
-   **Purpose**: Private testing area for implementation experiments
-   **Features**: Gitignored content, safe for sensitive tests
-   **Use Case**: Test PAMPA with real codebases without exposing them publicly

## Testing Workflow

### 1. Basic Functionality Test

```bash
# Index the chat-app example
npx pampa index examples/chat-app/

# Test search functionality
npx pampa search "validation function" -p examples/chat-app/

# Check project stats
npx pampa info examples/chat-app/
```

### 2. Private Implementation Testing

```bash
# Copy your real codebase to test-implementations for testing
cp -r /path/to/your/project test/test-implementations/my-project/

# Index and test with real code
npx pampa index test/test-implementations/my-project/
npx pampa search "your specific query" -p test/test-implementations/my-project/

# Content is gitignored, safe for testing
```

### 3. MCP Integration Test

```bash
# Start MCP server
npx pampa mcp

# Test MCP tools via CLI or agent:
# - get_project_stats(path="examples/chat-app")
# - search_code("user validation", path="examples/chat-app")
# - get_code_chunk(sha_from_search_results)
```

### 4. Update Workflow Test

```bash
# Make changes to example files
# Then test update functionality
npx pampa update examples/chat-app/

# Verify changes are reflected in search
npx pampa search "new function name" -p examples/chat-app/
```

## Test Validation Points

### Indexing Tests

-   ✅ Database created at `examples/chat-app/.pampa/pampa.db`
-   ✅ Chunks directory populated with `.gz` files
-   ✅ Codemap generated at `examples/chat-app/pampa.codemap.json`
-   ✅ Functions properly extracted and chunked

### Search Tests

-   ✅ Semantic search returns relevant results
-   ✅ Similarity scores are reasonable (>0.3 for good matches)
-   ✅ Results include proper metadata (file, line, symbol name)
-   ✅ SHA references are valid and retrievable

### MCP Tests

-   ✅ All MCP tools respond without errors
-   ✅ Path parameters work correctly
-   ✅ Results are properly formatted JSON
-   ✅ get_code_chunk returns complete source code

## Test Scenarios

### New Function Detection

1. Add a new function to [examples/chat-app/modules/utils.js](mdc:examples/chat-app/modules/utils.js)
2. Run `update_project`
3. Search for the new function
4. Verify it's found and retrievable

### Code Modification Detection

1. Modify existing function in chat-app
2. Run `update_project`
3. Verify updated content is indexed
4. Check that old version is replaced

### Multi-language Support

1. Add files in different supported languages to examples
2. Test indexing and search across languages
3. Verify language-specific parsing works

### Real Project Testing (Private)

1. Copy real project to `test/test-implementations/`
2. Test PAMPA performance with actual codebase
3. Validate semantic search on domain-specific code
4. Content remains private (gitignored)

## Example Test Commands

```bash
# Full test cycle
npx pampa index examples/chat-app/
npx pampa search "sanitize text" -p examples/chat-app/
npx pampa info examples/chat-app/

# Update test
echo "export function testFunction() { return 'test'; }" >> examples/chat-app/modules/utils.js
npx pampa update examples/chat-app/
npx pampa search "testFunction" -p examples/chat-app/

# Private implementation test
npx pampa index test/test-implementations/your-project/
npx pampa search "domain specific query" -p test/test-implementations/your-project/

# MCP test
npx pampa mcp &
# Then test via MCP client
```

## Debugging Tips

-   Use `--debug` flag for detailed logging
-   Check `.pampa/pampa_debug.log` for troubleshooting
-   Verify file permissions on .pampa directory
-   Ensure embedding provider is properly configured
-   Use `test/test-implementations/` for testing with real codebases safely
