#!/usr/bin/env node

/**
 * Memory Leak Detection Tool
 * 
 * Monitors memory usage during extended operations to detect memory leaks
 * and provide detailed memory profiling information.
 */

import fs from 'node:fs/promises';

class MemoryLeakDetector {
    constructor() {
        this.snapshots = [];
        this.operations = [];
        this.leakThreshold = 50 * 1024 * 1024; // 50MB growth threshold
        this.monitoring = false;
        this.interval = null;
    }
    
    startMonitoring(intervalMs = 1000) {
        if (this.monitoring) {
            console.warn('⚠️  Memory monitoring already active');
            return;
        }
        
        console.log('🧠 Starting memory leak detection...');
        this.monitoring = true;
        this.snapshots = [];
        this.operations = [];
        
        // Take initial snapshot
        this.takeSnapshot('initialization');
        
        // Start periodic monitoring
        this.interval = setInterval(() => {
            this.takeSnapshot('periodic');
        }, intervalMs);
    }
    
    stopMonitoring() {
        if (!this.monitoring) {
            console.warn('⚠️  Memory monitoring not active');
            return;
        }
        
        console.log('🛑 Stopping memory leak detection...');
        this.monitoring = false;
        
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
        
        // Take final snapshot
        this.takeSnapshot('final');
    }
    
    takeSnapshot(label = '') {
        const memUsage = process.memoryUsage();
        const snapshot = {
            timestamp: Date.now(),
            label,
            rss: memUsage.rss,
            heapUsed: memUsage.heapUsed,
            heapTotal: memUsage.heapTotal,
            external: memUsage.external,
            arrayBuffers: memUsage.arrayBuffers
        };
        
        this.snapshots.push(snapshot);
        return snapshot;
    }
    
    startOperation(name) {
        const operation = {
            name,
            startTime: Date.now(),
            startMemory: process.memoryUsage(),
            checkpoints: []
        };
        
        this.operations.push(operation);
        return operation;
    }
    
    addOperationCheckpoint(operation, label = '') {
        if (!operation) return;
        
        const checkpoint = {
            timestamp: Date.now(),
            label,
            memory: process.memoryUsage()
        };
        
        operation.checkpoints.push(checkpoint);
        return checkpoint;
    }
    
    endOperation(operation) {
        if (!operation) return;
        
        operation.endTime = Date.now();
        operation.endMemory = process.memoryUsage();
        operation.duration = operation.endTime - operation.startTime;
        operation.memoryGrowth = operation.endMemory.heapUsed - operation.startMemory.heapUsed;
        
        return operation;
    }
    
    async runLeakDetection(testFunction, iterations = 10) {
        console.log(`🔍 Running memory leak detection with ${iterations} iterations...`);
        
        this.startMonitoring();
        
        try {
            for (let i = 0; i < iterations; i++) {
                const operation = this.startOperation(`iteration-${i}`);
                
                // Run the test function
                await testFunction(i, operation);
                
                this.endOperation(operation);
                
                // Force garbage collection if available
                if (global.gc) {
                    global.gc();
                }
                
                // Take checkpoint after GC
                this.takeSnapshot(`iteration-${i}-complete`);
                
                console.log(`  Iteration ${i + 1}/${iterations} completed`);
            }
            
        } finally {
            this.stopMonitoring();
        }
        
        return this.analyzeResults();
    }
    
    analyzeResults() {
        console.log('\n📊 Analyzing memory leak detection results...');
        
        const analysis = {
            timestamp: new Date().toISOString(),
            totalSnapshots: this.snapshots.length,
            totalOperations: this.operations.length,
            memoryTrend: this.analyzeMemoryTrend(),
            operations: this.analyzeOperations(),
            leaks: this.detectLeaks(),
            recommendations: this.generateRecommendations()
        };
        
        return analysis;
    }
    
