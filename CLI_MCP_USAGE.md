# 🚀 PAMPAX CLI & MCP Usage Guide

Complete guide for using PAMPAX to index projects, search code, and leverage reranking capabilities.

## 📋 Table of Contents

- [🔧 CLI Commands](#-cli-commands)
- [🤖 MCP Commands](#-mcp-commands)
- [🔍 Advanced Search with Reranking](#-advanced-search-with-reranking)
- [📊 Project Indexing](#-project-indexing)
- [🎯 Practical Examples](#-practical-examples)
- [⚙️ Configuration](️-configuration)

---

## 🔧 CLI Commands

### 🏠 Basic Commands

#### **Help & Info**
```bash
# Show all available commands
pampax --help

# Show version
pampax --version

# Get project info
pampax info
```

#### **Project Indexing**
```bash
# Index current directory with auto provider
pampax index

# Index specific directory
pampax index /path/to/project

# Index with specific provider
pampax index --provider openai
pampax index --provider transformers
pampax index --provider ollama
pampax index --provider cohere

# Index with encryption (if PAMPAX_ENCRYPTION_KEY is set)
pampax index --encrypt on
```

#### **Code Search**
```bash
# Basic search
pampax search "function name"

# Search in specific directory
pampax search "database connection" /path/to/project

# Search with limit
pampax search "user authentication" --limit 20

# Search specific language
pampax search "class definition" --lang python
pampax search "component" --lang typescript
pampax search "widget" --lang dart
```

### 🎯 Advanced Search Options

#### **Path Filtering**
```bash
# Search in specific file patterns
pampax search "API endpoint" --path_glob "src/api/**"
pampax search "database" --path_glob "**/*.sql"
pampax search "test" --path_glob "**/*test*"

# Multiple glob patterns
pampax search "config" --path_glob "config/**" --path_glob "**/*.config.*"
```

#### **Language Filtering**
```bash
# Single language
pampax search "async function" --lang javascript

# Multiple languages
pampax search "error handling" --lang python --lang java --lang typescript

# Exclude languages (search all but specified)
pampax search "utility" --lang !javascript --lang !python
```

#### **Tag Filtering**
```bash
# Search by custom tags
pampax search "authentication" --tags security --tags auth

# Multiple tags
pampax search "payment" --tags stripe --tags payment --tags billing
```

### 🔥 Reranking & Search Enhancement

#### **Enable Reranking**
```bash
# Use transformers reranker (local)
pampax search "user login" --reranker transformers

# Use API reranker (more powerful)
pampax search "payment processing" --reranker api

# Turn off reranking (default)
pampax search "simple search" --reranker off
```

#### **Hybrid Search**
```bash
# Enable hybrid search (default: on)
pampax search "complex query" --hybrid on

# Disable hybrid search (semantic only)
pampax search "semantic only" --hybrid off

# BM25 keyword search
pampax search "keyword match" --bm25 on
```

#### **Symbol-Aware Boosting**
```bash
# Enable symbol boosting (default: on)
pampax search "MyClass" --symbol_boost on

# Disable symbol boosting
pampax search "text search" --symbol_boost off
```

### 🌐 Provider Configuration

#### **OpenAI Provider**
```bash
# Set API key
export OPENAI_API_KEY="your-openai-key"

# Use OpenAI for indexing and search
pampax index --provider openai
pampax search "query" --provider openai
```

#### **Local Transformers Provider**
```bash
# Use local embeddings (requires @xenova/transformers)
pampax index --provider transformers
pampax search "query" --provider transformers
```

#### **Ollama Provider**
```bash
# Use Ollama for local embeddings
export OLLAMA_API_URL="http://localhost:11434"
pampax index --provider ollama
pampax search "query" --provider ollama
```

#### **Cohere Provider**
```bash
# Set Cohere API key
export COHERE_API_KEY="your-cohere-key"

# Use Cohere for embeddings
pampax index --provider cohere
pampax search "query" --provider cohere
```

---

## 🤖 MCP Commands

### 🚀 Starting MCP Server

#### **Basic MCP Server**
```bash
# Start MCP server
pampax mcp

# Start with custom project path
pampax mcp --project /path/to/project

# Start with specific configuration
pampax mcp --config /path/to/config.json
```

#### **MCP Server with Claude Desktop**
```bash
# Add to Claude Desktop config (~/.claude/desktop_config.json)
{
  "mcpServers": {
    "pampax": {
      "command": "pampax-mcp",
      "args": ["--project", "/path/to/your/project"]
    }
  }
}
```

### 📋 MCP Tools Available

#### **Project Management**
```javascript
// Index a project
await mcp.call("index_project", {
  "path": "/path/to/project",
  "provider": "openai",  // or "transformers", "ollama", "cohere"
  "encrypt": false
});

// Get project information
await mcp.call("get_project_info", {
  "path": "/path/to/project"
});
```

#### **Code Search**
```javascript
// Basic search
await mcp.call("search_code", {
  "query": "user authentication",
  "path": "/path/to/project",
  "limit": 10
});

// Advanced search with filters
await mcp.call("search_code", {
  "query": "API endpoint",
  "path": "/path/to/project",
  "lang": ["python", "javascript"],
  "path_glob": ["src/api/**", "**/*route*"],
  "limit": 20,
  "reranker": "transformers",
  "hybrid": true,
  "symbol_boost": true
});
```

#### **Context Management**
```javascript
// Get specific chunk
await mcp.call("get_chunk", {
  "chunk_id": "chunk_12345",
  "path": "/path/to/project"
});

// Get context around a chunk
await mcp.call("get_context", {
  "chunk_id": "chunk_12345",
  "path": "/path/to/project",
  "radius": 3
});
```

### 🔧 MCP Configuration

#### **Environment Variables**
```bash
# Required for OpenAI
export OPENAI_API_KEY="your-key"

# Required for Cohere
export COHERE_API_KEY="your-key"

# Optional: Ollama URL
export OLLAMA_API_URL="http://localhost:11434"

# Optional: Encryption key
export PAMPAX_ENCRYPTION_KEY="your-encryption-key"
```

#### **Configuration File**
```json
{
  "project_path": "/path/to/project",
  "provider": "openai",
  "reranker": "transformers",
  "hybrid_search": true,
  "symbol_boost": true,
  "max_results": 20,
  "encryption": false
}
```

---

## 🔍 Advanced Search with Reranking

### 🎯 Reranking Strategies

#### **Transformers Reranker (Local)**
```bash
# Best for: Privacy, no API costs, decent quality
pampax search "machine learning algorithm" \
  --reranker transformers \
  --provider transformers \
  --limit 15
```

#### **API Reranker (Cloud)**
```bash
# Best for: Highest quality, complex queries
pampax search "distributed system architecture" \
  --reranker api \
  --provider openai \
  --limit 10
```

#### **No Reranking (Fastest)**
```bash
# Best for: Quick searches, simple queries
pampax search "function name" \
  --reranker off \
  --limit 50
```

### 🔄 Hybrid Search Combinations

#### **Semantic + Keyword (Recommended)**
```bash
pampax search "user authentication flow" \
  --hybrid on \
  --bm25 on \
  --symbol_boost on \
  --reranker transformers
```

#### **Semantic Only**
```bash
pampax search "conceptual similarity" \
  --hybrid off \
  --reranker api
```

#### **Keyword Only**
```bash
pampax search "exact_function_name" \
  --hybrid off \
  --bm25 on \
  --symbol_boost off
```

---

## 📊 Project Indexing

### 🚀 Complete Indexing Workflow

#### **Step 1: Choose Provider**
```bash
# For best quality (requires API key)
export OPENAI_API_KEY="your-key"
pampax index --provider openai

# For privacy/no costs
pampax index --provider transformers

# For local models
pampax index --provider ollama
```

#### **Step 2: Index Your Project**
```bash
# Index current directory
pampax index

# Index with specific settings
pampax index \
  --provider openai \
  --encrypt on \
  --project /path/to/large/codebase
```

#### **Step 3: Verify Indexing**
```bash
# Check project info
pampax info

# Test search
pampax search "main function" --limit 5
```

### 📈 Indexing Optimization

#### **Large Projects**
```bash
# For projects with many files
pampax index \
  --provider openai \
  --path_glob "src/**" \
  --path_glob "lib/**" \
  --exclude "node_modules/**" \
  --exclude "**/*.test.js"
```

#### **Specific Languages**
```bash
# Index only specific file types
pampax index \
  --lang python \
  --lang javascript \
  --lang typescript
```

---

## 🎯 Practical Examples

### 🔍 **Example 1: Find Authentication Logic**
```bash
# Search across all languages with reranking
pampax search "user authentication login" \
  --reranker transformers \
  --hybrid on \
  --symbol_boost on \
  --path_glob "**/*auth*" \
  --path_glob "**/*user*" \
  --limit 10
```

### 🐍 **Example 2: Python Django Project**
```bash
# Index Django project
pampax index --provider openai --lang python

# Search Django-specific patterns
pampax search "models.py views.py urls.py" \
  --lang python \
  --path_glob "**/*.py" \
  --reranker api \
  --limit 15
```

### 🎨 **Example 3: React/TypeScript Project**
```bash
# Index React project
pampax index --provider transformers --lang typescript

# Search React components
pampax search "component useState useEffect" \
  --lang typescript \
  --path_glob "src/components/**" \
  --path_glob "**/*.tsx" \
  --reranker transformers \
  --symbol_boost on
```

### 🐦 **Example 4: Flutter/Dart Project**
```bash
# Index Flutter project (now with fixed Dart parser!)
pampax index --provider openai

# Search Flutter widgets and state management
pampax search "StatefulWidget StatelessWidget Provider" \
  --lang dart \
  --path_glob "lib/**" \
  --reranker api \
  --symbol_boost on \
  --limit 20
```

### 🔧 **Example 5: API Development**
```bash
# Search API endpoints and routes
pampax search "endpoint route handler controller" \
  --path_glob "**/api/**" \
  --path_glob "**/*route*" \
  --path_glob "**/*controller*" \
  --reranker transformers \
  --hybrid on \
  --tags api --tags endpoint
```

---

## ⚙️ Configuration

### 🌍 Environment Variables
```bash
# API Keys
export OPENAI_API_KEY="sk-..."
export COHERE_API_KEY="..."

# Optional Settings
export OLLAMA_API_URL="http://localhost:11434"
export PAMPAX_ENCRYPTION_KEY="your-encryption-key"
export PAMPAX_LOG_LEVEL="info"  # debug, info, warn, error
```

### 📄 Configuration Files

#### **Project Config (.pampax.json)**
```json
{
  "provider": "openai",
  "reranker": "transformers",
  "hybrid_search": true,
  "symbol_boost": true,
  "max_results": 20,
  "include_patterns": ["src/**", "lib/**"],
  "exclude_patterns": ["node_modules/**", "**/*.test.*"],
  "languages": ["python", "javascript", "typescript", "dart"],
  "encryption": false
}
```

#### **MCP Config (claude-desktop.json)**
```json
{
  "mcpServers": {
    "pampax": {
      "command": "pampax-mcp",
      "args": [
        "--project", "/path/to/your/project",
        "--config", "/path/to/.pampax.json"
      ]
    }
  }
}
```

### 🔧 Default Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `provider` | `auto` | Auto-detects best available provider |
| `reranker` | `off` | No reranking by default |
| `hybrid` | `on` | Semantic + keyword search |
| `symbol_boost` | `on` | Boost symbol matches |
| `limit` | `10` | Max search results |
| `bm25` | `on` | Include keyword search |

---

## 🚀 Quick Start Checklist

### ✅ **For CLI Usage**
```bash
# 1. Install
npm install -g @casualclark/pampax@1.15.1-oak.2

# 2. Set API key (if using OpenAI)
export OPENAI_API_KEY="your-key"

# 3. Index your project
pampax index --provider openai

# 4. Search with reranking
pampax search "your query" --reranker transformers
```

### ✅ **For MCP Usage**
```bash
# 1. Install locally
npm install @casualclark/pampax@1.15.1-oak.2

# 2. Add to Claude Desktop config
# (see MCP Configuration section above)

# 3. Restart Claude Desktop
# 4. Start using PAMPAX tools in Claude
```

### ✅ **For Dart/Flutter Projects**
```bash
# The Dart parser now works! 🎉
pampax index --provider openai
pampax search "widget state management" --lang dart --reranker api
```

---

**🎉 Happy coding with PAMPAX! Enjoy powerful semantic search and reranking!**