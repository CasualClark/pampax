# Cache Management Runbook

## Overview

This runbook provides operational procedures for managing PAMPAX caches, including monitoring, maintenance, optimization, and troubleshooting. It covers both manual and automated cache management operations.

## 1. Cache Architecture Overview

### 1.1 Cache Types

**Primary Caches:**
- **Query Cache**: Stores search query results
- **Context Cache**: Stores assembled context data
- **Metadata Cache**: Stores file metadata and symbols
- **Token Cache**: Stores tokenization results

**Cache Storage:**
- SQLite database (`/var/lib/pampax/cache.db`)
- In-memory LRU cache
- Disk-based overflow cache

### 1.2 Cache Configuration

```toml
[cache]
# Cache configuration
max_size_mb = 2048
max_entries = 100000
ttl_seconds = 3600
cleanup_interval = 300
enable_disk_overflow = true
disk_overflow_path = "/var/lib/pampax/cache_overflow"

[cache.query]
max_size_mb = 512
max_entries = 50000
ttl_seconds = 1800

[cache.context]
max_size_mb = 1024
max_entries = 25000
ttl_seconds = 7200

[cache.metadata]
max_size_mb = 256
max_entries = 100000
ttl_seconds = 86400
```

## 2. Cache Monitoring

### 2.1 Cache Statistics Monitoring

```bash
#!/bin/bash
# cache-monitor.sh

set -euo pipefail

BASE_URL="http://localhost:3000"
LOG_FILE="/var/log/pampax/cache-monitor.log"

# Function to get cache statistics
get_cache_stats() {
    local response
    response=$(curl -s "$BASE_URL/admin/cache/stats" 2>/dev/null || echo "{}")
    
    if [ "$response" != "{}" ]; then
        echo "$response" | jq -r '
        {
            timestamp: now | strftime("%Y-%m-%d %H:%M:%S"),
            total_entries: .total_entries // 0,
            total_size_mb: .total_size_mb // 0,
            hit_rate: .hit_rate // 0,
            miss_rate: .miss_rate // 0,
            eviction_rate: .eviction_rate // 0,
            memory_usage: .memory_usage // 0,
            disk_usage: .disk_usage // 0
        } | to_entries[] | "\(.key)=\(.value)"' | tr '\n' ',' | sed 's/,$//'
    else
        echo "$(date '+%Y-%m-%d %H:%M:%S'),error=1"
    fi
}

# Function to analyze cache health
analyze_cache_health() {
    local stats
    stats=$(get_cache_stats)
    
    # Parse key metrics
    local hit_rate=$(echo "$stats" | grep -o 'hit_rate=[0-9.]*' | cut -d'=' -f2)
    local memory_usage=$(echo "$stats" | grep -o 'memory_usage=[0-9.]*' | cut -d'=' -f2)
    local eviction_rate=$(echo "$stats" | grep -o 'eviction_rate=[0-9.]*' | cut -d'=' -f2)
    
    # Health assessment
    local health_status="healthy"
    local alerts=()
    
    # Check hit rate
    if (( $(echo "$hit_rate < 0.5" | bc -l) )); then
        health_status="degraded"
        alerts+=("Low hit rate: ${hit_rate}")
    fi
    
    # Check memory usage
    if (( $(echo "$memory_usage > 0.9" | bc -l) )); then
        health_status="critical"
        alerts+=("High memory usage: ${memory_usage}")
    fi
    
    # Check eviction rate
    if (( $(echo "$eviction_rate > 0.1" | bc -l) )); then
        health_status="degraded"
        alerts+=("High eviction rate: ${eviction_rate}")
    fi
    
    # Log results
    echo "[$(date)] Cache Health: $health_status" | tee -a "$LOG_FILE"
    for alert in "${alerts[@]}"; do
        echo "[$(date)] Alert: $alert" | tee -a "$LOG_FILE"
    done
    
    return $([ "$health_status" = "healthy" ] && echo 0 || echo 1)
}

# Main monitoring loop
while true; do
    analyze_cache_health
    sleep 60  # Check every minute
done
```

### 2.2 Real-time Cache Dashboard

