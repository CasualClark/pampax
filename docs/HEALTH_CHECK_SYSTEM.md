# PAMPAX Health Check System

## Overview

The PAMPAX Health Check System provides comprehensive monitoring and production readiness validation for the PAMPAX code indexing and search platform. It implements structured health checks with proper exit codes, metrics integration, and both JSON and human-readable output formats.

## Features

- **Component-Level Health Checks**: Individual health monitoring for database, cache, memory, and configuration systems
- **Structured Logging**: Full integration with PAMPAX structured logging system with correlation IDs
- **Metrics Collection**: Automatic emission of health check metrics for monitoring systems
- **Exit Code Taxonomy**: Standardized exit codes for programmatic health check integration
- **JSON & Text Output**: Both machine-parseable JSON and human-readable text formats
- **Timeout Protection**: Configurable timeouts to prevent hanging health checks
- **Custom Checkers**: Extensible architecture for adding custom health checks

## CLI Usage

### Basic Health Check

```bash
# Run all health checks with JSON output (default)
pampax health

# Run with human-readable output
pampax health --format text

# Check specific components only
pampax health --components database memory

# Verbose output with detailed information
pampax health --verbose

# Quiet mode (only show errors)
pampax health --quiet

# Custom timeout
pampax health --timeout 10000

# Disable exit codes (always return 0)
pampax health --no-exit-code
```

### CLI Options

| Option | Description | Default |
|--------|-------------|----------|
| `--components <components...>` | Specific components to check | All components |
| `--format <format>` | Output format (json\|text) | json |
| `--timeout <ms>` | Health check timeout in milliseconds | 30000 |
| `--verbose` | Show detailed health information | false |
| `--quiet` | Only show errors | false |
| `--exit-code` | Exit with appropriate code based on health status | true |
| `--no-exit-code` | Do not exit with health-based code (always 0) | false |

## Health Check Categories

### Database Health Check

Validates SQLite database connectivity, integrity, and index readiness.

```json
{
  "database": {
    "status": "ok|error",
    "connectivity": true,
    "integrity_check": "ok",
    "index_ready": true,
    "response_time_ms": 45,
    "file_count": 1250,
    "chunk_count": 8432,
    "error": null,
    "error_code": null
  }
}
```

**Checks performed:**
- Database file existence and accessibility
- SQLite connectivity test
- Database integrity check (`PRAGMA integrity_check`)
- Index readiness verification (data presence)
- Response time measurement

**Error codes:**
- `DATABASE_NOT_FOUND`: Database file doesn't exist
- `CONNECTION_FAILED`: Unable to connect to database
- `INTEGRITY_FAILED`: Database integrity check failed

### Cache Health Check

Monitors cache system status, hit rates, and configuration validity.

```json
{
  "cache": {
    "status": "ok|error",
    "hit_rate": 0.75,
    "size_mb": 234,
    "ttl_valid": true,
    "error": null
  }
}
```

**Checks performed:**
- Cache configuration validation
- TTL configuration verification
- Cache size monitoring
- Hit rate tracking (when available)

### Memory Health Check

Monitors memory usage, pressure, and potential leaks.

```json
{
  "memory": {
    "status": "ok|error",
    "used_mb": 445,
    "limit_mb": 1024,
    "leak_detected": false,
    "pressure_percent": 43,
    "rss_mb": 680,
    "external_mb": 45,
    "error": null
  }
}
```

**Checks performed:**
- Heap memory usage monitoring
- RSS (Resident Set Size) tracking
- Memory pressure calculation
- Leak detection (usage > 90% of limit)
- External memory monitoring

### Configuration Health Check

Validates PAMPAX configuration files and settings.

```json
{
  "config": {
    "status": "ok|error",
    "valid": true,
    "source": "pampax.toml",
    "config_type": "toml",
    "last_load_time": "2025-10-25T10:00:00Z",
    "validation_errors": [],
    "error": null
  }
}
```

**Checks performed:**
- Configuration file syntax validation
- Configuration schema validation
- Environment variable override detection
- Hot reload capability verification

## Exit Code Taxonomy

