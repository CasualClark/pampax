# 05_DART_ADAPTER.md

## Goal
Use **Dart Analysis Server (LSP)** for reliable symbols/docs; optionally enrich with `package:analyzer`. Emit progress events to the CLI UI.

## Components
- **LSP Client** → `dart language-server` (preferred) or `dart --lsp`
  - `initialize`, `initialized`, `workspace/didChangeConfiguration`
  - `textDocument/didOpen`
  - `textDocument/documentSymbol`
  - `textDocument/hover`
  - `textDocument/semanticTokens/full` (optional)
  - `textDocument/definition`/`references` (optional)
- **(Optional)** Analyzer worker for resolved AST + Dartdoc.

## Process
1) Launch LSP in workspace root (ensure `pubspec.yaml` resolves).  
2) For each `.dart`:
   - `didOpen` → get `documentSymbol`.  
   - Compute byte ranges; fetch Dartdoc via `hover` at identifier.
   - Attach parents (library → class/extension → method).
3) Emit events: `fileParsed`, then `spansEmitted(count)`.
