#!/usr/bin/env node
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { PolicyGate, type PolicyDecision, type SearchContext } from '../src/policy/policy-gate.js';
import type { IntentResult } from '../src/intent/intent-classifier.js';

describe('Policy Gate Tests', () => {
  let policyGate: PolicyGate;

  before(() => {
    policyGate = new PolicyGate();
  });

  after(() => {
    // Clean up if needed
  });

  test('should evaluate symbol intent policy correctly', () => {
    const intent: IntentResult = {
      intent: 'symbol',
      confidence: 0.8,
      entities: [
        { type: 'function', value: 'getUserById', position: 0 }
      ],
      suggestedPolicies: ['symbol-level-2', 'symbol-function-usage']
    };

    const context: SearchContext = {
      repo: 'test-repo',
      language: 'typescript'
    };

    const policy = policyGate.evaluate(intent, context);

    assert.equal(policy.maxDepth, 2, 'Symbol intent should have maxDepth of 2');
    assert.equal(policy.includeSymbols, true, 'Symbol intent should include symbols');
    assert.equal(policy.includeFiles, false, 'Symbol intent should not include files');
    assert.equal(policy.includeContent, true, 'Symbol intent should include content');
    assert.equal(policy.earlyStopThreshold, 3, 'Symbol intent should have earlyStopThreshold of 3');
    assert.ok(policy.seedWeights.definition > 0, 'Symbol intent should have definition weight');
    assert.ok(policy.seedWeights.usage > 0, 'Symbol intent should have usage weight');
  });

  test('should evaluate config intent policy correctly', () => {
    const intent: IntentResult = {
      intent: 'config',
      confidence: 0.7,
      entities: [
        { type: 'file', value: 'config.json', position: 0 }
      ],
      suggestedPolicies: ['config-key-source', 'config-file-context']
    };

    const context: SearchContext = {
      repo: 'test-repo',
      language: 'javascript'
    };

    const policy = policyGate.evaluate(intent, context);

    assert.equal(policy.maxDepth, 1, 'Config intent should have maxDepth of 1');
    assert.equal(policy.includeSymbols, false, 'Config intent should not include symbols');
    assert.equal(policy.includeFiles, true, 'Config intent should include files');
    assert.equal(policy.includeContent, true, 'Config intent should include content');
    assert.equal(policy.earlyStopThreshold, 2, 'Config intent should have earlyStopThreshold of 2');
    assert.ok(policy.seedWeights.config > 0, 'Config intent should have config weight');
  });

  test('should evaluate API intent policy correctly', () => {
    const intent: IntentResult = {
      intent: 'api',
      confidence: 0.9,
      entities: [
        { type: 'route', value: '/api/users', position: 0 }
      ],
      suggestedPolicies: ['api-handler-registration', 'api-route-mapping']
    };

    const context: SearchContext = {
      repo: 'test-repo',
      language: 'node'
    };

    const policy = policyGate.evaluate(intent, context);

    assert.equal(policy.maxDepth, 2, 'API intent should have maxDepth of 2');
    assert.equal(policy.includeSymbols, true, 'API intent should include symbols');
    assert.equal(policy.includeFiles, false, 'API intent should not include files');
    assert.equal(policy.includeContent, true, 'API intent should include content');
    assert.equal(policy.earlyStopThreshold, 2, 'API intent should have earlyStopThreshold of 2');
    assert.ok(policy.seedWeights.handler > 0, 'API intent should have handler weight');
  });

  test('should evaluate incident intent policy correctly', () => {
    const intent: IntentResult = {
      intent: 'incident',
      confidence: 0.85,
      entities: [
        { type: 'function', value: 'authenticate', position: 0 }
      ],
      suggestedPolicies: ['incident-callers-diffs', 'incident-function-context']
    };

    const context: SearchContext = {
      repo: 'test-repo',
      language: 'python'
    };

    const policy = policyGate.evaluate(intent, context);

    assert.equal(policy.maxDepth, 3, 'Incident intent should have maxDepth of 3');
    assert.equal(policy.includeSymbols, true, 'Incident intent should include symbols');
    assert.equal(policy.includeFiles, true, 'Incident intent should include files');
    assert.equal(policy.includeContent, true, 'Incident intent should include content');
    assert.equal(policy.earlyStopThreshold, 5, 'Incident intent should have earlyStopThreshold of 5');
    assert.ok(policy.seedWeights.error > 0, 'Incident intent should have error weight');
    assert.ok(policy.seedWeights.caller > 0, 'Incident intent should have caller weight');
  });

  test('should evaluate search intent policy correctly', () => {
    const intent: IntentResult = {
      intent: 'search',
      confidence: 0.6,
      entities: [],
      suggestedPolicies: ['search-default']
    };

    const context: SearchContext = {
      repo: 'test-repo',
      language: 'typescript'
    };

    const policy = policyGate.evaluate(intent, context);

    assert.equal(policy.maxDepth, 2, 'Search intent should have maxDepth of 2');
    assert.equal(policy.includeSymbols, true, 'Search intent should include symbols');
    assert.equal(policy.includeFiles, true, 'Search intent should include files');
    assert.equal(policy.includeContent, true, 'Search intent should include content');
    assert.equal(policy.earlyStopThreshold, 10, 'Search intent should have earlyStopThreshold of 10');
  });

  test('should apply repository-specific policy overrides', () => {
    const repositoryPolicies = {
      'special-repo': {
        symbol: {
          maxDepth: 4,
          includeSymbols: true,
          includeFiles: false,
          includeContent: true,
          earlyStopThreshold: 5,
          seedWeights: {
            definition: 3.0,
            declaration: 1.8,
            implementation: 1.5,
            usage: 1.0,
            test: 0.8,
            reference: 0.5
          }
        }
      }
    };

    const policyGateWithOverrides = new PolicyGate(repositoryPolicies);

    const intent: IntentResult = {
      intent: 'symbol',
      confidence: 0.8,
      entities: [],
      suggestedPolicies: []
    };

    const context: SearchContext = {
      repo: 'special-repo'
    };

    const policy = policyGateWithOverrides.evaluate(intent, context);

    assert.equal(policy.maxDepth, 4, 'Should use repository override for maxDepth');
    assert.equal(policy.earlyStopThreshold, 5, 'Should use repository override for earlyStopThreshold');
    assert.equal(policy.seedWeights.definition, 3.0, 'Should use repository override for seedWeights');
  });

  test('should apply repository pattern matching', () => {
    const repositoryPolicies = {
      '*-frontend': {
        api: {
          maxDepth: 3,
          includeSymbols: true,
          includeFiles: true,
          includeContent: true,
          earlyStopThreshold: 2,
          seedWeights: {
            handler: 2.0,
            endpoint: 1.8,
            route: 1.5,
            controller: 1.3,
            middleware: 1.0,
            registration: 0.8
          }
        }
      }
    };

    const policyGateWithPatterns = new PolicyGate(repositoryPolicies);

    const intent: IntentResult = {
      intent: 'api',
      confidence: 0.8,
      entities: [],
      suggestedPolicies: []
    };

    const context: SearchContext = {
      repo: 'my-frontend'
    };

    const policy = policyGateWithPatterns.evaluate(intent, context);

    assert.equal(policy.maxDepth, 3, 'Should match repository pattern and apply overrides');
    assert.equal(policy.includeFiles, true, 'Should apply pattern-based file inclusion');
  });

  test('should apply confidence-based adjustments', () => {
    const baseIntent: IntentResult = {
      intent: 'symbol',
      confidence: 0.3, // Low confidence
      entities: [],
      suggestedPolicies: []
    };

    const context: SearchContext = {};

    // Test low confidence
    const lowConfidencePolicy = policyGate.evaluate({ ...baseIntent, confidence: 0.3 }, context);
    assert.equal(lowConfidencePolicy.maxDepth, 1, 'Low confidence should reduce maxDepth');
    assert.equal(lowConfidencePolicy.earlyStopThreshold, 2, 'Low confidence should reduce earlyStopThreshold');

    // Test high confidence
    const highConfidencePolicy = policyGate.evaluate({ ...baseIntent, confidence: 0.9 }, context);
    assert.equal(highConfidencePolicy.maxDepth, 3, 'High confidence should increase maxDepth');
    assert.equal(highConfidencePolicy.earlyStopThreshold, 5, 'High confidence should increase earlyStopThreshold');
  });

  test('should apply query length adjustments', () => {
    const intent: IntentResult = {
      intent: 'search',
      confidence: 0.7,
      entities: [],
      suggestedPolicies: []
    };

    // Test short query
    const shortQueryPolicy = policyGate.evaluate(intent, { queryLength: 5 });
    assert.equal(shortQueryPolicy.maxDepth, 3, 'Short query should increase maxDepth');

    // Test long query
    const longQueryPolicy = policyGate.evaluate(intent, { queryLength: 60 });
    assert.equal(longQueryPolicy.maxDepth, 1, 'Long query should decrease maxDepth');
    assert.equal(longQueryPolicy.earlyStopThreshold, 9, 'Long query should decrease earlyStopThreshold');
  });

  test('should apply budget-based adjustments', () => {
    const intent: IntentResult = {
      intent: 'symbol',
      confidence: 0.7,
      entities: [],
      suggestedPolicies: []
    };

    const lowBudgetPolicy = policyGate.evaluate(intent, { budget: 1500 });
    assert.equal(lowBudgetPolicy.includeContent, false, 'Low budget should disable content inclusion');
    assert.ok(lowBudgetPolicy.earlyStopThreshold < 3, 'Low budget should reduce earlyStopThreshold');
  });

  test('should apply language-specific weight adjustments', () => {
    const intent: IntentResult = {
      intent: 'symbol',
      confidence: 0.7,
      entities: [],
      suggestedPolicies: []
    };

    // Test Python
    const pythonPolicy = policyGate.evaluate(intent, { language: 'python' });
    assert.ok(pythonPolicy.seedWeights.definition > 1.0, 'Python should boost definition weight');
    assert.ok(pythonPolicy.seedWeights.implementation > 1.0, 'Python should boost implementation weight');

    // Test TypeScript
    const tsPolicy = policyGate.evaluate(intent, { language: 'typescript' });
    assert.ok(tsPolicy.seedWeights.handler > 1.0, 'TypeScript should boost handler weight');
    assert.ok(tsPolicy.seedWeights.middleware > 1.0, 'TypeScript should boost middleware weight');

    // Test Java
    const javaPolicy = policyGate.evaluate(intent, { language: 'java' });
    assert.ok(javaPolicy.seedWeights.class > 1.0, 'Java should boost class weight');

    // Test Go
    const goPolicy = policyGate.evaluate(intent, { language: 'go' });
    assert.ok(goPolicy.seedWeights.package > 1.0, 'Go should boost package weight');
  });

  test('should handle unknown intent types gracefully', () => {
    const intent: IntentResult = {
      intent: 'unknown' as any,
      confidence: 0.7,
      entities: [],
      suggestedPolicies: []
    };

    const context: SearchContext = {};

    const policy = policyGate.evaluate(intent, context);

    // Should fall back to search policy
    assert.equal(policy.maxDepth, 2, 'Unknown intent should fall back to search policy');
    assert.equal(policy.includeSymbols, true, 'Unknown intent should fall back to search policy');
    assert.equal(policy.includeFiles, true, 'Unknown intent should fall back to search policy');
    assert.equal(policy.includeContent, true, 'Unknown intent should fall back to search policy');
  });

  test('should validate policy configurations', () => {
    const validPolicy: Partial<PolicyDecision> = {
      maxDepth: 3,
      earlyStopThreshold: 5,
      seedWeights: {
        definition: 2.0,
        usage: 1.0
      }
    };

    const errors = policyGate.validatePolicy(validPolicy);
    assert.equal(errors.length, 0, 'Valid policy should have no validation errors');

    const invalidPolicy: Partial<PolicyDecision> = {
      maxDepth: 15, // Too high
      earlyStopThreshold: 60, // Too high
      seedWeights: {
        definition: -1.0, // Negative
        usage: 10.0 // Too high
      }
    };

    const invalidErrors = policyGate.validatePolicy(invalidPolicy);
    assert.ok(invalidErrors.length > 0, 'Invalid policy should have validation errors');
    assert.ok(invalidErrors.some(e => e.includes('maxDepth')), 'Should catch maxDepth error');
    assert.ok(invalidErrors.some(e => e.includes('earlyStopThreshold')), 'Should catch earlyStopThreshold error');
    assert.ok(invalidErrors.some(e => e.includes('definition')), 'Should catch seedWeight error');
  });

  test('should update repository policies', () => {
    const newPolicies = {
      'updated-repo': {
        symbol: {
          maxDepth: 5,
          includeSymbols: true,
          includeFiles: false,
          includeContent: true,
          earlyStopThreshold: 3,
          seedWeights: { 
            definition: 3.0,
            declaration: 1.8,
            implementation: 1.5,
            usage: 1.0,
            test: 0.8,
            reference: 0.5
          }
        }
      }
    };

    policyGate.updateRepositoryPolicies(newPolicies);

    const intent: IntentResult = {
      intent: 'symbol',
      confidence: 0.8,
      entities: [],
      suggestedPolicies: []
    };

    const context: SearchContext = {
      repo: 'updated-repo'
    };

    const policy = policyGate.evaluate(intent, context);

    assert.equal(policy.maxDepth, 5, 'Should use updated repository policy');
    assert.equal(policy.seedWeights.definition, 3.0, 'Should use updated seed weights');
  });

  test('should get specific repository policy', () => {
    const repositoryPolicies = {
      'test-repo': {
        symbol: {
          maxDepth: 4,
          includeSymbols: true,
          includeFiles: false,
          includeContent: true,
          earlyStopThreshold: 6,
          seedWeights: {
            definition: 2.0,
            declaration: 1.8,
            implementation: 1.5,
            usage: 1.0,
            test: 0.8,
            reference: 0.5
          }
        }
      }
    };

    const policyGateWithRepo = new PolicyGate(repositoryPolicies);

    const policy = policyGateWithRepo.getPolicy('test-repo', 'symbol');

    assert.equal(policy.maxDepth, 4, 'Should get specific repository policy');
    assert.equal(policy.earlyStopThreshold, 6, 'Should get specific repository policy');
  });

  test('should get all available policies', () => {
    const repositoryPolicies = {
      'test-repo': {
        symbol: {
          maxDepth: 4,
          includeSymbols: true,
          includeFiles: false,
          includeContent: true,
          earlyStopThreshold: 3,
          seedWeights: {
            definition: 2.0,
            declaration: 1.8,
            implementation: 1.5,
            usage: 1.0,
            test: 0.8,
            reference: 0.5
          }
        }
      }
    };

    const policyGateWithRepo = new PolicyGate(repositoryPolicies);
    const allPolicies = policyGateWithRepo.getAllPolicies();

    assert.ok(allPolicies.default, 'Should include default policies');
    assert.ok(allPolicies.repository, 'Should include repository policies');
    assert.deepEqual(allPolicies.repository, repositoryPolicies, 'Should return repository policies');
  });

  test('should handle missing context gracefully', () => {
    const intent: IntentResult = {
      intent: 'symbol',
      confidence: 0.8,
      entities: [],
      suggestedPolicies: []
    };

    // Should not throw with empty context
    const policy = policyGate.evaluate(intent, {});
    
    assert.ok(policy.maxDepth > 0, 'Should handle empty context');
    assert.ok(policy.earlyStopThreshold > 0, 'Should handle empty context');
  });

  test('should handle edge case confidence values', () => {
    const intent: IntentResult = {
      intent: 'symbol',
      confidence: 0.5, // Exactly at boundary
      entities: [],
      suggestedPolicies: []
    };

    const context: SearchContext = {};

    // Should handle boundary confidence values
    const policy = policyGate.evaluate(intent, context);
    
    assert.ok(policy.maxDepth >= 1, 'Should handle boundary confidence');
    assert.ok(policy.earlyStopThreshold >= 1, 'Should handle boundary confidence');
  });
});