The health check system uses standardized exit codes for programmatic integration:

| Exit Code | Name | Description |
|-----------|-------|-------------|
| 0 | SUCCESS | All health checks passed |
| 2 | CONFIG | Configuration errors detected |
| 3 | IO | Database or file I/O errors |
| 4 | NETWORK | Network connectivity issues |
| 5 | TIMEOUT | Health check timeout |
| 6 | INTERNAL | Internal system errors |

## JSON Output Format

### Complete Health Check Result

```json
{
  "status": "healthy|degraded|unhealthy",
  "timestamp": "2025-10-25T10:00:00Z",
  "corr_id": "550e8400-29de-4f8a-8b2b-3a1b5c8e7c1f",
  "duration_ms": 125,
  "checks": {
    "database": { ... },
    "cache": { ... },
    "memory": { ... },
    "config": { ... }
  },
  "summary": {
    "total": 4,
    "passed": 3,
    "failed": 1,
    "warnings": 0
  }
}
```

### Status Levels

- **healthy**: All checks passed
- **degraded**: Some checks have warnings but no failures
- **unhealthy**: One or more checks failed

## Integration Examples

### Shell Script Integration

```bash
#!/bin/bash

# Run health check and handle different statuses
if pampax health --format json --quiet; then
    echo "✅ PAMPAX is healthy"
else
    case $? in
        2) echo "❌ Configuration error" ;;
        3) echo "❌ Database/I/O error" ;;
        4) echo "❌ Network error" ;;
        5) echo "❌ Timeout error" ;;
        6) echo "❌ Internal error" ;;
        *) echo "❌ Unknown error" ;;
    esac
    exit 1
fi
```

### Monitoring System Integration

```bash
# Health check with metrics collection
HEALTH_RESULT=$(pampax health --format json)
EXIT_CODE=$?

# Extract metrics for monitoring
MEMORY_USAGE=$(echo "$HEALTH_RESULT" | jq -r '.checks.memory.details.used_mb')
DB_RESPONSE_TIME=$(echo "$HEALTH_RESULT" | jq -r '.checks.database.details.response_time_ms')

# Send to monitoring system
curl -X POST "https://monitoring.example.com/metrics" \
  -H "Content-Type: application/json" \
  -d "{
    \"service\": \"pampax\",
    \"memory_usage_mb\": $MEMORY_USAGE,
    \"db_response_time_ms\": $DB_RESPONSE_TIME,
    \"health_status\": \"$([ $EXIT_CODE -eq 0 ] && echo \"healthy\" || echo \"unhealthy\")\"
  }"

exit $EXIT_CODE
```

### Docker Health Check

```dockerfile
# Dockerfile
FROM node:18-alpine

# ... application setup ...

# Add health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node src/cli.js health --components config memory --quiet || exit 1
```

```yaml
# docker-compose.yml
version: '3.8'
services:
  pampax:
    build: .
    healthcheck:
      test: ["CMD", "node", "src/cli.js", "health", "--components", "config", "memory", "--quiet"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
```

## Custom Health Checkers

The health check system supports adding custom component checkers:

```javascript
import { getHealthChecker } from './src/health/health-checker.js';

const healthChecker = getHealthChecker();

// Add custom checker
const customChecker = {
  name: 'external_api',
  check: async () => {
    const response = await fetch('https://api.example.com/health');
    const isHealthy = response.ok;
    
    return {
      status: isHealthy ? 'ok' : 'error',
      details: {
        response_time_ms: response.headers.get('x-response-time'),
        status_code: response.status,
        available: isHealthy
      },
      metrics: {
        api_status: response.status,
        response_time: response.headers.get('x-response-time')
      }
    };
  },
  getMetrics: async () => ({
    endpoint: 'https://api.example.com/health',
    timeout_ms: 5000
  })
};

healthChecker.addChecker('external_api', customChecker);

// Run health check including custom component
const results = await healthChecker.checkAll();
console.log(JSON.stringify(results, null, 2));
```

## Metrics Integration

The health check system automatically emits metrics for integration with monitoring systems:

### Health Check Metrics

