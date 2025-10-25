# Monitoring Guide

This comprehensive guide covers monitoring PAMPAX in production environments, including metrics collection, alerting, log analysis, and performance monitoring.

## Monitoring Architecture

### Monitoring Stack Components

```
┌─────────────────────────────────────────────────────────────┐
│                    Monitoring Stack                        │
├─────────────────────────────────────────────────────────────┤
│  Collection Layer                                          │
│  ├─ PAMPAX Metrics (Prometheus format)                   │
│  ├─ Structured Logs (JSON)                               │
│  ├─ Health Checks (HTTP endpoints)                        │
│  └─ System Metrics (Node Exporter)                        │
├─────────────────────────────────────────────────────────────┤
│  Storage Layer                                            │
│  ├─ Prometheus TSDB                                       │
│  ├─ Loki Log Aggregation                                 │
│  ├─ InfluxDB (optional)                                  │
│  └─ Elasticsearch (optional)                             │
├─────────────────────────────────────────────────────────────┤
│  Visualization Layer                                       │
│  ├─ Grafana Dashboards                                   │
│  ├─ AlertManager                                         │
│  └─ Kibana (optional)                                    │
├─────────────────────────────────────────────────────────────┤
│  Alerting Layer                                           │
│  ├─ Prometheus AlertManager                               │
│  ├─ PagerDuty Integration                                │
│  ├─ Slack Notifications                                   │
│  └─ Email Alerts                                         │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow

1. **PAMPAX Application** → Metrics/Logs → **Prometheus/Loki**
2. **Node Exporter** → System Metrics → **Prometheus**
3. **Prometheus** → Alert Rules → **AlertManager**
4. **AlertManager** → Notifications → **Slack/PagerDuty/Email**
5. **Grafana** → Queries → **Prometheus/Loki** → **Dashboards**

## Metrics Collection

### PAMPAX Application Metrics

#### Core Performance Metrics

```javascript
// src/metrics/pampax-metrics.js - Core metrics collection
import { getMetricsCollector } from './metrics-collector.js';

class PampaxMetrics {
  constructor() {
    this.collector = getMetricsCollector();
    this.initializeMetrics();
  }

  initializeMetrics() {
    // Request metrics
    this.httpRequestsTotal = this.collector.createCounter({
      name: 'pampax_http_requests_total',
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'status', 'endpoint']
    });

    this.requestDuration = this.collector.createHistogram({
      name: 'pampax_request_duration_seconds',
      help: 'HTTP request duration in seconds',
      labelNames: ['method', 'endpoint'],
      buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2, 5]
    });

    // Search metrics
    this.searchQueriesTotal = this.collector.createCounter({
      name: 'pampax_search_queries_total',
      help: 'Total number of search queries',
      labelNames: ['query_type', 'result_count']
    });

    this.searchDuration = this.collector.createHistogram({
      name: 'pampax_search_duration_seconds',
      help: 'Search query duration in seconds',
      labelNames: ['query_type'],
      buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10]
    });

    // Cache metrics
    this.cacheHits = this.collector.createCounter({
      name: 'pampax_cache_hits_total',
      help: 'Total cache hits',
      labelNames: ['cache_type']
    });

    this.cacheMisses = this.collector.createCounter({
      name: 'pampax_cache_misses_total',
      help: 'Total cache misses',
      labelNames: ['cache_type']
    });

    // Database metrics
    this.dbConnections = this.collector.createGauge({
      name: 'pampax_db_connections_active',
      help: 'Active database connections'
    });

    this.dbQueryDuration = this.collector.createHistogram({
      name: 'pampax_db_query_duration_seconds',
      help: 'Database query duration in seconds',
      labelNames: ['operation'],
      buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1]
    });

    // Resource metrics
    this.memoryUsage = this.collector.createGauge({
      name: 'pampax_memory_usage_bytes',
      help: 'Memory usage in bytes'
    });

    this.cpuUsage = this.collector.createGauge({
      name: 'pampax_cpu_usage_percent',
      help: 'CPU usage percentage'
    });
  }

  recordHttpRequest(method, status, endpoint, duration) {
    this.httpRequestsTotal.inc({ method, status, endpoint });
    this.requestDuration.observe({ method, endpoint }, duration);
  }

  recordSearch(queryType, resultCount, duration) {
    this.searchQueriesTotal.inc({ query_type: queryType, result_count: resultCount });
    this.searchDuration.observe({ query_type: queryType }, duration);
  }

  recordCacheHit(cacheType) {
    this.cacheHits.inc({ cache_type: cacheType });
  }

  recordCacheMiss(cacheType) {
    this.cacheMisses.inc({ cache_type: cacheType });
  }

  updateResourceUsage() {
    const usage = process.memoryUsage();
    this.memoryUsage.set(usage.rss);
    
    const cpuUsage = process.cpuUsage();
    this.cpuUsage.set(cpuUsage.user / 1000000); // Convert to seconds
  }

  getMetrics() {
    return this.collector.getMetrics();
  }
}

