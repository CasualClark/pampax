#!/bin/bash

# Global installation script for PAMPAX Oak
# This script installs the package globally and sets up proper symlinks

set -e

echo "🚀 Installing PAMPAX Oak globally..."

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_NAME="@casualclark/pampax"

# Install globally using npm force flag to ignore peer dependency issues
echo "📦 Installing package globally..."
npm install -g "$PACKAGE_NAME" --force --ignore-scripts

# Create proper bin directory if it doesn't exist
BIN_DIR="$HOME/.local/bin"
mkdir -p "$BIN_DIR"

# Create executable scripts
echo "🔗 Creating executable symlinks..."

# Create pampax-oak wrapper script
cat > "$BIN_DIR/pampax-oak" << 'EOF'
#!/bin/bash
node /home/oakley/mcps/pampax/src/cli.js "$@"
EOF

# Create pampax-mcp wrapper script  
cat > "$BIN_DIR/pampax-mcp" << 'EOF'
#!/bin/bash
node /home/oakley/mcps/pampax/src/mcp-server.js "$@"
EOF

# Make scripts executable
chmod +x "$BIN_DIR/pampax-oak"
chmod +x "$BIN_DIR/pampax-mcp"

# Add to PATH if not already there
if [[ ":$PATH:" != *":$BIN_DIR:"* ]]; then
    echo "⚠️  Adding $BIN_DIR to PATH"
    echo "export PATH=\"\$PATH:$BIN_DIR\"" >> "$HOME/.bashrc"
    echo "export PATH=\"\$PATH:$BIN_DIR\"" >> "$HOME/.zshrc" 2>/dev/null || true
fi

echo "✅ Installation complete!"
echo ""
echo "🎯 Available commands:"
echo "  pampax-oak    - CLI interface for PAMPAX Oak"
echo "  pampax-mcp    - MCP server for PAMPAX Oak"
echo ""
echo "📝 To use the commands immediately, run:"
echo "  export PATH=\"\$PATH:$BIN_DIR\""
echo "  pampax-oak --help"
echo ""
echo "🔧 Or restart your terminal to reload PATH"