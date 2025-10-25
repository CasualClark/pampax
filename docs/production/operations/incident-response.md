# Incident Response Procedures

This guide provides comprehensive procedures for identifying, responding to, and resolving production incidents affecting PAMPAX services.

## Incident Classification

### Severity Levels

| Severity | Description | Response Time | Resolution Target |
|----------|-------------|----------------|-------------------|
| **Critical (P0)** | Service completely down, major data loss, security breach | 15 minutes | 1 hour |
| **High (P1)** | Significant degradation, partial outage, high impact | 1 hour | 4 hours |
| **Medium (P2)** | Minor degradation, limited impact, workarounds available | 4 hours | 24 hours |
| **Low (P3)** | Minor issues, cosmetic problems, documentation errors | 24 hours | 72 hours |

### Incident Categories

| Category | Examples | Common Causes |
|----------|----------|---------------|
| **Service Outage** | Service unavailable, 500 errors | Process crashes, resource exhaustion |
| **Performance** | Slow responses, timeouts | High load, cache misses, database issues |
| **Data Integrity** | Corrupted data, inconsistent results | Storage failures, race conditions |
| **Security** | Unauthorized access, data exposure | Misconfiguration, vulnerabilities |
| **Infrastructure** | Network issues, disk full, memory pressure | Hardware failures, misconfiguration |

## Incident Response Process

### 1. Detection and Alerting

#### Automated Monitoring Alerts

```yaml
# prometheus-alerts.yml - Alert rules for PAMPAX
groups:
  - name: pampax.rules
    rules:
      # Service availability
      - alert: PampaxServiceDown
        expr: up{job="pampax"} == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "PAMPAX service is down"
          description: "PAMPAX has been down for more than 1 minute"

      # High error rate
      - alert: PampaxHighErrorRate
        expr: rate(http_requests_total{status=~"5.."}[5m]) / rate(http_requests_total[5m]) > 0.05
        for: 2m
        labels:
          severity: high
        annotations:
          summary: "High error rate detected"
          description: "Error rate is {{ $value | humanizePercentage }}"

      # High response time
      - alert: PampaxHighResponseTime
        expr: histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m])) > 2
        for: 5m
        labels:
          severity: medium
        annotations:
          summary: "High response time detected"
          description: "95th percentile response time is {{ $value }}s"

      # Low cache hit rate
      - alert: PampaxLowCacheHitRate
        expr: rate(cache_hits_total[5m]) / (rate(cache_hits_total[5m]) + rate(cache_misses_total[5m])) < 0.5
        for: 10m
        labels:
          severity: medium
        annotations:
          summary: "Low cache hit rate"
          description: "Cache hit rate is {{ $value | humanizePercentage }}"

      # High memory usage
      - alert: PampaxHighMemoryUsage
        expr: process_resident_memory_bytes / 1024 / 1024 > 2048
        for: 5m
        labels:
          severity: high
        annotations:
          summary: "High memory usage"
          description: "Memory usage is {{ $value }}MB"

      # Database connection issues
      - alert: PampaxDatabaseErrors
        expr: rate(sqlite_errors_total[5m]) > 0.1
        for: 2m
        labels:
          severity: high
        annotations:
          summary: "Database errors detected"
          description: "Database error rate is {{ $value }} errors/sec"
```

#### Log-Based Alerting

```bash
#!/bin/bash
# log-alert.sh - Log-based alerting script

LOG_FILE="/var/log/pampax/pampax.log"
ALERT_THRESHOLD=5
TIME_WINDOW=300  # 5 minutes

# Check for error patterns
error_count=$(tail -n 1000 "$LOG_FILE" | \
    jq -r 'select(.level == "ERROR") | .timestamp' | \
    awk -v threshold="$TIME_WINDOW" '
        BEGIN { count = 0; now = systime() }
        {
            timestamp = $1
            if (now - timestamp <= threshold) count++
        }
        END { print count }
    ')

if [ "$error_count" -gt "$ALERT_THRESHOLD" ]; then
    echo "ALERT: High error rate detected - $error_count errors in last 5 minutes"
    # Send alert notification
    curl -X POST "https://hooks.slack.com/your-webhook" \
        -H 'Content-type: application/json' \
        --data "{\"text\":\"🚨 PAMPAX Alert: $error_count errors in last 5 minutes\"}"
fi
```

