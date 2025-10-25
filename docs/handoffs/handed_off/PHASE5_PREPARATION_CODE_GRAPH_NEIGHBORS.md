# Phase 5 Preparation - Code Graph Neighbors

**Status**: 🎯 **READY FOR IMPLEMENTATION**  
**Next Phase**: Phase 5 - Code Graph Neighbors  
**Dependencies**: Phases 0-4 Complete

## 🎯 Phase 5 Overview

Phase 5 will implement sophisticated code graph analysis to discover relationships between code elements, enabling developers to navigate callers/callees and understand code dependencies at scale.

### **Key Requirements from docs/00_IMPLEMENTATION_ORDER_UPDATED.md**
- **Callers/callees BFS r≤2** - Graph traversal for code relationships  
- **`--callers/--callees` flags** - CLI integration for graph navigation
- **Prefer SCIP edges** - Enhanced relationship detection when available

## 🏗️ Technical Architecture Plan

### **Core Components to Implement**

#### 1. **Graph Construction Engine**
**File**: `src/graph/graph-constructor.ts`

```typescript
export interface CodeGraphNode {
    id: string;
    name: string;
    type: 'function' | 'class' | 'method' | 'variable';
    file: string;
    line: number;
    language: string;
}

export interface CodeGraphEdge {
    from: string;
    to: string;
    type: 'calls' | 'extends' | 'implements' | 'imports' | 'uses';
    weight: number;
    confidence: number;
}

export class GraphConstructor {
    async buildGraph(repository: string): Promise<CodeGraph>;
    async addSCIPLEdges(graph: CodeGraph): Promise<void>;
    async addLSPDerivedEdges(graph: CodeGraph): Promise<void>;
    async addStaticAnalysisEdges(graph: CodeGraph): Promise<void>;
}
```

#### 2. **BFS Traversal Engine**
**File**: `src/graph/bfs-traversal.ts`

```typescript
export interface TraversalConfig {
    maxDepth: number; // r≤2 as specified
    edgeTypes: EdgeType[];
    includeWeight: boolean;
    tokenGuard?: TokenGuard;
}

export interface TraversalResult {
    nodes: CodeGraphNode[];
    edges: CodeGraphEdge[];
    depth: number;
    tokensUsed: number;
    truncated: boolean;
}

export class BFSTraversal {
    async findCallers(nodeId: string, config: TraversalConfig): Promise<TraversalResult>;
    async findCallees(nodeId: string, config: TraversalConfig): Promise<TraversalResult>;
    async findNeighbors(nodeId: string, config: TraversalConfig): Promise<TraversalResult>;
}
```

#### 3. **SCIP Integration**
**File**: `src/graph/scip-integration.ts`

```typescript
export interface SCIPIndex {
    documents: SCIPDocument[];
    symbols: SCIPSymbols[];
    relationships: SCIRelationship[];
}

export class SCIPIntegration {
    async loadSCIPIndex(repository: string): Promise<SCIPIndex>;
    async extractEdges(index: SCIPIndex): Promise<CodeGraphEdge[]>;
    async preferSCIPLEdges(edges: CodeGraphEdge[]): Promise<CodeGraphEdge[]>;
}
```

#### 4. **CLI Integration**
**File**: `src/cli/commands/graph.js`

```bash
# New CLI commands to implement
pampax graph callers <function> --depth 2 --include-types calls,extends
pampax graph callees <function> --depth 2 --token-budget 1000
pampax graph neighbors <class> --radius 2 --prefer-scip
pampax graph path <from> <to> --max-depth 3
```

## 📊 Implementation Strategy

### **Phase 5.1: Graph Foundation (Days 1-2)**
1. **Data Model Design**
   - Define CodeGraphNode and CodeGraphEdge interfaces
   - Create graph storage schema (SQLite + in-memory caching)
   - Implement serialization/deserialization

2. **Basic Graph Construction**
   - Static analysis for Python, JavaScript, TypeScript
   - Function call detection
   - Class inheritance extraction
   - Import/dependency mapping

### **Phase 5.2: Advanced Analysis (Days 3-4)**
1. **SCIP Integration**
   - SCIP index parsing and loading
   - SCIP edge extraction and prioritization
   - Fallback to LSP when SCIP unavailable

2. **BFS Traversal Engine**
   - Implement r≤2 depth constraint
   - Token guard integration with Phase 4 system
   - Performance optimization for large graphs

### **Phase 5.3: CLI & Integration (Days 5-6)**
1. **CLI Commands**
   - `--callers` and `--callees` flag implementation
   - Graph visualization options
   - Integration with existing search commands

2. **Search Integration**
   - Add graph navigation to search results
   - Combine with intent-aware search (Phase 3)
   - Token budgeting integration (Phase 4)

## 🔧 Integration with Existing Systems

