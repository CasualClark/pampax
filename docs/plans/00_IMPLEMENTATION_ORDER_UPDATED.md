
# 00 — Implementation Order (UPDATED 2025-10-24)

> **Project Status**: ✅ **87.5% COMPLETE (7/8 phases)**  
> **Current Phase**: 🎯 Phase 8 - TUI Memory & Bundle Inspector (NEXT)  
> **Last Completed**: ✅ Phase 7 - Explainable Context Bundles (COMPLETE)

> Focus change: **Local rerankers are now primary**; Cohere/Voyage are optional fallbacks.  
> Scope change: **Removed** multi‑repo & issue/PR integration from near‑term milestones.

## Phase 0 — Completed Foundation ✅ COMPLETE
- Codebase prep, storage, adapters, CLI + progress UI, baseline retrieval (FTS + RRF) ✔
- Status: Foundation components including codebase prep, architecture, storage implemented

## Phase 1 — Local Rerankers ✅ COMPLETE
- Implement local cross‑encoder rerankers behind a provider interface
- CLI: `pampax rerank --provider local --model <name> --input …`
- Cache semantics preserved; deterministic JSON outputs; parity with cloud APIs
- Status: Local rerankers implemented with provider interface and CLI integration

## Phase 2 — Memory Store & Session Model ✅ COMPLETE
- Add durable memory tables + session/interaction tracking
- CLI: `remember | recall | forget | pin`
- MCP: `memory.list/create/delete`, `context.assemble(include=['code','memory'])`
- Status: Memory store and session tracking implemented with CLI and MCP integration

## Phase 3 — Query Intent → Retrieval Policy ✅ COMPLETE
- Lightweight intent classifier; policy gates for symbol/config/incident/refactor/etc.
- Early‑stop refinement; per‑intent seed mix and depth
- Status: Intent classification and policy system implemented

## Phase 4 — Measured Token Budgeting ✅ COMPLETE
- Model‑specific tokenizers and packing profiles; degrade to capsules before dropping tests/comments
- Status: Token budgeting system with packing profiles implemented

## Phase 5 — Code Graph Neighbors ✅ COMPLETE
- Callers/callees BFS r≤2; `--callers/--callees` flags; prefer SCIP edges when present
- Status: Code graph traversal and neighbor analysis implemented

## Phase 6 — Outcome‑Driven Tuning ✅ COMPLETE
- Use interaction feedback to adjust seed weights, RRF k, and policy thresholds
- Query→bundle signature cache for recurring wins
- Status: Learning system with outcome-driven tuning implemented

## Phase 7 — Explainable Bundles ✅ COMPLETE
- `assemble --md` human‑readable rationale; explicit stopping reason and evidence table
- Implemented: CLI command, evidence tracking, markdown generation, stopping reasons
- Status: Full implementation with comprehensive testing and integration

## Phase 8 — TUI: Memory & Bundle Inspector 🔄 NEXT
- Tabs: **Bundle**, **Memory**, **Graph**; copy‑pastable `--md` view
- Plan: 13_TUI_MEMORY_AND_BUNDLE_INSPECTOR.md
- Status: Next phase to implement

### Parking Lot
- Multi‑repo & issue/PR integration (deferred)

---

## 📋 **Future Plans & Enhancements (Phases 9+)**

The following plans are available for future implementation phases:

### **Available Plans**
- **11_MEMORY_HYGIENE_AND_SAFETY.md** - Security and data protection
- **15_CLI_CHECKLIST_UPDATED.md** - Updated CLI procedures  
- **16_SQLITE_SCHEMA_MEMORY.md** - Database schema extensions
- **17_MCP_API_MEMORY.md** - MCP API specifications
- **18_EVAL_HARNESS.md** - Evaluation and testing framework

### **Enhancement Plans**
- Various CLI improvements and additional features
- Performance optimizations and advanced analytics
- Integration testing and comprehensive validation

### **Documentation Status**
- All completed phases (0-7) have plans moved to `completed_plans/`
- Implementation reports available in `docs/implementation_reports/`
- Current working directory contains only future-phase plans
