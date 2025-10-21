# Implementation Plan: Progressive Context Loading

## 🎯 Feature Overview

**Goal**: Minimize token usage by retrieving code context at increasing detail levels, only fetching what's needed.

**Token Savings**: 60-80% reduction in typical queries by starting with structure and progressively loading details.

**User Experience**: Transparent to AI - it just calls one tool multiple times with increasing detail levels.

---

## 📋 Requirements

### Functional Requirements
1. Single MCP tool that returns different detail levels of code context
2. Four detail levels: outline → signatures → implementation → full
3. Automatic token counting and budget enforcement
4. Ability to request specific files at higher detail
5. Caching of previous levels to avoid re-computation

### Non-Functional Requirements
1. Response time: <2s for outline, <5s for full details
2. Memory efficient: Don't load entire codebase into memory
3. Backwards compatible: Works with existing search_code tool
4. Progressive: Each level includes info from previous levels

---

## 🏗️ Architecture

### Component Structure
```
src/
├── progressive/
│   ├── context-builder.js      # Main progressive context logic
│   ├── detail-levels.js        # Level definitions and formatters
│   ├── token-counter.js        # Token counting utilities
│   └── cache-manager.js        # Cache progressive results
├── mcp-server.js               # Add new tool registration
└── storage/
    └── vector-store.js         # Existing (minor modifications)
```

### Data Flow
```
AI Request → MCP Tool → Context Builder → Detail Level Formatter → Token Counter → Response
                ↓
         Cache Manager (store for next level)
```

---

## 📝 Implementation Steps

### Step 1: Create Detail Level Definitions
**File**: `src/progressive/detail-levels.js`

```javascript
/**
 * Defines the four detail levels and their characteristics
 */

const DETAIL_LEVELS = {
  outline: {
    level: 0,
    description: "File structure with high-level summaries",
    includes: ["file_paths", "exports", "brief_summary"],
    avgTokensPerFile: 10,
    maxTokensTotal: 500
  },
  
  signatures: {
    level: 1,
    description: "Function/class signatures with parameters and return types",
    includes: ["outline", "function_signatures", "class_definitions", "imports"],
    avgTokensPerFile: 50,
    maxTokensTotal: 2000
  },
  
  implementation: {
    level: 2,
    description: "Key implementation details without full code",
    includes: ["signatures", "function_bodies_summary", "important_logic"],
    avgTokensPerFile: 150,
    maxTokensTotal: 4000
  },
  
  full: {
    level: 3,
    description: "Complete code with comments and documentation",
    includes: ["implementation", "full_source", "comments", "documentation"],
    avgTokensPerFile: 400,
    maxTokensTotal: 8000
  }
};

/**
 * Format code at specified detail level
 */
function formatAtLevel(fileData, detailLevel) {
  const level = DETAIL_LEVELS[detailLevel];
  if (!level) throw new Error(`Unknown detail level: ${detailLevel}`);
  
  const formatted = {
    file: fileData.path,
    level: detailLevel,
    content: {}
  };
  
  switch (detailLevel) {
    case 'outline':
      return formatOutline(fileData);
    case 'signatures':
      return formatSignatures(fileData);
    case 'implementation':
      return formatImplementation(fileData);
    case 'full':
      return formatFull(fileData);
  }
}

function formatOutline(fileData) {
  return {
    file: fileData.path,
    type: fileData.language,
    exports: fileData.symbols.filter(s => s.exported).map(s => s.name),
    summary: generateFileSummary(fileData),
    line_count: fileData.content.split('\n').length
  };
}

function formatSignatures(fileData) {
  const outline = formatOutline(fileData);
  
  return {
    ...outline,
    imports: extractImports(fileData),
    classes: fileData.symbols
      .filter(s => s.type === 'class')
      .map(c => ({
        name: c.name,
        extends: c.extends,
        implements: c.implements,
        methods: c.children?.map(m => m.signature) || []
      })),
    functions: fileData.symbols
      .filter(s => s.type === 'function')
      .map(f => ({
        name: f.name,
        signature: f.signature,
        async: f.async,
        params: f.params,
        returns: f.returnType
      }))
  };
}

function formatImplementation(fileData) {
  const signatures = formatSignatures(fileData);
  
  return {
    ...signatures,
    implementations: fileData.symbols
      .filter(s => s.type === 'function' || s.type === 'method')
      .map(fn => ({
        name: fn.name,
        signature: fn.signature,
        summary: summarizeImplementation(fn),
        calls: fn.calls || [],
        complexity: estimateComplexity(fn)
      }))
  };
}

function formatFull(fileData) {
  return {
    file: fileData.path,
    level: 'full',
    content: fileData.content,
    symbols: fileData.symbols
  };
}

// Helper functions
function generateFileSummary(fileData) {
  // Use first doc comment or generate from exports
  const docComment = fileData.content.match(/^\/\*\*[\s\S]*?\*\//);
  if (docComment) {
    return docComment[0].replace(/[\/\*]/g, '').trim().slice(0, 200);
  }
  
  const exports = fileData.symbols.filter(s => s.exported);
  if (exports.length > 0) {
    return `Exports: ${exports.map(s => s.name).join(', ')}`;
  }
  
  return `${fileData.language} file with ${fileData.symbols.length} symbols`;
}

function extractImports(fileData) {
  const importRegex = /import\s+.*?from\s+['"]([^'"]+)['"]/g;
  const imports = [];
  let match;
  
  while ((match = importRegex.exec(fileData.content)) !== null) {
    imports.push(match[1]);
  }
  
  return imports;
}

function summarizeImplementation(fn) {
  // Extract key logic points from function body
  const body = fn.content || '';
  const keyPatterns = [
    /if\s*\(/g,  // conditionals
    /for\s*\(/g, // loops
    /await\s+/g, // async calls
    /throw\s+/g, // error handling
    /return\s+/g // returns
  ];
  
  const summary = {
    conditionals: (body.match(keyPatterns[0]) || []).length,
    loops: (body.match(keyPatterns[1]) || []).length,
    asyncCalls: (body.match(keyPatterns[2]) || []).length,
    errorHandling: (body.match(keyPatterns[3]) || []).length,
    returns: (body.match(keyPatterns[4]) || []).length
  };
  
  return `${summary.conditionals} branches, ${summary.loops} loops, ${summary.asyncCalls} async calls`;
}

function estimateComplexity(fn) {
  // Cyclomatic complexity estimate
  const body = fn.content || '';
  const complexityMarkers = [
    /if\s*\(/g,
    /else\s+if/g,
    /while\s*\(/g,
    /for\s*\(/g,
    /case\s+/g,
    /catch\s*\(/g,
    /&&|\|\|/g
  ];
  
  let complexity = 1; // base complexity
  complexityMarkers.forEach(pattern => {
    complexity += (body.match(pattern) || []).length;
  });
  
  return complexity;
}

module.exports = {
  DETAIL_LEVELS,
  formatAtLevel
};
```