### 2. Initial Assessment

#### Triage Checklist

```bash
#!/bin/bash
# incident-triage.sh - Initial incident triage

INCIDENT_ID=$1
SERVICE_URL=${2:-http://localhost:3000}

echo "=== Incident Triage: $INCIDENT_ID ==="
echo "Timestamp: $(date)"
echo ""

# 1. Service Status Check
echo "1. Service Status"
if curl -f "$SERVICE_URL/health" >/dev/null 2>&1; then
    echo "   ✓ Service is responding"
else
    echo "   ✗ Service is not responding"
fi
echo ""

# 2. Resource Usage
echo "2. Resource Usage"
echo "   Memory: $(free -h | grep '^Mem:' | awk '{print $3 "/" $2}')"
echo "   CPU: $(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d'%' -f1)"
echo "   Disk: $(df -h /var/lib/pampax | tail -1 | awk '{print $3 "/" $2 " (" $5 " used)"}')"
echo ""

# 3. Process Status
echo "3. Process Status"
if pgrep -f "pampax" >/dev/null; then
    echo "   ✓ PAMPAX process is running"
    echo "   PID: $(pgrep -f pampax)"
    echo "   Uptime: $(ps -o etime= -p $(pgrep -f pampax))"
else
    echo "   ✗ PAMPAX process is not running"
fi
echo ""

# 4. Recent Errors
echo "4. Recent Errors (last 10 minutes)"
if [ -f "/var/log/pampax/pampax.log" ]; then
    ten_minutes_ago=$(date -d '10 minutes ago' +%s)
    jq -r "select(.level == \"ERROR\" and .timestamp > $ten_minutes_ago)" /var/log/pampax/pampax.log | \
        tail -5 | while read -r line; do
            echo "   $line"
        done
else
    echo "   Log file not found"
fi
echo ""

# 5. Database Status
echo "5. Database Status"
if [ -f "/var/lib/pampax/pampax.db" ]; then
    echo "   ✓ Database file exists"
    echo "   Size: $(du -h /var/lib/pampax/pampax.db | cut -f1)"
    if sqlite3 /var/lib/pampax/pampax.db "PRAGMA integrity_check;" | grep -q "ok"; then
        echo "   ✓ Database integrity check passed"
    else
        echo "   ✗ Database integrity check failed"
    fi
else
    echo "   ✗ Database file not found"
fi
echo ""

echo "=== Triage Complete ==="
```

### 3. Incident Documentation

#### Incident Report Template

```markdown
# Incident Report: [INCIDENT_ID]

## Summary
**Severity**: [Critical/High/Medium/Low]  
**Status**: [Open/In Progress/Resolved/Closed]  
**Start Time**: [YYYY-MM-DD HH:MM:SS UTC]  
**Duration**: [X hours Y minutes]  
**Impact**: [Description of user/business impact]  

## Timeline
- **HH:MM**: Incident detected via [alert/manual]
- **HH:MM**: Initial assessment completed
- **HH:MM**: Root cause identified
- **HH:MM**: Mitigation implemented
- **HH:MM**: Service restored
- **HH:MM**: Incident resolved

## Root Cause Analysis
**Primary Cause**: [Technical root cause]  
**Contributing Factors**: [Secondary causes]  
**Affected Components**: [List of affected services/components]

## Impact Assessment
- **Users Affected**: [Number or percentage]
- **Services Affected**: [List of services]
- **Data Loss**: [Yes/No, details]
- **Financial Impact**: [Estimated cost if applicable]

## Resolution Actions
1. [Immediate action taken]
2. [Follow-up actions]
3. [Permanent fixes implemented]

## Communication
- **Internal Notifications**: [Teams notified, channels used]
- **External Communications**: [Customer notifications sent]
- **Stakeholder Updates**: [Leadership updates provided]

## Lessons Learned
- **What Went Well**: [Positive aspects of response]
- **What Could Be Improved**: [Areas for improvement]
- **Action Items**: [Specific follow-up tasks]

## Preventive Measures
1. [Preventive action 1]
2. [Preventive action 2]
3. [Monitoring improvements]

## Attachments
- [Logs, screenshots, metrics graphs]
- [Configuration changes]
- [Relevant documentation]
```

## Common Incident Scenarios

