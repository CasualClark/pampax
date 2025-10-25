# Cache Hygiene and Maintenance Guide

This comprehensive guide covers cache management, hygiene procedures, and maintenance operations for optimal PAMPAX performance in production environments.

## Cache Architecture Overview

### Cache Types and Structure

```
┌─────────────────────────────────────────────────────────────┐
│                    PAMPAX CACHE SYSTEM                   │
├─────────────────────────────────────────────────────────────┤
│  Search Cache                                             │
│  ├─ Query Results Cache (LRU)                            │
│  ├─ Vector Similarity Cache                               │
│  ├─ BM25 Search Cache                                    │
│  └─ Hybrid Fusion Cache                                   │
├─────────────────────────────────────────────────────────────┤
│  Context Cache                                            │
│  ├─ Assembly Results Cache                                │
│  ├─ Token Bundles Cache                                  │
│  ├─ Evidence Cache                                       │
│  └─ Markdown Output Cache                                 │
├─────────────────────────────────────────────────────────────┤
│  Index Cache                                              │
│  ├─ File Metadata Cache                                  │
│  ├─ Symbol Index Cache                                   │
│  ├─ Graph Traversal Cache                                │
│  └─ Signature Cache                                      │
├─────────────────────────────────────────────────────────────┤
│  Learning Cache                                           │
│  ├─ Intent Classification Cache                            │
│  ├─ Policy Optimization Cache                              │
│  ├─ Feature Vectors Cache                                 │
│  └─ Model Predictions Cache                              │
├─────────────────────────────────────────────────────────────┤
│  System Cache                                             │
│  ├─ Database Query Cache                                 │
│  ├─ Connection Pool Cache                                 │
│  ├─ Temporary Results Cache                              │
│  └─ Compressed Data Cache                                │
└─────────────────────────────────────────────────────────────┘
```

### Cache Storage Locations

| Cache Type | Storage Location | Size Limits | TTL | Eviction Policy |
|------------|------------------|-------------|-----|-----------------|
| Search Results | Memory + Disk | 500MB | 1 hour | LRU |
| Context Assembly | Memory | 200MB | 30 minutes | LFU |
| Index Metadata | Disk | 1GB | 24 hours | FIFO |
| Learning Models | Memory | 100MB | 12 hours | LRU |
| Database Queries | Memory | 50MB | 5 minutes | LRU |

## Cache Management Commands

### CLI Cache Operations

```bash
# Cache status and statistics
pampax cache stats                    # Overall cache statistics
pampax cache stats --type search     # Search cache statistics
pampax cache stats --type context    # Context cache statistics
pampax cache stats --type index      # Index cache statistics

# Cache warming
pampax cache warm <path>             # Warm cache with repository data
pampax cache warm --queries <file>   # Warm with specific queries
pampax cache warm --aggressive       # Aggressive cache warming

# Cache clearing
pampax cache clear --all             # Clear all caches
pampax cache clear --type search     # Clear search cache only
pampax cache clear --type context    # Clear context cache only
pampax cache clear --expired         # Clear expired entries only

# Cache optimization
pampax cache optimize                # Optimize cache structure
pampax cache compact                 # Compact cache storage
pampax cache rebalance              # Rebalance cache distribution

# Cache configuration
pampax cache config --show           # Show cache configuration
pampax cache config --set ttl=3600  # Set cache TTL
pampax cache config --set size=1GB  # Set cache size limit
```

### Advanced Cache Operations

