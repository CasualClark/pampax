# 🚀 PAMPAX Complete Setup & Publishing Guide

*Your working configurations for local LM Studio + Reranking setup*

---

## 🎯 **Quick Start - Your Working Setup**

### ✅ **Bashrc Configuration (Working)**
```bash
# Add to ~/.bashrc
export OPENAI_BASE_URL="http://192.168.1.216:1234/v1"
export OPENAI_API_KEY="lm-studio"
export PAMPAX_OPENAI_EMBEDDING_MODEL="text-embedding-embeddinggemma-300m-qat"
export PAMPAX_DIMENSIONS="768"
export PAMPAX_MAX_TOKENS="2048"
export PAMPAX_RERANK_API_URL="http://127.0.0.1:11437/v1/reranking"
export PAMPAX_RERANK_API_KEY="llama-cpp"
export PAMPAX_RERANK_MODEL="qwen3-reranker"
export PAMPAX_RERANKER_MAX="50"
export PAMPAX_RERANKER_MAX_TOKENS="512"
```

### ✅ **Opencode Configuration (Working)**
```json
{
  "pampax": {
    "type": "local",
    "command": ["pampax-mcp"],
    "enabled": true,
    "environment": {
      "OPENAI_BASE_URL": "http://192.168.1.216:1234/v1",
      "OPENAI_API_KEY": "lm-studio",
      "PAMPAX_OPENAI_EMBEDDING_MODEL": "text-embedding-embeddinggemma-300m-qat",
      "PAMPAX_EMBEDDING_DIMENSIONS": "768",
      "PAMPAX_DIMENSIONS": "768",
      "PAMPAX_MAX_TOKENS": "1024",
      "PAMPAX_RERANK_API_URL": "http://127.0.0.1:11437/v1/reranking",
      "PAMPAX_RERANK_API_KEY": "llama-cpp",
      "PAMPAX_RERANK_MODEL": "qwen3-reranker",
      "PAMPAX_RERANKER_MAX": "50",
      "PAMPAX_RERANKER_MAX_TOKENS": "512"
    }
  }
}
```

---

## 📦 **Publishing & Package Management**

### 🔄 **Update & Republish Workflow**

#### **Step 1: Update Version**
```bash
# Update version in package.json
npm version patch  # 1.15.1-oak.2 -> 1.15.1-oak.3
# or
npm version minor # 1.15.1-oak.2 -> 1.15.2-oak.0
```

#### **Step 2: Commit Changes**
```bash
git add .
git commit -m "feat: update configuration and documentation"
git push origin master
```

#### **Step 3: Create Release Tag**
```bash
git tag -a v1.15.1-oak.3 -m "Release v1.15.1-oak.3: Updated configurations"
git push origin v1.15.1-oak.3
```

#### **Step 4: Publish to NPM**
```bash
# Login to npm (if needed)
npm login

# Publish with tag
npm publish --access public --tag oak --ignore-scripts

# Or with environment variable
npm_config_ignore_scripts=true npm publish --access public --tag oak
```

#### **Step 5: Create GitHub Release**
```bash
gh release create v1.15.1-oak.3 \
  --title "v1.15.1-oak.3: Configuration Updates" \
  --notes "Updated LM Studio and reranking configurations"
```

### 📋 **Publishing Checklist**
- [ ] Version updated in package.json
- [ ] Changes committed and pushed
- [ ] Git tag created and pushed
- [ ] npm login verified
- [ ] Package published with correct tag
- [ ] GitHub release created
- [ ] Installation tested

---

## ⚙️ **Configuration Guide**

### 🌍 **Environment Variables**

#### **Core OpenAI/LM Studio Settings**
```bash
# LM Studio Server
export OPENAI_BASE_URL="http://192.168.1.216:1234/v1"
export OPENAI_API_KEY="lm-studio"

# Embedding Model Configuration
export PAMPAX_OPENAI_EMBEDDING_MODEL="text-embedding-embeddinggemma-300m-qat"
export PAMPAX_DIMENSIONS="768"
export PAMPAX_MAX_TOKENS="2048"
```

#### **Reranking Configuration**
```bash
# Reranking Server (llama-cpp)
export PAMPAX_RERANK_API_URL="http://127.0.0.1:11437/v1/reranking"
export PAMPAX_RERANK_API_KEY="llama-cpp"
export PAMPAX_RERANK_MODEL="qwen3-reranker"
export PAMPAX_RERANKER_MAX="50"
export PAMPAX_RERANKER_MAX_TOKENS="512"
```

#### **Optional Settings**
```bash
# Logging
export PAMPAX_LOG_LEVEL="info"  # debug, info, warn, error

# Encryption (optional)
export PAMPAX_ENCRYPTION_KEY="your-encryption-key"

# Alternative Providers
export COHERE_API_KEY="your-cohere-key"
export OLLAMA_API_URL="http://localhost:11434"
```

### 📄 **Project Configuration Files**