### Step 2: Create Token Counter
**File**: `src/progressive/token-counter.js`

```javascript
/**
 * Estimates and tracks token usage for progressive context
 */

// Simple token estimation (you can replace with tiktoken for accuracy)
function estimateTokens(text) {
  if (!text) return 0;
  
  // Rough estimate: 1 token ≈ 4 characters for code
  // More conservative than prose (which is ~4 chars = 0.75 tokens)
  return Math.ceil(text.length / 3);
}

function countTokensInObject(obj) {
  const json = JSON.stringify(obj, null, 2);
  return estimateTokens(json);
}

class TokenBudgetTracker {
  constructor(budget = 4000) {
    this.budget = budget;
    this.used = 0;
    this.items = [];
  }
  
  addItem(item, tokens) {
    this.used += tokens;
    this.items.push({ item, tokens });
    return this.remaining();
  }
  
  remaining() {
    return Math.max(0, this.budget - this.used);
  }
  
  canFit(tokens) {
    return this.used + tokens <= this.budget;
  }
  
  getReport() {
    return {
      budget: this.budget,
      used: this.used,
      remaining: this.remaining(),
      percentage: Math.round((this.used / this.budget) * 100),
      items: this.items.length
    };
  }
}

/**
 * Fit results to token budget by trimming less relevant items
 */
function fitToBudget(results, budget) {
  const tracker = new TokenBudgetTracker(budget);
  const fitted = [];
  
  // Sort by relevance score (highest first)
  const sorted = [...results].sort((a, b) => (b.score || 0) - (a.score || 0));
  
  for (const result of sorted) {
    const tokens = countTokensInObject(result);
    
    if (tracker.canFit(tokens)) {
      tracker.addItem(result, tokens);
      fitted.push({
        ...result,
        _tokens: tokens
      });
    } else {
      // Try to include at least file path and summary
      const minimal = {
        file: result.file,
        summary: `(truncated - ${tokens} tokens, budget exceeded)`,
        score: result.score
      };
      const minimalTokens = countTokensInObject(minimal);
      
      if (tracker.canFit(minimalTokens)) {
        tracker.addItem(minimal, minimalTokens);
        fitted.push({
          ...minimal,
          _tokens: minimalTokens,
          _truncated: true
        });
      }
      break; // Budget exhausted
    }
  }
  
  return {
    results: fitted,
    tokenReport: tracker.getReport()
  };
}

module.exports = {
  estimateTokens,
  countTokensInObject,
  TokenBudgetTracker,
  fitToBudget
};
```

