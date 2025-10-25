# Backup and Disaster Recovery

## Overview

This guide provides comprehensive procedures for backing up PAMPAX data and recovering from disasters. It covers database backups, configuration backups, and complete system recovery procedures.

## 1. Backup Strategy

### 1.1 Backup Components

**Critical Data:**
- SQLite databases (main, cache, metrics)
- Configuration files (TOML/JSON)
- Context packs and custom data
- Log files (recent)
- SSL certificates and keys

**Backup Categories:**
- **Full Backups**: Complete system snapshot
- **Incremental Backups**: Changes since last backup
- **Differential Backups**: Changes since last full backup

### 1.2 Backup Schedule

```bash
#!/bin/bash
# backup-schedule.sh

# Daily incremental backups
0 2 * * * /opt/pampax/scripts/incremental-backup.sh

# Weekly full backups  
0 3 * * 0 /opt/pampax/scripts/full-backup.sh

# Monthly offsite backup
0 4 1 * * /opt/pampax/scripts/offsite-backup.sh

# Configuration backups (on change)
inotifywait -m /etc/pampax/ -e modify --include '\.(toml|json)$' |
  while read path action file; do
    /opt/pampax/scripts/backup-config.sh "$path$file"
  done
```

### 1.3 Retention Policy

```bash
# retention-policy.sh
#!/bin/bash

RETENTION_DAYS=30
RETENTION_WEEKS=12
RETENTION_MONTHS=12
RETENTION_YEARS=7

# Daily backups: keep last 30 days
find /backup/pampax/daily/ -type f -mtime +$RETENTION_DAYS -delete

# Weekly backups: keep last 12 weeks
find /backup/pampax/weekly/ -type f -mtime +$((RETENTION_WEEKS * 7)) -delete

# Monthly backups: keep last 12 months
find /backup/pampax/monthly/ -type f -mtime +$((RETENTION_MONTHS * 30)) -delete

# Yearly backups: keep last 7 years
find /backup/pampax/yearly/ -type f -mtime +$((RETENTION_YEARS * 365)) -delete
```

## 2. Database Backup Procedures

### 2.1 SQLite Backup Script

```bash
#!/bin/bash
# backup-database.sh

set -euo pipefail

BACKUP_DIR="/backup/pampax/database"
DATE=$(date +%Y%m%d_%H%M%S)
PAMPAX_DATA_DIR="/var/lib/pampax"

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Function to backup SQLite database
backup_sqlite() {
    local db_file=$1
    local backup_name=$2
    
    echo "Backing up $db_file..."
    
    # Use SQLite backup API for consistent backup
    sqlite3 "$db_file" ".backup $BACKUP_DIR/${backup_name}_${DATE}.db"
    
    # Compress backup
    gzip "$BACKUP_DIR/${backup_name}_${DATE}.db"
    
    # Verify backup integrity
    gunzip -t "$BACKUP_DIR/${backup_name}_${DATE}.db.gz"
    
    echo "Backup completed: ${backup_name}_${DATE}.db.gz"
}

# Backup main databases
backup_sqlite "$PAMPAX_DATA_DIR/pampax.db" "main"
backup_sqlite "$PAMPAX_DATA_DIR/cache.db" "cache"
backup_sqlite "$PAMPAX_DATA_DIR/metrics.db" "metrics"

# Create backup manifest
cat > "$BACKUP_DIR/manifest_${DATE}.json" << EOF
{
  "timestamp": "$(date -Iseconds)",
  "databases": [
    {
      "name": "main",
      "file": "main_${DATE}.db.gz",
      "size": $(stat -c%s "$BACKUP_DIR/main_${DATE}.db.gz"),
      "checksum": "$(sha256sum "$BACKUP_DIR/main_${DATE}.db.gz" | cut -d' ' -f1)"
    },
    {
      "name": "cache", 
      "file": "cache_${DATE}.db.gz",
      "size": $(stat -c%s "$BACKUP_DIR/cache_${DATE}.db.gz"),
      "checksum": "$(sha256sum "$BACKUP_DIR/cache_${DATE}.db.gz" | cut -d' ' -f1)"
    },
    {
      "name": "metrics",
      "file": "metrics_${DATE}.db.gz", 
      "size": $(stat -c%s "$BACKUP_DIR/metrics_${DATE}.db.gz"),
      "checksum": "$(sha256sum "$BACKUP_DIR/metrics_${DATE}.db.gz" | cut -d' ' -f1)"
    }
  ]
}
EOF

echo "Database backup completed successfully"
```

### 2.2 Online Backup with WAL

