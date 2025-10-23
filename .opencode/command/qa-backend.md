---
description: Run and summarize backend quality checks
---
Run backend quality gates and summarize the results, highlighting failures first.

Reference commands (may vary per project):
- tests: `pytest -q --maxfail=1 --disable-warnings`
- coverage: `pytest --cov`
- type check: `mypy src/`
- lint: `ruff check .`

If anything fails, propose the smallest patches to fix.
