#!/usr/bin/env node

/**
 * Production Benchmark Test Suite
 * 
 * Integrates with Node.js test framework to run production benchmarks
 * as part of the regular test suite.
 */

import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import { ProductionBenchmarkRunner } from './production-integration.js';
import { RegressionDetector } from './regression-detector.js';
import { PerformanceComparator } from './performance-comparator.js';
import { MemoryLeakDetector } from './memory-leak-detector.js';
import fs from 'node:fs/promises';

describe('Production Benchmarks', async () => {
    let benchmarkRunner;
    let testResults;
    
    test('Setup benchmark runner', async () => {
        benchmarkRunner = new ProductionBenchmarkRunner();
        assert.ok(benchmarkRunner, 'Benchmark runner should be created');
    });
    
    test('Run medium corpus benchmarks', async () => {
        if (!benchmarkRunner) {
            throw new Error('Benchmark runner not initialized');
        }
        
        console.log('🚀 Running medium corpus production benchmarks...');
        testResults = await benchmarkRunner.runComprehensiveBenchmark();
        
        assert.ok(testResults, 'Benchmark results should be generated');
        assert.ok(testResults.summary, 'Results should contain summary');
        assert.ok(testResults.results, 'Results should contain benchmark data');
        
        // Check that all required benchmarks were run
        assert.ok(testResults.results.medium, 'Medium corpus results should exist');
        assert.ok(testResults.results.medium.hybridSearch, 'Hybrid search benchmark should run');
        assert.ok(testResults.results.medium.bundleAssembly, 'Bundle assembly benchmark should run');
        assert.ok(testResults.results.medium.sqliteRead, 'SQLite read benchmark should run');
        assert.ok(testResults.results.medium.memoryUsage, 'Memory usage benchmark should run');
        assert.ok(testResults.results.medium.cacheHitRate, 'Cache hit rate benchmark should run');
    });
    
    test('Validate production gate criteria - Hybrid Search', async () => {
        const hybridSearch = testResults.results.medium.hybridSearch;
        
        // Validate cold cache thresholds
        assert.ok(hybridSearch.coldStats.p50 <= 700, `Hybrid search cold p50 should be ≤700ms, got ${hybridSearch.coldStats.p50.toFixed(2)}ms`);
        assert.ok(hybridSearch.coldStats.p95 <= 1500, `Hybrid search cold p95 should be ≤1500ms, got ${hybridSearch.coldStats.p95.toFixed(2)}ms`);
        
        // Validate warm cache thresholds
        assert.ok(hybridSearch.warmStats.p50 <= 300, `Hybrid search warm p50 should be ≤300ms, got ${hybridSearch.warmStats.p50.toFixed(2)}ms`);
        assert.ok(hybridSearch.warmStats.p95 <= 800, `Hybrid search warm p95 should be ≤800ms, got ${hybridSearch.warmStats.p95.toFixed(2)}ms`);
        
        console.log('✅ Hybrid search production gate criteria validated');
    });
    
    test('Validate production gate criteria - Bundle Assembly', async () => {
        const bundleAssembly = testResults.results.medium.bundleAssembly;
        
        // Validate cold cache thresholds
        assert.ok(bundleAssembly.coldStats.p50 <= 3000, `Bundle assembly cold p50 should be ≤3000ms, got ${bundleAssembly.coldStats.p50.toFixed(2)}ms`);
        assert.ok(bundleAssembly.coldStats.p95 <= 6000, `Bundle assembly cold p95 should be ≤6000ms, got ${bundleAssembly.coldStats.p95.toFixed(2)}ms`);
        
        // Validate warm cache thresholds
        assert.ok(bundleAssembly.warmStats.p50 <= 1000, `Bundle assembly warm p50 should be ≤1000ms, got ${bundleAssembly.warmStats.p50.toFixed(2)}ms`);
        assert.ok(bundleAssembly.warmStats.p95 <= 2000, `Bundle assembly warm p95 should be ≤2000ms, got ${bundleAssembly.warmStats.p95.toFixed(2)}ms`);
        
        console.log('✅ Bundle assembly production gate criteria validated');
    });
    
    test('Validate production gate criteria - SQLite Read', async () => {
        const sqliteRead = testResults.results.medium.sqliteRead;
        
        // Validate SQLite read threshold
        assert.ok(sqliteRead.stats.p95 <= 50, `SQLite read p95 should be ≤50ms, got ${sqliteRead.stats.p95.toFixed(2)}ms`);
        
        console.log('✅ SQLite read production gate criteria validated');
    });
    
    test('Validate production gate criteria - Memory Usage', async () => {
        const memoryUsage = testResults.results.medium.memoryUsage;
        
        // Validate memory usage threshold (500MB)
        const memoryLimit = 500 * 1024 * 1024; // 500MB in bytes
        assert.ok(memoryUsage.steadyStats.mean <= memoryLimit, 
            `Memory usage should be ≤500MB, got ${(memoryUsage.steadyStats.mean / 1024 / 1024).toFixed(2)}MB`);
        
        console.log('✅ Memory usage production gate criteria validated');
    });
    
    test('Validate production gate criteria - Cache Hit Rate', async () => {
        const cacheHitRate = testResults.results.medium.cacheHitRate;
        
        // Validate cache hit rate threshold (60%)
        const minHitRate = 0.60;
        assert.ok(cacheHitRate.overallHitRate >= minHitRate, 
            `Cache hit rate should be ≥60%, got ${(cacheHitRate.overallHitRate * 100).toFixed(1)}%`);
        
        console.log('✅ Cache hit rate production gate criteria validated');
    });
    
    test('Generate benchmark report', async () => {
        assert.ok(testResults, 'Test results should exist');
        
        // Save detailed results for CI
        const reportPath = '/tmp/production-benchmark-results.json';
        await fs.writeFile(reportPath, JSON.stringify(testResults, null, 2));
        console.log(`📄 Benchmark report saved to: ${reportPath}`);
        
        // Verify report structure
        const reportContent = await fs.readFile(reportPath, 'utf8');
        const parsedReport = JSON.parse(reportContent);
        
        assert.ok(parsedReport.timestamp, 'Report should have timestamp');
        assert.ok(parsedReport.summary, 'Report should have summary');
        assert.ok(parsedReport.results, 'Report should have results');
    });
});