```bash
#!/bin/bash
# online-backup.sh

set -euo pipefail

PAMPAX_DATA_DIR="/var/lib/pampax"
BACKUP_DIR="/backup/pampax/online"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p "$BACKUP_DIR"

# Enable WAL mode if not already enabled
sqlite3 "$PAMPAX_DATA_DIR/pampax.db" "PRAGMA journal_mode=WAL;"

# Create checkpoint
sqlite3 "$PAMPAX_DATA_DIR/pampax.db" "PRAGMA wal_checkpoint(TRUNCATE);"

# Copy database files
cp "$PAMPAX_DATA_DIR/pampax.db" "$BACKUP_DIR/pampax_${DATE}.db"
cp "$PAMPAX_DATA_DIR/pampax.db-wal" "$BACKUP_DIR/pampax_${DATE}.db-wal" 2>/dev/null || true
cp "$PAMPAX_DATA_DIR/pampax.db-shm" "$BACKUP_DIR/pampax_${DATE}.db-shm" 2>/dev/null || true

# Compress backup
tar -czf "$BACKUP_DIR/pampax_${DATE}.tar.gz" -C "$BACKUP_DIR" "pampax_${DATE}.db" "pampax_${DATE}.db-wal" "pampax_${DATE}.db-shm"

# Cleanup temporary files
rm -f "$BACKUP_DIR/pampax_${DATE}.db" "$BACKUP_DIR/pampax_${DATE}.db-wal" "$BACKUP_DIR/pampax_${DATE}.db-shm"

echo "Online backup completed: pampax_${DATE}.tar.gz"
```

## 3. Configuration Backup

### 3.1 Configuration Backup Script

```bash
#!/bin/bash
# backup-config.sh

set -euo pipefail

CONFIG_DIR="/etc/pampax"
BACKUP_DIR="/backup/pampax/config"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p "$BACKUP_DIR"

# Backup configuration files
tar -czf "$BACKUP_DIR/config_${DATE}.tar.gz" -C "$CONFIG_DIR" .

# Create configuration manifest
cat > "$BACKUP_DIR/config_manifest_${DATE}.json" << EOF
{
  "timestamp": "$(date -Iseconds)",
  "files": [
    $(find "$CONFIG_DIR" -type f -name "*.toml" -o -name "*.json" | \
      sed "s|$CONFIG_DIR/||" | \
      awk '{print "{\"file\": \"" $0 "\", \"checksum\": \"$(sha256sum \"'$CONFIG_DIR'/\" $0 | cut -d\" \" -f1)\"}"}' | \
      paste -sd "," -)
  ]
}
EOF

echo "Configuration backup completed: config_${DATE}.tar.gz"
```

### 3.2 SSL Certificate Backup

```bash
#!/bin/bash
# backup-ssl.sh

set -euo pipefail

SSL_DIR="/etc/pampax/ssl"
BACKUP_DIR="/backup/pampax/ssl"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p "$BACKUP_DIR"

if [ -d "$SSL_DIR" ]; then
    # Backup SSL certificates and keys
    tar -czf "$BACKUP_DIR/ssl_${DATE}.tar.gz" -C "$SSL_DIR" .
    
    # Create certificate inventory
    cat > "$BACKUP_DIR/ssl_inventory_${DATE}.json" << EOF
{
  "timestamp": "$(date -Iseconds)",
  "certificates": [
    $(find "$SSL_DIR" -name "*.crt" -o -name "*.pem" | \
      while read cert; do
        issuer=$(openssl x509 -in "$cert" -noout -issuer 2>/dev/null | cut -d'=' -f2)
        subject=$(openssl x509 -in "$cert" -noout -subject 2>/dev/null | cut -d'=' -f2)
        expiry=$(openssl x509 -in "$cert" -noout -enddate 2>/dev/null | cut -d'=' -f2)
        echo "{\"file\": \"$(basename "$cert")\", \"issuer\": \"$issuer\", \"subject\": \"$subject\", \"expiry\": \"$expiry\"}"
      done | paste -sd "," -)
  ]
}
EOF
    
    echo "SSL backup completed: ssl_${DATE}.tar.gz"
else
    echo "SSL directory not found, skipping SSL backup"
fi
```

## 4. Disaster Recovery Procedures

### 4.1 System Recovery