export default PampaxMetrics;
```

#### Metrics Endpoint Implementation

```javascript
// src/metrics/metrics-endpoint.js - Prometheus metrics endpoint
import PampaxMetrics from './pampax-metrics.js';

class MetricsEndpoint {
  constructor() {
    this.metrics = new PampaxMetrics();
  }

  // Express.js middleware
  middleware() {
    return (req, res, next) => {
      // Record request metrics
      const start = Date.now();
      
      res.on('finish', () => {
        const duration = (Date.now() - start) / 1000;
        this.metrics.recordHttpRequest(
          req.method,
          res.statusCode.toString(),
          req.path,
          duration
        );
      });

      next();
    };
  }

  // Metrics endpoint handler
  async handler(req, res) {
    try {
      // Update resource metrics
      this.metrics.updateResourceUsage();
      
      // Get metrics in Prometheus format
      const metrics = await this.metrics.getMetrics();
      
      res.set('Content-Type', 'text/plain');
      res.send(metrics);
    } catch (error) {
      console.error('Error generating metrics:', error);
      res.status(500).send('Error generating metrics');
    }
  }
}

export default MetricsEndpoint;
```

### System Metrics

#### Node Exporter Configuration

```yaml
# prometheus-node-exporter.yml - Node Exporter configuration
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: node-exporter
  namespace: monitoring
spec:
  selector:
    matchLabels:
      app: node-exporter
  template:
    metadata:
      labels:
        app: node-exporter
    spec:
      containers:
      - name: node-exporter
        image: prom/node-exporter:latest
        ports:
        - containerPort: 9100
          hostPort: 9100
        args:
        - "--path.rootfs=/host"
        - "--collector.filesystem.mount-points-exclude=^/(sys|proc|dev|host|etc)($|/)"
        volumeMounts:
        - name: root
          mountPath: /host
      volumes:
      - name: root
        hostPath:
          path: /
```

#### Custom System Metrics

```javascript
// src/metrics/system-metrics.js - System-specific metrics
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

class SystemMetrics {
  constructor(metricsCollector) {
    this.collector = metricsCollector;
    this.initializeMetrics();
  }

  initializeMetrics() {
    // Disk usage metrics
    this.diskUsageBytes = this.collector.createGauge({
      name: 'pampax_disk_usage_bytes',
      help: 'Disk usage in bytes',
      labelNames: ['mountpoint']
    });

    this.diskAvailableBytes = this.collector.createGauge({
      name: 'pampax_disk_available_bytes',
      help: 'Available disk space in bytes',
      labelNames: ['mountpoint']
    });

    // SQLite database metrics
    this.dbSizeBytes = this.collector.createGauge({
      name: 'pampax_database_size_bytes',
      help: 'SQLite database size in bytes'
    });

    this.dbPageCount = this.collector.createGauge({
      name: 'pampax_database_page_count',
      help: 'SQLite database page count'
    });

    // File indexing metrics
    this.indexedFiles = this.collector.createGauge({
      name: 'pampax_indexed_files_total',
      help: 'Total number of indexed files'
    });

    this.indexSizeBytes = this.collector.createGauge({
      name: 'pampax_index_size_bytes',
      help: 'Index size in bytes'
    });
  }

  async updateDiskMetrics() {
    try {
      const { stdout } = await execAsync('df -B1 | grep -E "^/dev/"');
      const lines = stdout.trim().split('\n');
      
      for (const line of lines) {
        const [filesystem, size, used, available, usePercent, mountpoint] = line.split(/\s+/);
        
        this.diskUsageBytes.set({ mountpoint }, parseInt(used));
        this.diskAvailableBytes.set({ mountpoint }, parseInt(available));
      }
    } catch (error) {
      console.error('Error updating disk metrics:', error);
    }
  }

  async updateDatabaseMetrics() {
    try {
      const dbPath = process.env.PAMPAX_STORAGE_PATH || '.pampax';
      const dbFile = `${dbPath}/pampax.db`;
      
      // Database size
      const { stdout: sizeOutput } = await execAsync(`stat -c %s ${dbFile}`);
      this.dbSizeBytes.set(parseInt(sizeOutput.trim()));
      
      // Database page count
      const { stdout: pageOutput } = await execAsync(
        `sqlite3 ${dbFile} "PRAGMA page_count;"`
      );
      this.dbPageCount.set(parseInt(pageOutput.trim()));
      
    } catch (error) {
      console.error('Error updating database metrics:', error);
    }
  }