### **Phase 3 Integration**
- **Intent-Aware Graph Traversal**: Different traversal strategies per intent
- **Policy-Based Graph Limits**: Intent-specific depth and result limits

### **Phase 4 Integration**  
- **Token-Guarded Traversal**: Stop traversal when token budget exceeded
- **Graph Result Packing**: Optimize graph results for token constraints

### **Existing Storage Integration**
- **Extend SQLite Schema**: Add graph_nodes and graph_edges tables
- **Leverage Existing Spans**: Use span data as graph nodes

## 📈 Performance Targets

| Operation | Target | Current Baseline |
|-----------|---------|------------------|
| Graph Construction | <5s for 10K files | TBD |
| BFS Traversal (r≤2) | <100ms | TBD |
| SCIP Loading | <2s | TBD |
| CLI Response | <500ms | TBD |

## 🧪 Testing Strategy

### **Unit Tests**
- Graph construction algorithms
- BFS traversal correctness
- SCIP integration accuracy
- Edge type detection

### **Integration Tests**
- End-to-end graph workflows
- CLI command functionality
- Performance benchmarks
- Large repository handling

### **Test Data**
- Sample repositories with known relationships
- SCIP index fixtures
- Performance test datasets

## 🚀 Success Criteria

### **Functional Requirements**
- ✅ Accurate callers/callees detection (≥90% precision)
- ✅ BFS traversal with r≤2 constraint
- ✅ SCIP edge preference when available
- ✅ CLI integration with --callers/--callees flags

### **Performance Requirements**
- ✅ Sub-second graph traversal for typical queries
- ✅ Memory efficient for large repositories (>100K files)
- ✅ Token-aware traversal with budget enforcement

### **Quality Requirements**
- ✅ 95%+ test coverage
- ✅ Comprehensive documentation
- ✅ Backward compatibility maintained

## 📁 File Structure Plan

```
src/
├── graph/
│   ├── graph-constructor.ts     # Core graph building logic
│   ├── bfs-traversal.ts         # BFS traversal engine
│   ├── scip-integration.ts      # SCIP index processing
│   ├── static-analysis.ts       # Language-specific analysis
│   ├── graph-storage.ts         # Database operations
│   └── index.ts                 # Module exports
├── cli/commands/
│   ├── graph.js                 # Graph CLI commands
│   └── search.js                # Enhanced with graph navigation
└── storage/
    └── graph-migrations.ts      # Database schema updates
```

## 🎯 Next Session Kickoff

### **Immediate Tasks (Day 1)**
1. **Setup Graph Module Structure**
   ```bash
   mkdir -p src/graph
   touch src/graph/{graph-constructor,bfs-traversal,scip-integration}.ts
   touch src/graph/index.ts
   ```

2. **Database Schema Migration**
   ```sql
   CREATE TABLE IF NOT EXISTS graph_nodes (
       id TEXT PRIMARY KEY,
       name TEXT NOT NULL,
       type TEXT NOT NULL,
       file TEXT NOT NULL,
       line INTEGER,
       language TEXT,
       metadata JSON,
       created_at DATETIME DEFAULT CURRENT_TIMESTAMP
   );

   CREATE TABLE IF NOT EXISTS graph_edges (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       from_node TEXT NOT NULL,
       to_node TEXT NOT NULL,
       edge_type TEXT NOT NULL,
       weight REAL DEFAULT 1.0,
       confidence REAL DEFAULT 1.0,
       metadata JSON,
       created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
       FOREIGN KEY (from_node) REFERENCES graph_nodes(id),
       FOREIGN KEY (to_node) REFERENCES graph_nodes(id)
   );
   ```

3. **Basic Interface Definitions**
   - Define CodeGraphNode and CodeGraphEdge interfaces
   - Create TraversalConfig and TraversalResult types
   - Set up basic class structure

### **Development Environment Setup**
- [x] Node.js ≥18 configured
- [x] TypeScript compilation working
- [x] SQLite database operational
- [x] Test framework functional
- [ ] Graph module structure created
- [ ] Database migrations prepared

## 📚 Reference Materials

### **Specifications**
- `docs/00_IMPLEMENTATION_ORDER_UPDATED.md` - Phase 5 requirements
- `docs/07_CODE_GRAPH_QUERYABLE.md` - Detailed graph query specifications

### **Existing Patterns**
- Phase 3 intent-aware search for integration patterns
- Phase 4 token budgeting for performance constraints
- Existing adapter system for language-specific analysis

### **External References**
- [SCIP Specification](https://github.com/sourcegraph/scip)
- [BFS Algorithm Patterns](https://en.wikipedia.org/wiki/Breadth-first_search)
- [Code Analysis Best Practices](https://github.com/github/super-linter)

---

**Status**: 🎯 **READY FOR IMPLEMENTATION**  
**Estimated Duration**: 6 days  
**Dependencies**: ✅ All Phases 0-4 Complete  
**Next Session**: Begin with graph construction engine implementation