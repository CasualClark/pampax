#!/usr/bin/env node

/**
 * Demo: StoppingReasonEngine Integration
 * 
 * This demo shows how the StoppingReasonEngine integrates with the context assembler
 * to provide detailed explanations for why bundle assembly stopped.
 */

import { StoppingReasonEngine, integrateWithAssembler } from './src/context/stopping-reasons.js';

async function demoStoppingReasons() {
  console.log('🔍 StoppingReasonEngine Demo\n');
  
  // Create a stopping reason engine
  const engine = new StoppingReasonEngine({
    enableDetailedLogging: true,
    cacheHitThreshold: 0.8,
    qualityScoreThreshold: 0.3,
    budgetWarningThreshold: 0.9
  });
  
  // Simulate a context assembly session with various stopping conditions
  console.log('📊 Starting simulated context assembly session...\n');
  
  engine.startSession({ 
    query: 'user authentication flow', 
    budget: 5000,
    limit: 10 
  });
  
  // Simulate various conditions that might stop assembly
  
  console.log('💰 Recording token budget usage...');
  const budgetExplanation = engine.recordTokenBudget(5200, 5000, 'code-search');
  console.log(`   ${budgetExplanation.title}: ${budgetExplanation.explanation}`);
  
  console.log('\n📏 Recording result limit exceeded...');
  const limitExplanation = engine.recordResultLimit(15, 10, 'memory-search');
  console.log(`   ${limitExplanation.title}: ${limitExplanation.explanation}`);
  
  console.log('\n⭐ Recording quality threshold issues...');
  const qualityExplanation = engine.recordQualityThreshold(
    0.25, 
    0.4, 
    { path: '/src/auth/weak-match.js', id: 'weak-match-1' }, 
    'symbol-search'
  );
  console.log(`   ${qualityExplanation.title}: ${qualityExplanation.explanation}`);
  
  console.log('\n❌ Recording search failures...');
  const searchFailure1 = engine.recordSearchFailure(
    new Error('Database connection timeout'), 
    'vector-search', 
    1
  );
  console.log(`   ${searchFailure1.title}: ${searchFailure1.explanation}`);
  
  const searchFailure2 = engine.recordSearchFailure(
    new Error('Index not found'), 
    'bm25-search', 
    2
  );
  console.log(`   ${searchFailure2.title}: ${searchFailure2.explanation}`);
  
  console.log('\n💾 Recording cache boundary...');
  const cacheExplanation = engine.recordCacheBoundary(950, 1000, 0.75, 'graph-cache');
  console.log(`   ${cacheExplanation.title}: ${cacheExplanation.explanation}`);
  
  console.log('\n🕸️ Recording graph traversal limits...');
  const graphExplanation = engine.recordGraphTraversalLimit(120, 100, 80, 75, 'graph-engine');
  console.log(`   ${graphExplanation.title}: ${graphExplanation.explanation}`);
  
  console.log('\n⏱️ Recording timeout...');
  const timeoutExplanation = engine.recordTimeout(6200, 5000, 'graph-traversal');
  console.log(`   ${timeoutExplanation.title}: ${timeoutExplanation.explanation}`);
  
  console.log('\n📉 Recording content degradation...');
  const degradationExplanation = engine.recordDegradationTriggered(
    'medium', 
    8500, 
    5200, 
    'budget-exceeded'
  );
  console.log(`   ${degradationExplanation.title}: ${degradationExplanation.explanation}`);
  
  // End the session and get comprehensive analysis
  console.log('\n📈 Generating comprehensive analysis...\n');
  const analysis = engine.endSession();
  
  // Display summary
  console.log('📋 Session Summary:');
  console.log(`   Total Conditions: ${analysis.summary.totalConditions}`);
  console.log(`   High Severity: ${analysis.summary.highSeverityCount}`);
  console.log(`   Medium Severity: ${analysis.summary.mediumSeverityCount}`);
  console.log(`   Low Severity: ${analysis.summary.lowSeverityCount}`);
  console.log(`   Duration: ${analysis.summary.duration}ms`);
  console.log(`   Tokens Used: ${analysis.summary.tokensUsed.toLocaleString()}`);
  console.log(`   Items Processed: ${analysis.summary.itemsProcessed}`);
  console.log(`   Cache Hit Rate: ${(analysis.summary.cacheHitRate * 100).toFixed(1)}%`);
  console.log(`   Search Success Rate: ${(analysis.summary.searchSuccessRate * 100).toFixed(1)}%`);
  
  // Display recommendations
  console.log('\n💡 Recommendations:');
  analysis.recommendations.forEach((rec, index) => {
    console.log(`   ${index + 1}. [${rec.priority.toUpperCase()}] ${rec.title}`);
    console.log(`      ${rec.description}`);
    rec.actions.slice(0, 2).forEach(action => {
      console.log(`      • ${action}`);
    });
    console.log('');
  });
  
  // Show if assembly should stop
  console.log(`🛑 Should Stop: ${engine.shouldStop() ? 'YES' : 'NO'}`);
  
  // Export examples
  console.log('\n📤 Export Examples:');
  
  console.log('\n--- JSON Export (first 200 chars) ---');
  const jsonExport = engine.exportConditions('json');
  console.log(jsonExport.substring(0, 200) + '...');
  
  console.log('\n--- CSV Export (first 3 lines) ---');
  const csvExport = engine.exportConditions('csv');
  const csvLines = csvExport.split('\n').slice(0, 3);
  csvLines.forEach(line => console.log(line));
  
  console.log('\n✅ Demo completed successfully!');
}

