#!/usr/bin/env node
import { test, mock, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { IntentClassifier, type IntentResult, type QueryEntity } from '../src/intent/intent-classifier.js';

describe('Intent Classification Tests', () => {
  let classifier: IntentClassifier;

  before(() => {
    classifier = new IntentClassifier();
  });

  after(() => {
    // Clean up if needed
  });

  test('should classify symbol intent correctly', () => {
    const queries = [
      'getUserById function',
      'calculateTotal method',
      'UserService class definition',
      'authenticate implementation',
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
      'user authentication endpoint',
      'POST /api/users route',
      'HTTP request handler',
      'REST API controller',
      'middleware function'
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
      'database connection crash',
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
      123 as any,
      []
    ];

    edgeCases.forEach(input => {
      const result = classifier.classify(input);
      assert.equal(result.intent, 'search', 'Edge cases should default to search intent');
      assert.equal(result.confidence, 0, 'Edge cases should have zero confidence');
      assert.deepEqual(result.entities, [], 'Edge cases should have no entities');
      assert.deepEqual(result.suggestedPolicies, ['search-default'], 'Edge cases should suggest default search policy');
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

  test('should extract config file entities correctly', () => {
    const query = '.env config.ini settings.yaml app.properties';
    const result = classifier.classify(query);
    
    const configEntities = result.entities.filter(e => e.type === 'config');
    assert.ok(configEntities.length >= 2, 'Should extract multiple config entities');
    
    const expectedConfigs = ['.env', 'config.ini', 'settings.yaml', 'app.properties'];
    expectedConfigs.forEach(config => {
      const found = configEntities.some(e => e.value.includes(config));
      assert.ok(found, `Should extract config file "${config}" from query`);
    });
  });

  test('should extract route entities correctly', () => {
    const query = 'GET /api/users POST /auth/login DELETE /admin/users';
    const result = classifier.classify(query);
    
    const routeEntities = result.entities.filter(e => e.type === 'route');
    assert.ok(routeEntities.length >= 2, 'Should extract multiple route entities');
    
    const expectedRoutes = ['/api/users', '/auth/login', '/admin/users'];
    expectedRoutes.forEach(route => {
      const found = routeEntities.some(e => e.value.includes(route));
      assert.ok(found, `Should extract route "${route}" from query`);
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
        query: 'UserService class',
        expectedPolicies: ['symbol-level-2', 'symbol-class-members']
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
        expectedPolicies: ['incident-callers-diffs', 'incident-function-context']
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
    
    // Test with custom pattern
    const result = classifier.classify('custom_function implementation');
    assert.equal(result.intent, 'symbol', 'Should use custom pattern for classification');
  });

  test('should allow adding custom patterns', () => {
    const customPatterns = ['webhook', 'scheduler', 'pipeline'];
    classifier.addPatterns('api', customPatterns);
    
    const result = classifier.classify('webhook endpoint implementation');
    assert.equal(result.intent, 'api', 'Should use custom API patterns');
  });

  test('should allow adding custom entity patterns', () => {
    const customEntityPatterns = [/\b(webhook|scheduler|pipeline)\b/gi];
    classifier.addEntityPatterns('function', customEntityPatterns);
    
    const result = classifier.classify('webhook function');
    const functionEntities = result.entities.filter(e => e.type === 'function');
    const webhookEntity = functionEntities.find(e => e.value.includes('webhook'));
    assert.ok(webhookEntity, 'Should extract custom entity pattern');
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

  test('should remove duplicate entities', () => {
    const query = 'getUserById getUserById function';
    const result = classifier.classify(query);
    
    const getUserByIdEntities = result.entities.filter(e => e.value.includes('getUserById'));
    assert.equal(getUserByIdEntities.length, 1, 'Should remove duplicate entities');
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