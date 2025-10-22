# 13_PROGRESS_UI_SPEC — Events & Renderers

Event type: see `02_ARCHITECTURE_OVERVIEW.md`.

Renderers:
- Spinner (ora) for status
- Progress bar (cli-progress) for file count + ETA
- Task list (listr2) for phases

Non-TTY: fallback to line logs; `--json` for machine output.
