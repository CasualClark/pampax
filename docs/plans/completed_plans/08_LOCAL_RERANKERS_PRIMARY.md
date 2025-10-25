
# Plan — Local Rerankers as Primary (Stage‑B)

Local, offline rerankers become the **default** Stage‑B option. Remote APIs (Cohere/Voyage) are **secondary** and share the same provider interface and cache contract.

## Goals
- Deterministic, low‑latency reranking without network dependency
- Drop‑in provider interface parallel to `cohere`/`voyage`
- Zero changes to existing RRF fusion and cache semantics

## Provider Interface (TS sketch)
```ts
export interface RerankProvider {
  id: string;   // 'local', 'cohere', 'voyage'
  models(): Promise<string[]>;
  rerank(q: string, docs: string[], opts?: { model?: string, topK?: number }): Promise<{index:number, score:number}[]>;
}
```

`local` implementation supports on‑device cross‑encoders. Recommended approach:
- Bind to a local inference runtime (e.g., ONNX Runtime / GGUF runner / transformers.js)
- Batch scoring with fixed max sequence; sliding window for long docs
- Stable floating‑point formatting (`toFixed(6)`) for cache hashing

## CLI
```bash
# Default to local
pampax rerank --q "http server" --provider local --model bge-small --input out/candidates.jsonl --topK 50

# Explicit remote providers (optional)
pampax rerank --provider cohere --model rerank-english-v3.0
pampax rerank --provider voyage --model voyage-code-2
```

## Caching (unchanged)
- Key = `hash(provider|model|query|sortedCandidateIDs)`
- Never overwrite on partial results; treat 4xx/5xx as soft failures; retry with exponential backoff
- Emit JSON suitable for regression tests

## Testing
- Unit: score determinism; topK stability; partial batch recovery
- Integration: parity tests against synthetic corpora; JSON fixtures for CI
- UX: TTY/non‑TTY snapshots; `--json` mode

## Telemetry (opt‑in)
- Record average latency, batch size, and GPU/CPU device for diagnostics
