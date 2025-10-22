# 11_SQLITE_SCHEMA_UPDATES — Additive Tables

See `03_SQLITE_STORAGE.md` for the authoritative schema.

New tables:
- `job_run`
- `rerank_cache`
- `search_log`

Notes:
- Use WAL; consider NORMAL sync for local speed.
