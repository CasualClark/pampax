# Learning Module - Outcome-Driven Retrieval Tuning

This module provides tools for analyzing interaction outcomes and extracting learning signals to optimize retrieval policies based on user satisfaction and performance metrics.

## Overview

The learning module is part of Phase 6: Outcome-Driven Retrieval Tuning and enables the system to:

- Extract learning signals from historical interaction data
- Generate consistent bundle signatures for pattern caching
- Compute satisfaction metrics per intent, language, and repository
- Provide structured output for weight optimizer consumption
- Handle 30+ days of interaction data efficiently

## Components

### OutcomeAnalyzer

The main class for processing interaction data and extracting learning signals.

#### Key Methods

##### `analyzeInteractions(fromDays: number): Promise<OutcomeSignal[]>`

Extracts outcome signals from interactions within the specified timeframe.

**Parameters:**
- `fromDays`: Number of days to look back (default: 30)

**Returns:** Array of `OutcomeSignal` objects

**Example:**
```typescript
const analyzer = new OutcomeAnalyzer(memoryOps);
const signals = await analyzer.analyzeInteractions(30);
console.log(`Extracted ${signals.length} signals`);
```

##### `generateBundleSignature(bundle: BundleStructure): string`

Generates a consistent signature for a bundle to enable caching and pattern analysis.

**Parameters:**
- `bundle`: Bundle structure with sources, intent, and metadata

**Returns:** 16-character signature prefixed with `b_`

**Example:**
```typescript
const signature = analyzer.generateBundleSignature({
  sources: [
    { type: 'code', items: [{ path: 'src/main.ts', score: 0.9 }] }
  ],
  intent: { intent: 'symbol', confidence: 0.8, entities: [], suggestedPolicies: [] },
  total_tokens: 1250
});
```

##### `computeSatisfactionMetrics(signals: OutcomeSignal[]): Promise<SatisfactionMetrics>`

Computes detailed satisfaction metrics from extracted signals.

**Parameters:**
- `signals`: Array of outcome signals

**Returns:** `SatisfactionMetrics` object with detailed breakdowns

**Example:**
```typescript
const metrics = await analyzer.computeSatisfactionMetrics(signals);
console.log(`Overall satisfaction: ${(metrics.overallSatisfactionRate * 100).toFixed(1)}%`);
console.log(`Symbol intent satisfaction: ${(metrics.byIntent.symbol?.satisfactionRate * 100 || 0).toFixed(1)}%`);
```

## Data Structures

### OutcomeSignal

Represents a single extracted learning signal:

```typescript
interface OutcomeSignal {
  sessionId: string;
  query: string;
  intent: string;
  bundleSignature: string;
  satisfied: boolean;
  timeToFix?: number;
  topClickId?: string;
  tokenUsage: number;
  seedWeights: Record<string, number>;
  policyThresholds: Record<string, number>;
}
```

### SatisfactionMetrics

Comprehensive metrics computed from signals:

```typescript
interface SatisfactionMetrics {
  totalInteractions: number;
  satisfiedInteractions: number;
  unsatisfiedInteractions: number;
  overallSatisfactionRate: number;
  averageTimeToFix?: number;
  averageTokenUsage?: number;
  byIntent: Record<string, IntentMetrics>;
  byBundleSignature: Record<string, SignatureMetrics>;
}
```

## Usage Examples

### Basic Analysis

```typescript
import { OutcomeAnalyzer } from './learning/outcome-analyzer.js';
import { MemoryOperations } from './storage/memory-operations.js';

// Initialize analyzer
const analyzer = new OutcomeAnalyzer(memoryOps);

// Analyze last 30 days of interactions
const signals = await analyzer.analyzeInteractions(30);

// Compute metrics
const metrics = await analyzer.computeSatisfactionMetrics(signals);

// Use results for optimization
console.log(`Satisfaction rate: ${metrics.overallSatisfactionRate}`);
```

### Performance Monitoring

```typescript
// Track processing performance
const startTime = Date.now();
const signals = await analyzer.analyzeInteractions(30);
const processingTime = Date.now() - startTime;

if (processingTime > 60000) {
  console.warn('Processing exceeded 1 minute threshold');
}
```

### Pattern Analysis

```typescript
// Group by bundle signatures to identify patterns
const signatureCounts = {};
for (const signal of signals) {
  signatureCounts[signal.bundleSignature] = 
    (signatureCounts[signal.bundleSignature] || 0) + 1;
}

// Find most common patterns
const sortedPatterns = Object.entries(signatureCounts)
  .sort(([,a], [,b]) => b - a)
  .slice(0, 10);
```

## Integration with Policy System

The outcome analyzer integrates with the existing policy gate system to:

1. **Extract seed weights** from policy decisions for each interaction
2. **Record policy thresholds** used during retrieval
3. **Correlate satisfaction** with specific policy configurations
4. **Provide data** for weight optimization algorithms

## Performance Characteristics

- **Processing speed**: < 1 minute for 30+ days of data
- **Memory usage**: Efficient streaming processing
- **Scalability**: Tested with 3000+ interactions in < 30ms
- **Database load**: Optimized queries with proper indexing

## Error Handling

The analyzer includes robust error handling for:

- Malformed interaction data
- Missing or corrupted notes
- Database connection issues
- Invalid bundle structures

All errors are logged but don't stop processing of remaining interactions.

## Future Enhancements

Planned improvements include:

1. **Machine learning integration** for pattern recognition
2. **Real-time signal extraction** during interactions
3. **Advanced anomaly detection** for outlier patterns
4. **Cross-repository pattern analysis**
5. **Automated policy optimization** based on learned signals