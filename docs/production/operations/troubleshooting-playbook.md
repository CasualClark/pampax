# Troubleshooting Playbook

This comprehensive troubleshooting playbook provides systematic procedures for diagnosing and resolving common PAMPAX production issues.

## Troubleshooting Framework

### Diagnostic Methodology

```
┌─────────────────────────────────────────────────────────────┐
│                    TROUBLESHOOTING FRAMEWORK              │
├─────────────────────────────────────────────────────────────┤
│  1. Symptom Identification                                │
│  ├─ User reports and monitoring alerts                    │
│  ├─ Error patterns and frequency                         │
│  └─ Impact assessment                                   │
├─────────────────────────────────────────────────────────────┤
│  2. Information Gathering                                │
│  ├─ Logs analysis (structured + system)                   │
│  ├─ Metrics review (performance + resources)              │
│  ├─ Configuration validation                              │
│  └─ Recent changes identification                        │
├─────────────────────────────────────────────────────────────┤
│  3. Hypothesis Formation                                 │
│  ├─ Root cause analysis                                 │
│  ├─ Component isolation                                 │
│  └─ Reproduction attempts                               │
├─────────────────────────────────────────────────────────────┤
│  4. Systematic Testing                                   │
│  ├─ Isolated component testing                           │
│  ├─ Controlled reproduction                              │
│  └─ Progressive elimination                             │
├─────────────────────────────────────────────────────────────┤
│  5. Resolution Implementation                             │
│  ├─ Targeted fixes                                     │
│  ├─ Configuration adjustments                           │
│  └─ Service recovery                                   │
├─────────────────────────────────────────────────────────────┤
│  6. Validation and Monitoring                             │
│  ├─ Fix verification                                    │
│  ├─ Performance validation                              │
│  └─ Continued monitoring                               │
└─────────────────────────────────────────────────────────────┘
```

### Quick Reference Commands

```bash
# Essential diagnostic commands
pampax health                    # Service health check
pampax config --validate        # Configuration validation
pampax cache stats              # Cache performance
pampax indexer status           # Indexing status

# System diagnostics
systemctl status pampax         # Service status
journalctl -u pampax -n 100   # Service logs
free -h                        # Memory usage
df -h                          # Disk usage
top -p $(pgrep pampax)         # Process resource usage

# Database diagnostics
sqlite3 /var/lib/pampax/pampax.db "PRAGMA integrity_check;"
sqlite3 /var/lib/pampax/pampax.db "PRAGMA foreign_key_check;"
sqlite3 /var/lib/pampax/pampax.db ".schema"

# Network diagnostics
netstat -tlnp | grep :3000   # Port listening
curl -f http://localhost:3000/health  # Health endpoint
ss -tlnp | grep :3000      # Socket status
```

## Common Issue Categories

### 1. Service Availability Issues

#### Symptom: Service Not Responding

**Immediate Diagnosis**:
```bash
#!/bin/bash
# diagnose-service-down.sh - Service availability diagnosis

echo "=== Service Availability Diagnosis ==="
echo "Timestamp: $(date)"
echo ""

# 1. Check process status
echo "1. Process Status"
if pgrep -f "pampax" >/dev/null; then
    echo "   ✓ PAMPAX process is running"
    echo "   PID: $(pgrep -f pampax)"
    echo "   Uptime: $(ps -o etime= -p $(pgrep -f pampax))"
    echo "   Memory: $(ps -o rss= -p $(pgrep -f pampax) | awk '{print $1/1024"MB"}')"
else
    echo "   ✗ PAMPAX process is not running"
    echo "   Checking service status..."
    systemctl status pampax --no-pager
fi
echo ""

# 2. Check port availability
echo "2. Port Status"
if netstat -tlnp | grep -q ":3000"; then
    echo "   ✓ Port 3000 is listening"
    netstat -tlnp | grep ":3000"
else
    echo "   ✗ Port 3000 is not listening"
fi
echo ""

# 3. Check recent logs
echo "3. Recent Error Logs"
if [ -f "/var/log/pampax/pampax.log" ]; then
    echo "   Last 5 error entries:"
    jq -r 'select(.level == "ERROR")' /var/log/pampax/pampax.log | \
        tail -5 | while read -r line; do
            echo "   $line"
        done
else
    echo "   Log file not found"
fi
echo ""

# 4. Check system resources
echo "4. System Resources"
echo "   Memory usage:"
free -h | grep "^Mem:" | awk '{print "   Used: " $3 "/" $2 " (" int($3/$2*100) "%)"}'
echo "   Disk usage:"
df -h /var/lib/pampax | tail -1 | awk '{print "   Used: " $3 "/" $2 " (" $5 ")"}'
echo "   CPU load:"
uptime | awk -F'load average:' '{print "   Load:" $2}'
echo ""

# 5. Check configuration
echo "5. Configuration Status"
if [ -f "/etc/pampax/pampax.toml" ]; then
    echo "   ✓ Configuration file exists"
    if pampax config --validate >/dev/null 2>&1; then
        echo "   ✓ Configuration is valid"
    else
        echo "   ✗ Configuration validation failed"
        pampax config --validate
    fi
else
    echo "   ✗ Configuration file not found"
fi
echo ""

echo "=== Diagnosis Complete ==="
```