### Scenario 1: Service Unavailable

#### Symptoms
- Service not responding to health checks
- HTTP 502/503 errors
- Process crashes or restarts

#### Immediate Response

```bash
#!/bin/bash
# respond-service-down.sh - Service unavailable response

echo "Responding to service unavailable incident..."

# 1. Check process status
if ! pgrep -f "pampax" >/dev/null; then
    echo "Process not running, attempting restart..."
    sudo systemctl restart pampax
    sleep 10
    
    if pgrep -f "pampax" >/dev/null; then
        echo "Service restarted successfully"
    else
        echo "Failed to restart service"
        # Check logs for startup errors
        sudo journalctl -u pampax -n 50
    fi
fi

# 2. Check system resources
echo "Checking system resources..."
MEMORY_USAGE=$(free | grep Mem | awk '{printf "%.1f", $3/$2 * 100.0}')
DISK_USAGE=$(df /var/lib/pampax | tail -1 | awk '{print $5}' | sed 's/%//')

if (( $(echo "$MEMORY_USAGE > 90" | bc -l) )); then
    echo "High memory usage detected: ${MEMORY_USAGE}%"
    # Kill memory-intensive processes if needed
    sudo pkill -f "high-memory-process"
fi

if [ "$DISK_USAGE" -gt 90 ]; then
    echo "High disk usage detected: ${DISK_USAGE}%"
    # Clean up old logs and temporary files
    sudo find /var/log/pampax -name "*.log" -mtime +7 -delete
    sudo find /tmp -name "pampax-*" -mtime +1 -delete
fi

# 3. Check configuration
echo "Validating configuration..."
if ! pampax config --validate; then
    echo "Configuration validation failed"
    echo "Last known good configuration:"
    sudo git log --oneline -n 5 pampax.toml
fi

# 4. Verify database
echo "Checking database integrity..."
if [ -f "/var/lib/pampax/pampax.db" ]; then
    if ! sqlite3 /var/lib/pampax/pampax.db "PRAGMA integrity_check;" | grep -q "ok"; then
        echo "Database corruption detected, attempting recovery..."
        cp /var/lib/pampax/pampax.db /var/lib/pampax/pampax.db.backup
        sqlite3 /var/lib/pampax/pampax.db ".recover" | sqlite3 /var/lib/pampax/pampax_recovered.db
    fi
fi

echo "Immediate response completed"
```

#### Root Cause Investigation

```bash
#!/bin/bash
# investigate-service-down.sh - Root cause investigation

echo "Investigating service unavailable root cause..."

# 1. Check system logs
echo "=== System Logs ==="
sudo journalctl -u pampax -n 100 --no-pager

# 2. Check application logs
echo "=== Application Logs ==="
if [ -f "/var/log/pampax/pampax.log" ]; then
    tail -100 /var/log/pampax/pampax.log | jq -r 'select(.level == "ERROR" or .level == "FATAL")'
fi

# 3. Check resource exhaustion
echo "=== Resource Usage ==="
echo "Memory usage:"
free -h
echo ""
echo "Disk usage:"
df -h
echo ""
echo "Process list:"
ps aux | head -20

# 4. Check network connectivity
echo "=== Network Status ==="
netstat -tlnp | grep :3000
ss -tlnp | grep :3000

# 5. Check recent changes
echo "=== Recent Changes ==="
echo "Recent commits:"
git log --oneline -n 10
echo ""
echo "Recent configuration changes:"
find /etc/pampax -name "*.toml" -newer /var/log/pampax/pampax.log 2>/dev/null
```

### Scenario 2: Performance Degradation

#### Symptoms
- Slow response times
- Increased latency
- Timeouts

#### Response Procedures