```bash
#!/bin/bash
# cache-management.sh - Advanced cache management script

CACHE_DIR="/var/lib/pampax/cache"
LOG_FILE="/var/log/pampax/cache-maintenance.log"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Cache health check
cache_health_check() {
    log "Starting cache health check..."
    
    local issues=0
    
    # Check cache directory structure
    if [ ! -d "$CACHE_DIR" ]; then
        log "ERROR: Cache directory not found: $CACHE_DIR"
        ((issues++))
    fi
    
    # Check cache permissions
    if [ -d "$CACHE_DIR" ] && [ ! -w "$CACHE_DIR" ]; then
        log "ERROR: Cache directory not writable: $CACHE_DIR"
        ((issues++))
    fi
    
    # Check cache size
    if [ -d "$CACHE_DIR" ]; then
        local cache_size=$(du -sm "$CACHE_DIR" 2>/dev/null | cut -f1)
        local max_size=1024  # 1GB default
        
        if [ "$cache_size" -gt "$max_size" ]; then
            log "WARNING: Cache size (${cache_size}MB) exceeds limit (${max_size}MB)"
            ((issues++))
        fi
    fi
    
    # Check cache statistics via PAMPAX
    if command -v pampax >/dev/null 2>&1; then
        if ! pampax cache stats >/dev/null 2>&1; then
            log "ERROR: Unable to retrieve cache statistics"
            ((issues++))
        fi
    fi
    
    if [ $issues -eq 0 ]; then
        log "✓ Cache health check passed"
        return 0
    else
        log "✗ Cache health check failed with $issues issues"
        return 1
    fi
}

# Cache warming with intelligent query selection
intelligent_cache_warm() {
    local repo_path=$1
    local warm_type=${2:-standard}
    
    log "Starting intelligent cache warming for: $repo_path"
    
    if [ ! -d "$repo_path" ]; then
        log "ERROR: Repository path not found: $repo_path"
        return 1
    fi
    
    case "$warm_type" in
        "standard")
            log "Performing standard cache warming..."
            pampax cache warm "$repo_path"
            ;;
        "aggressive")
            log "Performing aggressive cache warming..."
            pampax cache warm --aggressive "$repo_path"
            ;;
        "query-based")
            log "Performing query-based cache warming..."
            
            # Generate common queries based on repository content
            local temp_queries="/tmp/pampax_warm_queries.txt"
            
            # Extract common function names, classes, etc.
            find "$repo_path" -name "*.js" -o -name "*.ts" -o -name "*.py" | \
                head -20 | while read -r file; do
                    # Extract function/class names (simplified)
                    grep -E "^(function|class|def)" "$file" 2>/dev/null | \
                        head -3 | awk '{print $2}' | cut -d'(' -f1 >> "$temp_queries"
                done
            
            # Remove duplicates and empty lines
            sort -u "$temp_queries" | grep -v '^$' > "${temp_queries}.tmp"
            mv "${temp_queries}.tmp" "$temp_queries"
            
            # Warm cache with generated queries
            if [ -s "$temp_queries" ]; then
                pampax cache warm --queries "$temp_queries" "$repo_path"
            else
                log "No queries generated, falling back to standard warming"
                pampax cache warm "$repo_path"
            fi
            
            rm -f "$temp_queries"
            ;;
        *)
            log "ERROR: Unknown warm type: $warm_type"
            return 1
            ;;
    esac
    
    log "Cache warming completed"
}

# Cache cleanup with safety checks
safe_cache_cleanup() {
    local cleanup_type=${1:-expired}
    
    log "Starting safe cache cleanup (type: $cleanup_type)..."
    
    # Create backup before cleanup
    local backup_dir="${CACHE_DIR}.backup.$(date +%Y%m%d_%H%M%S)"
    if [ -d "$CACHE_DIR" ]; then
        log "Creating cache backup: $backup_dir"
        cp -r "$CACHE_DIR" "$backup_dir"
    fi
    
    case "$cleanup_type" in
        "expired")
            log "Clearing expired cache entries..."
            pampax cache clear --expired
            ;;
        "search")
            log "Clearing search cache..."
            pampax cache clear --type search
            ;;
        "context")
            log "Clearing context cache..."
            pampax cache clear --type context
            ;;
        "all")
            log "Clearing all cache entries..."
            pampax cache clear --all
            ;;
        *)
            log "ERROR: Unknown cleanup type: $cleanup_type"
            return 1
            ;;
    esac
    
    # Verify cache after cleanup
    if cache_health_check; then
        log "✓ Cache cleanup completed successfully"
        # Remove backup after successful cleanup
        rm -rf "$backup_dir" 2>/dev/null
    else
        log "✗ Cache cleanup failed, restoring from backup"
        if [ -d "$backup_dir" ]; then
            rm -rf "$CACHE_DIR"
            mv "$backup_dir" "$CACHE_DIR"
        fi
        return 1
    fi
}

# Cache optimization
optimize_cache() {
    log "Starting cache optimization..."
    
    # Compact cache storage
    log "Compacting cache storage..."
    pampax cache compact
    
    # Rebalance cache distribution
    log "Rebalancing cache distribution..."
    pampax cache rebalance
    
    # Optimize cache configuration
    log "Optimizing cache configuration..."
    
    # Analyze cache hit rates and adjust TTL
    local hit_rate=$(pampax cache stats | grep -o "hit_rate: [0-9.]*" | cut -d' ' -f2)
    
    if [ -n "$hit_rate" ]; then
        if (( $(echo "$hit_rate < 0.5" | bc -l) )); then
            log "Low hit rate (${hit_rate}), increasing TTL..."
            pampax cache config --set ttl=7200
        elif (( $(echo "$hit_rate > 0.8" | bc -l) )); then
            log "High hit rate (${hit_rate}), optimizing TTL..."
            pampax cache config --set ttl=1800
        fi
    fi
    
    log "Cache optimization completed"
}

# Main execution
case "${1:-help}" in
    "health")
        cache_health_check
        ;;
    "warm")
        intelligent_cache_warm "${2:-.}" "${3:-standard}"
        ;;
    "cleanup")
        safe_cache_cleanup "${2:-expired}"
        ;;
    "optimize")
        optimize_cache
        ;;
    "help"|*)
        echo "Usage: $0 {health|warm|cleanup|optimize} [options]"
        echo ""
        echo "Commands:"
        echo "  health                    - Check cache health"
        echo "  warm <path> [type]       - Warm cache (type: standard|aggressive|query-based)"
        echo "  cleanup [type]            - Clean cache (type: expired|search|context|all)"
        echo "  optimize                  - Optimize cache performance"
        exit 1
        ;;
esac
```

