# 02_ARCHITECTURE_OVERVIEW.md

## Unified Data Model
```ts
export type SpanKind =
  | "module" | "class" | "function" | "method" | "property" | "enum" | "interface" | "comment";

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
  references?: Array<{ path: string; byteStart: number; byteEnd: number; kind?: "call"|"read"|"write" }>;
}

export interface Adapter {
  id: string;
  supports(filePath: string): boolean;
  parse(files: string[]): Promise<Span[]>;
}
```

## Indexer Pipeline
1) **Discover files** → choose adapter(s).  
2) **Parse** → adapter emits `Span[]`.  
3) **Chunk** → span text + leading docs + small sibling window.  
4) **Store** → SQLite (files, spans, chunks, embeddings).  
5) **Embed** → only for new/dirty chunks.  
6) **Retrieve** → FTS (BM25-like), vectors (later), fusion, rerank.

## CLI Layer & Event Contract
- CLI wraps the pipeline and renders status via spinners/bars/task lists.
- Minimal event type shared across adapters and the indexer:

```ts
type IndexProgressEvent =
 | { type: 'start'; totalFiles: number }
 | { type: 'fileParsed'; path: string }
 | { type: 'spansEmitted'; path: string; count: number }
 | { type: 'chunksStored'; path: string; count: number }
 | { type: 'embeddingsQueued'; path: string; count: number }
 | { type: 'done'; durationMs: number };
```

Adapters should report `fileParsed` and `spansEmitted`; the indexer reports `chunksStored` and `embeddingsQueued`.

## Failure Strategy
- If LSP fails, index with Tree-sitter structure.  
- If Tree-sitter fails, index a coarse file-level chunk (last resort).  
- Store error telemetry per file.
