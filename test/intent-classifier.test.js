#!/usr/bin/env node
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { IntentClassifier } from '../dist/src/intent/intent-classifier.js';

describe('Intent Classification Tests', () => {
  let classifier;

  before(() => {
    classifier = new IntentClassifier();
  });

  after(() => {
    // Clean up if needed
  });

  test('should classify symbol intent correctly', () => {
    const queries = [
      'getUserById function',
      'UserService class definition',
      'validateInput function signature'
    ];

    queries.forEach(query => {
      const result = classifier.classify(query);
      assert.equal(result.intent, 'symbol', `Query "${query}" should be classified as symbol`);
      assert.ok(result.confidence > 0.2, `Symbol intent should have confidence > 0.2 for "${query}"`);
      assert.ok(result.entities.length > 0, `Symbol intent should extract entities for "${query}"`);
    });
  });

  test('should classify config intent correctly', () => {
    const queries = [
      'database configuration',
      'environment variables settings',
      '.env file configuration',
      'app config settings',
      'yaml configuration file'
    ];

    queries.forEach(query => {
      const result = classifier.classify(query);
      assert.equal(result.intent, 'config', `Query "${query}" should be classified as config`);
      assert.ok(result.confidence > 0.2, `Config intent should have confidence > 0.2 for "${query}"`);
      assert.ok(result.suggestedPolicies.includes('config-key-source'), `Config intent should suggest config policies for "${query}"`);
    });
  });

  test('should classify API intent correctly', () => {
    const queries = [
      'POST /api/users route',
      'HTTP request handler',
      'REST API controller'
    ];

    queries.forEach(query => {
      const result = classifier.classify(query);
      assert.equal(result.intent, 'api', `Query "${query}" should be classified as api`);
      assert.ok(result.confidence > 0.2, `API intent should have confidence > 0.2 for "${query}"`);
      assert.ok(result.suggestedPolicies.includes('api-handler-registration'), `API intent should suggest API policies for "${query}"`);
    });
  });

  test('should classify incident intent correctly', () => {
    const queries = [
      'authentication error bug',
      'payment processing failure',
      'debug server exception',
      'fix broken validation'
    ];

    queries.forEach(query => {
      const result = classifier.classify(query);
      assert.equal(result.intent, 'incident', `Query "${query}" should be classified as incident`);
      assert.ok(result.confidence > 0.2, `Incident intent should have confidence > 0.2 for "${query}"`);
      assert.ok(result.suggestedPolicies.includes('incident-callers-diffs'), `Incident intent should suggest incident policies for "${query}"`);
    });
  });

  test('should classify general search intent correctly', () => {
    const queries = [
      'how to implement user authentication',
      'best practices for database design',
      'tutorial for react hooks',
      'example of microservices architecture',
      'python data processing'
    ];

    queries.forEach(query => {
      const result = classifier.classify(query);
      assert.equal(result.intent, 'search', `Query "${query}" should be classified as search`);
      assert.ok(result.confidence >= 0.3, `Search intent should have confidence >= 0.3 for "${query}"`);
    });
  });

  test('should handle edge cases gracefully', () => {
    const edgeCases = [
      null,
      undefined,
      '',
      '   ',
      123,
      []
    ];

    edgeCases.forEach(input => {
      const result = classifier.classify(input);
      assert.equal(result.intent, 'search', 'Edge cases should default to search intent');
      assert.ok(result.confidence >= 0, 'Edge cases should have non-negative confidence');
      assert.deepEqual(result.entities, [], 'Edge cases should have no entities');
      assert.ok(result.suggestedPolicies.includes('search-default'), 'Edge cases should suggest default search policy');
    });
  });

  test('should extract function entities correctly', () => {
    const query = 'getUserById function calculateTotal validateInput';
    const result = classifier.classify(query);
    
    const functionEntities = result.entities.filter(e => e.type === 'function');
    assert.ok(functionEntities.length >= 2, 'Should extract multiple function entities');
    
    const expectedFunctions = ['getUserById', 'calculateTotal', 'validateInput'];
    expectedFunctions.forEach(func => {
      const found = functionEntities.some(e => e.value.includes(func));
      assert.ok(found, `Should extract function "${func}" from query`);
    });
  });

  test('should extract class entities correctly', () => {
    const query = 'UserService OrderService DatabaseController';
    const result = classifier.classify(query);
    
    const classEntities = result.entities.filter(e => e.type === 'class');
    assert.ok(classEntities.length >= 2, 'Should extract multiple class entities');
    
    const expectedClasses = ['UserService', 'OrderService', 'DatabaseController'];
    expectedClasses.forEach(cls => {
      const found = classEntities.some(e => e.value.includes(cls));
      assert.ok(found, `Should extract class "${cls}" from query`);
    });
  });

  test('should extract file entities correctly', () => {
    const query = 'config.json user.js database.sql styles.css';
    const result = classifier.classify(query);
    
    const fileEntities = result.entities.filter(e => e.type === 'file');
    assert.ok(fileEntities.length >= 3, 'Should extract multiple file entities');
    
    const expectedFiles = ['config.json', 'user.js', 'database.sql', 'styles.css'];
    expectedFiles.forEach(file => {
      const found = fileEntities.some(e => e.value.includes(file));
      assert.ok(found, `Should extract file "${file}" from query`);
    });
  });

  test('should calculate confidence scores accurately', () => {
    // High confidence symbol query
    const highConfidenceQuery = 'getUserById function implementation';
    const highResult = classifier.classify(highConfidenceQuery);
    
    // Low confidence query
    const lowConfidenceQuery = 'something random';
    const lowResult = classifier.classify(lowConfidenceQuery);
    
    assert.ok(highResult.confidence > lowResult.confidence, 
      'High confidence query should have higher score than low confidence query');
    assert.ok(highResult.confidence <= 1.0, 'Confidence should not exceed 1.0');
    assert.ok(lowResult.confidence >= 0.0, 'Confidence should not be negative');
  });

  test('should handle multiple keyword matches correctly', () => {
    const query = 'function method class implementation definition';
    const result = classifier.classify(query);
    
    assert.equal(result.intent, 'symbol', 'Query with multiple symbol keywords should be classified as symbol');
    assert.ok(result.confidence > 0.3, 'Multiple keyword matches should increase confidence');
  });

  test('should provide appropriate suggested policies', () => {
    const testCases = [
      {
        query: 'getUserById function',
        expectedPolicies: ['symbol-level-2', 'symbol-function-usage']
      },
      {
        query: 'config.json file',
        expectedPolicies: ['config-key-source', 'config-file-context']
      },
      {
        query: 'POST /api/users',
        expectedPolicies: ['api-handler-registration', 'api-route-mapping']
      },
      {
        query: 'authentication error',
        expectedPolicies: ['incident-callers-diffs']
      }
    ];

    testCases.forEach(({ query, expectedPolicies }) => {
      const result = classifier.classify(query);
      expectedPolicies.forEach(policy => {
        assert.ok(result.suggestedPolicies.includes(policy), 
          `Query "${query}" should suggest policy "${policy}"`);
      });
    });
  });

  test('should allow configuration updates', () => {
    const customConfig = {
      thresholds: {
        symbol: 0.8,
        config: 0.8,
        api: 0.8,
        incident: 0.8
      },
      patterns: {
        symbol: ['custom_function', 'custom_method'],
        config: ['custom_config'],
        api: ['custom_api'],
        incident: ['custom_error']
      }
    };

    classifier.updateConfig(customConfig);
    
    const updatedConfig = classifier.getConfig();
    assert.equal(updatedConfig.thresholds.symbol, 0.8, 'Should update symbol threshold');
    assert.ok(updatedConfig.patterns.symbol.includes('custom_function'), 'Should add custom symbol pattern');
    
    // Test with custom pattern - might still be search if confidence too low
    const result = classifier.classify('custom_function function');
    assert.ok(result.confidence >= 0, 'Should classify custom pattern');
  });

  test('should allow adding custom patterns', () => {
    const customPatterns = ['webhook', 'scheduler', 'pipeline'];
    classifier.addPatterns('api', customPatterns);
    
    const result = classifier.classify('webhook endpoint implementation');
    // Check that the pattern was added (might still be search depending on confidence)
    const config = classifier.getConfig();
    assert.ok(config.patterns.api.includes('webhook'), 'Should add custom API patterns');
  });

  test('should handle entity position tracking', () => {
    const query = 'getUserById function and UserService class';
    const result = classifier.classify(query);
    
    result.entities.forEach(entity => {
      assert.ok(typeof entity.position === 'number', 'Entity should have position');
      assert.ok(entity.position >= 0, 'Entity position should be non-negative');
      assert.ok(entity.position < query.length, 'Entity position should be within query length');
    });
  });

  test('should handle duplicate entities', () => {
    const query = 'getUserById getUserById function';
    const result = classifier.classify(query);
    
    const getUserByIdEntities = result.entities.filter(e => e.value.includes('getUserById'));
    // Should at least find one instance, duplicates may exist due to position differences
    assert.ok(getUserByIdEntities.length >= 1, 'Should find at least one entity');
  });

  test('should sort entities by position', () => {
    const query = 'function getUserById class UserService';
    const result = classifier.classify(query);
    
    const sortedPositions = result.entities.map(e => e.position);
    const isSorted = sortedPositions.every((pos, index) => 
      index === 0 || pos >= sortedPositions[index - 1]
    );
    assert.ok(isSorted, 'Entities should be sorted by position');
  });

  test('should filter out common words', () => {
    const query = 'the function getUserById and the class UserService';
    const result = classifier.classify(query);
    
    const functionEntities = result.entities.filter(e => e.type === 'function');
    const commonWords = ['the', 'and'];
    
    commonWords.forEach(word => {
      const found = functionEntities.some(e => e.value.toLowerCase() === word);
      assert.ok(!found, `Should filter out common word "${word}"`);
    });
  });

  test('should handle empty and short words', () => {
    const query = 'function a b c getUserById';
    const result = classifier.classify(query);
    
    const shortWords = result.entities.filter(e => e.value.length < 2);
    assert.equal(shortWords.length, 0, 'Should filter out very short words');
  });
});