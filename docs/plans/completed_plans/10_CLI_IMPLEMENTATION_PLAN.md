# 10_CLI_IMPLEMENTATION_PLAN — CLI, Reranking & Progress UI

(See README and AGENT.MD for context.)

## Milestones
1. Scaffold CLI & schema
2. Progress UI events and rendering
3. Search (FTS)
4. RRF fusion
5. Cross-encoder rerank + cache
6. Polish (structured logs, JSON mode, exit codes)

## Commands
- migrate, index, search, rerank, ui

## Env
- Node 18+, SQLite with FTS5, `COHERE_API_KEY` / `VOYAGE_API_KEY` if used.