#### **.pampax.json (Project Level)**
```json
{
  "provider": "openai",
  "model": "text-embedding-embeddinggemma-300m-qat",
  "dimensions": 768,
  "max_tokens": 2048,
  "reranker": "api",
  "reranker_config": {
    "api_url": "http://127.0.0.1:11437/v1/reranking",
    "api_key": "llama-cpp",
    "model": "qwen3-reranker",
    "max_results": 50,
    "max_tokens": 512
  },
  "hybrid_search": true,
  "symbol_boost": true,
  "include_patterns": ["src/**", "lib/**", "**/*.dart"],
  "exclude_patterns": ["node_modules/**", "**/*.test.*", ".git/**"]
}
```

#### **.env File (Alternative to bashrc)**
```bash
# Create .env in project root
OPENAI_BASE_URL=http://192.168.1.216:1234/v1
OPENAI_API_KEY=lm-studio
PAMPAX_OPENAI_EMBEDDING_MODEL=text-embedding-embeddinggemma-300m-qat
PAMPAX_DIMENSIONS=768
PAMPAX_MAX_TOKENS=2048
PAMPAX_RERANK_API_URL=http://127.0.0.1:11437/v1/reranking
PAMPAX_RERANK_API_KEY=llama-cpp
PAMPAX_RERANK_MODEL=qwen3-reranker
PAMPAX_RERANKER_MAX=50
PAMPAX_RERANKER_MAX_TOKENS=512
```

---

## 🔧 **Opencode/MCP Configuration**

### 📋 **Claude Desktop Configuration**

#### **config.json Location**
- **Windows**: `%APPDATA%\Claude\config.json`
- **macOS**: `~/Library/Application Support/Claude/config.json`
- **Linux**: `~/.config/claude/config.json`

#### **Complete Opencode Config**
```json
{
  "pampax": {
    "type": "local",
    "command": ["pampax-mcp"],
    "enabled": true,
    "environment": {
      "OPENAI_BASE_URL": "http://192.168.1.216:1234/v1",
      "OPENAI_API_KEY": "lm-studio",
      "PAMPAX_OPENAI_EMBEDDING_MODEL": "text-embedding-embeddinggemma-300m-qat",
      "PAMPAX_EMBEDDING_DIMENSIONS": "768",
      "PAMPAX_DIMENSIONS": "768",
      "PAMPAX_MAX_TOKENS": "1024",
      "PAMPAX_RERANK_API_URL": "http://127.0.0.1:11437/v1/reranking",
      "PAMPAX_RERANK_API_KEY": "llama-cpp",
      "PAMPAX_RERANK_MODEL": "qwen3-reranker",
      "PAMPAX_RERANKER_MAX": "50",
      "PAMPAX_RERANKER_MAX_TOKENS": "512"
    }
  }
}
```

#### **Multiple Project Config**
```json
{
  "pampax-work": {
    "type": "local",
    "command": ["pampax-mcp"],
    "args": ["--project", "/path/to/work/project"],
    "enabled": true,
    "environment": {
      "OPENAI_BASE_URL": "http://192.168.1.216:1234/v1",
      "OPENAI_API_KEY": "lm-studio"
    }
  },
  "pampax-personal": {
    "type": "local", 
    "command": ["pampax-mcp"],
    "args": ["--project", "/path/to/personal/project"],
    "enabled": true,
    "environment": {
      "OPENAI_BASE_URL": "http://192.168.1.216:1234/v1",
      "OPENAI_API_KEY": "lm-studio"
    }
  }
}
```

---

## 🎯 **Tips & Tricks**

### 🚀 **Performance Optimization**

#### **Large Project Indexing**
```bash
# Index specific directories only
pampax index --path_glob "src/**" --path_glob "lib/**"

# Exclude large directories
pampax index --exclude "node_modules/**" --exclude "dist/**" --exclude ".git/**"

# Use smaller chunks for large files
export PAMPAX_MAX_TOKENS="1024"
pampax index
```

#### **Memory Management**
```bash
# Limit concurrent processing
export PAMPAX_CONCURRENT_LIMIT="4"

# Use streaming for large files
export PAMPAX_STREAMING="true"
```

### 🔍 **Search Optimization**

#### **High-Quality Reranking**
```bash
# Use API reranker for best results
pampax search "complex query" --reranker api --limit 20

# Use transformers reranker for privacy
pampax search "sensitive query" --reranker transformers --limit 15

# No reranker for speed
pampax search "quick lookup" --reranker off --limit 50
```

#### **Language-Specific Search**
```bash
# Dart/Flutter (now working! 🎉)
pampax search "widget state management" --lang dart --reranker api

# Python/Django
pampax search "models views urls" --lang python --path_glob "**/*.py"

# React/TypeScript  
pampax search "component hooks" --lang typescript --path_glob "src/**"
```

### 🛠️ **Development Workflow**

#### **Project Setup Script**
```bash
#!/bin/bash
# setup-pampax.sh
echo "Setting up PAMPAX for project..."

# Create .pampax.json
cat > .pampax.json << EOF
{
  "provider": "openai",
  "model": "text-embedding-embeddinggemma-300m-qat",
  "dimensions": 768,
  "max_tokens": 2048,
  "reranker": "api"
}
EOF

# Create .env file
cat > .env << EOF
OPENAI_BASE_URL=http://192.168.1.216:1234/v1
OPENAI_API_KEY=lm-studio
PAMPAX_DIMENSIONS=768
EOF

echo "✅ PAMPAX configured for this project!"
echo "Run: pampax index"
```

