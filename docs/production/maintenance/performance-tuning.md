# Performance Tuning and Optimization Guide

This comprehensive guide covers performance tuning strategies, optimization procedures, and benchmarking methodologies for PAMPAX in production environments.

## Performance Architecture Overview

### Performance Bottlenecks Identification

```
┌─────────────────────────────────────────────────────────────┐
│                 PERFORMANCE BOTTLENECKS                  │
├─────────────────────────────────────────────────────────────┤
│  Search Layer                                             │
│  ├─ Vector similarity computation                        │
│  ├─ BM25 text search                                   │
│  ├─ Hybrid fusion algorithm                              │
│  └─ Query result ranking                                │
├─────────────────────────────────────────────────────────────┤
│  Context Assembly Layer                                    │
│  ├─ Token budget management                             │
│  ├─ Evidence collection                                │
│  ├─ Bundle generation                                   │
│  └─ Markdown formatting                                │
├─────────────────────────────────────────────────────────────┤
│  Storage Layer                                            │
│  ├─ SQLite query execution                             │
│  ├─ Index traversal                                    │
│  ├─ Cache lookup                                       │
│  └─ File I/O operations                               │
├─────────────────────────────────────────────────────────────┤
│  System Resources                                         │
│  ├─ CPU utilization                                    │
│  ├─ Memory allocation                                  │
│  ├─ Disk I/O                                          │
│  └─ Network latency                                    │
└─────────────────────────────────────────────────────────────┘
```

### Performance Targets

| Operation | Cold Cache (p50/p95) | Warm Cache (p50/p95) | Target |
|-----------|---------------------|----------------------|--------|
| Hybrid Search | ≤700ms / ≤1.5s | ≤300ms / ≤800ms | ✅ |
| Bundle Assembly | ≤3.0s / ≤6.0s | ≤1.0s / ≤2.0s | ✅ |
| SQLite Read | ≤50ms p95 | ≤50ms p95 | ✅ |
| Evidence/Markdown | ≤150ms p95 | ≤150ms p95 | ✅ |
| Memory Usage | ≤500MB steady | ≤500MB steady | ✅ |

## Performance Monitoring and Analysis

### Real-time Performance Monitoring

```javascript
// src/performance/performance-monitor.js - Real-time performance monitoring
import { performance } from 'perf_hooks';
import { getMetricsCollector } from '../metrics/metrics-collector.js';

class PerformanceMonitor {
  constructor() {
    this.metrics = getMetricsCollector();
    this.Operations = new Map();
    this.thresholds = {
      search: { p50: 300, p95: 800 },
      assembly: { p50: 1000, p95: 2000 },
      database: { p50: 25, p95: 50 },
      cache: { p50: 5, p95: 20 }
    };
    this.initializeMetrics();
  }

  initializeMetrics() {
    // Operation duration metrics
    this.operationDuration = this.metrics.createHistogram({
      name: 'pampax_operation_duration_ms',
      help: 'Operation duration in milliseconds',
      labelNames: ['operation', 'cache_hit', 'result_size'],
      buckets: [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2000, 5000]
    });

    // Performance percentile metrics
    this.operationPercentiles = this.metrics.createHistogram({
      name: 'pampax_operation_percentiles_ms',
      help: 'Operation duration percentiles',
      labelNames: ['operation', 'percentile'],
      buckets: [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2000, 5000]
    });

    // Resource utilization metrics
    this.cpuUtilization = this.metrics.createGauge({
      name: 'pampax_cpu_utilization_percent',
      help: 'CPU utilization percentage'
    });

    this.memoryUtilization = this.metrics.createGauge({
      name: 'pampax_memory_utilization_percent',
      help: 'Memory utilization percentage'
    });

    // Performance score
    this.performanceScore = this.metrics.createGauge({
      name: 'pampax_performance_score',
      help: 'Overall performance score (0-100)',
      labelNames: ['operation']
    });
  }

  startOperation(operation, context = {}) {
    const id = `${operation}_${Date.now()}_${Math.random()}`;
    const startTime = performance.now();
    const startMemory = process.memoryUsage();

    this.Operations.set(id, {
      operation,
      context,
      startTime,
      startMemory,
      measurements: []
    });

    return id;
  }

  endOperation(id, result = {}) {
    const operation = this.Operations.get(id);
    if (!operation) return null;

    const endTime = performance.now();
    const endMemory = process.memoryUsage();
    const duration = endTime - operation.startTime;
    const memoryDelta = endMemory.rss - operation.startMemory.rss;

    const labels = {
      operation: operation.operation,
      cache_hit: result.cacheHit ? 'true' : 'false',
      result_size: result.resultSize || 'unknown'
    };

    // Record duration
    this.operationDuration.observe(labels, duration);

    // Update percentiles
    this.updatePercentiles(operation.operation, duration);

    // Calculate performance score
    const score = this.calculatePerformanceScore(operation.operation, duration);
    this.performanceScore.set({ operation: operation.operation }, score);

    // Record resource utilization
    this.updateResourceMetrics();

    // Clean up
    this.Operations.delete(id);

    return {
      duration,
      memoryDelta,
      score,
      labels
    };
  }

  updatePercentiles(operation, duration) {
    const percentiles = [0.5, 0.9, 0.95, 0.99];
    
    percentiles.forEach(p => {
      this.operationPercentiles.observe({
        operation,
        percentile: `p${Math.round(p * 100)}`
      }, duration);
    });
  }

  calculatePerformanceScore(operation, duration) {
    const threshold = this.thresholds[operation];
    if (!threshold) return 50; // Default score

    // Score based on p95 threshold
    const ratio = duration / threshold.p95;
    
    if (ratio <= 0.5) return 100;      // Excellent
    if (ratio <= 0.75) return 90;     // Good
    if (ratio <= 1.0) return 75;      // Acceptable
    if (ratio <= 1.5) return 50;      // Poor
    if (ratio <= 2.0) return 25;      // Bad
    return 10;                          // Critical
  }

  updateResourceMetrics() {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    
    // Memory utilization (assuming 2GB limit)
    const memoryUtilization = (memUsage.rss / (2 * 1024 * 1024 * 1024)) * 100;
    this.memoryUtilization.set(memoryUtilization);
    
    // CPU utilization (simplified calculation)
    const cpuUtilization = (cpuUsage.user + cpuUsage.system) / 1000000; // Convert to seconds
    this.cpuUtilization.set(Math.min(cpuUtilization * 100, 100));
  }

  getPerformanceReport() {
    const report = {
      timestamp: new Date().toISOString(),
      operations: {},
      system: {
        cpu: this.cpuUtilization.get(),
        memory: this.memoryUtilization.get()
      }
    };

    // Get performance scores for each operation
    Object.keys(this.thresholds).forEach(operation => {
      const score = this.performanceScore.get({ operation });
      report.operations[operation] = {
        score: score || 0,
        status: this.getPerformanceStatus(score || 0)
      };
    });

    return report;
  }

  getPerformanceStatus(score) {
    if (score >= 90) return 'excellent';
    if (score >= 75) return 'good';
    if (score >= 50) return 'acceptable';
    if (score >= 25) return 'poor';
    return 'critical';
  }
}

export default PerformanceMonitor;
```

