/**
 * Comprehensive Tests for Degrade Policy System
 * 
 * Tests progressive degradation levels (1-4 + emergency),
 * capsule creation for different content types, quality metrics,
 * validation, and integration with tokenizer factory.
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { 
  DegradePolicyEngine, 
  CapsuleCreator, 
  ProgressiveDegradationEngine,
  DEFAULT_CAPSULE_CONFIG,
  MODEL_DEGRADE_POLICIES,
  DEFAULT_THRESHOLDS,
  DEFAULT_STRATEGIES
} from '../src/tokenization/degrade-policy.js';

// Mock tokenizer for testing
class MockTokenizer {
  countTokens(text) {
    if (!text || typeof text !== 'string') return 0;
    // Simple mock: ~4 characters per token
    return Math.ceil(text.length / 4);
  }
  
  estimateTokens(text) {
    return this.countTokens(text);
  }
  
  getModel() {
    return 'gpt-4';
  }
  
  getContextSize() {
    return 8192;
  }
}

// Test data
const createTestSearchResult = (id, content, path, spanKind, score) => ({
  id,
  content,
  path,
  spanKind,
  score,
  metadata: {}
});

const sampleCode = `
export class UserService {
  private users: User[] = [];
  
  constructor(private database: Database) {}
  
  // Get user by ID
  async getUser(id: string): Promise<User | null> {
    try {
      const user = await this.database.findById(id);
      return user;
    } catch (error) {
      console.error('Failed to get user:', error);
      return null;
    }
  }
  
  // Create new user
  async createUser(userData: CreateUserDto): Promise<User> {
    const user = new User(userData);
    await this.database.save(user);
    return user;
  }
  
  private validateUser(userData: CreateUserDto): boolean {
    return userData.email && userData.name;
  }
}
`;

const sampleTest = `
describe('UserService', () => {
  let userService: UserService;
  let mockDatabase: jest.Mocked<Database>;
  
  beforeEach(() => {
    mockDatabase = createMockDatabase();
    userService = new UserService(mockDatabase);
  });
  
  it('should get user by ID', async () => {
    const userId = '123';
    const expectedUser = { id: userId, name: 'John Doe', email: 'john@example.com' };
    
    mockDatabase.findById.mockResolvedValue(expectedUser);
    
    const result = await userService.getUser(userId);
    
    expect(result).toEqual(expectedUser);
    expect(mockDatabase.findById).toHaveBeenCalledWith(userId);
  });
  
  it('should return null when user not found', async () => {
    mockDatabase.findById.mockResolvedValue(null);
    
    const result = await userService.getUser('nonexistent');
    
    expect(result).toBeNull();
  });
  
  it('should create new user', async () => {
    const userData = { name: 'Jane Doe', email: 'jane@example.com' };
    const expectedUser = { id: '456', ...userData };
    
    mockDatabase.save.mockResolvedValue(expectedUser);
    
    const result = await userService.createUser(userData);
    
    expect(result).toEqual(expectedUser);
    expect(mockDatabase.save).toHaveBeenCalled();
  });
});
`;

const sampleDocumentation = `
# User Service API

## Overview
The UserService provides comprehensive user management functionality including CRUD operations, authentication, and profile management.

## Methods

### getUser(id: string): Promise<User | null>
Retrieves a user by their unique identifier.

**Parameters:**
- \`id\` - The unique identifier of the user

**Returns:**
- Promise resolving to User object or null if not found

**Example:**
\`\`\`typescript
const user = await userService.getUser('123');
if (user) {
  console.log(\`Found user: \${user.name}\`);
}
\`\`\`

### createUser(userData: CreateUserDto): Promise<User>
Creates a new user with the provided data.

**Parameters:**
- \`userData\` - User creation data including name and email

**Returns:**
- Promise resolving to the created User object

## Error Handling
All methods include proper error handling and logging. Database errors are caught and appropriate null values or default responses are returned.
`;

describe('DegradePolicyEngine', () => {
  let engine, tokenizer;

  beforeEach(() => {
    engine = new DegradePolicyEngine();
    tokenizer = new MockTokenizer();
  });

  afterEach(() => {
    engine.clearCache();
  });

  describe('Policy Management', () => {
    test('should get policy for model', () => {
      const policy = engine.getPolicyForModel('gpt-4');
      
      assert.ok(policy);
      assert.ok(policy.name.includes('gpt-4'));
      assert.ok(policy.thresholds);
      assert.ok(policy.strategies);
      assert.ok(policy.capsuleConfig);
    });

    test('should create custom policy', () => {
      const customPolicy = engine.createCustomPolicy(
        'Test Policy',
        'A test policy for unit testing',
        {
          thresholds: {
            level1: 0.95,
            level2: 0.85,
            level3: 0.75,
            level4: 0.65,
            emergency: 0.55
          }
        }
      );

      assert.strictEqual(customPolicy.name, 'Test Policy');
      assert.strictEqual(customPolicy.thresholds.level1, 0.95);
      assert.strictEqual(engine.getPolicy(customPolicy.id), customPolicy);
    });

    test('should update existing policy', () => {
      const policy = engine.getPolicyForModel('gpt-4');
      const originalThreshold = policy.thresholds.level1;
      
      const updated = engine.updatePolicy(policy.id, {
        thresholds: {
          ...policy.thresholds,
          level1: 0.95
        }
      });

      assert.strictEqual(updated.thresholds.level1, 0.95);
      assert.notStrictEqual(updated.thresholds.level1, originalThreshold);
    });

    test('should delete policy', () => {
      const policy = engine.createCustomPolicy('Temp Policy', 'Temporary');
      const deleted = engine.deletePolicy(policy.id);
      
      assert.strictEqual(deleted, true);
      assert.strictEqual(engine.getPolicy(policy.id), undefined);
    });

    test('should get all policies', () => {
      const policies = engine.getAllPolicies();
      
      assert.ok(policies.length > 0);
      assert.ok(policies.some(p => p.name.includes('gpt-4')));
    });
  });

  describe('Degradation Application', () => {
    test('should apply no degradation when under budget', async () => {
      const items = [
        createTestSearchResult('1', 'short content', 'test.js', 'function', 0.9)
      ];
      const budget = 1000;
      const policy = engine.getPolicyForModel('gpt-4');

      const result = await engine.applyDegradePolicy(items, budget, policy, tokenizer);

      assert.deepStrictEqual(result.degraded, items);
      assert.strictEqual(result.applied.level, 0);
      assert.strictEqual(result.savings.savingsPercentage, 0);
    });

    test('should apply level 1 degradation when slightly over budget', async () => {
      const items = [
        createTestSearchResult('1', sampleCode, 'UserService.js', 'class', 0.9),
        createTestSearchResult('2', sampleTest, 'UserService.test.js', 'test', 0.8),
        createTestSearchResult('3', sampleDocumentation, 'UserService.md', 'comment', 0.7)
      ];
      const budget = 200; // Small budget to force degradation
      const policy = engine.getPolicyForModel('gpt-4');

      const result = await engine.applyDegradePolicy(items, budget, policy, tokenizer);

      assert.ok(result.degraded.length <= items.length);
      assert.ok(result.applied.level > 0);
      assert.ok(result.savings.savingsPercentage > 0);
      assert.ok(result.performance.degradationTime > 0);
    });

    test('should create capsules at higher degradation levels', async () => {
      const items = [
        createTestSearchResult('1', sampleCode, 'UserService.js', 'class', 0.9),
        createTestSearchResult('2', sampleTest, 'UserService.test.js', 'test', 0.8)
      ];
      const budget = 100; // Very small budget
      const policy = engine.getPolicyForModel('gpt-4');

      const result = await engine.applyDegradePolicy(items, budget, policy, tokenizer);

      assert.ok(result.applied.capsulesCreated > 0);
      assert.ok(result.applied.strategy.includes('capsule'));
    });

    test('should estimate savings accurately', async () => {
      const items = [
        createTestSearchResult('1', sampleCode, 'UserService.js', 'class', 0.9),
        createTestSearchResult('2', sampleTest, 'UserService.test.js', 'test', 0.8)
      ];
      const policy = engine.getPolicyForModel('gpt-4');

      const savings = await engine.estimateSavings(items, policy, tokenizer);

      assert.ok(savings >= 0);
      assert.ok(savings <= 100);
    });
  });

  describe('Caching', () => {
    test('should cache degradation results', async () => {
      const items = [
        createTestSearchResult('1', sampleCode, 'UserService.js', 'class', 0.9)
      ];
      const budget = 200;
      const policy = engine.getPolicyForModel('gpt-4');

      // First call
      const result1 = await engine.applyDegradePolicy(items, budget, policy, tokenizer);
      
      // Second call should use cache
      const result2 = await engine.applyDegradePolicy(items, budget, policy, tokenizer);

      assert.deepStrictEqual(result1, result2);
    });

    test('should clear cache', () => {
      engine.clearCache();
      const stats = engine.getCacheStats();
      
      assert.strictEqual(stats.size, 0);
    });
  });
});

describe('CapsuleCreator', () => {
  let creator, tokenizer;

  beforeEach(() => {
    tokenizer = new MockTokenizer();
    creator = new CapsuleCreator(DEFAULT_CAPSULE_CONFIG, tokenizer);
  });

  describe('Code Capsules', () => {
    test('should create code capsule preserving signatures', async () => {
      const item = createTestSearchResult('1', sampleCode, 'UserService.js', 'class', 0.9);
      
      const capsule = await creator.createCapsule(item, 'code');

      assert.ok(capsule.content.includes('export class UserService'));
      assert.ok(capsule.content.includes('constructor'));
      assert.ok(capsule.content.includes('async getUser'));
      assert.ok(capsule.content.includes('async createUser'));
      assert.strictEqual(capsule.metadata.type, 'code');
      assert.ok(capsule.metadata.qualityScore > 0);
      assert.ok(capsule.metadata.compressionRatio < 1);
    });

    test('should respect max code length', async () => {
      const longCode = sampleCode.repeat(10); // Make it very long
      const item = createTestSearchResult('1', longCode, 'LongService.js', 'class', 0.9);
      
      const capsule = await creator.createCapsule(item, 'code');

      const capsuleTokens = tokenizer.countTokens(capsule.content);
      assert.ok(capsuleTokens <= DEFAULT_CAPSULE_CONFIG.maxCodeLength);
    });
  });

  describe('Test Capsules', () => {
    test('should create test capsule preserving test structure', async () => {
      const item = createTestSearchResult('1', sampleTest, 'UserService.test.js', 'test', 0.8);
      
      const capsule = await creator.createCapsule(item, 'test');

      assert.ok(capsule.content.includes('describe'));
      assert.ok(capsule.content.includes('it'));
      assert.ok(capsule.content.includes('expect'));
      assert.strictEqual(capsule.metadata.type, 'test');
      assert.ok(capsule.metadata.preservedElements.includes('test-signature'));
      assert.ok(capsule.metadata.preservedElements.includes('assertion'));
    });

    test('should preserve test descriptions', async () => {
      const item = createTestSearchResult('1', sampleTest, 'UserService.test.js', 'test', 0.8);
      
      const capsule = await creator.createCapsule(item, 'test');

      assert.ok(capsule.content.includes('should get user by ID'));
      assert.ok(capsule.content.includes('should return null when user not found'));
    });
  });

  describe('Documentation Capsules', () => {
    test('should create doc capsule preserving structure', async () => {
      const item = createTestSearchResult('1', sampleDocumentation, 'UserService.md', 'comment', 0.7);
      
      const capsule = await creator.createCapsule(item, 'doc');

      assert.ok(capsule.content.includes('# User Service API'));
      assert.ok(capsule.content.includes('## Overview'));
      assert.ok(capsule.content.includes('### getUser'));
      assert.strictEqual(capsule.metadata.type, 'doc');
      assert.ok(capsule.metadata.preservedElements.includes('header'));
    });

    test('should preserve code blocks in documentation', async () => {
      const item = createTestSearchResult('1', sampleDocumentation, 'UserService.md', 'comment', 0.7);
      
      const capsule = await creator.createCapsule(item, 'doc');

      assert.ok(capsule.content.includes('```typescript'));
    });
  });

  describe('Quality Assessment', () => {
    test('should calculate quality scores correctly', async () => {
      const codeItem = createTestSearchResult('1', sampleCode, 'UserService.js', 'class', 0.9);
      const testItem = createTestSearchResult('2', sampleTest, 'UserService.test.js', 'test', 0.8);
      
      const codeCapsule = await creator.createCapsule(codeItem, 'code');
      const testCapsule = await creator.createCapsule(testItem, 'test');

      assert.ok(codeCapsule.metadata.qualityScore > 0);
      assert.ok(codeCapsule.metadata.qualityScore <= 1);
      assert.ok(testCapsule.metadata.qualityScore > 0);
      assert.ok(testCapsule.metadata.qualityScore <= 1);
    });

    test('should fall back to minimal capsule for low quality', async () => {
      const lowQualityConfig = {
        ...DEFAULT_CAPSULE_CONFIG,
        qualityThreshold: 0.9 // Very high threshold
      };
      const lowQualityCreator = new CapsuleCreator(lowQualityConfig, tokenizer);
      
      const item = createTestSearchResult('1', 'very short', 'test.js', 'function', 0.1);
      
      const capsule = await lowQualityCreator.createCapsule(item, 'code');

      assert.ok(capsule.content.includes('// test.js - content compressed'));
    });
  });
});

describe('ProgressiveDegradationEngine', () => {
  let engine, tokenizer, policy;

  beforeEach(() => {
    tokenizer = new MockTokenizer();
    policy = MODEL_DEGRADE_POLICIES['gpt-4'];
    engine = new ProgressiveDegradationEngine(policy, tokenizer);
  });

  describe('Level 1 Degradation', () => {
    test('should remove low priority items', async () => {
      const items = [
        createTestSearchResult('1', sampleCode, 'UserService.js', 'class', 0.9),
        createTestSearchResult('2', 'low priority comment', 'comment.js', 'comment', 0.2),
        createTestSearchResult('3', sampleTest, 'UserService.test.js', 'test', 0.8)
      ];
      const budget = tokenizer.countTokens(sampleCode) + 100; // Just enough for high priority items

      const result = await engine.applyDegradation(items, budget);

      assert.ok(result.degraded.length < items.length);
      assert.strictEqual(result.applied.level, 1);
      assert.ok(result.degraded.some(item => item.id === '1')); // High priority kept
      assert.ok(result.degraded.some(item => item.id === '3')); // Medium priority kept
    });
  });

  describe('Level 2 Degradation', () => {
    test('should apply smart head-tail truncation', async () => {
      const longContent = sampleCode + '\n' + '// Many lines of code\n'.repeat(50) + sampleCode;
      const items = [
        createTestSearchResult('1', longContent, 'LongService.js', 'class', 0.9)
      ];
      const budget = tokenizer.countTokens(sampleCode) * 2; // Force truncation

      const result = await engine.applyDegradation(items, budget);

      assert.ok(result.degraded[0].content.includes('... [content omitted] ...'));
      assert.ok(result.applied.strategy.includes('head-tail'));
    });
  });

  describe('Level 3 Degradation', () => {
    test('should create capsule summaries', async () => {
      const items = [
        createTestSearchResult('1', sampleCode, 'UserService.js', 'class', 0.9),
        createTestSearchResult('2', sampleTest, 'UserService.test.js', 'test', 0.8)
      ];
      const budget = 150; // Small enough to force capsules

      const result = await engine.applyDegradation(items, budget);

      assert.ok(result.applied.capsulesCreated > 0);
      assert.ok(result.applied.strategy.includes('capsule'));
    });
  });

  describe('Emergency Degradation', () => {
    test('should fall back to titles only for extreme constraints', async () => {
      const items = [
        createTestSearchResult('1', sampleCode, 'UserService.js', 'class', 0.9),
        createTestSearchResult('2', sampleTest, 'UserService.test.js', 'test', 0.8),
        createTestSearchResult('3', sampleDocumentation, 'UserService.md', 'comment', 0.7)
      ];
      const budget = 50; // Extremely small budget

      const result = await engine.applyDegradation(items, budget);

      assert.strictEqual(result.applied.level, 5); // Emergency level
      assert.ok(result.degraded[0].content.includes('// '));
      assert.ok(tokenizer.countTokens(result.degraded[0].content) < 50);
    });
  });

  describe('Performance', () => {
    test('should complete degradation within reasonable time', async () => {
      const items = Array.from({ length: 100 }, (_, i) => 
        createTestSearchResult(`${i}`, sampleCode, `file${i}.js`, 'class', 0.8)
      );
      const budget = tokenizer.countTokens(sampleCode) * 10;

      const startTime = Date.now();
      const result = await engine.applyDegradation(items, budget);
      const endTime = Date.now();

      assert.ok(endTime - startTime < 5000); // Should complete within 5 seconds
      assert.ok(result.performance.totalTime > 0);
    });
  });

  describe('Quality Metrics', () => {
    test('should calculate overall quality score', async () => {
      const items = [
        createTestSearchResult('1', sampleCode, 'UserService.js', 'class', 0.9),
        createTestSearchResult('2', sampleTest, 'UserService.test.js', 'test', 0.8)
      ];
      const budget = 200;

      const result = await engine.applyDegradation(items, budget);

      assert.ok(result.applied.qualityScore >= 0);
      assert.ok(result.applied.qualityScore <= 1);
    });
  });
});

describe('Integration Tests', () => {
  test('should handle real-world scenario end-to-end', async () => {
    const engine = new DegradePolicyEngine();
    const tokenizer = new MockTokenizer();
    
    // Simulate real search results
    const searchResults = [
      createTestSearchResult('1', sampleCode, 'src/services/UserService.js', 'class', 0.95),
      createTestSearchResult('2', sampleTest, 'tests/services/UserService.test.js', 'test', 0.9),
      createTestSearchResult('3', sampleDocumentation, 'docs/UserService.md', 'comment', 0.8),
      createTestSearchResult('4', '// Low priority comment', 'src/utils/helpers.js', 'comment', 0.3),
      createTestSearchResult('5', sampleCode.repeat(2), 'src/services/LongService.js', 'class', 0.85)
    ];

    const budget = 500; // Moderate budget constraint
    const policy = engine.getPolicyForModel('gpt-4');

    const result = await engine.applyDegradePolicy(searchResults, budget, policy, tokenizer);

    // Verify degradation worked
    assert.ok(result.savings.originalTokens > result.savings.degradedTokens);
    assert.ok(result.savings.savingsPercentage > 0);
    assert.ok(result.applied.itemsProcessed > 0);
    
    // Verify quality is maintained
    assert.ok(result.applied.qualityScore > 0.3);
    
    // Verify performance is reasonable
    assert.ok(result.performance.totalTime < 2000);

    // Verify important content is prioritized
    const hasUserService = result.degraded.some(item => item.path.includes('UserService'));
    const hasTest = result.degraded.some(item => item.path.includes('.test.'));
    assert.ok(hasUserService || hasTest);
  });

  test('should adapt to different model capabilities', async () => {
    const engine = new DegradePolicyEngine();
    const tokenizer = new MockTokenizer();
    
    const items = [
      createTestSearchResult('1', sampleCode, 'UserService.js', 'class', 0.9),
      createTestSearchResult('2', sampleTest, 'UserService.test.js', 'test', 0.8)
    ];
    const budget = 200;

    // Test with GPT-3.5 (smaller context, more aggressive degradation)
    const gpt35Policy = engine.getPolicyForModel('gpt-3.5-turbo');
    const gpt35Result = await engine.applyDegradePolicy(items, budget, gpt35Policy, tokenizer);

    // Test with Claude-3 (larger context, less aggressive degradation)
    const claudePolicy = engine.getPolicyForModel('claude-3');
    const claudeResult = await engine.applyDegradePolicy(items, budget, claudePolicy, tokenizer);

    // Claude should preserve more content due to larger context window
    assert.ok(claudeResult.savings.degradedTokens >= gpt35Result.savings.degradedTokens);
    assert.ok(claudeResult.applied.qualityScore >= gpt35Result.applied.qualityScore);
  });
});

describe('Default Configurations', () => {
  test('should have valid default thresholds', () => {
    assert.ok(DEFAULT_THRESHOLDS.level1 > DEFAULT_THRESHOLDS.level2);
    assert.ok(DEFAULT_THRESHOLDS.level2 > DEFAULT_THRESHOLDS.level3);
    assert.ok(DEFAULT_THRESHOLDS.level3 > DEFAULT_THRESHOLDS.level4);
    assert.ok(DEFAULT_THRESHOLDS.level4 > DEFAULT_THRESHOLDS.emergency);
    
    // All thresholds should be between 0 and 1
    Object.values(DEFAULT_THRESHOLDS).forEach(threshold => {
      assert.ok(threshold > 0);
      assert.ok(threshold <= 1);
    });
  });

  test('should have valid default strategies', () => {
    assert.ok(DEFAULT_STRATEGIES.level1Strategy);
    assert.ok(DEFAULT_STRATEGIES.level2Strategy);
    assert.ok(DEFAULT_STRATEGIES.level3Strategy);
    assert.ok(DEFAULT_STRATEGIES.level4Strategy);
    assert.ok(DEFAULT_STRATEGIES.emergencyStrategy);
  });

  test('should have valid model policies', () => {
    Object.values(MODEL_DEGRADE_POLICIES).forEach(policy => {
      assert.ok(policy.thresholds);
      assert.ok(policy.strategies);
      assert.ok(policy.capsuleConfig);
      assert.ok(policy.modelCapabilities);
      
      // Validate capabilities
      assert.ok(policy.modelCapabilities.contextSize > 0);
      assert.ok(typeof policy.modelCapabilities.supportsCompression === 'boolean');
      assert.ok(policy.modelCapabilities.qualitySensitivity >= 0);
      assert.ok(policy.modelCapabilities.qualitySensitivity <= 1);
    });
  });
});

describe('Error Handling and Edge Cases', () => {
  test('should handle empty search results', async () => {
    const engine = new DegradePolicyEngine();
    const tokenizer = new MockTokenizer();
    const policy = engine.getPolicyForModel('gpt-4');

    const result = await engine.applyDegradePolicy([], 1000, policy, tokenizer);

    assert.strictEqual(result.degraded.length, 0);
    assert.strictEqual(result.savings.originalTokens, 0);
    assert.strictEqual(result.savings.degradedTokens, 0);
    assert.strictEqual(result.applied.level, 0);
  });

  test('should handle invalid search results', async () => {
    const engine = new DegradePolicyEngine();
    const tokenizer = new MockTokenizer();
    const policy = engine.getPolicyForModel('gpt-4');

    const invalidItems = [
      { id: '1', content: null, path: 'test.js' },
      { id: '2', content: undefined, path: 'test2.js' },
      { id: '3', content: '', path: 'test3.js' }
    ];

    const result = await engine.applyDegradePolicy(invalidItems, 1000, policy, tokenizer);

    assert.ok(result.degraded.length <= invalidItems.length);
    assert.ok(result.savings.originalTokens >= 0);
  });

  test('should handle zero budget', async () => {
    const engine = new DegradePolicyEngine();
    const tokenizer = new MockTokenizer();
    const policy = engine.getPolicyForModel('gpt-4');
    const items = [createTestSearchResult('1', sampleCode, 'test.js', 'function', 0.9)];

    const result = await engine.applyDegradePolicy(items, 0, policy, tokenizer);

    assert.strictEqual(result.applied.level, 5); // Emergency level
    assert.ok(result.savings.savingsPercentage > 0);
  });

  test('should handle very large budget', async () => {
    const engine = new DegradePolicyEngine();
    const tokenizer = new MockTokenizer();
    const policy = engine.getPolicyForModel('gpt-4');
    const items = [createTestSearchResult('1', sampleCode, 'test.js', 'function', 0.9)];

    const result = await engine.applyDegradePolicy(items, 1000000, policy, tokenizer);

    assert.strictEqual(result.applied.level, 0); // No degradation needed
    assert.deepStrictEqual(result.degraded, items);
  });
});