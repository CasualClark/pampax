/**
 * Tests for Degrade Policy System
 */

import { DegradePolicyEngine, CapsuleCreator, ProgressiveDegradationEngine } from '../src/tokenization/degrade-policy.js';
import { SearchResult } from '../src/tokenization/search-integration.js';
import { DEFAULT_CAPSULE_CONFIG, MODEL_DEGRADE_POLICIES } from '../src/tokenization/degrade-policy.js';

// Mock tokenizer for testing
class MockTokenizer {
  countTokens(text: string): number {
    // Simple mock: ~4 characters per token
    return Math.ceil(text.length / 4);
  }
  
  estimateTokens(text: string): number {
    return this.countTokens(text);
  }
  
  getModel(): string {
    return 'gpt-4';
  }
  
  getContextSize(): number {
    return 8192;
  }
}

// Test data
const createTestSearchResult = (id: string, content: string, path: string, spanKind?: string, score?: number): SearchResult => ({
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
  let engine: DegradePolicyEngine;
  let tokenizer: MockTokenizer;

  beforeEach(() => {
    engine = new DegradePolicyEngine();
    tokenizer = new MockTokenizer();
  });

  describe('Policy Management', () => {
    it('should get policy for model', () => {
      const policy = engine.getPolicyForModel('gpt-4');
      
      expect(policy).toBeDefined();
      expect(policy.name).toContain('gpt-4');
      expect(policy.thresholds).toBeDefined();
      expect(policy.strategies).toBeDefined();
      expect(policy.capsuleConfig).toBeDefined();
    });

    it('should create custom policy', () => {
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

      expect(customPolicy.name).toBe('Test Policy');
      expect(customPolicy.thresholds.level1).toBe(0.95);
      expect(engine.getPolicy(customPolicy.id)).toBe(customPolicy);
    });

    it('should update existing policy', () => {
      const policy = engine.getPolicyForModel('gpt-4');
      const originalThreshold = policy.thresholds.level1;
      
      const updated = engine.updatePolicy(policy.id, {
        thresholds: {
          ...policy.thresholds,
          level1: 0.95
        }
      });

      expect(updated.thresholds.level1).toBe(0.95);
      expect(updated.thresholds.level1).not.toBe(originalThreshold);
    });

    it('should delete policy', () => {
      const policy = engine.createCustomPolicy('Temp Policy', 'Temporary');
      const deleted = engine.deletePolicy(policy.id);
      
      expect(deleted).toBe(true);
      expect(engine.getPolicy(policy.id)).toBeUndefined();
    });

    it('should get all policies', () => {
      const policies = engine.getAllPolicies();
      
      expect(policies.length).toBeGreaterThan(0);
      expect(policies.some(p => p.name.includes('gpt-4'))).toBe(true);
    });
  });

  describe('Degradation Application', () => {
    it('should apply no degradation when under budget', async () => {
      const items = [
        createTestSearchResult('1', 'short content', 'test.js', 'function', 0.9)
      ];
      const budget = 1000;
      const policy = engine.getPolicyForModel('gpt-4');

      const result = await engine.applyDegradePolicy(items, budget, policy, tokenizer);

      expect(result.degraded).toEqual(items);
      expect(result.applied.level).toBe(0);
      expect(result.savings.savingsPercentage).toBe(0);
    });

    it('should apply level 1 degradation when slightly over budget', async () => {
      const items = [
        createTestSearchResult('1', sampleCode, 'UserService.js', 'class', 0.9),
        createTestSearchResult('2', sampleTest, 'UserService.test.js', 'test', 0.8),
        createTestSearchResult('3', sampleDocumentation, 'UserService.md', 'comment', 0.7)
      ];
      const budget = 200; // Small budget to force degradation
      const policy = engine.getPolicyForModel('gpt-4');

      const result = await engine.applyDegradePolicy(items, budget, policy, tokenizer);

      expect(result.degraded.length).toBeLessThanOrEqual(items.length);
      expect(result.applied.level).toBeGreaterThan(0);
      expect(result.savings.savingsPercentage).toBeGreaterThan(0);
      expect(result.performance.degradationTime).toBeGreaterThan(0);
    });

    it('should create capsules at higher degradation levels', async () => {
      const items = [
        createTestSearchResult('1', sampleCode, 'UserService.js', 'class', 0.9),
        createTestSearchResult('2', sampleTest, 'UserService.test.js', 'test', 0.8)
      ];
      const budget = 100; // Very small budget
      const policy = engine.getPolicyForModel('gpt-4');

      const result = await engine.applyDegradePolicy(items, budget, policy, tokenizer);

      expect(result.applied.capsulesCreated).toBeGreaterThan(0);
      expect(result.applied.strategy).toContain('capsule');
    });

    it('should estimate savings accurately', async () => {
      const items = [
        createTestSearchResult('1', sampleCode, 'UserService.js', 'class', 0.9),
        createTestSearchResult('2', sampleTest, 'UserService.test.js', 'test', 0.8)
      ];
      const policy = engine.getPolicyForModel('gpt-4');

      const savings = await engine.estimateSavings(items, policy, tokenizer);

      expect(savings).toBeGreaterThanOrEqual(0);
      expect(savings).toBeLessThanOrEqual(100);
    });
  });

  describe('Caching', () => {
    it('should cache degradation results', async () => {
      const items = [
        createTestSearchResult('1', sampleCode, 'UserService.js', 'class', 0.9)
      ];
      const budget = 200;
      const policy = engine.getPolicyForModel('gpt-4');

      // First call
      const result1 = await engine.applyDegradePolicy(items, budget, policy, tokenizer);
      
      // Second call should use cache
      const result2 = await engine.applyDegradePolicy(items, budget, policy, tokenizer);

      expect(result1).toEqual(result2);
    });

    it('should clear cache', () => {
      engine.clearCache();
      const stats = engine.getCacheStats();
      
      expect(stats.size).toBe(0);
    });
  });
});

