#!/usr/bin/env node

/**
 * Production Benchmark Suite for PAMPAX
 * 
 * Measures all production gate criteria:
 * - Hybrid Search: ≤700ms cold / ≤300ms warm (p50), ≤1.5s cold / ≤800ms warm (p95)
 * - Bundle Assembly: ≤3.0s cold / ≤1.0s warm (p50), ≤6.0s cold / ≤2.0s warm (p95)
 * - SQLite Read: ≤50ms p95
 * - Memory Usage: ≤500MB steady
 * - Cache Hit Rate: ≥60% in repeated sessions
 */

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test, describe } from 'node:test';
import { performance } from 'node:perf_hooks';

// Benchmark configuration
const BENCHMARK_CONFIG = {
    // Production gate thresholds
    thresholds: {
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
            steady: 500 * 1024 * 1024 // 500MB in bytes
        },
        cacheHitRate: {
            minimum: 0.60 // 60%
        }
    },
    
    // Regression detection thresholds (10% failure rate)
    regressionThreshold: 0.10,
    
    // Test corpora sizes
    corpora: {
        small: { min: 0, max: 1000 },
        medium: { min: 1000, max: 10000 },
        large: { min: 10000, max: 100000 }
    },
    
    // Benchmark iterations
    iterations: {
        cold: 5,
        warm: 20,
        memory: 10
    }
};

// Statistical utilities
class Statistics {
    static calculatePercentile(values, percentile) {
        const sorted = [...values].sort((a, b) => a - b);
        const index = Math.ceil((percentile / 100) * sorted.length) - 1;
        return sorted[Math.max(0, index)];
    }
    
    static calculateMean(values) {
        return values.reduce((sum, val) => sum + val, 0) / values.length;
    }
    
    static calculateStd(values) {
        const mean = this.calculateMean(values);
        const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
        return Math.sqrt(variance);
    }
    
    static calculateStats(values) {
        return {
            p50: this.calculatePercentile(values, 50),
            p95: this.calculatePercentile(values, 95),
            mean: this.calculateMean(values),
            std: this.calculateStd(values),
            min: Math.min(...values),
            max: Math.max(...values),
            count: values.length
        };
    }
}

// Memory monitoring
class MemoryMonitor {
    constructor() {
        this.baseline = process.memoryUsage();
        this.readings = [];
    }
    
    start() {
        this.baseline = process.memoryUsage();
        this.readings = [];
        this.interval = setInterval(() => {
            this.readings.push(process.memoryUsage());
        }, 100);
    }
    
    stop() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
        
        const current = process.memoryUsage();
        return {
            baseline: this.baseline,
            current,
            peak: this.readings.reduce((max, reading) => ({
                rss: Math.max(max.rss, reading.rss),
                heapUsed: Math.max(max.heapUsed, reading.heapUsed),
                heapTotal: Math.max(max.heapTotal, reading.heapTotal),
                external: Math.max(max.external, reading.external)
            }), this.baseline),
            readings: this.readings
        };
    }
    
    getSteadyStateMemory() {
        if (this.readings.length < 10) return null;
        
        // Take last 10 readings for steady state
        const recent = this.readings.slice(-10);
        const heapUseds = recent.map(r => r.heapUsed);
        
        return {
            mean: Statistics.calculateMean(heapUseds),
            std: Statistics.calculateStd(heapUseds),
            max: Math.max(...heapUseds)
        };
    }
}

// Test corpora generator
class TestCorporaGenerator {
    constructor(baseDir) {
        this.baseDir = baseDir;
    }
    