    analyzeMemoryTrend() {
        if (this.snapshots.length < 2) {
            return { trend: 'insufficient_data' };
        }
        
        const first = this.snapshots[0];
        const last = this.snapshots[this.snapshots.length - 1];
        
        const rssGrowth = last.rss - first.rss;
        const heapGrowth = last.heapUsed - first.heapUsed;
        const heapTotalGrowth = last.heapTotal - first.heapTotal;
        
        // Calculate growth rate per minute
        const timeSpan = (last.timestamp - first.timestamp) / 1000 / 60; // minutes
        const rssGrowthPerMinute = rssGrowth / timeSpan;
        const heapGrowthPerMinute = heapGrowth / timeSpan;
        
        // Detect trend
        let trend = 'stable';
        if (heapGrowth > this.leakThreshold) {
            trend = 'leaking';
        } else if (heapGrowth > this.leakThreshold * 0.5) {
            trend = 'growing';
        } else if (heapGrowth < -this.leakThreshold * 0.1) {
            trend = 'decreasing';
        }
        
        return {
            trend,
            timeSpanMinutes: timeSpan,
            rss: {
                initial: first.rss,
                final: last.rss,
                growth: rssGrowth,
                growthPerMinute: rssGrowthPerMinute
            },
            heap: {
                initial: first.heapUsed,
                final: last.heapUsed,
                growth: heapGrowth,
                growthPerMinute: heapGrowthPerMinute
            },
            heapTotal: {
                initial: first.heapTotal,
                final: last.heapTotal,
                growth: heapTotalGrowth
            }
        };
    }
    
    analyzeOperations() {
        return this.operations.map(op => ({
            name: op.name,
            duration: op.duration,
            memoryGrowth: op.memoryGrowth,
            memoryGrowthPerMs: op.memoryGrowth / op.duration,
            checkpoints: op.checkpoints.length,
            hasMemoryGrowth: op.memoryGrowth > 0
        }));
    }
    
    detectLeaks() {
        const leaks = [];
        
        // Check for overall memory growth trend
        const trend = this.analyzeMemoryTrend();
        if (trend.trend === 'leaking') {
            leaks.push({
                type: 'overall_growth',
                severity: 'high',
                description: `Memory grew by ${(trend.heap.growth / 1024 / 1024).toFixed(2)}MB over ${trend.timeSpanMinutes.toFixed(1)} minutes`,
                recommendation: 'Check for unreleased resources, event listeners, or cached data'
            });
        }
        
        // Check operations with significant memory growth
        const problematicOps = this.operations.filter(op => op.memoryGrowth > 10 * 1024 * 1024); // 10MB
        problematicOps.forEach(op => {
            leaks.push({
                type: 'operation_growth',
                severity: 'medium',
                operation: op.name,
                growth: op.memoryGrowth,
                description: `Operation ${op.name} grew memory by ${(op.memoryGrowth / 1024 / 1024).toFixed(2)}MB`,
                recommendation: 'Review operation for proper cleanup and resource management'
            });
        });
        
        // Check for memory that never decreases (suggests lack of GC)
        const memoryValues = this.snapshots.map(s => s.heapUsed);
        const maxMemory = Math.max(...memoryValues);
        const finalMemory = memoryValues[memoryValues.length - 1];
        
        if (finalMemory > maxMemory * 0.9 && trend.trend !== 'decreasing') {
            leaks.push({
                type: 'no_gc',
                severity: 'medium',
                description: 'Memory does not appear to be garbage collected effectively',
                recommendation: 'Ensure objects are properly dereferenced and consider manual GC triggers'
            });
        }
        
        return leaks;
    }
    
    generateRecommendations() {
        const recommendations = [];
        const trend = this.analyzeMemoryTrend();
        
        if (trend.trend === 'leaking' || trend.trend === 'growing') {
            recommendations.push({
                priority: 'high',
                category: 'memory_management',
                action: 'Investigate memory leaks',
                details: 'Memory usage is growing over time. Check for unreleased resources, event listeners, or cached data.'
            });
        }
        
        if (trend.heap.growthPerMinute > 5 * 1024 * 1024) { // 5MB/minute
            recommendations.push({
                priority: 'medium',
                category: 'optimization',
                action: 'Optimize memory allocation',
                details: 'Memory is growing rapidly. Consider optimizing data structures and reducing object creation.'
            });
        }
        
        const highGrowthOps = this.operations.filter(op => op.memoryGrowth > 5 * 1024 * 1024);
        if (highGrowthOps.length > 0) {
            recommendations.push({
                priority: 'medium',
                category: 'operation_cleanup',
                action: 'Review operation cleanup',
                details: `${highGrowthOps.length} operations show significant memory growth. Ensure proper cleanup.`
            });
        }
        
        // General recommendations
        recommendations.push({
            priority: 'low',
            category: 'monitoring',
            action: 'Implement continuous monitoring',
            details: 'Set up regular memory monitoring in production to detect leaks early.'
        });
        
        return recommendations;
    }
    