describe('CapsuleCreator', () => {
  let creator: CapsuleCreator;
  let tokenizer: MockTokenizer;

  beforeEach(() => {
    tokenizer = new MockTokenizer();
    creator = new CapsuleCreator(DEFAULT_CAPSULE_CONFIG, tokenizer);
  });

  describe('Code Capsules', () => {
    it('should create code capsule preserving signatures', async () => {
      const item = createTestSearchResult('1', sampleCode, 'UserService.js', 'class', 0.9);
      
      const capsule = await creator.createCapsule(item, 'code');

      expect(capsule.content).toContain('export class UserService');
      expect(capsule.content).toContain('constructor');
      expect(capsule.content).toContain('async getUser');
      expect(capsule.content).toContain('async createUser');
      expect(capsule.metadata.type).toBe('code');
      expect(capsule.metadata.qualityScore).toBeGreaterThan(0);
      expect(capsule.metadata.compressionRatio).toBeLessThan(1);
    });

    it('should respect max code length', async () => {
      const longCode = sampleCode.repeat(10); // Make it very long
      const item = createTestSearchResult('1', longCode, 'LongService.js', 'class', 0.9);
      
      const capsule = await creator.createCapsule(item, 'code');

      const capsuleTokens = tokenizer.countTokens(capsule.content);
      expect(capsuleTokens).toBeLessThanOrEqual(DEFAULT_CAPSULE_CONFIG.maxCodeLength);
    });
  });

  describe('Test Capsules', () => {
    it('should create test capsule preserving test structure', async () => {
      const item = createTestSearchResult('1', sampleTest, 'UserService.test.js', 'test', 0.8);
      
      const capsule = await creator.createCapsule(item, 'test');

      expect(capsule.content).toContain('describe');
      expect(capsule.content).toContain('it');
      expect(capsule.content).toContain('expect');
      expect(capsule.metadata.type).toBe('test');
      expect(capsule.metadata.preservedElements).toContain('test-signature');
      expect(capsule.metadata.preservedElements).toContain('assertion');
    });

    it('should preserve test descriptions', async () => {
      const item = createTestSearchResult('1', sampleTest, 'UserService.test.js', 'test', 0.8);
      
      const capsule = await creator.createCapsule(item, 'test');

      expect(capsule.content).toContain('should get user by ID');
      expect(capsule.content).toContain('should return null when user not found');
    });
  });

  describe('Documentation Capsules', () => {
    it('should create doc capsule preserving structure', async () => {
      const item = createTestSearchResult('1', sampleDocumentation, 'UserService.md', 'comment', 0.7);
      
      const capsule = await creator.createCapsule(item, 'doc');

      expect(capsule.content).toContain('# User Service API');
      expect(capsule.content).toContain('## Overview');
      expect(capsule.content).toContain('### getUser');
      expect(capsule.metadata.type).toBe('doc');
      expect(capsule.metadata.preservedElements).toContain('header');
    });

    it('should preserve code blocks in documentation', async () => {
      const item = createTestSearchResult('1', sampleDocumentation, 'UserService.md', 'comment', 0.7);
      
      const capsule = await creator.createCapsule(item, 'doc');

      expect(capsule.content).toContain('```typescript');
    });
  });

  describe('Quality Assessment', () => {
    it('should calculate quality scores correctly', async () => {
      const codeItem = createTestSearchResult('1', sampleCode, 'UserService.js', 'class', 0.9);
      const testItem = createTestSearchResult('2', sampleTest, 'UserService.test.js', 'test', 0.8);
      
      const codeCapsule = await creator.createCapsule(codeItem, 'code');
      const testCapsule = await creator.createCapsule(testItem, 'test');

      expect(codeCapsule.metadata.qualityScore).toBeGreaterThan(0);
      expect(codeCapsule.metadata.qualityScore).toBeLessThanOrEqual(1);
      expect(testCapsule.metadata.qualityScore).toBeGreaterThan(0);
      expect(testCapsule.metadata.qualityScore).toBeLessThanOrEqual(1);
    });

    it('should fall back to minimal capsule for low quality', async () => {
      const lowQualityConfig = {
        ...DEFAULT_CAPSULE_CONFIG,
        qualityThreshold: 0.9 // Very high threshold
      };
      const lowQualityCreator = new CapsuleCreator(lowQualityConfig, tokenizer);
      
      const item = createTestSearchResult('1', 'very short', 'test.js', 'function', 0.1);
      
      const capsule = await lowQualityCreator.createCapsule(item, 'code');

      expect(capsule.content).toContain('// test.js - content compressed');
    });
  });
});

