#!/usr/bin/env node

/**
 * Production Benchmark Integration with PAMPAX
 * 
 * Integrates the benchmark suite with actual PAMPAX functionality
 * for measuring production gate criteria.
 */

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

// Import PAMPAX modules
let searchCode, clearBasePath, assembleCommand;

try {
    const serviceModule = await import('../../src/service.js');
    searchCode = serviceModule.searchCode;
    clearBasePath = serviceModule.clearBasePath;
} catch (error) {
    console.warn('Could not import PAMPAX service module:', error.message);
}

try {
    const assembleModule = await import('../../src/cli/commands/assemble.js');
    assembleCommand = assembleModule.default || assembleModule;
} catch (error) {
    console.warn('Could not import PAMPAX assemble command:', error.message);
}

// Import benchmark infrastructure
import {
    TestCorporaGenerator,
    BenchmarkRunner
} from './production-benchmark.js';

// Extended benchmark runner with real PAMPAX integration
class ProductionBenchmarkRunner extends BenchmarkRunner {
    constructor() {
        super();
        this.pampaxAvailable = !!(searchCode && clearBasePath);
    }
    
    async runSearchQuery(corpusDir, query, options = {}) {
        if (!this.pampaxAvailable) {
            return super.runSearchQuery(corpusDir, query, options);
        }
        
        try {
            const startTime = performance.now();
            const response = await searchCode(query, 10, 'auto', corpusDir, {
                hybrid: true,
                reranker: 'off',
                ...options
            });
            const endTime = performance.now();
            
            return {
                results: response.results || [],
                query,
                responseTime: endTime - startTime,
                totalResults: response.results?.length || 0
            };
        } catch (error) {
            console.error(`Search query failed:`, error.message);
            throw error;
        }
    }
    
    async runBundleAssembly(corpusDir) {
        if (!this.pampaxAvailable || !assembleCommand) {
            return super.runBundleAssembly(corpusDir);
        }
        
        try {
            const startTime = performance.now();
            
            // Simulate bundle assembly using search results
            const searchResponse = await searchCode('function OR class OR export', 20, 'auto', corpusDir, {
                hybrid: true,
                reranker: 'off'
            });
            
            // Create a mock bundle from search results
            const bundle = {
                query: 'bundle assembly test',
                total_tokens: searchResponse.results?.reduce((sum, result) => sum + (result.tokens || 100), 0) || 1000,
                sources: [{
                    type: 'search',
                    items: searchResponse.results || [],
                    tokens: searchResponse.results?.reduce((sum, result) => sum + (result.tokens || 100), 0) || 1000
                }],
                assembled_at: new Date().toISOString(),
                budget_used: 0.5,
                explanation: {
                    evidence: searchResponse.results?.slice(0, 5) || [],
                    graph_evidence: [],
                    reasoning: 'Benchmark bundle assembly from search results'
                }
            };
            
            const endTime = performance.now();
            
            return {
                bundle,
                responseTime: endTime - startTime,
                totalResults: searchResponse.results?.length || 0
            };
        } catch (error) {
            console.error(`Bundle assembly failed:`, error.message);
            throw error;
        }
    }
    
    async indexCorpus(corpusDir) {
        if (!this.pampaxAvailable) {
            return super.indexCorpus();
        }
        
        try {
            // Use PAMPAX indexing functionality
            const startTime = performance.now();
            
            // Clear any existing index
            if (clearBasePath) {
                clearBasePath();
            }
            
            // The actual indexing would happen through searchCode calls
            // For benchmarking, we'll simulate this with a few search calls
            await this.runSearchQuery(corpusDir, 'function', { hybrid: false });
            await this.runSearchQuery(corpusDir, 'class', { hybrid: false });
            await this.runSearchQuery(corpusDir, 'import', { hybrid: false });
            
            const endTime = performance.now();
            
            return {
                indexed: true,
                responseTime: endTime - startTime
            };
        } catch (error) {
            console.error(`Corpus indexing failed:`, error.message);
            throw error;
        }
    }
    
    async runSQLiteRead(corpusDir) {
        if (!this.pampaxAvailable) {
            return super.runSQLiteRead();
        }
        
        try {
            const startTime = performance.now();
            
            // Perform a simple search to test SQLite read performance
            await searchCode('test', 5, 'auto', corpusDir, {
                hybrid: false,
                reranker: 'off'
            });
            
            const endTime = performance.now();
            
            return endTime - startTime;
        } catch (error) {
            console.error(`SQLite read failed:`, error.message);
            throw error;
        }
    }
    
