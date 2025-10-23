import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import { PolicyGate } from '../../dist/policy/policy-gate.js';
import { IntentClassifier } from '../../dist/src/intent/intent-classifier.js';
import type { SearchContext } from '../../dist/policy/policy-gate.d.ts';

describe('PolicyGate and IntentClassifier Integration', () => {
  let policyGate: PolicyGate;
  let intentClassifier: IntentClassifier;

  beforeEach(() => {
    policyGate = new PolicyGate();
    intentClassifier = new IntentClassifier();
  });

  describe('End-to-End Intent to Policy Flow', () => {
    test('should classify symbol query and apply appropriate policy', () => {
      const query = 'find the getUserById function definition';
      const intent = intentClassifier.classify(query);
      const context: SearchContext = { 
        repo: 'test-repo',
        language: 'typescript'
      };
      const policy = policyGate.evaluate(intent, context);

      assert.strictEqual(intent.intent, 'symbol');
      assert(intent.confidence > 0.5);
      
      assert.strictEqual(policy.includeSymbols, true);
      assert.strictEqual(policy.includeFiles, false);
      assert.strictEqual(policy.includeContent, true);
      assert(policy.maxDepth >= 1);
      assert(policy.earlyStopThreshold >= 2);
    });

    test('should classify config query and apply appropriate policy', () => {
      const query = 'database connection configuration settings';
      const intent = intentClassifier.classify(query);
      const context: SearchContext = { 
        repo: 'backend-service',
        language: 'javascript'
      };
      const policy = policyGate.evaluate(intent, context);

      assert.strictEqual(intent.intent, 'config');
      assert(intent.confidence > 0.5);
      
      assert.strictEqual(policy.includeSymbols, false);
      assert.strictEqual(policy.includeFiles, true);
      assert.strictEqual(policy.includeContent, true);
      assert(policy.maxDepth <= 3); // Allow for confidence adjustment
      assert(policy.earlyStopThreshold <= 4); // Allow for confidence adjustment
    });

    test('should classify API query and apply appropriate policy', () => {
      const query = 'REST endpoint handler for user authentication';
      const intent = intentClassifier.classify(query);
      const context: SearchContext = { 
        repo: 'api-server',
        language: 'typescript'
      };
      const policy = policyGate.evaluate(intent, context);

      assert.strictEqual(intent.intent, 'api');
      assert(intent.confidence > 0.3);
      
      assert.strictEqual(policy.includeSymbols, true);
      assert.strictEqual(policy.includeFiles, false);
      assert.strictEqual(policy.includeContent, true);
      assert(policy.seedWeights.handler > 1.0);
    });

    test('should classify incident query and apply appropriate policy', () => {
      const query = 'debug the crash error bug in authentication';
      const intent = intentClassifier.classify(query);
      const context: SearchContext = { 
        repo: 'auth-service',
        language: 'python',
        budget: 3000
      };
      const policy = policyGate.evaluate(intent, context);

      assert.strictEqual(intent.intent, 'incident');
      assert(intent.confidence > 0.5);
      
      assert.strictEqual(policy.includeSymbols, true);
      assert.strictEqual(policy.includeFiles, true);
      assert.strictEqual(policy.includeContent, true);
      assert(policy.maxDepth >= 2);
      assert(policy.earlyStopThreshold >= 4);
    });

    test('should handle low confidence queries with conservative policies', () => {
      const query = 'how to implement user management';
      const intent = intentClassifier.classify(query);
      const context: SearchContext = { 
        repo: 'general-app',
        language: 'java'
      };
      const policy = policyGate.evaluate(intent, context);

      assert.strictEqual(intent.intent, 'search');
      assert(intent.confidence <= 0.5);
      
      // Should be more conservative due to low confidence
      assert(policy.maxDepth <= 2);
      assert(policy.earlyStopThreshold <= 10);
    });

    test('should adjust policies based on query context', () => {
      const shortQuery = 'getUserById';
      const longQuery = 'getUserById function that retrieves user information from the database based on their unique identifier';
      
      const shortIntent = intentClassifier.classify(shortQuery);
      const longIntent = intentClassifier.classify(longQuery);
      
      const shortPolicy = policyGate.evaluate(shortIntent, { queryLength: shortQuery.length });
      const longPolicy = policyGate.evaluate(longIntent, { queryLength: longQuery.length });

      // Short queries should get broader search
      assert(shortPolicy.maxDepth >= longPolicy.maxDepth);
    });

    test('should apply repository-specific policies when configured', () => {
      const repoPolicies = {
        'special-repo': {
          symbol: {
            maxDepth: 5,
            includeSymbols: true,
            includeFiles: false,
            includeContent: true,
            earlyStopThreshold: 10,
            seedWeights: { 'custom': 3.0 }
          }
        }
      };

      const customPolicyGate = new PolicyGate(repoPolicies);
      
      const query = 'UserService class implementation';
      const intent = intentClassifier.classify(query);
      const context: SearchContext = { repo: 'special-repo' };
      const policy = customPolicyGate.evaluate(intent, context);

      // Repository policy should be applied, but may be adjusted by confidence
      assert(policy.maxDepth >= 4); // Original 5, possibly adjusted by confidence
      assert(policy.earlyStopThreshold >= 8); // Original 10, possibly adjusted
      assert.strictEqual(policy.seedWeights.custom, 3.0);
    });
  });

  describe('Policy Decision Validation', () => {
    test('should produce valid policy decisions for all intent types', () => {
      const testQueries = [
        'function definition', // symbol
        'config settings', // config
        'API endpoint', // api
        'error bug crash', // incident
        'general search query' // search
      ];

      for (const query of testQueries) {
        const intent = intentClassifier.classify(query);
        const policy = policyGate.evaluate(intent);
        
        // Validate policy structure
        assert(typeof policy.maxDepth === 'number' && policy.maxDepth > 0);
        assert(typeof policy.includeSymbols === 'boolean');
        assert(typeof policy.includeFiles === 'boolean');
        assert(typeof policy.includeContent === 'boolean');
        assert(typeof policy.earlyStopThreshold === 'number' && policy.earlyStopThreshold > 0);
        assert(typeof policy.seedWeights === 'object' && policy.seedWeights !== null);
      }
    });

    test('should maintain consistency across multiple evaluations', () => {
      const query = 'getUserById function';
      const intent = intentClassifier.classify(query);
      const context: SearchContext = { 
        repo: 'test-repo',
        language: 'typescript'
      };

      // Multiple evaluations should produce consistent results
      const policy1 = policyGate.evaluate(intent, context);
      const policy2 = policyGate.evaluate(intent, context);
      const policy3 = policyGate.evaluate(intent, context);

      assert.deepStrictEqual(policy1, policy2);
      assert.deepStrictEqual(policy2, policy3);
    });

    test('should handle edge cases gracefully', () => {
      const edgeCases = [
        '', // empty query
        null as any, // null query
        undefined as any, // undefined query
        '   ', // whitespace only
        'a', // single character
        'very long query that exceeds normal length limits and contains many words that might affect policy decisions in unexpected ways'
      ];

      for (const query of edgeCases) {
        const intent = intentClassifier.classify(query);
        const policy = policyGate.evaluate(intent);
        
        // Should always produce a valid policy
        assert(typeof policy.maxDepth === 'number');
        assert(typeof policy.includeSymbols === 'boolean');
        assert(typeof policy.includeFiles === 'boolean');
        assert(typeof policy.includeContent === 'boolean');
        assert(typeof policy.earlyStopThreshold === 'number');
        assert(typeof policy.seedWeights === 'object');
      }
    });
  });
});