describe('ProgressiveDegradationEngine', () => {
  let engine: ProgressiveDegradationEngine;
  let tokenizer: MockTokenizer;
  let policy: any;

  beforeEach(() => {
    tokenizer = new MockTokenizer();
    policy = DEFAULT_DEGRADE_POLICIES['gpt-4'];
    engine = new ProgressiveDegradationEngine(policy, tokenizer);
  });

  describe('Level 1 Degradation', () => {
    it('should remove low priority items', async () => {
      const items = [
        createTestSearchResult('1', sampleCode, 'UserService.js', 'class', 0.9),
        createTestSearchResult('2', 'low priority comment', 'comment.js', 'comment', 0.2),
        createTestSearchResult('3', sampleTest, 'UserService.test.js', 'test', 0.8)
      ];
      const budget = tokenizer.countTokens(sampleCode) + 100; // Just enough for high priority items

      const result = await engine.applyDegradation(items, budget);

      expect(result.degraded.length).toBeLessThan(items.length);
      expect(result.applied.level).toBe(1);
      expect(result.degraded.some(item => item.id === '1')).toBe(true); // High priority kept
      expect(result.degraded.some(item => item.id === '3')).toBe(true); // Medium priority kept
    });
  });

  describe('Level 2 Degradation', () => {
    it('should apply smart head-tail truncation', async () => {
      const longContent = sampleCode + '\n' + '// Many lines of code\n'.repeat(50) + sampleCode;
      const items = [
        createTestSearchResult('1', longContent, 'LongService.js', 'class', 0.9)
      ];
      const budget = tokenizer.countTokens(sampleCode) * 2; // Force truncation

      const result = await engine.applyDegradation(items, budget);

      expect(result.degraded[0].content).toContain('... [content omitted] ...');
      expect(result.applied.strategy).toContain('head-tail');
    });
  });

  describe('Level 3 Degradation', () => {
    it('should create capsule summaries', async () => {
      const items = [
        createTestSearchResult('1', sampleCode, 'UserService.js', 'class', 0.9),
        createTestSearchResult('2', sampleTest, 'UserService.test.js', 'test', 0.8)
      ];
      const budget = 150; // Small enough to force capsules

      const result = await engine.applyDegradation(items, budget);

      expect(result.applied.capsulesCreated).toBeGreaterThan(0);
      expect(result.applied.strategy).toContain('capsule');
    });
  });

  describe('Emergency Degradation', () => {
    it('should fall back to titles only for extreme constraints', async () => {
      const items = [
        createTestSearchResult('1', sampleCode, 'UserService.js', 'class', 0.9),
        createTestSearchResult('2', sampleTest, 'UserService.test.js', 'test', 0.8),
        createTestSearchResult('3', sampleDocumentation, 'UserService.md', 'comment', 0.7)
      ];
      const budget = 50; // Extremely small budget

      const result = await engine.applyDegradation(items, budget);

      expect(result.applied.level).toBe(5); // Emergency level
      expect(result.degraded[0].content).toContain('// ');
      expect(tokenizer.countTokens(result.degraded[0].content)).toBeLessThan(50);
    });
  });

  describe('Performance', () => {
    it('should complete degradation within reasonable time', async () => {
      const items = Array.from({ length: 100 }, (_, i) => 
        createTestSearchResult(`${i}`, sampleCode, `file${i}.js`, 'class', 0.8)
      );
      const budget = tokenizer.countTokens(sampleCode) * 10;

      const startTime = Date.now();
      const result = await engine.applyDegradation(items, budget);
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(5000); // Should complete within 5 seconds
      expect(result.performance.totalTime).toBeGreaterThan(0);
    });
  });

  describe('Quality Metrics', () => {
    it('should calculate overall quality score', async () => {
      const items = [
        createTestSearchResult('1', sampleCode, 'UserService.js', 'class', 0.9),
        createTestSearchResult('2', sampleTest, 'UserService.test.js', 'test', 0.8)
      ];
      const budget = 200;

      const result = await engine.applyDegradation(items, budget);

      expect(result.applied.qualityScore).toBeGreaterThanOrEqual(0);
      expect(result.applied.qualityScore).toBeLessThanOrEqual(1);
    });
  });
});

describe('Integration Tests', () => {
  it('should handle real-world scenario end-to-end', async () => {
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
    expect(result.savings.originalTokens).toBeGreaterThan(result.savings.degradedTokens);
    expect(result.savings.savingsPercentage).toBeGreaterThan(0);
    expect(result.applied.itemsProcessed).toBeGreaterThan(0);
    
    // Verify quality is maintained
    expect(result.applied.qualityScore).toBeGreaterThan(0.3);
    
    // Verify performance is reasonable
    expect(result.performance.totalTime).toBeLessThan(2000);

    // Verify important content is prioritized
    const hasUserService = result.degraded.some(item => item.path.includes('UserService'));
    const hasTest = result.degraded.some(item => item.path.includes('.test.'));
    expect(hasUserService || hasTest).toBe(true);
  });

  it('should adapt to different model capabilities', async () => {
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
    expect(claudeResult.savings.degradedTokens).toBeGreaterThanOrEqual(gpt35Result.savings.degradedTokens);
    expect(claudeResult.applied.qualityScore).toBeGreaterThanOrEqual(gpt35Result.applied.qualityScore);
  });
});