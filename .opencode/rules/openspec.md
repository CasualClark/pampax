# OpenSpec MCP Usage Rule

You have access to OpenSpec, a specification-driven development system that manages feature proposals, task delegation, and project workflows.

## Basic Instructions

1. **WORKFLOW COORDINATION:**
   - Use OpenSpec to propose features, track progress, and archive completed work
   - Follow the spec-driven development pattern: Propose → Review → Implement → Validate → Archive
   - Maintain separation between execution (OpenCode) and tracking (OpenSpec)

2. **BEFORE starting any feature:**
   - Search PAMPAX for similar existing patterns
   - Create or reference an OpenSpec proposal for the work
   - Break down complex work into delegable tasks

3. **DURING implementation:**
   - Follow the OpenSpec specification strictly
   - Update task status as work progresses
   - Document decisions and deviations in the spec

4. **AFTER completing work:**
   - Ensure Reviewer validation before considering work done
   - Archive the OpenSpec once deployed
   - Update PAMPAX index to reflect new patterns

## Available Tools

OpenSpec tools are accessed through the MCP interface:
- `create_proposal` - Create new feature specifications
- `update_proposal` - Modify existing specifications
- `list_proposals` - View all proposals and their status
- `get_proposal` - Retrieve full proposal details
- `archive_proposal` - Archive completed work
- `create_task` - Break down work into delegable units
- `update_task_status` - Track task progress

## Core Workflow Pattern

### Phase 1: Planning (Architect/Orchestrator)
```
1. User request comes in
2. Search PAMPAX for similar implementations
3. Create OpenSpec proposal with findings
4. Break into tasks if complex (>1 agent needed)
5. Delegate to appropriate specialist agents
```

### Phase 2: Execution (Engineer/Frontend/Builder)
```
1. Receive delegated task from OpenSpec
2. Search PAMPAX before implementing
3. Follow proposal specifications
4. Implement with test coverage (≥80% for Engineer)
5. Update task status upon completion
```

### Phase 3: Validation (Reviewer)
```
1. Review code against OpenSpec specifications
2. Validate test coverage and quality
3. Check security (OWASP Top 10)
4. Approve or request changes
5. Mark task as validated
```

### Phase 4: Deployment (DevOps)
```
1. Execute deployment following OpenSpec
2. Verify deployment success
3. Create conventional commit
4. Update OpenSpec with deployment info
```

### Phase 5: Archival (Orchestrator)
```
1. Confirm all tasks completed and validated
2. Archive OpenSpec proposal
3. Update project documentation
4. Ensure PAMPAX is updated
```

## Agent-Specific Guidance

### Orchestrator
**Role**: Plan architect and workflow coordinator
- **CREATE** OpenSpec proposals for complex multi-step features
- **DELEGATE** tasks to specialist agents through OpenSpec
- **TRACK** progress across parallel workstreams
- **ARCHIVE** completed proposals after deployment
- **Pattern**: Plan → Delegate → Track → Archive

**Key Actions**:
```
1. create_proposal(title, description, acceptance_criteria)
2. create_task(proposal_id, agent, description, dependencies)
3. Monitor task status, unblock dependencies
4. archive_proposal(proposal_id) when fully deployed
```

### Architect
**Role**: Strategic planner and proposal creator
- **RESEARCH** using PAMPAX and context7 before proposing
- **CREATE** detailed OpenSpec proposals with evidence
- **DOCUMENT** architectural decisions and rationale
- **COLLABORATE** with Orchestrator on task breakdown
- **Never implements** - hands off to Orchestrator for delegation

**Key Actions**:
```
1. Search PAMPAX for similar patterns
2. Research with context7/web-search-prime
3. create_proposal with comprehensive design
4. Include alternatives considered and trade-offs
```

### Engineer (Python TDD Specialist)
**Role**: Backend implementation following specs
- **FOLLOW** OpenSpec specifications strictly
- **SEARCH** PAMPAX before implementing any function
- **TEST-FIRST** - write tests before implementation
- **UPDATE** task status: in-progress → completed
- **ENSURE** ≥80% test coverage before marking done

**Key Actions**:
```
1. get_proposal(proposal_id) to understand requirements
2. Search PAMPAX for similar implementations
3. Implement following TDD (test, fail, implement, pass)
4. update_task_status(task_id, "completed")
5. update_project() in PAMPAX after changes
```