```bash
#!/bin/bash
# cache-dashboard.sh

set -euo pipefail

BASE_URL="http://localhost:3000"

# Function to display cache dashboard
display_dashboard() {
    clear
    echo "=== PAMPAX Cache Dashboard ==="
    echo "Last Updated: $(date)"
    echo ""
    
    # Get cache statistics
    local stats
    stats=$(curl -s "$BASE_URL/admin/cache/stats" 2>/dev/null || echo "{}")
    
    if [ "$stats" = "{}" ]; then
        echo "ERROR: Could not retrieve cache statistics"
        return 1
    fi
    
    # Display summary
    echo "Cache Summary:"
    echo "  Total Entries: $(echo "$stats" | jq -r '.total_entries // "N/A"')"
    echo "  Total Size: $(echo "$stats" | jq -r '.total_size_mb // "N/A"') MB"
    echo "  Hit Rate: $(echo "$stats" | jq -r '.hit_rate // "N/A"')"
    echo "  Miss Rate: $(echo "$stats" | jq -r '.miss_rate // "N/A"')"
    echo "  Eviction Rate: $(echo "$stats" | jq -r '.eviction_rate // "N/A"')"
    echo ""
    
    # Display memory usage
    echo "Memory Usage:"
    echo "  In-Memory: $(echo "$stats" | jq -r '.memory_usage // "N/A"')"
    echo "  Disk Usage: $(echo "$stats" | jq -r '.disk_usage // "N/A"')"
    echo ""
    
    # Display individual cache stats
    echo "Individual Caches:"
    echo "$stats" | jq -r '.caches | to_entries[] | 
    "  \(.key | ascii_upcase):
    Entries: \(.value.entries // "N/A")
    Size: \(.value.size_mb // "N/A") MB
    Hit Rate: \(.value.hit_rate // "N/A")
    TTL: \(.value.ttl_seconds // "N/A")s"'
    echo ""
    
    # Display performance metrics
    echo "Performance Metrics:"
    echo "  Avg Response Time: $(echo "$stats" | jq -r '.avg_response_time_ms // "N/A"') ms"
    echo "  Operations/sec: $(echo "$stats" | jq -r '.operations_per_sec // "N/A"')"
    echo ""
    
    # Display health status
    local health_status
    health_status=$(curl -s "$BASE_URL/health/detailed" | jq -r '.checks.cache.status // "unknown"')
    echo "Health Status: $health_status"
    
    # Display recommendations
    echo ""
    echo "Recommendations:"
    local hit_rate=$(echo "$stats" | jq -r '.hit_rate // 0')
    if (( $(echo "$hit_rate < 0.5" | bc -l) )); then
        echo "  ⚠ Low hit rate - consider increasing cache size"
    fi
    
    local memory_usage=$(echo "$stats" | jq -r '.memory_usage // 0')
    if (( $(echo "$memory_usage > 0.8" | bc -l) )); then
        echo "  ⚠ High memory usage - consider cache cleanup"
    fi
}

# Auto-refresh dashboard
while true; do
    display_dashboard
    sleep 10
done
```

## 3. Cache Maintenance Operations

### 3.1 Cache Cleanup Procedure