// Demo integration with context assembler
async function demoAssemblerIntegration() {
  console.log('\n🔗 Context Assembler Integration Demo\n');
  
  // Create a mock context assembler
  const mockAssembler = {
    assembleWithExplanation: async (query, options) => {
      console.log(`🔍 Assembling context for query: "${query}"`);
      
      // Simulate assembly with stopping conditions
      await new Promise(resolve => setTimeout(resolve, 100));
      
      return {
        query,
        total_tokens: 4800,
        sources: [
          { type: 'code', items: new Array(8) },
          { type: 'memory', items: new Array(5) },
          { type: 'symbols', items: new Array(3) }
        ],
        explanation: {
          stopping_conditions: [
            'Token budget nearly exhausted (4800/5000 tokens)',
            'Result limit reached (16/10 items)',
            'Code search failed: Connection timeout'
          ],
          evidence: [],
          ranking_factors: [],
          cache_stats: { hits: 12, misses: 8, hit_rate: 0.6 }
        }
      };
    }
  };
  
  // Integrate with stopping reason engine
  const engine = integrateWithAssembler(mockAssembler, {
    enableDetailedLogging: true
  });
  
  console.log('🔧 Integrated StoppingReasonEngine with ContextAssembler\n');
  
  // Use the enhanced assembler
  const result = await mockAssembler.assembleWithExplanation(
    'user authentication implementation',
    { budget: 5000, limit: 10 }
  );
  
  console.log('📊 Enhanced Assembly Result:');
  console.log(`   Query: ${result.query}`);
  console.log(`   Total Tokens: ${result.total_tokens.toLocaleString()}`);
  console.log(`   Sources: ${result.sources.length}`);
  
  if (result.explanation.stopping_reasons) {
    const reasons = result.explanation.stopping_reasons;
    console.log(`   Stopping Conditions: ${reasons.summary.totalConditions}`);
    console.log(`   High Severity: ${reasons.summary.highSeverityCount}`);
    console.log(`   Medium Severity: ${reasons.summary.mediumSeverityCount}`);
    
    if (reasons.recommendations.length > 0) {
      console.log('\n💡 Top Recommendation:');
      const topRec = reasons.recommendations[0];
      console.log(`   ${topRec.title} (${topRec.priority})`);
      console.log(`   ${topRec.description}`);
    }
  }
  
  console.log('\n✅ Integration demo completed!');
}

// Run demos
async function runDemos() {
  try {
    await demoStoppingReasons();
    await demoAssemblerIntegration();
  } catch (error) {
    console.error('❌ Demo failed:', error);
    process.exit(1);
  }
}

// Only run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runDemos();
}

export { demoStoppingReasons, demoAssemblerIntegration };