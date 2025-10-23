#!/usr/bin/env node

/**
 * Demonstration of the PAMPAX Intent Classification Engine
 * 
 * This script shows how the intent classifier can categorize different types of queries
 * and suggest appropriate retrieval policies.
 */

import { IntentClassifier } from '../dist/src/intent/intent-classifier.js';

const classifier = new IntentClassifier();

const demoQueries = [
  // Symbol queries
  'find the getUserById function definition',
  'show me the UserService class implementation',
  'where is the calculateTotal method implemented',
  
  // Config queries  
  'database connection configuration settings',
  'show me the .env file settings',
  'application configuration parameters',
  
  // API queries
  'REST endpoint handler for user authentication',
  'POST /api/users route implementation',
  'HTTP request middleware configuration',
  
  // Incident queries
  'debug the crash error bug in authentication',
  'fix the memory leak issue',
  'investigate the performance problem',
  
  // Search queries (fallback)
  'how to implement user management',
  'best practices for error handling',
  'tutorial for database optimization'
];

console.log('🔍 PAMPAX Intent Classification Engine Demo\n');
console.log('=' .repeat(60));

for (const query of demoQueries) {
  const result = classifier.classify(query);
  
  // Format confidence as percentage
  const confidencePercent = Math.round(result.confidence * 100);
  
  // Get emoji for intent type
  const intentEmojis = {
    symbol: '🔧',
    config: '⚙️',
    api: '🌐',
    incident: '🚨',
    search: '🔎'
  };
  
  const emoji = intentEmojis[result.intent] || '❓';
  
  console.log(`\n${emoji} Query: "${query}"`);
  console.log(`   Intent: ${result.intent.toUpperCase()} (${confidencePercent}% confidence)`);
  
  if (result.entities.length > 0) {
    console.log(`   Entities: ${result.entities.map(e => `${e.type}:${e.value}`).join(', ')}`);
  }
  
  console.log(`   Policies: ${result.suggestedPolicies.join(', ')}`);
}

console.log('\n' + '=' .repeat(60));
console.log('📊 Summary:');
console.log('   • Symbol: Code definitions, functions, classes');
console.log('   • Config: Configuration files and settings');
console.log('   • API: Endpoints, routes, handlers');
console.log('   • Incident: Errors, bugs, debugging');
console.log('   • Search: General queries (fallback)');
console.log('\n✨ Each intent maps to specific retrieval policies for optimal results!');