## Cache Performance Monitoring

### Cache Metrics Collection

```javascript
// src/cache/cache-metrics.js - Cache performance monitoring
import { getMetricsCollector } from '../metrics/metrics-collector.js';

class CacheMetrics {
  constructor() {
    this.collector = getMetricsCollector();
    this.initializeMetrics();
  }

  initializeMetrics() {
    // Cache hit/miss metrics
    this.cacheHits = this.collector.createCounter({
      name: 'pampax_cache_hits_total',
      help: 'Total cache hits',
      labelNames: ['cache_type', 'operation']
    });

    this.cacheMisses = this.collector.createCounter({
      name: 'pampax_cache_misses_total',
      help: 'Total cache misses',
      labelNames: ['cache_type', 'operation']
    });

    // Cache size metrics
    this.cacheSize = this.collector.createGauge({
      name: 'pampax_cache_size_bytes',
      help: 'Cache size in bytes',
      labelNames: ['cache_type']
    });

    this.cacheEntries = this.collector.createGauge({
      name: 'pampax_cache_entries_total',
      help: 'Number of cache entries',
      labelNames: ['cache_type']
    });

    // Cache performance metrics
    this.cacheLatency = this.collector.createHistogram({
      name: 'pampax_cache_operation_duration_seconds',
      help: 'Cache operation duration in seconds',
      labelNames: ['cache_type', 'operation', 'result'],
      buckets: [0.0001, 0.0005, 0.001, 0.005, 0.01, 0.05, 0.1]
    });

    // Cache eviction metrics
    this.cacheEvictions = this.collector.createCounter({
      name: 'pampax_cache_evictions_total',
      help: 'Total cache evictions',
      labelNames: ['cache_type', 'reason']
    });

    // Cache hit rate gauge
    this.cacheHitRate = this.collector.createGauge({
      name: 'pampax_cache_hit_rate',
      help: 'Cache hit rate (0-1)',
      labelNames: ['cache_type']
    });
  }

  recordHit(cacheType, operation) {
    this.cacheHits.inc({ cache_type: cacheType, operation });
    this.updateHitRate(cacheType);
  }

  recordMiss(cacheType, operation) {
    this.cacheMisses.inc({ cache_type: cacheType, operation });
    this.updateHitRate(cacheType);
  }

  recordOperation(cacheType, operation, duration, result) {
    this.cacheLatency.observe({
      cache_type: cacheType,
      operation,
      result: result ? 'hit' : 'miss'
    }, duration);
  }

  updateSize(cacheType, sizeBytes) {
    this.cacheSize.set({ cache_type: cacheType }, sizeBytes);
  }

  updateEntries(cacheType, entryCount) {
    this.cacheEntries.set({ cache_type: cacheType }, entryCount);
  }

  recordEviction(cacheType, reason) {
    this.cacheEvictions.inc({ cache_type: cacheType, reason });
  }

  updateHitRate(cacheType) {
    // Calculate hit rate from hits and misses
    const hits = this.cacheHits.get({ cache_type: cacheType });
    const misses = this.cacheMisses.get({ cache_type: cacheType });
    const total = hits + misses;
    
    if (total > 0) {
      const hitRate = hits / total;
      this.cacheHitRate.set({ cache_type: cacheType }, hitRate);
    }
  }

  getCacheStats(cacheType) {
    const hits = this.cacheHits.get({ cache_type: cacheType });
    const misses = this.cacheMisses.get({ cache_type: cacheType });
    const size = this.cacheSize.get({ cache_type: cacheType });
    const entries = this.cacheEntries.get({ cache_type: cacheType });
    const hitRate = this.cacheHitRate.get({ cache_type: cacheType });

    return {
      cacheType,
      hits,
      misses,
      total: hits + misses,
      hitRate: hitRate || 0,
      sizeBytes: size || 0,
      entryCount: entries || 0
    };
  }

  getAllCacheStats() {
    const cacheTypes = ['search', 'context', 'index', 'learning', 'database'];
    return cacheTypes.map(type => this.getCacheStats(type));
  }
}

export default CacheMetrics;
```