### Frontend (Flutter UI Specialist)
**Role**: UI implementation following design specs
- **FOLLOW** OpenSpec UI/UX specifications
- **SEARCH** PAMPAX for existing components and patterns
- **IMPLEMENT** screens and widgets per spec
- **INTEGRATE** with backend APIs as specified
- **UPDATE** task status upon completion

**Key Actions**:
```
1. get_proposal(proposal_id) for UI specifications
2. Search PAMPAX for reusable components
3. Implement UI following Flutter best practices
4. update_task_status(task_id, "completed")
5. update_project() in PAMPAX after changes
```

### Builder (Full-Stack Generalist)
**Role**: End-to-end feature implementation
- **FOLLOW** OpenSpec for both backend and frontend
- **SEARCH** PAMPAX across Python and Flutter codebases
- **IMPLEMENT** complete features (API + UI)
- **BRIDGE** backend and frontend concerns
- **UPDATE** task status and PAMPAX after completion

**Key Actions**:
```
1. get_proposal(proposal_id) for full feature spec
2. Search PAMPAX for backend and frontend patterns
3. Implement API and UI components
4. Ensure integration works end-to-end
5. update_task_status and update_project()
```

### Reviewer (Quality Validator)
**Role**: Mandatory validation before merge
- **VALIDATE** against OpenSpec acceptance criteria
- **CHECK** test coverage meets requirements (≥80%)
- **AUDIT** security (OWASP Top 10)
- **VERIFY** code quality and standards
- **APPROVE** or request changes in OpenSpec

**Key Actions**:
```
1. get_proposal(proposal_id) for acceptance criteria
2. Review implementation against specifications
3. Run test coverage analysis
4. Security audit with PAMPAX search
5. update_task_status(task_id, "validated") if approved
```

### Knowledge (Research & Documentation)
**Role**: Research-driven insights and documentation
- **RESEARCH** using context7 and web-search-prime
- **DOCUMENT** findings in OpenSpec proposals
- **NEVER IMPLEMENTS** - provides insights only
- **CREATE** comprehensive documentation specs
- **SUPPORT** Architect with evidence-based research

**Key Actions**:
```
1. Research best practices and alternatives
2. Search PAMPAX for existing documentation patterns
3. create_proposal for documentation initiatives
4. Provide evidence-based recommendations
```

### DevOps (Deployment Specialist)
**Role**: Build, deploy, and infrastructure management
- **EXECUTE** deployments per OpenSpec specifications
- **ARCHIVE** OpenSpec proposals after successful deployment
- **CREATE** conventional commits linking to specs
- **MANAGE** build configurations and CI/CD
- **HANDLE** infrastructure as specified

**Key Actions**:
```
1. get_proposal(proposal_id) for deployment requirements
2. Execute deployment steps
3. Verify deployment success
4. archive_proposal(proposal_id) when fully deployed
5. Git commit with conventional format referencing spec
```

### Generalist (Triage & Quick Fixes)
**Role**: Rapid problem solver and smart escalation
- **TRIAGE** incoming requests (<30min = handle, >30min = escalate)
- **USE** OpenSpec for tracking even small fixes
- **SEARCH** PAMPAX to understand context quickly
- **ESCALATE** to appropriate specialist via OpenSpec delegation
- **UPDATE** task status for transparency

**Key Actions**:
```
1. Assess complexity and scope
2. If simple (<30min): implement and update task
3. If complex (>30min): create_task for specialist
4. Always search PAMPAX first
5. update_task_status upon completion or delegation
```

## Integration with Other Systems

### OpenSpec + PAMPAX Pattern
```
Planning Phase:
1. User request → Architect receives
2. Search PAMPAX for similar features
3. Create OpenSpec proposal with PAMPAX findings
4. Include references to similar code patterns

Implementation Phase:
1. Agent receives task from OpenSpec
2. Search PAMPAX before writing new code
3. Implement following discovered patterns
4. Update PAMPAX after implementation
5. Update OpenSpec task status

Validation Phase:
1. Reviewer gets proposal and task from OpenSpec
2. Search PAMPAX for consistency checks
3. Validate against OpenSpec acceptance criteria
4. Update task status with validation results
```

### OpenSpec + Task System Integration
- OpenSpec creates high-level proposals and tasks
- Task system (external) tracks day-to-day execution
- Maintain clear separation: OpenSpec = what & why, Tasks = how & when
- Link external task IDs in OpenSpec descriptions for cross-reference

