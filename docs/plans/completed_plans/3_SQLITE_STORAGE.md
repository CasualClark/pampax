# 03_SQLITE_STORAGE.md

## Base Tables
```sql
CREATE TABLE IF NOT EXISTS file (
  id INTEGER PRIMARY KEY,
  repo TEXT NOT NULL,
  path TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  lang TEXT NOT NULL,
  UNIQUE(repo, path)
);

CREATE TABLE IF NOT EXISTS span (
  id TEXT PRIMARY KEY,
  repo TEXT NOT NULL,
  path TEXT NOT NULL,
  byte_start INTEGER NOT NULL,
  byte_end INTEGER NOT NULL,
  kind TEXT NOT NULL,
  name TEXT,
  signature TEXT,
  doc TEXT,
  parents TEXT
);

CREATE TABLE IF NOT EXISTS chunk (
  id TEXT PRIMARY KEY,
  span_id TEXT NOT NULL REFERENCES span(id) ON DELETE CASCADE,
  repo TEXT NOT NULL,
  path TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS embedding (
  chunk_id TEXT NOT NULL REFERENCES chunk(id) ON DELETE CASCADE,
  model TEXT NOT NULL,
  dim INTEGER NOT NULL,
  vector BLOB NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (chunk_id, model)
);

CREATE VIRTUAL TABLE IF NOT EXISTS chunk_fts USING fts5(
  chunk_id UNINDEXED,
  repo,
  path,
  content,
  tokenize='porter'
);

CREATE TABLE IF NOT EXISTS reference (
  src_span_id TEXT NOT NULL REFERENCES span(id) ON DELETE CASCADE,
  dst_path TEXT NOT NULL,
  byte_start INTEGER NOT NULL,
  byte_end INTEGER NOT NULL,
  kind TEXT
);
```

## CLI & Rerank Support (additive)
```sql
CREATE TABLE IF NOT EXISTS job_run (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,                 -- migrate|index|search|rerank|ui
  started_at INTEGER,
  finished_at INTEGER,
  status TEXT CHECK(status IN ('ok','error')) DEFAULT 'ok',
  error_text TEXT
);

CREATE TABLE IF NOT EXISTS rerank_cache (
  id TEXT PRIMARY KEY,                -- hash(provider|model|query|candidateIDs)
  provider TEXT NOT NULL,
  model TEXT,
  query TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  result_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS search_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  query TEXT NOT NULL,
  ts INTEGER NOT NULL,
  k INTEGER NOT NULL
);
```

## PRAGMAs
- `journal_mode = WAL` (local concurrency)
- Consider `synchronous = NORMAL`, `temp_store = MEMORY` for local speed.

## Hashes
- `file.content_hash = sha256(bytes)`  
- `span.id = sha256(repo|path|range|kind|name|signature|doc_hash|parents_hash)`  
- `chunk.id = sha256(span.id|context_hash)`