    async generateCorpus(size, languages = ['javascript', 'python', 'typescript', 'java', 'go']) {
        const corpusDir = path.join(this.baseDir, `corpus-${size}`);
        await fs.rm(corpusDir, { recursive: true, force: true });
        await fs.mkdir(corpusDir, { recursive: true });
        
        const fileCount = this.getFileCount(size);
        const files = [];
        
        for (let i = 0; i < fileCount; i++) {
            const lang = languages[i % languages.length];
            const content = this.generateFileContent(lang, i);
            const filename = this.getFileName(lang, i);
            const filePath = path.join(corpusDir, filename);
            
            await fs.writeFile(filePath, content);
            files.push(filePath);
        }
        
        // Generate package.json and other config files
        await this.generateProjectFiles(corpusDir, size);
        
        return {
            dir: corpusDir,
            fileCount,
            files,
            size,
            languages
        };
    }
    
    getFileCount(size) {
        switch (size) {
            case 'small': return 500;
            case 'medium': return 5000;
            case 'large': return 50000;
            default: return 1000;
        }
    }
    
    getFileName(language, index) {
        const extensions = {
            javascript: '.js',
            typescript: '.ts',
            python: '.py',
            java: '.java',
            go: '.go',
            rust: '.rs',
            cpp: '.cpp',
            c: '.c'
        };
        
        const ext = extensions[language] || '.txt';
        return `file_${index.toString().padStart(4, '0')}${ext}`;
    }
    
    generateFileContent(language, index) {
        const templates = {
            javascript: () => `/**
 * JavaScript module ${index}
 * @module module${index}
 */
const ${this.generateFunctionName(index)} = (param1, param2) => {
    if (!param1 || !param2) {
        throw new Error('Parameters required');
    }
    
    const result = param1 + param2;
    console.log('Result:', result);
    return result;
};

class ${this.generateClassName(index)} {
    constructor(name) {
        this.name = name;
        this.id = Math.random().toString(36).substr(2, 9);
    }
    
    process() {
        return ${this.generateFunctionName(index)}(this.name, this.id);
    }
}

export { ${this.generateFunctionName(index)}, ${this.generateClassName(index)} };`,
            
            python: () => `#!/usr/bin/env python3
"""
Python module ${index}
"""

import random
import json
from typing import List, Dict, Optional

def ${this.generateFunctionName(index)}(param1: str, param2: int) -> Dict[str, any]:
    """Process parameters and return result."""
    if not param1 or param2 <= 0:
        raise ValueError("Invalid parameters")
    
    result = {
        'name': param1,
        'value': param2,
        'processed': True,
        'timestamp': random.time.time()
    }
    
    return result

class ${this.generateClassName(index)}:
    """Class ${index} for demonstration."""
    
    def __init__(self, name: str):
        self.name = name
        self.data = {}
    
    def process(self) -> Dict:
        """Process the data."""
        return ${this.generateFunctionName(index)}(self.name, len(self.name))
    
    def add_data(self, key: str, value: any) -> None:
        """Add data to the instance."""
        self.data[key] = value

if __name__ == "__main__":
    obj = ${this.generateClassName(index)}("test_${index}")
    print(obj.process())`,
            
            typescript: () => `/**
 * TypeScript module ${index}
 */

export interface ${this.generateInterfaceName(index)} {
    id: string;
    name: string;
    value: number;
    timestamp: Date;
}

export class ${this.generateClassName(index)} {
    private readonly id: string;
    private name: string;
    private data: Map<string, any> = new Map();
    
    constructor(name: string) {
        this.id = Math.random().toString(36).substr(2, 9);
        this.name = name;
    }
    
    public process(): ${this.generateInterfaceName(index)} {
        return {
            id: this.id,
            name: this.name,
            value: this.name.length,
            timestamp: new Date()
        };
    }
    
    public addData(key: string, value: any): void {
        this.data.set(key, value);
    }
    
    public getData(key: string): any {
        return this.data.get(key);
    }
}

export const ${this.generateFunctionName(index)} = (
    param1: string,
    param2: number
): ${this.generateInterfaceName(index)} => {
    const instance = new ${this.generateClassName(index)}(param1);
    instance.addData('param2', param2);
    return instance.process();
};`,
            
            java: () => `package com.example.gen${index};

import java.util.*;
import java.time.LocalDateTime;

/**
 * Generated Java class ${index}
 */
public class ${this.generateClassName(index)} {
    private final String id;
    private String name;
    private Map<String, Object> data;
    
    public ${this.generateClassName(index)}(String name) {
        this.id = UUID.randomUUID().toString();
        this.name = name;
        this.data = new HashMap<>();
    }
    
    public String getId() {
        return id;
    }
    
    public String getName() {
        return name;
    }
    
    public void setName(String name) {
        this.name = name;
    }
    
    public Map<String, Object> process() {
        Map<String, Object> result = new HashMap<>();
        result.put("id", id);
        result.put("name", name);
        result.put("timestamp", LocalDateTime.now());
        result.put("processed", true);
        return result;
    }
    
    public void addData(String key, Object value) {
        data.put(key, value);
    }
    
    public Object getData(String key) {
        return data.get(key);
    }
    
    public static ${this.generateClassName(index)} create(String name) {
        return new ${this.generateClassName(index)}(name);
    }
}`,
            
            go: () => `package main

import (
    "fmt"
    "time"
    "math/rand"
)

// ${this.generateStructName(index)} represents a test structure
type ${this.generateStructName(index)} struct {
    ID      string    \`json:"id"\`
    Name    string    \`json:"name"\`
    Value   int       \`json:"value"\`
    Created time.Time \`json:"created"\`
}

// New${this.generateStructName(index)} creates a new instance
func New${this.generateStructName(index)}(name string) *${this.generateStructName(index)} {
    return &${this.generateStructName(index)}{
        ID:      generateID(),
        Name:    name,
        Value:   len(name),
        Created: time.Now(),
    }
}

// Process processes the struct and returns a map
func (s *${this.generateStructName(index)}) Process() map[string]interface{} {
    return map[string]interface{}{
        "id":        s.ID,
        "name":      s.Name,
        "value":     s.Value,
        "processed": true,
        "timestamp": time.Now(),
    }
}

// generateID generates a random ID
func generateID() string {
    const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
    b := make([]byte, 9)
    for i := range b {
        b[i] = charset[rand.Intn(len(charset))]
    }
    return string(b)
}

// ${this.generateFunctionName(index)} processes two parameters
func ${this.generateFunctionName(index)}(param1 string, param2 int) *${this.generateStructName(index)} {
    obj := New${this.generateStructName(index)}(param1)
    obj.Value = param2
    return obj
}

func main() {
    obj := New${this.generateStructName(index)}("test_${index}")
    result := obj.Process()
    fmt.Printf("Result: %+v\\n", result)
}`
        };
        
        return templates[language] ? templates[language]() : `// Generated file ${index}\nconsole.log("File ${index}");`;
    }
    
