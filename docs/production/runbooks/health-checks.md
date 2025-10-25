# Health Checks Runbook

## Overview

This runbook provides procedures for interpreting PAMPAX health check results and responding to various health conditions. It covers manual health checks, automated monitoring, and response procedures.

## 1. Health Check Types

### 1.1 Service Health Check

**Endpoint:** `GET /health`

**Expected Response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-01-XXTXX:XX:XX.XXXZ",
  "uptime": 3600,
  "version": "1.0.0",
  "checks": {
    "database": "healthy",
    "cache": "healthy",
    "search": "healthy",
    "memory": "healthy"
  }
}
```

**Response Interpretation:**
- `status: "healthy"` - All systems operational
- `status: "degraded"` - Some systems have issues but service is functional
- `status: "unhealthy"` - Critical systems are down

### 1.2 Detailed Health Check

**Endpoint:** `GET /health/detailed`

**Expected Response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-01-XXTXX:XX:XX.XXXZ",
  "uptime": 3600,
  "version": "1.0.0",
  "checks": {
    "database": {
      "status": "healthy",
      "response_time": 15,
      "connections": 5,
      "max_connections": 100
    },
    "cache": {
      "status": "healthy",
      "hit_rate": 0.85,
      "memory_usage": 0.45,
      "evictions": 0
    },
    "search": {
      "status": "healthy",
      "response_time": 25,
      "index_size": "2.5GB",
      "query_rate": 10
    },
    "memory": {
      "status": "healthy",
      "usage": 0.65,
      "available": "4GB",
      "pressure": "low"
    }
  }
}
```

### 1.3 Readiness Check

**Endpoint:** `GET /ready`

**Purpose:** Determines if service is ready to accept traffic

**Response:**
```json
{
  "ready": true,
  "checks": {
    "database_connected": true,
    "cache_warm": true,
    "search_index_loaded": true
  }
}
```

### 1.4 Liveness Check

**Endpoint:** `GET /live`

**Purpose:** Determines if service is still running (no response means dead)

**Response:**
```json
{
  "alive": true,
  "timestamp": "2025-01-XXTXX:XX:XX.XXXZ"
}
```

## 2. Manual Health Check Procedures

### 2.1 Quick Health Check

```bash
#!/bin/bash
# quick-health-check.sh

set -euo pipefail

BASE_URL="http://localhost:3000"
TIMEOUT=10

echo "Performing quick health check..."

# Basic health check
if curl -f -s --max-time $TIMEOUT "$BASE_URL/health" >/dev/null; then
    echo "✓ Service is responding"
else
    echo "✗ Service is not responding"
    exit 1
fi

# Detailed health check
HEALTH_RESPONSE=$(curl -s --max-time $TIMEOUT "$BASE_URL/health/detailed")
STATUS=$(echo "$HEALTH_RESPONSE" | jq -r '.status')

echo "Overall Status: $STATUS"

# Check individual components
echo "$HEALTH_RESPONSE" | jq -r '.checks | to_entries[] | "\(.key): \(.value.status // .value)"'

# Readiness check
if curl -f -s --max-time $TIMEOUT "$BASE_URL/ready" >/dev/null; then
    echo "✓ Service is ready"
else
    echo "✗ Service is not ready"
fi

echo "Health check completed"
```

### 2.2 Comprehensive Health Check

