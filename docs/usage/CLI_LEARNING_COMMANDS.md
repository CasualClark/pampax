# PAMPAX Learning System CLI Commands

The PAMPAX learning system provides CLI commands for analyzing interaction data, optimizing retrieval policies, and generating performance reports. These commands are part of Phase 6: Outcome-Driven Retrieval Tuning.

## Overview

The learning system analyzes historical search interactions to:
- Extract satisfaction signals from user behavior
- Optimize seed mix weights for different intents
- Generate performance reports and insights
- Update signature cache for faster retrieval

## Commands

### `pampax learn`

Main learning command that analyzes interactions and optionally applies weight optimizations.

#### Syntax
```bash
pampax learn [options]
```

#### Options

| Option | Description | Default |
|--------|-------------|---------|
| `--repo <path>` | Repository path to analyze | `.` |
| `--db <path>` | Database file path | `.pampax/pampax.sqlite` |
| `--from-sessions <period>` | Analyze interactions from last N days | `30d` |
| `--update-weights` | Apply weight optimizations based on learning data | `false` |
| `--write <path>` | Write output to file (for reports or policy updates) | - |
| `--output <path>` | Alias for `--write` | - |
| `--dry-run` | Preview changes without applying them | `false` |
| `--report` | Generate performance report | `false` |
| `--format <format>` | Output format for reports (`json`, `md`, `csv`) | `json` |
| `--interactive` | Interactive confirmation for weight updates | `false` |
| `--json` | Output in JSON format | `false` |
| `--verbose` | Verbose output | `false` |

#### Time Period Format

The `--from-sessions` option accepts these formats:
- `Xd` - X days (e.g., `30d`, `7d`)
- `Xh` - X hours (e.g., `24h`, `48h`) 
- `Xw` - X weeks (e.g., `2w`, `1w`)

#### Examples

**Basic learning with weight updates:**
```bash
pampax learn --from-sessions 30d --update-weights --write out/policy.json
```

**Dry run to preview changes:**
```bash
pampax learn --from-sessions 7d --dry-run --format md
```

**Generate performance report only:**
```bash
pampax learn --report --from-sessions 30d --format json --output report.json
```

**Interactive learning with confirmation:**
```bash
pampax learn --from-sessions 14d --update-weights --interactive
```

**Verbose learning with custom time period:**
```bash
pampax learn --from-sessions 3d --update-weights --verbose --dry-run
```

### `pampax learn-report`

Generate comprehensive learning system performance reports.

#### Syntax
```bash
pampax learn-report [options]
```

#### Options

| Option | Description | Default |
|--------|-------------|---------|
| `--repo <path>` | Repository path to analyze | `.` |
| `--db <path>` | Database file path | `.pampax/pampax.sqlite` |
| `--from-sessions <period>` | Analyze interactions from last N days | `30d` |
| `--output <path>` | Write report to file | - |
| `--write <path>` | Alias for `--output` | - |
| `--format <format>` | Output format (`json`, `md`, `csv`) | `json` |
| `--details` | Include detailed signal data in report | `false` |
| `--json` | Output in JSON format | `false` |
| `--verbose` | Verbose output | `false` |

#### Examples

**Generate markdown report for last 30 days:**
```bash
pampax learn-report --from-sessions 30d --format md --output report.md
```

**Generate detailed JSON report:**
```bash
pampax learn-report --details --format json --output detailed-report.json
```

**Generate CSV for data analysis:**
```bash
pampax learn-report --format csv --output learning-data.csv
```

**Quick summary report:**
```bash
pampax learn-report --from-sessions 7d
```

## Output Formats

### JSON Format
Structured data suitable for programmatic processing:
```json
{
  "timestamp": "2025-01-23T10:30:00.000Z",
  "summary": {
    "totalInteractions": 150,
    "satisfactionRate": 0.85,
    "averageTimeToFix": 45000,
    "averageTokenUsage": 1200
  },
  "metrics": {
    "byIntent": { ... },
    "byBundleSignature": { ... }
  }
}
```

### Markdown Format
Human-readable report with tables and recommendations:
```markdown
# Learning System Report

## Executive Summary
| Metric | Value |
|--------|-------|
| Total Interactions | 150 |
| Satisfaction Rate | 85.0% |
| Average Time to Fix | 45s |

## Performance by Intent
| Intent | Total | Satisfied | Rate |
|--------|-------|-----------|------|
| search | 80 | 70 | 87.5% |
```

### CSV Format
Tabular data for spreadsheet analysis:
```csv
timestamp,period,intent,total_interactions,satisfied_interactions,satisfaction_rate
2025-01-23T10:30:00.000Z,30d,ALL,150,128,0.85
2025-01-23T10:30:00.000Z,30d,search,80,70,0.875
```

