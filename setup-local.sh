#!/bin/bash

# Local setup script for PAMPAX Oak
# Creates executable symlinks in user's local bin directory

set -e

echo "🚀 Setting up PAMPAX Oak locally..."

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Create local bin directory
BIN_DIR="$HOME/.local/bin"
mkdir -p "$BIN_DIR"

echo "📁 Creating executable symlinks in $BIN_DIR..."

# Create pampax-oak wrapper script
cat > "$BIN_DIR/pampax-oak" << EOF
#!/bin/bash
cd "$SCRIPT_DIR" && node src/cli.js "\$@"
EOF

# Create pampax-mcp wrapper script  
cat > "$BIN_DIR/pampax-mcp" << EOF
#!/bin/bash
cd "$SCRIPT_DIR" && node src/mcp-server.js "\$@"
EOF

# Make scripts executable
chmod +x "$BIN_DIR/pampax-oak"
chmod +x "$BIN_DIR/pampax-mcp"

# Add to PATH if not already there
if [[ ":\$PATH:" != *":\$BIN_DIR:"* ]]; then
    echo "⚠️  Adding \$BIN_DIR to PATH"
    echo "export PATH=\"\$PATH:\$BIN_DIR\"" >> "\$HOME/.bashrc"
    echo "export PATH=\"\$PATH:\$BIN_DIR\"" >> "\$HOME/.zshrc" 2>/dev/null || true
fi

echo "✅ Setup complete!"
echo ""
echo "🎯 Available commands:"
echo "  pampax-oak    - CLI interface for PAMPAX Oak"
echo "  pampax-mcp    - MCP server for PAMPAX Oak"
echo ""
echo "📝 To use the commands immediately, run:"
echo "  export PATH=\"\$PATH:\$BIN_DIR\""
echo "  pampax-oak --help"
echo ""
echo "🔧 Or restart your terminal to reload PATH"