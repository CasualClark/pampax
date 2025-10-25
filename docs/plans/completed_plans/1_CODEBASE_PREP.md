# 01_CODEBASE_PREP.md

## Goals
- Establish directory layout, feature flags, logging, and test scaffolding.
- Define stable data models for spans/chunks/embeddings.

## Suggested Directory Layout
```
/adapters
  /treesitter
  /lsp
  /scip
/indexer
/storage
/retrieval
/cli
/tests
/docs
```

## Feature Flags (JSON)
```json
{
  "lsp": { "python": true, "dart": true },
  "treesitter": { "enabled": true },
  "scip": { "read": true },
  "vectors": { "sqlite_vec": true, "pgvector": false },
  "ui": { "json": false, "tty": true }
}
```

## Logging & Telemetry
- Structured logs (JSON), levels: `INFO`, `WARN`, `ERROR`, `DEBUG`.
- Per-file trace and timings from parse → spans → storage.
- Persist recent errors for triage.

## Testing
- Unit tests for adapters, hashing, SQL persistence.
- Golden tests for span extraction (snapshots in `tests/fixtures`).
- Integration test: run indexer on a fixture repo → assert DB contents.

## Acceptance Criteria
- CLI boots with config; migrations apply cleanly.  
- Tests run with one command.
