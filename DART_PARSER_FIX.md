# 🐛 Dart Parser Fix - Tree-sitter Integration

## 📋 Problem Summary

Users were experiencing the following error when processing Dart files:
```
No tree-sitter parser available for dart - falling back to regex extraction
```

This meant Dart files were not getting proper syntax analysis and were falling back to basic regex parsing.

## 🔧 Root Cause

The issue was in the initialization timing of the Dart parser:
- `RESOLVED_LANGUAGES.dart` and `LANG_RULES['.dart'].ts` were resolved at module load time
- The Dart parser (`LangDart`) was loaded asynchronously later in `initializePampa()`
- This caused `rule.ts` to be `undefined` when PAMPAX tried to use the Dart parser

## ✅ Solution Implemented

### 1. **Updated Dart Parser Package**
- **Before**: `tree-sitter-dart@1.0.0` (missing language property)
- **After**: `@vokturz/tree-sitter-dart@1.0.0` (has proper language property)

### 2. **Fixed Tree-sitter Version Compatibility**
- **Before**: `tree-sitter@^0.25.0`
- **After**: `tree-sitter@^0.21.1` (compatible with Dart parser)

### 3. **Dynamic Language Resolution**
Added dynamic updates after Dart parser loads:
```javascript
// Update RESOLVED_LANGUAGES after Dart parser loads
RESOLVED_LANGUAGES.dart = resolveTreeSitterLanguage(LangDart);

// Also update the language rule for .dart files
const dartRule = LANG_RULES['.dart'];
if (dartRule) {
  dartRule.ts = RESOLVED_LANGUAGES.dart;
}
```

### 4. **Async Initialization with Error Handling**
- Moved all tree-sitter imports to dynamic async loading
- Added proper error handling for optional native dependencies
- Graceful fallbacks for missing parsers

## 🎯 Verification

**Before Fix:**
```
Using regex fallback for lib/providers/policy_providers.dart: No tree-sitter parser available for dart - falling back to regex extraction
```

**After Fix:**
```
✓ Dart parser loaded via require
Dart language resolved: true
Dart rule updated: true
Tree-sitter parsers loaded successfully
```

## 📦 Release Information

- **Version**: `@casualclark/pampax@1.15.1-oak.2`
- **Status**: ✅ Published and available
- **GitHub Release**: https://github.com/CasualClark/pampax/releases/tag/v1.15.1-oak.2

---

# 🚀 Publishing Instructions

## 📋 Prerequisites

1. **npm Account**: You must have npm credentials for the `@casualclark` organization
2. **Publish Rights**: You must be added as a maintainer of the `@casualclark/pampax` package

## 🔐 Step 1: Login to npm

### Method A: Browser Login (Recommended)
```bash
npm login
```
- Opens browser for authentication
- Close browser tab after confirmation
- Wait up to 2 minutes for CLI to complete

### Method B: Classic Token (Alternative)
```bash
# Generate token at: https://www.npmjs.com/settings/YOUR_USERNAME/tokens
export NPM_TOKEN="your-classic-token-here"
npm config set //registry.npmjs.org/:_authToken $NPM_TOKEN
```

### Method C: Set Browser Environment
```bash
# If browser doesn't open automatically
BROWSER=google-chrome npm login
# or
BROWSER=/usr/bin/google-chrome npm login
```

## 📦 Step 2: Publish the Package

### Standard Publishing (with tests)
```bash
npm publish --access public --tag oak
```

### Fast Publishing (skip tests - recommended for patches)
```bash
npm publish --access public --tag oak --ignore-scripts
```

### Environment Variable Method
```bash
npm_config_ignore_scripts=true npm publish --access public --tag oak
```

## 🏷️ Tag Information

- **`--tag oak`**: Required for pre-release versions (contains "oak" in version)
- **`--access public`**: Makes package publicly available
- **`--ignore-scripts`**: Skips time-consuming tests during publishing

## ✅ Verification After Publishing

```bash
# Test installation
npm install @casualclark/pampax@1.15.1-oak.2

# Verify Dart parser works
echo 'class Test { void hello() { print("Hello"); } }' > test.dart
npx pampax index --provider auto .
```

---

# 📦 Installation Instructions

## 🎯 Local Project Installation

### Option 1: Install Specific Version
```bash
npm install @casualclark/pampax@1.15.1-oak.2
```

### Option 2: Install Latest Oak Branch
```bash
npm install @casualclark/pampax@oak
```

### Option 3: Install Directly from GitHub
```bash
npm install https://github.com/CasualClark/pampax.git#v1.15.1-oak.2
```

## 🌍 Global Installation

### Option 1: Install Globally
```bash
npm install -g @casualclark/pampax@1.15.1-oak.2
```

### Option 2: Using Yarn
```bash
yarn global add @casualclark/pampax@1.15.1-oak.2
```

### Option 3: Using pnpm
```bash
pnpm add -g @casualclark/pampax@1.15.1-oak.2
```

## ✅ Verify Installation

### Check CLI Commands
```bash
# Local installation
npx pampax --help

# Global installation  
pampax --help

# Check version
pampax --version
# or
npx pampax --version
```

### Test Dart Parser Functionality
```bash
# Create test Dart file
echo 'class MyWidget extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(child: Text("Hello World"));
  }
}' > test_widget.dart

# Index with Dart parser
pampax index --provider auto .

# Search Dart content
pampax search "MyWidget" --lang dart
```

## 🔧 Development Setup

### Clone and Install Locally
```bash
git clone https://github.com/CasualClark/pampax.git
cd pampax
npm install --legacy-peer-deps
npm link  # For global symlink
```

### Test Development Version
```bash
# From project directory
npm run dev

# Test CLI
node src/cli.js --help
```

## 🐛 Troubleshooting

### Common Issues

1. **"No tree-sitter parser available for dart"**
   - Ensure you have version `1.15.1-oak.2` or later
   - Run: `npm list @casualclark/pampax`

2. **"tree-sitter-dart not found"**
   - The fix uses `@vokturz/tree-sitter-dart` instead
   - Reinstall: `npm install @casualclark/pampax@1.15.1-oak.2`

3. **Permission denied during global install**
   ```bash
   sudo npm install -g @casualclark/pampax@1.15.1-oak.2
   # or use nvm for user-level installation
   ```

4. **Browser doesn't open during npm login**
   ```bash
   BROWSER=google-chrome npm login
   # or manually get token from npmjs.com
   ```

### Get Help

- **GitHub Issues**: https://github.com/CasualClark/pampax/issues
- **Documentation**: https://github.com/CasualClark/pampax#readme
- **Discord Community**: [Link to Discord if available]

---

## 📊 Version History

| Version | Date | Changes |
|---------|------|---------|
| `1.15.1-oak.2` | 2025-10-20 | ✅ Fixed tree-sitter Dart parser initialization |
| `1.15.1-oak.1` | 2025-10-20 | ❌ Dart parser fallback to regex |
| `1.15.1` | Earlier | No Dart parser support |

---

**🎉 Enjoy proper Dart syntax analysis in PAMPAX!**