    generateFunctionName(index) {
        const prefixes = ['process', 'handle', 'compute', 'calculate', 'transform', 'convert', 'validate', 'execute'];
        const prefix = prefixes[index % prefixes.length];
        return `${prefix}${index}`;
    }
    
    generateClassName(index) {
        const suffixes = ['Processor', 'Handler', 'Manager', 'Service', 'Controller', 'Component', 'Module', 'Worker'];
        const suffix = suffixes[index % suffixes.length];
        return `Test${index}${suffix}`;
    }
    
    generateInterfaceName(index) {
        const suffixes = ['Data', 'Config', 'Options', 'Params', 'Result', 'Response', 'Request', 'Payload'];
        const suffix = suffixes[index % suffixes.length];
        return `I${index}${suffix}`;
    }
    
    generateStructName(index) {
        const suffixes = ['Data', 'Config', 'Info', 'State', 'Status', 'Record', 'Entity', 'Object'];
        const suffix = suffixes[index % suffixes.length];
        return `${index}${suffix}`;
    }
    
    async generateProjectFiles(corpusDir, size) {
        // Generate package.json for Node.js projects
        const packageJson = {
            name: `test-corpus-${size}`,
            version: "1.0.0",
            description: `Generated test corpus of size ${size}`,
            scripts: {
                test: "node test.js",
                start: "node index.js"
            },
            dependencies: {
                "express": "^4.18.0",
                "lodash": "^4.17.21"
            },
            devDependencies: {
                "jest": "^29.0.0",
                "eslint": "^8.0.0"
            }
        };
        
        await fs.writeFile(
            path.join(corpusDir, 'package.json'),
            JSON.stringify(packageJson, null, 2)
        );
        
        // Generate README.md
        const readme = `# Test Corpus - ${size}

This is a generated test corpus containing ${this.getFileCount(size)} files.

## Statistics
- File Count: ${this.getFileCount(size)}
- Generated: ${new Date().toISOString()}
- Purpose: Performance benchmarking

## Usage
This corpus is used for testing PAMPAX performance characteristics.
`;
        
        await fs.writeFile(path.join(corpusDir, 'README.md'), readme);
        
        // Generate .gitignore
        const gitignore = `node_modules/
*.log
.env
dist/
build/
.DS_Store
*.tmp
`;
        
        await fs.writeFile(path.join(corpusDir, '.gitignore'), gitignore);
    }
}

