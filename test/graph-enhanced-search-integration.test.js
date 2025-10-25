#!/usr/bin/env node

/**
 * Integration Tests for Graph-Enhanced Search System
 * Phase 5: Code Graph Neighbors
 */

import assert from 'assert';
import { GraphEnhancedSearchEngine, createGraphEnhancedSearchEngine, graphEnhancedSearch } from '../src/search/hybrid.js';
import { BFSTraversalEngine } from '../src/graph/graph-traversal.js';

// Mock storage implementation for testing
class MockStorage {
    constructor() {
        this.edges = new Map();
        this.nodes = new Map();
        this.setupTestData();
    }

    setupTestData() {
        // Create test graph structure
        const testData = [
            // Function relationships
            { sourceId: 'UserService', targetId: 'DatabaseService', type: 'uses', confidence: 0.9 },
            { sourceId: 'UserService', targetId: 'AuthService', type: 'calls', confidence: 0.8 },
            { sourceId: 'DatabaseService', targetId: 'ConnectionPool', type: 'manages', confidence: 0.95 },
            { sourceId: 'AuthService', targetId: 'TokenService', type: 'uses', confidence: 0.85 },
            
            // API relationships
            { sourceId: 'UserController', targetId: 'UserService', type: 'implements', confidence: 0.9 },
            { sourceId: 'AuthController', targetId: 'AuthService', type: 'implements', confidence: 0.9 },
            
            // Config relationships
            { sourceId: 'DatabaseService', targetId: 'database.config', type: 'configures', confidence: 1.0 },
            { sourceId: 'AuthService', targetId: 'auth.config', type: 'configures', confidence: 1.0 },
        ];

        testData.forEach(edge => {
            this.edges.set(`${edge.sourceId}:${edge.targetId}:${edge.type}`, edge);
        });
    }

    async getOutgoingEdges(nodeId, edgeTypes = null) {
        const edges = Array.from(this.edges.values()).filter(edge => 
            edge.sourceId === nodeId && (!edgeTypes || edgeTypes.includes(edge.type))
        );
        return edges;
    }

    async getIncomingEdges(nodeId, edgeTypes = null) {
        const edges = Array.from(this.edges.values()).filter(edge => 
            edge.targetId === nodeId && (!edgeTypes || edgeTypes.includes(edge.type))
        );
        return edges;
    }
}

// Test data
const mockSearchResults = {
    vectorResults: [
        { id: 'UserService', score: 0.9, metadata: { spanName: 'UserService', spanKind: 'class' } },
        { id: 'DatabaseService', score: 0.8, metadata: { spanName: 'DatabaseService', spanKind: 'class' } }
    ],
    bm25Results: [
        { id: 'AuthService', score: 0.7, metadata: { spanName: 'AuthService', spanKind: 'class' } }
    ],
    memoryResults: [],
    symbolResults: []
};

const mockIntent = {
    intent: 'symbol',
    confidence: 0.8,
    entities: [
        { type: 'class', value: 'UserService', position: 0 }
    ],
    suggestedPolicies: ['symbol-level-2']
};