### Cache Performance Analysis

```bash
#!/bin/bash
# cache-performance-analysis.sh - Cache performance analysis script

METRICS_FILE="/var/log/pampax/cache-metrics.log"
REPORT_FILE="/var/log/pampax/cache-performance-report.txt"

analyze_cache_performance() {
    echo "=== PAMPAX Cache Performance Analysis ===" > "$REPORT_FILE"
    echo "Generated: $(date)" >> "$REPORT_FILE"
    echo "" >> "$REPORT_FILE"

    # Get current cache statistics
    echo "1. Current Cache Statistics" >> "$REPORT_FILE"
    if command -v pampax >/dev/null 2>&1; then
        pampax cache stats >> "$REPORT_FILE" 2>/dev/null || echo "Cache stats unavailable" >> "$REPORT_FILE"
    else
        echo "PAMPAX CLI not available" >> "$REPORT_FILE"
    fi
    echo "" >> "$REPORT_FILE"

    # Analyze cache hit rates over time
    echo "2. Cache Hit Rate Analysis (Last 24 Hours)" >> "$REPORT_FILE"
    if [ -f "$METRICS_FILE" ]; then
        # Extract hit rates from the last 24 hours
        yesterday=$(date -d 'yesterday' +%s)
        
        awk -v yesterday="$yesterday" '
            /cache_hit_rate/ {
                gsub(/[^0-9.]/, "", $3)
                if ($1 > yesterday) {
                    print $3
                }
            }
        ' "$METRICS_FILE" | \
        awk '
        BEGIN { count = 0; sum = 0; min = 999; max = 0 }
        {
            count++
            sum += $1
            if ($1 < min) min = $1
            if ($1 > max) max = $1
        }
        END {
            if (count > 0) {
                avg = sum / count
                printf "  Average hit rate: %.2f%%\n", avg * 100
                printf "  Minimum hit rate: %.2f%%\n", min * 100
                printf "  Maximum hit rate: %.2f%%\n", max * 100
                printf "  Samples: %d\n", count
            } else {
                print "  No data available"
            }
        }' >> "$REPORT_FILE"
    else
        echo "  No metrics file available" >> "$REPORT_FILE"
    fi
    echo "" >> "$REPORT_FILE"

    # Analyze cache size trends
    echo "3. Cache Size Analysis" >> "$REPORT_FILE"
    cache_dir="/var/lib/pampax/cache"
    if [ -d "$cache_dir" ]; then
        echo "  Current cache size: $(du -sh "$cache_dir" 2>/dev/null | cut -f1)" >> "$REPORT_FILE"
        echo "  Cache file count: $(find "$cache_dir" -type f 2>/dev/null | wc -l)" >> "$REPORT_FILE"
        
        # Cache size by type
        for cache_type in search context index learning; do
            type_dir="$cache_dir/$cache_type"
            if [ -d "$type_dir" ]; then
                size=$(du -sh "$type_dir" 2>/dev/null | cut -f1)
                echo "  $cache_type cache: $size" >> "$REPORT_FILE"
            fi
        done
    else
        echo "  Cache directory not found" >> "$REPORT_FILE"
    fi
    echo "" >> "$REPORT_FILE"

    # Performance recommendations
    echo "4. Performance Recommendations" >> "$REPORT_FILE"
    
    # Check hit rates
    if command -v pampax >/dev/null 2>&1; then
        hit_rate=$(pampax cache stats 2>/dev/null | grep -o "hit_rate: [0-9.]*" | cut -d' ' -f2)
        
        if [ -n "$hit_rate" ]; then
            if (( $(echo "$hit_rate < 0.5" | bc -l) )); then
                echo "  ⚠️  Low cache hit rate (${hit_rate}):" >> "$REPORT_FILE"
                echo "     - Consider increasing cache TTL" >> "$REPORT_FILE"
                echo "     - Review cache warming strategy" >> "$REPORT_FILE"
                echo "     - Analyze query patterns" >> "$REPORT_FILE"
            elif (( $(echo "$hit_rate > 0.8" | bc -l) )); then
                echo "  ✓ High cache hit rate (${hit_rate}):" >> "$REPORT_FILE"
                echo "     - Cache is performing well" >> "$REPORT_FILE"
                echo "     - Consider reducing TTL for freshness" >> "$REPORT_FILE"
            else
                echo "  ✓ Acceptable cache hit rate (${hit_rate}):" >> "$REPORT_FILE"
                echo "     - Monitor for optimization opportunities" >> "$REPORT_FILE"
            fi
        fi
    fi
    
    # Check cache size
    if [ -d "$cache_dir" ]; then
        cache_size_mb=$(du -sm "$cache_dir" 2>/dev/null | cut -f1)
        if [ "$cache_size_mb" -gt 1024 ]; then  # > 1GB
            echo "  ⚠️  Large cache size (${cache_size_mb}MB):" >> "$REPORT_FILE"
            echo "     - Consider reducing cache size limits" >> "$REPORT_FILE"
            echo "     - Implement more aggressive eviction policies" >> "$REPORT_FILE"
            echo "     - Review cache distribution" >> "$REPORT_FILE"
        fi
    fi
    
    echo "" >> "$REPORT_FILE"
    echo "=== Analysis Complete ===" >> "$REPORT_FILE"
    
    # Display report
    cat "$REPORT_FILE"
}

# Main execution
case "${1:-analyze}" in
    "analyze")
        analyze_cache_performance
        ;;
    "report")
        analyze_cache_performance
        echo "Report saved to: $REPORT_FILE"
        ;;
    *)
        echo "Usage: $0 {analyze|report}"
        exit 1
        ;;
esac
```