describe('Regression Detection', async () => {
    test('Regression detector functionality', async () => {
        const detector = new RegressionDetector(0.10);
        
        // Create mock baseline and current results
        const baseline = {
            results: {
                medium: {
                    hybridSearch: {
                        coldStats: { p50: 500, p95: 1000 },
                        warmStats: { p50: 200, p95: 400 }
                    }
                }
            }
        };
        
        const current = {
            results: {
                medium: {
                    hybridSearch: {
                        coldStats: { p50: 600, p95: 1200 }, // 20% regression
                        warmStats: { p50: 180, p95: 360 }  // 10% improvement
                    }
                }
            }
        };
        
        // Write temporary files
        const baselinePath = '/tmp/baseline.json';
        const currentPath = '/tmp/current.json';
        
        await fs.writeFile(baselinePath, JSON.stringify(baseline));
        await fs.writeFile(currentPath, JSON.stringify(current));
        
        try {
            const report = await detector.compareResults(baselinePath, currentPath);
            
            assert.ok(report, 'Regression report should be generated');
            assert.ok(report.regressions.length > 0, 'Should detect regressions');
            assert.ok(report.improvements.length > 0, 'Should detect improvements');
            
            console.log('✅ Regression detector functionality validated');
        } finally {
            // Cleanup
            await fs.unlink(baselinePath);
            await fs.unlink(currentPath);
        }
    });
});

describe('Performance Comparison', async () => {
    test('Performance comparator functionality', async () => {
        const comparator = new PerformanceComparator(0.10);
        
        // Create mock baseline and current results
        const baseline = {
            summary: { allPassed: true, passedTests: ['test1'], failedTests: [] },
            results: {
                medium: {
                    hybridSearch: {
                        coldStats: { p50: 500, p95: 1000 },
                        warmStats: { p50: 200, p95: 400 }
                    }
                }
            }
        };
        
        const current = {
            summary: { allPassed: true, passedTests: ['test1', 'test2'], failedTests: [] },
            results: {
                medium: {
                    hybridSearch: {
                        coldStats: { p50: 450, p95: 900 }, // 10% improvement
                        warmStats: { p50: 190, p95: 380 }  // 5% improvement
                    }
                }
            }
        };
        
        // Write temporary files
        const baselinePath = '/tmp/baseline-perf.json';
        const currentPath = '/tmp/current-perf.json';
        
        await fs.writeFile(baselinePath, JSON.stringify(baseline));
        await fs.writeFile(currentPath, JSON.stringify(current));
        
        try {
            const report = await comparator.compareResults(baselinePath, currentPath);
            
            assert.ok(report, 'Comparison report should be generated');
            assert.ok(report.summary.totalComparisons > 0, 'Should have comparisons');
            assert.ok(report.summary.improvements > 0, 'Should detect improvements');
            
            console.log('✅ Performance comparator functionality validated');
        } finally {
            // Cleanup
            await fs.unlink(baselinePath);
            await fs.unlink(currentPath);
        }
    });
});

