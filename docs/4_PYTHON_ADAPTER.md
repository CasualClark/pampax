# 04_PYTHON_ADAPTER.md

## Goal
High-quality Python spans via **LSP (Pyright/basedpyright)** for semantics and structural chunking via Python `ast` (or Tree-sitter-python). Emit progress events to the CLI UI.

## Components
- **LSP Client** (JSON-RPC over stdio)
  - `initialize`, `initialized`, `textDocument/didOpen`
  - `textDocument/documentSymbol`
  - `textDocument/hover`
  - `textDocument/definition`/`references` (optional)
- **Structural Parser**
  - Python `ast` → `FunctionDef`/`AsyncFunctionDef`/`ClassDef` + docstrings.
- **Mapper**
  - Merge structural spans with LSP info (types/defs/refs).

## Process
1) Start `pyright-langserver --stdio`.  
2) For each file:
   - Send `didOpen` with text.
   - Request `documentSymbol` for hierarchy.
   - Parse with `ast.parse`; extract signatures/decorators/docstrings.
   - Build spans (byte ranges from line/col mapping).
   - Optionally `hover` for types/docs on public API.
3) Emit events: `fileParsed`, then `spansEmitted(count)`.

## Edge Cases
- Dynamic code → structural-only.  
- Large files → cap `hover`/`refs` to public API.
