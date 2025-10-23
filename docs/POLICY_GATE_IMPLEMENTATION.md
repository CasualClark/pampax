# Policy Gate Implementation

## Overview

The Policy Gate system maps query intents to retrieval policies that control search behavior in PAMPAX. It provides intelligent, context-aware search policies based on the user's intent and repository characteristics.

## Architecture

### Core Components

1. **Intent Classifier** - Analyzes queries to determine user intent
2. **Policy Gate** - Maps intents to search policies with context adjustments
3. **Policy Configuration** - JSON-based policy definitions per intent type

### Intent Types

- **symbol** - Searches for code definitions, implementations, and usage
- **config** - Finds configuration files, settings, and environment variables
- **api** - Locates API endpoints, handlers, and route definitions
- **incident** - Investigates errors, bugs, and related code changes
- **search** - General-purpose search with balanced policies

## Policy Decision Structure

```typescript
interface PolicyDecision {
  maxDepth: number;              // Maximum search depth
  includeSymbols: boolean;       // Include symbol-based results
  includeFiles: boolean;         // Include file-based results
  includeContent: boolean;       // Include file content in results
  earlyStopThreshold: number;   // Stop when this many results are found
  seedWeights: Record<string, number>; // Weight factors for result ranking
}
```

## Default Policies

### Symbol Intent
- **Max Depth**: 2 (Level-2 definitions)
- **Early Stop**: 3 (defs + 1 usage + 1 test)
- **Weights**: definition (2.0), declaration (1.8), implementation (1.5)

### Config Intent
- **Max Depth**: 1 (Configuration is usually shallow)
- **Early Stop**: 2 (key + source file)
- **Weights**: config (2.0), setting (1.8), environment (1.5)

### API Intent
- **Max Depth**: 2 (Handler + related components)
- **Early Stop**: 2 (handler signature + registration)
- **Weights**: handler (2.0), endpoint (1.8), route (1.5)

### Incident Intent
- **Max Depth**: 3 (Callers + related code)
- **Early Stop**: 5 (callers r=1 + recent diffs)
- **Weights**: error (2.5), exception (2.2), caller (2.0)

### Search Intent
- **Max Depth**: 2 (Balanced search)
- **Early Stop**: 10 (Generous limit)
- **Weights**: match (1.0), relevant (0.9), similar (0.8)

## Context-Aware Adjustments

### Confidence-Based Adjustments
- **High confidence (>0.8)**: More aggressive search (increased depth/threshold)
- **Low confidence (<0.5)**: Conservative search (reduced depth/threshold)

### Query Length Adjustments
- **Short queries (<10 chars)**: Broader search (increased depth)
- **Long queries (>50 chars)**: Focused search (reduced depth/threshold)

### Budget Constraints
- **Low budget (<2000 tokens)**: Disable content, reduce threshold

### Language-Specific Adjustments
- **Python**: Boost definition and implementation weights
- **TypeScript/JavaScript**: Boost handler and middleware weights
- **Java**: Boost class weights
- **Go**: Boost package weights

## Repository-Specific Policies

Repositories can override default policies through configuration:

```json
{
  "policy": {
    "symbol": {
      "maxDepth": 4,
      "earlyStopThreshold": 8
    }
  }
}
```

Pattern matching is also supported:
```json
{
  "policy": {
    "critical-*": {
      "symbol": {
        "maxDepth": 5,
        "seedWeights": { "critical": 3.0 }
      }
    }
  }
}
```

## Usage Examples

### Basic Usage
```typescript
import { IntentClassifier, PolicyGate } from './src/intent/index.js';

const classifier = new IntentClassifier();
const policyGate = new PolicyGate();

const intent = classifier.classify('getUserById function definition');
const policy = policyGate.evaluate(intent, {
  repo: 'user-service',
  language: 'typescript'
});
```

### Repository-Specific Policies
```typescript
const repoPolicies = {
  'auth-service': {
    incident: {
      maxDepth: 4,
      earlyStopThreshold: 10
    }
  }
};

const customPolicyGate = new PolicyGate(repoPolicies);
```

### Policy Validation
```typescript
const errors = policyGate.validatePolicy({
  maxDepth: 15, // Invalid: too high
  earlyStopThreshold: -1 // Invalid: too low
});

if (errors.length > 0) {
  console.log('Policy errors:', errors);
}
```

## Integration Points

### With Search System
The policy decision controls:
- Search depth and scope
- Result inclusion criteria
- Early stopping conditions
- Result ranking weights

### With Memory System
Policy decisions influence:
- Memory retrieval scope
- Context assembly parameters
- Token budget allocation

### With Indexing System
Policy-aware indexing can:
- Prioritize relevant spans
- Optimize storage for common patterns
- Provide intent-specific metadata

## Configuration

### Global Configuration
Add to `pampax.config.json`:
```json
{
  "policy": {
    "symbol": { ... },
    "config": { ... },
    "api": { ... },
    "incident": { ... },
    "search": { ... }
  }
}
```

### Runtime Updates
```typescript
policyGate.updateRepositoryPolicies({
  'new-service': {
    symbol: { maxDepth: 3 }
  }
});
```

## Testing

### Unit Tests
- Policy evaluation for each intent type
- Context-based adjustments
- Repository-specific overrides
- Policy validation

### Integration Tests
- End-to-end intent to policy flow
- Consistency across evaluations
- Edge case handling

### Demo
Run the demonstration:
```bash
node examples/policy-gate-demo.js
```

## Performance Considerations

### Policy Evaluation Cost
- Minimal overhead (<1ms per evaluation)
- Cached policy decisions for repeated queries
- Efficient context-based adjustments

### Memory Usage
- Policy configurations are lightweight JSON objects
- Repository policies stored as simple key-value pairs
- No persistent state required

### Scalability
- Supports thousands of repository-specific policies
- Pattern matching for policy inheritance
- Graceful fallback to defaults

## Future Enhancements

### Machine Learning Integration
- Learn optimal policies from usage patterns
- Dynamic policy adjustment based on success metrics
- Personalized policies per user/role

### Advanced Context
- File type-specific policies
- Time-based policy adjustments
- Dependency-aware search policies

### Policy Analytics
- Track policy effectiveness
- Identify optimization opportunities
- Automated policy tuning

## Troubleshooting

### Common Issues

1. **Policy not applying**: Check repository name matching
2. **Unexpected depth**: Verify confidence scoring
3. **Missing weights**: Ensure language-specific adjustments

### Debug Information
Enable debug logging:
```typescript
import { logger } from './src/config/logger.js';
logger.setConfig({ level: 'DEBUG' });
```

### Policy Inspection
```typescript
const allPolicies = policyGate.getAllPolicies();
console.log('Default policies:', allPolicies.default);
console.log('Repository policies:', allPolicies.repository);
```

## Conclusion

The Policy Gate system provides intelligent, context-aware search policies that adapt to user intent and repository characteristics. It offers a flexible foundation for optimizing search performance while maintaining simplicity and extensibility.