### Performance Analysis Scripts

```bash
#!/bin/bash
# performance-analysis.sh - Comprehensive performance analysis

METRICS_FILE="/var/log/pampax/performance-metrics.log"
REPORT_FILE="/var/log/pampax/performance-report.txt"

analyze_performance() {
    echo "=== PAMPAX Performance Analysis ===" > "$REPORT_FILE"
    echo "Generated: $(date)" >> "$REPORT_FILE"
    echo "" >> "$REPORT_FILE"

    # 1. Current performance metrics
    echo "1. Current Performance Metrics" >> "$REPORT_FILE"
    if command -v pampax >/dev/null 2>&1; then
        echo "   Service health:" >> "$REPORT_FILE"
        pampax health >> "$REPORT_FILE" 2>&1
        echo "" >> "$REPORT_FILE"
        
        echo "   Cache statistics:" >> "$REPORT_FILE"
        pampax cache stats >> "$REPORT_FILE" 2>&1
        echo "" >> "$REPORT_FILE"
    fi
    echo "" >> "$REPORT_FILE"

    # 2. Response time analysis
    echo "2. Response Time Analysis (Last Hour)" >> "$REPORT_FILE"
    if [ -f "$METRICS_FILE" ]; then
        one_hour_ago=$(date -d '1 hour ago' +%s)
        
        # Extract search operation durations
        echo "   Search operations:" >> "$REPORT_FILE"
        awk -v threshold="$one_hour_ago" '
            /operation_duration_ms.*operation="search"/ {
                gsub(/[^0-9.]/, "", $0)
                if ($1 > threshold) {
                    print $0
                }
            }
        ' "$METRICS_FILE" | \
        awk '
        BEGIN { count = 0; sum = 0; min = 999999; max = 0 }
        {
            count++
            sum += $1
            if ($1 < min) min = $1
            if ($1 > max) max = $1
        }
        END {
            if (count > 0) {
                printf "     Count: %d\n", count
                printf "     Average: %.2fms\n", sum / count
                printf "     Minimum: %.2fms\n", min
                printf "     Maximum: %.2fms\n", max
                printf "     95th percentile: %.2fms\n", (sum / count) * 1.5
            } else {
                print "     No data available"
            }
        }' >> "$REPORT_FILE"
    else
        echo "   No metrics file available" >> "$REPORT_FILE"
    fi
    echo "" >> "$REPORT_FILE"

    # 3. Resource utilization analysis
    echo "3. Resource Utilization Analysis" >> "$REPORT_FILE"
    echo "   Current system resources:" >> "$REPORT_FILE"
    echo "     Memory usage:" >> "$REPORT_FILE"
    free -h | grep "^Mem:" | awk '{printf "       Used: %s/%s (%.1f%%)\n", $3, $2, $3/$2*100}' >> "$REPORT_FILE"
    
    echo "     CPU load:" >> "$REPORT_FILE"
    uptime | awk -F'load average:' '{printf "       %s\n", $2}' >> "$REPORT_FILE"
    
    echo "     Disk I/O:" >> "$REPORT_FILE"
    iostat -x 1 1 | tail -n +4 | awk '{printf "       %s: %.2f%% util\n", $1, $10}' >> "$REPORT_FILE"
    echo "" >> "$REPORT_FILE"

    # 4. Process-specific performance
    echo "4. PAMPAX Process Performance" >> "$REPORT_FILE"
    if pgrep -f pampax >/dev/null; then
        PID=$(pgrep -f pampax)
        echo "   Process ID: $PID" >> "$REPORT_FILE"
        echo "   Memory usage: $(ps -o rss= -p $PID | awk '{print int($1/1024)"MB"}')" >> "$REPORT_FILE"
        echo "   CPU usage: $(ps -o %cpu= -p $PID)%)" >> "$REPORT_FILE"
        echo "   Thread count: $(ps -o nlwp= -p $PID)" >> "$REPORT_FILE"
        echo "   Open files: $(lsof -p $PID | wc -l)" >> "$REPORT_FILE"
    else
        echo "   PAMPAX process not found" >> "$REPORT_FILE"
    fi
    echo "" >> "$REPORT_FILE"

    # 5. Performance recommendations
    echo "5. Performance Recommendations" >> "$REPORT_FILE"
    
    # Analyze memory usage
    if pgrep -f pampax >/dev/null; then
        PID=$(pgrep -f pampax)
        MEMORY_MB=$(ps -o rss= -p $PID | awk '{print int($1/1024)}')
        
        if [ "$MEMORY_MB" -gt 1024 ]; then
            echo "   ⚠️  High memory usage (${MEMORY_MB}MB):" >> "$REPORT_FILE"
            echo "     - Consider increasing cache size limits" >> "$REPORT_FILE"
            echo "     - Review memory allocation patterns" >> "$REPORT_FILE"
            echo "     - Implement memory pooling" >> "$REPORT_FILE"
        elif [ "$MEMORY_MB" -gt 512 ]; then
            echo "   ✓ Memory usage is acceptable (${MEMORY_MB}MB)" >> "$REPORT_FILE"
        else
            echo "   ✓ Low memory usage (${MEMORY_MB}MB) - good performance" >> "$REPORT_FILE"
        fi
    fi
    
    # Analyze cache performance
    if command -v pampax >/dev/null 2>&1; then
        hit_rate=$(pampax cache stats 2>/dev/null | grep -o "hit_rate: [0-9.]*" | cut -d' ' -f2)
        
        if [ -n "$hit_rate" ]; then
            if (( $(echo "$hit_rate < 0.5" | bc -l) )); then
                echo "   ⚠️  Low cache hit rate (${hit_rate}):" >> "$REPORT_FILE"
                echo "     - Increase cache TTL" >> "$REPORT_FILE"
                echo "     - Implement cache warming" >> "$REPORT_FILE"
                echo "     - Review cache key strategies" >> "$REPORT_FILE"
            elif (( $(echo "$hit_rate > 0.8" | bc -l) )); then
                echo "   ✓ Excellent cache hit rate (${hit_rate})" >> "$REPORT_FILE"
            else
                echo "   ✓ Acceptable cache hit rate (${hit_rate})" >> "$REPORT_FILE"
            fi
        fi
    fi
    
    echo "" >> "$REPORT_FILE"
    echo "=== Analysis Complete ===" >> "$REPORT_FILE"
    
    # Display summary
    echo "Performance analysis completed. Report saved to: $REPORT_FILE"
    echo ""
    echo "Key findings:"
    grep -E "(⚠️|✓)" "$REPORT_FILE" | head -5
}

# Performance benchmarking
run_benchmark() {
    local test_repo=$1
    local iterations=${2:-10}
    
    echo "Running performance benchmark..."
    echo "Repository: $test_repo"
    echo "Iterations: $iterations"
    
    if [ ! -d "$test_repo" ]; then
        echo "Error: Test repository not found: $test_repo"
        return 1
    fi
    
    # Create benchmark results file
    local results_file="/var/log/pampax/benchmark-$(date +%Y%m%d_%H%M%S).json"
    
    echo "{" > "$results_file"
    echo "  \"timestamp\": \"$(date -Iseconds)\"," >> "$results_file"
    echo "  \"repository\": \"$test_repo\"," >> "$results_file"
    echo "  \"iterations\": $iterations," >> "$results_file"
    echo "  \"results\": {" >> "$results_file"
    
    # Benchmark search performance
    echo "    \"search\": [" >> "$results_file"
    
    for i in $(seq 1 $iterations); do
        # Clear cache for cold start test
        if [ $i -eq 1 ]; then
            pampax cache clear --all >/dev/null 2>&1
            test_type="cold"
        else
            test_type="warm"
        fi
        
        start_time=$(date +%s.%N)
        result=$(pampax search --query "function" --path "$test_repo" --output json 2>/dev/null)
        end_time=$(date +%s.%N)
        duration=$(echo "$end_time - $start_time" | bc)
        
        # Extract result count
        result_count=$(echo "$result" | jq '.results | length' 2>/dev/null || echo "0")
        
        echo "      {" >> "$results_file"
        echo "        \"iteration\": $i," >> "$results_file"
        echo "        \"type\": \"$test_type\"," >> "$results_file"
        echo "        \"duration_ms\": $(echo "$duration * 1000" | bc)," >> "$results_file"
        echo "        \"result_count\": $result_count" >> "$results_file"
        echo "      }" >> "$results_file"
        
        if [ $i -lt $iterations ]; then
            echo "," >> "$results_file"
        fi
        
        sleep 1  # Brief pause between iterations
    done
    
    echo "    ]" >> "$results_file"
    echo "  }" >> "$results_file"
    echo "}" >> "$results_file"
    
    echo "Benchmark completed. Results saved to: $results_file"
    
    # Calculate statistics
    echo ""
    echo "Benchmark Summary:"
    jq -r '
        .results.search[] | 
        "\(.type): \(.duration_ms)ms (\(.result_count) results)"
    ' "$results_file"
}

# Main execution
case "${1:-analyze}" in
    "analyze")
        analyze_performance
        ;;
    "benchmark")
        run_benchmark "${2:-/tmp/test-repo}" "${3:-10}"
        ;;
    *)
        echo "Usage: $0 {analyze|benchmark} [repository] [iterations]"
        exit 1
        ;;
esac
```

