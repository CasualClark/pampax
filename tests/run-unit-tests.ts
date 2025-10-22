#!/usr/bin/env node

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';

const testDir = __dirname;
const tempDir = join(testDir, 'temp');

// Ensure temp directory exists
if (!existsSync(tempDir)) {
  execSync(`mkdir -p "${tempDir}"`);
}

console.log('Running PAMPAX unit tests...\n');

const testFiles = [
  'unit/feature-flags.test.ts',
  'unit/logger.test.ts',
  // Add more test files here as they are created
];

let passed = 0;
let failed = 0;

for (const testFile of testFiles) {
  const fullPath = join(testDir, testFile);
  
  if (!existsSync(fullPath)) {
    console.log(`⚠️  Skipping ${testFile} (not found)`);
    continue;
  }

  try {
    console.log(`🧪 Running ${testFile}...`);
    execSync(`node --test "${fullPath}"`, { 
      stdio: 'inherit',
      cwd: testDir 
    });
    console.log(`✅ ${testFile} passed\n`);
    passed++;
  } catch (error) {
    console.log(`❌ ${testFile} failed\n`);
    failed++;
  }
}

console.log(`\n📊 Test Results:`);
console.log(`✅ Passed: ${passed}`);
console.log(`❌ Failed: ${failed}`);
console.log(`📁 Total: ${passed + failed}`);

if (failed > 0) {
  process.exit(1);
} else {
  console.log('\n🎉 All tests passed!');
}