### Step 3: Create Context Builder
**File**: `src/progressive/context-builder.js`

```javascript
/**
 * Main progressive context building logic
 */

const { formatAtLevel, DETAIL_LEVELS } = require('./detail-levels');
const { fitToBudget, countTokensInObject } = require('./token-counter');
const CacheManager = require('./cache-manager');

class ProgressiveContextBuilder {
  constructor(vectorStore) {
    this.vectorStore = vectorStore;
    this.cache = new CacheManager();
  }
  
  /**
   * Build context at specified detail level
   */
  async buildContext(options) {
    const {
      query,
      detail_level = 'implementation',
      token_budget = 4000,
      specific_files = [],
      include_related = true,
      session_id = null
    } = options;
    
    // Validate detail level
    if (!DETAIL_LEVELS[detail_level]) {
      throw new Error(`Invalid detail_level: ${detail_level}. Must be one of: outline, signatures, implementation, full`);
    }
    
    // Check cache for this session
    const cacheKey = this.cache.buildKey(query, detail_level, specific_files);
    const cached = session_id ? this.cache.get(session_id, cacheKey) : null;
    
    if (cached) {
      return {
        ...cached,
        _cached: true
      };
    }
    
    // Step 1: Search for relevant files
    let relevantFiles = [];
    
    if (specific_files.length > 0) {
      // User specified exact files
      relevantFiles = await this.getFilesByPath(specific_files);
    } else {
      // Search based on query
      const searchResults = await this.vectorStore.search(query, {
        limit: this.calculateSearchLimit(detail_level),
        threshold: 0.3
      });
      relevantFiles = searchResults;
    }
    
    // Step 2: Expand with related files if requested
    if (include_related && detail_level !== 'outline') {
      relevantFiles = await this.expandWithRelated(relevantFiles);
    }
    
    // Step 3: Format at requested detail level
    const formatted = relevantFiles.map(file => 
      formatAtLevel(file, detail_level)
    );
    
    // Step 4: Fit to token budget
    const { results, tokenReport } = fitToBudget(formatted, token_budget);
    
    // Step 5: Build response
    const response = {
      query,
      detail_level,
      files_found: relevantFiles.length,
      files_included: results.length,
      results,
      token_usage: tokenReport,
      next_steps: this.suggestNextSteps(detail_level, tokenReport, results)
    };
    
    // Cache for this session
    if (session_id) {
      this.cache.set(session_id, cacheKey, response);
    }
    
    return response;
  }
  
  calculateSearchLimit(detailLevel) {
    // Fetch more files for lower detail levels (they're cheaper)
    const limits = {
      outline: 50,
      signatures: 20,
      implementation: 10,
      full: 5
    };
    return limits[detailLevel] || 10;
  }
  
  async expandWithRelated(files) {
    const related = new Set(files);
    
    for (const file of files) {
      // Add imported files
      if (file.imports) {
        for (const importPath of file.imports) {
          const imported = await this.resolveImport(importPath, file.path);
          if (imported) related.add(imported);
        }
      }
    }
    
    return Array.from(related);
  }
  
  async resolveImport(importPath, fromFile) {
    // Try to resolve relative imports to actual files
    // This is simplified - you'd want proper path resolution
    try {
      const resolved = await this.vectorStore.getFileByPath(importPath);
      return resolved;
    } catch (err) {
      return null;
    }
  }
  
  async getFilesByPath(paths) {
    const files = [];
    for (const path of paths) {
      try {
        const file = await this.vectorStore.getFileByPath(path);
        if (file) files.push(file);
      } catch (err) {
        console.warn(`Could not load file: ${path}`);
      }
    }
    return files;
  }
  
  suggestNextSteps(currentLevel, tokenReport, results) {
    const suggestions = [];
    
    // Suggest going deeper if budget allows
    const levelOrder = ['outline', 'signatures', 'implementation', 'full'];
    const currentIndex = levelOrder.indexOf(currentLevel);
    
    if (currentIndex < levelOrder.length - 1) {
      const nextLevel = levelOrder[currentIndex + 1];
      const avgTokensNeeded = DETAIL_LEVELS[nextLevel].avgTokensPerFile * results.length;
      
      if (avgTokensNeeded < tokenReport.budget) {
        suggestions.push({
          action: 'increase_detail',
          detail_level: nextLevel,
          reason: `Budget allows for more detail (${avgTokensNeeded} tokens estimated)`
        });
      }
    }
    
    // Suggest specific files if too many results
    if (results.length > 5 && currentLevel === 'outline') {
      suggestions.push({
        action: 'specify_files',
        reason: `${results.length} files found. Consider requesting specific files for more detail`,
        example_files: results.slice(0, 3).map(r => r.file)
      });
    }
    
    // Suggest related files if we found key imports
    const hasImports = results.some(r => r.imports && r.imports.length > 0);
    if (hasImports && !suggestions.some(s => s.action === 'increase_detail')) {
      suggestions.push({
        action: 'explore_related',
        reason: 'Found imported dependencies that might be relevant'
      });
    }
    
    return suggestions.length > 0 ? suggestions : null;
  }
}

module.exports = ProgressiveContextBuilder;
```