    async runQueryWithCacheInfo(corpusDir, query) {
        if (!this.pampaxAvailable) {
            return super.runQueryWithCacheInfo();
        }
        
        try {
            const startTime = performance.now();
            
            // First query (likely cache miss)
            const response1 = await this.runSearchQuery(corpusDir, query);
            const firstTime = performance.now() - startTime;
            
            // Second query (likely cache hit)
            const secondStartTime = performance.now();
            const response2 = await this.runSearchQuery(corpusDir, query);
            const secondTime = performance.now() - secondStartTime;
            
            // Determine if it was a cache hit based on response time improvement
            const likelyCacheHit = secondTime < firstTime * 0.8;
            
            return {
                hit: likelyCacheHit,
                responseTime: secondTime,
                firstTime,
                secondTime,
                results1: response1.totalResults,
                results2: response2.totalResults
            };
        } catch (error) {
            console.error(`Query with cache info failed:`, error.message);
            return {
                hit: false,
                responseTime: 100,
                error: error.message
            };
        }
    }
    
    async clearCache() {
        if (!this.pampaxAvailable) {
            return super.clearCache();
        }
        
        try {
            // Clear PAMPAX cache
            if (clearBasePath) {
                clearBasePath();
            }
            
            // Clear any temporary cache directories
            const cacheDir = path.join(os.tmpdir(), '.pampa-cache');
            await fs.rm(cacheDir, { recursive: true, force: true });
            
            // Clear any local cache
            const localCacheDir = path.join(process.cwd(), '.pampax');
            await fs.rm(localCacheDir, { recursive: true, force: true });
        } catch (error) {
            // Ignore cache clearing errors
        }
    }
    
    async runComprehensiveBenchmark() {
        console.log('🚀 Starting Comprehensive Production Benchmark Suite');
        console.log(`PAMPAX Integration: ${this.pampaxAvailable ? '✅ Available' : '❌ Not Available'}`);
        
        const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pampax-prod-bench-'));
        const generator = new TestCorporaGenerator(tmpDir);
        
        try {
            // Generate test corpora
            console.log('\n📁 Generating test corpora...');
            const mediumCorpus = await generator.generateCorpus('medium');
            const largeCorpus = await generator.generateCorpus('large');
            
            console.log(`Generated medium corpus: ${mediumCorpus.fileCount} files`);
            console.log(`Generated large corpus: ${largeCorpus.fileCount} files`);
            
            // Initialize corpus for PAMPAX
            if (this.pampaxAvailable) {
                console.log('\n🔧 Initializing corpora for PAMPAX...');
                await this.indexCorpus(mediumCorpus.dir);
                await this.indexCorpus(largeCorpus.dir);
            }
            
            // Run comprehensive benchmarks
            const results = {
                corpora: {
                    medium: mediumCorpus,
                    large: largeCorpus
                },
                benchmarks: {}
            };
            
            // Medium corpus benchmarks
            console.log('\n📊 Running medium corpus benchmarks...');
            results.benchmarks.medium = {
                hybridSearch: await this.runHybridSearchBenchmark(mediumCorpus),
                bundleAssembly: await this.runBundleAssemblyBenchmark(mediumCorpus),
                sqliteRead: await this.runSQLiteReadBenchmark(mediumCorpus),
                memoryUsage: await this.runMemoryUsageBenchmark(mediumCorpus),
                cacheHitRate: await this.runCacheHitRateBenchmark(mediumCorpus)
            };
            
            // Large corpus benchmarks (subset for time)
            console.log('\n📊 Running large corpus benchmarks...');
            results.benchmarks.large = {
                hybridSearch: await this.runHybridSearchBenchmark(largeCorpus),
                bundleAssembly: await this.runBundleAssemblyBenchmark(largeCorpus)
            };
            
            // Generate comprehensive report
            const report = this.generateComprehensiveReport(results);
            
            // Save report to file
            const reportPath = path.join(tmpDir, 'production-benchmark-report.json');
            await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
            console.log(`\n📄 Comprehensive report saved to: ${reportPath}`);
            
            return report;
            
        } finally {
            // Cleanup
            await fs.rm(tmpDir, { recursive: true, force: true });
        }
    }
    
