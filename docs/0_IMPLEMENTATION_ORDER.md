# 00_IMPLEMENTATION_ORDER.md

## Objective
Ship high-quality parsing and indexing for **Python** and **Dart**, with a stable storage layer and a clean adapter interface. Keep Tree-sitter for structure, add LSP where semantics help, and leave room for SCIP sidecars. Add a CLI layer to drive, observe, and test the pipeline.

## Order of Work
1) **Codebase Prep & Structure** — directories, feature flags, interfaces, tests.  
   _Docs:_ `01_CODEBASE_PREP.md`, `02_ARCHITECTURE_OVERVIEW.md`

2) **SQLite Storage & Hashing** — schemas for files, spans, chunks, vectors, references; content hashing & dedupe.  
   _Docs:_ `03_SQLITE_STORAGE.md`

3) **CLI Foundation** — `migrate`, `index` (with progress UI), `search`, `rerank`, `ui`.  
   _Docs:_ `10_CLI_IMPLEMENTATION_PLAN.md`, `14_CLI_CHECKLIST.md`, `13_PROGRESS_UI_SPEC.md`

4) **Adapter Interface + Tree-sitter base** — implement the `Adapter` interface and a Tree-sitter adapter for structural chunking (functions/classes/doc-comments).  
   _Docs:_ `02_ARCHITECTURE_OVERVIEW.md`

5) **Python Adapter** — Pyright/basedpyright LSP + structural chunking (Python `ast` or Tree-sitter). Emit progress events.  
   _Docs:_ `04_PYTHON_ADAPTER.md`

6) **Dart Adapter** — Dart LSP (Analysis Server) + doc extraction; optional analyzer pass; emit progress events.  
   _Docs:_ `05_DART_ADAPTER.md`

7) **Incremental Indexing** — file watching, debounced writes, span-level diffing, near-duplicate detection.  
   _Docs:_ `06_INCREMENTAL_INDEXING.md`

8) **Retrieval** — BM25 + vectors; **RRF** fusion; **cross-encoder rerank** with caching.  
   _Docs:_ `07_RETRIEVAL_PIPELINE_STUB.md`, `12_RERANK_PIPELINE_SPEC.md`

9) **Optional SCIP Sidecar** — read `.scip` and map occurrences to `Span` model.  
   _Docs:_ `08_SCIP_SIDECAR.md`

## Success Criteria
- Python/Dart produce consistent **Span** records and **Chunk** rows in SQLite.  
- Re-indexing only re-embeds changed spans (hash-stable).  
- CLI commands provide visibility; rerank cache works; end-to-end test passes.