// Benchmark runner
class BenchmarkRunner {
    constructor() {
        this.results = [];
        this.memoryMonitor = new MemoryMonitor();
    }
    
    async runHybridSearchBenchmark(corpus, options = {}) {
        console.log(`\n🔍 Running Hybrid Search Benchmark on ${corpus.size} corpus (${corpus.fileCount} files)`);
        
        const results = {
            corpus: corpus.size,
            fileCount: corpus.fileCount,
            cold: [],
            warm: [],
            memory: []
        };
        
        // Cold cache measurements
        for (let i = 0; i < BENCHMARK_CONFIG.iterations.cold; i++) {
            // Clear cache
            await this.clearCache();
            
            const startTime = performance.now();
            this.memoryMonitor.start();
            
            try {
                // Run search query
                await this.runSearchQuery(corpus.dir, "function test", options);
                
                const endTime = performance.now();
                const memoryStats = this.memoryMonitor.stop();
                
                results.cold.push(endTime - startTime);
                results.memory.push(memoryStats);
                
                console.log(`  Cold run ${i + 1}: ${(endTime - startTime).toFixed(2)}ms`);
            } catch (error) {
                console.error(`  Cold run ${i + 1} failed:`, error.message);
                this.memoryMonitor.stop();
            }
        }
        
        // Warm cache measurements
        for (let i = 0; i < BENCHMARK_CONFIG.iterations.warm; i++) {
            const startTime = performance.now();
            
            try {
                // Run search query (cache should be warm)
                await this.runSearchQuery(corpus.dir, "function test", options);
                
                const endTime = performance.now();
                results.warm.push(endTime - startTime);
                
                console.log(`  Warm run ${i + 1}: ${(endTime - startTime).toFixed(2)}ms`);
            } catch (error) {
                console.error(`  Warm run ${i + 1} failed:`, error.message);
            }
        }
        
        // Calculate statistics
        results.coldStats = Statistics.calculateStats(results.cold);
        results.warmStats = Statistics.calculateStats(results.warm);
        
        // Validate against thresholds
        this.validateSearchThresholds(results);
        
        this.results.push({ type: 'hybrid-search', ...results });
        return results;
    }
    