## Learning Process

### 1. Interaction Analysis
The system analyzes historical search interactions from the specified time period:
- Extracts query patterns and intent classifications
- Identifies satisfied vs unsatisfied interactions
- Measures time-to-fix and token usage metrics
- Groups interactions by intent and bundle signatures

### 2. Satisfaction Metrics
Computes comprehensive satisfaction metrics:
- Overall satisfaction rate across all interactions
- Intent-specific satisfaction rates
- Bundle signature performance patterns
- Average time to fix and token usage

### 3. Weight Optimization (Optional)
When `--update-weights` is specified:
- Uses gradient descent optimization on satisfaction signals
- Adjusts seed mix weights for each intent type
- Respects weight bounds and convergence criteria
- Provides rollback capability for safety

### 4. Cache Updates
Updates the signature cache with high-performing patterns:
- Caches satisfied bundle signatures for fast retrieval
- Implements LRU eviction and TTL management
- Tracks cache hit rates and performance

## Integration with Existing Workflow

### Prerequisites
1. **Indexed Project**: Run `pampax index` first to create searchable data
2. **Interaction Data**: Have search interactions to analyze (from `pampax search` usage)
3. **Database**: SQLite database with interaction records

### Typical Workflow

1. **Regular Usage**: Users perform searches with `pampax search`
2. **Data Collection**: Interactions are automatically stored for learning
3. **Periodic Analysis**: Run learning commands to analyze performance
4. **Optimization**: Apply weight updates to improve future searches
5. **Monitoring**: Generate reports to track system performance

### Automation Example

```bash
#!/bin/bash
# Weekly learning automation

# Generate performance report
pampax learn-report --from-sessions 7d --format md --output "reports/weekly-$(date +%Y%m%d).md"

# Optimize weights if satisfaction is below threshold
SATISFACTION=$(pampax learn --from-sessions 7d --json | jq -r '.signals.satisfactionRate')

if (( $(echo "$SATISFACTION < 0.8" | bc -l) )); then
    echo "Satisfaction rate $SATISFACTION below threshold, optimizing weights..."
    pampax learn --from-sessions 7d --update-weights --interactive
fi
```

## Error Handling

The CLI commands handle various error conditions gracefully:

- **No indexed data**: Prompts to run `pampax index` first
- **No interaction data**: Suggests increasing time period or generating more searches
- **Invalid time period**: Provides clear format examples
- **Database errors**: Reports specific database issues
- **Permission errors**: Indicates file access problems

## Performance Considerations

- **Large datasets**: Use appropriate time periods to avoid excessive processing
- **Memory usage**: Commands process data in batches to manage memory efficiently
- **Database performance**: Ensure SQLite database is properly indexed
- **Report size**: Use `--details` selectively for large datasets

## Troubleshooting

### Common Issues

**"No indexed data found"**
- Solution: Run `pampax index` first to create searchable data

**"No interactions found in time period"**
- Solution: Increase `--from-sessions` period or generate more search activity

**"Invalid time period format"**
- Solution: Use formats like `30d`, `7d`, `2w`, `48h`

**Command hangs during initialization**
- Solution: Check database file permissions and disk space

### Debug Mode

Use `--verbose` flag for detailed debugging information:
```bash
pampax learn --verbose --from-sessions 7d
```

### Log Analysis

Check interaction data directly:
```bash
sqlite3 .pampax/pampax.sqlite "SELECT COUNT(*) FROM interaction WHERE ts > $(date -d '7 days ago' +%s)"
```

## Future Enhancements

Planned improvements to the learning CLI:

1. **Real-time learning**: Continuous learning mode
2. **A/B testing**: Compare optimization strategies
3. **Custom metrics**: User-defined satisfaction metrics
4. **Integration alerts**: Automated notifications for performance issues
5. **Dashboard integration**: Web-based performance monitoring

## API Reference

For programmatic integration, the learning components can be used directly:

```javascript
import { OutcomeAnalyzer } from './learning/outcome-analyzer.js';
import { WeightOptimizer } from './learning/weight-optimizer.js';
import { SignatureCache } from './learning/signature-cache.js';

// Analyze interactions
const analyzer = new OutcomeAnalyzer(memoryOps);
const signals = await analyzer.analyzeInteractions(30);

// Optimize weights
const optimizer = new WeightOptimizer();
const result = await optimizer.optimizeWeights(signals, currentWeights);

// Update cache
const cache = new SignatureCache();
await cache.set(entry);
```