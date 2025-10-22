import { test, describe } from 'node:test';
import assert from 'node:assert';
import { PythonTreeSitterAdapter } from '../../adapters/treesitter/python-adapter.js';
import { TestUtils } from '../framework/test-utils.js';

describe('Golden Tests - Span Extraction', () => {
  const adapter = new PythonTreeSitterAdapter();

  test('should extract spans from simple Python file', async () => {
    const fixture = TestUtils.loadFixture('simple-python');
    assert(fixture, 'Fixture simple-python not found');

    const filePath = Object.keys(fixture.files)[0];
    const spans = await adapter.parse([filePath]);

    // Basic validation
    assert(spans.length > 0, 'Should extract at least one span');
    
    // Should have a module span
    const moduleSpans = spans.filter(s => s.kind === 'module');
    assert(moduleSpans.length > 0, 'Should have module span');
    
    // Should have function spans
    const functionSpans = spans.filter(s => s.kind === 'function');
    assert(functionSpans.length > 0, 'Should have function spans');
    
    // Check specific function
    const greetFunction = functionSpans.find(s => s.name === 'greet');
    assert(greetFunction, 'Should find greet function');
    assert.strictEqual(greetFunction.signature, 'def greet(name: str) -> str:');
    assert.strictEqual(greetFunction.doc, 'A simple greeting function');
  });

  test('should match expected spans exactly', async () => {
    const fixture = TestUtils.loadFixture('simple-python');
    assert(fixture, 'Fixture simple-python not found');
    assert(fixture.expectedSpans, 'Fixture missing expected spans');

    const filePath = Object.keys(fixture.files)[0];
    const actualSpans = await adapter.parse([filePath]);

    // Compare with expected spans
    const matches = TestUtils.compareSpans(actualSpans, fixture.expectedSpans);
    assert(matches, 'Actual spans do not match expected spans');
  });

  test('should handle empty files', async () => {
    const tempDir = TestUtils.createTempDir('empty-test');
    const emptyFile = `${tempDir}/empty.py`;
    
    // Create empty file
    await import('fs/promises').then(fs => fs.writeFile(emptyFile, ''));
    
    const spans = await adapter.parse([emptyFile]);
    
    // Should still have a module span
    assert.strictEqual(spans.length, 1);
    assert.strictEqual(spans[0].kind, 'module');
  });

  test('should handle syntax errors gracefully', async () => {
    const tempDir = TestUtils.createTempDir('syntax-error-test');
    const badFile = `${tempDir}/bad.py`;
    
    // Create file with syntax error
    await import('fs/promises').then(fs => 
      fs.writeFile(badFile, 'def bad_function(\n  # Missing closing parenthesis')
    );
    
    // Should not throw, but may return empty or minimal spans
    const spans = await adapter.parse([badFile]);
    assert(Array.isArray(spans));
  });
});