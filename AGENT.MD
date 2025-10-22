# AGENT.MD — Project Overview & Bootstrapping
**Date:** 2025-10-21

This document gives an AI agent (or a new human contributor) immediate context to start working on Pampax’s code-aware indexing pipeline.

## Where the project is
- **Architecture:** Language adapters emit structured **Spans**; we chunk spans, store them in **SQLite** (with FTS5), and (optionally) embed for vector search.
- **Parsers:** Tree-sitter is the fast structural default. For **Dart** and **Python**, we add **LSP** adapters (Dart Analysis Server; Pyright) for semantics (names/types/docs/defs/refs).
- **Retrieval:** Stage A = lexical (FTS). Stage B = optional **RRF** fusion and **cross-encoder reranking** (Cohere/Voyage). Caching supported.
- **SCIP:** Optional sidecar for precise defs/refs. Consumed if present.
- **CLI:** Commands for `migrate`, `index` (with live progress UI), `search`, `rerank`, and `ui` demo.

## Where it’s going (near-term goals)
1. **Ship Python & Dart adapters** with progress events and stable span ranges.
2. **Hybrid retrieval**: RRF fusion of lexical + vectors; optional cross-encoder rerank.
3. **Incremental indexing**: only re-embed dirty spans; SimHash for near-dupe suppression.
4. **Developer UX**: progress bars/spinners; JSON logs; deterministic tests.

## Key decisions (do not second-guess unless metrics fail)
- **Tree-sitter stays** as structural baseline (0.21 runtime broadly compatible).
- **Dart & Python use LSP** for semantics first (Dart Analysis Server, Pyright).
- **SCIP is optional**: import if present; otherwise rely on LSP for navigation edges.
- **SQLite first** (local-first); pgvector later for server/team installs.
- **Two-stage retrieval**: RRF → cross-encoder (cap candidates; cache results).

## Constraints & assumptions
- Tooling must run on macOS/Linux laptops; Windows supported but not the path of least resistance.
- Node.js ≥ 18 is preferred for global `fetch` in CLI utilities.
- SQLite with FTS5 is available (no external services required for the baseline).

## Directory layout (reference)
```
/adapters
  /treesitter        # structural
  /lsp               # dart/python (and others later)
  /scip              # optional sidecar reader
/indexer             # pipeline, watcher, hashing, span diff
/storage             # sqlite glue + migrations
/retrieval           # fts, vectors, fusion, rerankers
/cli                 # migrate, index, search, rerank, ui
/tests               # fixtures + golden tests
/docs                # starting plans
  /completed_plans   # finished plans
  /implementation_reports # summaries of completed implementations
  /READMEs              # Guides and references for users
  /pampax_cli_starter              # Starting CLI files to eventually move
```

## One-page runbook
1. **Initialize DB**
   - `pampax migrate --db .pampax/pampax.sqlite`
2. **Index a small repo** (shows UI)
   - `pampax index --repo ./myrepo --include "src/**/*.py" --include "lib/**/*.dart"`
3. **Search baseline**
   - `pampax search --q "router init" --k 20`
4. **Rerank candidates**
   - RRF: `pampax rerank --q "http server" --provider rrf --input out/bm25.json,out/vector.json --topK 20`
   - Cohere/Voyage: export keys and run `--provider cohere|voyage` with `--input candidates.jsonl`
5. **Troubleshoot**
   - Inspect `job_run` status; check error logs; re-run with `--json` for machine-consumable traces.

## Acceptance checks the agent should run
- Python/Dart fixtures produce stable **Span** records and **Chunk** rows.
- Re-indexing touches only changed spans; embeddings queued only for dirty chunks.
- CLI commands return sane outputs; rerank cache grows; progress UI renders in TTY and degenerate logs in non-TTY.

## Pointers
- **Adapters:** `04_PYTHON_ADAPTER.md`, `05_DART_ADAPTER.md`
- **Storage:** `03_SQLITE_STORAGE.md`
- **Retrieval:** `07_RETRIEVAL_PIPELINE_STUB.md`, `12_RERANK_PIPELINE_SPEC.md`
- **CLI:** `10_CLI_IMPLEMENTATION_PLAN.md`, `14_CLI_CHECKLIST.md`
- **SCIP:** `08_SCIP_SIDECAR.md`

> If uncertain: prefer structural chunks + lexical search first; add semantics, vectors, and rerank incrementally with measurements.