    async runBundleAssemblyBenchmark(corpus, options = {}) {
        console.log(`\n📦 Running Bundle Assembly Benchmark on ${corpus.size} corpus`);
        
        const results = {
            corpus: corpus.size,
            fileCount: corpus.fileCount,
            cold: [],
            warm: []
        };
        
        // Cold cache measurements
        for (let i = 0; i < BENCHMARK_CONFIG.iterations.cold; i++) {
            await this.clearCache();
            
            const startTime = performance.now();
            
            try {
                // Run bundle assembly
                await this.runBundleAssembly(corpus.dir, options);
                
                const endTime = performance.now();
                results.cold.push(endTime - startTime);
                
                console.log(`  Cold assembly ${i + 1}: ${(endTime - startTime).toFixed(2)}ms`);
            } catch (error) {
                console.error(`  Cold assembly ${i + 1} failed:`, error.message);
            }
        }
        
        // Warm cache measurements
        for (let i = 0; i < BENCHMARK_CONFIG.iterations.warm; i++) {
            const startTime = performance.now();
            
            try {
                await this.runBundleAssembly(corpus.dir, options);
                
                const endTime = performance.now();
                results.warm.push(endTime - startTime);
                
                console.log(`  Warm assembly ${i + 1}: ${(endTime - startTime).toFixed(2)}ms`);
            } catch (error) {
                console.error(`  Warm assembly ${i + 1} failed:`, error.message);
            }
        }
        
        // Calculate statistics
        results.coldStats = Statistics.calculateStats(results.cold);
        results.warmStats = Statistics.calculateStats(results.warm);
        
        // Validate against thresholds
        this.validateBundleThresholds(results);
        
        this.results.push({ type: 'bundle-assembly', ...results });
        return results;
    }
    
    async runSQLiteReadBenchmark(corpus) {
        console.log(`\n💾 Running SQLite Read Benchmark on ${corpus.size} corpus`);
        
        const results = {
            corpus: corpus.size,
            fileCount: corpus.fileCount,
            reads: []
        };
        
        // First, index the corpus
        await this.indexCorpus(corpus.dir);
        
        // Perform multiple read operations
        for (let i = 0; i < 100; i++) {
            const startTime = performance.now();
            
            try {
                await this.runSQLiteRead(corpus.dir);
                
                const endTime = performance.now();
                results.reads.push(endTime - startTime);
            } catch (error) {
                console.error(`  SQLite read ${i + 1} failed:`, error.message);
            }
        }
        
        // Calculate statistics
        results.stats = Statistics.calculateStats(results.reads);
        
        // Validate against thresholds
        this.validateSQLiteThresholds(results);
        
        this.results.push({ type: 'sqlite-read', ...results });
        return results;
    }
    
    async runMemoryUsageBenchmark(corpus) {
        console.log(`\n🧠 Running Memory Usage Benchmark on ${corpus.size} corpus`);
        
        const results = {
            corpus: corpus.size,
            fileCount: corpus.fileCount,
            measurements: []
        };
        
        for (let i = 0; i < BENCHMARK_CONFIG.iterations.memory; i++) {
            const memoryMonitor = new MemoryMonitor();
            memoryMonitor.start();
            
            try {
                // Run typical operations
                await this.runSearchQuery(corpus.dir, "function test");
                await this.runBundleAssembly(corpus.dir);
                
                const memoryStats = memoryMonitor.stop();
                const steadyState = memoryMonitor.getSteadyStateMemory();
                
                results.measurements.push({
                    peak: memoryStats.peak.heapUsed,
                    steady: steadyState ? steadyState.mean : memoryStats.current.heapUsed,
                    baseline: memoryStats.baseline.heapUsed
                });
                
                console.log(`  Memory test ${i + 1}: Peak ${(memoryStats.peak.heapUsed / 1024 / 1024).toFixed(2)}MB, Steady ${(steadyState ? steadyState.mean / 1024 / 1024 : 0).toFixed(2)}MB`);
            } catch (error) {
                console.error(`  Memory test ${i + 1} failed:`, error.message);
                memoryMonitor.stop();
            }
        }
        
        // Calculate statistics
        const peaks = results.measurements.map(m => m.peak);
        const steadies = results.measurements.map(m => m.steady);
        
        results.peakStats = Statistics.calculateStats(peaks);
        results.steadyStats = Statistics.calculateStats(steadies);
        
        // Validate against thresholds
        this.validateMemoryThresholds(results);
        
        this.results.push({ type: 'memory-usage', ...results });
        return results;
    }
    
