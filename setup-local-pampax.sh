#!/bin/bash

echo "🔧 Setting up Pampax for local development..."

# Check if we're in the main project directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: No package.json found. Please run this from your project root."
    exit 1
fi

# Install pampax from the local fork
echo "📦 Installing Pampax from local fork..."
npm install /home/oakley/mcps/pampax

# Rebuild native dependencies to ensure they work for this project
echo "🔧 Rebuilding native dependencies..."
npm rebuild sqlite3
npm rebuild tree-sitter

# Verify installation
echo "✅ Verifying installation..."
if npx pampax --version > /dev/null 2>&1; then
    echo "✅ Pampax installed successfully!"
    echo "🚀 You can now use: pampax search 'your query'"
else
    echo "❌ Installation verification failed"
    exit 1
fi

echo "🎉 Setup complete!"