```bash
#!/bin/bash
# comprehensive-health-check.sh

set -euo pipefail

BASE_URL="http://localhost:3000"
TIMEOUT=30
LOG_FILE="/var/log/pampax/health-check-$(date +%Y%m%d_%H%M%S).log"

exec > >(tee -a "$LOG_FILE")
exec 2>&1

echo "=== Comprehensive Health Check - $(date) ==="

# Service availability
echo "1. Service Availability Check"
if curl -f -s --max-time $TIMEOUT "$BASE_URL/health" >/dev/null; then
    echo "   ✓ Service is accessible"
else
    echo "   ✗ Service is not accessible"
    echo "   → Check if service is running: systemctl status pampax"
    exit 1
fi

# Detailed component analysis
echo "2. Component Health Analysis"
HEALTH_RESPONSE=$(curl -s --max-time $TIMEOUT "$BASE_URL/health/detailed")

echo "$HEALTH_RESPONSE" | jq -r '.checks | to_entries[] | 
"   \(.key): 
     Status: \(.value.status // .value)
     Response Time: \(.value.response_time // "N/A")ms
     Details: \(.value | del(.status, .response_time) | to_entries | map("\(.key): \(.value)") | join(", "))"'

# Performance metrics
echo "3. Performance Metrics"
METRICS_RESPONSE=$(curl -s --max-time $TIMEOUT "$BASE_URL/metrics")

if [ $? -eq 0 ]; then
    echo "   ✓ Metrics endpoint accessible"
    
    # Extract key metrics
    MEMORY_USAGE=$(echo "$METRICS_RESPONSE" | jq -r '.memory_usage // "N/A"')
    CPU_USAGE=$(echo "$METRICS_RESPONSE" | jq -r '.cpu_usage // "N/A"')
    REQUEST_RATE=$(echo "$METRICS_RESPONSE" | jq -r '.request_rate // "N/A"')
    
    echo "   Memory Usage: $MEMORY_USAGE"
    echo "   CPU Usage: $CPU_USAGE"
    echo "   Request Rate: $REQUEST_RATE"
else
    echo "   ✗ Metrics endpoint not accessible"
fi

# Database connectivity
echo "4. Database Connectivity Check"
DB_CHECK=$(echo "$HEALTH_RESPONSE" | jq -r '.checks.database.status // "unknown"')
if [ "$DB_CHECK" = "healthy" ]; then
    echo "   ✓ Database connection healthy"
else
    echo "   ✗ Database connection issue: $DB_CHECK"
    echo "   → Check database logs: journalctl -u pampax --since '1 hour ago'"
fi

# Cache status
echo "5. Cache Status Check"
CACHE_CHECK=$(echo "$HEALTH_RESPONSE" | jq -r '.checks.cache.status // "unknown"')
if [ "$CACHE_CHECK" = "healthy" ]; then
    HIT_RATE=$(echo "$HEALTH_RESPONSE" | jq -r '.checks.cache.hit_rate // "N/A"')
    echo "   ✓ Cache healthy, hit rate: $HIT_RATE"
else
    echo "   ✗ Cache issue: $CACHE_CHECK"
    echo "   → Check cache configuration and memory"
fi

# Search functionality
echo "6. Search Functionality Check"
SEARCH_CHECK=$(echo "$HEALTH_RESPONSE" | jq -r '.checks.search.status // "unknown"')
if [ "$SEARCH_CHECK" = "healthy" ]; then
    RESPONSE_TIME=$(echo "$HEALTH_RESPONSE" | jq -r '.checks.search.response_time // "N/A"')
    echo "   ✓ Search healthy, response time: ${RESPONSE_TIME}ms"
else
    echo "   ✗ Search issue: $SEARCH_CHECK"
    echo "   → Check search index and configuration"
fi

# Memory pressure
echo "7. Memory Pressure Check"
MEMORY_CHECK=$(echo "$HEALTH_RESPONSE" | jq -r '.checks.memory.status // "unknown"')
MEMORY_USAGE=$(echo "$HEALTH_RESPONSE" | jq -r '.checks.memory.usage // "N/A"')

if [ "$MEMORY_CHECK" = "healthy" ]; then
    echo "   ✓ Memory usage normal: $MEMORY_USAGE"
elif [ "$MEMORY_CHECK" = "warning" ]; then
    echo "   ⚠ Memory usage high: $MEMORY_USAGE"
    echo "   → Monitor for memory leaks, consider restart"
else
    echo "   ✗ Memory critical: $MEMORY_USAGE"
    echo "   → Immediate action required, restart service"
fi

echo "=== Health Check Complete ==="
```

