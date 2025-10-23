
# SQLite Schema Additions — Memory & Sessions

See `03_SQLITE_STORAGE.md` for base tables. This file adds durable memory and sessions.

```sql
-- (Same SQL as in Plan 05, repeated here for migration authoring)
CREATE TABLE IF NOT EXISTS memory (...);
CREATE TABLE IF NOT EXISTS session (...);
CREATE TABLE IF NOT EXISTS interaction (...);
CREATE TABLE IF NOT EXISTS memory_link (...);
```

## Migration Notes
- Use `ALTER TABLE` where possible; otherwise create new tables in a single migration
- Add `created_at` indexes and partial indexes for TTL queries
- Consider `WAL` and `synchronous=NORMAL` (already used) for performance
