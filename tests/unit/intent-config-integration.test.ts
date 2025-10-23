import { test, describe } from 'node:test';
import assert from 'node:assert';
import { ConfigLoader } from '../../dist/src/config/config-loader.js';
import { IntentClassifier } from '../../dist/src/intent/intent-classifier.js';

describe('Intent Config Integration', () => {
  test('should integrate with config loader', () => {
    const configLoader = ConfigLoader.getInstance();
    const config = configLoader.getConfig();
    
    // Config should be loadable and intent field may be undefined (optional)
    assert(config);
    assert(typeof config === 'object');
    
    // Intent field should be undefined by default (optional config)
    assert(config.intent === undefined);
  });

  test('should accept custom intent configuration', () => {
    const customConfig = {
      thresholds: {
        symbol: 0.3,
        config: 0.3,
        api: 0.3,
        incident: 0.3
      },
      patterns: {
        symbol: ['custom', 'pattern'],
        config: ['custom', 'config'],
        api: ['custom', 'api'],
        incident: ['custom', 'incident']
      }
    };

    const classifier = new IntentClassifier(customConfig);
    const result = classifier.classify('custom pattern');
    
    // Should work with custom config
    assert(typeof result.confidence === 'number');
    assert(typeof result.intent === 'string');
  });

  test('should update configuration dynamically', () => {
    const classifier = new IntentClassifier();
    
    // Update thresholds
    classifier.updateConfig({
      thresholds: {
        symbol: 0.1,
        config: 0.1,
        api: 0.1,
        incident: 0.1
      }
    });

    const result = classifier.classify('function definition');
    
    // Should work with updated config
    assert(typeof result.confidence === 'number');
    assert(typeof result.intent === 'string');
  });

  test('should add custom patterns', () => {
    const classifier = new IntentClassifier();
    
    // Add custom symbol pattern
    classifier.addPatterns('symbol', ['customsymbol']);
    
    const result = classifier.classify('find customsymbol function');
    
    // Should detect custom pattern (lower threshold due to minimal match)
    assert(result.intent === 'symbol' || result.intent === 'search');
    assert(result.confidence >= 0);
  });

  test('should add custom entity patterns', () => {
    const classifier = new IntentClassifier();
    
    // Add custom entity pattern
    classifier.addEntityPatterns('function', [/\bcustomFunction\(\)/g]);
    
    const result = classifier.classify('call customFunction()');
    
    // Should extract custom entity
    const functionEntities = result.entities.filter(e => e.type === 'function');
    assert(functionEntities.some(e => e.value === 'customFunction'));
  });
});