```bash
#!/bin/bash
# respond-performance.sh - Performance degradation response

echo "Responding to performance degradation..."

# 1. Identify bottlenecks
echo "=== Performance Analysis ==="

# Check response times
echo "Measuring response times..."
for i in {1..10}; do
    curl -o /dev/null -s -w "%{time_total}\n" http://localhost:3000/health
done | awk '{sum+=$1; count++} END {print "Average response time:", sum/count "s"}'

# Check cache performance
echo "Cache statistics:"
pampax cache stats

# Check database performance
echo "Database performance:"
sqlite3 /var/lib/pampax/pampax.db "EXPLAIN QUERY PLAN SELECT * FROM files LIMIT 10;"

# 2. Optimize cache
echo "=== Cache Optimization ==="
if pampax cache stats | grep -q "hit_rate.*< 0.6"; then
    echo "Low cache hit rate, warming cache..."
    pampax cache warm /var/lib/pampax
fi

# 3. Check concurrent connections
echo "=== Connection Analysis ==="
netstat -an | grep :3000 | wc -l
echo "Active connections: $(netstat -an | grep :3000 | grep ESTABLISHED | wc -l)"

# 4. Memory optimization
echo "=== Memory Optimization ==="
echo "Current memory usage:"
ps aux | grep pampax | grep -v grep
echo ""
echo "Garbage collection (if applicable):"
# Add Node.js specific GC commands if needed

# 5. Database optimization
echo "=== Database Optimization ==="
sqlite3 /var/lib/pampax/pampax.db "VACUUM;"
sqlite3 /var/lib/pampax/pampax.db "ANALYZE;"

echo "Performance response completed"
```

### Scenario 3: Data Corruption

#### Symptoms
- Inconsistent search results
- Missing data
- Database integrity errors

#### Response Procedures

```bash
#!/bin/bash
# respond-data-corruption.sh - Data corruption response

echo "Responding to data corruption incident..."

# 1. Isolate affected systems
echo "=== Isolation Procedures ==="
sudo systemctl stop pampax

# 2. Backup current state
echo "=== Backup Current State ==="
BACKUP_DIR="/var/lib/pampax/backup/$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"
cp -r /var/lib/pampax/* "$BACKUP_DIR/"
echo "Backup created at: $BACKUP_DIR"

# 3. Assess damage
echo "=== Damage Assessment ==="
if [ -f "/var/lib/pampax/pampax.db" ]; then
    echo "Database integrity check:"
    sqlite3 /var/lib/pampax/pampax.db "PRAGMA integrity_check;"
    
    echo "Foreign key check:"
    sqlite3 /var/lib/pampax/pampax.db "PRAGMA foreign_key_check;"
    
    echo "Schema check:"
    sqlite3 /var/lib/pampax/pampax.db ".schema"
fi

# 4. Restore from backup if needed
echo "=== Recovery Options ==="

# List available backups
echo "Available backups:"
ls -la /var/lib/pampax/backup/ | grep "^d"

# Prompt for recovery action
echo "Recovery options:"
echo "1. Restore from latest backup"
echo "2. Attempt database repair"
echo "3. Rebuild from scratch"
echo "4. Manual intervention required"

read -p "Choose recovery option (1-4): " choice

case $choice in
    1)
        LATEST_BACKUP=$(ls -t /var/lib/pampax/backup/ | head -1)
        echo "Restoring from backup: $LATEST_BACKUP"
        cp -r "/var/lib/pampax/backup/$LATEST_BACKUP"/* /var/lib/pampax/
        ;;
    2)
        echo "Attempting database repair..."
        sqlite3 /var/lib/pampax/pampax.db ".recover" | sqlite3 /var/lib/pampax/pampax_repaired.db
        mv /var/lib/pampax/pampax_repaired.db /var/lib/pampax/pampax.db
        ;;
    3)
        echo "Rebuilding from scratch..."
        rm -f /var/lib/pampax/pampax.db
        pampax indexer init /var/lib/pampax
        ;;
    4)
        echo "Manual intervention required - escalate to senior engineer"
        exit 1
        ;;
esac

# 5. Validate recovery
echo "=== Recovery Validation ==="
if sqlite3 /var/lib/pampax/pampax.db "PRAGMA integrity_check;" | grep -q "ok"; then
    echo "✓ Database integrity verified"
else
    echo "✗ Database still corrupted - escalation required"
    exit 1
fi

# 6. Restart service
echo "Restarting service..."
sudo systemctl start pampax
sleep 10

if pampax health; then
    echo "✓ Service restored successfully"
else
    echo "✗ Service still experiencing issues"
    exit 1
fi

echo "Data corruption response completed"
```

## Communication Procedures

### Internal Communication

#### Slack Alert Template