## 3. Automated Health Monitoring

### 3.1 Health Check Monitoring Script

```bash
#!/bin/bash
# health-monitor.sh

set -euo pipefail

BASE_URL="http://localhost:3000"
ALERT_EMAIL="admin@company.com"
LOG_FILE="/var/log/pampax/health-monitor.log"
SLACK_WEBHOOK="${SLACK_WEBHOOK_URL:-}"

# Function to send alert
send_alert() {
    local severity=$1
    local message=$2
    
    echo "[$(date)] ALERT: $severity - $message" | tee -a "$LOG_FILE"
    
    # Email alert
    echo "Subject: PAMPAX Health Alert [$severity]" | \
        sendmail "$ALERT_EMAIL" << EOF
PAMPAX Health Alert

Severity: $severity
Time: $(date)
Message: $message

Please investigate immediately.
EOF
    
    # Slack alert
    if [ -n "$SLACK_WEBHOOK" ]; then
        curl -X POST -H 'Content-type: application/json' \
            --data "{\"text\":\"PAMPAX Health Alert [$severity]: $message\"}" \
            "$SLACK_WEBHOOK"
    fi
}

# Function to check health
check_health() {
    local response
    local status
    local timestamp
    
    response=$(curl -s --max-time 10 "$BASE_URL/health/detailed" 2>/dev/null)
    
    if [ $? -ne 0 ]; then
        send_alert "CRITICAL" "Health check endpoint not responding"
        return 1
    fi
    
    status=$(echo "$response" | jq -r '.status // "unknown"')
    timestamp=$(echo "$response" | jq -r '.timestamp // "unknown"')
    
    case "$status" in
        "healthy")
            echo "[$(date)] Health check passed" >> "$LOG_FILE"
            return 0
            ;;
        "degraded")
            send_alert "WARNING" "Service health degraded at $timestamp"
            return 1
            ;;
        "unhealthy")
            send_alert "CRITICAL" "Service unhealthy at $timestamp"
            return 2
            ;;
        *)
            send_alert "UNKNOWN" "Unknown health status: $status"
            return 3
            ;;
    esac
}

# Main monitoring loop
while true; do
    check_health
    
    # Check again after 30 seconds if there was an issue
    if [ $? -ne 0 ]; then
        sleep 30
        check_health
    fi
    
    sleep 60  # Normal check interval
done
```

### 3.2 Health Check Metrics Collection

```bash
#!/bin/bash
# health-metrics-collector.sh

set -euo pipefail

BASE_URL="http://localhost:3000"
METRICS_FILE="/var/log/pampax/health-metrics.log"

# Function to collect metrics
collect_metrics() {
    local timestamp
    local response
    
    timestamp=$(date -Iseconds)
    response=$(curl -s --max-time 10 "$BASE_URL/health/detailed" 2>/dev/null)
    
    if [ $? -eq 0 ]; then
        # Extract key metrics
        local overall_status=$(echo "$response" | jq -r '.status')
        local db_status=$(echo "$response" | jq -r '.checks.database.status')
        local cache_status=$(echo "$response" | jq -r '.checks.cache.status')
        local search_status=$(echo "$response" | jq -r '.checks.search.status')
        local memory_status=$(echo "$response" | jq -r '.checks.memory.status')
        local memory_usage=$(echo "$response" | jq -r '.checks.memory.usage // "null"')
        local cache_hit_rate=$(echo "$response" | jq -r '.checks.cache.hit_rate // "null"')
        local search_response_time=$(echo "$response" | jq -r '.checks.search.response_time // "null"')
        
        # Log metrics
        echo "$timestamp,overall_status=$overall_status,db_status=$db_status,cache_status=$cache_status,search_status=$search_status,memory_status=$memory_status,memory_usage=$memory_usage,cache_hit_rate=$cache_hit_rate,search_response_time=$search_response_time" >> "$METRICS_FILE"
    else
        echo "$timestamp,overall_status=error,db_status=unknown,cache_status=unknown,search_status=unknown,memory_status=unknown" >> "$METRICS_FILE"
    fi
}

# Run metrics collection
collect_metrics
```

