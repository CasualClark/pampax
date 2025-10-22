import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { Span } from '../../src/types/core.js';

export interface TestFixture {
  name: string;
  files: Record<string, string>;
  expectedSpans?: Span[];
}

export class TestUtils {
  private static fixturesDir = join(__dirname, '..', 'fixtures');
  
  static ensureFixturesDir(): void {
    if (!existsSync(this.fixturesDir)) {
      mkdirSync(this.fixturesDir, { recursive: true });
    }
  }

  static createTempDir(name: string): string {
    const tempDir = join(__dirname, '..', 'temp', name);
    if (!existsSync(tempDir)) {
      mkdirSync(tempDir, { recursive: true });
    }
    return tempDir;
  }

  static writeFixture(fixture: TestFixture): void {
    this.ensureFixturesDir();
    const fixtureDir = join(this.fixturesDir, fixture.name);
    
    if (!existsSync(fixtureDir)) {
      mkdirSync(fixtureDir, { recursive: true });
    }

    // Write files
    for (const [filePath, content] of Object.entries(fixture.files)) {
      const fullPath = join(fixtureDir, filePath);
      const dir = fullPath.substring(0, fullPath.lastIndexOf('/'));
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      writeFileSync(fullPath, content);
    }

    // Write expected spans if provided
    if (fixture.expectedSpans) {
      writeFileSync(
        join(fixtureDir, 'expected-spans.json'),
        JSON.stringify(fixture.expectedSpans, null, 2)
      );
    }
  }

  static loadFixture(name: string): TestFixture | null {
    const fixtureDir = join(this.fixturesDir, name);
    
    if (!existsSync(fixtureDir)) {
      return null;
    }

    const files: Record<string, string> = {};
    const expectedSpansPath = join(fixtureDir, 'expected-spans.json');
    let expectedSpans: Span[] | undefined;

    // Load expected spans if they exist
    if (existsSync(expectedSpansPath)) {
      try {
        const content = readFileSync(expectedSpansPath, 'utf-8');
        expectedSpans = JSON.parse(content);
      } catch (error) {
        console.warn(`Failed to load expected spans for fixture ${name}:`, error);
      }
    }

    return {
      name,
      files,
      expectedSpans
    };
  }

  static compareSpans(actual: Span[], expected: Span[]): boolean {
    if (actual.length !== expected.length) {
      return false;
    }

    const sortKey = (span: Span) => `${span.path}:${span.byteStart}:${span.kind}:${span.name}`;
    
    const actualSorted = [...actual].sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
    const expectedSorted = [...expected].sort((a, b) => sortKey(a).localeCompare(sortKey(b)));

    return actualSorted.every((actualSpan, index) => {
      const expectedSpan = expectedSorted[index];
      return (
        actualSpan.path === expectedSpan.path &&
        actualSpan.byteStart === expectedSpan.byteStart &&
        actualSpan.byteEnd === expectedSpan.byteEnd &&
        actualSpan.kind === expectedSpan.kind &&
        actualSpan.name === expectedSpan.name &&
        actualSpan.signature === expectedSpan.signature
      );
    });
  }

  static async withTimeout<T>(
    promise: Promise<T>, 
    timeoutMs: number,
    errorMessage = 'Operation timed out'
  ): Promise<T> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(errorMessage)), timeoutMs);
    });

    return Promise.race([promise, timeoutPromise]);
  }

  static createMockSpan(overrides: Partial<Span> = {}): Span {
    return {
      id: 'test-span-id',
      repo: 'test-repo',
      path: 'test.py',
      byteStart: 0,
      byteEnd: 100,
      kind: 'function',
      name: 'test_function',
      signature: 'def test_function():',
      doc: 'Test function documentation',
      parents: [],
      references: [],
      ...overrides
    };
  }
}