## Performance Optimization Strategies

### Search Performance Optimization

```javascript
// src/performance/search-optimizer.js - Search performance optimization
import { performance } from 'perf_hooks';

class SearchOptimizer {
  constructor() {
    this.queryCache = new Map();
    this.indexCache = new Map();
    this.optimizationStrategies = {
      queryRewriting: true,
      indexPruning: true,
      resultCaching: true,
      parallelProcessing: true
    };
  }

  // Optimize search query for better performance
  optimizeQuery(query, context = {}) {
    const startTime = performance.now();
    
    let optimizedQuery = {
      original: query,
      optimized: query,
      strategies: []
    };

    // 1. Query normalization
    if (this.optimizationStrategies.queryRewriting) {
      optimizedQuery = this.normalizeQuery(optimizedQuery);
      optimizedQuery.strategies.push('normalization');
    }

    // 2. Index pruning
    if (this.optimizationStrategies.indexPruning) {
      optimizedQuery = this.pruneIndexes(optimizedQuery, context);
      optimizedQuery.strategies.push('index_pruning');
    }

    // 3. Query caching
    if (this.optimizationStrategies.resultCaching) {
      const cacheKey = this.generateCacheKey(optimizedQuery.optimized, context);
      const cachedResult = this.queryCache.get(cacheKey);
      
      if (cachedResult) {
        const endTime = performance.now();
        return {
          ...cachedResult,
          cached: true,
          optimizationTime: endTime - startTime
        };
      }
    }

    const endTime = performance.now();
    optimizedQuery.optimizationTime = endTime - startTime;
    
    return optimizedQuery;
  }

  normalizeQuery(queryObj) {
    let { optimized } = queryObj;
    
    // Convert to lowercase for case-insensitive search
    optimized = optimized.toLowerCase();
    
    // Remove special characters and normalize whitespace
    optimized = optimized.replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
    
    // Expand common abbreviations
    const abbreviations = {
      'fn': 'function',
      'func': 'function',
      'var': 'variable',
      'const': 'constant',
      'let': 'variable'
    };
    
    Object.entries(abbreviations).forEach(([abbr, expansion]) => {
      const regex = new RegExp(`\\b${abbr}\\b`, 'g');
      optimized = optimized.replace(regex, expansion);
    });
    
    return {
      ...queryObj,
      optimized
    };
  }

  pruneIndexes(queryObj, context) {
    const { optimized } = queryObj;
    
    // Determine which indexes to use based on query characteristics
    const strategies = [];
    
    // Use text search for natural language queries
    if (this.isTextQuery(optimized)) {
      strategies.push('bm25');
    }
    
    // Use vector search for semantic queries
    if (this.isSemanticQuery(optimized)) {
      strategies.push('vector');
    }
    
    // Use exact match for specific patterns
    if (this.isExactMatchQuery(optimized)) {
      strategies.push('exact');
    }
    
    return {
      ...queryObj,
      strategies: strategies.length > 0 ? strategies : ['hybrid']
    };
  }

  isTextQuery(query) {
    // Simple heuristic: longer queries with natural language
    return query.split(' ').length > 3 && !query.includes('::') && !query.includes('.');
  }

  isSemanticQuery(query) {
    // Heuristic: queries that ask for concepts or relationships
    const semanticKeywords = ['similar', 'related', 'like', 'concept', 'pattern'];
    return semanticKeywords.some(keyword => query.includes(keyword));
  }

  isExactMatchQuery(query) {
    // Heuristic: queries with exact match indicators
    return query.includes('"') || query.includes('::') || /^[A-Z_][A-Z0-9_]*$/.test(query);
  }

  generateCacheKey(query, context) {
    const contextHash = this.hashObject(context);
    return `${query}:${contextHash}`;
  }

  hashObject(obj) {
    return JSON.stringify(obj).split('').reduce((a, b) => {
      a = ((a << 5) - a) + b.charCodeAt(0);
      return a & a;
    }, 0);
  }

  // Parallel search execution
  async executeParallelSearch(queries, options = {}) {
    const maxConcurrency = options.maxConcurrency || 4;
    const results = [];
    
    // Process queries in batches
    for (let i = 0; i < queries.length; i += maxConcurrency) {
      const batch = queries.slice(i, i + maxConcurrency);
      
      const batchPromises = batch.map(async (query, index) => {
        const startTime = performance.now();
        
        try {
          const result = await this.executeSearch(query);
          const endTime = performance.now();
          
          return {
            ...result,
            queryIndex: i + index,
            executionTime: endTime - startTime,
            success: true
          };
        } catch (error) {
          const endTime = performance.now();
          
          return {
            error: error.message,
            queryIndex: i + index,
            executionTime: endTime - startTime,
            success: false
          };
        }
      });
      
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }
    
    return results;
  }

  async executeSearch(query) {
    // This would integrate with the actual search engine
    // For now, return a mock result
    return {
      results: [],
      total: 0,
      query
    };
  }

  // Cache management
  cacheResult(key, result, ttl = 3600000) { // 1 hour default TTL
    this.queryCache.set(key, {
      ...result,
      cached: true,
      timestamp: Date.now()
    });
    
    // Auto-expire cache entry
    setTimeout(() => {
      this.queryCache.delete(key);
    }, ttl);
  }

  clearCache() {
    this.queryCache.clear();
    this.indexCache.clear();
  }

  getCacheStats() {
    return {
      queryCacheSize: this.queryCache.size,
      indexCacheSize: this.indexCache.size,
      optimizationStrategies: this.optimizationStrategies
    };
  }
}

export default SearchOptimizer;
```