```json
{
  "text": "🚨 PAMPAX Production Alert",
  "attachments": [
    {
      "color": "danger",
      "fields": [
        {
          "title": "Incident ID",
          "value": "INC-2024-001",
          "short": true
        },
        {
          "title": "Severity",
          "value": "Critical",
          "short": true
        },
        {
          "title": "Service",
          "value": "PAMPAX API",
          "short": true
        },
        {
          "title": "Impact",
          "value": "Service completely unavailable",
          "short": true
        },
        {
          "title": "Detection Time",
          "value": "2024-01-15 14:30:00 UTC",
          "short": true
        },
        {
          "title": "Responder",
          "value": "<@U123456789>",
          "short": true
        }
      ],
      "actions": [
        {
          "type": "button",
          "text": "Join War Room",
          "url": "https://slack.com/archives/war-room"
        },
        {
          "type": "button",
          "text": "View Dashboard",
          "url": "https://grafana.company.com/d/pampax"
        }
      ]
    }
  ]
}
```

#### War Room Procedures

```bash
#!/bin/bash
# create-war-room.sh - Incident war room setup

INCIDENT_ID=$1
CHANNEL_NAME="incident-$INCIDENT_ID"

echo "Setting up war room for incident $INCIDENT_ID..."

# 1. Create Slack channel (using Slack API)
curl -X POST "https://slack.com/api/conversations.create" \
    -H "Authorization: Bearer $SLACK_TOKEN" \
    -H "Content-type: application/json" \
    --data "{
        \"name\": \"$CHANNEL_NAME\",
        \"is_private\": true
    }"

# 2. Invite key personnel
PERSONNEL=(
    "U123456789"  # On-call engineer
    "U987654321"  # Engineering lead
    "U567890123"  # Product manager
)

for user in "${PERSONNEL[@]}"; do
    curl -X POST "https://slack.com/api/conversations.invite" \
        -H "Authorization: Bearer $SLACK_TOKEN" \
        -H "Content-type: application/json" \
        --data "{
            \"channel\": \"$CHANNEL_NAME\",
            \"users\": \"$user\"
        }"
done

# 3. Post incident template
curl -X POST "https://slack.com/api/chat.postMessage" \
    -H "Authorization: Bearer $SLACK_TOKEN" \
    -H "Content-type: application/json" \
    --data "{
        \"channel\": \"$CHANNEL_NAME\",
        \"text\": \"🚨 Incident $INCIDENT_ID War Room\",
        \"attachments\": [
            {
                \"color\": \"danger\",
                \"title\": \"Incident $INCIDENT_ID\",
                \"fields\": [
                    {
                        \"title\": \"Status\",
                        \"value\": \"Investigating\",
                        \"short\": true
                    },
                    {
                        \"title\": \"Severity\",
                        \"value\": \"Critical\",
                        \"short\": true
                    },
                    {
                        \"title\": \"Impact\",
                        \"value\": \"Service unavailable\",
                        \"short\": false
                    }
                ]
            }
        ]
    }"

echo "War room created: $CHANNEL_NAME"
```

### External Communication

#### Customer Notification Template

```markdown
**Service Alert**: PAMPAX Service Disruption

**Status**: Investigating  
**Start Time**: [Date/Time]  
**Impact**: Users may experience errors or slow performance when accessing PAMPAX services.

**What Happened**: We are currently investigating a disruption affecting PAMPAX service availability.

**Current Status**: Our engineering team has been alerted and is actively investigating the issue. We are working to restore full service as quickly as possible.

**Next Updates**: We will provide the next update within 30 minutes or as soon as we have more information.

**Alternative**: While we work on resolving this issue, you can check our status page at [status.company.com] for the latest updates.

We apologize for any inconvenience this may cause.

---

**Update [Time]**: [Status update information]

**Update [Time]**: [Resolution information]
```

## Post-Incident Procedures

### Root Cause Analysis (RCA)

#### RCA Framework