## Cache Maintenance Procedures

### Automated Cache Maintenance

```bash
#!/bin/bash
# cache-maintenance.sh - Automated cache maintenance script

CACHE_DIR="/var/lib/pampax/cache"
LOG_FILE="/var/log/pampax/cache-maintenance.log"
LOCK_FILE="/var/run/pampax-cache-maintenance.lock"

# Ensure only one instance runs
exec 200>"$LOCK_FILE"
flock -n 200 || {
    echo "Cache maintenance already running"
    exit 1
}

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Daily cache maintenance
daily_maintenance() {
    log "Starting daily cache maintenance..."
    
    # 1. Clear expired entries
    log "Clearing expired cache entries..."
    if command -v pampax >/dev/null 2>&1; then
        pampax cache clear --expired
    fi
    
    # 2. Optimize cache structure
    log "Optimizing cache structure..."
    if command -v pampax >/dev/null 2>&1; then
        pampax cache optimize
    fi
    
    # 3. Clean up temporary files
    log "Cleaning up temporary cache files..."
    find "$CACHE_DIR" -name "*.tmp" -mtime +1 -delete 2>/dev/null
    find "$CACHE_DIR" -name "*.lock" -mtime +1 -delete 2>/dev/null
    
    # 4. Rotate cache logs
    log "Rotating cache logs..."
    if [ -f "/var/log/pampax/cache.log" ]; then
        mv "/var/log/pampax/cache.log" "/var/log/pampax/cache.log.$(date +%Y%m%d)"
        gzip "/var/log/pampax/cache.log.$(date +%Y%m%d)" &
    fi
    
    # 5. Generate maintenance report
    log "Generating maintenance report..."
    /usr/local/bin/cache-performance-analysis.sh report
    
    log "Daily cache maintenance completed"
}

# Weekly cache maintenance
weekly_maintenance() {
    log "Starting weekly cache maintenance..."
    
    # 1. Deep cache optimization
    log "Performing deep cache optimization..."
    if command -v pampax >/dev/null 2>&1; then
        pampax cache compact
        pampax cache rebalance
    fi
    
    # 2. Cache size analysis
    log "Analyzing cache size distribution..."
    if [ -d "$CACHE_DIR" ]; then
        du -sh "$CACHE_DIR"/* 2>/dev/null | sort -hr | head -10
    fi
    
    # 3. Performance analysis
    log "Running performance analysis..."
    /usr/local/bin/cache-performance-analysis.sh analyze
    
    # 4. Cache warming for common queries
    log "Warming cache with common queries..."
    # Add logic to identify and warm common queries
    
    log "Weekly cache maintenance completed"
}

# Monthly cache maintenance
monthly_maintenance() {
    log "Starting monthly cache maintenance..."
    
    # 1. Full cache reset (if needed)
    log "Evaluating need for cache reset..."
    
    # Check cache performance over the month
    if [ -f "/var/log/pampax/cache-metrics.log" ]; then
        avg_hit_rate=$(awk '
            /cache_hit_rate/ {
                gsub(/[^0-9.]/, "", $3)
                sum += $3
                count++
            }
            END {
                if (count > 0) print sum / count
            }
        ' "/var/log/pampax/cache-metrics.log")
        
        if [ -n "$avg_hit_rate" ] && (( $(echo "$avg_hit_rate < 0.3" | bc -l) )); then
            log "Low average hit rate (${avg_hit_rate}), performing cache reset..."
            if command -v pampax >/dev/null 2>&1; then
                pampax cache clear --all
                pampax cache warm --aggressive
            fi
        fi
    fi
    
    # 2. Archive old cache data
    log "Archiving old cache data..."
    archive_dir="/var/lib/pampax/cache-archive/$(date +%Y%m)"
    mkdir -p "$archive_dir"
    
    # Move cache files older than 30 days to archive
    find "$CACHE_DIR" -type f -mtime +30 -exec mv {} "$archive_dir/" \;
    
    # 3. Comprehensive health check
    log "Running comprehensive cache health check..."
    /usr/local/bin/cache-management.sh health
    
    log "Monthly cache maintenance completed"
}

# Main execution
case "${1:-daily}" in
    "daily")
        daily_maintenance
        ;;
    "weekly")
        weekly_maintenance
        ;;
    "monthly")
        monthly_maintenance
        ;;
    *)
        echo "Usage: $0 {daily|weekly|monthly}"
        exit 1
        ;;
esac

# Release lock
flock -u 200
```

