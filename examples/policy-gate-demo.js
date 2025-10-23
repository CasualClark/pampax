#!/usr/bin/env node

import { IntentClassifier } from '../dist/src/intent/intent-classifier.js';
import { PolicyGate } from '../dist/policy/policy-gate.js';

/**
 * Demonstration of the Policy Gate system
 */
console.log('🚪 Policy Gate Demonstration\n');

// Initialize components
const intentClassifier = new IntentClassifier();
const policyGate = new PolicyGate();

// Test queries with different intents
const testQueries = [
  {
    query: 'find the getUserById function definition',
    expectedIntent: 'symbol',
    context: { repo: 'user-service', language: 'typescript' }
  },
  {
    query: 'database connection configuration settings',
    expectedIntent: 'config',
    context: { repo: 'backend-api', language: 'javascript' }
  },
  {
    query: 'REST endpoint handler for user authentication',
    expectedIntent: 'api',
    context: { repo: 'auth-server', language: 'typescript' }
  },
  {
    query: 'debug the crash error bug in authentication',
    expectedIntent: 'incident',
    context: { repo: 'auth-service', language: 'python', budget: 3000 }
  },
  {
    query: 'how to implement user management',
    expectedIntent: 'search',
    context: { repo: 'general-app', language: 'java' }
  }
];

// Process each query
testQueries.forEach(({ query, expectedIntent, context }, index) => {
  console.log(`\n${index + 1}. Query: "${query}"`);
  console.log(`   Expected Intent: ${expectedIntent}`);
  
  // Classify intent
  const intent = intentClassifier.classify(query);
  console.log(`   Classified Intent: ${intent.intent} (confidence: ${intent.confidence.toFixed(2)})`);
  
  if (intent.entities.length > 0) {
    console.log(`   Entities: ${intent.entities.map(e => `${e.type}:${e.value}`).join(', ')}`);
  }
  
  // Get policy decision
  const policy = policyGate.evaluate(intent, context);
  
  console.log(`   Policy Decision:`);
  console.log(`     - Max Depth: ${policy.maxDepth}`);
  console.log(`     - Include Symbols: ${policy.includeSymbols}`);
  console.log(`     - Include Files: ${policy.includeFiles}`);
  console.log(`     - Include Content: ${policy.includeContent}`);
  console.log(`     - Early Stop Threshold: ${policy.earlyStopThreshold}`);
  
  console.log(`     - Top Seed Weights:`);
  const sortedWeights = Object.entries(policy.seedWeights)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 5);
  
  sortedWeights.forEach(([key, weight]) => {
    console.log(`       * ${key}: ${weight.toFixed(2)}`);
  });
  
  // Show context adjustments
  if (context.language) {
    console.log(`   Language Adjustments: Applied for ${context.language}`);
  }
  if (context.budget) {
    console.log(`   Budget Constraints: Applied (${context.budget} tokens)`);
  }
});

// Demonstrate repository-specific policies
console.log('\n\n🏢 Repository-Specific Policies Demo\n');

const repoPolicies = {
  'critical-service': {
    symbol: {
      maxDepth: 4,
      includeSymbols: true,
      includeFiles: false,
      includeContent: true,
      earlyStopThreshold: 8,
      seedWeights: { 'critical': 3.0 }
    }
  }
};

const customPolicyGate = new PolicyGate(repoPolicies);

const query = 'UserService class implementation';
const intent = intentClassifier.classify(query);

console.log(`Query: "${query}"`);
console.log(`Intent: ${intent.intent} (confidence: ${intent.confidence.toFixed(2)})`);

// Compare default vs custom policies
const defaultPolicy = policyGate.evaluate(intent, { repo: 'normal-service' });
const customPolicy = customPolicyGate.evaluate(intent, { repo: 'critical-service' });

console.log('\nDefault Policy (normal-service):');
console.log(`  Max Depth: ${defaultPolicy.maxDepth}, Early Stop: ${defaultPolicy.earlyStopThreshold}`);

console.log('\nCustom Policy (critical-service):');
console.log(`  Max Depth: ${customPolicy.maxDepth}, Early Stop: ${customPolicy.earlyStopThreshold}`);
console.log(`  Custom Weight (critical): ${customPolicy.seedWeights.critical}`);

// Show policy validation
console.log('\n\n🔍 Policy Validation Demo\n');

const invalidPolicy = {
  maxDepth: 15, // Too high
  earlyStopThreshold: -1, // Too low
  seedWeights: {
    'definition': 10 // Too high
  }
};

const errors = policyGate.validatePolicy(invalidPolicy);
if (errors.length > 0) {
  console.log('Invalid Policy Errors:');
  errors.forEach(error => console.log(`  ❌ ${error}`));
} else {
  console.log('✅ Policy is valid');
}

console.log('\n🎉 Policy Gate demonstration complete!');