```bash
#!/bin/bash
# disaster-recovery.sh

set -euo pipefail

BACKUP_DIR="/backup/pampax"
RESTORE_DIR="/tmp/pampax_restore"
DATE=${1:-$(ls -1 "$BACKUP_DIR/database" | grep -o '[0-9]\{8\}_[0-9]\{6\}' | sort -r | head -1)}

echo "Starting disaster recovery for backup date: $DATE"

# Create restore directory
mkdir -p "$RESTORE_DIR"

# Stop PAMPAX service
systemctl stop pampax || true

# Function to restore database
restore_database() {
    local db_name=$1
    local backup_file="$BACKUP_DIR/database/${db_name}_${DATE}.db.gz"
    
    if [ ! -f "$backup_file" ]; then
        echo "ERROR: Backup file not found: $backup_file"
        return 1
    fi
    
    echo "Restoring $db_name database..."
    
    # Extract backup
    gunzip -c "$backup_file" > "$RESTORE_DIR/${db_name}.db"
    
    # Verify integrity
    sqlite3 "$RESTORE_DIR/${db_name}.db" "PRAGMA integrity_check;"
    
    # Move to production location
    mv "$RESTORE_DIR/${db_name}.db" "/var/lib/pampax/${db_name}.db"
    
    echo "$db_name database restored successfully"
}

# Restore databases
restore_database "pampax"
restore_database "cache" 
restore_database "metrics"

# Restore configuration
if [ -f "$BACKUP_DIR/config/config_${DATE}.tar.gz" ]; then
    echo "Restoring configuration..."
    mkdir -p "$RESTORE_DIR/config"
    tar -xzf "$BACKUP_DIR/config/config_${DATE}.tar.gz" -C "$RESTORE_DIR/config"
    
    # Backup current config
    cp -r /etc/pampax "/etc/pampax.backup.$(date +%s)"
    
    # Restore configuration
    rm -rf /etc/pampax/*
    cp -r "$RESTORE_DIR/config"/* /etc/pampax/
    
    echo "Configuration restored successfully"
fi

# Restore SSL certificates
if [ -f "$BACKUP_DIR/ssl/ssl_${DATE}.tar.gz" ]; then
    echo "Restoring SSL certificates..."
    mkdir -p "$RESTORE_DIR/ssl"
    tar -xzf "$BACKUP_DIR/ssl/ssl_${DATE}.tar.gz" -C "$RESTORE_DIR/ssl"
    
    # Restore certificates
    cp -r "$RESTORE_DIR/ssl"/* /etc/pampax/ssl/
    
    echo "SSL certificates restored successfully"
fi

# Set proper permissions
chown -R pampax:pampax /var/lib/pampax
chown -R pampax:pampax /etc/pampax
chmod 600 /etc/pampax/ssl/* 2>/dev/null || true

# Start PAMPAX service
systemctl start pampax

# Verify service health
sleep 10
if systemctl is-active --quiet pampax; then
    echo "PAMPAX service started successfully"
else
    echo "ERROR: PAMPAX service failed to start"
    systemctl status pampax
    exit 1
fi

# Run health check
curl -f http://localhost:3000/health || {
    echo "ERROR: Health check failed"
    exit 1
}

echo "Disaster recovery completed successfully"
```

### 4.2 Partial Recovery

```bash
#!/bin/bash
# partial-recovery.sh

set -euo pipefail

COMPONENT=${1:-""}
BACKUP_DATE=${2:-$(ls -1 "/backup/pampax/database" | grep -o '[0-9]\{8\}_[0-9]\{6\}' | sort -r | head -1)}

case $COMPONENT in
    "database")
        echo "Recovering database only..."
        /opt/pampax/scripts/disaster-recovery.sh "$BACKUP_DATE"
        ;;
    "config")
        echo "Recovering configuration only..."
        # Configuration recovery logic
        ;;
    "ssl")
        echo "Recovering SSL certificates only..."
        # SSL recovery logic
        ;;
    *)
        echo "Usage: $0 <database|config|ssl> [backup_date]"
        exit 1
        ;;
esac
```

## 5. Offsite Backup

### 5.1 Cloud Backup Script