```bash
#!/bin/bash
# cache-cleanup.sh

set -euo pipefail

BASE_URL="http://localhost:3000"
LOG_FILE="/var/log/pampax/cache-cleanup.log"

# Function to log cleanup operations
log_operation() {
    echo "[$(date)] $1" | tee -a "$LOG_FILE"
}

# Function to perform cache cleanup
perform_cleanup() {
    log_operation "Starting cache cleanup"
    
    # Get pre-cleanup statistics
    local pre_stats
    pre_stats=$(curl -s "$BASE_URL/admin/cache/stats" 2>/dev/null || echo "{}")
    local pre_size=$(echo "$pre_stats" | jq -r '.total_size_mb // 0')
    local pre_entries=$(echo "$pre_stats" | jq -r '.total_entries // 0')
    
    log_operation "Pre-cleanup: ${pre_entries} entries, ${pre_size} MB"
    
    # 1. Clear expired entries
    log_operation "Clearing expired entries"
    curl -X POST "$BASE_URL/admin/cache/clear-expired" 2>/dev/null && \
        log_operation "✓ Expired entries cleared" || \
        log_operation "✗ Failed to clear expired entries"
    
    # 2. Clear low-priority entries
    log_operation "Clearing low-priority entries"
    curl -X POST "$BASE_URL/admin/cache/clear-low-priority" 2>/dev/null && \
        log_operation "✓ Low-priority entries cleared" || \
        log_operation "✗ Failed to clear low-priority entries"
    
    # 3. Optimize cache database
    log_operation "Optimizing cache database"
    if [ -f /var/lib/pampax/cache.db ]; then
        sqlite3 /var/lib/pampax/cache.db "VACUUM;" && \
            log_operation "✓ Cache database optimized" || \
            log_operation "✗ Failed to optimize cache database"
    fi
    
    # 4. Clear disk overflow if needed
    local disk_usage
    disk_usage=$(df /var/lib/pampax | tail -1 | awk '{print $5}' | sed 's/%//')
    if [ "$disk_usage" -gt 85 ]; then
        log_operation "Clearing disk overflow cache (disk usage: ${disk_usage}%)"
        curl -X POST "$BASE_URL/admin/cache/clear-overflow" 2>/dev/null && \
            log_operation "✓ Disk overflow cleared" || \
            log_operation "✗ Failed to clear disk overflow"
    fi
    
    # 5. Get post-cleanup statistics
    sleep 5  # Allow operations to complete
    local post_stats
    post_stats=$(curl -s "$BASE_URL/admin/cache/stats" 2>/dev/null || echo "{}")
    local post_size=$(echo "$post_stats" | jq -r '.total_size_mb // 0')
    local post_entries=$(echo "$post_stats" | jq -r '.total_entries // 0')
    
    local size_freed=$((pre_size - post_size))
    local entries_removed=$((pre_entries - post_entries))
    
    log_operation "Post-cleanup: ${post_entries} entries, ${post_size} MB"
    log_operation "Cleanup completed: freed ${size_freed} MB, removed ${entries_removed} entries"
}

# Function to perform deep cleanup
perform_deep_cleanup() {
    log_operation "Starting deep cache cleanup"
    
    # Clear all caches
    log_operation "Clearing all caches"
    curl -X POST "$BASE_URL/admin/cache/clear-all" 2>/dev/null && \
        log_operation "✓ All caches cleared" || \
        log_operation "✗ Failed to clear all caches"
    
    # Rebuild cache database
    log_operation "Rebuilding cache database"
    curl -X POST "$BASE_URL/admin/cache/rebuild" 2>/dev/null && \
        log_operation "✓ Cache rebuild initiated" || \
        log_operation "✗ Failed to initiate cache rebuild"
    
    # Wait for rebuild completion
    log_operation "Waiting for cache rebuild completion"
    local rebuild_timeout=300  # 5 minutes
    local elapsed=0
    
    while [ $elapsed -lt $rebuild_timeout ]; do
        local status
        status=$(curl -s "$BASE_URL/health/detailed" | jq -r '.checks.cache.status // "unknown"')
        
        if [ "$status" = "healthy" ]; then
            log_operation "✓ Cache rebuild completed successfully"
            break
        fi
        
        sleep 10
        elapsed=$((elapsed + 10))
    done
    
    if [ $elapsed -ge $rebuild_timeout ]; then
        log_operation "✗ Cache rebuild timed out"
        return 1
    fi
}

# Main execution
case "${1:-cleanup}" in
    "cleanup")
        perform_cleanup
        ;;
    "deep-cleanup")
        perform_deep_cleanup
        ;;
    *)
        echo "Usage: $0 [cleanup|deep-cleanup]"
        exit 1
        ;;
esac
```

### 3.2 Cache Optimization Procedure

