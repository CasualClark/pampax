# Production Deployment Guide

This guide provides step-by-step procedures for deploying PAMPAX in production environments, ensuring reliability, performance, and maintainability.

## Prerequisites

### System Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| CPU | 2 cores | 4+ cores |
| RAM | 4GB | 8GB+ |
| Storage | 10GB SSD | 50GB+ SSD |
| Node.js | 18.x | 20.x LTS |
| OS | Linux/macOS | Linux (Ubuntu 20.04+) |

### Network Requirements

- **Outbound HTTPS**: Required for external API calls and updates
- **Port Access**: Default port 3000 (configurable)
- **Firewall**: Allow inbound traffic on configured port

## Deployment Checklist

### Pre-Deployment Checklist

- [ ] **Environment Setup**: Production environment provisioned
- [ ] **Dependencies**: Node.js 18+ and required system packages installed
- [ ] **Storage**: Persistent storage volume configured
- [ ] **Network**: Firewall rules and load balancer configured
- [ ] **Monitoring**: Logging and monitoring infrastructure ready
- [ ] **Backup**: Backup strategy and storage configured
- [ ] **Security**: SSL certificates and security policies in place

### Configuration Checklist

- [ ] **Configuration File**: `pampax.toml` created and validated
- [ ] **Environment Variables**: Production overrides configured
- [ ] **Feature Flags**: Production-appropriate feature settings
- [ ] **Performance Tuning**: Memory and timeout settings optimized
- [ ] **Security Settings**: Encryption and access control configured

## Deployment Methods

### Method 1: Direct Node.js Deployment

#### Step 1: Installation

```bash
# Clone the repository
git clone https://github.com/your-org/pampax.git
cd pampax

# Install dependencies
npm ci --production

# Install globally for CLI access
npm install -g .
```

#### Step 2: Configuration

```bash
# Create production configuration
pampax config --init

# Validate configuration
pampax config --validate

# Show current configuration
pampax config --show
```

#### Step 3: Service Setup

```bash
# Create system user
sudo useradd -r -s /bin/false pampax

# Create directories
sudo mkdir -p /opt/pampax /var/log/pampax /var/lib/pampax
sudo chown -R pampax:pampax /opt/pampax /var/log/pampax /var/lib/pampax

# Copy files
sudo cp -r . /opt/pampax/
sudo chown -R pampax:pampax /opt/pampax
```

#### Step 4: Systemd Service

Create `/etc/systemd/system/pampax.service`:

```ini
[Unit]
Description=PAMPAX Production Service
After=network.target

[Service]
Type=simple
User=pampax
Group=pampax
WorkingDirectory=/opt/pampax
ExecStart=/usr/bin/node /opt/pampax/src/mcp-server.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production
Environment=PAMPAX_LOGGING_LEVEL=info
Environment=PAMPAX_METRICS_ENABLED=true
Environment=PAMPAX_STORAGE_PATH=/var/lib/pampax

# Security
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/pampax /var/log/pampax

[Install]
WantedBy=multi-user.target
```

Enable and start the service:

```bash
sudo systemctl daemon-reload
sudo systemctl enable pampax
sudo systemctl start pampax
sudo systemctl status pampax
```

### Method 2: Docker Deployment

#### Step 1: Dockerfile

```dockerfile
FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

FROM node:20-alpine AS runtime

# Create non-root user
RUN addgroup -g 1001 -S pampax && \
    adduser -S pampax -u 1001 -G pampax

WORKDIR /app

# Copy production dependencies
COPY --from=builder /app/node_modules ./node_modules
COPY --chown=pampax:pampax . .

# Create directories
RUN mkdir -p /data/pampax /logs && \
    chown -R pampax:pampax /data /logs

USER pampax

EXPOSE 3000

ENV NODE_ENV=production
ENV PAMPAX_STORAGE_PATH=/data/pampax
ENV PAMPAX_LOGGING_OUTPUT=file
ENV PAMPAX_LOGGING_FILE_PATH=/logs/pampax.log

CMD ["node", "src/mcp-server.js"]
```

#### Step 2: Docker Compose

```yaml
version: '3.8'

services:
  pampax:
    build: .
    ports:
      - "3000:3000"
    volumes:
      - pampax_data:/data/pampax
      - pampax_logs:/logs
      - ./pampax.toml:/app/pampax.toml:ro
    environment:
      - NODE_ENV=production
      - PAMPAX_LOGGING_LEVEL=info
      - PAMPAX_METRICS_ENABLED=true
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "pampax", "health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    deploy:
      resources:
        limits:
          memory: 2G
          cpus: '1.0'
        reservations:
          memory: 512M
          cpus: '0.5'

volumes:
  pampax_data:
    driver: local
  pampax_logs:
    driver: local
```