    generateReport() {
        const analysis = this.analyzeResults();
        
        console.log(`\n🧠 MEMORY LEAK DETECTION REPORT`);
        console.log(`================================`);
        
        console.log(`\n📈 Memory Trend:`);
        console.log(`  Trend: ${analysis.memoryTrend.trend}`);
        console.log(`  Time Span: ${analysis.memoryTrend.timeSpanMinutes?.toFixed(1)} minutes`);
        if (analysis.memoryTrend.heap) {
            console.log(`  Heap Growth: ${(analysis.memoryTrend.heap.growth / 1024 / 1024).toFixed(2)}MB`);
            console.log(`  Growth Rate: ${(analysis.memoryTrend.heap.growthPerMinute / 1024 / 1024).toFixed(2)}MB/min`);
        }
        
        console.log(`\n🔍 Operations Analyzed: ${analysis.totalOperations}`);
        const opsWithGrowth = analysis.operations.filter(op => op.hasMemoryGrowth).length;
        console.log(`  Operations with memory growth: ${opsWithGrowth}`);
        
        console.log(`\n🚨 Leaks Detected: ${analysis.leaks.length}`);
        analysis.leaks.forEach(leak => {
            console.log(`  ${leak.severity.toUpperCase()}: ${leak.description}`);
        });
        
        console.log(`\n💡 Recommendations:`);
        analysis.recommendations.forEach((rec, i) => {
            console.log(`  ${i + 1}. [${rec.priority.toUpperCase()}] ${rec.action}`);
            console.log(`     ${rec.details}`);
        });
        
        const memoryLeaksDetected = analysis.leaks.length > 0 || analysis.memoryTrend.trend === 'leaking';
        
        console.log(`\n${memoryLeaksDetected ? '❌ MEMORY LEAKS DETECTED' : '✅ NO SIGNIFICANT MEMORY LEAKS'}`);
        
        return {
            ...analysis,
            memoryLeaksDetected
        };
    }
}

// Test function for PAMPAX memory leak detection
async function createPAMPAXMemoryTest() {
    const { ProductionBenchmarkRunner } = await import('./production-integration.js');
    const { TestCorporaGenerator } = await import('./production-benchmark.js');
    
    const tmpDir = await fs.mkdtemp('/tmp/pampax-leak-test-');
    const generator = new TestCorporaGenerator(tmpDir);
    const runner = new ProductionBenchmarkRunner();
    
    try {
        // Create a small corpus for testing
        const corpus = await generator.generateCorpus('small');
        
        return async (iteration, operation) => {
            // Run various operations that could leak memory
            await runner.runSearchQuery(corpus.dir, `test query ${iteration}`);
            await runner.runBundleAssembly(corpus.dir);
            
            // Add checkpoints
            if (operation) {
                runner.addOperationCheckpoint(operation, 'search-complete');
                runner.addOperationCheckpoint(operation, 'assembly-complete');
            }
        };
    } finally {
        await fs.rm(tmpDir, { recursive: true, force: true });
    }
}

// CLI interface
async function main() {
    const args = process.argv.slice(2);
    let outputPath, iterations = 10;
    
    // Parse command line arguments
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        switch (arg) {
            case '--output':
                outputPath = args[++i];
                break;
            case '--iterations':
                iterations = parseInt(args[++i]);
                break;
            case '--help':
                console.log(`
Memory Leak Detection Tool

Usage: node memory-leak-detector.js [options]

Options:
  --output <path>       Path to save memory leak report (optional)
  --iterations <number>  Number of test iterations (default: 10)
  --help                Show this help message

Examples:
  node memory-leak-detector.js
  node memory-leak-detector.js --iterations 20 --output leak-report.json
                `);
                process.exit(0);
        }
    }
    
    try {
        const detector = new MemoryLeakDetector();
        const testFunction = await createPAMPAXMemoryTest();
        
        // Run memory leak detection
        await detector.runLeakDetection(testFunction, iterations);
        
        // Generate and save report
        const report = detector.generateReport();
        
        if (outputPath) {
            await fs.writeFile(outputPath, JSON.stringify(report, null, 2));
            console.log(`\n📄 Memory leak report saved to: ${outputPath}`);
        }
        
        // Exit with error code if memory leaks detected
        if (report.memoryLeaksDetected) {
            process.exit(1);
        }
        
    } catch (error) {
        console.error('❌ Error during memory leak detection:', error.message);
        process.exit(1);
    }
}

// Export for use in other modules
export { MemoryLeakDetector };

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch(console.error);
}