### Cache Health Monitoring

```bash
#!/bin/bash
# cache-health-monitor.sh - Real-time cache health monitoring

CACHE_DIR="/var/lib/pampax/cache"
ALERT_THRESHOLD_HIT_RATE=0.5
ALERT_THRESHOLD_SIZE_MB=2048  # 2GB
ALERT_THRESHOLD_LATENCY_MS=100

monitor_cache_health() {
    while true; do
        # Get current cache statistics
        if command -v pampax >/dev/null 2>&1; then
            cache_stats=$(pampax cache stats 2>/dev/null)
            
            if [ -n "$cache_stats" ]; then
                # Extract hit rate
                hit_rate=$(echo "$cache_stats" | grep -o "hit_rate: [0-9.]*" | cut -d' ' -f2)
                
                # Check hit rate
                if [ -n "$hit_rate" ]; then
                    if (( $(echo "$hit_rate < $ALERT_THRESHOLD_HIT_RATE" | bc -l) )); then
                        echo "ALERT: Low cache hit rate: ${hit_rate} (threshold: ${ALERT_THRESHOLD_HIT_RATE})"
                        # Send alert notification
                        send_alert "low_hit_rate" "Cache hit rate is ${hit_rate}"
                    fi
                fi
                
                # Extract cache size
                cache_size=$(echo "$cache_stats" | grep -o "size_bytes: [0-9]*" | cut -d' ' -f2)
                
                if [ -n "$cache_size" ]; then
                    cache_size_mb=$((cache_size / 1024 / 1024))
                    if [ "$cache_size_mb" -gt "$ALERT_THRESHOLD_SIZE_MB" ]; then
                        echo "ALERT: High cache size: ${cache_size_mb}MB (threshold: ${ALERT_THRESHOLD_SIZE_MB}MB)"
                        send_alert "high_size" "Cache size is ${cache_size_mb}MB"
                    fi
                fi
            fi
        fi
        
        # Check cache directory health
        if [ ! -d "$CACHE_DIR" ]; then
            echo "ALERT: Cache directory missing: $CACHE_DIR"
            send_alert "missing_directory" "Cache directory is missing"
        elif [ ! -w "$CACHE_DIR" ]; then
            echo "ALERT: Cache directory not writable: $CACHE_DIR"
            send_alert "permission_error" "Cache directory is not writable"
        fi
        
        # Sleep before next check
        sleep 60  # Check every minute
    done
}

send_alert() {
    local alert_type=$1
    local message=$2
    
    # Send to monitoring system
    curl -X POST "https://monitoring.company.com/alerts" \
        -H "Content-Type: application/json" \
        -d "{
            \"service\": \"pampax\",
            \"component\": \"cache\",
            \"alert_type\": \"$alert_type\",
            \"message\": \"$message\",
            \"timestamp\": \"$(date -Iseconds)\",
            \"severity\": \"warning\"
        }" 2>/dev/null
    
    # Log alert
    echo "[$(date)] ALERT: $message" >> /var/log/pampax/cache-alerts.log
}

# Start monitoring in background
if [ "${1:-start}" = "start" ]; then
    echo "Starting cache health monitoring..."
    monitor_cache_health
else
    echo "Usage: $0 start"
    exit 1
fi
```