#### Step 3: Deployment

```bash
# Build and start
docker-compose up -d

# Check status
docker-compose ps
docker-compose logs -f pampax

# Health check
docker-compose exec pampax pampax health
```

### Method 3: Kubernetes Deployment

#### Step 1: ConfigMap

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: pampax-config
  namespace: pampax
data:
  pampax.toml: |
    [logging]
    level = "info"
    format = "json"
    output = "stdout"
    structured = true

    [metrics]
    enabled = true
    sink = "prometheus"
    sampling_rate = 0.1
    labels = { service = "pampax", environment = "production" }

    [cache]
    enabled = true
    ttl_seconds = 3600
    max_size_mb = 1000
    strategy = "lru"

    [performance]
    query_timeout_ms = 10000
    max_concurrent_searches = 20
    parallel_processing = true
    memory_limit_mb = 2048

    [storage]
    type = "sqlite"
    path = "/data/pampax"
    backup_enabled = true
    backup_interval_hours = 6

    [features]
    learning = true
    analytics = true
    policy_optimization = true
    experimental_features = false

    [security]
    encrypt_storage = false
    access_log_enabled = true
    rate_limiting = true
    max_requests_per_minute = 1000
```

#### Step 2: Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: pampax
  namespace: pampax
  labels:
    app: pampax
spec:
  replicas: 3
  selector:
    matchLabels:
      app: pampax
  template:
    metadata:
      labels:
        app: pampax
    spec:
      containers:
      - name: pampax
        image: pampax:latest
        ports:
        - containerPort: 3000
        env:
        - name: NODE_ENV
          value: "production"
        - name: PAMPAX_LOGGING_LEVEL
          value: "info"
        - name: PAMPAX_METRICS_SAMPLING_RATE
          value: "0.1"
        volumeMounts:
        - name: config
          mountPath: /app/pampax.toml
          subPath: pampax.toml
          readOnly: true
        - name: data
          mountPath: /data/pampax
        resources:
          requests:
            memory: "512Mi"
            cpu: "250m"
          limits:
            memory: "2Gi"
            cpu: "1000m"
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /ready
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5
      volumes:
      - name: config
        configMap:
          name: pampax-config
      - name: data
        persistentVolumeClaim:
          claimName: pampax-data
```

#### Step 3: Service and Ingress

```yaml
apiVersion: v1
kind: Service
metadata:
  name: pampax-service
  namespace: pampax
spec:
  selector:
    app: pampax
  ports:
  - protocol: TCP
    port: 80
    targetPort: 3000
  type: ClusterIP

---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: pampax-ingress
  namespace: pampax
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
spec:
  tls:
  - hosts:
    - pampax.yourdomain.com
    secretName: pampax-tls
  rules:
  - host: pampax.yourdomain.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: pampax-service
            port:
              number: 80
```

## Post-Deployment Verification

### Health Checks

```bash
# Basic health check
pampax health

# Detailed health status
pampax health --verbose

# Check specific components
pampax health --component sqlite
pampax health --component cache
pampax health --component indexer
```

### Performance Validation

```bash
# Run performance benchmarks
python bench/run_bench.py --tier medium --warm --trials 10

# Check cache performance
pampax cache stats

# Verify configuration
pampax config --validate
```

### Monitoring Setup

```bash
# Check metrics endpoint
curl http://localhost:3000/metrics

# Verify structured logging
tail -f /var/log/pampax/pampax.log | jq .

# Check error rates
grep '"level":"ERROR"' /var/log/pampax/pampax.log | wc -l
```

## Rollback Procedures

### Quick Rollback

```bash
# Systemd service rollback
sudo systemctl stop pampax
sudo git checkout previous-version-tag
sudo npm ci --production
sudo systemctl start pampax

# Docker rollback
docker-compose down
docker-compose pull pampax:previous-version
docker-compose up -d

# Kubernetes rollback
kubectl rollout undo deployment/pampax -n pampax
```

### Full Rollback with Data Recovery

