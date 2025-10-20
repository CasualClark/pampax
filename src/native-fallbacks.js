// Fallback implementations for native dependencies

let sqlite3;
let treeSitterLoaded = false;

// Try to load native dependencies, but don't fail if they're not available
try {
  sqlite3 = require('sqlite3');
} catch (error) {
  console.warn('SQLite3 not available, using fallback storage');
}

try {
  // Test if tree-sitter loads properly
  const Parser = require('tree-sitter');
  treeSitterLoaded = true;
} catch (error) {
  console.warn('Tree-sitter not available, symbol extraction will be limited');
}

// Export fallback implementations
export { sqlite3, treeSitterLoaded };