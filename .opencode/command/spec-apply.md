---
description: Apply an approved OpenSpec change and kick off execution
agent: Orchestrator
---
Apply the approved OpenSpec change: **$ARGUMENTS**.

- List the tasks from the proposal and map dependencies.
- Launch ready tasks in parallel using `task({...})` calls.
- Hold back blocked tasks and state what they need.
- Print a progress overview and expected acceptance signals.