```bash
#!/bin/bash
# cache-optimization.sh

set -euo pipefail

BASE_URL="http://localhost:3000"
LOG_FILE="/var/log/pampax/cache-optimization.log"

# Function to log optimization operations
log_operation() {
    echo "[$(date)] $1" | tee -a "$LOG_FILE"
}

# Function to analyze cache performance
analyze_performance() {
    log_operation "Analyzing cache performance"
    
    local stats
    stats=$(curl -s "$BASE_URL/admin/cache/stats" 2>/dev/null || echo "{}")
    
    if [ "$stats" = "{}" ]; then
        log_operation "✗ Could not retrieve cache statistics"
        return 1
    fi
    
    local hit_rate=$(echo "$stats" | jq -r '.hit_rate // 0')
    local memory_usage=$(echo "$stats" | jq -r '.memory_usage // 0')
    local eviction_rate=$(echo "$stats" | jq -r '.eviction_rate // 0')
    local avg_response_time=$(echo "$stats" | jq -r '.avg_response_time_ms // 0')
    
    log_operation "Current Performance Metrics:"
    log_operation "  Hit Rate: $hit_rate"
    log_operation "  Memory Usage: $memory_usage"
    log_operation "  Eviction Rate: $eviction_rate"
    log_operation "  Avg Response Time: ${avg_response_time}ms"
    
    # Generate optimization recommendations
    local recommendations=()
    
    if (( $(echo "$hit_rate < 0.6" | bc -l) )); then
        recommendations+=("Increase cache size to improve hit rate")
    fi
    
    if (( $(echo "$memory_usage > 0.8" | bc -l) )); then
        recommendations+=("Reduce cache TTL or increase memory allocation")
    fi
    
    if (( $(echo "$eviction_rate > 0.05" | bc -l) )); then
        recommendations+=("Increase cache size to reduce evictions")
    fi
    
    if (( $(echo "$avg_response_time > 100" | bc -l) )); then
        recommendations+=("Optimize cache indexing or consider faster storage")
    fi
    
    if [ ${#recommendations[@]} -gt 0 ]; then
        log_operation "Optimization Recommendations:"
        for rec in "${recommendations[@]}"; do
            log_operation "  • $rec"
        done
    else
        log_operation "✓ Cache performance is optimal"
    fi
}

# Function to optimize cache configuration
optimize_configuration() {
    log_operation "Optimizing cache configuration"
    
    # Get current configuration
    local current_config
    if [ -f /etc/pampax/pampax.toml ]; then
        current_config=$(grep -A 20 "\[cache\]" /etc/pampax/pampax.toml)
    else
        log_operation "✗ Configuration file not found"
        return 1
    fi
    
    # Get system resources
    local total_memory
    total_memory=$(free -m | awk 'NR==2{print $2}')
    local available_memory
    available_memory=$(free -m | awk 'NR==2{print $7}')
    
    log_operation "System Memory: ${total_memory}MB total, ${available_memory}MB available"
    
    # Calculate optimal cache size (50% of available memory)
    local optimal_cache_size=$((available_memory / 2))
    
    log_operation "Recommended cache size: ${optimal_cache_size}MB"
    
    # Update configuration if needed
    local current_cache_size
    current_cache_size=$(echo "$current_config" | grep "max_size_mb" | awk '{print $3}' | tr -d '"' || echo "0")
    
    if [ "$current_cache_size" -lt "$optimal_cache_size" ]; then
        log_operation "Updating cache size from ${current_cache_size}MB to ${optimal_cache_size}MB"
        
        # Backup current configuration
        cp /etc/pampax/pampax.toml /etc/pampax/pampax.toml.backup.$(date +%s)
        
        # Update configuration
        sed -i "s/max_size_mb = $current_cache_size/max_size_mb = $optimal_cache_size/" /etc/pampax/pampax.toml
        
        log_operation "✓ Configuration updated, restart required"
        log_operation "Run: systemctl restart pampax"
    else
        log_operation "✓ Cache configuration is optimal"
    fi
}

# Function to warm up cache
warm_up_cache() {
    log_operation "Warming up cache"
    
    # Get popular queries from logs
    local popular_queries
    popular_queries=$(journalctl -u pampax --since '24 hours ago' | \
        grep "query=" | \
        awk -F'query=' '{print $2}' | \
        awk '{print $1}' | \
        sort | \
        uniq -c | \
        sort -nr | \
        head -10 | \
        awk '{print $2}')
    
    if [ -n "$popular_queries" ]; then
        log_operation "Warming cache with popular queries"
        
        while IFS= read -r query; do
            if [ -n "$query" ]; then
                log_operation "  Warming: $query"
                curl -s "$BASE_URL/search?q=$query" >/dev/null &
            fi
        done <<< "$popular_queries"
        
        wait
        log_operation "✓ Cache warm-up completed"
    else
        log_operation "No popular queries found for cache warm-up"
    fi
}

# Main execution
case "${1:-analyze}" in
    "analyze")
        analyze_performance
        ;;
    "optimize")
        optimize_configuration
        ;;
    "warmup")
        warm_up_cache
        ;;
    "all")
        analyze_performance
        optimize_configuration
        warm_up_cache
        ;;
    *)
        echo "Usage: $0 [analyze|optimize|warmup|all]"
        exit 1
        ;;
esac
```

