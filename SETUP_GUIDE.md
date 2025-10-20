# 🛠️ Complete Setup Guide for Casual Oak's PAMPAX

## ✅ Installation Issues SOLVED!

**🎉 Great news:** All native dependency problems have been fixed! My fork now works in any environment:

- ✅ **No more SQLite3 build errors**
- ✅ **No more tree-sitter compilation failures**  
- ✅ **No more distutils missing issues**
- ✅ **Works in WSL, Docker, restricted systems**

### 🚀 **Quick Start (3 Commands)**
```bash
git clone https://github.com/CasualClark/pampax.git
cd pampax
npm install --ignore-scripts --legacy-peer-deps
node src/cli.js --help  # ✅ Should show command menu
```

> **📋 Detailed troubleshooting:** See [`INSTALLATION_WORKING.md`](./INSTALLATION_WORKING.md)

---

## 📋 Table of Contents
- [Prerequisites](#prerequisites)
- [Installation Methods](#installation-methods)
- [AI Tool Configuration](#ai-tool-configuration)
- [Provider Setup](#provider-setup)
- [Project Indexing](#project-indexing)
- [Troubleshooting](#troubleshooting)
- [Advanced Configuration](#advanced-configuration)

---

## 🔧 Prerequisites

### **Required Software**
- **Node.js** (v16 or higher)
- **npm** (comes with Node.js)
- **Git** (for cloning projects)

### **Check Installation**
```bash
# Check Node.js version
node --version  # Should be v16.x.x or higher

# Check npm version  
npm --version   # Should be 8.x.x or higher

# Check Git
git --version
```

### **AI Tool Requirements**
- **Claude Desktop** (v0.8.0+)
- **Cursor** (latest version)
- **OpenCode** (latest version)
- Or any MCP-compatible AI tool

---

## 📦 Installation Methods ✅ ALL WORKING

### **Method 1: Local Development (Recommended)**
**Best for:** Full functionality, no native dependency issues

```bash
# Clone the repository
git clone https://github.com/CasualClark/pampax.git
cd pampax

# Install dependencies (no native build required)
npm install --ignore-scripts --legacy-peer-deps

# Test installation
node src/cli.js --help

# Index a project
node src/cli.js index .

# Search code
node src/cli.js search "your query"
```

### **Method 2: NPX (Also Working)**
**Best for:** Quick testing, no installation required

```bash
# Test the package
npx github:CasualClark/pampax --help

# Index a project
npx github:CasualClark/pampax index .

# Search code
npx github:CasualClark/pampax search "your query"
```

### **Method 3: Local Aliases**
**Best for:** Development, specific projects

```bash
# Install in project
npm install @casualclark/pampax

# Use via npx
npx pampax index
npx pampax search "query"

# Or add to package.json scripts
{
  "scripts": {
    "index": "pampax index",
    "search": "pampax search"
  }
}
```

### **Method 4: Direct from GitHub**
**Best for:** Permanent command shortcuts

```bash
# Add aliases to ~/.bashrc or ~/.zshrc
echo 'alias pampax="node /home/oakley/mcps/pampax/src/cli.js"' >> ~/.bashrc
echo 'alias pampax-mcp="node /home/oakley/mcps/pampax/src/mcp-server.js"' >> ~/.bashrc

# Reload shell
source ~/.bashrc

# Use aliases
pampax index .
pampax search "query"
pampax-mcp  # Start MCP server
```

### **Method 4: Direct from GitHub**
**Best for:** Testing latest changes (Working)

```bash
# Latest from main branch
npx github:CasualClark/pampax

# Specific version/tag
npx github:CasualClark/pampax#v1.15.1-oak.1

# Specific branch
npx github:CasualClark/pampax#dart-supprt
```

---

## 🤖 AI Tool Configuration

### **Claude Desktop**

**Config File Location:**
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux**: `~/.config/claude/claude_desktop_config.json`

**Configuration:**
```json
{
  "mcpServers": {
    "pampax-oak": {
      "command": "npx",
      "args": ["-y", "@casualclark/pampax", "mcp"],
      "env": {
        "OPENAI_API_KEY": "your-openai-key-here"
      }
    }
  }
}
```

**Advanced Claude Config:**
```json
{
  "mcpServers": {
    "pampax-oak": {
      "command": "npx",
      "args": ["-y", "@casualclark/pampax", "mcp"],
      "env": {
        "OPENAI_API_KEY": "sk-your-key-here",
        "OPENAI_BASE_URL": "https://api.openai.com/v1",
        "PAMPAX_MAX_TOKENS": "8192",
        "PAMPAX_DIMENSIONS": "1536",
        "PAMPAX_DEBUG": "true"
      }
    }
  }
}
```

### **Cursor**

**Config File Location:**
- **macOS**: `~/Library/Application Support/Cursor/User/globalStorage/cursor.mcp.settings.json`
- **Windows**: `%APPDATA%\Cursor\User\globalStorage\cursor.mcp.settings.json`
- **Linux**: `~/.config/Cursor/User/globalStorage/cursor.mcp.settings.json`

**Configuration:**
```json
{
  "mcpServers": {
    "pampax-oak": {
      "command": "npx",
      "args": ["-y", "@casualclark/pampax", "mcp"],
      "env": {
        "OPENAI_API_KEY": "your-openai-key-here"
      }
    }
  }
}
```

### **OpenCode**

**Config File Location:**
- **macOS**: `~/Library/Application Support/OpenCode/User/globalStorage/opencode.mcp.settings.json`
- **Windows**: `%APPDATA%\OpenCode\User\globalStorage\opencode.mcp.settings.json`
- **Linux**: `~/.config/OpenCode/User/globalStorage/opencode.mcp.settings.json`

**Configuration:**
```json
{
  "mcpServers": {
    "pampax-oak": {
      "command": "npx",
      "args": ["-y", "@casualclark/pampax", "mcp"],
      "env": {
        "OPENAI_API_KEY": "your-openai-key-here"
      }
    }
  }
}
```

---

## 🔑 Provider Setup

### **OpenAI (Recommended)**

**Get API Key:**
1. Go to [OpenAI Platform](https://platform.openai.com/api-keys)
2. Create new API key
3. Copy key (starts with `sk-`)

**Configuration:**
```json
{
  "mcpServers": {
    "pampax-oak": {
      "command": "npx",
      "args": ["-y", "@casualclark/pampax", "mcp"],
      "env": {
        "OPENAI_API_KEY": "sk-your-key-here"
      }
    }
  }
}
```

**Models Available:**
- `text-embedding-3-small` (1536 dimensions, fast)
- `text-embedding-3-large` (3072 dimensions, accurate)

### **Local Transformers.js (Free)**

**No API key required!**

```json
{
  "mcpServers": {
    "pampax-oak": {
      "command": "npx",
      "args": ["-y", "@casualclark/pampax", "mcp"]
    }
  }
}
```

**Models Available:**
- `Xenova/all-MiniLM-L6-v2` (384 dimensions)
- `Xenova/bge-large-en-v1.5` (1024 dimensions)

### **NovitaAI (High Performance)**

**Get API Key:**
1. Go to [NovitaAI](https://novita.ai/)
2. Sign up and get API key
3. Copy key

**Configuration:**
```json
{
  "mcpServers": {
    "pampax-oak": {
      "command": "npx",
      "args": ["-y", "@casualclark/pampax", "mcp"],
      "env": {
        "OPENAI_API_KEY": "your-novita-key",
        "OPENAI_BASE_URL": "https://api.novita.ai/openai",
        "PAMPAX_OPENAI_EMBEDDING_MODEL": "qwen/qwen3-embedding-8b",
        "PAMPAX_DIMENSIONS": "4096"
      }
    }
  }
}
```

### **LM Studio / Ollama (Local)**

**LM Studio Setup:**
1. Install [LM Studio](https://lmstudio.ai/)
2. Start local server
3. Note the server URL (usually `http://localhost:1234`)

**Configuration:**
```json
{
  "mcpServers": {
    "pampax-oak": {
      "command": "npx",
      "args": ["-y", "@casualclark/pampax", "mcp"],
      "env": {
        "OPENAI_API_KEY": "not-needed",
        "OPENAI_BASE_URL": "http://localhost:1234/v1"
      }
    }
  }
}
```

---

## 📁 Project Indexing

### **Basic Indexing**

```bash
# Index current directory
npx @casualclark/pampax index

# Index specific directory
npx @casualclark/pampax index --path /path/to/project

# Index with specific provider
npx @casualclark/pampax index --provider openai
```

### **Advanced Indexing**

```bash
# Index only changed files (incremental)
npx @casualclark/pampax index --incremental

# Force full re-index
npx @casualclark/pampax index --force

# Index with custom settings
npx @casualclark/pampax index \
  --provider openai \
  --max-tokens 8192 \
  --dimensions 1536

# Index specific files
npx @casualclark/pampax index --files src/main.dart lib/app.dart

# Exclude patterns
npx @casualclark/pampax index --exclude "test/*" --exclude "build/*"
```

### **What Gets Indexed?**

**Automatically Included:**
- All supported language files
- Git-tracked files
- Files under size limits

**Automatically Excluded:**
- `node_modules/`, `vendor/`, `build/`, `dist/`
- `.git/`, `.svn/`, `.hg/`
- Large files (>1MB)
- Binary files

**Supported File Types:**
- Source code (22 languages)
- Configuration files (JSON, YAML)
- Documentation (Markdown)

---

## 🔍 Using the Search

### **Basic Search**

```bash
# Simple search
npx @casualclark/pampax search "authentication"

# Language-specific
npx @casualclark/pampax search "StatefulWidget" --lang dart

# Path-scoped
npx @casualclark/pampax search "payment" --path "src/services/*"
```

### **Advanced Search**

```bash
# Multiple terms
npx @casualclark/pampax search "user authentication middleware"

# With limits
npx @casualclark/pampax search "database" --limit 20

# Debug mode
npx @casualclark/pampax search "debug" --debug

# Hybrid search (BM25 + vector)
npx @casualclark/pampax search "api endpoint" --hybrid

# With reranking
npx @casualclark/pampax search "payment flow" --reranker
```

### **AI Assistant Integration**

Once configured, your AI assistant can:

**Ask natural questions:**
- "Show me all the authentication functions"
- "Find Flutter widgets that handle user input"
- "What's the payment processing flow?"
- "Where is the database connection code?"

**Get contextual results:**
- Function signatures with parameters
- Class definitions with methods
- Documentation comments
- Related code suggestions

---

## 🐛 Troubleshooting

### **Common Issues**

#### **"Package not found" Error**
```bash
# Clear npm cache
npm cache clean --force

# Try direct GitHub install
npx github:CasualClark/pampax mcp

# Check internet connection
curl -I https://registry.npmjs.org/@casualclark%2Fpampax
```

#### **MCP Server Not Starting**
```bash
# Check Node.js installation
node --version
npm --version

# Test package directly
npx @casualclark/pampax --version

# Check permissions
chmod +x $(which npx)
```

#### **"API Key Invalid" Error**
```bash
# Verify API key
echo $OPENAI_API_KEY

# Test API connection
curl -H "Authorization: Bearer $OPENAI_API_KEY" \
     https://api.openai.com/v1/models

# Check environment variables
env | grep OPENAI
```

#### **Memory/Performance Issues**
```bash
# Use local provider (less memory)
npx @casualclark/pampax index --provider transformers

# Limit token usage
export PAMPAX_MAX_TOKENS=4096

# Increase Node.js memory
export NODE_OPTIONS="--max-old-space-size=4096"
```

#### **Dart Files Not Indexing**
```bash
# Check file extensions
find . -name "*.dart" | head -5

# Verify not ignored
git check-ignore lib/main.dart

# Manual indexing test
npx @casualclark/pampax index --files lib/main.dart --debug
```

### **Debug Mode**

Enable debug logging:

```bash
# Environment variable
export PAMPAX_DEBUG=true

# Or in MCP config
{
  "mcpServers": {
    "pampax-oak": {
      "command": "npx",
      "args": ["-y", "@casualclark/pampax", "mcp", "--debug"],
      "env": {
        "PAMPAX_DEBUG": "true"
      }
    }
  }
}
```

### **Log Locations**

**MCP Server Logs:**
- Check your AI tool's console/output
- Look for PAMPAX-related messages

**Index Logs:**
```bash
# Enable verbose logging
npx @casualclark/pampax index --debug

# Check database
ls -la .pampa/
cat .pampa/pampa.db
```

---

## ⚙️ Advanced Configuration

### **Environment Variables**

```bash
# API Configuration
OPENAI_API_KEY=sk-your-key
OPENAI_BASE_URL=https://api.openai.com/v1
PAMPAX_OPENAI_EMBEDDING_MODEL=text-embedding-3-small

# Performance Tuning
PAMPAX_MAX_TOKENS=8192
PAMPAX_DIMENSIONS=1536
PAMPAX_CHUNK_SIZE=500

# Feature Flags
PAMPAX_DEBUG=false
PAMPAX_HYBRID_SEARCH=true
PAMPAX_RERANKER=transformers

# File Handling
PAMPAX_MAX_FILE_SIZE=1048576  # 1MB
PAMPAX_IGNORE_PATTERNS=node_modules,vendor,build
```

### **Custom Configuration File**

Create `.pampax.json` in your project:

```json
{
  "provider": "openai",
  "maxTokens": 8192,
  "dimensions": 1536,
  "ignorePatterns": [
    "node_modules/*",
    "build/*",
    "*.min.js",
    "*.generated.dart"
  ],
  "includePatterns": [
    "src/**/*",
    "lib/**/*",
    "test/**/*"
  ],
  "languageSettings": {
    "dart": {
      "enabled": true,
      "chunkSize": 400
    },
    "python": {
      "enabled": true,
      "chunkSize": 600
    }
  }
}
```

### **Context Packs**

Create reusable search scopes:

```bash
# Create context pack
npx @casualclark/pampax context create flutter-ui \
  --path "lib/ui/*" \
  --lang dart \
  --tags "ui,flutter,widgets"

# Use context pack
npx @casualclark/pampax search "button" --context flutter-ui

# List context packs
npx @casualclark/pampax context list
```

### **Performance Optimization**

```bash
# Parallel processing
export PAMPAX_WORKERS=4

# Batch size
export PAMPAX_BATCH_SIZE=100

# Memory limits
export NODE_OPTIONS="--max-old-space-size=4096"

# Indexing strategy
npx @casualclark/pampax index \
  --incremental \
  --parallel \
  --batch-size 50
```

---

## 📞 Getting Help

### **Support Channels**
- **GitHub Issues**: [Create an issue](https://github.com/CasualClark/pampax/issues)
- **Discord Community**: [Join here](https://discord.gg/pampax)
- **Email**: casual.oak@example.com

### **Bug Reports**
Include in your report:
- OS and version
- Node.js version
- PAMPAX version
- Error messages
- Steps to reproduce
- Configuration used

### **Feature Requests**
- Describe the use case
- Explain why it's needed
- Suggest implementation approach
- Consider contributing!

---

## 🔄 Updates and Maintenance

### **Checking for Updates**
```bash
# Check current version
npx @casualclark/pampax --version

# Check for newer version
npm view @casualclark/pampax version

# Update to latest
npm update -g @casualclark/pampax
```

### **Re-indexing After Updates**
```bash
# Check if re-index needed
npx @casualclark/pampax info

# Re-index if needed
npx @casualclark/pampax index --force
```

### **Backup and Restore**
```bash
# Backup index
cp -r .pampa .pampa.backup

# Restore index
cp -r .pampa.backup .pampa

# Export codemap
cp pampa.codemap.json pampa.codemap.backup.json
```

---

**Happy coding with your AI's new memory! 🧠✨**