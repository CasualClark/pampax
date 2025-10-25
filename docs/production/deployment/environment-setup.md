# Environment Setup Guide

This guide provides comprehensive procedures for setting up production environments for PAMPAX, including system requirements, dependencies, and infrastructure preparation.

## System Requirements

### Minimum Requirements

| Component | Minimum | Recommended | Notes |
|-----------|---------|-------------|-------|
| **CPU** | 2 cores @ 2.0GHz | 4+ cores @ 2.5GHz | Multi-core improves parallel processing |
| **Memory** | 4GB RAM | 8GB+ RAM | Additional memory improves caching |
| **Storage** | 10GB SSD | 50GB+ SSD | SSD required for optimal SQLite performance |
| **Network** | 100 Mbps | 1 Gbps | For external API calls and data transfer |
| **OS** | Linux/macOS | Ubuntu 20.04+ LTS | Linux preferred for production |

### Software Dependencies

#### Core Dependencies
- **Node.js**: 18.x LTS or 20.x LTS
- **npm**: 8.x or later
- **SQLite**: 3.35+ (included with Node.js sqlite3 package)

#### Optional Dependencies
- **Git**: For repository indexing
- **Python 3.8+**: For benchmarking and maintenance scripts
- **Docker**: 20.10+ (for containerized deployment)
- **Kubernetes**: 1.24+ (for orchestration)

## Environment Preparation

### 1. Operating System Setup

#### Ubuntu/Debian Systems

```bash
#!/bin/bash
# setup-ubuntu.sh - Ubuntu environment preparation

set -e

echo "Setting up PAMPAX production environment on Ubuntu..."

# Update system packages
sudo apt-get update
sudo apt-get upgrade -y

# Install required system packages
sudo apt-get install -y \
    curl \
    wget \
    gnupg2 \
    ca-certificates \
    lsb-release \
    software-properties-common \
    build-essential \
    git \
    python3 \
    python3-pip \
    sqlite3 \
    htop \
    iotop \
    jq \
    tree

# Install Node.js 20.x LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify installation
echo "Node.js version: $(node --version)"
echo "npm version: $(npm --version)"

# Create pampax user
sudo useradd -r -s /bin/false pampax || true

# Create directories
sudo mkdir -p /opt/pampax /var/log/pampax /var/lib/pampax /etc/pampax
sudo chown -R pampax:pampax /opt/pampax /var/log/pampax /var/lib/pampax /etc/pampax

echo "Ubuntu environment setup completed!"
```

#### CentOS/RHEL Systems

```bash
#!/bin/bash
# setup-centos.sh - CentOS/RHEL environment preparation

set -e

echo "Setting up PAMPAX production environment on CentOS/RHEL..."

# Update system packages
sudo yum update -y
sudo yum upgrade -y

# Install required system packages
sudo yum groupinstall -y "Development Tools"
sudo yum install -y \
    curl \
    wget \
    git \
    python3 \
    python3-pip \
    sqlite \
    htop \
    iotop \
    jq \
    tree

# Install Node.js 20.x LTS
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo yum install -y nodejs npm

# Verify installation
echo "Node.js version: $(node --version)"
echo "npm version: $(npm --version)"

# Create pampax user
sudo useradd -r -s /bin/false pampax || true

# Create directories
sudo mkdir -p /opt/pampax /var/log/pampax /var/lib/pampax /etc/pampax
sudo chown -R pampax:pampax /opt/pampax /var/log/pampax /var/lib/pampax /etc/pampax

echo "CentOS/RHEL environment setup completed!"
```

### 2. Network Configuration

#### Firewall Setup