### OpenSpec + Documentation (context7)
- Document architectural decisions in OpenSpec proposals
- Reference proposals in project documentation
- Use context7 to retrieve historical proposal context
- Archive proposals become permanent project knowledge

## Common OpenSpec Patterns

### Pattern 1: Simple Feature (Single Agent)
```
User Request → Generalist triages
↓
Generalist creates OpenSpec proposal
↓
Generalist implements and updates PAMPAX
↓
Generalist marks task completed
↓
Reviewer validates against proposal
↓
DevOps deploys and archives proposal
```

### Pattern 2: Complex Feature (Multi-Agent)
```
User Request → Architect receives
↓
Architect researches with PAMPAX + context7
↓
Architect creates comprehensive OpenSpec proposal
↓
Orchestrator reviews and creates delegated tasks
↓
(Parallel Execution)
├─ Engineer: Backend implementation
├─ Frontend: UI implementation  
└─ Database: Schema changes
↓
Reviewer validates all tasks against proposal
↓
DevOps deploys and archives proposal
```

### Pattern 3: Research & Propose
```
User explores idea → Knowledge receives
↓
Knowledge researches with context7/web-search-prime
↓
Knowledge searches PAMPAX for existing solutions
↓
Knowledge creates OpenSpec proposal with recommendations
↓
Architect refines proposal with architectural decisions
↓
Orchestrator delegates tasks when approved
```

### Pattern 4: Bug Fix Workflow
```
Bug reported → Generalist triages
↓
If simple (<30min):
  ├─ Generalist fixes directly
  ├─ Creates small OpenSpec proposal for tracking
  ├─ Updates PAMPAX
  └─ Reviewer quick validation
↓
If complex (>30min):
  ├─ Generalist creates detailed OpenSpec proposal
  ├─ Orchestrator delegates to specialist
  ├─ Specialist implements with tests
  ├─ Reviewer validates
  └─ DevOps deploys and archives
```

## OpenSpec Proposal Structure

### Essential Elements
```markdown
# [Feature Name]

## Overview
Brief description of what and why

## Context
- Current state analysis
- PAMPAX search findings
- Related existing features

## Requirements
- Functional requirements
- Non-functional requirements (performance, security)
- Acceptance criteria (specific, testable)

## Design
- Architecture/approach
- Alternatives considered
- Trade-offs and rationale

## Implementation Plan
- Task breakdown
- Agent assignments
- Dependencies
- Estimated complexity

## Testing Strategy
- Test cases required
- Coverage targets (≥80% for backend)
- Security considerations

## Deployment
- Deployment steps
- Rollback plan
- Monitoring requirements
```

## Quality Gates

### Before Creating Proposal
- [ ] Searched PAMPAX for similar features
- [ ] Researched alternatives (Knowledge/Architect)
- [ ] Defined clear acceptance criteria
- [ ] Identified appropriate agents

### Before Implementation
- [ ] OpenSpec proposal exists and is approved
- [ ] PAMPAX search completed for patterns
- [ ] Task delegated to correct specialist
- [ ] Dependencies identified and clear

### Before Marking Complete
- [ ] All acceptance criteria met
- [ ] Tests written and passing (≥80% coverage)
- [ ] PAMPAX updated with new code
- [ ] OpenSpec task status updated

### Before Archiving
- [ ] Reviewer validation completed
- [ ] Successfully deployed to production
- [ ] Documentation updated
- [ ] PAMPAX index synchronized

## Status Tracking

### Proposal Status Flow
```
draft → proposed → in-progress → review → validated → deployed → archived
```

### Task Status Flow  
```
pending → assigned → in-progress → completed → validated → closed
```

### Status Update Best Practices
- Update status immediately upon state changes
- Include brief notes on blockers or issues
- Link to relevant commits or external tasks
- Tag appropriate agents when status requires attention

## Error Recovery

### If OpenSpec Tools Fail
```
1. Check MCP server connection status
2. Verify proposal/task IDs are valid
3. Try listing proposals to confirm connectivity
4. Fall back to manual tracking if necessary
5. Re-sync when tools recover
```

### If Proposal Gets Stale
```
1. Review current state vs OpenSpec specification
2. Update proposal with actual implementation details
3. Document deviations and rationale
4. Ensure PAMPAX reflects current code
5. Get Reviewer re-validation if significant drift
```