## 4. Cache Troubleshooting

### 4.1 Cache Issues Diagnosis

```bash
#!/bin/bash
# cache-diagnosis.sh

set -euo pipefail

BASE_URL="http://localhost:3000"
LOG_FILE="/var/log/pampax/cache-diagnosis.log"

# Function to diagnose cache issues
diagnose_cache() {
    echo "=== Cache Diagnosis Report ==="
    echo "Generated: $(date)"
    echo ""
    
    # 1. Check cache service status
    echo "1. Cache Service Status"
    local health_status
    health_status=$(curl -s "$BASE_URL/health/detailed" | jq -r '.checks.cache.status // "unknown"')
    echo "   Health Status: $health_status"
    
    if [ "$health_status" != "healthy" ]; then
        echo "   ⚠ Cache is not healthy"
    fi
    echo ""
    
    # 2. Check cache database integrity
    echo "2. Cache Database Integrity"
    if [ -f /var/lib/pampax/cache.db ]; then
        local integrity_check
        integrity_check=$(sqlite3 /var/lib/pampax/cache.db "PRAGMA integrity_check;" 2>/dev/null)
        if echo "$integrity_check" | grep -q "ok"; then
            echo "   ✓ Cache database integrity: OK"
        else
            echo "   ✗ Cache database corruption detected"
            echo "   Details: $integrity_check"
        fi
        
        # Check database size
        local db_size
        db_size=$(du -h /var/lib/pampax/cache.db | cut -f1)
        echo "   Database size: $db_size"
        
        # Check page count
        local page_count
        page_count=$(sqlite3 /var/lib/pampax/cache.db "PRAGMA page_count;")
        echo "   Page count: $page_count"
        
        # Check free pages
        local free_pages
        free_pages=$(sqlite3 /var/lib/pampax/cache.db "PRAGMA freelist_count;")
        echo "   Free pages: $free_pages"
    else
        echo "   ✗ Cache database file not found"
    fi
    echo ""
    
    # 3. Check cache configuration
    echo "3. Cache Configuration"
    if [ -f /etc/pampax/pampax.toml ]; then
        echo "   Configuration file exists"
        
        local max_size
        max_size=$(grep -A 10 "\[cache\]" /etc/pampax/pampax.toml | grep "max_size_mb" | awk '{print $3}' | tr -d '"' || echo "not set")
        echo "   Max cache size: $max_size MB"
        
        local max_entries
        max_entries=$(grep -A 10 "\[cache\]" /etc/pampax/pampax.toml | grep "max_entries" | awk '{print $3}' | tr -d '"' || echo "not set")
        echo "   Max entries: $max_entries"
        
        local ttl
        ttl=$(grep -A 10 "\[cache\]" /etc/pampax/pampax.toml | grep "ttl_seconds" | awk '{print $3}' | tr -d '"' || echo "not set")
        echo "   TTL: $ttl seconds"
    else
        echo "   ✗ Configuration file not found"
    fi
    echo ""
    
    # 4. Check system resources
    echo "4. System Resources"
    local memory_usage
    memory_usage=$(free | awk 'NR==2{printf "%.1f", $3*100/$2}')
    echo "   System memory usage: ${memory_usage}%"
    
    local disk_usage
    disk_usage=$(df /var/lib/pampax | tail -1 | awk '{print $5}')
    echo "   Disk usage for cache: $disk_usage"
    
    local load_average
    load_average=$(uptime | awk -F'load average:' '{print $2}' | awk '{print $1}' | tr -d ',')
    echo "   Load average: $load_average"
    echo ""
    
    # 5. Check cache statistics
    echo "5. Cache Statistics"
    local stats
    stats=$(curl -s "$BASE_URL/admin/cache/stats" 2>/dev/null || echo "{}")
    
    if [ "$stats" != "{}" ]; then
        local total_entries=$(echo "$stats" | jq -r '.total_entries // "N/A"')
        local total_size=$(echo "$stats" | jq -r '.total_size_mb // "N/A"')
        local hit_rate=$(echo "$stats" | jq -r '.hit_rate // "N/A"')
        local miss_rate=$(echo "$stats" | jq -r '.miss_rate // "N/A"')
        local eviction_rate=$(echo "$stats" | jq -r '.eviction_rate // "N/A"')
        
        echo "   Total entries: $total_entries"
        echo "   Total size: $total_size MB"
        echo "   Hit rate: $hit_rate"
        echo "   Miss rate: $miss_rate"
        echo "   Eviction rate: $eviction_rate"
    else
        echo "   ✗ Could not retrieve cache statistics"
    fi
    echo ""
    
    # 6. Check recent errors
    echo "6. Recent Cache Errors"
    local error_count
    error_count=$(journalctl -u pampax --since '1 hour ago' | grep -i "cache.*error\|cache.*failed" | wc -l)
    echo "   Cache errors in last hour: $error_count"
    
    if [ "$error_count" -gt 0 ]; then
        echo "   Recent errors:"
        journalctl -u pampax --since '1 hour ago' | grep -i "cache.*error\|cache.*failed" | tail -5 | while read line; do
            echo "     $line"
        done
    fi
    echo ""
    
    # 7. Generate recommendations
    echo "7. Recommendations"
    
    # Check hit rate
    local hit_rate_num
    hit_rate_num=$(echo "$stats" | jq -r '.hit_rate // 0' 2>/dev/null)
    if (( $(echo "$hit_rate_num < 0.5" | bc -l 2>/dev/null || echo 0) )); then
        echo "   ⚠ Low hit rate detected - consider increasing cache size"
    fi
    
    # Check memory usage
    if (( $(echo "$memory_usage > 85" | bc -l 2>/dev/null || echo 0) )); then
        echo "   ⚠ High memory usage - consider reducing cache size or adding memory"
    fi
    
    # Check disk usage
    local disk_usage_num
    disk_usage_num=$(echo "$disk_usage" | sed 's/%//')
    if [ "$disk_usage_num" -gt 90 ]; then
        echo "   ⚠ High disk usage - consider cache cleanup or disk expansion"
    fi
    
    # Check error count
    if [ "$error_count" -gt 5 ]; then
        echo "   ⚠ High error rate - investigate cache configuration and logs"
    fi
    
    echo ""
    echo "=== Diagnosis Complete ==="
}

# Main execution
diagnose_cache | tee "$LOG_FILE"
```

