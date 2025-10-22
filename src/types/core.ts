export type SpanKind =
  | "module" 
  | "class" 
  | "function" 
  | "method" 
  | "property" 
  | "enum" 
  | "interface" 
  | "comment";

export interface Span {
  id: string;                 // hash(repo|path|range|kind|name|signature|doc_hash|parents_hash)
  repo: string;
  path: string;
  byteStart: number;
  byteEnd: number;
  kind: SpanKind;
  name?: string;
  signature?: string;
  doc?: string;
  parents?: string[];
  references?: Array<{ 
    path: string; 
    byteStart: number; 
    byteEnd: number; 
    kind?: "call"|"read"|"write" 
  }>;
}

export interface Adapter {
  id: string;
  supports(filePath: string): boolean;
  parse(files: string[]): Promise<Span[]>;
}

export type IndexProgressEvent =
  | { type: 'start'; totalFiles: number }
  | { type: 'fileParsed'; path: string }
  | { type: 'spansEmitted'; path: string; count: number }
  | { type: 'chunksStored'; path: string; count: number }
  | { type: 'embeddingsQueued'; path: string; count: number }
  | { type: 'done'; durationMs: number }
  | { type: 'error'; path: string; error: string };

export interface Chunk {
  id: string;
  spanId: string;
  content: string;
  embedding?: number[];
  metadata: {
    repo: string;
    path: string;
    byteStart: number;
    byteEnd: number;
    spanKind: SpanKind;
    spanName?: string;
  };
}

export interface IndexingOptions {
  repo: string;
  paths: string[];
  adapters: string[];
  force?: boolean;
  incremental?: boolean;
}

export interface IndexingResult {
  totalFiles: number;
  processedFiles: number;
  totalSpans: number;
  totalChunks: number;
  errors: Array<{ path: string; error: string }>;
  durationMs: number;
}