## Cache Troubleshooting

### Common Cache Issues

#### Issue: Low Cache Hit Rate

**Diagnosis Script**:

```bash
#!/bin/bash
# diagnose-low-hit-rate.sh - Diagnose low cache hit rate issues

echo "=== Low Cache Hit Rate Diagnosis ==="

# 1. Check cache configuration
echo "1. Cache Configuration Analysis"
if command -v pampax >/dev/null 2>&1; then
    echo "Current cache configuration:"
    pampax cache config --show
else
    echo "PAMPAX CLI not available"
fi
echo ""

# 2. Analyze query patterns
echo "2. Query Pattern Analysis"
if [ -f "/var/log/pampax/pampax.log" ]; then
    echo "Recent search queries (last 100):"
    jq -r 'select(.component=="search") | .query' /var/log/pampax/pampax.log 2>/dev/null | \
        sort | uniq -c | sort -rn | head -10
else
    echo "No query logs available"
fi
echo ""

# 3. Check cache TTL settings
echo "3. Cache TTL Analysis"
if [ -f "/etc/pampax/pampax.toml" ]; then
    echo "Current TTL settings:"
    grep -A 5 "\[cache\]" /etc/pampax/pampax.toml | grep ttl
else
    echo "Configuration file not found"
fi
echo ""

# 4. Analyze cache eviction patterns
echo "4. Cache Eviction Analysis"
if [ -f "/var/log/pampax/cache-metrics.log" ]; then
    echo "Recent cache evictions:"
    grep "cache_eviction" /var/log/pampax/cache-metrics.log | tail -10
else
    echo "No eviction logs available"
fi
echo ""

# 5. Recommendations
echo "5. Recommendations for Improving Hit Rate"
echo "   - Increase cache TTL if data freshness allows"
echo "   - Implement query normalization for better cache key matching"
echo "   - Warm cache with common queries during off-peak hours"
echo "   - Review cache size limits and increase if memory permits"
echo "   - Analyze query patterns for optimization opportunities"
```

#### Issue: Cache Memory Leaks

**Diagnosis Script**:

```bash
#!/bin/bash
# diagnose-cache-memory-leak.sh - Diagnose cache memory leaks

echo "=== Cache Memory Leak Diagnosis ==="

# 1. Monitor cache memory usage over time
echo "1. Cache Memory Usage Trend"
cache_dir="/var/lib/pampax/cache"

if [ -d "$cache_dir" ]; then
    echo "Current cache memory usage:"
    du -sh "$cache_dir"
    
    echo "Memory usage by cache type:"
    for type_dir in "$cache_dir"/*; do
        if [ -d "$type_dir" ]; then
            type_name=$(basename "$type_dir")
            size=$(du -sh "$type_dir" 2>/dev/null | cut -f1)
            echo "  $type_name: $size"
        fi
    done
else
    echo "Cache directory not found"
fi
echo ""

# 2. Check for orphaned cache entries
echo "2. Orphaned Cache Entries Check"
if [ -d "$cache_dir" ]; then
    echo "Checking for orphaned entries..."
    
    # Find files older than TTL but not cleaned up
    find "$cache_dir" -type f -mtime +1 -ls | head -10
    
    # Check for temporary files not cleaned up
    echo "Temporary files:"
    find "$cache_dir" -name "*.tmp" -ls 2>/dev/null | head -5
    
    # Check for lock files
    echo "Lock files:"
    find "$cache_dir" -name "*.lock" -ls 2>/dev/null | head -5
fi
echo ""

# 3. Process memory analysis
echo "3. Process Memory Analysis"
if pgrep -f pampax >/dev/null; then
    pid=$(pgrep -f pampax)
    echo "PAMPAX process memory usage:"
    cat /proc/$pid/status | grep -E "(VmRSS|VmSize|VmPeak|VmHWM)"
    
    echo "Memory map for cache-related mappings:"
    pmap "$pid" | grep -i cache | head -10
else
    echo "PAMPAX process not found"
fi
echo ""

# 4. Recommendations
echo "4. Memory Leak Mitigation Recommendations"
echo "   - Implement cache size limits with hard boundaries"
echo "   - Add periodic cache cleanup jobs"
echo "   - Monitor memory usage trends and set alerts"
echo "   - Use weak references where appropriate"
echo "   - Implement cache entry lifecycle management"
```

