#!/usr/bin/env node

/**
 * Integration Tests for Graph-Enhanced Context Assembly
 * Tests the integration between graph search and context assembly
 */

import assert from 'assert';
import { ContextAssembler } from '../src/context/assembler.js';

// Mock database with graph support
class MockDatabase {
    constructor() {
        this.memory = new MockMemory();
        this.storage = new MockStorage();
    }

    getStorage() {
        return this.storage;
    }

    async search(query, options = {}) {
        return [
            {
                id: 'UserService',
                file: 'src/services/UserService.js',
                content: 'class UserService { constructor() {} }',
                score: 0.9,
                metadata: { spanName: 'UserService', spanKind: 'class', lang: 'js' }
            },
            {
                id: 'AuthService',
                file: 'src/services/AuthService.js', 
                content: 'class AuthService { authenticate() {} }',
                score: 0.8,
                metadata: { spanName: 'AuthService', spanKind: 'class', lang: 'js' }
            }
        ];
    }

    async searchBM25(query, options = {}) {
        return [
            {
                id: 'DatabaseService',
                file: 'src/services/DatabaseService.js',
                content: 'class DatabaseService { connect() {} }',
                score: 0.7
            }
        ];
    }
}

class MockMemory {
    async search(query, options = {}) {
        return [
            {
                id: 'mem1',
                kind: 'user',
                scope: 'repo',
                key: 'user-service-pattern',
                value: 'UserService follows singleton pattern',
                weight: 0.8,
                rank: 0.9,
                created_at: new Date().toISOString()
            }
        ];
    }

    async findActiveSessions(tool) {
        return [];
    }

    async createSession(session) {
        return 'session-123';
    }

    async createInteraction(interaction) {
        return 'interaction-123';
    }

    async findInteractionsBySession(sessionId) {
        return [];
    }

    async getMemoryStats(scope, repo) {
        return { totalMemories: 10, byKind: { user: 5, system: 5 } };
    }

    async deleteExpired() {
        return { deleted: 0 };
    }
}

class MockStorage {
    constructor() {
        this.edges = new Map([
            ['UserService:AuthService:uses', { sourceId: 'UserService', targetId: 'AuthService', type: 'uses', confidence: 0.9 }],
            ['AuthService:TokenService:calls', { sourceId: 'AuthService', targetId: 'TokenService', type: 'calls', confidence: 0.8 }],
            ['UserService:DatabaseService:depends_on', { sourceId: 'UserService', targetId: 'DatabaseService', type: 'depends_on', confidence: 0.95 }]
        ]);
    }

    async getOutgoingEdges(nodeId, edgeTypes = null) {
        return Array.from(this.edges.values()).filter(edge => 
            edge.sourceId === nodeId && (!edgeTypes || edgeTypes.includes(edge.type))
        );
    }

    async getIncomingEdges(nodeId, edgeTypes = null) {
        return Array.from(this.edges.values()).filter(edge => 
            edge.targetId === nodeId && (!edgeTypes || edgeTypes.includes(edge.type))
        );
    }
}

