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

console.log('🚀 Running PAMPAX test suite...\n');

const testSuites = [
  { name: 'Unit Tests', pattern: 'unit/*.test.ts' },
  { name: 'Golden Tests', pattern: 'golden/*.test.ts' },
  { name: 'Integration Tests', pattern: 'integration/*.test.ts' },
  { name: 'Progressive Tests', pattern: 'progressive/*.test.js' },
  { name: 'Benchmarks', pattern: 'benchmarks/*.test.js' }
];

let totalPassed = 0;
let totalFailed = 0;

for (const suite of testSuites) {
  console.log(`\n📂 ${suite.name}:`);
  console.log('─'.repeat(40));
  
  try {
    // Use glob pattern to find test files
    const testCommand = `find "${testDir}" -name "${suite.pattern.replace('*/', '*').replace('.ts', '.ts')}" -o -name "${suite.pattern.replace('*/', '*').replace('.ts', '.js')}" 2>/dev/null || true`;
    const testFiles = execSync(testCommand, { encoding: 'utf-8' }).trim().split('\n').filter(Boolean);
    
    if (testFiles.length === 0) {
      console.log(`⚠️  No test files found for ${suite.name}`);
      continue;
    }

    let suitePassed = 0;
    let suiteFailed = 0;

    for (const testFile of testFiles) {
      try {
        console.log(`  🧪 ${testFile.replace(testDir, '')}`);
        execSync(`node --test "${testFile}"`, { 
          stdio: 'pipe',
          cwd: testDir 
        });
        console.log(`  ✅ Passed`);
        suitePassed++;
      } catch (error) {
        console.log(`  ❌ Failed`);
        suiteFailed++;
      }
    }

    console.log(`\n  📊 ${suite.name} Results: ${suitePassed} passed, ${suiteFailed} failed`);
    totalPassed += suitePassed;
    totalFailed += suiteFailed;

  } catch (error) {
    console.log(`❌ Error running ${suite.name}:`, error);
    totalFailed++;
  }
}

console.log('\n' + '='.repeat(50));
console.log('🏁 FINAL TEST RESULTS:');
console.log(`✅ Total Passed: ${totalPassed}`);
console.log(`❌ Total Failed: ${totalFailed}`);
console.log(`📁 Total Tests: ${totalPassed + totalFailed}`);

if (totalFailed > 0) {
  console.log('\n💥 Some tests failed!');
  process.exit(1);
} else {
  console.log('\n🎉 All tests passed!');
  console.log('✨ PAMPAX is ready for development!');
}