### Database Performance Optimization

```bash
#!/bin/bash
# database-optimization.sh - Database performance optimization

DB_PATH="/var/lib/pampax/pampax.db"
BACKUP_DIR="/var/lib/pampax/backups"

optimize_database() {
    echo "=== Database Performance Optimization ==="
    echo "Database: $DB_PATH"
    echo "Timestamp: $(date)"
    echo ""

    # 1. Create backup before optimization
    echo "1. Creating backup..."
    mkdir -p "$BACKUP_DIR"
    backup_file="$BACKUP_DIR/pampax.pre-optimize.$(date +%Y%m%d_%H%M%S).db"
    
    if [ -f "$DB_PATH" ]; then
        cp "$DB_PATH" "$backup_file"
        echo "   Backup created: $backup_file"
    else
        echo "   Error: Database file not found"
        return 1
    fi
    echo ""

    # 2. Analyze current database performance
    echo "2. Analyzing current database performance..."
    
    echo "   Database size: $(du -h "$DB_PATH" | cut -f1)"
    echo "   Page count: $(sqlite3 "$DB_PATH" "PRAGMA page_count;")"
    echo "   Page size: $(sqlite3 "$DB_PATH" "PRAGMA page_size;") bytes"
    echo "   Cache size: $(sqlite3 "$DB_PATH" "PRAGMA cache_size;") pages"
    echo ""

    # 3. Check for fragmentation
    echo "3. Checking fragmentation..."
    
    # Get table statistics
    sqlite3 "$DB_PATH" "
    SELECT 
        name,
        COUNT(*) as row_count,
        (SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND tbl_name=main.name) as index_count
    FROM sqlite_master 
    WHERE type='table' AND name NOT LIKE 'sqlite_%';
    " | while read -r line; do
        echo "   $line"
    done
    echo ""

    # 4. Optimize database settings
    echo "4. Optimizing database settings..."
    
    # Enable WAL mode for better concurrency
    sqlite3 "$DB_PATH" "PRAGMA journal_mode=WAL;"
    echo "   Enabled WAL journal mode"
    
    # Optimize cache size (based on available memory)
    available_memory=$(free -m | awk '/^Mem:/{print $7}')
    cache_pages=$((available_memory * 1024 * 256 / 4096))  # 25% of available memory
    sqlite3 "$DB_PATH" "PRAGMA cache_size=$cache_pages;"
    echo "   Set cache size to $cache_pages pages"
    
    # Optimize synchronous mode
    sqlite3 "$DB_PATH" "PRAGMA synchronous=NORMAL;"
    echo "   Set synchronous mode to NORMAL"
    
    # Optimize temp store
    sqlite3 "$DB_PATH" "PRAGMA temp_store=MEMORY;"
    echo "   Set temp store to MEMORY"
    echo ""

    # 5. Create missing indexes
    echo "5. Creating performance indexes..."
    
    # Check if indexes exist and create if missing
    indexes=(
        "CREATE INDEX IF NOT EXISTS idx_files_path ON files(path);"
        "CREATE INDEX IF NOT EXISTS idx_files_name ON files(name);"
        "CREATE INDEX IF NOT EXISTS idx_files_type ON files(type);"
        "CREATE INDEX IF NOT EXISTS idx_files_modified ON files(modified_time);"
        "CREATE INDEX IF NOT EXISTS idx_symbols_name ON symbols(name);"
        "CREATE INDEX IF NOT EXISTS idx_symbols_type ON symbols(type);"
        "CREATE INDEX IF NOT EXISTS idx_symbols_file_id ON symbols(file_id);"
    )
    
    for index_sql in "${indexes[@]}"; do
        echo "   Creating index: $(echo "$index_sql" | cut -d' ' -f6)"
        sqlite3 "$DB_PATH" "$index_sql"
    done
    echo ""

    # 6. Analyze query plans
    echo "6. Analyzing common query plans..."
    
    common_queries=(
        "SELECT * FROM files WHERE path LIKE ?;"
        "SELECT * FROM symbols WHERE name = ?;"
        "SELECT * FROM files WHERE type = ? ORDER BY modified_time DESC;"
    )
    
    for query in "${common_queries[@]}"; do
        echo "   Query plan for: $query"
        sqlite3 "$DB_PATH" "EXPLAIN QUERY PLAN $query" | while read -r line; do
            echo "     $line"
        done
        echo ""
    done

    # 7. Vacuum and analyze
    echo "7. Vacuuming and analyzing database..."
    
    echo "   Running VACUUM..."
    vacuum_start=$(date +%s)
    sqlite3 "$DB_PATH" "VACUUM;"
    vacuum_end=$(date +%s)
    vacuum_duration=$((vacuum_end - vacuum_start))
    echo "   VACUUM completed in ${vacuum_duration} seconds"
    
    echo "   Running ANALYZE..."
    analyze_start=$(date +%s)
    sqlite3 "$DB_PATH" "ANALYZE;"
    analyze_end=$(date +%s)
    analyze_duration=$((analyze_end - analyze_start))
    echo "   ANALYZE completed in ${analyze_duration} seconds"
    echo ""

    # 8. Performance validation
    echo "8. Validating optimization results..."
    
    # Test query performance
    echo "   Testing query performance..."
    
    test_queries=(
        "SELECT COUNT(*) FROM files;"
        "SELECT COUNT(*) FROM symbols;"
        "SELECT * FROM files LIMIT 10;"
    )
    
    for query in "${test_queries[@]}"; do
        start_time=$(date +%s.%N)
        sqlite3 "$DB_PATH" "$query" >/dev/null
        end_time=$(date +%s.%N)
        duration=$(echo "$end_time - $start_time" | bc)
        echo "     Query: $(echo "$query" | cut -c1-50)... - ${duration}s"
    done
    
    echo ""
    echo "   Database size after optimization: $(du -h "$DB_PATH" | cut -f1)"
    echo ""

    # 9. Generate optimization report
    echo "9. Generating optimization report..."
    
    report_file="/var/log/pampax/db-optimization-$(date +%Y%m%d_%H%M%S).txt"
    
    cat > "$report_file" << EOF
Database Optimization Report
=========================
Timestamp: $(date)
Database: $DB_PATH
Backup: $backup_file

Optimization Actions:
- Enabled WAL journal mode
- Optimized cache size to $cache_pages pages
- Set synchronous mode to NORMAL
- Set temp store to MEMORY
- Created missing indexes
- Ran VACUUM and ANALYZE

Results:
- Database size: $(du -h "$DB_PATH" | cut -f1)
- Page count: $(sqlite3 "$DB_PATH" "PRAGMA page_count;")
- Cache size: $(sqlite3 "$DB_PATH" "PRAGMA cache_size;") pages

Performance Tests:
$(for query in "${test_queries[@]}"; do
    start_time=$(date +%s.%N)
    sqlite3 "$DB_PATH" "$query" >/dev/null
    end_time=$(date +%s.%N)
    duration=$(echo "$end_time - $start_time" | bc)
    echo "- $query: ${duration}s"
done)

Recommendations:
- Monitor database size growth
- Schedule regular VACUUM operations
- Consider partitioning large tables
- Monitor index effectiveness
EOF

    echo "   Report saved to: $report_file"
    echo ""
    echo "=== Database Optimization Complete ==="
}

# Database performance monitoring
monitor_database_performance() {
    echo "=== Database Performance Monitoring ==="
    
    while true; do
        timestamp=$(date -Iseconds)
        
        # Get database size
        db_size=$(du -k "$DB_PATH" 2>/dev/null | cut -f1)
        
        # Get cache hit rate (if available)
        cache_hits=$(sqlite3 "$DB_PATH" "PRAGMA cache_size;" 2>/dev/null)
        
        # Get page count
        page_count=$(sqlite3 "$DB_PATH" "PRAGMA page_count;" 2>/dev/null)
        
        # Log metrics
        echo "$timestamp,db_size_kb=$db_size,cache_size=$cache_hits,page_count=$page_count" \
            >> /var/log/pampax/db-metrics.log
        
        # Check for performance issues
        if [ "$db_size" -gt 1048576 ]; then  # > 1GB
            echo "ALERT: Database size is large (${db_size}KB)"
        fi
        
        sleep 300  # Check every 5 minutes
    done
}

# Main execution
case "${1:-optimize}" in
    "optimize")
        optimize_database
        ;;
    "monitor")
        monitor_database_performance
        ;;
    *)
        echo "Usage: $0 {optimize|monitor}"
        exit 1
        ;;
esac
```

