# PLAN 07 — Explainable Context Bundles
**Target Completion:** 2025-10-24  
**Status:** 🔄 **IN PLANNING**  
**Specification:** `12_CONTEXT_EXPLAINABILITY.md`  
**Dependencies:** Phases 0-6 (Complete)  
**Version:** PAMPAX v1.16.0-oak.1  

---

## 🎯 **Phase 7 Objectives & Requirements**

### **Primary Goals**
- Make every context bundle self-explaining for humans and agents
- Provide evidence tables showing why each item was included
- Add stopping reason explanations for bundle truncation
- Create human-readable markdown output format
- Integrate explainability with existing CLI, search, and context assembly systems
- Maintain backward compatibility with Phases 0-6

### **Core Requirements**
- **CLI Command**: `pampax assemble --q "refresh rotation" --budget 3000 --md > .pampax/context.md`
- **Evidence Table**: file, symbol, reason, edge type, rank, cached?
- **Stopping Reason**: Clear explanation of why bundle assembly stopped
- **Token Report**: budget/used/model information
- **Cross-Phase Integration**: Connect with intent, token, graph, learning systems

### **Technical Constraints**
- Must build on existing Phases 0-6 foundation
- Cannot break existing CLI commands and APIs
- Must integrate with existing token budgeting system
- Should leverage existing context assembler architecture
- Must maintain performance characteristics

---

## 🏗️ **Architecture & Integration Strategy**

### **System Context**
```
Phase 7: Explainable Context Bundles
├── Phase 0-2: Foundation (Storage, Search, Indexing) ✅
├── Phase 3: Progressive Context ✅  
├── Phase 4: Intent Classification ✅
├── Phase 5: Code Graph Queryable ✅
├── Phase 6: Outcome-Driven Retrieval ✅
└── Phase 7: Explainable Bundles 🔄
    ├── Bundle Explanation Engine
    ├── Evidence Tracking System  
    ├── Markdown Generator
    ├── CLI Integration
    └── Cross-Phase Analytics
```

### **Key Integration Points**
1. **ContextAssembler**: Enhanced with explanation metadata
2. **Token Budgeting**: Integrated budget reports and stopping reasons
3. **Search Engine**: Evidence tracking for search results
4. **Graph Traversal**: Edge type and relationship explanations
5. **Learning System**: Pattern and cache hit explanations
6. **CLI Framework**: New `assemble` command with `--md` flag

---

## 📋 **Task Breakdown & Agent Assignments**

### **Phase 7.1: Foundation & CLI Infrastructure (≤4h tasks)**

#### **Task 7.1.1: CLI Assemble Command Foundation**
```ts
{
  description: "Create base CLI assemble command with --md flag",
  prompt: "Create src/cli/commands/assemble.js following existing command patterns. Implement basic command structure with --q (query), --budget, and --md flags. Integrate with main CLI in src/cli.js. Ensure command follows same patterns as search and context commands.",
  subagent_type: "Engineer",
  provides: ["cli-assemble-command"],
  depends_on: [],
  acceptance: [
    "Command registered and shows in help",
    "Basic flag parsing works",
    "Command integrates with main CLI without breaking existing commands",
    "Help text follows project patterns"
  ]
}
```

#### **Task 7.1.2: Enhanced ContextAssembler for Explanations**
```ts
{
  description: "Enhance ContextAssembler with evidence tracking",
  prompt: "Enhance src/context/assembler.js to collect explanation metadata during assembly. Track: selection reasons, edge types (for graph results), cache hits, ranking factors, and stopping conditions. Add new assembleWithExplanation() method that returns bundle with evidence metadata.",
  subagent_type: "Engineer", 
  provides: ["explanation-enhanced-assembler"],
  depends_on: [],
  acceptance: [
    "assembleWithExplanation() method implemented",
    "Evidence metadata collected for all result types",
    "Backward compatibility maintained for existing assemble() methods",
    "Evidence includes: file, symbol, reason, edge_type, rank, cached"
  ]
}
```

