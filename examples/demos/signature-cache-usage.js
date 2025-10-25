/**
 * Example usage of the Signature Cache System for Phase 6
 * 
 * This example demonstrates how to integrate the signature cache
 * with a search pipeline to cache successful query→bundle patterns.
 */

import { CacheIntegration } from '../src/learning/cache-integration.js';
import { getCacheConfig } from '../src/learning/cache-config.js';

async function demonstrateSignatureCache() {
  console.log('🚀 Signature Cache System Demo\n');
  
  // Initialize cache integration with development configuration
  const cacheConfig = getCacheConfig('development', {
    maxSize: 100,
    satisfactionThreshold: 0.8
  });
  
  const cache = new CacheIntegration(cacheConfig);
  
  try {
    // Example 1: Generate query signatures
    console.log('📝 Generating query signatures...');
    
    const query1 = 'find user authentication functions';
    const intent1 = { intent: 'symbol', confidence: 0.85, entities: [], suggestedPolicies: [] };
    const context1 = { repo: 'myapp/backend', language: 'typescript' };
    
    const signature1 = cache.generateQuerySignature(query1, intent1, context1);
    console.log(`Query: "${query1}"`);
    console.log(`Signature: ${signature1}`);
    console.log();
    
    // Example 2: Cache successful search results
    console.log('💾 Caching search results...');
    
    await cache.cacheResult(signature1, 'bundle_auth_functions_123', 0.9, {
      resultCount: 15,
      searchTime: 45,
      sources: ['code', 'memory', 'symbols']
    });
    
    console.log(`Cached result for ${signature1} with satisfaction 0.9`);
    console.log();
    
    // Example 3: Retrieve cached results (cache hit)
    console.log('🔍 Checking cache for existing query...');
    
    const startTime = Date.now();
    const cachedResult = await cache.getCachedResult(signature1);
    const lookupTime = Date.now() - startTime;
    
    if (cachedResult) {
      console.log(`✅ Cache hit! Found bundle: ${cachedResult.bundleId}`);
      console.log(`   Satisfaction: ${cachedResult.satisfaction}`);
      console.log(`   Usage count: ${cachedResult.usageCount}`);
      console.log(`   Lookup time: ${lookupTime}ms`);
    } else {
      console.log('❌ Cache miss');
    }
    console.log();
    
    // Example 4: Cache miss scenario
    console.log('🔍 Checking cache for new query...');
    
    const query2 = 'database connection setup';
    const signature2 = cache.generateQuerySignature(query2);
    
    const newResult = await cache.getCachedResult(signature2);
    if (!newResult) {
      console.log(`❌ Cache miss for ${signature2}`);
      console.log('   Would need to perform expensive search operation...');
    }
    console.log();
    
    // Example 5: Process outcome signals
    console.log('📊 Processing outcome signals...');
    
    const outcomeSignals = [
      {
        bundleSignature: signature1,
        satisfied: true,
        query: query1,
        sessionId: 'session_123',
        timeToFix: 1200,
        tokenUsage: 450
      },
      {
        bundleSignature: 'q_another_signature',
        satisfied: false,
        query: 'unrelated query',
        sessionId: 'session_124',
        timeToFix: 5000,
        tokenUsage: 800
      }
    ];
    
    await cache.processOutcomeSignals(outcomeSignals);
    console.log(`Processed ${outcomeSignals.length} outcome signals`);
    console.log();
    
    // Example 6: Cache statistics
    console.log('📈 Cache Performance Statistics:');
    
    const stats = await cache.getCacheStats();
    console.log(`   Total requests: ${stats.totalRequests}`);
    console.log(`   Cache hits: ${stats.cacheHits}`);
    console.log(`   Cache misses: ${stats.cacheMisses}`);
    console.log(`   Hit rate: ${(stats.hitRate * 100).toFixed(1)}%`);
    console.log(`   Cached entries: ${stats.entries}`);
    console.log();
    
    // Example 7: Cache invalidation
    console.log('🗑️  Cache invalidation example...');
    
    // Add another entry
    await cache.cacheResult('q_temp_entry', 'bundle_temp', 0.85);
    console.log('Added temporary entry');
    
    // Invalidate by pattern
    await cache.invalidateCache('temp');
    console.log('Invalidated entries matching "temp" pattern');
    
    const finalStats = await cache.getCacheStats();
    console.log(`Final cache entries: ${finalStats.entries}`);
    console.log();
    
    console.log('✨ Demo completed successfully!');
    
  } catch (error) {
    console.error('❌ Demo failed:', error);
  } finally {
    await cache.destroy();
  }
}

// Performance benchmark
async function performanceBenchmark() {
  console.log('\n⚡ Performance Benchmark\n');
  
  const cache = new CacheIntegration({ maxSize: 1000 });
  
  try {
    const numOperations = 1000;
    console.log(`Running ${numOperations} cache operations...`);
    
    // Benchmark cache writes
    const writeStartTime = Date.now();
    for (let i = 0; i < numOperations; i++) {
      const signature = `q_benchmark_${i}`;
      await cache.cacheResult(signature, `bundle_${i}`, 0.9);
    }
    const writeTime = Date.now() - writeStartTime;
    
    // Benchmark cache reads
    const readStartTime = Date.now();
    for (let i = 0; i < numOperations; i++) {
      const signature = `q_benchmark_${i % 100}`; // Some cache hits, some misses
      await cache.getCachedResult(signature);
    }
    const readTime = Date.now() - readStartTime;
    
    console.log(`📝 Write performance: ${numOperations} operations in ${writeTime}ms`);
    console.log(`   Average write time: ${(writeTime / numOperations).toFixed(2)}ms/op`);
    console.log(`   Writes per second: ${(numOperations / (writeTime / 1000)).toFixed(0)}`);
    console.log();
    
    console.log(`📖 Read performance: ${numOperations} operations in ${readTime}ms`);
    console.log(`   Average read time: ${(readTime / numOperations).toFixed(2)}ms/op`);
    console.log(`   Reads per second: ${(numOperations / (readTime / 1000)).toFixed(0)}`);
    console.log();
    
    const stats = await cache.getCacheStats();
    console.log(`📊 Final hit rate: ${(stats.hitRate * 100).toFixed(1)}%`);
    
  } finally {
    await cache.destroy();
  }
}

// Run the demo
if (import.meta.url === `file://${process.argv[1]}`) {
  demonstrateSignatureCache()
    .then(() => performanceBenchmark())
    .catch(console.error);
}

export { demonstrateSignatureCache, performanceBenchmark };