# PAMPAX Production Benchmark Suite

A comprehensive benchmark suite for validating PAMPAX performance against production gate criteria and detecting performance regressions.

## Overview

The Production Benchmark Suite measures all critical performance aspects of PAMPAX to ensure it meets production requirements:

- **Hybrid Search Performance**: Measures search response times with cold/warm cache scenarios
- **Bundle Assembly Performance**: Validates context assembly speed and efficiency  
- **SQLite Read Performance**: Ensures database operations meet latency requirements
- **Memory Usage**: Monitors memory consumption and detects leaks
- **Cache Hit Rate**: Validates caching effectiveness across sessions

## Production Gate Criteria

### Hybrid Search
- **Cold Cache**: p50 ≤ 700ms, p95 ≤ 1.5s
- **Warm Cache**: p50 ≤ 300ms, p95 ≤ 800ms

### Bundle Assembly  
- **Cold Cache**: p50 ≤ 3.0s, p95 ≤ 6.0s
- **Warm Cache**: p50 ≤ 1.0s, p95 ≤ 2.0s

### SQLite Read
- **p95**: ≤ 50ms

### Memory Usage
- **Steady State**: ≤ 500MB

### Cache Hit Rate
- **Minimum**: ≥ 60% in repeated sessions

## Quick Start

### Run Full Production Benchmarks
```bash
# Run comprehensive production benchmark suite
npm run bench:production

# Run benchmarks with detailed output
npm run bench:run

# Run memory leak detection
npm run bench:memory
```

### Regression Detection
```bash
# Compare current results with baseline
npm run bench:regression -- --baseline baseline.json --current current.json

# Compare performance between versions
npm run bench:compare -- --baseline v1.0.json --current v1.1.json
```

### CI Integration
```bash
# Run all benchmarks (used in CI)
npm run bench:production
```

## Test Corpora

The benchmark suite generates realistic test repositories in three sizes:

### Small Corpus (≤1K files)
- Used for quick validation and development
- ~500 files across multiple languages
- Generation time: ~10 seconds

### Medium Corpus (1K-10K files)
- Primary production validation target
- ~5,000 files with realistic project structure
- Generation time: ~30 seconds

### Large Corpus (10K-100K files)
- Stress testing and scalability validation
- ~50,000 files with complex dependencies
- Generation time: ~2 minutes

## Architecture

### Core Components

#### ProductionBenchmarkRunner
Main orchestrator that runs all benchmarks and generates comprehensive reports.

#### TestCorporaGenerator
Creates realistic test repositories with:
- Multiple programming languages (JavaScript, Python, TypeScript, Java, Go, etc.)
- Realistic file structures and dependencies
- Deterministic, repeatable content generation

#### RegressionDetector
Compares benchmark results between runs to detect performance regressions:
- Configurable regression thresholds (default: 10%)
- Detailed change analysis and reporting
- Integration with CI/CD pipelines

#### PerformanceComparator
Analyzes performance changes between versions:
- Statistical comparison of all metrics
- Trend analysis and recommendations
- Automated performance impact assessment

#### MemoryLeakDetector
Monitors memory usage during extended operations:
- Real-time memory tracking
- Leak detection and analysis
- Memory growth trend analysis

## Usage Examples

### Basic Benchmark Execution
```bash
# Run production benchmarks
node test/benchmarks/production-integration.js

# Save results to file
node test/benchmarks/production-integration.js > results.json
```

### Regression Detection
```bash
# Detect regressions against baseline
node test/benchmarks/regression-detector.js \
  --baseline baseline-results.json \
  --current current-results.json \
  --threshold 0.10 \
  --output regression-report.json
```

### Performance Comparison
```bash
# Compare two benchmark runs
node test/benchmarks/performance-comparator.js \
  --baseline old-version.json \
  --current new-version.json \
  --threshold 0.05 \
  --output comparison.json
```

### Memory Leak Detection
```bash
# Run memory leak detection with 20 iterations
node test/benchmarks/memory-leak-detector.js \
  --iterations 20 \
  --output memory-report.json
```

## CI/CD Integration

### GitHub Actions Workflow

The benchmark suite includes a complete GitHub Actions workflow (`.github/workflows/production-benchmarks.yml`) that:

1. **Runs on every push and PR** to main/develop branches
2. **Executes daily** for continuous monitoring
3. **Detects regressions** with 10% failure thresholds
4. **Comments on PRs** with detailed performance results
5. **Stores trend data** for historical analysis
6. **Fails builds** on significant regressions

### Workflow Features

- **Automated test data generation** for reproducible benchmarks
- **Statistical analysis** with p50/p95 calculations
- **Cold vs warm cache** measurement scenarios
- **Memory profiling** and leak detection
- **Results storage** and trend analysis
- **PR comments** with performance metrics
- **Artifact storage** for benchmark results