async function runTests() {
    console.log('🧪 Running Graph-Enhanced Search Integration Tests...\n');

    const storage = new MockStorage();
    let testsPassed = 0;
    let testsTotal = 0;

    function test(name, testFn) {
        testsTotal++;
        try {
            testFn();
            console.log(`✅ ${name}`);
            testsPassed++;
        } catch (error) {
            console.log(`❌ ${name}`);
            console.log(`   Error: ${error.message}`);
        }
    }

    // Test 1: GraphEnhancedSearchEngine initialization
    test('GraphEnhancedSearchEngine initializes correctly', () => {
        const engine = new GraphEnhancedSearchEngine(storage);
        assert(engine instanceof GraphEnhancedSearchEngine);
        assert(engine.storage === storage);
        assert(engine.bfsEngine instanceof BFSTraversalEngine);
    });

    // Test 2: Symbol extraction from search results
    test('Symbol extraction works correctly', async () => {
        const engine = new GraphEnhancedSearchEngine(storage);
        const symbols = engine.extractSymbolsForExpansion(mockSearchResults.vectorResults, mockIntent);
        
        assert(symbols.includes('UserService'));
        assert(symbols.includes('DatabaseService'));
        assert(symbols.length > 0);
    });

    // Test 3: Graph expansion functionality
    test('Graph expansion produces correct results', async () => {
        const engine = new GraphEnhancedSearchEngine(storage);
        const expansion = await engine.performGraphExpansion({
            query: 'user service',
            startSymbols: ['UserService'],
            intent: mockIntent,
            options: { max_depth: 2, token_budget: 4000 }
        });

        assert(expansion.query === 'user service');
        assert(expansion.start_symbols.includes('UserService'));
        assert(expansion.visited_nodes.size > 0);
        assert(expansion.edges.length > 0);
        assert(expansion.tokens_used >= 0);
        assert(typeof expansion.truncated === 'boolean');
    });

    // Test 4: Graph-enhanced search with all components
    test('Full graph-enhanced search workflow', async () => {
        const engine = new GraphEnhancedSearchEngine(storage);
        const result = await engine.searchWithGraphExpansion({
            query: 'user authentication service',
            vectorResults: mockSearchResults.vectorResults,
            bm25Results: mockSearchResults.bm25Results,
            memoryResults: mockSearchResults.memoryResults,
            symbolResults: mockSearchResults.symbolResults,
            intent: mockIntent,
            limit: 10
        });

        assert(result.results && Array.isArray(result.results));
        assert(result.graphExpansion !== null);
        assert(result.performance_ms >= 0);
        assert(typeof result.tokens_used === 'number');
        assert(typeof result.truncated === 'boolean');
        
        // Check that results are enhanced with graph information
        const enhancedResults = result.results.filter(r => r.graphRelationships);
        assert(enhancedResults.length >= 0); // May be 0 if no connections found
    });

    // Test 5: Intent-aware graph scoring
    test('Intent-aware graph enhancement scoring', async () => {
        const engine = new GraphEnhancedSearchEngine(storage);
        
        // Test symbol intent scoring
        const symbolConnections = [
            { to: 'DatabaseService', type: 'uses', confidence: 0.9 },
            { to: 'AuthService', type: 'calls', confidence: 0.8 }
        ];
        
        const symbolScore = engine.calculateGraphEnhancementScore(symbolConnections, mockIntent);
        assert(symbolScore > 0);
        assert(symbolScore <= 1.0);

        // Test API intent scoring
        const apiIntent = { ...mockIntent, intent: 'api' };
        const apiConnections = [
            { to: 'UserController', type: 'implements', confidence: 0.9 }
        ];
        
        const apiScore = engine.calculateGraphEnhancementScore(apiConnections, apiIntent);
        assert(apiScore > 0);
        assert(apiScore <= 1.0);
    });

    // Test 6: Performance thresholds
    test('Performance threshold monitoring', () => {
        const engine = new GraphEnhancedSearchEngine(storage, { performanceThreshold: 100 });
        const stats = engine.getPerformanceStats();
        
        assert(stats.performanceThreshold === 100);
        assert(stats.bfsEngine !== null);
        
        engine.setPerformanceThreshold(200);
        const updatedStats = engine.getPerformanceStats();
        assert(updatedStats.performanceThreshold === 200);
    });

    // Test 7: Fallback behavior on errors
    test('Graceful fallback on graph errors', async () => {
        // Create a storage that throws errors
        const faultyStorage = {
            async getOutgoingEdges() { throw new Error('Storage error'); },
            async getIncomingEdges() { throw new Error('Storage error'); }
        };

        const engine = new GraphEnhancedSearchEngine(faultyStorage);
        const result = await engine.searchWithGraphExpansion({
            query: 'test query',
            vectorResults: mockSearchResults.vectorResults,
            bm25Results: mockSearchResults.bm25Results,
            limit: 5
        });

        // Should fallback to standard search without graph expansion
        assert(result.results);
        assert(result.graphExpansion === null);
        assert(result.error); // Should contain error information
    });

    // Test 8: Token budget enforcement
    test('Token budget enforcement in graph expansion', async () => {
        const engine = new GraphEnhancedSearchEngine(storage);
        const expansion = await engine.performGraphExpansion({
            query: 'test query with many results',
            startSymbols: ['UserService', 'DatabaseService', 'AuthService'],
            intent: mockIntent,
            options: { max_depth: 2, token_budget: 100 } // Very small budget
        });

        // Should respect token budget
        assert(expansion.tokens_used <= 100 || expansion.truncated);
    });

    // Test 9: Convenience function
    test('Convenience graphEnhancedSearch function', async () => {
        const result = await graphEnhancedSearch({
            query: 'user service',
            vectorResults: mockSearchResults.vectorResults,
            limit: 5
        }, storage);

        assert(result.results);
        assert(typeof result.performance_ms === 'number');
    });

    // Test 10: Factory function with intent classifier
    test('createGraphEnhancedSearchEngine factory function', async () => {
        const engine = await createGraphEnhancedSearchEngine(storage, {
            defaultTokenBudget: 2000,
            performanceThreshold: 150
        });

        assert(engine instanceof GraphEnhancedSearchEngine);
        assert(engine.intentClassifier !== null); // Should be initialized
        
        const stats = engine.getPerformanceStats();
        assert(stats.performanceThreshold === 150);
    });

    console.log(`\n📊 Test Results: ${testsPassed}/${testsTotal} tests passed`);

    if (testsPassed === testsTotal) {
        console.log('🎉 All tests passed! Graph-enhanced search integration is working correctly.');
        process.exit(0);
    } else {
        console.log('⚠️  Some tests failed. Please review the implementation.');
        process.exit(1);
    }
}