## 4. Response Procedures

### 4.1 Service Unavailable Response

**Symptoms:**
- Health check endpoint not responding
- Connection refused errors
- Service not running

**Response Procedure:**

```bash
#!/bin/bash
# respond-service-unavailable.sh

echo "=== Service Unavailable Response ==="

# 1. Check service status
echo "1. Checking service status..."
systemctl status pampax

# 2. Check if process is running
if pgrep -f "pampax" > /dev/null; then
    echo "2. Process is running but not responding"
    echo "   → Attempting graceful restart"
    systemctl restart pampax
    sleep 10
else
    echo "2. Process is not running"
    echo "   → Starting service"
    systemctl start pampax
    sleep 10
fi

# 3. Verify service health
echo "3. Verifying service health..."
if curl -f -s --max-time 10 http://localhost:3000/health >/dev/null; then
    echo "   ✓ Service is now healthy"
else
    echo "   ✗ Service still not responding"
    echo "   → Checking logs for errors"
    journalctl -u pampax --since '5 minutes ago' --no-pager
    
    echo "   → Checking configuration"
    /opt/pampax/scripts/validate-config.sh
    
    echo "   → Checking system resources"
    free -h
    df -h
    
    echo "   → Escalating to system administrator"
fi
```

### 4.2 Database Issues Response

**Symptoms:**
- Database check shows "unhealthy" or "error"
- Slow database response times
- Connection errors

**Response Procedure:**

```bash
#!/bin/bash
# respond-database-issues.sh

echo "=== Database Issues Response ==="

# 1. Check database file integrity
echo "1. Checking database integrity..."
for db in /var/lib/pampax/*.db; do
    if [ -f "$db" ]; then
        echo "   Checking $(basename "$db")..."
        sqlite3 "$db" "PRAGMA integrity_check;" | grep -q "ok" && echo "   ✓ $(basename "$db") is healthy" || echo "   ✗ $(basename "$db") has corruption"
    fi
done

# 2. Check database locks
echo "2. Checking database locks..."
lsof /var/lib/pampax/*.db 2>/dev/null | grep -v "pampax" && echo "   ⚠ External processes accessing database" || echo "   ✓ No external locks detected"

# 3. Check disk space
echo "3. Checking disk space..."
df -h /var/lib/pampax | tail -1 | awk '{print $5}' | sed 's/%//' | {
    read usage
    if [ $usage -gt 90 ]; then
        echo "   ✗ Disk usage critical: ${usage}%"
        echo "   → Freeing disk space"
        find /var/lib/pampax -name "*.log" -mtime +7 -delete
        find /var/lib/pampax -name "*.tmp" -delete
    else
        echo "   ✓ Disk space OK: ${usage}%"
    fi
}

# 4. Check database performance
echo "4. Checking database performance..."
sqlite3 /var/lib/pampax/pampax.db "EXPLAIN QUERY PLAN SELECT * FROM cache_entries LIMIT 1;" >/dev/null 2>&1 && echo "   ✓ Query planning working" || echo "   ✗ Query planning issues"

# 5. Restart service if needed
echo "5. Restarting service if needed..."
if ! curl -f -s --max-time 10 http://localhost:3000/health/detailed | jq -r '.checks.database.status' | grep -q "healthy"; then
    echo "   → Restarting service to re-establish database connections"
    systemctl restart pampax
    sleep 15
fi

# 6. Verify recovery
echo "6. Verifying recovery..."
if curl -f -s --max-time 10 http://localhost:3000/health/detailed | jq -r '.checks.database.status' | grep -q "healthy"; then
    echo "   ✓ Database issues resolved"
else
    echo "   ✗ Database issues persist"
    echo "   → Escalating to database administrator"
    echo "   → Consider database restoration from backup"
fi
```

