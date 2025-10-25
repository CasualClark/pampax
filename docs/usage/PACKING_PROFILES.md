# PAMPAX Packing Profiles System

## Overview

The Packing Profiles system provides intelligent context optimization for PAMPAX, enabling per-repo configuration for optimal context packing with model-specific strategies, disk-based caching, and automatic learning.

## Features

### 🎯 Per-Repository Configuration
- Customizable packing strategies for each repository
- Model-specific optimization profiles
- Repository analysis-driven profile generation

### 🧠 Intelligent Content Classification
- Hierarchical prioritization (must-have, important, supplementary, optional)
- Intent-aware content weighting
- Dynamic priority adjustment based on query context

### 💾 Smart Caching System
- Disk-based profile caching with TTL
- In-memory caching for frequent access
- Automatic cache cleanup and optimization

### 📦 Advanced Packing Algorithms
- Smart capsule creation for large content items
- Multiple truncation strategies (head, tail, middle, smart)
- Budget-aware content allocation

### 📊 Performance Monitoring & Learning
- Real-time performance metrics
- Automatic profile optimization based on usage patterns
- Strategy effectiveness analysis

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Packing Profiles System                    │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │ Profile Manager │  │ Context Optimizer│  │ Search Integration│ │
│  │                 │  │                 │  │                   │ │
│  │ • CRUD Operations│  │ • Classification │  │ • Result Packing  │ │
│  │ • Caching        │  │ • Budget Management│ │ • Performance     │ │
│  │ • Validation     │  │ • Capsule Creation│ │ • Learning        │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │   Database      │  │  Intent System  │  │  Token Counter  │ │
│  │                 │  │                 │  │                 │ │
│  │ • Profile Storage│  │ • Query Analysis│  │ • Token Estimation│ │
│  │ • Metadata       │  │ • Entity Extraction│ │ • Performance   │ │
│  │ • Indexing       │  │ • Policy Mapping │  │                 │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## Quick Start

### Basic Usage

```javascript
import { PackingProfileManager } from './src/tokenization/packing-profiles.js';
import { SearchIntegrationManager } from './src/tokenization/search-integration.js';

// Initialize managers
const profileManager = new PackingProfileManager(storage);
const searchIntegration = new SearchIntegrationManager(profileManager, storage);

// Create a custom profile
await profileManager.createProfile({
  repository: 'my-project',
  model: 'gpt-4',
  priorities: {
    tests: 0.8,
    code: 1.0,
    comments: 0.6,
    examples: 0.7,
    config: 0.5,
    docs: 0.4
  },
  budgetAllocation: {
    total: 8000,
    mustHave: 2000,
    important: 3000,
    supplementary: 2000,
    optional: 800,
    reserve: 200
  },
  capsuleStrategies: {
    enabled: true,
    maxCapsuleSize: 1000,
    minCapsuleSize: 200,
    capsuleThreshold: 1500,
    preserveStructure: true
  },
  truncationStrategies: {
    strategy: 'smart',
    preserveImportant: true,
    preserveContext: true,
    truncateComments: true,
    preserveSignatures: true
  }
});

// Optimize search results
const optimized = await searchIntegration.optimizeSearchResults(
  'query',
  searchResults,
  {
    repository: 'my-project',
    model: 'gpt-4',
    intent: classifiedIntent,
    options: {
      customBudget: 5000,
      trackPerformance: true,
      enableLearning: true
    }
  }
);
```

### Auto-Generated Profiles

```javascript
// Automatically generate optimized profile based on repository analysis
const profile = await profileManager.optimizeProfile('my-project', 'gpt-4');

console.log(`Generated profile with budget: ${profile.budgetAllocation.total}`);
console.log(`Priorities:`, profile.priorities);
```

## Configuration

### Content Priorities

Define the relative importance of different content types:

```javascript
priorities: {
  tests: 0.8,        // Test files priority
  code: 1.0,         // Core implementation priority
  comments: 0.6,     // Documentation and comments
  examples: 0.7,     // Usage examples
  config: 0.5,       // Configuration files
  docs: 0.4          // Documentation files
}
```

### Budget Allocation

Configure token budget distribution:

```javascript
budgetAllocation: {
  total: 8000,        // Total token budget
  mustHave: 2000,     // Critical content (25%)
  important: 3000,    // Important content (37.5%)
  supplementary: 2000, // Supplementary content (25%)
  optional: 800,      // Optional content (10%)
  reserve: 200        // Reserve buffer (2.5%)
}
```

### Capsule Strategies

Configure smart content splitting:

```javascript
capsuleStrategies: {
  enabled: true,           // Enable capsule creation
  maxCapsuleSize: 1000,    // Maximum tokens per capsule
  minCapsuleSize: 200,     // Minimum tokens per capsule
  capsuleThreshold: 1500,  // Threshold for creating capsules
  preserveStructure: true  // Preserve code structure
}
```

