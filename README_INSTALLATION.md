# PAMPAX Oak Installation Guide

## Quick Start (Recommended)

### Method 1: Direct from GitHub (Easiest)
```bash
npx github:CasualClark/pampax --help
```

### Method 2: Local Development Setup
```bash
git clone https://github.com/CasualClark/pampax.git
cd pampax
npm install --production --ignore-scripts --legacy-peer-deps
node src/cli.js --help
```

## Global Installation Issues

The native dependencies (sqlite3, tree-sitter) cause issues in some environments. Here are workarounds:

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

### Native Dependency Errors
If you see errors about sqlite3 or tree-sitter:
1. Use the npx method (always works)
2. Install with `--ignore-scripts --legacy-peer-deps`
3. Use Docker container with proper build tools

### Permission Errors
```bash
# Use npx instead of global install
npx github:CasualClark/pampax --help
```

### Module Not Found Errors
```bash
# Install dependencies locally
npm install --production --ignore-scripts --legacy-peer-deps
```

## Environment Variables

- `PAMPAX_PROVIDER` - AI provider (openai, anthropic, groq, ollama)
- `PAMPAX_MODEL` - Model name (gpt-4o, claude-3-5-sonnet-20241022)
- `PAMPAX_API_KEY` - Your API key
- `PAMPAX_BASE_URL` - Custom base URL for some providers