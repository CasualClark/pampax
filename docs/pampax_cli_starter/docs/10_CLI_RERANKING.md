# 10_CLI_RERANKING.md — Reranking Commands & Patterns

## TL;DR
- Use **RRF** to fuse lexical (BM25/FTS) + vector candidates without score normalization.
- Use **Cohere**/**Voyage** rerankers to reorder the top N hits with a cross-encoder.

## Install
```bash
pnpm install
pnpm build
```

## Environment
```bash
export COHERE_API_KEY=...
export VOYAGE_API_KEY=...
export COHERE_RERANK_MODEL=rerank-english-v3.0
export VOYAGE_RERANK_MODEL=rerank-2-lite
```

## Commands

### 1) Local RRF fusion
```bash
pampax rerank --q "how to start server"   --provider rrf   --input out/bm25_top.json,out/vector_top.json   --topK 20 > out/fused.json
```

### 2) Cohere cross-encoder reranking
```bash
pampax rerank --q "configure Dart analysis server"   --provider cohere   --input out/candidates.jsonl   --topK 50 > out/reranked_cohere.json
```

### 3) Voyage cross-encoder reranking
```bash
pampax rerank --q "async http router setup"   --provider voyage   --input out/candidates.jsonl   --topK 50 > out/reranked_voyage.json
```

## How to produce candidates
- Lexical: query SQLite FTS table and dump top 200 to JSONL: `chunk_id\tcontent`
- Vector: do your nearest-neighbor search; dump `chunk_id\tcontent`

## Why RRF?
```
score(doc) = sum_i 1 / (k + rank_i)      # default k≈60
```
RRF is rank-based and avoids brittle score normalization across methods.
