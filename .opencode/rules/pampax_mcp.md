# PAMPAX MCP Usage Rule

You have access to PAMPAX, a code memory system that indexes and allows semantic search in projects.

## Basic Instructions

1. **ALWAYS at the start of a session:**
    - Run `get_project_stats` to check if the project is indexed

2. **BEFORE creating any function:**
    - Use `search_code` with semantic queries like "user authentication", "validate email", "error handling"
    - Review existing code with `get_code_chunk` before writing new code

3. **AFTER modifying code:**
    - Run `update_project` to update the knowledge base
    - This keeps the project memory synchronized

## Available Tools

- `search_code(query, limit)` - Search code semantically
- `get_code_chunk(sha)` - Get complete code of a chunk
- `update_project(path)` - Update index after changes
- `get_project_stats(path)` - Get project statistics

## Strategy

Use PAMPAX as your project memory. Search before creating, keep updated after changes, and leverage existing knowledge to avoid code duplication.

## Agent-Specific Guidance

### Orchestrator
- Use `search_code` to find relevant agents and delegation patterns
- Search for "task coordination", "workflow orchestration" patterns
- Update project after coordinating complex multi-agent workflows

### Engineer
- CRITICAL: Always search before implementing any function
- Query patterns: "authentication", "validation", "error handling", specific feature names
- Search for similar implementations to maintain consistency
- Update after every code change (not just at end of session)

### Frontend
- Search for: "component", "UI pattern", "state management", component names
- Look for existing UI components before creating new ones
- Find styling patterns and design system usage
- Update after creating/modifying components

### Architect
- Search for: "architecture", "design pattern", "structure", "module organization"
- Find existing architectural decisions and patterns
- Locate system boundaries and integration points
- Use to understand cross-cutting concerns

### Reviewer
- Search for related code during reviews to check consistency
- Find similar functions to compare implementation approaches
- Locate patterns that should be followed
- Don't update (read-only role)

### DevOps
- Search for: "deployment", "configuration", "infrastructure", "CI/CD"
- Find existing build scripts and deployment patterns
- Locate environment configuration patterns
- Update after modifying infrastructure code

### Knowledge
- Search broadly to build comprehensive understanding
- Query for: "documentation", "architecture", "API patterns"
- Find examples to include in documentation
- Update after creating/organizing documentation

### Generalist
- Use search to understand unfamiliar areas of the codebase
- Cast wide semantic nets: "how does X work", "Y functionality"
- Bridge gaps between specialized agents
- Update after making any code changes

## Performance Tips

- Use specific semantic queries, not just keywords: "OAuth authentication flow" > "auth"
- Search with intent descriptions: "validate email format" > "validate"
- Review chunk metadata (file paths, symbols) to find related code
- Limit results (5-10) for focused searches, increase for exploration
- Use multiple searches to triangulate complex functionality

## Common Patterns

### Before Implementing New Feature
```
1. search_code("feature_name")
2. search_code("similar_feature behavior")
3. get_code_chunk(relevant_shas)
4. Implement following discovered patterns
5. update_project()
```

### Refactoring Existing Code
```
1. search_code("current pattern")
2. Identify all usages with search_code
3. Refactor consistently across found chunks
4. update_project()
```

### Understanding Unfamiliar Code
```
1. search_code("high-level concept")
2. get_code_chunk(top_matches)
3. search_code("specific implementation detail")
4. Build mental model from discovered patterns
```

## Error Recovery

If tools fail:
- Check if project is indexed: `get_project_stats`
- If path issues: Ensure using project root path (not subdirectories)