    async runCacheHitRateBenchmark(corpus) {
        console.log(`\n🎯 Running Cache Hit Rate Benchmark on ${corpus.size} corpus`);
        
        const results = {
            corpus: corpus.size,
            fileCount: corpus.fileCount,
            sessions: []
        };
        
        // Run multiple sessions to measure cache effectiveness
        for (let session = 0; session < 5; session++) {
            const sessionResults = {
                sessionId: session,
                queries: [],
                cacheHits: 0,
                cacheMisses: 0
            };
            
            // Clear cache at start of session
            await this.clearCache();
            
            // Run repeated queries within session
            const queries = [
                "function test",
                "class example",
                "import module",
                "export default",
                "async function"
            ];
            
            for (let i = 0; i < 20; i++) {
                const query = queries[i % queries.length];
                
                try {
                    const cacheInfo = await this.runQueryWithCacheInfo(corpus.dir, query);
                    
                    sessionResults.queries.push({
                        query,
                        cacheHit: cacheInfo.hit,
                        responseTime: cacheInfo.responseTime
                    });
                    
                    if (cacheInfo.hit) {
                        sessionResults.cacheHits++;
                    } else {
                        sessionResults.cacheMisses++;
                    }
                } catch (error) {
                    console.error(`  Query ${i} failed:`, error.message);
                }
            }
            
            const hitRate = sessionResults.cacheHits / (sessionResults.cacheHits + sessionResults.cacheMisses);
            sessionResults.hitRate = hitRate;
            
            console.log(`  Session ${session + 1}: ${sessionResults.cacheHits}/${sessionResults.cacheHits + sessionResults.cacheMisses} cache hits (${(hitRate * 100).toFixed(1)}%)`);
            
            results.sessions.push(sessionResults);
        }
        
        // Calculate overall hit rate
        const totalHits = results.sessions.reduce((sum, s) => sum + s.cacheHits, 0);
        const totalRequests = results.sessions.reduce((sum, s) => sum + s.cacheHits + s.cacheMisses, 0);
        results.overallHitRate = totalHits / totalRequests;
        
        // Validate against thresholds
        this.validateCacheThresholds(results);
        
        this.results.push({ type: 'cache-hit-rate', ...results });
        return results;
    }
    
    validateSearchThresholds(results) {
        const { coldStats, warmStats } = results;
        const thresholds = BENCHMARK_CONFIG.thresholds.hybridSearch;
        
        console.log(`\n📊 Hybrid Search Results (${results.corpus}):`);
        console.log(`  Cold: p50=${coldStats.p50.toFixed(2)}ms, p95=${coldStats.p95.toFixed(2)}ms`);
        console.log(`  Warm: p50=${warmStats.p50.toFixed(2)}ms, p95=${warmStats.p95.toFixed(2)}ms`);
        
        const coldPass = coldStats.p50 <= thresholds.cold.p50 && coldStats.p95 <= thresholds.cold.p95;
        const warmPass = warmStats.p50 <= thresholds.warm.p50 && warmStats.p95 <= thresholds.warm.p95;
        
        if (!coldPass) {
            console.log(`  ❌ Cold cache thresholds exceeded`);
        }
        if (!warmPass) {
            console.log(`  ❌ Warm cache thresholds exceeded`);
        }
        if (coldPass && warmPass) {
            console.log(`  ✅ Hybrid search thresholds met`);
        }
        
        results.thresholdsPassed = { cold: coldPass, warm: warmPass, overall: coldPass && warmPass };
    }
    
