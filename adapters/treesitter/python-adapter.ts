import { BaseAdapter } from '../base-adapter.js';
import { Span } from '../../src/types/core.js';
import { readFile } from 'fs/promises';

export class PythonTreeSitterAdapter extends BaseAdapter {
  id = 'treesitter-python';

  supports(filePath: string): boolean {
    return filePath.endsWith('.py');
  }

  async parse(files: string[]): Promise<Span[]> {
    const spans: Span[] = [];

    for (const filePath of files) {
      try {
        const content = await readFile(filePath, 'utf-8');
        const fileSpans = await this.parseFile(filePath, content);
        spans.push(...fileSpans);
      } catch (error) {
        console.error(`Failed to parse ${filePath}:`, error);
      }
    }

    return spans;
  }

  private async parseFile(filePath: string, content: string): Promise<Span[]> {
    const spans: Span[] = [];
    const lines = content.split('\n');

    // Simple regex-based parsing for demonstration
    // In a real implementation, this would use tree-sitter
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Match function definitions
      const funcMatch = trimmed.match(/^(async\s+)?def\s+(\w+)\s*\(([^)]*)\)(?:\s*->\s*([^:]+))?:/);
      if (funcMatch) {
        const [, , name] = funcMatch;
        const startByte = content.indexOf(line);
        const endByte = startByte + line.length;

        spans.push({
          id: this.generateSpanId('test-repo', filePath, startByte, endByte, 'function', name),
          repo: 'test-repo',
          path: filePath,
          byteStart: startByte,
          byteEnd: endByte,
          kind: 'function',
          name,
          signature: line.trim(),
          doc: this.extractDocstring(lines, i + 1),
          parents: [],
          references: []
        });
      }

      // Match class definitions
      const classMatch = trimmed.match(/^class\s+(\w+)(?:\s*\(([^)]+)\))?:/);
      if (classMatch) {
        const [, name] = classMatch;
        const startByte = content.indexOf(line);
        const endByte = startByte + line.length;

        spans.push({
          id: this.generateSpanId('test-repo', filePath, startByte, endByte, 'class', name),
          repo: 'test-repo',
          path: filePath,
          byteStart: startByte,
          byteEnd: endByte,
          kind: 'class',
          name,
          signature: line.trim(),
          doc: this.extractDocstring(lines, i + 1),
          parents: [],
          references: []
        });
      }
    }

    // Add module span
    spans.push({
      id: this.generateSpanId('test-repo', filePath, 0, content.length, 'module', this.getModuleName(filePath)),
      repo: 'test-repo',
      path: filePath,
      byteStart: 0,
      byteEnd: content.length,
      kind: 'module',
      name: this.getModuleName(filePath),
      parents: [],
      references: []
    });

    return spans;
  }

  private extractDocstring(lines: string[], startLine: number): string | undefined {
    if (startLine >= lines.length) return undefined;

    const line = lines[startLine].trim();
    if (line.startsWith('"""') || line.startsWith("'''")) {
      // Simple docstring extraction
      if (line.endsWith('"""') || line.endsWith("'''")) {
        return line.slice(3, -3).trim();
      }
      
      // Multi-line docstring
      const docLines = [line.slice(3)];
      for (let i = startLine + 1; i < lines.length; i++) {
        const currentLine = lines[i];
        docLines.push(currentLine);
        if (currentLine.includes('"""') || currentLine.includes("'''")) {
          break;
        }
      }
      
      return docLines.join('\n').replace(/["']{3}$/, '').trim();
    }

    return undefined;
  }

  private getModuleName(filePath: string): string {
    const parts = filePath.split('/');
    const fileName = parts[parts.length - 1];
    return fileName.replace('.py', '');
  }
}