**Common Causes and Solutions**:

| Cause | Symptoms | Solution |
|-------|----------|----------|
| **Process Crash** | No running process, error logs | `systemctl restart pampax`, check logs |
| **Port Conflict** | Process running but port not listening | `netstat -tlnp`, change port, kill conflicting process |
| **Resource Exhaustion** | High memory/CPU, OOM killer | Increase resources, optimize configuration |
| **Configuration Error** | Invalid config on startup | `pampax config --validate`, fix configuration |
| **Permission Issues** | File/disk access errors | Check file permissions, ownership |

#### Recovery Procedures

```bash
#!/bin/bash
# recover-service.sh - Service recovery procedures

echo "=== Service Recovery Procedures ==="

# 1. Attempt graceful restart
echo "1. Attempting graceful restart..."
systemctl restart pampax
sleep 10

if systemctl is-active --quiet pampax; then
    echo "   ✓ Service restarted successfully"
    exit 0
fi

# 2. Force restart if graceful fails
echo "2. Graceful restart failed, attempting force restart..."
systemctl kill pampax
sleep 5
systemctl start pampax
sleep 10

if systemctl is-active --quiet pampax; then
    echo "   ✓ Service force restarted successfully"
    exit 0
fi

# 3. Check for resource issues
echo "3. Checking for resource issues..."
MEMORY_USAGE=$(free | grep Mem | awk '{printf "%.1f", $3/$2 * 100.0}')
DISK_USAGE=$(df /var/lib/pampax | tail -1 | awk '{print $5}' | sed 's/%//')

if (( $(echo "$MEMORY_USAGE > 90" | bc -l) )); then
    echo "   High memory usage detected: ${MEMORY_USAGE}%"
    echo "   Killing memory-intensive processes..."
    pkill -f "high-memory-process" 2>/dev/null || true
fi

if [ "$DISK_USAGE" -gt 90 ]; then
    echo "   High disk usage detected: ${DISK_USAGE}%"
    echo "   Cleaning up old files..."
    find /var/log/pampax -name "*.log" -mtime +7 -delete
    find /tmp -name "pampax-*" -mtime +1 -delete
fi

# 4. Check configuration
echo "4. Validating configuration..."
if ! pampax config --validate; then
    echo "   Configuration validation failed, using backup..."
    if [ -f "/etc/pampax/pampax.toml.backup" ]; then
        cp /etc/pampax/pampax.toml.backup /etc/pampax/pampax.toml
        echo "   Restored configuration from backup"
    fi
fi

# 5. Final restart attempt
echo "5. Final restart attempt..."
systemctl start pampax
sleep 10

if systemctl is-active --quiet pampax; then
    echo "   ✓ Service recovered successfully"
else
    echo "   ✗ Service recovery failed - manual intervention required"
    echo "   Last 50 lines of service logs:"
    journalctl -u pampax -n 50 --no-pager
    exit 1
fi
```

### 2. Performance Issues

#### Symptom: Slow Response Times

**Performance Diagnosis Script**:

```bash
#!/bin/bash
# diagnose-performance.sh - Performance issue diagnosis

echo "=== Performance Issue Diagnosis ==="
echo "Timestamp: $(date)"
echo ""

# 1. Measure current performance
echo "1. Current Performance Metrics"
echo "   API Response Times:"
for i in {1..5}; do
    response_time=$(curl -o /dev/null -s -w "%{time_total}" http://localhost:3000/health)
    echo "   Attempt $i: ${response_time}s"
done
echo ""

# 2. System resource analysis
echo "2. System Resource Analysis"
echo "   CPU Usage:"
top -bn1 | grep "Cpu(s)" | awk '{print "   " $2 " " $3 " " $4}'
echo ""
echo "   Memory Usage:"
free -h
echo ""
echo "   I/O Wait:"
iostat -x 1 2 | tail -n +4
echo ""

# 3. Process-specific metrics
echo "3. PAMPAX Process Metrics"
if pgrep -f pampax >/dev/null; then
    PID=$(pgrep -f pampax)
    echo "   Process ID: $PID"
    echo "   Memory Usage: $(ps -o rss= -p $PID | awk '{print $1/1024"MB"}')"
    echo "   CPU Usage: $(ps -o %cpu= -p $PID)%"
    echo "   Thread Count: $(ps -o nlwp= -p $PID)"
    echo "   Open Files: $(lsof -p $PID | wc -l)"
else
    echo "   PAMPAX process not found"
fi
echo ""

# 4. Cache performance
echo "4. Cache Performance Analysis"
if command -v pampax >/dev/null 2>&1; then
    echo "   Cache statistics:"
    pampax cache stats 2>/dev/null || echo "   Cache stats unavailable"
else
    echo "   PAMPAX CLI not available"
fi
echo ""

# 5. Database performance
echo "5. Database Performance"
if [ -f "/var/lib/pampax/pampax.db" ]; then
    echo "   Database size: $(du -h /var/lib/pampax/pampax.db | cut -f1)"
    echo "   Page count: $(sqlite3 /var/lib/pampax/pampax.db "PRAGMA page_count;")"
    echo "   Cache size: $(sqlite3 /var/lib/pampax/pampax.db "PRAGMA cache_size;")"
    
    echo "   Query performance test:"
    start_time=$(date +%s.%N)
    sqlite3 /var/lib/pampax/pampax.db "SELECT COUNT(*) FROM files;" >/dev/null
    end_time=$(date +%s.%N)
    query_time=$(echo "$end_time - $start_time" | bc)
    echo "   Simple query time: ${query_time}s"
else
    echo "   Database file not found"
fi
echo ""

# 6. Network performance
echo "6. Network Performance"
echo "   Connection count: $(netstat -an | grep :3000 | wc -l)"
echo "   Active connections: $(netstat -an | grep :3000 | grep ESTABLISHED | wc -l)"
echo "   Network latency:"
ping -c 3 localhost | tail -1
echo ""

echo "=== Performance Diagnosis Complete ==="
```

