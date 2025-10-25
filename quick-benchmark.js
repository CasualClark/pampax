#!/usr/bin/env node

/**
 * Quick benchmark runner for testing the production benchmark suite
 */

import { ProductionBenchmarkRunner } from './test/benchmarks/production-integration.js';

async function runQuickBenchmark() {
    console.log('🚀 Running Quick Production Benchmark Test');
    console.log('=========================================');
    
    try {
        const runner = new ProductionBenchmarkRunner();
        console.log(`PAMPAX Integration: ${runner.pampaxAvailable ? '✅ Available' : '❌ Not Available (using mocks)'}`);
        
        // Run a quick test with small corpus
        console.log('\n📊 Running quick benchmark test...');
        const report = await runner.runComprehensiveBenchmark();
        
        console.log('\n📋 Quick Test Results:');
        console.log(`- Overall Status: ${report.summary.allPassed ? '✅ PASSED' : '❌ FAILED'}`);
        console.log(`- Passed Tests: ${report.summary.passedTests.length}`);
        console.log(`- Failed Tests: ${report.summary.failedTests.length}`);
        console.log(`- Warnings: ${report.summary.warnings.length}`);
        
        if (report.summary.failedTests.length > 0) {
            console.log('\n❌ Failed Tests:');
            report.summary.failedTests.forEach(test => {
                console.log(`  - ${test}`);
            });
        }
        
        if (report.summary.warnings.length > 0) {
            console.log('\n⚠️  Warnings:');
            report.summary.warnings.forEach(warning => {
                console.log(`  - ${warning}`);
            });
        }
        
        console.log('\n✅ Quick benchmark test completed successfully');
        return report;
        
    } catch (error) {
        console.error('❌ Quick benchmark test failed:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    runQuickBenchmark().catch(console.error);
}

export { runQuickBenchmark };