### 4.2 Cache Recovery Procedures

```bash
#!/bin/bash
# cache-recovery.sh

set -euo pipefail

BASE_URL="http://localhost:3000"
BACKUP_DIR="/backup/pampax/cache"
LOG_FILE="/var/log/pampax/cache-recovery.log"

# Function to log recovery operations
log_operation() {
    echo "[$(date)] $1" | tee -a "$LOG_FILE"
}

# Function to backup current cache
backup_cache() {
    log_operation "Creating cache backup"
    
    local backup_date
    backup_date=$(date +%Y%m%d_%H%M%S)
    local backup_path="$BACKUP_DIR/cache_backup_$backup_date"
    
    mkdir -p "$backup_path"
    
    # Backup cache database
    if [ -f /var/lib/pampax/cache.db ]; then
        cp /var/lib/pampax/cache.db "$backup_path/"
        log_operation "✓ Cache database backed up"
    fi
    
    # Backup configuration
    if [ -f /etc/pampax/pampax.toml ]; then
        cp /etc/pampax/pampax.toml "$backup_path/"
        log_operation "✓ Configuration backed up"
    fi
    
    # Backup statistics
    local stats
    stats=$(curl -s "$BASE_URL/admin/cache/stats" 2>/dev/null || echo "{}")
    if [ "$stats" != "{}" ]; then
        echo "$stats" > "$backup_path/cache_stats.json"
        log_operation "✓ Cache statistics backed up"
    fi
    
    echo "$backup_path"
}

# Function to restore cache from backup
restore_cache() {
    local backup_path=$1
    
    log_operation "Restoring cache from backup: $backup_path"
    
    if [ ! -d "$backup_path" ]; then
        log_operation "✗ Backup path not found: $backup_path"
        return 1
    fi
    
    # Stop service
    log_operation "Stopping PAMPAX service"
    systemctl stop pampax
    
    # Restore cache database
    if [ -f "$backup_path/cache.db" ]; then
        cp "$backup_path/cache.db" /var/lib/pampax/
        chown pampax:pampax /var/lib/pampax/cache.db
        log_operation "✓ Cache database restored"
    fi
    
    # Restore configuration
    if [ -f "$backup_path/pampax.toml" ]; then
        cp "$backup_path/pampax.toml" /etc/pampax/
        chown pampax:pampax /etc/pampax/pampax.toml
        log_operation "✓ Configuration restored"
    fi
    
    # Start service
    log_operation "Starting PAMPAX service"
    systemctl start pampax
    
    # Wait for service to be ready
    sleep 10
    
    # Verify restoration
    local health_status
    health_status=$(curl -s "$BASE_URL/health/detailed" | jq -r '.checks.cache.status // "unknown"')
    
    if [ "$health_status" = "healthy" ]; then
        log_operation "✓ Cache restoration completed successfully"
    else
        log_operation "✗ Cache restoration failed, status: $health_status"
        return 1
    fi
}

# Function to rebuild cache from scratch
rebuild_cache() {
    log_operation "Rebuilding cache from scratch"
    
    # Stop service
    log_operation "Stopping PAMPAX service"
    systemctl stop pampax
    
    # Remove cache database
    if [ -f /var/lib/pampax/cache.db ]; then
        mv /var/lib/pampax/cache.db /var/lib/pampax/cache.db.corrupted.$(date +%s)
        log_operation "✓ Corrupted cache database moved aside"
    fi
    
    # Remove overflow cache
    if [ -d /var/lib/pampax/cache_overflow ]; then
        rm -rf /var/lib/pampax/cache_overflow
        log_operation "✓ Overflow cache removed"
    fi
    
    # Start service
    log_operation "Starting PAMPAX service"
    systemctl start pampax
    
    # Wait for cache initialization
    log_operation "Waiting for cache initialization"
    local timeout=60
    local elapsed=0
    
    while [ $elapsed -lt $timeout ]; do
        local health_status
        health_status=$(curl -s "$BASE_URL/health/detailed" | jq -r '.checks.cache.status // "unknown"')
        
        if [ "$health_status" = "healthy" ]; then
            log_operation "✓ Cache rebuild completed successfully"
            break
        fi
        
        sleep 5
        elapsed=$((elapsed + 5))
    done
    
    if [ $elapsed -ge $timeout ]; then
        log_operation "✗ Cache rebuild timed out"
        return 1
    fi
}

# Main execution
case "${1:-backup}" in
    "backup")
        backup_cache
        ;;
    "restore")
        if [ -z "${2:-}" ]; then
            echo "Usage: $0 restore <backup_path>"
            exit 1
        fi
        restore_cache "$2"
        ;;
    "rebuild")
        rebuild_cache
        ;;
    *)
        echo "Usage: $0 [backup|restore <path>|rebuild]"
        exit 1
        ;;
esac
```