**Performance Optimization Checklist**:

```bash
#!/bin/bash
# optimize-performance.sh - Performance optimization procedures

echo "=== Performance Optimization ==="

# 1. Cache optimization
echo "1. Cache Optimization"
if pampax cache stats | grep -q "hit_rate.*< 0.6"; then
    echo "   Low cache hit rate detected, warming cache..."
    pampax cache warm /var/lib/pampax
else
    echo "   Cache hit rate is acceptable"
fi

# 2. Database optimization
echo "2. Database Optimization"
if [ -f "/var/lib/pampax/pampax.db" ]; then
    echo "   Optimizing database..."
    sqlite3 /var/lib/pampax/pampax.db "VACUUM;"
    sqlite3 /var/lib/pampax/pampax.db "ANALYZE;"
    echo "   Database optimization completed"
fi

# 3. Memory optimization
echo "3. Memory Optimization"
echo "   Triggering garbage collection..."
if pgrep -f pampax >/dev/null; then
    PID=$(pgrep -f pampax)
    # Send SIGUSR2 to trigger GC if implemented
    kill -USR2 $PID 2>/dev/null || echo "   GC signal not supported"
fi

# 4. Configuration optimization
echo "4. Configuration Review"
echo "   Current cache settings:"
pampax config --show | grep -A 5 "\[cache\]" || echo "   Cache settings not found"

echo "   Current performance settings:"
pampax config --show | grep -A 10 "\[performance\]" || echo "   Performance settings not found"

echo "=== Performance Optimization Complete ==="
```

### 3. Cache Issues

#### Symptom: Cache Performance Problems

**Cache Diagnosis**:

```bash
#!/bin/bash
# diagnose-cache.sh - Cache issue diagnosis

echo "=== Cache Issue Diagnosis ==="
echo "Timestamp: $(date)"
echo ""

# 1. Cache statistics
echo "1. Cache Statistics"
if command -v pampax >/dev/null 2>&1; then
    echo "   Current cache stats:"
    pampax cache stats
else
    echo "   PAMPAX CLI not available for cache stats"
fi
echo ""

# 2. Cache file analysis
echo "2. Cache File Analysis"
CACHE_DIR="/var/lib/pampax/cache"
if [ -d "$CACHE_DIR" ]; then
    echo "   Cache directory: $CACHE_DIR"
    echo "   Cache size: $(du -sh $CACHE_DIR 2>/dev/null | cut -f1 || echo "Unable to determine")"
    echo "   File count: $(find $CACHE_DIR -type f 2>/dev/null | wc -l)"
    echo "   Directory structure:"
    find $CACHE_DIR -type d | head -10
    echo "   Recent cache files:"
    find $CACHE_DIR -type f -mtime -1 | head -5
else
    echo "   Cache directory not found"
fi
echo ""

# 3. Memory cache analysis
echo "3. Memory Cache Analysis"
if pgrep -f pampax >/dev/null; then
    PID=$(pgrep -f pampax)
    echo "   Process memory map:"
    pmap $PID | grep -E "(cache|Cache)" | head -5
    echo "   Shared memory segments:"
    ipcs -m 2>/dev/null | head -5 || echo "   No shared memory segments"
else
    echo "   PAMPAX process not running"
fi
echo ""

# 4. Cache hit rate analysis
echo "4. Cache Hit Rate Analysis"
if [ -f "/var/log/pampax/pampax.log" ]; then
    echo "   Recent cache activity (last hour):"
    one_hour_ago=$(date -d '1 hour ago' +%s)
    
    cache_hits=$(jq -r "select(.component==\"cache\" and .op==\"hit\" and .timestamp>$one_hour_ago)" /var/log/pampax/pampax.log | wc -l)
    cache_misses=$(jq -r "select(.component==\"cache\" and .op==\"miss\" and .timestamp>$one_hour_ago)" /var/log/pampax/pampax.log | wc -l)
    
    if [ $((cache_hits + cache_misses)) -gt 0 ]; then
        hit_rate=$(echo "scale=2; $cache_hits * 100 / ($cache_hits + $cache_misses)" | bc)
        echo "   Cache hits: $cache_hits"
        echo "   Cache misses: $cache_misses"
        echo "   Hit rate: ${hit_rate}%"
    else
        echo "   No cache activity in the last hour"
    fi
else
    echo "   Log file not available"
fi
echo ""

# 5. Cache configuration validation
echo "5. Cache Configuration"
if command -v pampax >/dev/null 2>&1; then
    echo "   Current cache configuration:"
    pampax config --show | grep -A 10 "\[cache\]" || echo "   Cache configuration not found"
else
    echo "   Unable to retrieve cache configuration"
fi
echo ""

echo "=== Cache Diagnosis Complete ==="
```