### **Phase 7.2: Evidence & Explanation Systems (≤4h tasks)**

#### **Task 7.2.1: Evidence Tracking System**
```ts
{
  description: "Implement comprehensive evidence tracking system",
  prompt: "Create src/context/evidence-tracker.js to capture and organize evidence for each item in context bundles. Track search score breakdown, graph relationships, intent classification matches, learning system signals, and cache status. Provide methods for evidence serialization and filtering.",
  subagent_type: "Engineer",
  provides: ["evidence-tracker-system"],
  depends_on: ["explanation-enhanced-assembler"],
  acceptance: [
    "EvidenceTracker class with comprehensive tracking capabilities",
    "Evidence serialization to structured format",
    "Integration points for all phases (search, graph, learning, intent)",
    "Unit tests covering major evidence scenarios"
  ]
}
```

#### **Task 7.2.2: Stopping Reason Engine**
```ts
{
  description: "Create stopping reason identification system",
  prompt: "Create src/context/stopping-reasons.js to identify and explain why bundle assembly stopped. Handle token budget limits, result count limits, graph traversal limits, cache boundaries, and quality thresholds. Provide human-readable explanations with specific numbers and conditions.",
  subagent_type: "Generalist",
  provides: ["stopping-reason-engine"],
  depends_on: ["explanation-enhanced-assembler"],
  acceptance: [
    "StoppingReasonEngine class with multiple condition detection",
    "Human-readable explanation generation",
    "Integration with token budget and result limiting systems",
    "Specific numbers and conditions included in explanations"
  ]
}
```

### **Phase 7.3: Markdown Generation & Output (≤4h tasks)**

#### **Task 7.3.1: Markdown Generator Core**
```ts
{
  description: "Implement markdown generator for explainable bundles",
  prompt: "Create src/context/markdown-generator.js to convert explained bundles into human-readable markdown. Generate evidence tables, stopping reason sections, token reports, and structured content sections. Follow the MD Output Ideas from specification.",
  subagent_type: "Frontend",
  provides: ["markdown-generator"],
  depends_on: ["evidence-tracker-system", "stopping-reason-engine"],
  acceptance: [
    "MarkdownGenerator class with template-based output",
    "Evidence table generation with all required columns",
    "Stopping reason section with clear explanations",
    "Token report with budget/used/model information",
    "Structured, readable markdown output format"
  ]
}
```

#### **Task 7.3.2: CLI Integration & Output**
```ts
{
  description: "Integrate markdown generation with CLI assemble command",
  prompt: "Complete src/cli/commands/assemble.js integration with enhanced assembler and markdown generator. Handle --md flag to output markdown format, integrate with existing token budgeting, scope filters, and project path resolution. Ensure output can be redirected to files.",
  subagent_type: "Engineer",
  provides: ["cli-assemble-integration"],
  depends_on: ["cli-assemble-command", "markdown-generator", "explanation-enhanced-assembler"],
  acceptance: [
    "Full CLI integration working with all flags",
    "--md flag produces markdown output",
    "Output can be redirected to files (> .pampax/context.md)",
    "Integration with token budgeting and scope filters",
    "Error handling and help text complete"
  ]
}
```

### **Phase 7.4: Cross-Phase Integration (≤4h tasks)**

#### **Task 7.4.1: Search & Graph Evidence Integration**
```ts
{
  description: "Integrate evidence tracking with search and graph systems",
  prompt: "Update search and graph systems to provide evidence metadata to context assembler. Enhance src/search/hybrid.js and src/graph/graph-traversal.js to track selection reasons, edge types, traversal paths, and ranking factors. Ensure evidence flows through to bundle assembly.",
  subagent_type: "Engineer",
  provides: ["search-graph-evidence-integration"],
  depends_on: ["evidence-tracker-system"],
  acceptance: [
    "Search system provides evidence metadata",
    "Graph traversal provides edge type and path evidence",
    "Evidence flows through to context assembler",
    "Backward compatibility maintained for existing search/graph usage"
  ]
}
```