  async updateIndexMetrics() {
    try {
      const indexPath = process.env.PAMPAX_STORAGE_PATH || '.pampax';
      
      // Count indexed files
      const { stdout: fileCount } = await execAsync(
        `find ${indexPath} -name "*.idx" | wc -l`
      );
      this.indexedFiles.set(parseInt(fileCount.trim()));
      
      // Calculate index size
      const { stdout: indexSize } = await execAsync(
        `du -sb ${indexPath}/*.idx 2>/dev/null | awk '{sum += $1} END {print sum || 0}'`
      );
      this.indexSizeBytes.set(parseInt(indexSize.trim()));
      
    } catch (error) {
      console.error('Error updating index metrics:', error);
    }
  }

  // Update all system metrics
  async updateAll() {
    await Promise.all([
      this.updateDiskMetrics(),
      this.updateDatabaseMetrics(),
      this.updateIndexMetrics()
    ]);
  }
}

export default SystemMetrics;
```

## Alerting Configuration

### Prometheus Alert Rules

```yaml
# prometheus-alerts.yml - Comprehensive alert rules
groups:
  - name: pampax.rules
    rules:
      # Service availability alerts
      - alert: PampaxServiceDown
        expr: up{job="pampax"} == 0
        for: 1m
        labels:
          severity: critical
          service: pampax
          component: api
        annotations:
          summary: "PAMPAX service is down"
          description: "PAMPAX service {{ $labels.instance }} has been down for more than 1 minute"
          runbook_url: "https://runbooks.company.com/pampax/service-down"

      - alert: PampaxHighErrorRate
        expr: |
          (
            sum(rate(pampax_http_requests_total{status=~"5.."}[5m])) /
            sum(rate(pampax_http_requests_total[5m]))
          ) > 0.05
        for: 2m
        labels:
          severity: high
          service: pampax
          component: api
        annotations:
          summary: "High error rate detected"
          description: "Error rate is {{ $value | humanizePercentage }} for {{ $labels.instance }}"
          runbook_url: "https://runbooks.company.com/pampax/high-error-rate"

      # Performance alerts
      - alert: PampaxHighResponseTime
        expr: |
          histogram_quantile(0.95, 
            sum(rate(pampax_request_duration_seconds_bucket[5m])) by (le, instance)
          ) > 2
        for: 5m
        labels:
          severity: medium
          service: pampax
          component: api
        annotations:
          summary: "High response time detected"
          description: "95th percentile response time is {{ $value }}s for {{ $labels.instance }}"
          runbook_url: "https://runbooks.company.com/pampax/high-response-time"

      - alert: PampaxSlowSearchQueries
        expr: |
          histogram_quantile(0.95, 
            sum(rate(pampax_search_duration_seconds_bucket[5m])) by (le, instance)
          ) > 5
        for: 5m
        labels:
          severity: medium
          service: pampax
          component: search
        annotations:
          summary: "Slow search queries detected"
          description: "95th percentile search time is {{ $value }}s for {{ $labels.instance }}"
          runbook_url: "https://runbooks.company.com/pampax/slow-search"

      # Cache alerts
      - alert: PampaxLowCacheHitRate
        expr: |
          (
            sum(rate(pampax_cache_hits_total[5m])) /
            (sum(rate(pampax_cache_hits_total[5m])) + sum(rate(pampax_cache_misses_total[5m])))
          ) < 0.5
        for: 10m
        labels:
          severity: medium
          service: pampax
          component: cache
        annotations:
          summary: "Low cache hit rate"
          description: "Cache hit rate is {{ $value | humanizePercentage }} for {{ $labels.instance }}"
          runbook_url: "https://runbooks.company.com/pampax/low-cache-hit-rate"

      # Resource alerts
      - alert: PampaxHighMemoryUsage
        expr: pampax_memory_usage_bytes / (1024*1024*1024) > 4
        for: 5m
        labels:
          severity: high
          service: pampax
          component: system
        annotations:
          summary: "High memory usage"
          description: "Memory usage is {{ $value }}GB for {{ $labels.instance }}"
          runbook_url: "https://runbooks.company.com/pampax/high-memory"

      - alert: PampaxHighCpuUsage
        expr: pampax_cpu_usage_percent > 80
        for: 5m
        labels:
          severity: medium
          service: pampax
          component: system
        annotations:
          summary: "High CPU usage"
          description: "CPU usage is {{ $value }}% for {{ $labels.instance }}"
          runbook_url: "https://runbooks.company.com/pampax/high-cpu"

      # Database alerts
      - alert: PampaxDatabaseGrowth
        expr: |
          (
            pampax_database_size_bytes - 
            pampax_database_size_bytes offset 1h
          ) / pampax_database_size_bytes > 0.1
        for: 15m
        labels:
          severity: medium
          service: pampax
          component: database
        annotations:
          summary: "Rapid database growth"
          description: "Database size increased by {{ $value | humanizePercentage }} in the last hour"
          runbook_url: "https://runbooks.company.com/pampax/database-growth"

      - alert: PampaxSlowDatabaseQueries
        expr: |
          histogram_quantile(0.95, 
            sum(rate(pampax_db_query_duration_seconds_bucket[5m])) by (le, instance)
          ) > 1
        for: 5m
        labels:
          severity: medium
          service: pampax
          component: database
        annotations:
          summary: "Slow database queries"
          description: "95th percentile DB query time is {{ $value }}s for {{ $labels.instance }}"
          runbook_url: "https://runbooks.company.com/pampax/slow-db-queries"

      # Storage alerts
      - alert: PampaxDiskSpaceLow
        expr: |
          (
            pampax_disk_available_bytes{mountpoint="/var/lib/pampax"} /
            pampax_disk_usage_bytes{mountpoint="/var/lib/pampax"}
          ) < 0.1
        for: 5m
        labels:
          severity: high
          service: pampax
          component: storage
        annotations:
          summary: "Low disk space"
          description: "Only {{ $value | humanizePercentage }} disk space available on /var/lib/pampax"
          runbook_url: "https://runbooks.company.com/pampax/low-disk-space"

      # Business metrics alerts
      - alert: PampaxLowSearchVolume
        expr: |
          sum(rate(pampax_search_queries_total[1h])) < 10
        for: 30m
        labels:
          severity: low
          service: pampax
          component: business
        annotations:
          summary: "Low search volume"
          description: "Search volume is {{ $value }} queries/hour, which is unusually low"
          runbook_url: "https://runbooks.company.com/pampax/low-search-volume"

      - alert: PampaxZeroSearchResults
        expr: |
          (
            sum(rate(pampax_search_queries_total{result_count="0"}[5m])) /
            sum(rate(pampax_search_queries_total[5m]))
          ) > 0.2
        for: 10m
        labels:
          severity: medium
          service: pampax
          component: search
        annotations:
          summary: "High zero-result rate"
          description: "{{ $value | humanizePercentage }} of searches return zero results"
          runbook_url: "https://runbooks.company.com/pampax/zero-results"
