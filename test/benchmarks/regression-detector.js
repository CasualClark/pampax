#!/usr/bin/env node

/**
 * Performance Regression Detector
 * 
 * Compares benchmark results between runs to detect performance regressions
 * with configurable thresholds (default: 10% regression threshold)
 */

import fs from 'node:fs/promises';

class RegressionDetector {
    constructor(threshold = 0.10) {
        this.threshold = threshold;
        this.regressions = [];
        this.improvements = [];
        this.unchanged = [];
    }
    
    async compareResults(baselinePath, currentPath) {
        console.log('🔍 Loading baseline results...');
        const baselineData = JSON.parse(await fs.readFile(baselinePath, 'utf8'));
        
        console.log('📊 Loading current results...');
        const currentData = JSON.parse(await fs.readFile(currentPath, 'utf8'));
        
        console.log('⚖️  Comparing results...');
        this.compareBenchmarkResults(baselineData, currentData);
        
        return this.generateReport();
    }
    
    compareBenchmarkResults(baseline, current) {
        // Compare medium corpus results
        if (baseline.results?.medium && current.results?.medium) {
            this.compareCorpusResults('medium', baseline.results.medium, current.results.medium);
        }
        
        // Compare large corpus results
        if (baseline.results?.large && current.results?.large) {
            this.compareCorpusResults('large', baseline.results.large, current.results.large);
        }
        
        // Compare summary
        if (baseline.summary && current.summary) {
            this.compareSummary(baseline.summary, current.summary);
        }
    }
    
    compareCorpusResults(corpusSize, baselineResults, currentResults) {
        console.log(`\n📈 Comparing ${corpusSize} corpus results...`);
        
        // Hybrid Search comparison
        if (baselineResults.hybridSearch && currentResults.hybridSearch) {
            this.compareMetric(
                `${corpusSize}-hybrid-search-cold-p50`,
                baselineResults.hybridSearch.coldStats.p50,
                currentResults.hybridSearch.coldStats.p50,
                'ms'
            );
            
            this.compareMetric(
                `${corpusSize}-hybrid-search-cold-p95`,
                baselineResults.hybridSearch.coldStats.p95,
                currentResults.hybridSearch.coldStats.p95,
                'ms'
            );
            
            this.compareMetric(
                `${corpusSize}-hybrid-search-warm-p50`,
                baselineResults.hybridSearch.warmStats.p50,
                currentResults.hybridSearch.warmStats.p50,
                'ms'
            );
            
            this.compareMetric(
                `${corpusSize}-hybrid-search-warm-p95`,
                baselineResults.hybridSearch.warmStats.p95,
                currentResults.hybridSearch.warmStats.p95,
                'ms'
            );
        }
        
        // Bundle Assembly comparison
        if (baselineResults.bundleAssembly && currentResults.bundleAssembly) {
            this.compareMetric(
                `${corpusSize}-bundle-assembly-cold-p50`,
                baselineResults.bundleAssembly.coldStats.p50,
                currentResults.bundleAssembly.coldStats.p50,
                'ms'
            );
            
            this.compareMetric(
                `${corpusSize}-bundle-assembly-cold-p95`,
                baselineResults.bundleAssembly.coldStats.p95,
                currentResults.bundleAssembly.coldStats.p95,
                'ms'
            );
            
            this.compareMetric(
                `${corpusSize}-bundle-assembly-warm-p50`,
                baselineResults.bundleAssembly.warmStats.p50,
                currentResults.bundleAssembly.warmStats.p50,
                'ms'
            );
            
            this.compareMetric(
                `${corpusSize}-bundle-assembly-warm-p95`,
                baselineResults.bundleAssembly.warmStats.p95,
                currentResults.bundleAssembly.warmStats.p95,
                'ms'
            );
        }
        
        // SQLite Read comparison
        if (baselineResults.sqliteRead && currentResults.sqliteRead) {
            this.compareMetric(
                `${corpusSize}-sqlite-read-p95`,
                baselineResults.sqliteRead.stats.p95,
                currentResults.sqliteRead.stats.p95,
                'ms'
            );
        }
        
        // Memory Usage comparison
        if (baselineResults.memoryUsage && currentResults.memoryUsage) {
            this.compareMetric(
                `${corpusSize}-memory-usage-steady`,
                baselineResults.memoryUsage.steadyStats.mean,
                currentResults.memoryUsage.steadyStats.mean,
                'bytes'
            );
            
            this.compareMetric(
                `${corpusSize}-memory-usage-peak`,
                baselineResults.memoryUsage.peakStats.mean,
                currentResults.memoryUsage.peakStats.mean,
                'bytes'
            );
        }
        
        // Cache Hit Rate comparison
        if (baselineResults.cacheHitRate && currentResults.cacheHitRate) {
            this.compareMetric(
                `${corpusSize}-cache-hit-rate`,
                baselineResults.cacheHitRate.overallHitRate,
                currentResults.cacheHitRate.overallHitRate,
                'rate'
            );
        }
    }
    
