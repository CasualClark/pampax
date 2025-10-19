# PAMPAX Oak Configuration Examples

This directory contains configuration examples for using Casual Oak's PAMPAX fork with various AI tools.

## Files

### Claude Desktop
- `claude-desktop.json` - Basic configuration using npx
- `claude-desktop-advanced.json` - Advanced configuration with multiple providers

### Cursor
- `cursor.json` - Configuration for Cursor IDE

### OpenCode
- `opencode.json` - Configuration using npx installation
- `opencode-local.json` - Configuration using local development setup

## Setup Instructions

1. **Choose your AI tool** and copy the appropriate configuration file
2. **Update the API key** with your actual provider key
3. **Update the path** if using local configuration (should point to `/home/oakley/mcps/pampax`)
4. **Add to your AI tool's configuration** following the tool's specific instructions

## Environment Variables

All configurations support these environment variables:

- `PAMPAX_PROVIDER` - AI provider (openai, anthropic, groq, ollama, etc.)
- `PAMPAX_MODEL` - Model name (gpt-4o, claude-3-5-sonnet-20241022, etc.)
- `PAMPAX_API_KEY` - Your API key for the provider
- `PAMPAX_BASE_URL` - Custom base URL (for Groq, OpenRouter, etc.)

## Dart/Flutter Support

This fork includes enhanced Dart/Flutter support with:
- Function and method detection
- Class and mixin parsing
- Enum and extension support
- Dart documentation patterns
- Variable type detection

## Getting Help

- See `../SETUP_GUIDE.md` for detailed setup instructions
- Check `../README_OAK.md` for fork-specific information
- Visit the original PAMPAX documentation for general usage