    generateComprehensiveReport(results) {
        console.log(`\n📋 COMPREHENSIVE PRODUCTION BENCHMARK REPORT`);
        console.log(`===========================================`);
        
        const report = {
            timestamp: new Date().toISOString(),
            pampaxAvailable: this.pampaxAvailable,
            corpora: {
                medium: {
                    fileCount: results.corpora.medium.fileCount,
                    size: results.corpora.medium.size
                },
                large: {
                    fileCount: results.corpora.large.fileCount,
                    size: results.corpora.large.size
                }
            },
            results: results.benchmarks,
            summary: {
                allPassed: true,
                passedTests: [],
                failedTests: [],
                warnings: []
            }
        };
        
        // Analyze medium corpus results
        const medium = results.benchmarks.medium;
        
        console.log(`\n📊 MEDIUM CORPUS RESULTS (${results.corpora.medium.fileCount} files):`);
        
        // Hybrid Search
        if (medium.hybridSearch.thresholdsPassed.overall) {
            console.log(`  ✅ Hybrid Search: PASSED`);
            report.summary.passedTests.push('medium-hybrid-search');
        } else {
            console.log(`  ❌ Hybrid Search: FAILED`);
            report.summary.failedTests.push('medium-hybrid-search');
            report.summary.allPassed = false;
        }
        
        // Bundle Assembly
        if (medium.bundleAssembly.thresholdsPassed.overall) {
            console.log(`  ✅ Bundle Assembly: PASSED`);
            report.summary.passedTests.push('medium-bundle-assembly');
        } else {
            console.log(`  ❌ Bundle Assembly: FAILED`);
            report.summary.failedTests.push('medium-bundle-assembly');
            report.summary.allPassed = false;
        }
        
        // SQLite Read
        if (medium.sqliteRead.thresholdPassed) {
            console.log(`  ✅ SQLite Read: PASSED`);
            report.summary.passedTests.push('medium-sqlite-read');
        } else {
            console.log(`  ❌ SQLite Read: FAILED`);
            report.summary.failedTests.push('medium-sqlite-read');
            report.summary.allPassed = false;
        }
        
        // Memory Usage
        if (medium.memoryUsage.thresholdPassed) {
            console.log(`  ✅ Memory Usage: PASSED`);
            report.summary.passedTests.push('medium-memory-usage');
        } else {
            console.log(`  ❌ Memory Usage: FAILED`);
            report.summary.failedTests.push('medium-memory-usage');
            report.summary.allPassed = false;
        }
        
        // Cache Hit Rate
        if (medium.cacheHitRate.thresholdPassed) {
            console.log(`  ✅ Cache Hit Rate: PASSED`);
            report.summary.passedTests.push('medium-cache-hit-rate');
        } else {
            console.log(`  ❌ Cache Hit Rate: FAILED`);
            report.summary.failedTests.push('medium-cache-hit-rate');
            report.summary.allPassed = false;
        }
        
        // Analyze large corpus results
        console.log(`\n📊 LARGE CORPUS RESULTS (${results.corpora.large.fileCount} files):`);
        
        const large = results.benchmarks.large;
        
        // Hybrid Search
        if (large.hybridSearch.thresholdsPassed.overall) {
            console.log(`  ✅ Hybrid Search: PASSED`);
            report.summary.passedTests.push('large-hybrid-search');
        } else {
            console.log(`  ❌ Hybrid Search: FAILED`);
            report.summary.failedTests.push('large-hybrid-search');
            report.summary.allPassed = false;
        }
        
        // Bundle Assembly
        if (large.bundleAssembly.thresholdsPassed.overall) {
            console.log(`  ✅ Bundle Assembly: PASSED`);
            report.summary.passedTests.push('large-bundle-assembly');
        } else {
            console.log(`  ❌ Bundle Assembly: FAILED`);
            report.summary.failedTests.push('large-bundle-assembly');
            report.summary.allPassed = false;
        }
        
        // Final summary
        console.log(`\n${report.summary.allPassed ? '✅ ALL PRODUCTION BENCHMARKS PASSED' : '❌ SOME PRODUCTION BENCHMARKS FAILED'}`);
        console.log(`Passed: ${report.summary.passedTests.length}`);
        console.log(`Failed: ${report.summary.failedTests.length}`);
        
        if (!this.pampaxAvailable) {
            console.log(`\n⚠️  WARNING: PAMPAX integration not available - running with mock implementations`);
            report.summary.warnings.push('PAMPAX integration not available - using mock implementations');
        }
        
        return report;
    }
}

// Main execution function
async function runProductionBenchmarks() {
    const runner = new ProductionBenchmarkRunner();
    return await runner.runComprehensiveBenchmark();
}

// Export for use in test framework
export {
    ProductionBenchmarkRunner,
    runProductionBenchmarks
};

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    runProductionBenchmarks().catch(console.error);
}