### If Tasks Get Blocked
```
1. Update task status with blocker details
2. Tag Orchestrator in OpenSpec comments
3. Create dependency tasks if needed
4. Escalate to appropriate specialist
5. Consider parallel work on unblocked tasks
```

## Performance Tips

### Efficient OpenSpec Usage
- **Batch updates**: Update multiple task statuses together when possible
- **Clear descriptions**: Use concise, searchable titles and descriptions
- **Link references**: Include PAMPAX SHA references in proposals
- **Tag appropriately**: Use consistent agent tags for filtering
- **Archive promptly**: Keep active proposal list focused

### Search & Reference
- Reference specific PAMPAX code chunks in proposals: `[implementation](pampax://sha)`
- Link to similar proposals: `See also: [Previous Feature](openspec://proposal-id)`
- Include context7 document references for decisions
- Tag proposals with technology/domain keywords

### Delegation Best Practices
- Break tasks into <1 day units when possible
- Assign to most specialized agent available
- Make dependencies explicit in task descriptions
- Use parallel tasks for non-conflicting work
- Include "Definition of Done" for each task

## Anti-Patterns to Avoid

### ❌ Don't
- **Skip OpenSpec for "quick" features** - Everything trackable should be tracked
- **Create proposals without PAMPAX search** - Always check for existing patterns first
- **Implement before proposal approved** - Spec-driven means spec comes first
- **Skip Reviewer validation** - Quality gate is mandatory
- **Forget to archive** - Completed proposals bloat active list
- **Update PAMPAX but not OpenSpec** - Keep both systems synchronized
- **Create overly granular tasks** - Balance detail vs overhead
- **Merge without Reviewer approval** - Violates quality process

### ✅ Do
- **Create proposals early** - Even for exploration and research
- **Search PAMPAX first** - Leverage existing knowledge
- **Follow the workflow** - Propose → Implement → Validate → Deploy → Archive
- **Update status frequently** - Keep stakeholders informed
- **Document deviations** - When reality differs from plan, record why
- **Sync PAMPAX after changes** - Maintain searchable codebase
- **Use appropriate granularity** - Tasks should be meaningful units of work
- **Validate before deploying** - Quality over speed

## Integration with OpenCode

### Tool-Agnostic Configuration
OpenCode configurations reference centralized documentation:
```json
{
  "agent": {
    "orchestrator": {
      "prompt": "{file:~/.config/opencode/prompts/orchestrator.txt}",
      "description": "Plan architect & task coordinator - see AGENT_REFERENCE.md"
    }
  }
}
```

### Multi-Environment Usage
- **Claude Desktop**: Full OpenSpec workflow via MCP
- **OpenCode TUI**: Task execution, status updates
- **Web Interface**: Proposal review and planning

### Prompt Engineering for OpenSpec
Agents receive instructions to:
- Check OpenSpec for active tasks on startup
- Update task status after completing work
- Reference proposal specifications during implementation
- Create proposals for new feature requests
- Archive proposals after successful deployment

## Quick Reference Commands

### Orchestrator Workflow
```bash
# Start new feature
create_proposal(title, description, criteria)
create_task(proposal_id, "engineer", "Backend API")
create_task(proposal_id, "frontend", "UI components")

# Monitor progress
list_proposals(status="in-progress")
get_proposal(proposal_id)

# Complete feature
archive_proposal(proposal_id)
```

### Implementation Agent Workflow
```bash
# Start work
get_proposal(proposal_id)
search_code("similar feature") # PAMPAX

# Complete work
update_task_status(task_id, "completed")
update_project() # PAMPAX sync
```

### Reviewer Workflow
```bash
# Validate work
get_proposal(proposal_id)
search_code("test coverage") # PAMPAX
search_code("security patterns") # PAMPAX

# Approve
update_task_status(task_id, "validated")
```

## Summary

OpenSpec provides the **what** and **why** of your work:
- **What**: Specifications, requirements, acceptance criteria
- **Why**: Context, rationale, architectural decisions

Combined with PAMPAX (the **how** - existing patterns) and OpenCode (the **where** - execution environment), you have a complete spec-driven development workflow.

**Remember**: Always follow the flow: Research (PAMPAX) → Specify (OpenSpec) → Implement (OpenCode) → Validate (Reviewer) → Deploy (DevOps) → Archive (OpenSpec)