### Truncation Strategies

Choose how to handle content overflow:

```javascript
truncationStrategies: {
  strategy: 'smart',           // 'head' | 'tail' | 'middle' | 'smart'
  preserveImportant: true,     // Preserve high-priority content
  preserveContext: true,       // Preserve surrounding context
  truncateComments: true,      // Truncate comments first
  preserveSignatures: true     // Preserve function/class signatures
}
```

## Model-Specific Profiles

### GPT-4
- **Total Budget**: 8,000 tokens
- **Strategy**: Smart truncation with capsule preservation
- **Priorities**: High emphasis on code and comments
- **Capsules**: Up to 1,200 tokens with structure preservation

### GPT-3.5-Turbo
- **Total Budget**: 4,000 tokens
- **Strategy**: Head-first truncation
- **Priorities**: Balanced approach with example emphasis
- **Capsules**: Smaller capsules (800 tokens max)

### Claude-3
- **Total Budget**: 100,000 tokens
- **Strategy**: Smart truncation with full context preservation
- **Priorities**: Comprehensive coverage with documentation emphasis
- **Capsules**: Large capsules (2,000 tokens max)

## Intent-Aware Optimization

The system integrates with the intent classifier to adjust packing based on query intent:

### Symbol Intent
```javascript
// Boost for code, comments, and examples
intent: 'symbol'
// Adjusted priorities:
//   code: 1.0 → 1.2
//   comments: 0.6 → 0.66
//   examples: 0.7 → 0.77
```

### Config Intent
```javascript
// Boost for configuration and documentation
intent: 'config'
// Adjusted priorities:
//   config: 0.5 → 0.65
//   docs: 0.4 → 0.48
```

### API Intent
```javascript
// Boost for code and examples
intent: 'api'
// Adjusted priorities:
//   code: 1.0 → 1.1
//   examples: 0.7 → 0.84
```

## Performance Monitoring

### Metrics Collection

The system automatically tracks:

- **Token Reduction**: Percentage of tokens saved through optimization
- **Budget Utilization**: How effectively the token budget is used
- **Truncation Rate**: How often content needs to be truncated
- **Processing Time**: Time taken for optimization
- **Strategy Effectiveness**: Performance of different truncation strategies

### Performance Statistics

```javascript
const stats = searchIntegration.getPerformanceStats('my-repo', 'gpt-4');

console.log(`Total Queries: ${stats.totalQueries}`);
console.log(`Avg Tokens Reduced: ${stats.avgTokensReduced}%`);
console.log(`Avg Budget Used: ${stats.avgBudgetUsed * 100}%`);
console.log(`Truncation Rate: ${stats.truncationRate}%`);
console.log(`Strategy Distribution:`, stats.strategyDistribution);
```

## Learning System

### Automatic Profile Optimization

The learning system analyzes performance data to automatically optimize profiles:

1. **Pattern Recognition**: Identifies usage patterns and bottlenecks
2. **Strategy Evaluation**: Compares effectiveness of different strategies
3. **Profile Adjustment**: Automatically updates profile parameters
4. **Continuous Improvement**: Learns from ongoing usage

### Learning Configuration

```javascript
// Enable learning for a query
await searchIntegration.optimizeSearchResults(query, results, {
  repository: 'my-project',
  model: 'gpt-4',
  options: {
    enableLearning: true,
    trackPerformance: true
  }
});

// Check learning statistics
const learningStats = searchIntegration.getLearningStats();
console.log(`Profiles with learning: ${learningStats.learningProfiles.length}`);
console.log(`Total learning events: ${learningStats.totalEvents}`);
```

## Advanced Features

### Repository Analysis

The system analyzes repositories to generate optimized profiles:

```javascript
const analysis = await profileManager.analyzeRepository('my-project');

console.log(`Total Files: ${analysis.totalFiles}`);
console.log(`Languages:`, analysis.languages);
console.log(`Has Tests: ${analysis.hasTests}`);
console.log(`Has Config: ${analysis.hasConfig}`);
console.log(`Average File Size: ${analysis.avgFileSize}`);
```

### Profile Inheritance

Profiles can inherit and override settings:

```javascript
// Create base profile
const baseProfile = await profileManager.createProfile({
  repository: 'base-config',
  model: 'gpt-4',
  // ... base configuration
});

// Create specialized profile
const specializedProfile = await profileManager.createProfile({
  repository: 'my-project',
  model: 'gpt-4',
  priorities: {
    ...baseProfile.priorities,
    tests: 0.95  // Override test priority
  },
  // ... other configuration
});
```

### Custom Classification Rules

Add custom content classification logic:

```javascript
// Extend content classifier
const customClassifier = new ContentClassifier(profile);

// Add custom content type detection
customClassifier.addCustomRule('infrastructure', (item) => {
  return item.path.includes('/infra/') || 
         item.path.includes('docker') || 
         item.path.includes('k8s');
});
```