### Step 4: Create Cache Manager
**File**: `src/progressive/cache-manager.js`

```javascript
/**
 * Caches progressive context results to avoid re-computation
 */

class CacheManager {
  constructor(maxAge = 300000) { // 5 minutes default
    this.sessions = new Map();
    this.maxAge = maxAge;
  }
  
  buildKey(query, detailLevel, files) {
    const filesKey = files.length > 0 ? files.sort().join(',') : '';
    return `${query}:${detailLevel}:${filesKey}`;
  }
  
  get(sessionId, key) {
    if (!this.sessions.has(sessionId)) return null;
    
    const session = this.sessions.get(sessionId);
    const cached = session.get(key);
    
    if (!cached) return null;
    
    // Check if expired
    if (Date.now() - cached.timestamp > this.maxAge) {
      session.delete(key);
      return null;
    }
    
    return cached.data;
  }
  
  set(sessionId, key, data) {
    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, new Map());
    }
    
    const session = this.sessions.get(sessionId);
    session.set(key, {
      data,
      timestamp: Date.now()
    });
    
    // Cleanup old sessions periodically
    this.cleanupOldSessions();
  }
  
  clear(sessionId) {
    if (sessionId) {
      this.sessions.delete(sessionId);
    } else {
      this.sessions.clear();
    }
  }
  
  cleanupOldSessions() {
    const now = Date.now();
    
    for (const [sessionId, session] of this.sessions.entries()) {
      // Remove expired entries
      for (const [key, cached] of session.entries()) {
        if (now - cached.timestamp > this.maxAge) {
          session.delete(key);
        }
      }
      
      // Remove empty sessions
      if (session.size === 0) {
        this.sessions.delete(sessionId);
      }
    }
  }
  
  getStats() {
    let totalEntries = 0;
    for (const session of this.sessions.values()) {
      totalEntries += session.size;
    }
    
    return {
      sessions: this.sessions.size,
      total_entries: totalEntries,
      max_age_ms: this.maxAge
    };
  }
}

module.exports = CacheManager;
```

### Step 5: Register MCP Tool
**File**: `src/mcp-server.js` (modify existing)

```javascript
// Add to imports
const ProgressiveContextBuilder = require('./progressive/context-builder');

// In your server setup
const contextBuilder = new ProgressiveContextBuilder(vectorStore);

// Add to tools array
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      // ... existing tools ...
      
      {
        name: "get_context_progressive",
        description: `Get code context at increasing detail levels to minimize token usage.
        
Detail Levels:
- outline: File structure and exports (10 tokens/file)
- signatures: Function/class signatures (50 tokens/file)  
- implementation: Key logic without full code (150 tokens/file)
- full: Complete source code (400 tokens/file)

Start with 'outline' to see what's available, then request specific files at higher detail.`,
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Search query to find relevant code"
            },
            detail_level: {
              type: "string",
              enum: ["outline", "signatures", "implementation", "full"],
              default: "implementation",
              description: "Level of detail to retrieve"
            },
            token_budget: {
              type: "number",
              default: 4000,
              description: "Maximum tokens to return"
            },
            specific_files: {
              type: "array",
              items: { type: "string" },
              default: [],
              description: "Specific file paths to retrieve (optional)"
            },
            include_related: {
              type: "boolean",
              default: true,
              description: "Include imported/related files"
            }
          },
          required: ["query"]
        }
      }
    ]
  };
});

