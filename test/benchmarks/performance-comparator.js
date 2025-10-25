#!/usr/bin/env node

/**
 * Performance Comparison Tool
 * 
 * Compares benchmark results between different versions or configurations
 * and provides detailed analysis of performance changes.
 */

import fs from 'node:fs/promises';

class PerformanceComparator {
    constructor(threshold = 0.10) {
        this.threshold = threshold;
        this.comparisons = [];
        this.significantChanges = [];
    }
    
    async compareResults(baselinePath, currentPath) {
        console.log('📊 Loading baseline results...');
        const baselineData = JSON.parse(await fs.readFile(baselinePath, 'utf8'));
        
        console.log('📈 Loading current results...');
        const currentData = JSON.parse(await fs.readFile(currentPath, 'utf8'));
        
        console.log('⚖️  Comparing performance results...');
        this.performComparison(baselineData, currentData);
        
        return this.generateReport();
    }
    
    performComparison(baseline, current) {
        // Compare overall summary
        this.compareSummary(baseline.summary, current.summary);
        
        // Compare medium corpus results
        if (baseline.results?.medium && current.results?.medium) {
            this.compareCorpusPerformance('medium', baseline.results.medium, current.results.medium);
        }
        
        // Compare large corpus results
        if (baseline.results?.large && current.results?.large) {
            this.compareCorpusPerformance('large', baseline.results.large, current.results.large);
        }
        
        // Identify significant changes
        this.identifySignificantChanges();
    }
    
    compareSummary(baselineSummary, currentSummary) {
        const comparison = {
            category: 'summary',
            baselinePassed: baselineSummary.allPassed,
            currentPassed: currentSummary.allPassed,
            baselinePassedCount: baselineSummary.passedTests?.length || 0,
            currentPassedCount: currentSummary.passedTests?.length || 0,
            baselineFailedCount: baselineSummary.failedTests?.length || 0,
            currentFailedCount: currentSummary.failedTests?.length || 0
        };
        
        comparison.statusChange = this.getStatusChange(baselineSummary.allPassed, currentSummary.allPassed);
        comparison.passedTestsChange = currentPassedCount - baselinePassedCount;
        comparison.failedTestsChange = currentFailedCount - baselineFailedCount;
        
        this.comparisons.push(comparison);
    }
    
    compareCorpusPerformance(corpusSize, baselineResults, currentResults) {
        console.log(`\n🔍 Comparing ${corpusSize} corpus performance...`);
        
        // Hybrid Search Performance
        if (baselineResults.hybridSearch && currentResults.hybridSearch) {
            this.compareMetric(
                `${corpusSize}-hybrid-search`,
                'Hybrid Search',
                baselineResults.hybridSearch,
                currentResults.hybridSearch,
                ['coldStats.p50', 'coldStats.p95', 'warmStats.p50', 'warmStats.p95'],
                'ms'
            );
        }
        
        // Bundle Assembly Performance
        if (baselineResults.bundleAssembly && currentResults.bundleAssembly) {
            this.compareMetric(
                `${corpusSize}-bundle-assembly`,
                'Bundle Assembly',
                baselineResults.bundleAssembly,
                currentResults.bundleAssembly,
                ['coldStats.p50', 'coldStats.p95', 'warmStats.p50', 'warmStats.p95'],
                'ms'
            );
        }
        
        // SQLite Read Performance
        if (baselineResults.sqliteRead && currentResults.sqliteRead) {
            this.compareMetric(
                `${corpusSize}-sqlite-read`,
                'SQLite Read',
                baselineResults.sqliteRead,
                currentResults.sqliteRead,
                ['stats.p95'],
                'ms'
            );
        }
        
        // Memory Usage
        if (baselineResults.memoryUsage && currentResults.memoryUsage) {
            this.compareMetric(
                `${corpusSize}-memory-usage`,
                'Memory Usage',
                baselineResults.memoryUsage,
                currentResults.memoryUsage,
                ['steadyStats.mean', 'peakStats.mean'],
                'bytes'
            );
        }
        
        // Cache Hit Rate
        if (baselineResults.cacheHitRate && currentResults.cacheHitRate) {
            this.compareMetric(
                `${corpusSize}-cache-hit-rate`,
                'Cache Hit Rate',
                baselineResults.cacheHitRate,
                currentResults.cacheHitRate,
                ['overallHitRate'],
                'rate'
            );
        }
    }
    
    compareMetric(prefix, name, baselineData, currentData, paths, unit) {
        paths.forEach(path => {
            const baselineValue = this.getNestedValue(baselineData, path);
            const currentValue = this.getNestedValue(currentData, path);
            
            if (baselineValue !== null && currentValue !== null) {
                const change = (currentValue - baselineValue) / baselineValue;
                const changePercent = change * 100;
                
                const comparison = {
                    metric: `${prefix}-${path.replace('.', '-')}`,
                    name: `${name} - ${path.split('.').pop().toUpperCase()}`,
                    corpus: prefix.split('-')[0],
                    path,
                    baselineValue,
                    currentValue,
                    change,
                    changePercent,
                    unit,
                    significant: Math.abs(change) >= this.threshold
                };
                
                this.comparisons.push(comparison);
                
                const direction = change > 0 ? '📉' : change < 0 ? '📈' : '➡️';
                const significance = comparison.significant ? ' (SIGNIFICANT)' : '';
                console.log(`  ${direction} ${comparison.name}: ${changePercent.toFixed(1)}% (${baselineValue.toFixed(2)} → ${currentValue.toFixed(2)} ${unit})${significance}`);
            }
        });
    }
    
    getNestedValue(obj, path) {
        return path.split('.').reduce((current, key) => current?.[key], obj);
    }
    
