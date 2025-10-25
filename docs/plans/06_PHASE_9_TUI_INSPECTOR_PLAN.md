# Phase 9 — TUI Memory & Bundle Inspector

**Based on**: `13_TUI_MEMORY_AND_BUNDLE_INSPECTOR.md` (Ink‑based)  
**Tabs**: Bundle • Memory • Graph | **Export**: copy‑pastable Markdown of the current bundle

## Objectives
- Fast, interactive inspection of current context bundle, memory scopes, and graph neighbors (r≤2).  
- Zero surprises: read‑only by default; explicit actions for pin/forget.

## Architecture
- **Runtime**: Node.js + Ink (React‑like CLI UI).  
- **Data Source**: call existing CLI with `--json` flags or read local state DB.  
- **State**: `AppState {{ tab, selection, filters, corrId }}`.

## UX Sketch
- Header: repo name • corr_id • timing.  
- **Bundle tab**: tree of files/spans; right pane = token report + stop reason.  
- **Memory tab**: list by scope/kind; actions: create/pin/forget.  
- **Graph tab**: callers/callees r≤2; jump to symbol; show edges.

## Pseudocode (Ink)

```ts
// app.tsx
function App() {
  const [tab, setTab] = useState<"bundle" | "memory" | "graph">("bundle");
  const data = useLoadData(); // calls CLI --json
  return <>
    <Header data={data.meta}/>
    <Tabs value={tab} onChange={setTab}/>
    {tab === "bundle" && <BundleView tree={data.bundle} />}
    {tab === "memory" && <MemoryView items={data.memory} />}
    {tab === "graph" && <GraphView edges={data.graph} />}
    <Footer shortcuts={["q quit", "e export md", "f filter"]}/>
  </>
}
```

## Commands
- `pampax inspect` launches the TUI.  
- `e` to export current view as Markdown (printed to STDOUT).  
- `f` to filter by path/symbol/scope.

## Tasks (Bite‑Sized)
- TUI-BOOT-1: Ink project scaffold • **Owner**: Frontend
- TUI-DATA-1: CLI `--json` payloads for bundle/memory/graph • **Owner**: Engineer
- TUI-BUNDLE-UI: Tree + token report + stop reason • **Owner**: Frontend
- TUI-MEM-UI: Memory list + pin/forget • **Owner**: Frontend
- TUI-GRAPH-UI: r≤2 callers/callees • **Owner**: Frontend
- TUI-EXPORT: Export MD • **Owner**: Frontend
- TUI-DOC: README and demo gif • **Owner**: Knowledge
- TUI-REV: Review & security check • **Owner**: Reviewer