// Add tool handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  
  if (name === "get_context_progressive") {
    try {
      // Generate session ID from request context if available
      const sessionId = request.meta?.sessionId || `session_${Date.now()}`;
      
      const result = await contextBuilder.buildContext({
        ...args,
        session_id: sessionId
      });
      
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2)
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error: ${error.message}`
          }
        ],
        isError: true
      };
    }
  }
  
  // ... existing tool handlers ...
});
```

---

## 🧪 Testing Plan

### Unit Tests
**File**: `tests/progressive/context-builder.test.js`

```javascript
const ProgressiveContextBuilder = require('../../src/progressive/context-builder');

describe('ProgressiveContextBuilder', () => {
  let builder;
  let mockVectorStore;
  
  beforeEach(() => {
    mockVectorStore = {
      search: jest.fn(),
      getFileByPath: jest.fn()
    };
    builder = new ProgressiveContextBuilder(mockVectorStore);
  });
  
  test('outline level returns minimal tokens', async () => {
    mockVectorStore.search.mockResolvedValue([
      {
        path: 'src/auth.js',
        language: 'javascript',
        symbols: [{ name: 'login', exported: true }],
        content: 'function login() {}'
      }
    ]);
    
    const result = await builder.buildContext({
      query: 'auth',
      detail_level: 'outline',
      token_budget: 1000
    });
    
    expect(result.detail_level).toBe('outline');
    expect(result.token_usage.used).toBeLessThan(100);
    expect(result.results[0]).toHaveProperty('exports');
    expect(result.results[0]).not.toHaveProperty('implementations');
  });
  
  test('respects token budget', async () => {
    mockVectorStore.search.mockResolvedValue(
      Array(20).fill({
        path: 'src/test.js',
        language: 'javascript',
        symbols: [],
        content: 'x'.repeat(5000)
      })
    );
    
    const result = await builder.buildContext({
      query: 'test',
      detail_level: 'full',
      token_budget: 1000
    });
    
    expect(result.token_usage.used).toBeLessThanOrEqual(1000);
    expect(result.files_included).toBeLessThan(result.files_found);
  });
  
  test('suggests next steps appropriately', async () => {
    mockVectorStore.search.mockResolvedValue([
      {
        path: 'src/simple.js',
        language: 'javascript',
        symbols: [],
        content: 'const x = 1;'
      }
    ]);
    
    const result = await builder.buildContext({
      query: 'simple',
      detail_level: 'outline',
      token_budget: 4000
    });
    
    expect(result.next_steps).toBeTruthy();
    expect(result.next_steps[0].action).toBe('increase_detail');
    expect(result.next_steps[0].detail_level).toBe('signatures');
  });
});
```

### Integration Tests
**File**: `tests/integration/progressive-mcp.test.js`

```javascript
const { spawn } = require('child_process');
const path = require('path');

describe('Progressive Context MCP Tool', () => {
  let mcpProcess;
  
  beforeAll(() => {
    // Start MCP server
    mcpProcess = spawn('node', [
      path.join(__dirname, '../../src/mcp-server.js')
    ]);
  });
  
  afterAll(() => {
    mcpProcess.kill();
  });
  
  test('AI can query at outline level', async () => {
    const request = {
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: 'get_context_progressive',
        arguments: {
          query: 'authentication',
          detail_level: 'outline'
        }
      },
      id: 1
    };
    
    const response = await sendMCPRequest(mcpProcess, request);
    
    expect(response.result).toBeDefined();
    expect(response.result.content[0].type).toBe('text');
    
    const result = JSON.parse(response.result.content[0].text);
    expect(result.detail_level).toBe('outline');
    expect(result.token_usage.used).toBeLessThan(500);
  });
  
  test('AI can progressively increase detail', async () => {
    // First request at outline level
    const outlineResponse = await callTool(mcpProcess, {
      query: 'payment processing',
      detail_level: 'outline'
    });
    
    const outline = JSON.parse(outlineResponse.content[0].text);
    const firstFile = outline.results[0].file;
    
    // Second request at full level for specific file
    const fullResponse = await callTool(mcpProcess, {
      query: 'payment processing',
      detail_level: 'full',
      specific_files: [firstFile]
    });
    
    const full = JSON.parse(fullResponse.content[0].text);
    expect(full.detail_level).toBe('full');
    expect(full.results[0].content).toBeTruthy();
  });
});

// Helper function
async function callTool(process, args) {
  const request = {
    jsonrpc: '2.0',
    method: 'tools/call',
    params: {
      name: 'get_context_progressive',
      arguments: args
    },
    id: Date.now()
  };
  
  return await sendMCPRequest(process, request);
}
```

---

## 📊 Success Metrics

### Quantitative Metrics
- **Token reduction**: 60-80% vs full context retrieval
- **Response time**: <2s for outline, <5s for full
- **Cache hit rate**: >50% for repeated queries
- **Accuracy**: No loss vs full context (same search quality)

### Qualitative Metrics
- **AI adoption**: AI agents naturally use progressive loading
- **User satisfaction**: Faster responses, lower costs
- **Developer feedback**: Easy to understand in logs

---

## 🔍 Monitoring & Debugging

### Add Logging
```javascript
// In context-builder.js
const logger = require('../utils/logger');

async buildContext(options) {
  logger.info('Progressive context request', {
    query: options.query,
    detail_level: options.detail_level,
    token_budget: options.token_budget
  });
  
  const result = await this.buildContextInternal(options);
  
  logger.info('Progressive context response', {
    files_found: result.files_found,
    files_included: result.files_included,
    tokens_used: result.token_usage.used,
    cache_hit: result._cached || false
  });
  
  return result;
}
```

### Add Metrics Endpoint
```javascript
// In mcp-server.js
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === 'get_progressive_stats') {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          cache: contextBuilder.cache.getStats(),
          usage: {
            total_requests: contextBuilder.stats.requests,
            avg_tokens: contextBuilder.stats.avgTokens,
            cache_hit_rate: contextBuilder.stats.cacheHitRate
          }
        })
      }]
    };
  }
});
```

---

## 🚀 Deployment Checklist

- [ ] Create all files in `src/progressive/`
- [ ] Add tests in `tests/progressive/`
- [ ] Update `mcp-server.js` with new tool
- [ ] Test with mock AI agent (curl or Postman)
- [ ] Test with real Claude/Cursor integration
- [ ] Add logging and monitoring
- [ ] Update main README with examples
- [ ] Performance test with large codebase (10k+ files)
- [ ] Monitor token usage in production
- [ ] Gather user feedback

---

## 📚 Usage Examples for Documentation

### Example 1: Starting with Outline
```
AI Query: "Show me the authentication system"

Tool Call:
{
  "query": "authentication",
  "detail_level": "outline",
  "token_budget": 1000
}

Response: (50 tokens)
- src/auth/login.js: Exports login, logout
- src/auth/middleware.js: Exports requireAuth, checkPermissions
- src/auth/tokens.js: Exports generateToken, verifyToken

Next Steps: Call with detail_level="signatures" to see function signatures
```

### Example 2: Getting Function Signatures
```
AI Query: "What are the parameters for the login function?"

Tool Call:
{
  "query": "authentication login",
  "detail_level": "signatures",
  "specific_files": ["src/auth/login.js"],
  "token_budget": 500
}

Response: (150 tokens)
function login(email: string, password: string): Promise<AuthToken>
function logout(token: string): Promise<void>
...
```

### Example 3: Full Implementation
```
AI Query: "Show me the complete login implementation"

Tool Call:
{
  "query": "login",
  "detail_level": "full",
  "specific_files": ["src/auth/login.js"],
  "token_budget": 2000
}

Response: (1200 tokens)
[Full source code of login.js]
```

---

## 🎯 Next Phase: Advanced Features

After basic implementation is working, consider:

1. **Streaming responses** - Send outline immediately, signatures as they load
2. **Smart caching** - Pre-load likely next files based on patterns
3. **Diff viewing** - Show only changed portions for updated files
4. **Interactive refinement** - "Show more about the payment part"

---

## ❓ FAQ for Builders

**Q: Why not just use the existing search_code tool?**
A: That returns everything at once. This gives AI control over detail level and token usage.

**Q: How does caching work across multiple tool calls?**
A: Session-based caching. Each conversation gets a session ID, and we cache results for 5 minutes.

**Q: What if the AI asks for a file that doesn't exist?**
A: We gracefully skip it and return what we can find, with a warning in the response.

**Q: How accurate is the token estimation?**
A: ~90% accurate for English code. You can swap in tiktoken for exact OpenAI token counts.

**Q: Can this work without the vector store?**
A: Yes! You can adapt it to work with any search mechanism - just replace vectorStore.search().

---

**Ready to implement?** Start with Step 1 and work sequentially. Each step is independently testable.