#### **Task 7.4.2: Learning & Intent Evidence Integration**
```ts
{
  description: "Integrate learning and intent systems with evidence tracking",
  prompt: "Update learning and intent systems to contribute evidence to context bundles. Enhance src/learning/ and src/intent/ systems to provide weight explanations, intent classification confidence, cache hit status, and pattern match reasons. Integrate with evidence tracker.",
  subagent_type: "Generalist", 
  provides: ["learning-intent-evidence-integration"],
  depends_on: ["evidence-tracker-system"],
  acceptance: [
    "Learning system provides weight and pattern evidence",
    "Intent system provides classification evidence",
    "Cache hit status tracked in evidence",
    "Integration working without breaking existing functionality"
  ]
}
```

### **Phase 7.5: Testing & Validation (≤4h tasks)**

#### **Task 7.5.1: Comprehensive Test Suite**
```ts
{
  description: "Create comprehensive test suite for explainable bundles",
  prompt: "Create test suite covering all Phase 7 functionality. Include tests for CLI command, evidence tracking, markdown generation, stopping reasons, and cross-phase integration. Add performance tests to ensure explainability doesn't significantly impact assembly speed.",
  subagent_type: "Engineer",
  provides: ["explainable-bundles-test-suite"],
  depends_on: ["cli-assemble-integration", "search-graph-evidence-integration", "learning-intent-evidence-integration"],
  acceptance: [
    "90%+ test coverage for new Phase 7 code",
    "CLI command integration tests",
    "Evidence tracking accuracy tests",
    "Markdown output format validation tests",
    "Performance benchmarks (assembly time within 10% of baseline)",
    "Cross-phase integration tests"
  ]
}
```

#### **Task 7.5.2: Documentation & Examples**
```ts
{
  description: "Create documentation and usage examples",
  prompt: "Update documentation with Phase 7 features. Create usage examples in docs/usage/, update CLI help, add explainable bundles section to main documentation. Include real-world examples of markdown output and evidence tables.",
  subagent_type: "Knowledge",
  provides: ["explainable-bundles-documentation"],
  depends_on: ["cli-assemble-integration"],
  acceptance: [
    "Updated documentation with Phase 7 features",
    "Usage examples in docs/usage/ directory",
    "Real-world markdown output examples",
    "CLI help updated with assemble command",
    "Integration with existing documentation structure"
  ]
}
```

---

## 🔄 **Dependency Graph & Execution Plan**

### **Execution Order**
```
Week 1 (Parallel Tasks):
├── Task 7.1.1: CLI Command Foundation 
├── Task 7.1.2: Enhanced ContextAssembler
└── Task 7.2.2: Stopping Reason Engine

Week 2 (Dependent Tasks):
├── Task 7.2.1: Evidence Tracking System (depends on 7.1.2)
├── Task 7.3.1: Markdown Generator (depends on 7.2.1, 7.2.2)
├── Task 7.3.2: CLI Integration (depends on 7.1.1, 7.3.1, 7.1.2)
└── Task 7.4.1: Search/Graph Integration (depends on 7.2.1)

Week 3 (Final Integration):
├── Task 7.4.2: Learning/Intent Integration (depends on 7.2.1)
├── Task 7.5.1: Test Suite (depends on all integration tasks)
└── Task 7.5.2: Documentation (depends on 7.3.2)
```

### **Critical Path**
1. **Foundation** (7.1.1, 7.1.2) → **Evidence Systems** (7.2.1, 7.2.2) → **Output Generation** (7.3.1, 7.3.2) → **Integration** (7.4.1, 7.4.2) → **Validation** (7.5.1, 7.5.2)

