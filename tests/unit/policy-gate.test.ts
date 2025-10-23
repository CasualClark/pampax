import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import { PolicyGate } from '../../dist/policy/policy-gate.js';
import type { IntentResult } from '../../dist/src/intent/intent-classifier.js';
import type { SearchContext, RepositoryPolicyConfig } from '../../dist/policy/policy-gate.d.ts';

describe('PolicyGate', () => {
  let policyGate: PolicyGate;

  beforeEach(() => {
    policyGate = new PolicyGate();
  });

  describe('Basic Policy Evaluation', () => {
    test('should create policy gate with default policies', () => {
      assert(policyGate instanceof PolicyGate);
      
      const allPolicies = policyGate.getAllPolicies();
      assert(allPolicies.default);
      assert(allPolicies.repository);
      assert.strictEqual(typeof allPolicies.default.symbol.maxDepth, 'number');
    });

    test('should evaluate symbol intent correctly', () => {
      const intent: IntentResult = {
        intent: 'symbol',
        confidence: 0.8,
        entities: [],
        suggestedPolicies: ['symbol-level-2']
      };

      const decision = policyGate.evaluate(intent);

      assert.strictEqual(decision.maxDepth, 2);
      assert.strictEqual(decision.includeSymbols, true);
      assert.strictEqual(decision.includeFiles, false);
      assert.strictEqual(decision.includeContent, true);
      assert.strictEqual(decision.earlyStopThreshold, 3);
      assert(decision.seedWeights.definition > 1);
    });

    test('should evaluate config intent correctly', () => {
      const intent: IntentResult = {
        intent: 'config',
        confidence: 0.7,
        entities: [],
        suggestedPolicies: ['config-key-source']
      };

      const decision = policyGate.evaluate(intent);

      assert.strictEqual(decision.maxDepth, 1);
      assert.strictEqual(decision.includeSymbols, false);
      assert.strictEqual(decision.includeFiles, true);
      assert.strictEqual(decision.includeContent, true);
      assert.strictEqual(decision.earlyStopThreshold, 2);
      assert(decision.seedWeights.config > 1);
    });

    test('should evaluate api intent correctly', () => {
      const intent: IntentResult = {
        intent: 'api',
        confidence: 0.6,
        entities: [],
        suggestedPolicies: ['api-handler-registration']
      };

      const decision = policyGate.evaluate(intent);

      assert.strictEqual(decision.maxDepth, 2);
      assert.strictEqual(decision.includeSymbols, true);
      assert.strictEqual(decision.includeFiles, false);
      assert.strictEqual(decision.includeContent, true);
      assert.strictEqual(decision.earlyStopThreshold, 2);
      assert(decision.seedWeights.handler > 1);
    });

    test('should evaluate incident intent correctly', () => {
      const intent: IntentResult = {
        intent: 'incident',
        confidence: 0.9,
        entities: [],
        suggestedPolicies: ['incident-callers-diffs']
      };

      const decision = policyGate.evaluate(intent);

      assert.strictEqual(decision.maxDepth, 4); // Adjusted for high confidence
      assert.strictEqual(decision.includeSymbols, true);
      assert.strictEqual(decision.includeFiles, true);
      assert.strictEqual(decision.includeContent, true);
      assert.strictEqual(decision.earlyStopThreshold, 7); // Adjusted for high confidence
      assert(decision.seedWeights.error > 2);
    });

    test('should evaluate search intent correctly', () => {
      const intent: IntentResult = {
        intent: 'search',
        confidence: 0.3,
        entities: [],
        suggestedPolicies: ['search-default']
      };

      const decision = policyGate.evaluate(intent);

      assert.strictEqual(decision.maxDepth, 1); // Adjusted for low confidence
      assert.strictEqual(decision.includeSymbols, true);
      assert.strictEqual(decision.includeFiles, true);
      assert.strictEqual(decision.includeContent, true);
      assert.strictEqual(decision.earlyStopThreshold, 9); // Adjusted for low confidence
    });
  });

  describe('Context-Based Adjustments', () => {
    test('should adjust policy based on confidence', () => {
      const lowConfidenceIntent: IntentResult = {
        intent: 'symbol',
        confidence: 0.3,
        entities: [],
        suggestedPolicies: []
      };

      const highConfidenceIntent: IntentResult = {
        intent: 'symbol',
        confidence: 0.9,
        entities: [],
        suggestedPolicies: []
      };

      const lowDecision = policyGate.evaluate(lowConfidenceIntent);
      const highDecision = policyGate.evaluate(highConfidenceIntent);

      // Low confidence should be more conservative
      assert.strictEqual(lowDecision.maxDepth, 1); // Reduced from 2
      assert.strictEqual(lowDecision.earlyStopThreshold, 2); // Reduced from 3

      // High confidence should be more aggressive
      assert.strictEqual(highDecision.maxDepth, 3); // Increased from 2
      assert.strictEqual(highDecision.earlyStopThreshold, 5); // Increased from 3
    });

    test('should adjust policy based on query length', () => {
      const intent: IntentResult = {
        intent: 'symbol',
        confidence: 0.7,
        entities: [],
        suggestedPolicies: []
      };

      const shortContext: SearchContext = { queryLength: 5 };
      const longContext: SearchContext = { queryLength: 60 };

      const shortDecision = policyGate.evaluate(intent, shortContext);
      const longDecision = policyGate.evaluate(intent, longContext);

      // Short queries get broader search
      assert.strictEqual(shortDecision.maxDepth, 3); // Increased from 2

      // Long queries get more focused search
      assert.strictEqual(longDecision.maxDepth, 1); // Reduced from 2
      assert.strictEqual(longDecision.earlyStopThreshold, 2); // Reduced from 3
    });

    test('should adjust policy based on budget', () => {
      const intent: IntentResult = {
        intent: 'symbol',
        confidence: 0.7,
        entities: [],
        suggestedPolicies: []
      };

      const lowBudgetContext: SearchContext = { budget: 1000 };

      const decision = policyGate.evaluate(intent, lowBudgetContext);

      // Low budget should disable content and reduce threshold
      assert.strictEqual(decision.includeContent, false);
      assert(decision.earlyStopThreshold < 3); // Reduced from 3
    });

    test('should adjust weights based on language', () => {
      const intent: IntentResult = {
        intent: 'symbol',
        confidence: 0.7,
        entities: [],
        suggestedPolicies: []
      };

      const pythonContext: SearchContext = { language: 'python' };
      const jsContext: SearchContext = { language: 'typescript' };
      const javaContext: SearchContext = { language: 'java' };

      const pythonDecision = policyGate.evaluate(intent, pythonContext);
      const jsDecision = policyGate.evaluate(intent, jsContext);
      const javaDecision = policyGate.evaluate(intent, javaContext);

      // Python should boost definition weights
      assert(pythonDecision.seedWeights.definition > 2.0);

      // TypeScript should boost handler weights
      assert(jsDecision.seedWeights.handler > 1.0);

      // Java should boost class weights
      assert(javaDecision.seedWeights.class > 1.0);
    });
  });

  describe('Repository-Specific Policies', () => {
    test('should use repository-specific policies when available', () => {
      const repoPolicies: RepositoryPolicyConfig = {
        'test-repo': {
          symbol: {
            maxDepth: 4,
            includeSymbols: true,
            includeFiles: false,
            includeContent: true,
            earlyStopThreshold: 8,
            seedWeights: {}
          }
        }
      };

      const customPolicyGate = new PolicyGate(repoPolicies);

      const intent: IntentResult = {
        intent: 'symbol',
        confidence: 0.7,
        entities: [],
        suggestedPolicies: []
      };

      const context: SearchContext = { repo: 'test-repo' };
      const decision = customPolicyGate.evaluate(intent, context);

      assert.strictEqual(decision.maxDepth, 4); // Override from default 2
      assert.strictEqual(decision.earlyStopThreshold, 8); // Override from default 3
    });

    test('should fall back to default when no repository policy exists', () => {
      const intent: IntentResult = {
        intent: 'symbol',
        confidence: 0.7,
        entities: [],
        suggestedPolicies: []
      };

      const context: SearchContext = { repo: 'non-existent-repo' };
      const decision = policyGate.evaluate(intent, context);

      // Should use default symbol policy
      assert.strictEqual(decision.maxDepth, 2);
      assert.strictEqual(decision.earlyStopThreshold, 3);
    });

    test('should support pattern matching for repository names', () => {
      const repoPolicies: RepositoryPolicyConfig = {
        'test-*': {
          symbol: {
            maxDepth: 5,
            includeSymbols: true,
            includeFiles: false,
            includeContent: true,
            earlyStopThreshold: 3,
            seedWeights: {}
          }
        }
      };

      const customPolicyGate = new PolicyGate(repoPolicies);

      const intent: IntentResult = {
        intent: 'symbol',
        confidence: 0.7,
        entities: [],
        suggestedPolicies: []
      };

      const context: SearchContext = { repo: 'test-repo-name' };
      const decision = customPolicyGate.evaluate(intent, context);

      assert.strictEqual(decision.maxDepth, 5); // Should match pattern
    });

    test('should merge repository policies with defaults', () => {
      const repoPolicies: RepositoryPolicyConfig = {
        'test-repo': {
          symbol: {
            maxDepth: 4, // Only override maxDepth
            includeSymbols: true,
            includeFiles: false,
            includeContent: true,
            earlyStopThreshold: 3,
            seedWeights: {}
          }
        }
      };

      const customPolicyGate = new PolicyGate(repoPolicies);

      const intent: IntentResult = {
        intent: 'symbol',
        confidence: 0.7,
        entities: [],
        suggestedPolicies: []
      };

      const context: SearchContext = { repo: 'test-repo' };
      const decision = customPolicyGate.evaluate(intent, context);

      // Should override maxDepth but keep other defaults
      assert.strictEqual(decision.maxDepth, 4);
      assert.strictEqual(decision.includeSymbols, true); // From default
      assert.strictEqual(decision.includeFiles, false); // From default
      assert.strictEqual(decision.earlyStopThreshold, 3); // From default
    });
  });

  describe('Policy Management', () => {
    test('should update repository policies', () => {
      const newPolicies: RepositoryPolicyConfig = {
        'new-repo': {
          symbol: {
            maxDepth: 6,
            includeSymbols: true,
            includeFiles: false,
            includeContent: true,
            earlyStopThreshold: 3,
            seedWeights: {}
          }
        }
      };

      policyGate.updateRepositoryPolicies(newPolicies);

      const intent: IntentResult = {
        intent: 'symbol',
        confidence: 0.7,
        entities: [],
        suggestedPolicies: []
      };

      const context: SearchContext = { repo: 'new-repo' };
      const decision = policyGate.evaluate(intent, context);

      assert.strictEqual(decision.maxDepth, 6);
    });

    test('should get policy for specific repository and intent', () => {
      const repoPolicies: RepositoryPolicyConfig = {
        'test-repo': {
          symbol: {
            maxDepth: 4,
            includeSymbols: true,
            includeFiles: false,
            includeContent: true,
            earlyStopThreshold: 3,
            seedWeights: {}
          }
        }
      };

      const customPolicyGate = new PolicyGate(repoPolicies);

      const policy = customPolicyGate.getPolicy('test-repo', 'symbol');
      assert.strictEqual(policy.maxDepth, 4);

      const defaultPolicy = customPolicyGate.getPolicy('other-repo', 'symbol');
      assert.strictEqual(defaultPolicy.maxDepth, 2); // Default value
    });

    test('should validate policy configurations', () => {
      const validPolicy = {
        maxDepth: 3,
        earlyStopThreshold: 5,
        seedWeights: {
          'definition': 1.5,
          'usage': 1.0
        }
      };

      const invalidPolicy = {
        maxDepth: 15, // Too high
        earlyStopThreshold: -1, // Too low
        seedWeights: {
          'definition': 10 // Too high
        }
      };

      const validErrors = policyGate.validatePolicy(validPolicy);
      assert.strictEqual(validErrors.length, 0);

      const invalidErrors = policyGate.validatePolicy(invalidPolicy);
      assert(invalidErrors.length > 0);
      assert(invalidErrors.some(e => e.includes('maxDepth')));
      assert(invalidErrors.some(e => e.includes('earlyStopThreshold')));
      assert(invalidErrors.some(e => e.includes('seedWeight')));
    });
  });

  describe('Edge Cases', () => {
    test('should handle unknown intent types gracefully', () => {
      const intent: IntentResult = {
        intent: 'unknown' as any,
        confidence: 0.5,
        entities: [],
        suggestedPolicies: []
      };

      const decision = policyGate.evaluate(intent);

      // Should fall back to search policy
      assert.strictEqual(decision.maxDepth, 2);
      assert.strictEqual(decision.includeSymbols, true);
      assert.strictEqual(decision.includeFiles, true);
    });

    test('should handle empty context gracefully', () => {
      const intent: IntentResult = {
        intent: 'symbol',
        confidence: 0.7,
        entities: [],
        suggestedPolicies: []
      };

      const decision = policyGate.evaluate(intent, {});

      // Should use default policy without adjustments
      assert.strictEqual(decision.maxDepth, 2);
      assert.strictEqual(decision.earlyStopThreshold, 3);
    });

    test('should handle partial repository policy overrides', () => {
      const repoPolicies: RepositoryPolicyConfig = {
        'test-repo': {
          symbol: {
            maxDepth: 2,
            includeSymbols: true,
            includeFiles: false,
            includeContent: true,
            earlyStopThreshold: 3,
            seedWeights: {
              'custom': 2.0
            }
          }
        }
      };

      const customPolicyGate = new PolicyGate(repoPolicies);

      const intent: IntentResult = {
        intent: 'symbol',
        confidence: 0.7,
        entities: [],
        suggestedPolicies: []
      };

      const context: SearchContext = { repo: 'test-repo' };
      const decision = customPolicyGate.evaluate(intent, context);

      // Should merge seed weights
      assert.strictEqual(decision.seedWeights.custom, 2.0);
      assert(decision.seedWeights.definition); // Should keep default weights
    });
  });
});