## API Reference

### PackingProfileManager

#### Methods

- `createProfile(profileData)` - Create a new packing profile
- `getProfile(repository, model)` - Get profile for repository and model
- `updateProfile(id, updates)` - Update existing profile
- `deleteProfile(id)` - Delete a profile
- `optimizeProfile(repository, model)` - Generate optimized profile
- `getProfilesByRepository(repository)` - Get all profiles for repository
- `cleanupExpired()` - Clean up expired profiles

### SearchIntegrationManager

#### Methods

- `optimizeSearchResults(query, results, context)` - Optimize search results
- `getPerformanceStats(repository?, model?, intent?)` - Get performance statistics
- `getLearningStats()` - Get learning system statistics
- `clearPerformanceData()` - Clear performance metrics

### ContextOptimizer

#### Methods

- `optimize(items, intent?, customBudget?)` - Optimize content items
- `classifyItems(items, intent?)` - Classify items by priority
- `createCapsules(items)` - Create capsules for large items
- `applyTruncation(items, budget)` - Apply truncation strategy

## Best Practices

### 1. Profile Design

- **Start with Defaults**: Use model-specific profiles as starting points
- **Repository-Specific**: Create profiles tailored to repository characteristics
- **Monitor Performance**: Track metrics to identify optimization opportunities
- **Iterate**: Refine profiles based on usage patterns

### 2. Budget Management

- **Reserve Buffer**: Always maintain a reserve buffer (5-10%)
- **Prioritize Critical Content**: Allocate sufficient budget to must-have content
- **Model Awareness**: Adjust budgets based on model context limits
- **Content Type Balance**: Balance priorities based on repository needs

### 3. Performance Optimization

- **Enable Caching**: Use both disk and in-memory caching
- **Track Metrics**: Monitor performance to identify bottlenecks
- **Enable Learning**: Allow the system to learn from usage patterns
- **Regular Cleanup**: Periodically clean up expired profiles

### 4. Integration

- **Intent Awareness**: Use intent classification for better optimization
- **Relevance Scoring**: Incorporate relevance scores into packing decisions
- **Content Analysis**: Leverage repository analysis for profile generation
- **Feedback Loops**: Use performance data to continuously improve

## Troubleshooting

### Common Issues

#### Profile Not Found
```javascript
// Error: Profile not found for repository
// Solution: Create or optimize profile
await profileManager.optimizeProfile(repository, model);
```

#### Budget Exceeded
```javascript
// Warning: Content exceeds budget
// Solution: Increase budget or adjust allocation
profile.budgetAllocation.total = 10000;
```

#### Poor Performance
```javascript
// Issue: Slow optimization
// Solution: Check performance stats and adjust strategies
const stats = searchIntegration.getPerformanceStats();
if (stats.avgTime > 1000) {
  // Consider simpler strategies or smaller budgets
}
```

### Debug Mode

Enable debug logging:

```javascript
import { logger } from '../src/config/logger.js';

// Set debug level
logger.setLevel('debug');

// Monitor optimization process
const result = await searchIntegration.optimizeSearchResults(query, results, context);
```

## Migration Guide

### From Simple Packing

1. **Install Dependencies**: Ensure all required packages are installed
2. **Initialize Managers**: Create `PackingProfileManager` and `SearchIntegrationManager`
3. **Migrate Existing Config**: Convert existing packing configuration to profile format
4. **Update Search Pipeline**: Integrate `SearchIntegrationManager` into search workflow
5. **Enable Monitoring**: Add performance tracking and learning

### Configuration Migration

```javascript
// Old approach
const packingConfig = {
  maxTokens: 8000,
  truncate: 'head',
  preserveImportant: true
};

// New approach
const profile = await profileManager.createProfile({
  repository: 'my-project',
  model: 'gpt-4',
  budgetAllocation: {
    total: packingConfig.maxTokens,
    mustHave: 2000,
    important: 3000,
    supplementary: 2000,
    optional: 800,
    reserve: 200
  },
  truncationStrategies: {
    strategy: packingConfig.truncate,
    preserveImportant: packingConfig.preserveImportant
  }
  // ... other configuration
});
```

## Contributing

### Development Setup

1. **Install Dependencies**: `npm install`
2. **Run Tests**: `npm test`
3. **Build Project**: `npm run build`
4. **Run Linting**: `npm run lint`

### Adding New Features

1. **Create Feature Branch**: `git checkout -b feature-name`
2. **Implement Feature**: Add code with tests
3. **Update Documentation**: Update this README and API docs
4. **Submit PR**: Create pull request with description

### Testing

```bash
# Run all tests
npm test

# Run specific test file
npm test -- packing-profiles.test.js

# Run with coverage
npm run test:coverage

# Run integration tests
npm run test:integration
```

## License

This project is licensed under the MIT License - see the LICENSE file for details.