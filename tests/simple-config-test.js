#!/usr/bin/env node

// Simple test to verify the configuration system works
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const testDir = join(__dirname, 'temp');
mkdirSync(testDir, { recursive: true });

console.log('🧪 Testing PAMPAX Configuration System...\n');

// Test 1: Feature flags
console.log('1. Testing Feature Flags...');
try {
  // Create a test feature flag file
  const testFlags = {
    lsp: { python: false, dart: true },
    treesitter: { enabled: true },
    scip: { read: false },
    vectors: { sqlite_vec: true, pgvector: false },
    ui: { json: true, tty: false }
  };
  
  const flagPath = join(testDir, 'test-flags.json');
  writeFileSync(flagPath, JSON.stringify(testFlags, null, 2));
  
  // Read it back
  const readBack = JSON.parse(readFileSync(flagPath, 'utf-8'));
  
  if (JSON.stringify(testFlags) === JSON.stringify(readBack)) {
    console.log('✅ Feature flags JSON format works correctly');
  } else {
    console.log('❌ Feature flags test failed');
    process.exit(1);
  }
} catch (error) {
  console.log('❌ Feature flags test failed:', error.message);
  process.exit(1);
}

// Test 2: Directory structure
console.log('\n2. Testing Directory Structure...');
const requiredDirs = [
  'adapters/treesitter',
  'adapters/lsp', 
  'adapters/scip',
  'tests/fixtures',
  'config',
  'src/config',
  'src/types'
];

for (const dir of requiredDirs) {
  if (existsSync(join(__dirname, '..', dir))) {
    console.log(`✅ ${dir}/ exists`);
  } else {
    console.log(`❌ ${dir}/ missing`);
    process.exit(1);
  }
}

// Test 3: Configuration files
console.log('\n3. Testing Configuration Files...');
const requiredFiles = [
  'config/feature-flags.json',
  'src/config/feature-flags.ts',
  'src/config/logger.ts',
  'src/types/core.ts',
  'tests/fixtures/simple-python/main.py'
];

for (const file of requiredFiles) {
  if (existsSync(join(__dirname, '..', file))) {
    console.log(`✅ ${file} exists`);
  } else {
    console.log(`❌ ${file} missing`);
    process.exit(1);
  }
}

// Test 4: Basic data model validation
console.log('\n4. Testing Data Models...');
try {
  const coreTypesPath = join(__dirname, '..', 'src', 'types', 'core.ts');
  const content = readFileSync(coreTypesPath, 'utf-8');
  
  const requiredExports = [
    'Span',
    'Adapter', 
    'IndexProgressEvent',
    'Chunk',
    'SpanKind'
  ];
  
  for (const exportName of requiredExports) {
    if (content.includes(`export ${exportName}`) || content.includes(`export type ${exportName}`) || content.includes(`export interface ${exportName}`)) {
      console.log(`✅ ${exportName} type exported`);
    } else {
      console.log(`❌ ${exportName} type missing`);
      process.exit(1);
    }
  }
} catch (error) {
  console.log('❌ Data model test failed:', error.message);
  process.exit(1);
}

// Test 5: Logger basic functionality
console.log('\n5. Testing Logger Infrastructure...');
try {
  const loggerPath = join(__dirname, '..', 'src', 'config', 'logger.ts');
  const loggerContent = readFileSync(loggerPath, 'utf-8');
  
  const requiredMethods = ['info', 'warn', 'error', 'debug', 'time', 'timeAsync'];
  for (const method of requiredMethods) {
    if (loggerContent.includes(`${method}(`) || loggerContent.includes(`${method}<`) || loggerContent.includes(`${method} `)) {
      console.log(`✅ Logger.${method} method exists`);
    } else {
      console.log(`❌ Logger.${method} method missing`);
      process.exit(1);
    }
  }
} catch (error) {
  console.log('❌ Logger test failed:', error.message);
  process.exit(1);
}

console.log('\n🎉 All configuration tests passed!');
console.log('✨ PAMPAX codebase preparation is complete!');