```

### AlertManager Configuration

```yaml
# alertmanager.yml - AlertManager configuration
global:
  smtp_smarthost: 'localhost:587'
  smtp_from: 'alerts@company.com'
  slack_api_url: 'https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK'

route:
  group_by: ['alertname', 'cluster', 'service']
  group_wait: 10s
  group_interval: 10s
  repeat_interval: 1h
  receiver: 'default'
  routes:
  - match:
      severity: critical
    receiver: 'critical-alerts'
    group_wait: 0s
    repeat_interval: 5m
  - match:
      severity: high
    receiver: 'high-alerts'
    repeat_interval: 15m
  - match:
      severity: medium
    receiver: 'medium-alerts'
    repeat_interval: 30m
  - match:
      severity: low
    receiver: 'low-alerts'
    repeat_interval: 2h

receivers:
- name: 'default'
  slack_configs:
  - channel: '#pampax-alerts'
    title: 'PAMPAX Alert: {{ .GroupLabels.alertname }}'
    text: |
      {{ range .Alerts }}
      *Alert:* {{ .Annotations.summary }}
      *Description:* {{ .Annotations.description }}
      *Severity:* {{ .Labels.severity }}
      *Instance:* {{ .Labels.instance }}
      *Runbook:* {{ .Annotations.runbook_url }}
      {{ end }}

- name: 'critical-alerts'
  slack_configs:
  - channel: '#pampax-critical'
    title: '🚨 CRITICAL: {{ .GroupLabels.alertname }}'
    color: 'danger'
    text: |
      {{ range .Alerts }}
      *CRITICAL ALERT*
      *Summary:* {{ .Annotations.summary }}
      *Description:* {{ .Annotations.description }}
      *Instance:* {{ .Labels.instance }}
      *Time:* {{ .StartsAt }}
      *Runbook:* {{ .Annotations.runbook_url }}
      {{ end }}
  email_configs:
  - to: 'oncall@company.com'
    subject: 'CRITICAL: PAMPAX {{ .GroupLabels.alertname }}'
    body: |
      {{ range .Alerts }}
      Critical Alert: {{ .Annotations.summary }}
      
      Description: {{ .Annotations.description }}
      Instance: {{ .Labels.instance }}
      Severity: {{ .Labels.severity }}
      Time: {{ .StartsAt }}
      
      Runbook: {{ .Annotations.runbook_url }}
      {{ end }}
  webhook_configs:
  - url: 'https://api.pagerduty.com/integrations/enqueue/YOUR_INTEGRATION_KEY'
    send_resolved: true