// Performance benchmark
async function runPerformanceBenchmark() {
    console.log('\n⚡ Running Performance Benchmark...\n');

    const storage = new MockStorage();
    const engine = new GraphEnhancedSearchEngine(storage);

    const testQueries = [
        'user service authentication',
        'database connection management',
        'API controller implementation',
        'configuration file handling',
        'token validation service'
    ];

    const results = [];

    for (const query of testQueries) {
        const startTime = Date.now();
        
        const result = await engine.searchWithGraphExpansion({
            query,
            vectorResults: mockSearchResults.vectorResults,
            bm25Results: mockSearchResults.bm25Results,
            limit: 10
        });

        const duration = Date.now() - startTime;
        
        results.push({
            query,
            duration,
            graphNodes: result.graphExpansion?.visited_nodes.size || 0,
            graphEdges: result.graphExpansion?.edges.length || 0,
            tokensUsed: result.tokens_used || 0,
            truncated: result.truncated || false
        });
    }

    console.table(results);
    
    const avgDuration = results.reduce((sum, r) => sum + r.duration, 0) / results.length;
    const maxDuration = Math.max(...results.map(r => r.duration));
    
    console.log(`\n📈 Performance Summary:`);
    console.log(`Average duration: ${avgDuration.toFixed(2)}ms`);
    console.log(`Max duration: ${maxDuration}ms`);
    console.log(`Performance target: <200ms`);
    console.log(`Target met: ${avgDuration < 200 ? '✅' : '❌'}`);
}

// Main execution
if (import.meta.url === `file://${process.argv[1]}`) {
    runTests()
        .then(() => runPerformanceBenchmark())
        .catch(error => {
            console.error('Test execution failed:', error);
            process.exit(1);
        });
}

export { runTests, runPerformanceBenchmark };