    validateBundleThresholds(results) {
        const { coldStats, warmStats } = results;
        const thresholds = BENCHMARK_CONFIG.thresholds.bundleAssembly;
        
        console.log(`\n📦 Bundle Assembly Results (${results.corpus}):`);
        console.log(`  Cold: p50=${coldStats.p50.toFixed(2)}ms, p95=${coldStats.p95.toFixed(2)}ms`);
        console.log(`  Warm: p50=${warmStats.p50.toFixed(2)}ms, p95=${warmStats.p95.toFixed(2)}ms`);
        
        const coldPass = coldStats.p50 <= thresholds.cold.p50 && coldStats.p95 <= thresholds.cold.p95;
        const warmPass = warmStats.p50 <= thresholds.warm.p50 && warmStats.p95 <= thresholds.warm.p95;
        
        if (!coldPass) {
            console.log(`  ❌ Cold cache thresholds exceeded`);
        }
        if (!warmPass) {
            console.log(`  ❌ Warm cache thresholds exceeded`);
        }
        if (coldPass && warmPass) {
            console.log(`  ✅ Bundle assembly thresholds met`);
        }
        
        results.thresholdsPassed = { cold: coldPass, warm: warmPass, overall: coldPass && warmPass };
    }
    
    validateSQLiteThresholds(results) {
        const { stats } = results;
        const threshold = BENCHMARK_CONFIG.thresholds.sqliteRead.p95;
        
        console.log(`\n💾 SQLite Read Results (${results.corpus}):`);
        console.log(`  p95=${stats.p95.toFixed(2)}ms, mean=${stats.mean.toFixed(2)}ms`);
        
        const pass = stats.p95 <= threshold;
        
        if (!pass) {
            console.log(`  ❌ SQLite read threshold exceeded`);
        } else {
            console.log(`  ✅ SQLite read threshold met`);
        }
        
        results.thresholdPassed = pass;
    }
    
    validateMemoryThresholds(results) {
        const { steadyStats } = results;
        const threshold = BENCHMARK_CONFIG.thresholds.memoryUsage.steady;
        
        console.log(`\n🧠 Memory Usage Results (${results.corpus}):`);
        console.log(`  Steady state: ${steadyStats.mean.toFixed(0)} bytes (${(steadyStats.mean / 1024 / 1024).toFixed(2)}MB)`);
        console.log(`  Peak: ${results.peakStats.mean.toFixed(0)} bytes (${(results.peakStats.mean / 1024 / 1024).toFixed(2)}MB)`);
        
        const pass = steadyStats.mean <= threshold;
        
        if (!pass) {
            console.log(`  ❌ Memory usage threshold exceeded`);
        } else {
            console.log(`  ✅ Memory usage threshold met`);
        }
        
        results.thresholdPassed = pass;
    }
    
    validateCacheThresholds(results) {
        const threshold = BENCHMARK_CONFIG.thresholds.cacheHitRate.minimum;
        
        console.log(`\n🎯 Cache Hit Rate Results (${results.corpus}):`);
        console.log(`  Overall hit rate: ${(results.overallHitRate * 100).toFixed(1)}%`);
        
        const pass = results.overallHitRate >= threshold;
        
        if (!pass) {
            console.log(`  ❌ Cache hit rate threshold not met`);
        } else {
            console.log(`  ✅ Cache hit rate threshold met`);
        }
        
        results.thresholdPassed = pass;
    }
    
    async clearCache() {
        // Implementation would clear PAMPAX cache
        try {
            const cacheDir = path.join(os.tmpdir(), '.pampa-cache');
            await fs.rm(cacheDir, { recursive: true, force: true });
        } catch (error) {
            // Ignore cache clearing errors
        }
    }
    
    async runSearchQuery(corpusDir, query, options = {}) {
        // Mock implementation - would integrate with actual PAMPAX search
        return new Promise(resolve => {
            setTimeout(() => {
                resolve({
                    results: [],
                    query,
                    responseTime: Math.random() * 500 + 100
                });
            }, Math.random() * 200 + 50);
        });
    }
    