## Cache Optimization Strategies

### Performance Tuning

```bash
#!/bin/bash
# cache-optimization.sh - Cache performance tuning

echo "=== Cache Performance Optimization ==="

# 1. Optimize cache TTL based on hit rates
optimize_cache_ttl() {
    echo "1. Optimizing Cache TTL"
    
    if command -v pampax >/dev/null 2>&1; then
        hit_rate=$(pampax cache stats 2>/dev/null | grep -o "hit_rate: [0-9.]*" | cut -d' ' -f2)
        
        if [ -n "$hit_rate" ]; then
            if (( $(echo "$hit_rate < 0.3" | bc -l) )); then
                echo "Low hit rate (${hit_rate}), increasing TTL to 2 hours"
                pampax cache config --set ttl=7200
            elif (( $(echo "$hit_rate > 0.8" | bc -l) )); then
                echo "High hit rate (${hit_rate}), reducing TTL to 30 minutes"
                pampax cache config --set ttl=1800
            else
                echo "Hit rate is optimal (${hit_rate}), keeping current TTL"
            fi
        fi
    fi
}

# 2. Optimize cache size distribution
optimize_cache_distribution() {
    echo "2. Optimizing Cache Size Distribution"
    
    cache_dir="/var/lib/pampax/cache"
    total_size_limit_mb=1024  # 1GB total
    
    if [ -d "$cache_dir" ]; then
        # Calculate current distribution
        declare -A current_sizes
        total_current=0
        
        for type_dir in "$cache_dir"/*; do
            if [ -d "$type_dir" ]; then
                type_name=$(basename "$type_dir")
                size_mb=$(du -sm "$type_dir" 2>/dev/null | cut -f1)
                current_sizes["$type_name"]=$size_mb
                total_current=$((total_current + size_mb))
            fi
        done
        
        echo "Current cache distribution (total: ${total_current}MB):"
        for type in "${!current_sizes[@]}"; do
            echo "  $type: ${current_sizes[$type]}MB"
        done
        
        # Recommend optimal distribution
        echo ""
        echo "Recommended distribution:"
        echo "  search: 40% ($(($total_size_limit_mb * 40 / 100))MB)"
        echo "  context: 25% ($(($total_size_limit_mb * 25 / 100))MB)"
        echo "  index: 20% ($(($total_size_limit_mb * 20 / 100))MB)"
        echo "  learning: 15% ($(($total_size_limit_mb * 15 / 100))MB)"
    fi
}

# 3. Implement cache warming strategy
implement_cache_warming() {
    echo "3. Implementing Cache Warming Strategy"
    
    # Create cache warming configuration
    cat > /etc/pampax/cache-warming.json << EOF
{
    "warming_schedule": {
        "daily": "02:00",
        "queries_file": "/etc/pampax/common-queries.txt",
        "repositories": ["/var/lib/pampax/repositories"]
    },
    "query_types": {
        "function_search": 0.3,
        "class_search": 0.2,
        "variable_search": 0.2,
        "file_search": 0.15,
        "content_search": 0.15
    }
}
EOF
    
    echo "Cache warming configuration created"
}

# 4. Setup cache monitoring alerts
setup_monitoring() {
    echo "4. Setting Up Cache Monitoring Alerts"
    
    # Create alert rules
    cat > /etc/pampax/cache-alerts.yml << EOF
groups:
  - name: pampax-cache
    rules:
      - alert: CacheLowHitRate
        expr: pampax_cache_hit_rate < 0.5
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "Low cache hit rate"
          description: "Cache hit rate is {{ $value }}"
      
      - alert: CacheHighSize
        expr: pampax_cache_size_bytes > 2147483648  # 2GB
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High cache size"
          description: "Cache size is {{ $value }} bytes"
      
      - alert: CacheHighLatency
        expr: histogram_quantile(0.95, rate(pampax_cache_operation_duration_seconds_bucket[5m])) > 0.1
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High cache latency"
          description: "95th percentile cache latency is {{ $value }}s"
EOF
    
    echo "Cache monitoring alerts configured"
}

# Execute optimizations
optimize_cache_ttl
echo ""
optimize_cache_distribution
echo ""
implement_cache_warming
echo ""
setup_monitoring

echo ""
echo "=== Cache Optimization Complete ==="
```

This comprehensive cache hygiene and maintenance guide provides all the necessary procedures, tools, and strategies for maintaining optimal cache performance in PAMPAX production environments.