**Cache Recovery Procedures**:

```bash
#!/bin/bash
# recover-cache.sh - Cache recovery procedures

echo "=== Cache Recovery Procedures ==="

# 1. Backup current cache
echo "1. Backing up current cache..."
CACHE_DIR="/var/lib/pampax/cache"
BACKUP_DIR="/var/lib/pampax/cache.backup.$(date +%Y%m%d_%H%M%S)"

if [ -d "$CACHE_DIR" ]; then
    cp -r "$CACHE_DIR" "$BACKUP_DIR"
    echo "   Cache backed up to: $BACKUP_DIR"
else
    echo "   No cache directory to backup"
fi

# 2. Clear corrupted cache
echo "2. Clearing cache..."
if command -v pampax >/dev/null 2>&1; then
    pampax cache clear --all
    echo "   Cache cleared via PAMPAX CLI"
else
    rm -rf "$CACHE_DIR"
    mkdir -p "$CACHE_DIR"
    echo "   Cache cleared manually"
fi

# 3. Rebuild cache
echo "3. Rebuilding cache..."
if command -v pampax >/dev/null 2>&1; then
    echo "   Warming cache with common queries..."
    # Add common query warming logic here
    pampax cache warm /var/lib/pampax
    echo "   Cache rebuild completed"
else
    echo "   Unable to rebuild cache - PAMPAX CLI not available"
fi

# 4. Validate cache
echo "4. Validating cache..."
if command -v pampax >/dev/null 2>&1; then
    if pampax cache stats >/dev/null 2>&1; then
        echo "   ✓ Cache is functioning correctly"
    else
        echo "   ✗ Cache validation failed"
    fi
else
    echo "   Unable to validate cache"
fi

echo "=== Cache Recovery Complete ==="
```

### 4. Database Issues

#### Symptom: Database Performance or Corruption

**Database Diagnosis**:

```bash
#!/bin/bash
# diagnose-database.sh - Database issue diagnosis

echo "=== Database Issue Diagnosis ==="
echo "Timestamp: $(date)"
echo ""

DB_PATH="/var/lib/pampax/pampax.db"

# 1. Database file analysis
echo "1. Database File Analysis"
if [ -f "$DB_PATH" ]; then
    echo "   Database file: $DB_PATH"
    echo "   File size: $(du -h $DB_PATH | cut -f1)"
    echo "   File permissions: $(ls -l $DB_PATH | awk '{print $1 " " $3 " " $4}')"
    echo "   Last modified: $(stat -c %y $DB_PATH)"
    echo "   Inode: $(stat -c %i $DB_PATH)"
else
    echo "   ✗ Database file not found"
    exit 1
fi
echo ""

# 2. Database integrity check
echo "2. Database Integrity Check"
echo "   Running PRAGMA integrity_check..."
integrity_result=$(sqlite3 "$DB_PATH" "PRAGMA integrity_check;" 2>&1)
if echo "$integrity_result" | grep -q "ok"; then
    echo "   ✓ Database integrity check passed"
else
    echo "   ✗ Database integrity check failed:"
    echo "$integrity_result" | head -10
fi
echo ""

# 3. Foreign key check
echo "3. Foreign Key Check"
fk_result=$(sqlite3 "$DB_PATH" "PRAGMA foreign_key_check;" 2>&1)
if [ -z "$fk_result" ]; then
    echo "   ✓ Foreign key check passed"
else
    echo "   ✗ Foreign key violations found:"
    echo "$fk_result" | head -10
fi
echo ""

# 4. Database schema analysis
echo "4. Database Schema Analysis"
echo "   Tables:"
sqlite3 "$DB_PATH" ".tables" | tr ' ' '\n' | grep -v '^$' | while read -r table; do
    if [ -n "$table" ]; then
        row_count=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM $table;")
        echo "   $table: $row_count rows"
    fi
done
echo ""

# 5. Database performance metrics
echo "5. Database Performance Metrics"
echo "   Page count: $(sqlite3 "$DB_PATH" "PRAGMA page_count;")"
echo "   Page size: $(sqlite3 "$DB_PATH" "PRAGMA page_size;") bytes"
echo "   Cache size: $(sqlite3 "$DB_PATH" "PRAGMA cache_size;") pages"
echo "   Journal mode: $(sqlite3 "$DB_PATH" "PRAGMA journal_mode;")"
echo "   Synchronous mode: $(sqlite3 "$DB_PATH" "PRAGMA synchronous;")"
echo ""

# 6. Query performance test
echo "6. Query Performance Test"
queries=(
    "SELECT COUNT(*) FROM files;"
    "SELECT name FROM sqlite_master WHERE type='table';"
    "PRAGMA table_info(files);"
)

for query in "${queries[@]}"; do
    echo "   Testing: $query"
    start_time=$(date +%s.%N)
    result=$(sqlite3 "$DB_PATH" "$query" 2>/dev/null)
    end_time=$(date +%s.%N)
    query_time=$(echo "$end_time - $start_time" | bc)
    echo "   Result: $result"
    echo "   Time: ${query_time}s"
    echo ""
done

# 7. Lock and contention analysis
echo "7. Lock Analysis"
if pgrep -f pampax >/dev/null; then
    echo "   Active database connections:"
    lsof "$DB_PATH" 2>/dev/null | grep -v "COMMAND" | wc -l | xargs echo "   Connections:"
    
    echo "   Process file descriptors:"
    pgrep -f pampax | head -1 | xargs lsof -p | grep "$DB_PATH" | wc -l | xargs echo "   FDs:"
else
    echo "   No active PAMPAX process"
fi
echo ""

echo "=== Database Diagnosis Complete ==="
```