    compareMetric(metricName, baselineValue, currentValue, unit) {
        if (baselineValue === null || baselineValue === undefined ||
            currentValue === null || currentValue === undefined) {
            return;
        }
        
        const change = (currentValue - baselineValue) / baselineValue;
        const changePercent = change * 100;
        
        const comparison = {
            metric: metricName,
            baselineValue,
            currentValue,
            change,
            changePercent,
            unit,
            significant: Math.abs(change) >= this.threshold
        };
        
        if (change > this.threshold) {
            this.regressions.push(comparison);
            console.log(`  📉 ${metricName}: ${changePercent.toFixed(1)}% regression (${baselineValue.toFixed(2)} → ${currentValue.toFixed(2)} ${unit})`);
        } else if (change < -this.threshold) {
            this.improvements.push(comparison);
            console.log(`  📈 ${metricName}: ${Math.abs(changePercent).toFixed(1)}% improvement (${baselineValue.toFixed(2)} → ${currentValue.toFixed(2)} ${unit})`);
        } else {
            this.unchanged.push(comparison);
            console.log(`  ➡️  ${metricName}: ${changePercent.toFixed(1)}% change (${baselineValue.toFixed(2)} → ${currentValue.toFixed(2)} ${unit})`);
        }
    }
    
    compareSummary(baselineSummary, currentSummary) {
        // Compare test counts
        const baselinePassed = baselineSummary.passedTests?.length || 0;
        const baselineFailed = baselineSummary.failedTests?.length || 0;
        const currentPassed = currentSummary.passedTests?.length || 0;
        const currentFailed = currentSummary.failedTests?.length || 0;
        
        console.log(`\n📋 Summary Comparison:`);
        console.log(`  Passed tests: ${baselinePassed} → ${currentPassed}`);
        console.log(`  Failed tests: ${baselineFailed} → ${currentFailed}`);
        
        if (baselineSummary.allPassed && !currentSummary.allPassed) {
            console.log(`  ⚠️  Status regression: PASSED → FAILED`);
            this.regressions.push({
                metric: 'overall-status',
                baselineValue: 1,
                currentValue: 0,
                change: -1,
                changePercent: -100,
                unit: 'status',
                significant: true
            });
        } else if (!baselineSummary.allPassed && currentSummary.allPassed) {
            console.log(`  ✅ Status improvement: FAILED → PASSED`);
            this.improvements.push({
                metric: 'overall-status',
                baselineValue: 0,
                currentValue: 1,
                change: 1,
                changePercent: 100,
                unit: 'status',
                significant: true
            });
        }
    }
    
    generateReport() {
        const report = {
            timestamp: new Date().toISOString(),
            threshold: this.threshold,
            summary: {
                totalMetrics: this.regressions.length + this.improvements.length + this.unchanged.length,
                regressions: this.regressions.length,
                improvements: this.improvements.length,
                unchanged: this.unchanged.length,
                significantRegressions: this.regressions.filter(r => r.significant).length
            },
            regressions: this.regressions,
            improvements: this.improvements,
            unchanged: this.unchanged,
            hasSignificantRegressions: this.regressions.some(r => r.significant)
        };
        
        console.log(`\n📊 Regression Analysis Summary:`);
        console.log(`  Total metrics compared: ${report.summary.totalMetrics}`);
        console.log(`  Regressions: ${report.summary.regressions}`);
        console.log(`  Improvements: ${report.summary.improvements}`);
        console.log(`  Unchanged: ${report.summary.unchanged}`);
        console.log(`  Significant regressions: ${report.summary.significantRegressions}`);
        
        if (report.hasSignificantRegressions) {
            console.log(`\n❌ Significant performance regressions detected!`);
        } else {
            console.log(`\n✅ No significant performance regressions detected`);
        }
        
        return report;
    }
}

// CLI interface
async function main() {
    const args = process.argv.slice(2);
    let baselinePath, currentPath, outputPath, threshold = 0.10;
    
    // Parse command line arguments
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        switch (arg) {
            case '--baseline':
                baselinePath = args[++i];
                break;
            case '--current':
                currentPath = args[++i];
                break;
            case '--output':
                outputPath = args[++i];
                break;
            case '--threshold':
                threshold = parseFloat(args[++i]);
                break;
            case '--help':
                console.log(`
Performance Regression Detector

Usage: node regression-detector.js [options]

Options:
  --baseline <path>     Path to baseline benchmark results (required)
  --current <path>      Path to current benchmark results (required)
  --output <path>       Path to save regression report (optional)
  --threshold <number>  Regression threshold (default: 0.10 = 10%)
  --help                Show this help message

Examples:
  node regression-detector.js --baseline baseline.json --current current.json
  node regression-detector.js --baseline baseline.json --current current.json --threshold 0.05 --output report.json
                `);
                process.exit(0);
        }
    }
    
    if (!baselinePath || !currentPath) {
        console.error('❌ Error: Both --baseline and --current arguments are required');
        console.error('Use --help for usage information');
        process.exit(1);
    }
    
    try {
        const detector = new RegressionDetector(threshold);
        const report = await detector.compareResults(baselinePath, currentPath);
        
        if (outputPath) {
            await fs.writeFile(outputPath, JSON.stringify(report, null, 2));
            console.log(`\n📄 Regression report saved to: ${outputPath}`);
        }
        
        // Exit with error code if significant regressions detected
        if (report.hasSignificantRegressions) {
            process.exit(1);
        }
        
    } catch (error) {
        console.error('❌ Error during regression detection:', error.message);
        process.exit(1);
    }
}

// Export for use in other modules
export { RegressionDetector };

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch(console.error);
}