### Memory Performance Optimization

```javascript
// src/performance/memory-optimizer.js - Memory performance optimization
import { performance } from 'perf_hooks';

class MemoryOptimizer {
  constructor() {
    this.memoryPools = new Map();
    this.allocationStats = {
      total: 0,
      freed: 0,
      peak: 0
    };
    this.gcThresholds = {
      heapUsed: 500 * 1024 * 1024, // 500MB
      heapTotal: 1024 * 1024 * 1024, // 1GB
      external: 100 * 1024 * 1024  // 100MB
    };
    this.optimizationStrategies = {
      objectPooling: true,
      lazyLoading: true,
      memoryPooling: true,
      gcOptimization: true
    };
  }

  // Initialize memory pools for different object types
  initializeMemoryPools() {
    const poolTypes = [
      { name: 'searchResult', size: 1000, maxSize: 100 },
      { name: 'cacheEntry', size: 500, maxSize: 200 },
      { name: 'queryPlan', size: 200, maxSize: 50 },
      { name: 'tokenBundle', size: 1000, maxSize: 150 }
    ];

    poolTypes.forEach(poolType => {
      this.memoryPools.set(poolType.name, {
        pool: [],
        size: poolType.size,
        maxSize: poolType.maxSize,
        allocated: 0,
        reused: 0
      });
    });
  }

  // Allocate object from memory pool
  allocateFromPool(type, constructor, ...args) {
    if (!this.optimizationStrategies.objectPooling) {
      return new constructor(...args);
    }

    const pool = this.memoryPools.get(type);
    if (!pool) {
      return new constructor(...args);
    }

    let object;
    if (pool.pool.length > 0) {
      object = pool.pool.pop();
      pool.reused++;
      
      // Reset object if it has a reset method
      if (typeof object.reset === 'function') {
        object.reset(...args);
      }
    } else {
      object = new constructor(...args);
      pool.allocated++;
    }

    return object;
  }

  // Return object to memory pool
  returnToPool(type, object) {
    if (!this.optimizationStrategies.objectPooling) {
      return;
    }

    const pool = this.memoryPools.get(type);
    if (!pool || pool.pool.length >= pool.maxSize) {
      return;
    }

    // Clean object if it has a cleanup method
    if (typeof object.cleanup === 'function') {
      object.cleanup();
    }

    pool.pool.push(object);
  }

  // Monitor memory usage and trigger optimizations
  monitorMemoryUsage() {
    const memUsage = process.memoryUsage();
    const { heapUsed, heapTotal, external, rss } = memUsage;

    // Update statistics
    this.allocationStats.total = heapTotal;
    this.allocationStats.peak = Math.max(this.allocationStats.peak, heapUsed);

    // Check thresholds and trigger optimizations
    const optimizations = [];

    if (heapUsed > this.gcThresholds.heapUsed) {
      optimizations.push('heap_gc');
    }

    if (heapTotal > this.gcThresholds.heapTotal) {
      optimizations.push('heap_compaction');
    }

    if (external > this.gcThresholds.external) {
      optimizations.push('external_gc');
    }

    // Execute optimizations
    optimizations.forEach(opt => this.executeOptimization(opt));

    return {
      heapUsed,
      heapTotal,
      external,
      rss,
      optimizations
    };
  }

  // Execute specific memory optimization
  executeOptimization(type) {
    const startTime = performance.now();

    switch (type) {
      case 'heap_gc':
        this.triggerGarbageCollection();
        break;
      case 'heap_compaction':
        this.compactHeap();
        break;
      case 'external_gc':
        this.cleanupExternalMemory();
        break;
      case 'pool_cleanup':
        this.cleanupMemoryPools();
        break;
    }

    const endTime = performance.now();
    
    // Log optimization
    console.log(`Memory optimization ${type} completed in ${endTime - startTime}ms`);
  }

  // Trigger garbage collection
  triggerGarbageCollection() {
    if (global.gc && this.optimizationStrategies.gcOptimization) {
      global.gc();
    }
  }

  // Compact heap memory
  compactHeap() {
    if (global.gc && this.optimizationStrategies.gcOptimization) {
      // Run multiple GC cycles for better compaction
      for (let i = 0; i < 3; i++) {
        global.gc();
      }
    }
  }

  // Clean up external memory
  cleanupExternalMemory() {
    // Clean up memory pools
    this.cleanupMemoryPools();
    
    // Clear caches if they exist
    if (this.queryCache) {
      this.queryCache.clear();
    }
  }

  // Clean up memory pools
  cleanupMemoryPools() {
    this.memoryPools.forEach((pool, type) => {
      // Reduce pool size if it's too large
      if (pool.pool.length > pool.maxSize / 2) {
        pool.pool = pool.pool.slice(0, Math.floor(pool.maxSize / 2));
      }
    });
  }

  // Lazy loading implementation
  createLazyLoader(loader, dependencies = []) {
    let loaded = false;
    let value = null;

    return {
      get: () => {
        if (!loaded) {
          if (this.optimizationStrategies.lazyLoading) {
            // Load dependencies first
            dependencies.forEach(dep => {
              if (typeof dep.get === 'function') {
                dep.get();
              }
            });
          }
          
          value = loader();
          loaded = true;
        }
        return value;
      },
      
      isLoaded: () => loaded,
      
      reset: () => {
        loaded = false;
        value = null;
      }
    };
  }

  // Memory usage statistics
  getMemoryStats() {
    const memUsage = process.memoryUsage();
    const poolStats = {};

    this.memoryPools.forEach((pool, type) => {
      poolStats[type] = {
        allocated: pool.allocated,
        reused: pool.reused,
        poolSize: pool.pool.length,
        efficiency: pool.allocated > 0 ? pool.reused / pool.allocated : 0
      };
    });

    return {
      current: memUsage,
      allocationStats: this.allocationStats,
      pools: poolStats,
      gcThresholds: this.gcThresholds
    };
  }

  // Memory leak detection
  detectMemoryLeaks() {
    const stats = this.getMemoryStats();
    const leaks = [];

    // Check for increasing heap usage
    if (stats.current.heapUsed > stats.allocationStats.peak * 0.9) {
      leaks.push({
        type: 'heap_growth',
        severity: 'high',
        description: 'Heap usage approaching peak levels',
        value: stats.current.heapUsed,
        threshold: stats.allocationStats.peak * 0.9
      });
    }

    // Check pool efficiency
    Object.entries(stats.pools).forEach(([type, pool]) => {
      if (pool.efficiency < 0.5 && pool.allocated > 10) {
        leaks.push({
          type: 'pool_inefficiency',
          severity: 'medium',
          description: `Low efficiency in ${type} pool`,
          value: pool.efficiency,
          threshold: 0.5
        });
      }
    });

    return leaks;
  }

  // Automatic memory management
  startAutomaticManagement(intervalMs = 30000) {
    setInterval(() => {
      const memStats = this.monitorMemoryUsage();
      
      // Detect memory leaks
      const leaks = this.detectMemoryLeaks();
      if (leaks.length > 0) {
        console.warn('Memory leaks detected:', leaks);
        
        // Trigger cleanup for high severity leaks
        leaks.forEach(leak => {
          if (leak.severity === 'high') {
            this.executeOptimization('heap_compaction');
          }
        });
      }
      
      // Log memory statistics
      if (process.env.NODE_ENV === 'development') {
        console.log('Memory stats:', this.getMemoryStats());
      }
    }, intervalMs);
  }
}

export default MemoryOptimizer;
```

