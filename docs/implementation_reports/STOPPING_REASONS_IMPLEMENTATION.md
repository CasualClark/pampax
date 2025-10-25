# StoppingReasonEngine Implementation

## Overview

The `StoppingReasonEngine` is a comprehensive system for identifying and explaining why bundle assembly stopped. It provides detailed, human-readable explanations with specific numbers and actionable recommendations for various stopping conditions.

## Features

### 🎯 Core Capabilities

- **Multiple Condition Detection**: Handles token budget limits, result count limits, graph traversal limits, cache boundaries, and quality thresholds
- **Human-Readable Explanations**: Generates clear explanations with specific numbers and conditions
- **Integration Ready**: Seamlessly integrates with existing token budget and result limiting systems
- **Actionable Recommendations**: Provides specific steps to resolve each stopping condition
- **Comprehensive Analysis**: Offers session summaries and prioritized recommendations

### 🔍 Supported Stopping Conditions

1. **Token Budget Issues**
   - Budget exhaustion (used ≥ budget)
   - Budget warnings (approaching limits)
   - Specific token counts and percentages

2. **Result Limit Issues**
   - Limit exceeded (requested > allowed)
   - Detailed excess counts
   - Source-specific tracking

3. **Quality Threshold Issues**
   - Low score exclusions
   - Score vs threshold comparisons
   - Item-specific metadata

4. **Search Failures**
   - Connection errors
   - Timeout issues
   - Multiple failure tracking

5. **Cache Boundary Issues**
   - Size limits reached
   - Low hit rate detection
   - Performance metrics

6. **Graph Traversal Limits**
   - Node and edge limits
   - Traversal statistics
   - Resource constraints

7. **Timeout Conditions**
   - Operation timeouts
   - Duration vs limits
   - Performance analysis

8. **Content Degradation**
   - Degradation level tracking
   - Token reduction statistics
   - Policy-based explanations

## Usage

### Basic Usage

```javascript
import { StoppingReasonEngine } from './src/context/stopping-reasons.js';

const engine = new StoppingReasonEngine({
  enableDetailedLogging: true,
  cacheHitThreshold: 0.8,
  qualityScoreThreshold: 0.3,
  budgetWarningThreshold: 0.9
});

// Start session
engine.startSession({ query: 'search term', budget: 5000 });

// Record conditions
const budgetExplanation = engine.recordTokenBudget(5200, 5000, 'code-search');
const limitExplanation = engine.recordResultLimit(15, 10, 'memory-search');

// End session and get analysis
const analysis = engine.endSession();
```

### Integration with ContextAssembler

```javascript
import { integrateWithAssembler } from './src/context/stopping-reasons.js';
import { createContextAssembler } from './src/context/assembler.js';

const assembler = await createContextAssembler('./database.sqlite');
const engine = integrateWithAssembler(assembler, {
  enableDetailedLogging: true
});

// Enhanced assembly with stopping reasons
const result = await assembler.assembleWithExplanation(query, options);
console.log(result.explanation.stopping_reasons);
```

### Manual Condition Recording

```javascript
// Token budget condition
engine.recordTokenBudget(used, budget, source);

// Result limit condition  
engine.recordResultLimit(requested, allowed, source);

// Quality threshold condition
engine.recordQualityThreshold(score, threshold, item, source);

// Search failure condition
engine.recordSearchFailure(error, source, attempt);

// Cache boundary condition
engine.recordCacheBoundary(cacheSize, maxSize, hitRate, source);

// Graph traversal condition
engine.recordGraphTraversalLimit(nodesVisited, maxNodes, edgesTraversed, maxEdges, source);

// Timeout condition
engine.recordTimeout(duration, maxDuration, operation);

// Degradation condition
engine.recordDegradationTriggered(level, originalTokens, degradedTokens, reason);
```

## Output Format

### Explanation Structure

Each condition generates an explanation with:

```javascript
{
  title: "Human-readable title",
  explanation: "Detailed explanation with specific numbers",
  actionable: ["Action 1", "Action 2", "Action 3"],
  severity: "high|medium|low",
  category: "resource|quality|performance|error",
  source: "source-system"
}
```

### Analysis Structure

Comprehensive session analysis includes:

```javascript
{
  summary: {
    totalConditions: number,
    highSeverityCount: number,
    mediumSeverityCount: number,
    lowSeverityCount: number,
    duration: number,
    tokensUsed: number,
    itemsProcessed: number,
    cacheHitRate: number,
    searchSuccessRate: number
  },
  conditions: [/* explanation objects */],
  grouped: {
    high: [/* high severity explanations */],
    medium: [/* medium severity explanations */],
    low: [/* low severity explanations */]
  },
  recommendations: [
    {
      priority: "immediate|high|medium",
      title: "Recommendation title",
      description: "Detailed description",
      actions: ["Specific actions"]
    }
  ],
  metrics: {/* detailed session metrics */}
}
```

## Configuration Options

```javascript
const engine = new StoppingReasonEngine({
  enableDetailedLogging: false,    // Enable debug logging
  cacheHitThreshold: 0.8,         // Threshold for cache performance warnings
  qualityScoreThreshold: 0.3,      // Default quality threshold
  budgetWarningThreshold: 0.9       // When to warn about budget usage
});
```

## Export Capabilities

### JSON Export
```javascript
const json = engine.exportConditions('json');
```

### CSV Export
```javascript
const csv = engine.exportConditions('csv');
```

## Decision Logic

The engine provides `shouldStop()` method that returns `true` when:

- Any high-severity conditions exist
- Token budget is exhausted
- Multiple search failures occurred (≥3)

## Integration Points

### With Token Budget System
- Monitors `used` vs `budget` values
- Generates percentage-based explanations
- Integrates with existing budget tracking

### With Result Limiting System  
- Tracks `requested` vs `allowed` counts
- Provides source-specific limit information
- Handles multiple result types

### With Quality System
- Compares scores against thresholds
- Includes item metadata in explanations
- Supports context-aware quality adjustments

### With Cache System
- Monitors cache size and hit rates
- Detects performance degradation
- Provides optimization recommendations

## Testing

Comprehensive test suite covers:

- ✅ Session management
- ✅ All condition types
- ✅ Explanation generation
- ✅ Analysis and recommendations
- ✅ Export functionality
- ✅ Edge cases and error handling
- ✅ Integration scenarios

Run tests:
```bash
node --test test/stopping-reasons.test.js
```

## Examples

### Demo Application
```bash
node demo-stopping-reasons.js
```

### Integration Example
```bash
node examples/stopping-reasons-integration.js
```

## Benefits

1. **Transparency**: Clear explanations for why assembly stopped
2. **Actionability**: Specific recommendations for improvement
3. **Integration**: Works with existing systems without breaking changes
4. **Comprehensiveness**: Handles all major stopping conditions
5. **Performance**: Minimal overhead with detailed insights
6. **Extensibility**: Easy to add new condition types

## Future Enhancements

- Additional condition types (network issues, rate limiting)
- Machine learning-based recommendation improvements
- Real-time monitoring integration
- Custom explanation templates
- Multi-language support

---

**File**: `src/context/stopping-reasons.js`  
**Tests**: `test/stopping-reasons.test.js`  
**Demo**: `demo-stopping-reasons.js`  
**Integration Example**: `examples/stopping-reasons-integration.js`