```bash
#!/bin/bash
# setup-firewall.sh - Network security configuration

# Ubuntu (UFW)
if command -v ufw >/dev/null 2>&1; then
    echo "Configuring UFW firewall..."
    
    # Default policies
    sudo ufw --force reset
    sudo ufw default deny incoming
    sudo ufw default allow outgoing
    
    # Allow SSH (adjust port as needed)
    sudo ufw allow 22/tcp
    
    # Allow PAMPAX port (default 3000)
    sudo ufw allow 3000/tcp
    
    # Allow monitoring ports (if using Prometheus)
    sudo ufw allow 9090/tcp
    
    # Enable firewall
    sudo ufw --force enable
    
    echo "UFW firewall configured"
fi

# CentOS/RHEL (firewalld)
if command -v firewall-cmd >/dev/null 2>&1; then
    echo "Configuring firewalld..."
    
    # Start and enable firewalld
    sudo systemctl start firewalld
    sudo systemctl enable firewalld
    
    # Allow SSH
    sudo firewall-cmd --permanent --add-service=ssh
    
    # Allow PAMPAX port
    sudo firewall-cmd --permanent --add-port=3000/tcp
    
    # Allow monitoring
    sudo firewall-cmd --permanent --add-port=9090/tcp
    
    # Reload firewall
    sudo firewall-cmd --reload
    
    echo "firewalld configured"
fi
```

#### SSL/TLS Certificate Setup

```bash
#!/bin/bash
# setup-ssl.sh - SSL certificate configuration

DOMAIN=${1:-pampax.yourdomain.com}
EMAIL=${2:-admin@yourdomain.com}

echo "Setting up SSL certificate for $DOMAIN..."

# Install Certbot (Let's Encrypt)
if command -v apt-get >/dev/null 2>&1; then
    sudo apt-get install -y certbot python3-certbot-nginx
elif command -v yum >/dev/null 2>&1; then
    sudo yum install -y certbot python3-certbot-nginx
fi

# Obtain certificate (requires nginx to be running)
sudo certbot --nginx -d "$DOMAIN" --email "$EMAIL" --agree-tos --non-interactive

# Setup auto-renewal
sudo crontab -l | grep -q "certbot renew" || \
    (sudo crontab -l; echo "0 12 * * * /usr/bin/certbot renew --quiet") | sudo crontab -

echo "SSL certificate setup completed for $DOMAIN"
```

### 3. Storage Configuration

#### Disk Partitioning and Mounting

```bash
#!/bin/bash
# setup-storage.sh - Storage configuration

STORAGE_DEVICE=${1:-/dev/sdb}
MOUNT_POINT=${2:-/var/lib/pampax}

echo "Setting up storage on $STORAGE_DEVICE at $MOUNT_POINT..."

# Format the device (WARNING: This will destroy all data on the device)
echo "WARNING: This will format $STORAGE_DEVICE. Continue? (y/N)"
read -r response
if [[ "$response" =~ ^([yY][eE][sS]|[yY])$ ]]; then
    # Create ext4 filesystem
    sudo mkfs.ext4 -F "$STORAGE_DEVICE"
    
    # Create mount point
    sudo mkdir -p "$MOUNT_POINT"
    
    # Add to fstab
    UUID=$(sudo blkid -s UUID -o value "$STORAGE_DEVICE")
    echo "UUID=$UUID  $MOUNT_POINT  ext4  defaults,noatime  0  2" | sudo tee -a /etc/fstab
    
    # Mount the filesystem
    sudo mount "$MOUNT_POINT"
    
    # Set ownership
    sudo chown -R pampax:pampax "$MOUNT_POINT"
    
    echo "Storage setup completed"
else
    echo "Storage setup cancelled"
fi
```

#### Performance Optimization

```bash
#!/bin/bash
# optimize-storage.sh - Storage performance tuning

echo "Optimizing storage performance..."

# Tune filesystem for SQLite performance
if mountpoint -q /var/lib/pampax; then
    # Enable noatime for better performance
    sudo tune2fs -o noatime "$(findmnt -n -o SOURCE /var/lib/pampax)"
    
    # Increase file descriptor limits
    echo "pampax soft nofile 65536" | sudo tee -a /etc/security/limits.conf
    echo "pampax hard nofile 65536" | sudo tee -a /etc/security/limits.conf
    
    # Configure system-wide limits
    echo "fs.file-max = 2097152" | sudo tee -a /etc/sysctl.conf
    echo "vm.swappiness = 10" | sudo tee -a /etc/sysctl.conf
    echo "vm.dirty_ratio = 15" | sudo tee -a /etc/sysctl.conf
    echo "vm.dirty_background_ratio = 5" | sudo tee -a /etc/sysctl.conf
    
    # Apply sysctl changes
    sudo sysctl -p
    
    echo "Storage optimization completed"
fi
```