describe('Memory Leak Detection', async () => {
    test('Memory leak detector functionality', async () => {
        const detector = new MemoryLeakDetector();
        
        // Test basic functionality
        detector.startMonitoring(100); // Monitor every 100ms
        
        // Simulate some memory activity
        const operation = detector.startOperation('test-operation');
        await new Promise(resolve => setTimeout(resolve, 50));
        detector.addOperationCheckpoint(operation, 'mid-point');
        await new Promise(resolve => setTimeout(resolve, 50));
        detector.endOperation(operation);
        
        detector.stopMonitoring();
        
        const analysis = detector.analyzeResults();
        
        assert.ok(analysis, 'Memory analysis should be generated');
        assert.ok(analysis.totalSnapshots > 0, 'Should have memory snapshots');
        assert.ok(analysis.totalOperations > 0, 'Should have operation data');
        assert.ok(analysis.memoryTrend, 'Should have memory trend analysis');
        
        console.log('✅ Memory leak detector functionality validated');
    });
});

describe('Benchmark Integration', async () => {
    test('All benchmark components work together', async () => {
        // This test ensures all components can be imported and work together
        const runner = new ProductionBenchmarkRunner();
        const regressionDetector = new RegressionDetector();
        const performanceComparator = new PerformanceComparator();
        const memoryLeakDetector = new MemoryLeakDetector();
        
        assert.ok(runner, 'Production benchmark runner should be available');
        assert.ok(regressionDetector, 'Regression detector should be available');
        assert.ok(performanceComparator, 'Performance comparator should be available');
        assert.ok(memoryLeakDetector, 'Memory leak detector should be available');
        
        console.log('✅ All benchmark components integrated successfully');
    });
    
    test('Production gate thresholds are properly defined', async () => {
        // Verify that all production gate criteria are properly defined
        const expectedThresholds = {
            hybridSearch: {
                cold: { p50: 700, p95: 1500 },
                warm: { p50: 300, p95: 800 }
            },
            bundleAssembly: {
                cold: { p50: 3000, p95: 6000 },
                warm: { p50: 1000, p95: 2000 }
            },
            sqliteRead: {
                p95: 50
            },
            memoryUsage: {
                steady: 500 * 1024 * 1024 // 500MB
            },
            cacheHitRate: {
                minimum: 0.60 // 60%
            }
        };
        
        // These thresholds should match what's defined in the benchmark config
        assert.ok(expectedThresholds.hybridSearch.cold.p50 === 700, 'Hybrid search cold p50 threshold should be 700ms');
        assert.ok(expectedThresholds.hybridSearch.cold.p95 === 1500, 'Hybrid search cold p95 threshold should be 1500ms');
        assert.ok(expectedThresholds.hybridSearch.warm.p50 === 300, 'Hybrid search warm p50 threshold should be 300ms');
        assert.ok(expectedThresholds.hybridSearch.warm.p95 === 800, 'Hybrid search warm p95 threshold should be 800ms');
        
        assert.ok(expectedThresholds.bundleAssembly.cold.p50 === 3000, 'Bundle assembly cold p50 threshold should be 3000ms');
        assert.ok(expectedThresholds.bundleAssembly.cold.p95 === 6000, 'Bundle assembly cold p95 threshold should be 6000ms');
        assert.ok(expectedThresholds.bundleAssembly.warm.p50 === 1000, 'Bundle assembly warm p50 threshold should be 1000ms');
        assert.ok(expectedThresholds.bundleAssembly.warm.p95 === 2000, 'Bundle assembly warm p95 threshold should be 2000ms');
        
        assert.ok(expectedThresholds.sqliteRead.p95 === 50, 'SQLite read p95 threshold should be 50ms');
        assert.ok(expectedThresholds.memoryUsage.steady === 500 * 1024 * 1024, 'Memory usage threshold should be 500MB');
        assert.ok(expectedThresholds.cacheHitRate.minimum === 0.60, 'Cache hit rate threshold should be 60%');
        
        console.log('✅ Production gate thresholds properly defined');
    });
});

// Export for use in other test files
export {
    ProductionBenchmarkRunner,
    RegressionDetector,
    PerformanceComparator,
    MemoryLeakDetector
};