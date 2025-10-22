# 06_INCREMENTAL_INDEXING.md

## Goals
- Watch file changes, debounce, and index only dirty spans.
- Detect near-duplicates to avoid storing moved clones.
- **Emit progress events** so the CLI can render activity.

## File Watching
- Cross-platform watcher (e.g., chokidar).
- Settings: `awaitWriteFinish`, `ignoreInitial: true`.
- Ignore `node_modules`, `build`, `.dart_tool`, `.venv`, `.git`, `.hg`.

## Dirty Detection
- On change: compute `content_hash`; compare to DB.  
- Re-parse; compute `span.id`; upsert changed; delete removed.

## Near-Duplicate Filter
- SimHash/MinHash on chunk content; skip insert if near-duplicate within repo.

## Events
- On parse → `fileParsed(path)`  
- After spans → `spansEmitted(path,count)`  
- After storage → `chunksStored(path,count)`  
- After enqueue → `embeddingsQueued(path,count)`