### 4.3 Memory Issues Response

**Symptoms:**
- Memory usage > 90%
- Memory pressure "high" or "critical"
- Out of memory errors

**Response Procedure:**

```bash
#!/bin/bash
# respond-memory-issues.sh

echo "=== Memory Issues Response ==="

# 1. Check current memory usage
echo "1. Current memory usage..."
free -h
echo ""

# 2. Check PAMPAX memory usage
echo "2. PAMPAX memory usage..."
ps aux | grep pampax | grep -v grep | awk '{print "PID: " $2 ", Memory: " $4 "%, RSS: " $6/1024 "MB"}'

# 3. Check for memory leaks
echo "3. Checking for memory leaks..."
if command -v valgrind >/dev/null; then
    echo "   Memory leak analysis available with valgrind"
else
    echo "   Valgrind not available for memory leak analysis"
fi

# 4. Clear cache if needed
MEMORY_USAGE=$(free | awk 'NR==2{printf "%.0f", $3*100/$2}')
if [ $MEMORY_USAGE -gt 90 ]; then
    echo "4. Memory usage critical (${MEMORY_USAGE}%), clearing caches..."
    
    # Clear system cache
    sync
    echo 3 > /proc/sys/vm/drop_caches
    
    # Clear PAMPAX cache
    curl -X POST http://localhost:3000/admin/cache/clear 2>/dev/null || echo "   Could not clear PAMPAX cache via API"
    
    sleep 5
    MEMORY_USAGE_AFTER=$(free | awk 'NR==2{printf "%.0f", $3*100/$2}')
    echo "   Memory usage after cache clear: ${MEMORY_USAGE_AFTER}%"
fi

# 5. Restart service if memory still critical
if [ $MEMORY_USAGE -gt 95 ]; then
    echo "5. Memory usage still critical, restarting service..."
    systemctl restart pampax
    sleep 15
    
    MEMORY_USAGE_FINAL=$(free | awk 'NR==2{printf "%.0f", $3*100/$2}')
    echo "   Memory usage after restart: ${MEMORY_USAGE_FINAL}%"
fi

# 6. Monitor for recurrence
echo "6. Setting up memory monitoring..."
echo "Monitoring memory usage for the next 10 minutes..."
for i in {1..20}; do
    sleep 30
    current_usage=$(free | awk 'NR==2{printf "%.0f", $3*100/$2}')
    echo "   Check $i/20: Memory usage ${current_usage}%"
    
    if [ $current_usage -gt 90 ]; then
        echo "   ⚠ Memory usage increasing again"
        echo "   → Recommend investigation for memory leaks"
    fi
done
```

### 4.4 Cache Issues Response

**Symptoms:**
- Cache hit rate < 50%
- Cache status "unhealthy"
- High cache eviction rates

**Response Procedure:**

```bash
#!/bin/bash
# respond-cache-issues.sh

echo "=== Cache Issues Response ==="

# 1. Get current cache statistics
echo "1. Current cache statistics..."
CACHE_STATS=$(curl -s http://localhost:3000/admin/cache/stats 2>/dev/null || echo "{}")

if [ "$CACHE_STATS" != "{}" ]; then
    echo "$CACHE_STATS" | jq -r 'to_entries[] | "\(.key): \(.value)"'
else
    echo "   Could not retrieve cache statistics via API"
fi

# 2. Check cache configuration
echo "2. Checking cache configuration..."
if [ -f /etc/pampax/pampax.toml ]; then
    echo "   Cache configuration from TOML:"
    grep -A 10 "\[cache\]" /etc/pampax/pampax.toml || echo "   No cache section found"
fi

# 3. Check cache file integrity
echo "3. Checking cache file integrity..."
if [ -f /var/lib/pampax/cache.db ]; then
    sqlite3 /var/lib/pampax/cache.db "PRAGMA integrity_check;" | grep -q "ok" && echo "   ✓ Cache database is healthy" || echo "   ✗ Cache database has corruption"
else
    echo "   ⚠ Cache database file not found"
fi

# 4. Rebuild cache if needed
echo "4. Rebuilding cache..."
curl -X POST http://localhost:3000/admin/cache/rebuild 2>/dev/null && echo "   ✓ Cache rebuild initiated" || echo "   ✗ Could not initiate cache rebuild"

# 5. Wait for rebuild completion
echo "5. Waiting for cache rebuild completion..."
sleep 30

# 6. Verify cache health
echo "6. Verifying cache health..."
CACHE_HEALTH=$(curl -s http://localhost:3000/health/detailed | jq -r '.checks.cache.status // "unknown"')
if [ "$CACHE_HEALTH" = "healthy" ]; then
    echo "   ✓ Cache is now healthy"
else
    echo "   ✗ Cache still unhealthy: $CACHE_HEALTH"
    echo "   → Consider complete cache reset"
    echo "   → Check memory availability"
fi
```