async function runContextTests() {
    console.log('🧪 Running Graph-Enhanced Context Assembly Tests...\n');

    const db = new MockDatabase();
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

    // Test 1: Standard context assembly (backward compatibility)
    test('Standard context assembly works', async () => {
        const assembler = new ContextAssembler(db);
        const context = await assembler.assemble('user authentication', { limit: 5 });
        
        assert(context.query === 'user authentication');
        assert(context.sources && Array.isArray(context.sources));
        assert(context.total_tokens >= 0);
        assert(context.assembled_at);
        assert(typeof context.budget_used === 'number');
    });

    // Test 2: Graph-enhanced context assembly
    test('Graph-enhanced context assembly works', async () => {
        const assembler = new ContextAssembler(db, { graphEnabled: true });
        await assembler.setGraphEnabled(true);
        
        const context = await assembler.assembleWithGraph('user authentication', { limit: 5 });
        
        assert(context.query === 'user authentication');
        assert(context.graph_enhanced === true);
        assert(context.intent !== null);
        assert(context.graph_performance !== null);
        assert(context.sources && Array.isArray(context.sources));
    });

    // Test 3: Graph context assembly with intent
    test('Graph context assembly with intent awareness', async () => {
        const assembler = new ContextAssembler(db, { graphEnabled: true });
        await assembler.setGraphEnabled(true);
        
        const context = await assembler.assembleWithGraph('user service class', { 
            limit: 5,
            intent: { intent: 'symbol', confidence: 0.8 }
        });
        
        assert(context.graph_enhanced === true);
        assert(context.intent.intent === 'symbol');
        assert(context.graph_performance.expansion_time_ms >= 0);
    });

    // Test 4: Markdown generation with graph info
    test('Markdown generation includes graph information', async () => {
        const assembler = new ContextAssembler(db, { graphEnabled: true });
        await assembler.setGraphEnabled(true);
        
        const markdown = await assembler.assembleMarkdownWithGraph('user service', { limit: 5 });
        
        assert(markdown.includes('Graph-Enhanced Context Bundle'));
        assert(markdown.includes('Graph Enhanced:'));
        assert(markdown.includes('Intent:'));
    });

    // Test 5: Fallback behavior when graph disabled
    test('Graceful fallback when graph disabled', async () => {
        const assembler = new ContextAssembler(db, { graphEnabled: false });
        
        const context = await assembler.assembleWithGraph('user service', { limit: 5 });
        
        // Should fall back to standard assembly
        assert(context.graph_enhanced !== true); // Should be undefined or false
        assert(context.sources && Array.isArray(context.sources));
    });

    // Test 6: Graph performance stats
    test('Graph performance statistics available', async () => {
        const assembler = new ContextAssembler(db, { graphEnabled: true });
        await assembler.setGraphEnabled(true);
        
        const stats = assembler.getGraphPerformanceStats();
        assert(stats !== null);
        assert(typeof stats.performanceThreshold === 'number');
    });

    // Test 7: Token budget enforcement in context assembly
    test('Token budget enforced in graph context assembly', async () => {
        const assembler = new ContextAssembler(db, { graphEnabled: true });
        await assembler.setGraphEnabled(true);
        
        const context = await assembler.assembleWithGraph('user service', { 
            limit: 5,
            budget: 100 // Small budget
        });
        
        assert(context.total_tokens <= 100 || context.budget_used <= 1.0);
    });

    // Test 8: Memory integration with graph context
    test('Memory results integrated with graph context', async () => {
        const assembler = new ContextAssembler(db, { graphEnabled: true });
        await assembler.setGraphEnabled(true);
        
        const context = await assembler.assembleWithGraph('user service', { 
            include: ['code', 'memory'],
            limit: 5
        });
        
        const memorySource = context.sources.find(s => s.type === 'memory');
        assert(memorySource !== undefined);
        assert(memorySource.items && Array.isArray(memorySource.items));
    });

    console.log(`\n📊 Context Test Results: ${testsPassed}/${testsTotal} tests passed`);

    if (testsPassed === testsTotal) {
        console.log('🎉 All context assembly tests passed!');
        return true;
    } else {
        console.log('⚠️  Some context tests failed.');
        return false;
    }
}

// Test integration with actual search pipeline
async function testSearchPipelineIntegration() {
    console.log('\n🔗 Testing Search Pipeline Integration...\n');

    const db = new MockDatabase();
    const assembler = new ContextAssembler(db, { graphEnabled: true });
    await assembler.setGraphEnabled(true);

    try {
        // Test full pipeline
        const context = await assembler.assembleWithGraph('user authentication service', {
            include: ['code', 'memory'],
            limit: 10,
            budget: 2000
        });

        console.log('✅ Full search pipeline integration works');
        console.log(`   - Graph enhanced: ${context.graph_enhanced}`);
        console.log(`   - Intent: ${context.intent?.intent}`);
        console.log(`   - Sources: ${context.sources.length}`);
        console.log(`   - Total tokens: ${context.total_tokens}`);
        console.log(`   - Performance: ${context.graph_performance?.expansion_time_ms}ms`);

        return true;
    } catch (error) {
        console.log('❌ Search pipeline integration failed');
        console.log(`   Error: ${error.message}`);
        return false;
    }
}

// Main execution
if (import.meta.url === `file://${process.argv[1]}`) {
    runContextTests()
        .then(success => success && testSearchPipelineIntegration())
        .then(allSuccess => {
            if (allSuccess) {
                console.log('\n🎉 All integration tests passed! Graph-enhanced context assembly is ready.');
                process.exit(0);
            } else {
                console.log('\n⚠️  Some integration tests failed.');
                process.exit(1);
            }
        })
        .catch(error => {
            console.error('Integration test execution failed:', error);
            process.exit(1);
        });
}

export { runContextTests, testSearchPipelineIntegration };