### 4. Monitoring Infrastructure

#### Prometheus Setup

```yaml
# prometheus.yml - Prometheus configuration
global:
  scrape_interval: 15s
  evaluation_interval: 15s

rule_files:
  - "pampax_rules.yml"

scrape_configs:
  - job_name: 'pampax'
    static_configs:
      - targets: ['localhost:3000']
    metrics_path: '/metrics'
    scrape_interval: 30s

  - job_name: 'node'
    static_configs:
      - targets: ['localhost:9100']

alerting:
  alertmanagers:
    - static_configs:
        - targets:
          - alertmanager:9093
```

#### Grafana Dashboard

```json
{
  "dashboard": {
    "title": "PAMPAX Production Dashboard",
    "panels": [
      {
        "title": "Request Rate",
        "type": "graph",
        "targets": [
          {
            "expr": "rate(http_requests_total[5m])",
            "legendFormat": "{{method}} {{status}}"
          }
        ]
      },
      {
        "title": "Response Time",
        "type": "graph",
        "targets": [
          {
            "expr": "histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))",
            "legendFormat": "95th percentile"
          },
          {
            "expr": "histogram_quantile(0.50, rate(http_request_duration_seconds_bucket[5m]))",
            "legendFormat": "50th percentile"
          }
        ]
      },
      {
        "title": "Cache Hit Rate",
        "type": "singlestat",
        "targets": [
          {
            "expr": "rate(cache_hits_total[5m]) / (rate(cache_hits_total[5m]) + rate(cache_misses_total[5m])) * 100",
            "legendFormat": "Hit Rate %"
          }
        ]
      },
      {
        "title": "Memory Usage",
        "type": "graph",
        "targets": [
          {
            "expr": "process_resident_memory_bytes",
            "legendFormat": "Memory Usage"
          }
        ]
      }
    ]
  }
}
```

## Container Environment Setup

### Docker Environment

#### Dockerfile Production

```dockerfile
# Dockerfile.prod - Production Docker image
FROM node:20-alpine AS builder

# Install build dependencies
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    sqlite-dev

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies
RUN npm ci --only=production && npm cache clean --force

# Production stage
FROM node:20-alpine AS production

# Install runtime dependencies
RUN apk add --no-cache \
    sqlite \
    curl \
    bash

# Create non-root user
RUN addgroup -g 1001 -S pampax && \
    adduser -S pampax -u 1001 -G pampax

WORKDIR /app

# Copy production dependencies
COPY --from=builder --chown=pampax:pampax /app/node_modules ./node_modules

# Copy application code
COPY --chown=pampax:pampax . .

# Create directories
RUN mkdir -p /data/pampax /logs && \
    chown -R pampax:pampax /data /logs

# Switch to non-root user
USER pampax

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

EXPOSE 3000

# Environment variables
ENV NODE_ENV=production
ENV PAMPAX_STORAGE_PATH=/data/pampax
ENV PAMPAX_LOGGING_OUTPUT=file
ENV PAMPAX_LOGGING_FILE_PATH=/logs/pampax.log

CMD ["node", "src/mcp-server.js"]
```

#### Docker Compose Production