## 5. Health Check Scheduling

### 5.1 Cron Jobs for Health Monitoring

```bash
# Add to /etc/crontab

# Quick health check every minute
* * * * * pampax /opt/pampax/scripts/quick-health-check.sh

# Comprehensive health check every 5 minutes
*/5 * * * * pampax /opt/pampax/scripts/comprehensive-health-check.sh

# Health metrics collection every minute
* * * * * pampax /opt/pampax/scripts/health-metrics-collector.sh

# Health monitoring daemon (runs continuously)
@reboot pampax /opt/pampax/scripts/health-monitor.sh &
```

### 5.2 Systemd Service for Health Monitoring

```ini
# /etc/systemd/system/pampax-health-monitor.service
[Unit]
Description=PAMPAX Health Monitor
After=pampax.service
Requires=pampax.service

[Service]
Type=simple
User=pampax
Group=pampax
ExecStart=/opt/pampax/scripts/health-monitor.sh
Restart=always
RestartSec=30
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

## 6. Troubleshooting Guide

### 6.1 Common Health Check Issues

| Issue | Symptoms | Causes | Solutions |
|-------|----------|--------|-----------|
| Service not responding | Connection refused, timeout | Service crashed, port blocked | Restart service, check firewall |
| Database unhealthy | DB check fails, slow queries | Corruption, locks, disk space | Check integrity, clear locks, free space |
| Memory critical | Usage > 90%, OOM errors | Memory leaks, insufficient RAM | Restart service, add memory, investigate leaks |
| Cache unhealthy | Low hit rate, errors | Corruption, insufficient memory | Rebuild cache, check configuration |
| Search unhealthy | Slow queries, errors | Index corruption, insufficient resources | Rebuild index, check configuration |

### 6.2 Health Check Debugging

```bash
#!/bin/bash
# debug-health-checks.sh

echo "=== Health Check Debugging ==="

# 1. Check network connectivity
echo "1. Network connectivity check..."
netstat -tlnp | grep :3000 && echo "   ✓ Port 3000 is listening" || echo "   ✗ Port 3000 not listening"

# 2. Check service process
echo "2. Service process check..."
ps aux | grep pampax | grep -v grep && echo "   ✓ PAMPAX process running" || echo "   ✗ PAMPAX process not found"

# 3. Check file permissions
echo "3. File permissions check..."
ls -la /var/lib/pampax/ | head -5
ls -la /etc/pampax/ | head -5

# 4. Check system resources
echo "4. System resources check..."
echo "   Memory:"
    free -h
echo "   Disk:"
    df -h /var/lib/pampax
echo "   Load:"
    uptime

# 5. Check logs
echo "5. Recent log entries..."
journalctl -u pampax --since '10 minutes ago' --no-pager -n 20

echo "=== Debugging Complete ==="
```

This health checks runbook provides comprehensive procedures for monitoring, interpreting, and responding to PAMPAX health check results, ensuring quick identification and resolution of system issues.