- name: 'high-alerts'
  slack_configs:
  - channel: '#pampax-alerts'
    title: '⚠️ HIGH: {{ .GroupLabels.alertname }}'
    color: 'warning'
    text: |
      {{ range .Alerts }}
      *HIGH SEVERITY ALERT*
      *Summary:* {{ .Annotations.summary }}
      *Description:* {{ .Annotations.description }}
      *Instance:* {{ .Labels.instance }}
      *Runbook:* {{ .Annotations.runbook_url }}
      {{ end }}

- name: 'medium-alerts'
  slack_configs:
  - channel: '#pampax-alerts'
    title: '📋 MEDIUM: {{ .GroupLabels.alertname }}'
    color: 'good'
    text: |
      {{ range .Alerts }}
      *Medium Alert:* {{ .Annotations.summary }}
      *Description:* {{ .Annotations.description }}
      *Instance:* {{ .Labels.instance }}
      {{ end }}

- name: 'low-alerts'
  slack_configs:
  - channel: '#pampax-logs'
    title: 'ℹ️ LOW: {{ .GroupLabels.alertname }}'
    color: '#36a64f'
    text: |
      {{ range .Alerts }}
      *Low Priority:* {{ .Annotations.summary }}
      *Description:* {{ .Annotations.description }}
      {{ end }}

inhibit_rules:
- source_match:
    severity: 'critical'
  target_match:
    severity: 'warning'
  equal: ['alertname', 'cluster', 'service']
```

## Log Monitoring

### Structured Log Analysis

#### Log Aggregation with Loki

```yaml
# loki-config.yml - Loki configuration
auth_enabled: false

server:
  http_listen_port: 3100

ingester:
  lifecycler:
    address: 127.0.0.1
    ring:
      kvstore:
        store: inmemory
      replication_factor: 1
    final_sleep: 0s
  chunk_idle_period: 1h
  max_chunk_age: 1h
  chunk_target_size: 1048576
  chunk_retain_period: 30s

schema_config:
  configs:
    - from: 2020-10-24
      store: boltdb-shipper
      object_store: filesystem
      schema: v11
      index:
        prefix: index_
        period: 24h

storage_config:
  boltdb_shipper:
    active_index_directory: /loki/boltdb-shipper-active
    cache_location: /loki/boltdb-shipper-cache
    shared_store: filesystem
  filesystem:
    directory: /loki/chunks

limits_config:
  enforce_metric_name: false
  reject_old_samples: true
  reject_old_samples_max_age: 168h

chunk_store_config:
  max_look_back_period: 0s

table_manager:
  retention_deletes_enabled: false
  retention_period: 0s
```

#### LogQL Queries for Monitoring

```bash
# Error rate monitoring
sum(rate({app="pampax", level="ERROR"}[5m])) by (instance)

# Top error messages
topk(10, sum by (msg) ({app="pampax", level="ERROR"}[1h]))

# Response time analysis
histogram_quantile(0.95, 
  sum(rate({app="pampax"} | unwrap duration_ms [5m])) by (le, instance)
)

# Cache performance
sum(rate({app="pampax", component="cache"}[5m])) by (cache_hit)

# Database query analysis
histogram_quantile(0.95,
  sum(rate({app="pampax", component="database"} | unwrap query_duration_ms [5m])) by (le, operation)
)

# Search query patterns
topk(20, count by (query_type) ({app="pampax", component="search"}[1h]))

# Memory usage trends
avg_over_time({app="pampax", component="system"} | unwrap memory_usage_mb [1h])

# Error correlation with performance
sum(rate({app="pampax", level="ERROR"}[5m])) / 
sum(rate({app="pampax"}[5m]))
```

### Log-Based Alerting

```yaml
# loki-alerting.yml - Log-based alerting rules
groups:
  - name: pampax-logs
    rules:
      - alert: PampaxHighErrorRate
        expr: |
          sum(rate({app="pampax", level="ERROR"}[5m])) > 0.1
        for: 2m
        labels:
          severity: high
          service: pampax
        annotations:
          summary: "High error rate in logs"
          description: "Error rate is {{ $value }} errors/sec"

      - alert: PampaxDatabaseErrors
        expr: |
          sum(rate({app="pampax", component="database", level="ERROR"}[5m])) > 0.05
        for: 1m
        labels:
          severity: high
          service: pampax
        annotations:
          summary: "Database errors detected"
          description: "Database error rate is {{ $value }} errors/sec"

      - alert: PampaxSlowQueries
        expr: |
          histogram_quantile(0.95,
            sum(rate({app="pampax", component="search"} | unwrap duration_ms [5m])) by (le)
          ) > 2000
        for: 5m
        labels:
          severity: medium
          service: pampax
        annotations:
          summary: "Slow queries detected"
          description: "95th percentile query time is {{ $value }}ms"

      - alert: PampaxMemoryLeak
        expr: |
          avg_over_time({app="pampax", component="system"} | unwrap memory_usage_mb [1h]) - 
          avg_over_time({app="pampax", component="system"} | unwrap memory_usage_mb [1h] offset 1h) > 100
        for: 30m
        labels:
          severity: medium
          service: pampax
        annotations:
          summary: "Potential memory leak detected"
          description: "Memory usage increased by {{ $value }}MB in the last hour"