## 5. Automated Cache Management

### 5.1 Cache Management Service

```ini
# /etc/systemd/system/pampax-cache-manager.service
[Unit]
Description=PAMPAX Cache Manager
After=pampax.service
Requires=pampax.service

[Service]
Type=oneshot
User=pampax
Group=pampax
ExecStart=/opt/pampax/scripts/cache-optimization.sh all

[Install]
WantedBy=multi-user.target
```

```bash
# /etc/systemd/system/pampax-cache-manager.timer
[Unit]
Description=PAMPAX Cache Manager Timer
Requires=pampax-cache-manager.service

[Timer]
OnCalendar=daily
Persistent=true

[Install]
WantedBy=timers.target
```

### 5.2 Cache Monitoring Alerts

```yaml
# prometheus-cache-alerts.yml
groups:
  - name: cache.alerts
    rules:
      - alert: CacheHitRateLow
        expr: cache_hit_rate < 0.5
        for: 15m
        labels:
          severity: warning
        annotations:
          summary: "Cache hit rate is low"
          description: "Cache hit rate is {{ $value }} for the last 15 minutes"

      - alert: CacheMemoryUsageHigh
        expr: cache_memory_usage > 0.9
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "Cache memory usage is high"
          description: "Cache memory usage is {{ $value }} for the last 5 minutes"

      - alert: CacheEvictionRateHigh
        expr: cache_eviction_rate > 0.1
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "Cache eviction rate is high"
          description: "Cache eviction rate is {{ $value }} for the last 10 minutes"
```