#### **Alias Commands**
```bash
# Add to ~/.bashrc
alias pampax-index='pampax index --provider openai'
alias pampax-search='pampax search --reranker api'
alias pampax-dart='pampax search --lang dart --reranker api'
alias pampax-info='pampax info && echo "Project: $(pwd)"'
```

### 🔧 **Troubleshooting**

#### **Environment Issues**
```bash
# Check environment variables
env | grep PAMPAX
env | grep OPENAI

# Test configuration
pampax info

# Reset environment
unset PAMPAX_*
source ~/.bashrc
```

#### **Indexing Issues**
```bash
# Clear and reindex
rm -rf .pampa/
pampax index

# Check database
sqlite3 .pampa/pampa.db "SELECT COUNT(*) FROM code_chunks;"

# Verify Dart parser
echo 'class Test { void hello() {} }' > test.dart
pampax index && rm test.dart
```

#### **MCP Issues**
```bash
# Test MCP server
pampax mcp --test

# Check Claude Desktop logs
# macOS: ~/Library/Logs/Claude/
# Windows: %APPDATA%\Claude\logs\
# Linux: ~/.local/share/Claude/logs/
```

---

## 📊 **Configuration Reference**

### 🎛️ **Environment Variables Complete List**

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENAI_BASE_URL` | `https://api.openai.com/v1` | OpenAI/LM Studio API URL |
| `OPENAI_API_KEY` | - | API authentication key |
| `PAMPAX_OPENAI_EMBEDDING_MODEL` | `text-embedding-3-large` | Embedding model name |
| `PAMPAX_DIMENSIONS` | `3072` | Embedding dimensions |
| `PAMPAX_MAX_TOKENS` | `2000` | Maximum chunk tokens |
| `PAMPAX_RERANK_API_URL` | - | Reranking API URL |
| `PAMPAX_RERANK_API_KEY` | - | Reranking API key |
| `PAMPAX_RERANK_MODEL` | - | Reranking model name |
| `PAMPAX_RERANKER_MAX` | `20` | Max reranking results |
| `PAMPAX_RERANKER_MAX_TOKENS` | `512` | Reranking token limit |
| `PAMPAX_LOG_LEVEL` | `info` | Logging verbosity |
| `PAMPAX_ENCRYPTION_KEY` | - | Encryption key for chunks |

### 🎯 **Model Specifications**

#### **Embedding Models**
```bash
# LM Studio Gemma (768 dimensions)
text-embedding-embeddinggemma-300m-qat

# OpenAI Models
text-embedding-3-small    # 1536 dimensions
text-embedding-3-large   # 3072 dimensions  
text-embedding-ada-002   # 1536 dimensions
```

#### **Reranking Models**
```bash
# Local Llama.cpp
qwen3-reranker
bge-reranker-base
monarch-reranker

# API Rerankers
cohere-rerank-v3.5
jina-reranker-v1-base
```

---

## 🎉 **Success Verification**

### ✅ **Test Your Setup**

#### **1. Environment Test**
```bash
# Check all variables
env | grep -E "(OPENAI|PAMPAX)" | sort

# Test PAMPAX info
pampax info
```

#### **2. Indexing Test**
```bash
# Create test file
echo 'class TestWidget extends StatelessWidget {
  Widget build(BuildContext context) => Container();
}' > test_widget.dart

# Index and verify
pampax index
sqlite3 .pampa/pampa.db "SELECT file_path, lang FROM code_chunks WHERE file_path LIKE '%test%';"

# Clean up
rm test_widget.dart
```

#### **3. Search Test**
```bash
# Test Dart search
pampax search "TestWidget" --lang dart --reranker api

# Test reranking
pampax search "widget component" --reranker api --limit 5
```

#### **4. MCP Test**
```bash
# Test MCP server
pampax mcp --test

# Check Claude Desktop integration
# Restart Claude Desktop and check for PAMPAX tools
```

### 🎯 **Expected Output**

You should see:
```
✓ Dart parser loaded via require
Dart language resolved: true  
Dart rule updated: true
Tree-sitter parsers loaded successfully

📊 Chunking Configuration:
  Provider: OpenAI
  Model: text-embedding-embeddinggemma-300m-qat
  Dimensions: 768
  Chunking mode: tokens
  Optimal size: 1843 tokens
  Min/Max: 400-2048 tokens
  Overlap: 100 tokens
  ✓ Token counting enabled
```

---

**🎉 Congratulations! You have a fully working PAMPAX setup with LM Studio and local reranking!**

Your configuration provides:
- ✅ Local LM Studio embeddings (768 dimensions)
- ✅ Local reranking with llama-cpp
- ✅ Working Dart parser support
- ✅ MCP integration with Claude
- ✅ Optimized performance settings

Enjoy your powerful local code search setup! 🚀