```

## Dashboard Configuration

### Grafana Dashboard JSON

```json
{
  "dashboard": {
    "id": null,
    "title": "PAMPAX Production Dashboard",
    "tags": ["pampax", "production"],
    "timezone": "browser",
    "panels": [
      {
        "id": 1,
        "title": "Request Rate",
        "type": "graph",
        "targets": [
          {
            "expr": "sum(rate(pampax_http_requests_total[5m])) by (status)",
            "legendFormat": "{{status}}",
            "refId": "A"
          }
        ],
        "yAxes": [
          {
            "label": "Requests/sec"
          }
        ],
        "gridPos": {
          "x": 0,
          "y": 0,
          "w": 12,
          "h": 8
        }
      },
      {
        "id": 2,
        "title": "Response Time",
        "type": "graph",
        "targets": [
          {
            "expr": "histogram_quantile(0.50, sum(rate(pampax_request_duration_seconds_bucket[5m])) by (le))",
            "legendFormat": "50th percentile",
            "refId": "A"
          },
          {
            "expr": "histogram_quantile(0.95, sum(rate(pampax_request_duration_seconds_bucket[5m])) by (le))",
            "legendFormat": "95th percentile",
            "refId": "B"
          },
          {
            "expr": "histogram_quantile(0.99, sum(rate(pampax_request_duration_seconds_bucket[5m])) by (le))",
            "legendFormat": "99th percentile",
            "refId": "C"
          }
        ],
        "yAxes": [
          {
            "label": "Seconds"
          }
        ],
        "gridPos": {
          "x": 12,
          "y": 0,
          "w": 12,
          "h": 8
        }
      },
      {
        "id": 3,
        "title": "Error Rate",
        "type": "singlestat",
        "targets": [
          {
            "expr": "sum(rate(pampax_http_requests_total{status=~\"5..\"}[5m])) / sum(rate(pampax_http_requests_total[5m])) * 100",
            "legendFormat": "Error Rate %",
            "refId": "A"
          }
        ],
        "valueMaps": [
          {
            "value": "null",
            "text": "N/A"
          }
        ],
        "thresholds": [
          {
            "color": "green",
            "value": null
          },
          {
            "color": "yellow",
            "value": 1
          },
          {
            "color": "red",
            "value": 5
          }
        ],
        "gridPos": {
          "x": 0,
          "y": 8,
          "w": 6,
          "h": 8
        }
      },
      {
        "id": 4,
        "title": "Cache Hit Rate",
        "type": "singlestat",
        "targets": [
          {
            "expr": "sum(rate(pampax_cache_hits_total[5m])) / (sum(rate(pampax_cache_hits_total[5m])) + sum(rate(pampax_cache_misses_total[5m]))) * 100",
            "legendFormat": "Hit Rate %",
            "refId": "A"
          }
        ],
        "thresholds": [
          {
            "color": "red",
            "value": null
          },
          {
            "color": "yellow",
            "value": 50
          },
          {
            "color": "green",
            "value": 80
          }
        ],
        "gridPos": {
          "x": 6,
          "y": 8,
          "w": 6,
          "h": 8
        }
      },
      {
        "id": 5,
        "title": "Memory Usage",
        "type": "graph",
        "targets": [
          {
            "expr": "pampax_memory_usage_bytes / 1024 / 1024",
            "legendFormat": "Memory (MB)",
            "refId": "A"
          }
        ],
        "yAxes": [
          {
            "label": "MB"
          }
        ],
        "gridPos": {
          "x": 12,
          "y": 8,
          "w": 12,
          "h": 8
        }
      },
      {
        "id": 6,
        "title": "Search Performance",
        "type": "graph",
        "targets": [
          {
            "expr": "histogram_quantile(0.95, sum(rate(pampax_search_duration_seconds_bucket[5m])) by (le, query_type))",
            "legendFormat": "{{query_type}} - 95th percentile",
            "refId": "A"
          }
        ],
        "yAxes": [
          {
            "label": "Seconds"
          }
        ],
        "gridPos": {
          "x": 0,
          "y": 16,
          "w": 12,
          "h": 8
        }
      },
      {
        "id": 7,
        "title": "Database Performance",
        "type": "graph",
        "targets": [
          {
            "expr": "histogram_quantile(0.95, sum(rate(pampax_db_query_duration_seconds_bucket[5m])) by (le, operation))",
            "legendFormat": "{{operation}} - 95th percentile",
            "refId": "A"
          }
        ],
        "yAxes": [
          {
            "label": "Seconds"
          }
        ],
        "gridPos": {
          "x": 12,
          "y": 16,
          "w": 12,
          "h": 8
        }
      },
      {
        "id": 8,
        "title": "Database Size",
        "type": "graph",
        "targets": [
          {
            "expr": "pampax_database_size_bytes / 1024 / 1024",
            "legendFormat": "Database Size (MB)",
            "refId": "A"
          }
        ],
        "yAxes": [
          {
            "label": "MB"
          }
        ],
        "gridPos": {
          "x": 0,
          "y": 24,
          "w": 12,
          "h": 8
        }
      },
      {
        "id": 9,
        "title": "Indexed Files",
        "type": "singlestat",
        "targets": [
          {
            "expr": "pampax_indexed_files_total",
            "legendFormat": "Indexed Files",
            "refId": "A"
          }
        ],
        "gridPos": {
          "x": 12,
          "y": 24,
          "w": 6,
          "h": 8
        }
      },
      {
        "id": 10,
        "title": "Disk Usage",
        "type": "graph",
        "targets": [
          {
            "expr": "pampax_disk_usage_bytes{mountpoint=\"/var/lib/pampax\"} / 1024 / 1024 / 1024",
            "legendFormat": "Used (GB)",
            "refId": "A"
          },
          {
            "expr": "pampax_disk_available_bytes{mountpoint=\"/var/lib/pampax\"} / 1024 / 1024 / 1024",
            "legendFormat": "Available (GB)",
            "refId": "B"
          }
        ],
        "yAxes": [
          {
            "label": "GB"
          }
        ],
        "gridPos": {
          "x": 18,
          "y": 24,
          "w": 6,
          "h": 8
        }
      }
    ],
    "time": {
      "from": "now-1h",
      "to": "now"
    },
    "refresh": "30s"
  }
}
```

## Performance Monitoring

### Custom Performance Metrics

```javascript
// src/metrics/performance-metrics.js - Performance-specific metrics
import { performance } from 'perf_hooks';

