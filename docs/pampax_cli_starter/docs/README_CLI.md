# Pampax CLI — Commands & UI

## Install & Build
```bash
pnpm install
pnpm build    # compiles to dist/
```

## Commands
- `pampax migrate --db .pampax/pampax.sqlite` — initialize DB
- `pampax index --repo ./myrepo --include "src/**/*.py" --include "lib/**/*.dart"` — simulate an indexing run with live progress
- `pampax search --q "router init" --db .pampax/pampax.sqlite --k 20` — lexical search via SQLite FTS
- `pampax rerank --q "configure app" --provider cohere|voyage|rrf --input candidates.jsonl --topK 50` — rerank candidates
- `pampax ui` — demo interactive UI with tasks + progress bar

## UI Notes
- Progress UI uses **ora** (spinner) and **cli-progress** (bars).
- For JSON logs, wrap your indexer to also emit JSON events; extend UI to tail and render them.

## Wiring to your pipeline
Replace `mockIndex` in `src/cli/index_repo.ts` with your real indexer and call `ui.onEvent({...})`.

## Reranker Providers
- **Cohere**: `COHERE_API_KEY`, model via `COHERE_RERANK_MODEL`.
- **Voyage**: `VOYAGE_API_KEY`, model via `VOYAGE_RERANK_MODEL`.
- **RRF**: local fusion of lists.
