/**
 * Example: Integrating StoppingReasonEngine with ContextAssembler
 * 
 * This example shows how to enhance the existing ContextAssembler with
 * detailed stopping reason analysis.
 */

import { createContextAssembler } from '../src/context/assembler.js';
import { integrateWithAssembler } from '../src/context/stopping-reasons.js';

async function demonstrateIntegration() {
  console.log('🔗 StoppingReasonEngine Integration Example\n');
  
  // Create context assembler (you would use your actual database path)
  const dbPath = process.env.PAMPAX_DB || './.pampax/pampax.sqlite';
  
  try {
    const assembler = await createContextAssembler(dbPath);
    
    // Integrate stopping reason engine
    const engine = integrateWithAssembler(assembler, {
      enableDetailedLogging: true,
      cacheHitThreshold: 0.8,
      qualityScoreThreshold: 0.3
    });
    
    console.log('✅ StoppingReasonEngine integrated with ContextAssembler\n');
    
    // Perform context assembly with enhanced explanations
    const query = 'user authentication flow';
    const options = {
      budget: 3000,  // Small budget to trigger stopping conditions
      limit: 5,       // Low limit to trigger result limits
      include: ['code', 'memory'],
      scope: 'repo'
    };
    
    console.log(`🔍 Assembling context for: "${query}"`);
    console.log(`📊 Options: budget=${options.budget}, limit=${options.limit}\n`);
    
    const result = await assembler.assembleWithExplanation(query, options);
    
    // Display basic results
    console.log('📋 Assembly Results:');
    console.log(`   Query: ${result.query}`);
    console.log(`   Total Tokens: ${result.total_tokens.toLocaleString()}`);
    console.log(`   Budget Used: ${(result.budget_used * 100).toFixed(1)}%`);
    console.log(`   Sources: ${result.sources.length}`);
    
    // Display stopping conditions
    if (result.explanation.stopping_conditions) {
      console.log('\n⚠️  Stopping Conditions:');
      result.explanation.stopping_conditions.forEach((condition, index) => {
        console.log(`   ${index + 1}. ${condition}`);
      });
    }
    
    // Display enhanced stopping reasons analysis
    if (result.explanation.stopping_reasons) {
      const analysis = result.explanation.stopping_reasons;
      
      console.log('\n🔍 Enhanced Analysis:');
      console.log(`   Total Conditions: ${analysis.summary.totalConditions}`);
      console.log(`   High Severity: ${analysis.summary.highSeverityCount}`);
      console.log(`   Medium Severity: ${analysis.summary.mediumSeverityCount}`);
      console.log(`   Low Severity: ${analysis.summary.lowSeverityCount}`);
      console.log(`   Duration: ${analysis.summary.duration}ms`);
      console.log(`   Cache Hit Rate: ${(analysis.summary.cacheHitRate * 100).toFixed(1)}%`);
      
      // Display detailed conditions
      if (analysis.conditions.length > 0) {
        console.log('\n📝 Detailed Conditions:');
        analysis.conditions.forEach((condition, index) => {
          console.log(`   ${index + 1}. [${condition.severity.toUpperCase()}] ${condition.title}`);
          console.log(`      ${condition.explanation}`);
          if (condition.actionable.length > 0) {
            console.log(`      💡 Action: ${condition.actionable[0]}`);
          }
        });
      }
      
      // Display recommendations
      if (analysis.recommendations.length > 0) {
        console.log('\n💡 Recommendations:');
        analysis.recommendations.slice(0, 3).forEach((rec, index) => {
          console.log(`   ${index + 1}. [${rec.priority.toUpperCase()}] ${rec.title}`);
          console.log(`      ${rec.description}`);
        });
      }
    }
    
    // Display cache statistics
    if (result.explanation.cache_stats) {
      const cache = result.explanation.cache_stats;
      console.log('\n💾 Cache Statistics:');
      console.log(`   Hits: ${cache.hits}`);
      console.log(`   Misses: ${cache.misses}`);
      console.log(`   Hit Rate: ${(cache.hit_rate * 100).toFixed(1)}%`);
    }
    
    console.log('\n✅ Integration example completed successfully!');
    
  } catch (error) {
    console.error('❌ Integration failed:', error.message);
    
    if (error.message.includes('no such table')) {
      console.log('\n💡 Note: This example requires an initialized database.');
      console.log('   Run: pampax index . to create the database first.');
    }
  }
}

// Manual integration example (without the helper function)
async function demonstrateManualIntegration() {
  console.log('\n🔧 Manual Integration Example\n');
  
  const { StoppingReasonEngine } = await import('../src/context/stopping-reasons.js');
  
  // Create stopping reason engine
  const engine = new StoppingReasonEngine({
    enableDetailedLogging: true
  });
  
  // Simulate context assembly with manual tracking
  engine.startSession({ query: 'manual test', budget: 2000 });
  
  // Simulate various stopping conditions
  const budgetExplanation = engine.recordTokenBudget(2100, 2000, 'manual-code');
  console.log(`💰 ${budgetExplanation.title}: ${budgetExplanation.explanation}`);
  
  const limitExplanation = engine.recordResultLimit(12, 8, 'manual-memory');
  console.log(`📏 ${limitExplanation.title}: ${limitExplanation.explanation}`);
  
  const qualityExplanation = engine.recordQualityThreshold(0.2, 0.4, null, 'manual-search');
  console.log(`⭐ ${qualityExplanation.title}: ${qualityExplanation.explanation}`);
  
  // Get analysis
  const analysis = engine.endSession();
  
  console.log('\n📊 Manual Analysis Summary:');
  console.log(`   Conditions: ${analysis.summary.totalConditions}`);
  console.log(`   Should Stop: ${engine.shouldStop() ? 'YES' : 'NO'}`);
  
  if (analysis.recommendations.length > 0) {
    console.log(`   Top Recommendation: ${analysis.recommendations[0].title}`);
  }
  
  console.log('\n✅ Manual integration example completed!');
}

// Run examples
async function runExamples() {
  await demonstrateIntegration();
  await demonstrateManualIntegration();
}

// Execute if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runExamples().catch(console.error);
}

export { demonstrateIntegration, demonstrateManualIntegration };