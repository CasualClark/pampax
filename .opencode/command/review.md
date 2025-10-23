---
description: Code review with spec adherence, security, and performance checks
agent: Reviewer
---
Perform a structured review on the latest changes:

- Spec adherence (cite the OpenSpec change)
- Tests, type checks, lint (are gates green?)
- Security: input validation, authz, secrets handling
- Performance: obvious hotspots, N+1 queries, unnecessary recomputation
- Maintainability: naming, cohesion, small functions

Return a **decision** (approve/block) with concrete, minimal change requests.