```bash
#!/bin/bash
# rca-analysis.sh - Root cause analysis framework

INCIDENT_ID=$1
ANALYSIS_DATE=$(date +%Y-%m-%d)

echo "=== Root Cause Analysis: $INCIDENT_ID ==="
echo "Analysis Date: $ANALYSIS_DATE"
echo ""

# 1. Timeline Reconstruction
echo "1. Timeline Reconstruction"
echo "   Incident Detection: $(grep -r "$INCIDENT_ID" /var/log/alerts/ | head -1 | cut -d' ' -f1-3)"
echo "   First Response: $(grep -r "response started" /var/log/pampax/pampax.log | head -1 | jq -r '.timestamp')"
echo "   Mitigation: $(grep -r "mitigation applied" /var/log/pampax/pampax.log | head -1 | jq -r '.timestamp')"
echo "   Resolution: $(grep -r "service restored" /var/log/pampax/pampax.log | head -1 | jq -r '.timestamp')"
echo ""

# 2. Contributing Factors
echo "2. Contributing Factors Analysis"
echo "   System Load at incident time:"
echo "   - CPU: $(sar -u -s $(date -d '2 hours ago' +%H:%M:%S) -e $(date +%H:%M:%S) | tail -1 | awk '{print $NF}%')"
echo "   - Memory: $(sar -r -s $(date -d '2 hours ago' +%H:%M:%S) -e $(date +%H:%M:%S) | tail -1 | awk '{print $4"%"}')"
echo "   - Disk: $(df -h /var/lib/pampax | tail -1 | awk '{print $5}')"
echo ""

# 3. Change Analysis
echo "3. Recent Changes Analysis"
echo "   Recent code changes:"
git log --since="3 days ago" --oneline --grep="fix\|feat\|perf"
echo ""
echo "   Configuration changes:"
find /etc/pampax -name "*.toml" -newer /var/log/pampax/pampax.log -ls 2>/dev/null
echo ""

# 4. Monitoring Gaps
echo "4. Monitoring Gaps"
echo "   Alerts that should have fired but didn't:"
echo "   - [List missing alerts]"
echo "   Metrics that would have helped detection:"
echo "   - [List missing metrics]"
echo ""

# 5. Action Items
echo "5. Preventive Action Items"
echo "   a) Immediate actions (within 1 week):"
echo "      - [Action item 1]"
echo "      - [Action item 2]"
echo ""
echo "   b) Short-term improvements (within 1 month):"
echo "      - [Improvement 1]"
echo "      - [Improvement 2]"
echo ""
echo "   c) Long-term strategic changes (within 3 months):"
echo "      - [Strategic change 1]"
echo "      - [Strategic change 2]"
echo ""

# 6. Generate RCA report
RCA_FILE="/var/log/pampax/rca-$INCIDENT_ID-$ANALYSIS_DATE.md"
cat > "$RCA_FILE" << EOF
# Root Cause Analysis: $INCIDENT_ID

**Date**: $ANALYSIS_DATE  
**Severity**: [Determined during incident]  
**Duration**: [Calculated from timeline]

## Executive Summary
[Brief summary of incident and impact]

## Timeline
[Detailed timeline from above analysis]

## Root Cause
[Primary technical root cause]

## Contributing Factors
[List of contributing factors from analysis]

## Impact Assessment
[Business and user impact]

## Lessons Learned
[What went well and what could be improved]

## Action Items
[Preventive measures with owners and due dates]

## Follow-up
[How similar incidents will be prevented]
EOF

echo "RCA report generated: $RCA_FILE"
```

### Improvement Tracking

#### Action Item Tracker

```bash
#!/bin/bash
# track-improvements.sh - Track post-incident improvements

INCIDENT_ID=$1

# Create improvement tracking file
TRACKING_FILE="/var/log/pampax/improvements-$INCIDENT_ID.json"

cat > "$TRACKING_FILE" << EOF
{
  "incident_id": "$INCIDENT_ID",
  "created_date": "$(date -I)",
  "action_items": [
    {
      "id": "AI-001",
      "description": "Implement database connection pooling",
      "category": "infrastructure",
      "priority": "high",
      "owner": "engineering-team",
      "due_date": "$(date -d '+2 weeks' -I)",
      "status": "open",
      "dependencies": []
    },
    {
      "id": "AI-002", 
      "description": "Add memory usage alerts",
      "category": "monitoring",
      "priority": "medium",
      "owner": "sre-team",
      "due_date": "$(date -d '+1 week' -I)",
      "status": "open",
      "dependencies": []
    }
  ],
  "last_updated": "$(date -I)"
}
EOF

echo "Improvement tracking created: $TRACKING_FILE"
```

This comprehensive incident response guide provides structured procedures for handling production incidents, from initial detection through post-incident analysis and improvement tracking.