**Database Recovery Procedures**:

```bash
#!/bin/bash
# recover-database.sh - Database recovery procedures

echo "=== Database Recovery Procedures ==="

DB_PATH="/var/lib/pampax/pampax.db"
BACKUP_DIR="/var/lib/pampax/backup"

# 1. Create emergency backup
echo "1. Creating emergency backup..."
EMERGENCY_BACKUP="$BACKUP_DIR/emergency.$(date +%Y%m%d_%H%M%S).db"
mkdir -p "$BACKUP_DIR"

if [ -f "$DB_PATH" ]; then
    cp "$DB_PATH" "$EMERGENCY_BACKUP"
    echo "   Emergency backup created: $EMERGENCY_BACKUP"
else
    echo "   No database file to backup"
    exit 1
fi

# 2. Attempt database repair
echo "2. Attempting database repair..."
REPAIRED_DB="/var/lib/pampax/pampax_repaired.db"

# Stop the service first
echo "   Stopping PAMPAX service..."
systemctl stop pampax

# Attempt repair using SQLite's .recover command
echo "   Running database recovery..."
sqlite3 "$DB_PATH" ".recover" | sqlite3 "$REPAIRED_DB" 2>/dev/null

if [ -f "$REPAIRED_DB" ] && [ -s "$REPAIRED_DB" ]; then
    echo "   Database repair completed"
    
    # Validate repaired database
    if sqlite3 "$REPAIRED_DB" "PRAGMA integrity_check;" | grep -q "ok"; then
        echo "   ✓ Repaired database is valid"
        
        # Replace original database
        mv "$DB_PATH" "$DB_PATH.corrupted"
        mv "$REPAIRED_DB" "$DB_PATH"
        echo "   Replaced original database with repaired version"
    else
        echo "   ✗ Repaired database is still corrupted"
    fi
else
    echo "   ✗ Database repair failed"
fi

# 3. Try backup restoration if repair failed
if [ ! -f "$DB_PATH" ] || ! sqlite3 "$DB_PATH" "PRAGMA integrity_check;" | grep -q "ok"; then
    echo "3. Attempting backup restoration..."
    
    # Find latest good backup
    LATEST_BACKUP=$(find "$BACKUP_DIR" -name "*.db" -type f -mtime -7 | sort -r | head -1)
    
    if [ -n "$LATEST_BACKUP" ]; then
        echo "   Found backup: $LATEST_BACKUP"
        
        # Validate backup
        if sqlite3 "$LATEST_BACKUP" "PRAGMA integrity_check;" | grep -q "ok"; then
            echo "   ✓ Backup is valid"
            cp "$LATEST_BACKUP" "$DB_PATH"
            echo "   Restored database from backup"
        else
            echo "   ✗ Backup is also corrupted"
        fi
    else
        echo "   No valid backup found"
    fi
fi

# 4. Database optimization
if [ -f "$DB_PATH" ] && sqlite3 "$DB_PATH" "PRAGMA integrity_check;" | grep -q "ok"; then
    echo "4. Optimizing database..."
    sqlite3 "$DB_PATH" "VACUUM;"
    sqlite3 "$DB_PATH" "ANALYZE;"
    echo "   Database optimization completed"
fi

# 5. Restart service
echo "5. Restarting service..."
systemctl start pampax
sleep 5

if systemctl is-active --quiet pampax; then
    echo "   ✓ Service restarted successfully"
    
    # Final validation
    if pampax health >/dev/null 2>&1; then
        echo "   ✓ Database recovery successful"
    else
        echo "   ✗ Service health check failed"
    fi
else
    echo "   ✗ Service failed to start"
fi

echo "=== Database Recovery Complete ==="
```

### 5. Memory Issues

#### Symptom: Memory Leaks or High Memory Usage

**Memory Diagnosis**:

```bash
#!/bin/bash
# diagnose-memory.sh - Memory issue diagnosis

echo "=== Memory Issue Diagnosis ==="
echo "Timestamp: $(date)"
echo ""

# 1. System memory overview
echo "1. System Memory Overview"
free -h
echo ""

# 2. PAMPAX process memory usage
echo "2. PAMPAX Process Memory Usage"
if pgrep -f pampax >/dev/null; then
    PID=$(pgrep -f pampax)
    echo "   Process ID: $PID"
    echo "   Memory usage details:"
    ps aux | grep "$PID" | grep -v grep
    
    echo "   Detailed memory map:"
    cat /proc/$PID/status | grep -E "(VmRSS|VmSize|VmPeak|VmHWM|VmData|VmStk|VmLib|VmPTE)"
    
    echo "   Memory usage by segment:"
    pmap -x "$PID" | tail -n +3 | awk '
        BEGIN { total=0 }
        {
            if ($1 != "total") {
                total += $2
                printf "   %-20s %8s KB %8s KB %8s KB\n", $6, $2, $3, $4
            }
        }
        END {
            printf "   %-20s %8s KB %8s KB %8s KB\n", "TOTAL", total, "-", "-"
        }
    '
else
    echo "   PAMPAX process not found"
fi
echo ""

# 3. Memory trend analysis
echo "3. Memory Trend Analysis (last hour)"
if [ -f "/var/log/pampax/pampax.log" ]; then
    one_hour_ago=$(date -d '1 hour ago' +%s)
    
    echo "   Memory usage samples:"
    jq -r "select(.component==\"system\" and .memory_usage) | \"\(.timestamp): \(.memory_usage)MB\"" /var/log/pampax/pampax.log | \
        awk -v threshold="$one_hour_ago" '
        {
            gsub(/[^0-9]/, "", $1)
            if ($1 > threshold) {
                print $0
            }
        }' | tail -10
else
    echo "   No memory usage logs available"
fi
echo ""

# 4. Garbage collection analysis
echo "4. Garbage Collection Analysis"
if pgrep -f pampax >/dev/null; then
    PID=$(pgrep -f pampax)
    
    # Check for Node.js GC logs
    if [ -f "/var/log/pampax/pampax.log" ]; then
        echo "   Recent GC events:"
        jq -r 'select(.msg | test("GC|garbage"))' /var/log/pampax/pampax.log | tail -5
    fi
    
    # Check heap statistics if Node.js
    if command -v node >/dev/null 2>&1; then
        echo "   Attempting heap dump analysis..."
        # Add heap dump logic here if applicable
    fi
else
    echo "   PAMPAX process not running"
fi
echo ""

# 5. Memory leak detection
echo "5. Memory Leak Detection"
echo "   Checking for increasing memory usage patterns..."

if [ -f "/var/log/pampax/pampax.log" ]; then
    # Extract memory usage over time
    memory_samples=$(jq -r 'select(.memory_usage) | .memory_usage' /var/log/pampax/pampax.log 2>/dev/null | tail -20)
    
    if [ -n "$memory_samples" ]; then
        sample_count=$(echo "$memory_samples" | wc -l)
        if [ "$sample_count" -gt 5 ]; then
            first_sample=$(echo "$memory_samples" | head -1)
            last_sample=$(echo "$memory_samples" | tail -1)
            
            if [ "$last_sample" -gt "$((first_sample + 100))" ]; then
                echo "   ⚠️  Potential memory leak detected"
                echo "   Memory increased from ${first_sample}MB to ${last_sample}MB"
            else
                echo "   ✓ No significant memory growth detected"
            fi
        else
            echo "   Insufficient samples for trend analysis"
        fi
    else
        echo "   No memory usage data available"
    fi
fi
echo ""

# 6. Swap usage analysis
echo "6. Swap Usage Analysis"
swapon --show
echo "Swap usage:"
free -h | grep Swap
echo ""

echo "=== Memory Diagnosis Complete ==="
```

**Memory Recovery Procedures**:

```bash
#!/bin/bash
# recover-memory.sh - Memory issue recovery

echo "=== Memory Recovery Procedures ==="

# 1. Clear system caches
echo "1. Clearing system caches..."
echo "   Clearing page cache..."
sync
echo 3 > /proc/sys/vm/drop_caches
echo "   System caches cleared"

# 2. Optimize PAMPAX process
echo "2. Optimizing PAMPAX process..."
if pgrep -f pampax >/dev/null; then
    PID=$(pgrep -f pampax)
    
    echo "   Sending memory optimization signals..."
    # Send signals that might trigger GC (implementation-specific)
    kill -USR2 $PID 2>/dev/null || echo "   USR2 signal not supported"
    
    echo "   Checking for memory leaks..."
    # Add memory leak detection logic here
    
    echo "   Process memory after optimization:"
    ps -o pid,rss,vsz,comm -p $PID
else
    echo "   PAMPAX process not running"
fi
echo ""

# 3. Restart service if necessary
echo "3. Service restart consideration..."
if pgrep -f pampax >/dev/null; then
    PID=$(pgrep -f pampax)
    MEMORY_MB=$(ps -o rss= -p $PID | awk '{print int($1/1024)}')
    
    if [ "$MEMORY_MB" -gt 2048 ]; then
        echo "   High memory usage detected (${MEMORY_MB}MB), considering restart..."
        
        # Graceful restart
        echo "   Performing graceful restart..."
        systemctl restart pampax
        sleep 10
        
        if systemctl is-active --quiet pampax; then
            echo "   ✓ Service restarted successfully"
            NEW_MEMORY_MB=$(ps -o rss= -p $(pgrep -f pampax) | awk '{print int($1/1024)}')
            echo "   New memory usage: ${NEW_MEMORY_MB}MB"
        else
            echo "   ✗ Service restart failed"
        fi
    else
        echo "   Memory usage is acceptable (${MEMORY_MB}MB)"
    fi
fi
echo ""

# 4. Long-term memory optimization
echo "4. Long-term Memory Optimization"
echo "   Configuration recommendations:"
echo "   - Consider reducing cache sizes if memory is constrained"
echo "   - Enable memory monitoring alerts"
echo "   - Schedule regular service restarts if needed"
echo "   - Investigate memory leaks in application code"

if [ -f "/etc/pampax/pampax.toml" ]; then
    echo "   Current memory-related configuration:"
    grep -E "(memory|cache)" /etc/pampax/pampax.toml || echo "   No memory settings found"
fi
echo ""

echo "=== Memory Recovery Complete ==="
```