    getStatusChange(baselinePassed, currentPassed) {
        if (baselinePassed === currentPassed) {
            return 'unchanged';
        } else if (baselinePassed && !currentPassed) {
            return 'regression';
        } else if (!baselinePassed && currentPassed) {
            return 'improvement';
        }
        return 'unknown';
    }
    
    identifySignificantChanges() {
        this.significantChanges = this.comparisons.filter(comp => comp.significant);
        
        // Sort by magnitude of change
        this.significantChanges.sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent));
    }
    
    generateReport() {
        const report = {
            timestamp: new Date().toISOString(),
            threshold: this.threshold,
            summary: {
                totalComparisons: this.comparisons.length,
                significantChanges: this.significantChanges.length,
                improvements: this.significantChanges.filter(c => c.change < 0).length,
                regressions: this.significantChanges.filter(c => c.change > 0).length
            },
            comparisons: this.comparisons,
            significantChanges: this.significantChanges,
            recommendations: this.generateRecommendations()
        };
        
        console.log(`\n📊 PERFORMANCE COMPARISON REPORT`);
        console.log(`===============================`);
        
        console.log(`\n📈 Summary:`);
        console.log(`  Total metrics compared: ${report.summary.totalComparisons}`);
        console.log(`  Significant changes: ${report.summary.significantChanges}`);
        console.log(`  Improvements: ${report.summary.improvements}`);
        console.log(`  Regressions: ${report.summary.regressions}`);
        
        // Show top changes
        if (this.significantChanges.length > 0) {
            console.log(`\n🔍 Top Significant Changes:`);
            this.significantChanges.slice(0, 10).forEach((change, i) => {
                const direction = change.change > 0 ? '📉' : '📈';
                console.log(`  ${i + 1}. ${direction} ${change.name}: ${change.changePercent.toFixed(1)}% (${change.baselineValue.toFixed(2)} → ${change.currentValue.toFixed(2)} ${change.unit})`);
            });
        }
        
        // Show recommendations
        if (report.recommendations.length > 0) {
            console.log(`\n💡 Recommendations:`);
            report.recommendations.forEach((rec, i) => {
                console.log(`  ${i + 1}. [${rec.priority.toUpperCase()}] ${rec.title}`);
                console.log(`     ${rec.description}`);
            });
        }
        
        const hasRegressions = report.summary.regressions > 0;
        console.log(`\n${hasRegressions ? '⚠️  PERFORMANCE REGRESSIONS DETECTED' : '✅ NO SIGNIFICANT PERFORMANCE REGRESSIONS'}`);
        
        return report;
    }
    
    generateRecommendations() {
        const recommendations = [];
        const regressions = this.significantChanges.filter(c => c.change > 0);
        const improvements = this.significantChanges.filter(c => c.change < 0);
        
        // Regression recommendations
        if (regressions.length > 0) {
            recommendations.push({
                priority: 'high',
                category: 'regression',
                title: 'Address Performance Regressions',
                description: `${regressions.length} metrics show significant performance degradation. Investigate and optimize the affected areas.`
            });
            
            // Specific regression areas
            const searchRegressions = regressions.filter(r => r.metric.includes('hybrid-search'));
            if (searchRegressions.length > 0) {
                recommendations.push({
                    priority: 'high',
                    category: 'search',
                    title: 'Optimize Search Performance',
                    description: `Search performance has degraded by an average of ${(searchRegressions.reduce((sum, r) => sum + r.changePercent, 0) / searchRegressions.length).toFixed(1)}%. Review search algorithms and indexing.`
                });
            }
            
            const memoryRegressions = regressions.filter(r => r.metric.includes('memory'));
            if (memoryRegressions.length > 0) {
                recommendations.push({
                    priority: 'medium',
                    category: 'memory',
                    title: 'Investigate Memory Usage',
                    description: `Memory usage has increased significantly. Check for memory leaks and optimize data structures.`
                });
            }
        }
        
        // Improvement acknowledgments
        if (improvements.length > 0) {
            recommendations.push({
                priority: 'low',
                category: 'improvement',
                title: 'Performance Improvements Detected',
                description: `${improvements.length} metrics show significant performance improvements. Great work! Consider documenting the successful optimizations.`
            });
        }
        
        // General recommendations
        if (this.significantChanges.length === 0) {
            recommendations.push({
                priority: 'low',
                category: 'monitoring',
                title: 'Performance Stable',
                description: 'No significant performance changes detected. Continue monitoring for future changes.'
            });
        }
        
        return recommendations;
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
Performance Comparison Tool

Usage: node performance-comparator.js [options]

Options:
  --baseline <path>     Path to baseline benchmark results (required)
  --current <path>      Path to current benchmark results (required)
  --output <path>       Path to save comparison report (optional)
  --threshold <number>  Significance threshold (default: 0.10 = 10%)
  --help                Show this help message

Examples:
  node performance-comparator.js --baseline baseline.json --current current.json
  node performance-comparator.js --baseline baseline.json --current current.json --threshold 0.05 --output comparison.json
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
        const comparator = new PerformanceComparator(threshold);
        const report = await comparator.compareResults(baselinePath, currentPath);
        
        if (outputPath) {
            await fs.writeFile(outputPath, JSON.stringify(report, null, 2));
            console.log(`\n📄 Comparison report saved to: ${outputPath}`);
        }
        
        // Exit with error code if significant regressions detected
        if (report.summary.regressions > 0) {
            process.exit(1);
        }
        
    } catch (error) {
        console.error('❌ Error during performance comparison:', error.message);
        process.exit(1);
    }
}

// Export for use in other modules
export { PerformanceComparator };

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch(console.error);
}