class PerformanceMetrics {
  constructor(metricsCollector) {
    this.collector = metricsCollector;
    this.initializeMetrics();
    this.measurements = new Map();
  }

  initializeMetrics() {
    // Search performance by query type
    this.searchLatency = this.collector.createHistogram({
      name: 'pampax_search_latency_ms',
      help: 'Search latency in milliseconds',
      labelNames: ['query_type', 'cache_hit'],
      buckets: [10, 50, 100, 250, 500, 1000, 2000, 5000]
    });

    // Indexing performance
    this.indexingLatency = this.collector.createHistogram({
      name: 'pampax_indexing_latency_ms',
      help: 'Indexing latency in milliseconds',
      labelNames: ['file_type', 'file_size_bucket'],
      buckets: [100, 500, 1000, 2000, 5000, 10000, 30000]
    });

    // Token processing performance
    this.tokenProcessingRate = this.collector.createHistogram({
      name: 'pampax_token_processing_rate',
      help: 'Token processing rate in tokens/second',
      labelNames: ['operation'],
      buckets: [100, 500, 1000, 5000, 10000, 50000]
    });

    // Memory allocation patterns
    this.memoryAllocation = this.collector.createHistogram({
      name: 'pampax_memory_allocation_bytes',
      help: 'Memory allocation size in bytes',
      labelNames: ['operation'],
      buckets: [1024, 4096, 16384, 65536, 262144, 1048576, 4194304]
    });
  }

  startMeasurement(operation, labels = {}) {
    const id = `${operation}_${Date.now()}_${Math.random()}`;
    this.measurements.set(id, {
      operation,
      labels,
      startTime: performance.now(),
      startMemory: process.memoryUsage()
    });
    return id;
  }

