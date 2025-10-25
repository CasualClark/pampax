
# MCP API — Memory & Context

## Tools
- `memory.list({ q?: string, scope?: 'repo'|'workspace'|'global', limit?: number }): Memory[]`
- `memory.create({ kind, key, value, scope, evidence }): { id }`
- `memory.delete({ id }): { ok: true }`
- `context.assemble({ q, budget, include?: ('code'|'memory')[], callers?: number, callees?: number }): Bundle`

## Types (sketch)
```ts
type MemoryKind = 'fact'|'gotcha'|'decision'|'plan'|'rule'|'name-alias'|'insight'|'exemplar';

interface Memory {
  id: string; scope: 'repo'|'workspace'|'global'; kind: MemoryKind;
  key?: string; value: string; weight: number; createdAt: number;
  expiresAt?: number; source: any;
}
```

## Errors
- `E_SCOPE_FORBIDDEN` when attempting to widen scope without permission
- `E_TTL_REQUIRED` for workspace/global if policy demands expirations