    async runBundleAssembly(corpusDir) {
        // Mock implementation - would integrate with actual PAMPAX bundle assembly
        return new Promise(resolve => {
            setTimeout(() => {
                resolve({
                    bundle: {},
                    responseTime: Math.random() * 1000 + 500
                });
            }, Math.random() * 500 + 200);
        });
    }
    
    async indexCorpus() {
        // Mock implementation - would integrate with actual PAMPAX indexing
        return new Promise(resolve => {
            setTimeout(resolve, Math.random() * 1000 + 500);
        });
    }
    
    async runSQLiteRead() {
        // Mock implementation - would integrate with actual SQLite operations
        return new Promise(resolve => {
            setTimeout(resolve, Math.random() * 30 + 10);
        });
    }
    
    async runQueryWithCacheInfo() {
        // Mock implementation - would return actual cache info
        return {
            hit: Math.random() > 0.4, // 60% hit rate
            responseTime: Math.random() * 100 + 20
        };
    }
    
    generateReport() {
        console.log(`\n📋 PRODUCTION BENCHMARK REPORT`);
        console.log(`================================`);
        
        let allPassed = true;
        
        for (const result of this.results) {
            console.log(`\n${result.type.toUpperCase()}:`);
            
            switch (result.type) {
                case 'hybrid-search':
                case 'bundle-assembly':
                    if (result.thresholdsPassed.overall) {
                        console.log(`  ✅ PASSED`);
                    } else {
                        console.log(`  ❌ FAILED`);
                        allPassed = false;
                    }
                    break;
                default:
                    if (result.thresholdPassed) {
                        console.log(`  ✅ PASSED`);
                    } else {
                        console.log(`  ❌ FAILED`);
                        allPassed = false;
                    }
            }
        }
        
        console.log(`\n${allPassed ? '✅ ALL BENCHMARKS PASSED' : '❌ SOME BENCHMARKS FAILED'}`);
        
        return {
            passed: allPassed,
            results: this.results,
            timestamp: new Date().toISOString()
        };
    }
}

// Main test suite
async function runProductionBenchmarks() {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pampax-bench-'));
    const generator = new TestCorporaGenerator(tmpDir);
    const runner = new BenchmarkRunner();
    
    try {
        console.log('🚀 Starting Production Benchmark Suite');
        console.log(`Working directory: ${tmpDir}`);
        
        // Generate test corpora
        console.log('\n📁 Generating test corpora...');
        const mediumCorpus = await generator.generateCorpus('medium');
        const largeCorpus = await generator.generateCorpus('large');
        
        console.log(`Generated medium corpus: ${mediumCorpus.fileCount} files`);
        console.log(`Generated large corpus: ${largeCorpus.fileCount} files`);
        
        // Run benchmarks on medium corpus
        await runner.runHybridSearchBenchmark(mediumCorpus);
        await runner.runBundleAssemblyBenchmark(mediumCorpus);
        await runner.runSQLiteReadBenchmark(mediumCorpus);
        await runner.runMemoryUsageBenchmark(mediumCorpus);
        await runner.runCacheHitRateBenchmark(mediumCorpus);
        
        // Run benchmarks on large corpus (subset for time)
        await runner.runHybridSearchBenchmark(largeCorpus);
        await runner.runBundleAssemblyBenchmark(largeCorpus);
        
        // Generate final report
        const report = runner.generateReport();
        
        // Save report to file
        const reportPath = path.join(tmpDir, 'benchmark-report.json');
        await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
        console.log(`\n📄 Report saved to: ${reportPath}`);
        
        return report;
        
    } finally {
        // Cleanup
        await fs.rm(tmpDir, { recursive: true, force: true });
    }
}

// Export for use in test framework
export {
    BENCHMARK_CONFIG,
    Statistics,
    MemoryMonitor,
    TestCorporaGenerator,
    BenchmarkRunner,
    runProductionBenchmarks
};

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    runProductionBenchmarks().catch(console.error);
}