- `health.overall.status`: Overall health status (1=healthy, 0.5=degraded, 0=unhealthy)
- `health.overall.check_duration_ms`: Total health check duration
- `health.{component}.status`: Individual component status (1=ok, 0=error)
- `health.{component}.check_duration_ms`: Individual component check duration
- `health.{component}.response_time_ms`: Component-specific response times

### Example Metrics Output

```json
{
  "metric": "health.database.status",
  "value": 1,
  "tags": { "component": "database", "status": "ok" },
  "timestamp": 1761375028864,
  "corr_id": "6151c533-3f53-40c9-9c5c-6ee679d8582e",
  "type": "gauge"
}
```

## Troubleshooting

### Common Issues

1. **Database Not Found**
   ```bash
   # Solution: Initialize the database
   pampax index
   ```

2. **Configuration Errors**
   ```bash
   # Validate configuration
   pampax config --validate
   
   # Show current configuration
   pampax config --show
   ```

3. **Memory Pressure**
   ```bash
   # Check memory limits in configuration
   pampax config --show | grep memory
   
   # Increase memory limit if needed
   export PAMPAX_PERFORMANCE_MEMORY_LIMIT_MB=2048
   ```

4. **Timeout Issues**
   ```bash
   # Increase timeout for slow systems
   pampax health --timeout 60000
   ```

### Debug Mode

Enable debug logging for detailed troubleshooting:

```bash
# Enable debug logging
export PAMPAX_LOGGING_LEVEL=debug

# Run health check with verbose output
pampax health --verbose --format text
```

## Production Deployment

### Kubernetes Health Check

```yaml
apiVersion: v1
kind: Pod
spec:
  containers:
  - name: pampax
    image: pampax:latest
    livenessProbe:
      exec:
        command:
        - node
        - src/cli.js
        - health
        - --components
        - config
        - memory
        - --quiet
      initialDelaySeconds: 30
      periodSeconds: 30
      timeoutSeconds: 10
    readinessProbe:
      exec:
        command:
        - node
        - src/cli.js
        - health
        - --components
        - database
        - --quiet
      initialDelaySeconds: 5
      periodSeconds: 10
      timeoutSeconds: 5
```

### Monitoring Integration

```javascript
// Custom monitoring integration
const { getHealthChecker } = require('./src/health/health-checker.js');

async function continuousHealthMonitoring() {
  const healthChecker = getHealthChecker();
  
  setInterval(async () => {
    const results = await healthChecker.checkAll();
    
    // Send to monitoring system
    await sendToMonitoring({
      service: 'pampax',
      status: results.status,
      timestamp: results.timestamp,
      metrics: results.checks,
      summary: results.summary
    });
  }, 60000); // Check every minute
}

continuousHealthMonitoring().catch(console.error);
```

## API Reference

### HealthChecker Class

#### Methods

- `checkAll(components?: string[]): Promise<HealthCheckResult>`
- `getExitCode(results: HealthCheckResult): number`
- `displayHumanReadable(results: HealthCheckResult): void`
- `addChecker(name: string, checker: ComponentChecker): void`
- `removeChecker(name: string): void`
- `getAvailableCheckers(): string[]`

#### ComponentChecker Interface

```typescript
interface ComponentChecker {
  name: string;
  check(): Promise<ComponentCheckResult>;
  getMetrics(): Promise<object>;
}
```

### HealthCheckResult Interface

```typescript
interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  corr_id: string;
  duration_ms: number;
  checks: Record<string, ComponentCheckResult>;
  summary: {
    total: number;
    passed: number;
    failed: number;
    warnings: number;
  };
}
```

## Contributing

When adding new health check components:

1. Implement the `ComponentChecker` interface
2. Add comprehensive error handling
3. Emit appropriate metrics
4. Write tests for the new checker
5. Update documentation

Example new component:

```javascript
class NewComponentChecker extends ComponentChecker {
  constructor(logger, metrics) {
    super('new_component', logger, metrics);
  }

  async check() {
    // Implementation
  }

  async getMetrics() {
    // Implementation
  }
}
```

This health check system provides a robust foundation for production monitoring and automated alerting in PAMPAX deployments.