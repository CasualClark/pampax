import { createHash } from 'crypto';

export class HashUtils {
  static sha256(data: string): string {
    return createHash('sha256').update(data, 'utf8').digest('hex');
  }

  static hashFileContent(content: Buffer): string {
    return createHash('sha256').update(content).digest('hex');
  }

  static hashSpanId(
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
    const docHash = doc ? this.sha256(doc) : '';
    const parentsHash = parents && parents.length > 0 ? this.sha256(parents.join(',')) : '';
    
    const components = [
      repo,
      path,
      `${byteStart}-${byteEnd}`,
      kind,
      name || '',
      signature || '',
      docHash,
      parentsHash
    ];
    
    return this.sha256(components.join('|'));
  }

  static hashChunkId(spanId: string, contentHash: string): string {
    return this.sha256(`${spanId}|${contentHash}`);
  }

  static hashContext(content: string): string {
    return this.sha256(content);
  }

  static hashRerankCacheKey(
    provider: string,
    model: string,
    query: string,
    options: any[]
  ): string {
    const optionsStr = options.length > 0 ? JSON.stringify(options) : '';
    return this.sha256(`${provider}|${model}|${query}|${optionsStr}`);
  }
}