### Environment Configuration

```yaml
# Example CI configuration
env:
  NODE_OPTIONS: '--max-old-space-size=4096'
  PAMPAX_BENCHMARK_TIMEOUT: '300000'  # 5 minutes
  PAMPAX_CORPUS_SIZE: 'medium'
```

## Output Formats

### Benchmark Report Structure
```json
{
  "timestamp": "2025-01-XXTXX:XX:XX.XXXZ",
  "pampaxAvailable": true,
  "corpora": {
    "medium": {
      "fileCount": 5000,
      "size": "medium"
    }
  },
  "results": {
    "medium": {
      "hybridSearch": { /* Hybrid search results */ },
      "bundleAssembly": { /* Bundle assembly results */ },
      "sqliteRead": { /* SQLite read results */ },
      "memoryUsage": { /* Memory usage results */ },
      "cacheHitRate": { /* Cache hit rate results */ }
    }
  },
  "summary": {
    "allPassed": true,
    "passedTests": ["medium-hybrid-search", /* ... */],
    "failedTests": [],
    "warnings": []
  }
}
```

### Regression Report Structure
```json
{
  "timestamp": "2025-01-XXTXX:XX:XX.XXXZ",
  "threshold": 0.10,
  "summary": {
    "totalMetrics": 15,
    "regressions": 2,
    "improvements": 1,
    "unchanged": 12
  },
  "regressions": [
    {
      "metric": "medium-hybrid-search-cold-p95",
      "baselineValue": 1200.0,
      "currentValue": 1440.0,
      "change": 0.20,
      "changePercent": 20.0,
      "unit": "ms",
      "significant": true
    }
  ]
}
```

## Performance Thresholds

### Configuring Thresholds

Thresholds are defined in `BENCHMARK_CONFIG` and can be customized:

```javascript
const BENCHMARK_CONFIG = {
    thresholds: {
        hybridSearch: {
            cold: { p50: 700, p95: 1500 },
            warm: { p50: 300, p95: 800 }
        },
        // ... other thresholds
    },
    regressionThreshold: 0.10  // 10% regression threshold
};
```

### Environment-Specific Thresholds

Different environments may require different thresholds:

```bash
# Development environment (more lenient)
export PAMPAX_BENCH_THRESHOLD=0.20

# Production environment (strict)
export PAMPAX_BENCH_THRESHOLD=0.05
```

## Troubleshooting

### Common Issues

#### Benchmarks Time Out
```bash
# Increase Node.js memory limit
export NODE_OPTIONS="--max-old-space-size=8192"

# Increase timeout
export PAMPAX_BENCHMARK_TIMEOUT=600000  # 10 minutes
```

#### PAMPAX Integration Not Available
```bash
# Check if PAMPAX modules are available
node -e "console.log(require('./src/service.js'))"

# Build project first
npm run build
npm run bench:production
```

#### Memory Issues During Benchmarks
```bash
# Enable garbage collection
export NODE_OPTIONS="--expose-gc"

# Run with smaller corpus
export PAMPAX_CORPUS_SIZE=small
```

### Debug Mode

Enable detailed logging for troubleshooting:

```bash
# Enable debug logging
export DEBUG=pampax:benchmark*

# Run with verbose output
npm run bench:run -- --verbose
```

## Contributing

### Adding New Benchmarks

1. **Create benchmark function** in `ProductionBenchmarkRunner`:
```javascript
async runNewBenchmark(corpus) {
    // Implementation
}
```

2. **Add production gate criteria** to `BENCHMARK_CONFIG`:
```javascript
newBenchmark: {
    threshold: 1000  // ms
}
```

3. **Add validation** in test suite:
```javascript
test('Validate new benchmark', async () => {
    const results = testResults.results.medium.newBenchmark;
    assert.ok(results.stats.p50 <= 1000, 'Should meet threshold');
});
```

4. **Update CI workflow** if needed

### Performance Optimization

When optimizing PAMPAX performance:

1. **Run baseline benchmarks** before changes
2. **Make incremental changes** and test each one
3. **Use regression detection** to validate improvements
4. **Document optimizations** for future reference

## Best Practices

### Development Workflow
1. **Run quick benchmarks** during development (`npm run bench:production`)
2. **Check for regressions** before committing
3. **Run full suite** before PR creation
4. **Monitor CI results** for performance changes

### Performance Monitoring
1. **Set up daily benchmarks** in production-like environments
2. **Track trends** over time
3. **Investigate regressions** immediately
4. **Document performance improvements**

### CI/CD Integration
1. **Fail builds** on significant regressions
2. **Comment on PRs** with performance impact
3. **Store benchmark artifacts** for analysis
4. **Monitor trend data** for long-term patterns

## License

This benchmark suite is part of the PAMPAX project and follows the same license terms.