## Advanced Troubleshooting Tools

### Comprehensive Diagnostic Script

```bash
#!/bin/bash
# comprehensive-diagnostic.sh - Full system diagnostic

INCIDENT_ID=$1
OUTPUT_DIR="/var/log/pampax/diagnostics/$(date +%Y%m%d_%H%M%S)"

mkdir -p "$OUTPUT_DIR"

echo "=== Comprehensive PAMPAX Diagnostic ==="
echo "Incident ID: $INCIDENT_ID"
echo "Output Directory: $OUTPUT_DIR"
echo "Timestamp: $(date)"
echo ""

# 1. System information
echo "1. Collecting System Information..."
{
    echo "=== System Information ==="
    echo "Hostname: $(hostname)"
    echo "OS: $(uname -a)"
    echo "Uptime: $(uptime)"
    echo "Kernel: $(uname -r)"
    echo ""
    
    echo "=== Memory Information ==="
    free -h
    echo ""
    
    echo "=== Disk Information ==="
    df -h
    echo ""
    
    echo "=== CPU Information ==="
    lscpu | grep -E "(Model name|CPU\(s\)|Thread)"
    echo ""
    
    echo "=== Load Average ==="
    cat /proc/loadavg
    echo ""
} > "$OUTPUT_DIR/system-info.txt"

# 2. PAMPAX service status
echo "2. Collecting Service Status..."
{
    echo "=== Service Status ==="
    systemctl status pampax --no-pager
    echo ""
    
    echo "=== Service Logs (last 100 lines) ==="
    journalctl -u pampax -n 100 --no-pager
    echo ""
    
    echo "=== Process Information ==="
    if pgrep -f pampax >/dev/null; then
        PID=$(pgrep -f pampax)
        ps aux | grep "$PID" | grep -v grep
        echo ""
        
        echo "=== Process Environment ==="
        cat /proc/$PID/environ | tr '\0' '\n' | grep -E "^(PAMPAX|NODE_)" | sort
        echo ""
        
        echo "=== Process Limits ==="
        cat /proc/$PID/limits
        echo ""
        
        echo "=== Open Files ==="
        lsof -p $PID | head -20
        echo ""
    else
        echo "PAMPAX process not found"
    fi
} > "$OUTPUT_DIR/service-status.txt"

# 3. Application logs
echo "3. Collecting Application Logs..."
if [ -f "/var/log/pampax/pampax.log" ]; then
    cp "/var/log/pampax/pampax.log" "$OUTPUT_DIR/application.log"
    
    # Extract error logs
    {
        echo "=== Error Logs (last 100) ==="
        jq -r 'select(.level == "ERROR")' /var/log/pampax/pampax.log | tail -100
        echo ""
        
        echo "=== Warning Logs (last 100) ==="
        jq -r 'select(.level == "WARN")' /var/log/pampax/pampax.log | tail -100
        echo ""
        
        echo "=== Performance Issues (slow operations) ==="
        jq -r 'select(.duration_ms | . > 1000)' /var/log/pampax/pampax.log | tail -50
        echo ""
    } > "$OUTPUT_DIR/log-analysis.txt"
fi

# 4. Database information
echo "4. Collecting Database Information..."
if [ -f "/var/lib/pampax/pampax.db" ]; then
    {
        echo "=== Database Information ==="
        echo "File size: $(du -h /var/lib/pampax/pampax.db | cut -f1)"
        echo "Last modified: $(stat -c %y /var/lib/pampax/pampax.db)"
        echo ""
        
        echo "=== Database Schema ==="
        sqlite3 /var/lib/pampax/pampax.db ".schema"
        echo ""
        
        echo "=== Database Statistics ==="
        sqlite3 /var/lib/pampax/pampax.db "SELECT 'files', COUNT(*) FROM files UNION SELECT 'total_size', SUM(LENGTH(content)) FROM files;"
        echo ""
        
        echo "=== Database Integrity ==="
        sqlite3 /var/lib/pampax/pampax.db "PRAGMA integrity_check;"
        echo ""
        
        echo "=== Foreign Key Check ==="
        sqlite3 /var/lib/pampax/pampax.db "PRAGMA foreign_key_check;"
        echo ""
    } > "$OUTPUT_DIR/database-info.txt"
fi

# 5. Configuration information
echo "5. Collecting Configuration Information..."
{
    echo "=== PAMPAX Configuration ==="
    if [ -f "/etc/pampax/pampax.toml" ]; then
        cat /etc/pampax/pampax.toml
    else
        echo "Configuration file not found"
    fi
    echo ""
    
    echo "=== Environment Variables ==="
    env | grep -E "^PAMPAX_" | sort
    echo ""
    
    echo "=== Configuration Validation ==="
    pampax config --validate 2>&1 || echo "Configuration validation failed"
    echo ""
} > "$OUTPUT_DIR/configuration.txt"

# 6. Network information
echo "6. Collecting Network Information..."
{
    echo "=== Network Connections ==="
    netstat -tlnp | grep :3000
    echo ""
    
    echo "=== Socket Statistics ==="
    ss -tlnp | grep :3000
    echo ""
    
    echo "=== Network Interface Statistics ==="
    cat /proc/net/dev
    echo ""
    
    echo "=== Routing Table ==="
    ip route show
    echo ""
} > "$OUTPUT_DIR/network-info.txt"

# 7. Performance metrics
echo "7. Collecting Performance Metrics..."
{
    echo "=== Current Performance Metrics ==="
    
    # API response times
    echo "API Response Times:"
    for i in {1..5}; do
        response_time=$(curl -o /dev/null -s -w "%{time_total}" http://localhost:3000/health 2>/dev/null)
        echo "  Attempt $i: ${response_time}s"
    done
    echo ""
    
    # Cache statistics
    echo "Cache Statistics:"
    pampax cache stats 2>/dev/null || echo "Cache stats unavailable"
    echo ""
    
    # Resource usage
    echo "Resource Usage:"
    if pgrep -f pampax >/dev/null; then
        PID=$(pgrep -f pampax)
        echo "  Memory: $(ps -o rss= -p $PID | awk '{print int($1/1024)"MB"}')"
        echo "  CPU: $(ps -o %cpu= -p $PID)%"
        echo "  Threads: $(ps -o nlwp= -p $PID)"
    fi
    echo ""
} > "$OUTPUT_DIR/performance-metrics.txt"

# 8. Create summary report
echo "8. Creating Summary Report..."
{
    echo "=== PAMPAX Diagnostic Summary ==="
    echo "Incident ID: $INCIDENT_ID"
    echo "Timestamp: $(date)"
    echo "Diagnostic ID: $(basename $OUTPUT_DIR)"
    echo ""
    
    echo "=== Quick Health Check ==="
    if systemctl is-active --quiet pampax; then
        echo "✓ Service is running"
    else
        echo "✗ Service is not running"
    fi
    
    if curl -f http://localhost:3000/health >/dev/null 2>&1; then
        echo "✓ Health endpoint responding"
    else
        echo "✗ Health endpoint not responding"
    fi
    
    if [ -f "/var/lib/pampax/pampax.db" ]; then
        if sqlite3 /var/lib/pampax/pampax.db "PRAGMA integrity_check;" | grep -q "ok"; then
            echo "✓ Database integrity OK"
        else
            echo "✗ Database integrity issues"
        fi
    else
        echo "✗ Database file missing"
    fi
    echo ""
    
    echo "=== Key Metrics ==="
    if pgrep -f pampax >/dev/null; then
        PID=$(pgrep -f pampax)
        echo "Memory Usage: $(ps -o rss= -p $PID | awk '{print int($1/1024)"MB"}')"
        echo "CPU Usage: $(ps -o %cpu= -p $PID)%"
    fi
    
    if [ -f "/var/lib/pampax/pampax.db" ]; then
        echo "Database Size: $(du -h /var/lib/pampax/pampax.db | cut -f1)"
    fi
    
    echo "Disk Usage: $(df -h /var/lib/pampax | tail -1 | awk '{print $5}')"
    echo ""
    
    echo "=== Recent Errors (last 10) ==="
    if [ -f "/var/log/pampax/pampax.log" ]; then
        jq -r 'select(.level == "ERROR") | "\(.timestamp): \(.msg)"' /var/log/pampax/pampax.log | tail -10
    fi
    echo ""
    
    echo "=== Files Generated ==="
    ls -la "$OUTPUT_DIR"
} > "$OUTPUT_DIR/summary.txt"

# 9. Compress diagnostic package
echo "9. Creating diagnostic package..."
cd "$(dirname "$OUTPUT_DIR")"
tar -czf "$(basename "$OUTPUT_DIR").tar.gz" "$(basename "$OUTPUT_DIR")"

echo ""
echo "=== Diagnostic Complete ==="
echo "Package created: $(dirname "$OUTPUT_DIR")/$(basename "$OUTPUT_DIR").tar.gz"
echo "Summary file: $OUTPUT_DIR/summary.txt"
echo ""
echo "To review results:"
echo "  cat $OUTPUT_DIR/summary.txt"
echo "  tar -tzf $(dirname "$OUTPUT_DIR")/$(basename "$OUTPUT_DIR").tar.gz"
```

This comprehensive troubleshooting playbook provides systematic procedures for diagnosing and resolving common PAMPAX production issues, with detailed diagnostic scripts and recovery procedures for each major category of problems.