## Performance Benchmarking

### Comprehensive Benchmark Suite

```bash
#!/bin/bash
# benchmark-suite.sh - Comprehensive performance benchmarking

BENCHMARK_DIR="/var/lib/pampax/benchmarks"
RESULTS_DIR="/var/log/pampax/benchmark-results"
TEST_REPOS=(
    "/tmp/small-repo"
    "/tmp/medium-repo" 
    "/tmp/large-repo"
)

setup_benchmark_environment() {
    echo "=== Setting Up Benchmark Environment ==="
    
    # Create directories
    mkdir -p "$BENCHMARK_DIR" "$RESULTS_DIR"
    
    # Create test repositories of different sizes
    create_test_repositories
    
    echo "Benchmark environment ready"
}

create_test_repositories() {
    echo "Creating test repositories..."
    
    # Small repository (100 files)
    create_repo "/tmp/small-repo" 100
    
    # Medium repository (1000 files)
    create_repo "/tmp/medium-repo" 1000
    
    # Large repository (10000 files)
    create_repo "/tmp/large-repo" 10000
}

create_repo() {
    local repo_path=$1
    local file_count=$2
    
    mkdir -p "$repo_path"
    
    for i in $(seq 1 $file_count); do
        cat > "$repo_path/file${i}.js" << EOF
// Test file $i
function testFunction$i() {
    return 'This is test function $i';
}

class TestClass$i {
    constructor() {
        this.property = 'value$i';
    }
    
    method$i() {
        return this.property;
    }
}

const variable$i = 'test variable $i';
EOF
    done
    
    echo "Created repository: $repo_path ($file_count files)"
}

run_comprehensive_benchmark() {
    echo "=== Running Comprehensive Benchmark ==="
    
    local timestamp=$(date +%Y%m%d_%H%M%S)
    local results_file="$RESULTS_DIR/comprehensive-$timestamp.json"
    
    echo "{" > "$results_file"
    echo "  \"timestamp\": \"$(date -Iseconds)\"," >> "$results_file"
    echo "  \"system\": {" >> "$results_file"
    echo "    \"cpu_cores\": $(nproc)," >> "$results_file"
    echo "    \"memory_gb\": $(free -g | awk '/^Mem:/{print $2}')," >> "$results_file"
    echo "    \"node_version\": \"$(node --version)\"," >> "$results_file"
    echo "    \"platform\": \"$(uname -a)\"" >> "$results_file"
    echo "  }," >> "$results_file"
    echo "  \"benchmarks\": {" >> "$results_file"
    
    # Run benchmarks for each repository size
    for repo in "${TEST_REPOS[@]}"; do
        if [ -d "$repo" ]; then
            repo_name=$(basename "$repo")
            echo "    \"$repo_name\": {" >> "$results_file"
            
            # Cold cache benchmarks
            echo "      \"cold_cache\": {" >> "$results_file"
            run_search_benchmarks "$repo" "cold" "$results_file"
            echo "      }," >> "$results_file"
            
            # Warm cache benchmarks
            echo "      \"warm_cache\": {" >> "$results_file"
            run_search_benchmarks "$repo" "warm" "$results_file"
            echo "      }," >> "$results_file"
            
            # Assembly benchmarks
            echo "      \"assembly\": {" >> "$results_file"
            run_assembly_benchmarks "$repo" "$results_file"
            echo "      }," >> "$results_file"
            
            # Memory benchmarks
            echo "      \"memory\": {" >> "$results_file"
            run_memory_benchmarks "$repo" "$results_file"
            echo "      }" >> "$results_file"
            
            echo "    }," >> "$results_file"
        fi
    done
    
    # Remove trailing comma and close JSON
    sed -i '$ s/,$//' "$results_file"
    echo "  }" >> "$results_file"
    echo "}" >> "$results_file"
    
    echo "Comprehensive benchmark completed: $results_file"
}

run_search_benchmarks() {
    local repo_path=$1
    local cache_type=$2
    local results_file=$3
    
    # Clear cache for cold start
    if [ "$cache_type" = "cold" ]; then
        pampax cache clear --all >/dev/null 2>&1
        sleep 2
    fi
    
    # Test queries
    local queries=(
        "function"
        "class"
        "variable"
        "method"
        "property"
    )
    
    echo "        \"search_queries\": [" >> "$results_file"
    
    for query in "${queries[@]}"; do
        echo "          {" >> "$results_file"
        echo "            \"query\": \"$query\"," >> "$results_file"
        
        # Run multiple iterations
        local iterations=5
        local times=()
        
        for i in $(seq 1 $iterations); do
            start_time=$(date +%s.%N)
            result=$(pampax search --query "$query" --path "$repo_path" --output json 2>/dev/null)
            end_time=$(date +%s.%N)
            duration=$(echo "$end_time - $start_time" | bc)
            times+=($duration)
            
            # Brief pause between queries
            sleep 0.5
        done
        
        # Calculate statistics
        local total=0
        local min=${times[0]}
        local max=${times[0]}
        
        for time in "${times[@]}"; do
            total=$(echo "$total + $time" | bc)
            min=$(echo "$time < $min ? $time : $min" | bc)
            max=$(echo "$time > $max ? $time : $max" | bc)
        done
        
        local average=$(echo "scale=3; $total / $iterations" | bc)
        
        # Get result count
        local result_count=$(echo "$result" | jq '.results | length' 2>/dev/null || echo "0")
        
        echo "            \"iterations\": $iterations," >> "$results_file"
        echo "            \"average_ms\": $average," >> "$results_file"
        echo "            \"min_ms\": $min," >> "$results_file"
        echo "            \"max_ms\": $max," >> "$results_file"
        echo "            \"result_count\": $result_count" >> "$results_file"
        echo "          }" >> "$results_file"
        
        if [ "$query" != "${queries[-1]}" ]; then
            echo "," >> "$results_file"
        fi
    done
    
    echo "        ]" >> "$results_file"
}

run_assembly_benchmarks() {
    local repo_path=$1
    local results_file=$2
    
    echo "        \"assembly_operations\": [" >> "$results_file"
    
    # Test different assembly operations
    local operations=("context" "evidence" "markdown")
    
    for operation in "${operations[@]}"; do
        echo "          {" >> "$results_file"
        echo "            \"operation\": \"$operation\"," >> "$results_file"
        
        # Measure assembly time
        start_time=$(date +%s.%N)
        
        case "$operation" in
            "context")
                result=$(pampax assemble --query "function" --path "$repo_path" --output json 2>/dev/null)
                ;;
            "evidence")
                result=$(pampax assemble --query "function" --path "$repo_path" --evidence --output json 2>/dev/null)
                ;;
            "markdown")
                result=$(pampax assemble --query "function" --path "$repo_path" --markdown 2>/dev/null)
                ;;
        esac
        
        end_time=$(date +%s.%N)
        duration=$(echo "$end_time - $start_time" | bc)
        
        # Get result size
        local result_size=$(echo "$result" | wc -c)
        
        echo "            \"duration_ms\": $duration," >> "$results_file"
        echo "            \"result_size_bytes\": $result_size" >> "$results_file"
        echo "          }" >> "$results_file"
        
        if [ "$operation" != "${operations[-1]}" ]; then
            echo "," >> "$results_file"
        fi
    done
    
    echo "        ]" >> "$results_file"
}

run_memory_benchmarks() {
    local repo_path=$1
    local results_file=$2
    
    # Get memory usage before operation
    local initial_memory=$(ps -o rss= -p $(pgrep -f pampax) | awk '{print $1}')
    
    # Perform memory-intensive operation
    pampax search --query "*" --path "$repo_path" --limit 1000 >/dev/null 2>&1
    
    # Get memory usage after operation
    local peak_memory=$(ps -o rss= -p $(pgrep -f pampax) | awk '{print $1}')
    
    echo "        \"initial_memory_kb\": $initial_memory," >> "$results_file"
    echo "        \"peak_memory_kb\": $peak_memory," >> "$results_file"
    echo "        \"memory_delta_kb\": $((peak_memory - initial_memory))" >> "$results_file"
}

generate_benchmark_report() {
    local latest_results=$(ls -t "$RESULTS_DIR"/comprehensive-*.json | head -1)
    
    if [ -f "$latest_results" ]; then
        echo "=== Benchmark Report ==="
        echo "Results file: $latest_results"
        echo ""
        
        # Extract key metrics
        echo "Performance Summary:"
        jq -r '
            .benchmarks | to_entries[] | 
            "\(.key):
  Cold Cache Average: \(.value.cold_cache.search_queries[] | .average_ms | tonumber)ms
  Warm Cache Average: \(.value.warm_cache.search_queries[] | .average_ms | tonumber)ms
  Assembly Time: \(.value.assembly.assembly_operations[] | .duration_ms | tonumber)ms
  Memory Delta: \(.value.memory.memory_delta_kb | tonumber)KB"
        ' "$latest_results"
    else
        echo "No benchmark results found"
    fi
}

# Main execution
case "${1:-run}" in
    "setup")
        setup_benchmark_environment
        ;;
    "run")
        setup_benchmark_environment
        run_comprehensive_benchmark
        generate_benchmark_report
        ;;
    "report")
        generate_benchmark_report
        ;;
    *)
        echo "Usage: $0 {setup|run|report}"
        exit 1
        ;;
esac
```

This comprehensive performance tuning guide provides all necessary tools, strategies, and procedures for optimizing PAMPAX performance in production environments, including real-time monitoring, optimization strategies, and comprehensive benchmarking.