```yaml
# docker-compose.prod.yml - Production Docker Compose
version: '3.8'

services:
  pampax:
    build:
      context: .
      dockerfile: Dockerfile.prod
    ports:
      - "3000:3000"
    volumes:
      - pampax_data:/data/pampax
      - pampax_logs:/logs
      - ./pampax.prod.toml:/app/pampax.toml:ro
    environment:
      - NODE_ENV=production
      - PAMPAX_LOGGING_LEVEL=info
      - PAMPAX_METRICS_ENABLED=true
      - PAMPAX_METRICS_SINK=prometheus
    restart: unless-stopped
    deploy:
      replicas: 2
      resources:
        limits:
          memory: 2G
          cpus: '1.0'
        reservations:
          memory: 512M
          cpus: '0.5'
      restart_policy:
        condition: on-failure
        delay: 5s
        max_attempts: 3
      update_config:
        parallelism: 1
        delay: 10s
        failure_action: rollback
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./ssl:/etc/nginx/ssl:ro
    depends_on:
      - pampax
    restart: unless-stopped

  prometheus:
    image: prom/prometheus:latest
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - prometheus_data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
      - '--web.console.libraries=/etc/prometheus/console_libraries'
      - '--web.console.templates=/etc/prometheus/consoles'
      - '--storage.tsdb.retention.time=200h'
      - '--web.enable-lifecycle'
    restart: unless-stopped

  grafana:
    image: grafana/grafana:latest
    ports:
      - "3001:3000"
    volumes:
      - grafana_data:/var/lib/grafana
      - ./grafana/provisioning:/etc/grafana/provisioning
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin123
      - GF_USERS_ALLOW_SIGN_UP=false
    restart: unless-stopped

volumes:
  pampax_data:
    driver: local
  pampax_logs:
    driver: local
  prometheus_data:
    driver: local
  grafana_data:
    driver: local

networks:
  default:
    driver: bridge
```

### Kubernetes Environment

#### Namespace and RBAC

```yaml
# k8s-namespace.yml - Kubernetes namespace setup
apiVersion: v1
kind: Namespace
metadata:
  name: pampax
  labels:
    name: pampax
    environment: production

---
apiVersion: v1
kind: ServiceAccount
metadata:
  name: pampax
  namespace: pampax

---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: pampax-role
  namespace: pampax
rules:
- apiGroups: [""]
  resources: ["pods", "services", "configmaps", "secrets"]
  verbs: ["get", "list", "watch"]

---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: pampax-rolebinding
  namespace: pampax
subjects:
- kind: ServiceAccount
  name: pampax
  namespace: pampax
roleRef:
  kind: Role
  name: pampax-role
  apiGroup: rbac.authorization.k8s.io
```

#### Resource Limits and Quotas

```yaml
# k8s-resources.yml - Resource management
apiVersion: v1
kind: ResourceQuota
metadata:
  name: pampax-quota
  namespace: pampax
spec:
  hard:
    requests.cpu: "4"
    requests.memory: 8Gi
    limits.cpu: "8"
    limits.memory: 16Gi
    persistentvolumeclaims: "4"
    services: "10"
    secrets: "10"
    configmaps: "10"

---
apiVersion: v1
kind: LimitRange
metadata:
  name: pampax-limits
  namespace: pampax
spec:
  limits:
  - default:
      cpu: "500m"
      memory: "1Gi"
    defaultRequest:
      cpu: "100m"
      memory: "128Mi"
    type: Container
  - max:
      cpu: "2"
      memory: "4Gi"
    min:
      cpu: "50m"
      memory: "64Mi"
    type: Container
```

## Environment Validation

### Health Check Script

