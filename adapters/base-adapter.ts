import { Adapter, Span } from '../src/types/core.js';

export abstract class BaseAdapter implements Adapter {
  abstract id: string;
  
  abstract supports(filePath: string): boolean;
  
  abstract parse(files: string[]): Promise<Span[]>;

  protected generateSpanId(
    repo: string,
    path: string,
    byteStart: number,
    byteEnd: number,
    kind: string,
    name?: string,
    signature?: string,
    doc?: string,
    parents?: string[]
  ): string {
    const docHash = doc ? this.simpleHash(doc) : '';
    const parentsHash = parents ? this.simpleHash(parents.join('|')) : '';
    
    const source = `${repo}|${path}|${byteStart}-${byteEnd}|${kind}|${name || ''}|${signature || ''}|${docHash}|${parentsHash}`;
    return this.simpleHash(source);
  }

  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }
}