```bash
#!/bin/bash
# offsite-backup.sh

set -euo pipefail

BACKUP_DIR="/backup/pampax"
REMOTE_BACKUP="s3://pampax-backups/$(date +%Y/%m)"
DATE=$(date +%Y%m%d_%H%M%S)

# Function to upload to S3
upload_to_s3() {
    local file=$1
    local remote_path=$2
    
    echo "Uploading $file to $remote_path"
    aws s3 cp "$file" "$remote_path" --storage-class GLACIER_IR
    
    # Verify upload
    aws s3 ls "$remote_path" || {
        echo "ERROR: Upload verification failed for $file"
        return 1
    }
}

# Upload latest backups
LATEST_DATABASE=$(ls -1t "$BACKUP_DIR/database"/*.gz | head -1)
LATEST_CONFIG=$(ls -1t "$BACKUP_DIR/config"/*.gz | head -1)

upload_to_s3 "$LATEST_DATABASE" "$REMOTE_BACKUP/database/"
upload_to_s3 "$LATEST_CONFIG" "$REMOTE_BACKUP/config/"

# Create backup inventory
cat > "/tmp/backup_inventory_${DATE}.json" << EOF
{
  "timestamp": "$(date -Iseconds)",
  "backups": [
    {
      "type": "database",
      "file": "$(basename "$LATEST_DATABASE")",
      "s3_path": "$REMOTE_BACKUP/database/$(basename "$LATEST_DATABASE")"
    },
    {
      "type": "config",
      "file": "$(basename "$LATEST_CONFIG")",
      "s3_path": "$REMOTE_BACKUP/config/$(basename "$LATEST_CONFIG")"
    }
  ]
}
EOF

upload_to_s3 "/tmp/backup_inventory_${DATE}.json" "$REMOTE_BACKUP/inventory/"

echo "Offsite backup completed successfully"
```

### 5.2 Backup Verification

```bash
#!/bin/bash
# verify-backups.sh

set -euo pipefail

BACKUP_DIR="/backup/pampax"
RETENTION_DAYS=7

echo "Verifying backup integrity..."

# Function to verify backup
verify_backup() {
    local backup_file=$1
    local expected_checksum=$2
    
    if [ ! -f "$backup_file" ]; then
        echo "ERROR: Backup file missing: $backup_file"
        return 1
    fi
    
    # Calculate current checksum
    current_checksum=$(sha256sum "$backup_file" | cut -d' ' -f1)
    
    if [ "$current_checksum" != "$expected_checksum" ]; then
        echo "ERROR: Checksum mismatch for $backup_file"
        echo "Expected: $expected_checksum"
        echo "Actual: $current_checksum"
        return 1
    fi
    
    # Test file integrity
    case "$backup_file" in
        *.gz)
            gunzip -t "$backup_file" || return 1
            ;;
        *.tar.gz)
            tar -tzf "$backup_file" >/dev/null || return 1
            ;;
    esac
    
    echo "✓ Backup verified: $backup_file"
    return 0
}

# Verify recent backups
find "$BACKUP_DIR" -name "manifest_*.json" -mtime -$RETENTION_DAYS | while read manifest; do
    echo "Verifying backup set from $(basename "$manifest")"
    
    # Parse manifest and verify each backup
    jq -r '.databases[] | "\(.file)|\(.checksum)"' "$manifest" | while read line; do
        file=$(echo "$line" | cut -d'|' -f1)
        checksum=$(echo "$line" | cut -d'|' -f2)
        
        backup_file="$BACKUP_DIR/database/$file"
        verify_backup "$backup_file" "$checksum"
    done
done

echo "Backup verification completed"
```

## 6. Recovery Testing

### 6.1 Automated Recovery Testing

```bash
#!/bin/bash
# test-recovery.sh

set -euo pipefail

TEST_DIR="/tmp/pampax_recovery_test"
BACKUP_DATE=${1:-$(ls -1 "/backup/pampax/database" | grep -o '[0-9]\{8\}_[0-9]\{6\}' | sort -r | head -1)}

echo "Testing recovery procedures with backup from: $BACKUP_DATE"

# Create test environment
mkdir -p "$TEST_DIR"
cd "$TEST_DIR"

# Copy backup files
cp "/backup/pampax/database/pampax_${BACKUP_DATE}.db.gz" .
cp "/backup/pampax/database/cache_${BACKUP_DATE}.db.gz" .
cp "/backup/pampax/database/metrics_${BACKUP_DATE}.db.gz" .

# Extract databases
gunzip *.gz

# Test database integrity
echo "Testing database integrity..."
for db in *.db; do
    echo "Checking $db..."
    sqlite3 "$db" "PRAGMA integrity_check;" | grep -q "ok" || {
        echo "ERROR: Database integrity check failed for $db"
        exit 1
    }
done

# Test data access
echo "Testing data access..."
sqlite3 pampax.db "SELECT COUNT(*) FROM sqlite_master;" >/dev/null || {
    echo "ERROR: Cannot access main database"
    exit 1
}

sqlite3 cache.db "SELECT COUNT(*) FROM cache_entries;" >/dev/null || {
    echo "ERROR: Cannot access cache database"
    exit 1
}

sqlite3 metrics.db "SELECT COUNT(*) FROM metrics;" >/dev/null || {
    echo "ERROR: Cannot access metrics database"
    exit 1
}

# Cleanup
cd /
rm -rf "$TEST_DIR"

echo "Recovery test completed successfully"
```