## 6. Performance Tuning

### 6.1 Cache Performance Optimization

```bash
#!/bin/bash
# cache-performance-tuning.sh

set -euo pipefail

BASE_URL="http://localhost:3000"

# Function to tune cache for performance
tune_performance() {
    echo "=== Cache Performance Tuning ==="
    
    # Get current performance metrics
    local stats
    stats=$(curl -s "$BASE_URL/admin/cache/stats" 2>/dev/null || echo "{}")
    
    if [ "$stats" = "{}" ]; then
        echo "ERROR: Could not retrieve cache statistics"
        return 1
    fi
    
    local hit_rate=$(echo "$stats" | jq -r '.hit_rate // 0')
    local avg_response_time=$(echo "$stats" | jq -r '.avg_response_time_ms // 0')
    local operations_per_sec=$(echo "$stats" | jq -r '.operations_per_sec // 0')
    
    echo "Current Performance:"
    echo "  Hit Rate: $hit_rate"
    echo "  Avg Response Time: ${avg_response_time}ms"
    echo "  Operations/sec: $operations_per_sec"
    echo ""
    
    # Performance tuning recommendations
    echo "Performance Tuning Recommendations:"
    
    # Hit rate optimization
    if (( $(echo "$hit_rate < 0.7" | bc -l) )); then
        echo "  • Increase cache size to improve hit rate"
        echo "  • Review cache TTL settings"
        echo "  • Implement cache warming strategies"
    fi
    
    # Response time optimization
    if (( $(echo "$avg_response_time > 50" | bc -l) )); then
        echo "  • Optimize cache indexing"
        echo "  • Consider using faster storage"
        echo "  • Implement cache sharding"
    fi
    
    # Throughput optimization
    if [ "$operations_per_sec" -lt 100 ]; then
        echo "  • Increase cache concurrency"
        echo "  • Optimize cache algorithms"
        echo "  • Consider distributed caching"
    fi
    
    echo ""
    
    # Apply optimizations
    echo "Applying optimizations..."
    
    # Optimize SQLite settings
    if [ -f /var/lib/pampax/cache.db ]; then
        sqlite3 /var/lib/pampax/cache.db "PRAGMA journal_mode=WAL;"
        sqlite3 /var/lib/pampax/cache.db "PRAGMA synchronous=NORMAL;"
        sqlite3 /var/lib/pampax/cache.db "PRAGMA cache_size=10000;"
        sqlite3 /var/lib/pampax/cache.db "PRAGMA temp_store=MEMORY;"
        echo "✓ SQLite optimizations applied"
    fi
    
    # Optimize system settings
    echo "vm.swappiness=10" >> /etc/sysctl.conf
    echo "vm.dirty_ratio=15" >> /etc/sysctl.conf
    echo "vm.dirty_background_ratio=5" >> /etc/sysctl.conf
    sysctl -p
    echo "✓ System optimizations applied"
    
    echo "Performance tuning completed"
}

# Main execution
tune_performance
```

This comprehensive cache management runbook provides operational procedures for monitoring, maintaining, optimizing, and troubleshooting PAMPAX caches, ensuring optimal cache performance and reliability.