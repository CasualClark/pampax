# 16_TEST_PLAN_CLI_RERANKING — Unit/Integration/UX

Unit:
- RRF determinism/ties/k-sensitivity
- JSONL/JSON parsing
- Cache key stability

Integration:
- Mock providers; assert mapping and topK behavior
- FTS predictable corpus

UX:
- TTY vs non-TTY snapshots
- Long-path truncation
- JSON-only mode