### 6.2 Recovery Time Objective (RTO) Testing

```bash
#!/bin/bash
# test-rto.sh

set -euo pipefail

RTO_TARGET=300  # 5 minutes
START_TIME=$(date +%s)

echo "Starting RTO test - Target: ${RTO_TARGET}s"

# Simulate disaster
systemctl stop pampax
mv /var/lib/pampax /var/lib/pampax.backup.$(date +%s)

# Start recovery timer
RECOVERY_START=$(date +%s)

# Execute recovery
/opt/pampax/scripts/disaster-recovery.sh

# Calculate recovery time
RECOVERY_END=$(date +%s)
RECOVERY_TIME=$((RECOVERY_END - RECOVERY_START))

echo "Recovery completed in ${RECOVERY_TIME}s"

if [ $RECOVERY_TIME -le $RTO_TARGET ]; then
    echo "✓ RTO target met: ${RECOVERY_TIME}s <= ${RTO_TARGET}s"
else
    echo "✗ RTO target missed: ${RECOVERY_TIME}s > ${RTO_TARGET}s"
    exit 1
fi
```

## 7. Monitoring and Alerting

### 7.1 Backup Monitoring

```yaml
# prometheus-backup-rules.yml
groups:
  - name: backup.rules
    rules:
      - alert: BackupFailure
        expr: backup_last_success_timestamp_seconds < (time() - 86400)
        for: 1h
        labels:
          severity: critical
        annotations:
          summary: "Backup has not succeeded in over 24 hours"
          description: "Last successful backup was {{ $value | humanizeTimestamp }}"

      - alert: BackupVerificationFailure
        expr: backup_verification_success == 0
        for: 15m
        labels:
          severity: warning
        annotations:
          summary: "Backup verification failed"
          description: "Backup integrity verification has failed"

      - alert: OffsiteBackupFailure
        expr: offsite_backup_last_success_timestamp_seconds < (time() - 172800)
        for: 2h
        labels:
          severity: warning
        annotations:
          summary: "Offsite backup has not succeeded in over 48 hours"
          description: "Last successful offsite backup was {{ $value | humanizeTimestamp }}"
```

## 8. Documentation and Procedures

### 8.1 Recovery Runbook

1. **Assessment Phase**
   - Determine scope of disaster
   - Identify affected systems
   - Estimate recovery time

2. **Preparation Phase**
   - Notify stakeholders
   - Prepare recovery environment
   - Verify backup availability

3. **Recovery Phase**
   - Execute recovery procedures
   - Verify system functionality
   - Monitor performance

4. **Validation Phase**
   - Run comprehensive tests
   - Validate data integrity
   - Confirm service availability

5. **Post-Recovery Phase**
   - Document lessons learned
   - Update procedures
   - Schedule post-mortem

### 8.2 Contact Information

**Primary Contacts:**
- System Administrator: admin@company.com
- Database Administrator: dba@company.com
- Security Team: security@company.com

**Escalation Contacts:**
- IT Director: it-director@company.com
- CTO: cto@company.com

**External Contacts:**
- Cloud Provider Support: support@cloud-provider.com
- Data Recovery Service: recovery@service.com

## 9. Compliance and Auditing

### 9.1 Backup Compliance Checklist

- [ ] Daily backups performed
- [ ] Weekly full backups completed
- [ ] Monthly offsite backups verified
- [ ] Backup integrity checks passed
- [ ] Recovery tests performed quarterly
- [ ] Retention policy enforced
- [ ] Access logs reviewed
- [ ] Encryption standards met

### 9.2 Audit Trail

```bash
#!/bin/bash
# backup-audit.sh

set -euo pipefail

AUDIT_FILE="/var/log/pampax/backup_audit.log"
DATE=$(date -Iseconds)

# Log backup activities
echo "[$DATE] Backup operation started" >> "$AUDIT_FILE"
echo "[$DATE] Operator: $USER" >> "$AUDIT_FILE"
echo "[$DATE] Backup type: $1" >> "$AUDIT_FILE"
echo "[$DATE] Source: $2" >> "$AUDIT_FILE"
echo "[$DATE] Destination: $3" >> "$AUDIT_FILE"
echo "[$DATE] Status: $4" >> "$AUDIT_FILE"
echo "[$DATE] Size: $5" >> "$AUDIT_FILE"
echo "[$DATE] Checksum: $6" >> "$AUDIT_FILE"
echo "----------------------------------------" >> "$AUDIT_FILE"
```

This comprehensive backup and disaster recovery guide ensures PAMPAX data is protected and can be quickly restored in case of emergencies, meeting enterprise requirements for data protection and business continuity.