  endMeasurement(id, additionalLabels = {}) {
    const measurement = this.measurements.get(id);
    if (!measurement) return;

    const endTime = performance.now();
    const endMemory = process.memoryUsage();
    const duration = endTime - measurement.startTime;
    const memoryDelta = endMemory.rss - measurement.startMemory.rss;

    const allLabels = { ...measurement.labels, ...additionalLabels };

    // Record appropriate metric based on operation
    switch (measurement.operation) {
      case 'search':
        this.searchLatency.observe(allLabels, duration);
        break;
      case 'indexing':
        this.indexingLatency.observe(allLabels, duration);
        break;
      case 'token_processing':
        this.tokenProcessingRate.observe(allLabels, 1000 / duration); // Rate
        break;
    }

    // Record memory allocation
    this.memoryAllocation.observe(
      { operation: measurement.operation },
      Math.max(0, memoryDelta)
    );

    this.measurements.delete(id);
    return { duration, memoryDelta };
  }

  // Convenience method for async functions
  async measureAsync(operation, fn, labels = {}) {
    const id = this.startMeasurement(operation, labels);
    try {
      const result = await fn();
      this.endMeasurement(id, { success: 'true' });
      return result;
    } catch (error) {
      this.endMeasurement(id, { success: 'false', error: error.name });
      throw error;
    }
  }
}

export default PerformanceMetrics;
```

### Synthetic Monitoring

```javascript
// src/monitoring/synthetic-monitor.js - Synthetic monitoring
import axios from 'axios';

class SyntheticMonitor {
  constructor(config) {
    this.config = config;
    this.metrics = new PerformanceMetrics();
  }

  async runHealthChecks() {
    const results = {
      timestamp: new Date().toISOString(),
      checks: {}
    };

    // Basic health check
    results.checks.health = await this.measureEndpoint(
      'GET',
      `${this.config.baseUrl}/health`,
      'health_check'
    );

    // Search functionality check
    results.checks.search = await this.measureSearch(
      'test query',
      'search_functionality'
    );

    // Database connectivity check
    results.checks.database = await this.measureDatabase(
      'database_connectivity'
    );

    // Cache performance check
    results.checks.cache = await this.measureCache(
      'cache_performance'
    );

    return results;
  }

  async measureEndpoint(method, url, checkName) {
    const id = this.metrics.startMeasurement('synthetic_check', {
      check_name: checkName,
      endpoint: url
    });

    try {
      const startTime = Date.now();
      const response = await axios({
        method,
        url,
        timeout: 5000
      });
      const endTime = Date.now();

      this.metrics.endMeasurement(id, {
        status_code: response.status.toString(),
        success: 'true'
      });

      return {
        success: true,
        responseTime: endTime - startTime,
        statusCode: response.status,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      this.metrics.endMeasurement(id, {
        success: 'false',
        error: error.code || 'unknown'
      });

      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  async measureSearch(query, checkName) {
    const id = this.metrics.startMeasurement('synthetic_search', {
      check_name: checkName,
      query_type: 'synthetic'
    });

    try {
      const startTime = Date.now();
      const response = await axios.post(
        `${this.config.baseUrl}/api/search`,
        { query, limit: 10 },
        { timeout: 10000 }
      );
      const endTime = Date.now();

      this.metrics.endMeasurement(id, {
        success: 'true',
        result_count: response.data.results?.length?.toString() || '0'
      });

      return {
        success: true,
        responseTime: endTime - startTime,
        resultCount: response.data.results?.length || 0,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      this.metrics.endMeasurement(id, {
        success: 'false',
        error: error.code || 'unknown'
      });

      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  async measureDatabase(checkName) {
    const id = this.metrics.startMeasurement('synthetic_database', {
      check_name: checkName
    });

    try {
      const startTime = Date.now();
      
      // Simple database connectivity test
      const response = await axios.get(
        `${this.config.baseUrl}/api/health/database`,
        { timeout: 5000 }
      );
      
      const endTime = Date.now();

      this.metrics.endMeasurement(id, {
        success: 'true'
      });

      return {
        success: true,
        responseTime: endTime - startTime,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      this.metrics.endMeasurement(id, {
        success: 'false',
        error: error.code || 'unknown'
      });

      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  async measureCache(checkName) {
    const id = this.metrics.startMeasurement('synthetic_cache', {
      check_name: checkName
    });

    try {
      const startTime = Date.now();
      
      // Cache performance test
      const response = await axios.get(
        `${this.config.baseUrl}/api/cache/stats`,
        { timeout: 5000 }
      );
      
      const endTime = Date.now();

      this.metrics.endMeasurement(id, {
        success: 'true',
        hit_rate: response.data.hitRate?.toString() || '0'
      });

      return {
        success: true,
        responseTime: endTime - startTime,
        hitRate: response.data.hitRate || 0,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      this.metrics.endMeasurement(id, {
        success: 'false',
        error: error.code || 'unknown'
      });

      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }
}

export default SyntheticMonitor;
```

This comprehensive monitoring guide provides all the necessary components for effective production monitoring of PAMPAX, including metrics collection, alerting, log analysis, and performance monitoring.