```bash
# 1. Stop service
sudo systemctl stop pampax

# 2. Backup current data
sudo cp -r /var/lib/pampax /var/lib/pampax.backup.$(date +%Y%m%d_%H%M%S)

# 3. Restore previous data if needed
sudo rm -rf /var/lib/pampax
sudo mv /var/lib/pampax.backup.previous /var/lib/pampax

# 4. Clear caches
pampax cache clear --all

# 5. Restart service
sudo systemctl start pampax

# 6. Verify health
pampax health
```

## Troubleshooting Common Deployment Issues

### Issue: Service Won't Start

**Symptoms**: Service fails to start or immediately exits

**Diagnosis**:
```bash
# Check service status
sudo systemctl status pampax

# View logs
sudo journalctl -u pampax -f

# Check configuration
pampax config --validate
```

**Common Causes**:
- Invalid configuration file
- Missing environment variables
- Permission issues
- Port already in use

**Solutions**:
```bash
# Fix configuration
pampax config --init

# Set proper permissions
sudo chown -R pampax:pampax /var/lib/pampax /var/log/pampax

# Check port usage
sudo netstat -tlnp | grep :3000
```

### Issue: Poor Performance

**Symptoms**: Slow response times, high memory usage

**Diagnosis**:
```bash
# Check resource usage
top -p $(pgrep -f pampax)

# Run benchmarks
python bench/run_bench.py --tier medium --trials 5

# Check cache hit rate
pampax cache stats
```

**Solutions**:
- Increase memory limits
- Optimize cache configuration
- Check SQLite performance
- Review indexer settings

### Issue: Database Errors

**Symptoms**: SQLite errors, data corruption

**Diagnosis**:
```bash
# Check database integrity
sqlite3 /var/lib/pampax/pampax.db "PRAGMA integrity_check;"

# Check disk space
df -h /var/lib/pampax

# Check file permissions
ls -la /var/lib/pampax/
```

**Solutions**:
```bash
# Repair database
sqlite3 /var/lib/pampax/pampax.db ".recover" | sqlite3 /var/lib/pampax/pampax_repaired.db

# Clear and rebuild
pampax cache clear --all
pampax indexer rebuild
```

## Security Considerations

### Production Security Checklist

- [ ] **Non-root User**: Service runs as non-privileged user
- [ ] **File Permissions**: Restrictive permissions on data and config files
- [ ] **Network Security**: Firewall rules configured
- [ ] **SSL/TLS**: HTTPS termination enabled
- [ ] **Secrets Management**: No secrets in configuration files
- [ ] **Access Logging**: Access logging enabled
- [ ] **Rate Limiting**: Rate limiting configured
- [ ] **Input Validation**: All inputs validated
- [ ] **Dependency Updates**: Regular security updates

### Security Hardening

```bash
# Set secure file permissions
sudo chmod 600 /etc/pampax/pampax.toml
sudo chmod 700 /var/lib/pampax
sudo chmod 600 /var/lib/pampax/pampax.db

# Configure fail2ban for rate limiting
sudo apt-get install fail2ban
sudo systemctl enable fail2ban

# Set up log rotation
sudo tee /etc/logrotate.d/pampax << EOF
/var/log/pampax/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    create 644 pampax pampax
    postrotate
        systemctl reload pampax
    endscript
}
EOF
```

## Maintenance Windows

### Scheduled Maintenance

**Weekly Tasks**:
- Review logs for errors
- Check performance metrics
- Verify backup integrity
- Update dependencies

**Monthly Tasks**:
- Full system health check
- Performance benchmarking
- Security audit
- Cache optimization

**Quarterly Tasks**:
- Major dependency updates
- Storage capacity planning
- Disaster recovery testing
- Performance tuning review

### Maintenance Procedure

```bash
#!/bin/bash
# maintenance.sh - Weekly maintenance script

set -e

echo "Starting PAMPAX maintenance..."

# 1. Backup current state
echo "Creating backup..."
sudo systemctl stop pampax
sudo cp -r /var/lib/pampax /var/lib/pampax.backup.$(date +%Y%m%d_%H%M%S)

# 2. Clear old caches
echo "Clearing caches..."
pampax cache clear --all

# 3. Update dependencies
echo "Updating dependencies..."
cd /opt/pampax
sudo npm update

# 4. Run health checks
echo "Running health checks..."
pampax health --verbose

# 5. Start service
echo "Starting service..."
sudo systemctl start pampax

# 6. Verify operation
echo "Verifying operation..."
sleep 10
pampax health

echo "Maintenance completed successfully!"
```

This production deployment guide provides comprehensive procedures for deploying, maintaining, and troubleshooting PAMPAX in production environments with proper security, monitoring, and reliability considerations.