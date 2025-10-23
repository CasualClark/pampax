
# Plan — Durable Memory & Session Model

Give agents **long‑lived, explainable memory** that survives across sessions and is cite‑able back to evidence.

## Tables (additive)
```sql
CREATE TABLE memory (
  id TEXT PRIMARY KEY,
  scope TEXT CHECK(scope IN ('repo','workspace','global')) NOT NULL,
  repo TEXT, branch TEXT,
  kind TEXT CHECK(kind IN ('fact','gotcha','decision','plan','rule','name-alias','insight','exemplar')) NOT NULL,
  key TEXT,
  value TEXT NOT NULL,                 -- markdown text (distilled)
  weight REAL DEFAULT 1.0,
  created_at INTEGER NOT NULL,
  expires_at INTEGER,                  -- optional TTL
  source_json TEXT NOT NULL            -- evidence: files/spans/query/job_run/bundle
);

CREATE TABLE session (
  id TEXT PRIMARY KEY,
  tool TEXT, user TEXT,
  repo TEXT, branch TEXT,
  started_at INTEGER, finished_at INTEGER
);

CREATE TABLE interaction (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT REFERENCES session(id),
  ts INTEGER NOT NULL,
  query TEXT NOT NULL,
  bundle_id TEXT,
  satisfied INTEGER,                   -- 0/1
  notes TEXT
);

CREATE TABLE memory_link (
  src TEXT, dst TEXT, kind TEXT, score REAL,
  PRIMARY KEY (src,dst,kind)
);
```

## CLI
```bash
# Create memory from last bundle (with provenance)
pampax remember --scope repo --kind gotcha   --key "refresh-token-rotation" --from-bundle c_20251021T1030Z --ttl 30d

# Recall memories into assemble
pampax recall --q "rotate refresh tokens" --budget 2000 --include memory,code --md

# Cleanup
pampax forget --id m_abc123
pampax pin --span s_def456 --label "public API contract"
```

## MCP
- `memory.list({ q, scope, limit }) → Memory[]`
- `memory.create({ kind, key, value, scope, evidence }) → id`
- `memory.delete({ id })`
- `context.assemble({ q, budget, include: ['code','memory'] }) → Bundle`

## Notes
- Every memory stores `source_json` so recall is explainable and auditable
- `scope` enables repo‑local vs workspace/global reuse
- TTL supports automatic forgetting of stale hints