### **Risk Mitigation**
- **Backward Compatibility**: All changes maintain existing API contracts
- **Performance Impact**: Evidence tracking designed to be lightweight
- **Complexity**: Modular design allows incremental implementation
- **Integration**: Well-defined interfaces between phases

---

## 📊 **Success Criteria & Acceptance Tests**

### **Functional Requirements**
- ✅ CLI `assemble` command with `--q`, `--budget`, and `--md` flags
- ✅ Evidence table with file, symbol, reason, edge type, rank, cached columns  
- ✅ Stopping reason explanations with specific conditions
- ✅ Token report showing budget/used/model information
- ✅ Human-readable markdown output format
- ✅ Integration with all existing phases (0-6)

### **Quality Requirements**
- ✅ Assembly time within 10% of baseline performance
- ✅ 90%+ test coverage for new Phase 7 code
- ✅ Backward compatibility with existing CLI and APIs
- ✅ Markdown output validates against common parsers
- ✅ Evidence accuracy verified through test cases

### **Integration Requirements**  
- ✅ Works with existing token budgeting system
- ✅ Integrates with search, graph, learning, and intent systems
- ✅ Maintains existing context pack and scope filter functionality
- ✅ Compatible with existing project configuration and storage

---

## 🚀 **Timeline & Resource Allocation**

### **Development Timeline**
- **Week 1**: Foundation systems (CLI, assembler enhancement, stopping reasons)
- **Week 2**: Core functionality (evidence tracking, markdown generation, integration)  
- **Week 3**: Final integration, testing, and documentation

### **Resource Allocation**
- **Engineer**: 60% (Core implementation, CLI, integration)
- **Generalist**: 20% (Stopping reasons, learning/intent integration)
- **Frontend**: 10% (Markdown generation, output formatting)
- **Knowledge**: 10% (Documentation, examples)

### **Milestone Deliverables**
1. **Week 1**: Working CLI command and enhanced assembler
2. **Week 2**: Complete explainable bundles with markdown output
3. **Week 3**: Full integration, testing, and documentation

---

## 🔍 **Testing Strategy**

### **Unit Testing**
- Evidence tracking accuracy and completeness
- Markdown generation output validation  
- Stopping reason logic correctness
- CLI command flag parsing and execution

### **Integration Testing**
- Cross-phase evidence flow validation
- Token budgeting integration tests
- Search/graph/intent/learning system integration
- End-to-end CLI workflow testing

### **Performance Testing**
- Assembly time benchmarking vs baseline
- Memory usage monitoring with evidence tracking
- Large-scale bundle generation performance
- Concurrent request handling validation

### **User Acceptance Testing**
- Markdown output readability and usefulness
- Evidence table information value
- CLI command usability and discoverability
- Real-world project scenario validation

---

## 📈 **Metrics & Monitoring**

### **Development Metrics**
- Task completion rate and timeline adherence
- Code coverage and quality metrics
- Performance benchmarks vs targets
- Integration test success rates

### **Quality Metrics**  
- Evidence tracking accuracy (measured via test cases)
- Markdown output validation success
- User acceptance testing feedback
- Backward compatibility compliance

### **Performance Metrics**
- Bundle assembly time (target: <10% increase)
- Memory overhead of evidence tracking
- CLI command response times
- Large-scale processing throughput

---

## 🎯 **Success Definition**

### **Minimum Viable Product**
CLI can generate explainable bundles with basic evidence tables and stopping reasons.

### **Complete Implementation**
Full explainable context bundles with comprehensive evidence, cross-phase integration, and human-readable markdown output.

### **Excellence Target**
Explainable bundles that significantly improve user understanding and debugging of context assembly, with minimal performance impact and seamless integration.

---

**Implementation Ready**: ✅ This plan provides comprehensive task breakdown, clear dependencies, agent assignments, and success criteria for Phase 7: Explainable Context Bundles. The plan builds on the solid foundation of Phases 0-6 while delivering human-readable explainability for PAMPAX context bundles.