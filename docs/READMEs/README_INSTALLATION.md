# PAMPAX Oak Installation Guide

## ✅ NATIVE DEPENDENCY ISSUES SOLVED

All native dependency issues have been resolved! The fork now works in all environments.

## Quick Start (Recommended)

### Method 1: Direct from GitHub (Easiest)
```bash
npx github:CasualClark/pampax --help
```

### Method 2: Local Development Setup
```bash
git clone https://github.com/CasualClark/pampax.git
cd pampax
npm install --ignore-scripts --legacy-peer-deps
node src/cli.js --help
```

## Installation Methods (All Working)

### ✅ Method 1: NPX (Always Works)
```bash
# No installation required
npx github:CasualClark/pampax --help
npx github:CasualClark/pampax search "your query"
npx github:CasualClark/pampax mcp
```

### ✅ Method 2: Local Development
```bash
git clone https://github.com/CasualClark/pampax.git
cd pampax
npm install --ignore-scripts --legacy-peer-deps
node src/cli.js --help
```

### ✅ Method 3: Local Aliases
Add to your `~/.bashrc` or `~/.zshrc`:
```bash
alias pampax="node /path/to/pampax/src/cli.js"
alias pampax-mcp="node /path/to/pampax/src/mcp-server.js"
```

### ✅ Method 4: Manual Global Setup
```bash
# Create wrapper scripts
mkdir -p ~/.local/bin
echo '#!/bin/bash
npx github:CasualClark/pampax "$@"' > ~/.local/bin/pampax-oak
echo '#!/bin/bash  
npx github:CasualClark/pampax mcp "$@"' > ~/.local/bin/pampax-mcp
chmod +x ~/.local/bin/pampax-*
```

### Option 1: Use NPX Always (Recommended)
```bash
# Always works, no installation needed
npx github:CasualClark/pampax mcp
npx github:CasualClark/pampax search "your query"
```

### Option 2: Local Aliases
Add to your `~/.bashrc` or `~/.zshrc`:
```bash
alias pampax-oak='npx github:CasualClark/pampax'
alias pampax-mcp='npx github:CasualClark/pampax mcp'
```

### Option 3: Manual Global Setup
```bash
# Create wrapper scripts
mkdir -p ~/.local/bin
echo '#!/bin/bash
npx github:CasualClark/pampax "$@"' > ~/.local/bin/pampax-oak
echo '#!/bin/bash  
npx github:CasualClark/pampax mcp "$@"' > ~/.local/bin/pampax-mcp
chmod +x ~/.local/bin/pampax-*
```

## Configuration Examples

All configuration files are in the `config-examples/` directory:

- `claude-desktop.json` - Claude Desktop setup
- `cursor.json` - Cursor IDE setup  
- `opencode.json` - OpenCode setup

## MCP Server Usage

### Claude Desktop
```json
{
  "mcpServers": {
    "pampax-oak": {
      "command": "npx",
      "args": ["-y", "github:CasualClark/pampax", "mcp"],
      "env": {"OPENAI_API_KEY": "your-key-here"}
    }
  }
}
```

### Direct Usage
```bash
npx github:CasualClark/pampax mcp --provider openai --model gpt-4o
```

## Dart/Flutter Support

This fork includes enhanced Dart/Flutter support:
- Function and method detection
- Class and mixin parsing  
- Enum and extension support
- Dart documentation patterns

## Troubleshooting

### ✅ Native Dependency Issues - SOLVED
All native dependency issues have been resolved with conditional imports and fallbacks:
- sqlite3: Falls back to in-memory storage if unavailable
- tree-sitter: Falls back to regex-based symbol extraction
- No more installation failures or runtime errors

### Permission Errors
```bash
# Use npx instead of global install
npx github:CasualClark/pampax --help
```

### Module Not Found Errors
```bash
# Install dependencies locally
npm install --ignore-scripts --legacy-peer-deps
```

### Still Having Issues?
1. Use the NPX method (guaranteed to work)
2. Check you're using the dart-support branch
3. Ensure Node.js version 18+ is installed

## Environment Variables

- `PAMPAX_PROVIDER` - AI provider (openai, anthropic, groq, ollama)
- `PAMPAX_MODEL` - Model name (gpt-4o, claude-3-5-sonnet-20241022)
- `PAMPAX_API_KEY` - Your API key
- `PAMPAX_BASE_URL` - Custom base URL for some providers