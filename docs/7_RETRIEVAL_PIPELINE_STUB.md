# 07_RETRIEVAL_PIPELINE_STUB.md

## Stage A — Candidate Generation
- **Lexical (FTS5)**: search `chunk_fts` by `MATCH`, return top-K IDs.
- **Vectors (later)**: ANN nearest neighbors (SQLite ext or pgvector).

## Stage A.5 — RRF Fusion (local)
Combine ranked lists using **Reciprocal Rank Fusion**:
```
score(doc) = Σ_i 1 / (k + rank_i)    # default k=60
```
- Stable across heterogeneous scorers.
- Keep K small (e.g., 200) for later reranking.

## Stage B — Cross-Encoder Rerank (optional)
- Providers: **Cohere** / **Voyage** (`/v1/rerank`).
- Payload: `query`, `documents`, `model`, `top_n|top_k`.
- Cap candidates (≤ 1,000), persist raw JSON to `rerank_cache`.

## Output
- Final ordered list `{id, score}` (score from fusion or provider).

## CLI Integration
- `pampax search` → emits Stage A results.  
- `pampax rerank` → runs Stage A.5/B and writes cache.