```bash
#!/bin/bash
# validate-environment.sh - Environment validation script

set -e

echo "=== PAMPAX Environment Validation ==="
echo ""

# Check system requirements
echo "1. System Requirements Check"
echo "   Node.js: $(node --version)"
echo "   npm: $(npm --version)"
echo "   Memory: $(free -h | grep '^Mem:' | awk '{print $2}')"
echo "   Disk: $(df -h / | tail -1 | awk '{print $4}')"
echo "   CPU: $(nproc) cores"
echo ""

# Check directories
echo "2. Directory Structure Check"
directories=(
    "/opt/pampax"
    "/var/log/pampax"
    "/var/lib/pampax"
    "/etc/pampax"
)

for dir in "${directories[@]}"; do
    if [ -d "$dir" ]; then
        echo "   ✓ $dir exists"
        if [ -w "$dir" ]; then
            echo "   ✓ $dir is writable"
        else
            echo "   ✗ $dir is not writable"
        fi
    else
        echo "   ✗ $dir does not exist"
    fi
done
echo ""

# Check configuration
echo "3. Configuration Check"
if [ -f "/etc/pampax/pampax.toml" ]; then
    echo "   ✓ Configuration file exists"
    if pampax config --validate; then
        echo "   ✓ Configuration is valid"
    else
        echo "   ✗ Configuration validation failed"
    fi
else
    echo "   ✗ Configuration file not found"
fi
echo ""

# Check network connectivity
echo "4. Network Check"
if command -v curl >/dev/null 2>&1; then
    if curl -f http://localhost:3000/health >/dev/null 2>&1; then
        echo "   ✓ PAMPAX service is responding"
    else
        echo "   ✗ PAMPAX service is not responding"
    fi
else
    echo "   ✗ curl not available for network testing"
fi
echo ""

# Check dependencies
echo "5. Dependency Check"
dependencies=("git" "sqlite3" "python3")
for dep in "${dependencies[@]}"; do
    if command -v "$dep" >/dev/null 2>&1; then
        echo "   ✓ $dep is available"
    else
        echo "   ⚠ $dep is not available (optional)"
    fi
done
echo ""

echo "=== Validation Complete ==="
```

### Performance Baseline Test

```bash
#!/bin/bash
# baseline-performance.sh - Performance baseline testing

echo "Running PAMPAX performance baseline tests..."

# Create test repository
TEST_REPO="/tmp/pampax-test-repo"
rm -rf "$TEST_REPO"
mkdir -p "$TEST_REPO"

# Create test files
for i in {1..100}; do
    echo "function test$i() { return 'test file $i'; }" > "$TEST_REPO/test$i.js"
done

# Run performance tests
echo "1. Cold cache performance..."
pampax cache clear --all
time pampax search --query "function test" --path "$TEST_REPO" --output json

echo ""
echo "2. Warm cache performance..."
time pampax search --query "function test" --path "$TEST_REPO" --output json

echo ""
echo "3. Cache statistics..."
pampax cache stats

# Cleanup
rm -rf "$TEST_REPO"

echo "Performance baseline testing completed!"
```

## Environment-Specific Configurations

### Development Environment

```bash
#!/bin/bash
# setup-dev.sh - Development environment setup

echo "Setting up PAMPAX development environment..."

# Install development dependencies
npm install

# Create development configuration
cat > pampax.dev.toml << EOF
[logging]
level = "debug"
format = "pretty"
output = "stdout"

[metrics]
enabled = true
sink = "stdout"
sampling_rate = 1.0

[features]
debug_mode = true
experimental_features = true

[performance]
query_timeout_ms = 30000
memory_limit_mb = 512
EOF

# Setup pre-commit hooks
cat > .git/hooks/pre-commit << 'EOF'
#!/bin/bash
npm run lint
npm run test
EOF
chmod +x .git/hooks/pre-commit

echo "Development environment setup completed!"
```

### Production Environment

```bash
#!/bin/bash
# setup-prod.sh - Production environment setup

echo "Setting up PAMPAX production environment..."

# Create production configuration
cat > pampax.prod.toml << EOF
[logging]
level = "warn"
format = "json"
output = "file"
file_path = "/var/log/pampax/pampax.log"

[metrics]
enabled = true
sink = "prometheus"
sampling_rate = 0.05

[security]
encrypt_storage = true
rate_limiting = true

[performance]
query_timeout_ms = 8000
memory_limit_mb = 4096
EOF

# Setup log rotation
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

echo "Production environment setup completed!"
```

This comprehensive environment setup guide provides all the necessary procedures to prepare production environments for PAMPAX deployment, including system requirements, network configuration, storage optimization, and monitoring infrastructure.