/**
 * Simple tests for Degrade Policy System (no framework dependencies)
 */

import { DegradePolicyEngine, CapsuleCreator, ProgressiveDegradationEngine } from '../dist/src/tokenization/degrade-policy.js';
import { DEFAULT_CAPSULE_CONFIG, MODEL_DEGRADE_POLICIES } from '../dist/src/tokenization/degrade-policy.js';

// Mock tokenizer for testing
class MockTokenizer {
  countTokens(text) {
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
});
`;

// Simple assertion helper
function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`Assertion failed: ${message}. Expected: ${expected}, Actual: ${actual}`);
  }
}

function assertGreaterThan(actual, threshold, message) {
  if (actual <= threshold) {
    throw new Error(`Assertion failed: ${message}. Expected > ${threshold}, Actual: ${actual}`);
  }
}

function assertLessThan(actual, threshold, message) {
  if (actual >= threshold) {
    throw new Error(`Assertion failed: ${message}. Expected < ${threshold}, Actual: ${actual}`);
  }
}

// Test runner
async function runTests() {
  console.log('🧪 Running Degrade Policy Tests...\n');
  
  let passedTests = 0;
  let totalTests = 0;
  
  function test(name, testFn) {
    totalTests++;
    try {
      testFn();
      console.log(`✅ ${name}`);
      passedTests++;
    } catch (error) {
      console.log(`❌ ${name}`);
      console.log(`   Error: ${error.message}`);
    }
  }
  
  async function asyncTest(name, testFn) {
    totalTests++;
    try {
      await testFn();
      console.log(`✅ ${name}`);
      passedTests++;
    } catch (error) {
      console.log(`❌ ${name}`);
      console.log(`   Error: ${error.message}`);
    }
  }
  
  // Test 1: Policy Management
  test('DegradePolicyEngine - get policy for model', () => {
    const engine = new DegradePolicyEngine();
    const policy = engine.getPolicyForModel('gpt-4');
    
    assert(policy !== undefined, 'Policy should be defined');
    assert(policy.name.includes('gpt-4'), 'Policy name should include model name');
    assert(policy.thresholds !== undefined, 'Policy should have thresholds');
    assert(policy.strategies !== undefined, 'Policy should have strategies');
    assert(policy.capsuleConfig !== undefined, 'Policy should have capsule config');
  });
  
  test('DegradePolicyEngine - create custom policy', () => {
    const engine = new DegradePolicyEngine();
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

    assertEqual(customPolicy.name, 'Test Policy', 'Policy name should match');
    assertEqual(customPolicy.thresholds.level1, 0.95, 'Custom threshold should be set');
    assert(engine.getPolicy(customPolicy.id) === customPolicy, 'Policy should be retrievable');
  });
  
  test('DegradePolicyEngine - update existing policy', () => {
    const engine = new DegradePolicyEngine();
    const policy = engine.getPolicyForModel('gpt-4');
    const originalThreshold = policy.thresholds.level1;
    
    const updated = engine.updatePolicy(policy.id, {
      thresholds: {
        ...policy.thresholds,
        level1: 0.95
      }
    });

    assertEqual(updated.thresholds.level1, 0.95, 'Updated threshold should match');
    assert(updated.thresholds.level1 !== originalThreshold, 'Threshold should have changed');
  });
  
  test('DegradePolicyEngine - delete policy', () => {
    const engine = new DegradePolicyEngine();
    const policy = engine.createCustomPolicy('Temp Policy', 'Temporary');
    const deleted = engine.deletePolicy(policy.id);
    
    assert(deleted === true, 'Policy should be deleted successfully');
    assert(engine.getPolicy(policy.id) === undefined, 'Deleted policy should not be found');
  });
  
  // Test 2: Capsule Creation
  await asyncTest('CapsuleCreator - create code capsule', async () => {
    const tokenizer = new MockTokenizer();
    const creator = new CapsuleCreator(DEFAULT_CAPSULE_CONFIG, tokenizer);
    const item = createTestSearchResult('1', sampleCode, 'UserService.js', 'class', 0.9);
    
    const capsule = await creator.createCapsule(item, 'code');

    assert(capsule.content.includes('export class UserService'), 'Should preserve class declaration');
    assert(capsule.content.includes('constructor'), 'Should preserve constructor');
    assert(capsule.content.includes('async getUser'), 'Should preserve methods');
    assertEqual(capsule.metadata.type, 'code', 'Should be code capsule type');
    assertGreaterThan(capsule.metadata.qualityScore, 0, 'Quality score should be positive');
    assertLessThan(capsule.metadata.compressionRatio, 1, 'Should have compression');
  });
  
  await asyncTest('CapsuleCreator - create test capsule', async () => {
    const tokenizer = new MockTokenizer();
    const creator = new CapsuleCreator(DEFAULT_CAPSULE_CONFIG, tokenizer);
    const item = createTestSearchResult('1', sampleTest, 'UserService.test.js', 'test', 0.8);
    
    const capsule = await creator.createCapsule(item, 'test');

    assert(capsule.content.includes('describe'), 'Should preserve describe blocks');
    assert(capsule.content.includes('it'), 'Should preserve it blocks');
    assert(capsule.content.includes('expect'), 'Should preserve assertions');
    assertEqual(capsule.metadata.type, 'test', 'Should be test capsule type');
    assert(capsule.metadata.preservedElements.includes('test-signature'), 'Should preserve test signatures');
    assert(capsule.metadata.preservedElements.includes('assertion'), 'Should preserve assertions');
  });
  
  await asyncTest('CapsuleCreator - respect max length', async () => {
    const tokenizer = new MockTokenizer();
    const creator = new CapsuleCreator(DEFAULT_CAPSULE_CONFIG, tokenizer);
    const longCode = sampleCode.repeat(10); // Make it very long
    const item = createTestSearchResult('1', longCode, 'LongService.js', 'class', 0.9);
    
    const capsule = await creator.createCapsule(item, 'code');

    const capsuleTokens = tokenizer.countTokens(capsule.content);
    assertLessThanOrEqual(capsuleTokens, DEFAULT_CAPSULE_CONFIG.maxCodeLength, 'Should respect max length');
  });
  
  // Test 3: Progressive Degradation
  await asyncTest('ProgressiveDegradationEngine - no degradation when under budget', async () => {
    const tokenizer = new MockTokenizer();
    const policy = MODEL_DEGRADE_POLICIES['gpt-4'];
    const engine = new ProgressiveDegradationEngine(policy, tokenizer);
    
    const items = [
      createTestSearchResult('1', 'short content', 'test.js', 'function', 0.9)
    ];
    const budget = 1000;

    const result = await engine.applyDegradation(items, budget);

    assertEqual(result.degraded.length, items.length, 'Should keep all items');
    assertEqual(result.applied.level, 0, 'No degradation level applied');
    assertEqual(result.savings.savingsPercentage, 0, 'No savings needed');
  });
  
  await asyncTest('ProgressiveDegradationEngine - apply level 1 degradation', async () => {
    const tokenizer = new MockTokenizer();
    const policy = MODEL_DEGRADE_POLICIES['gpt-4'];
    const engine = new ProgressiveDegradationEngine(policy, tokenizer);
    
    const items = [
      createTestSearchResult('1', sampleCode, 'UserService.js', 'class', 0.9),
      createTestSearchResult('2', 'low priority comment', 'comment.js', 'comment', 0.2),
      createTestSearchResult('3', sampleTest, 'UserService.test.js', 'test', 0.8)
    ];
    const budget = tokenizer.countTokens(sampleCode) + 100; // Just enough for high priority items

    const result = await engine.applyDegradation(items, budget);

    assertLessThan(result.degraded.length, items.length, 'Should reduce item count');
    assertGreaterThan(result.applied.level, 0, 'Should apply degradation level');
    assertGreaterThan(result.savings.savingsPercentage, 0, 'Should achieve savings');
    assertGreaterThan(result.performance.degradationTime, 0, 'Should track performance');
  });
  
  await asyncTest('ProgressiveDegradationEngine - create capsules at higher levels', async () => {
    const tokenizer = new MockTokenizer();
    const policy = MODEL_DEGRADE_POLICIES['gpt-4'];
    const engine = new ProgressiveDegradationEngine(policy, tokenizer);
    
    const items = [
      createTestSearchResult('1', sampleCode, 'UserService.js', 'class', 0.9),
      createTestSearchResult('2', sampleTest, 'UserService.test.js', 'test', 0.8)
    ];
    const budget = 150; // Small enough to force capsules

    const result = await engine.applyDegradation(items, budget);

    assertGreaterThan(result.applied.capsulesCreated, 0, 'Should create capsules');
    assert(result.applied.strategy.includes('capsule'), 'Should use capsule strategy');
  });
  
  await asyncTest('ProgressiveDegradationEngine - emergency degradation', async () => {
    const tokenizer = new MockTokenizer();
    const policy = MODEL_DEGRADE_POLICIES['gpt-4'];
    const engine = new ProgressiveDegradationEngine(policy, tokenizer);
    
    const items = [
      createTestSearchResult('1', sampleCode, 'UserService.js', 'class', 0.9),
      createTestSearchResult('2', sampleTest, 'UserService.test.js', 'test', 0.8),
      createTestSearchResult('3', sampleCode, 'AnotherService.js', 'class', 0.7)
    ];
    const budget = 50; // Extremely small budget

    const result = await engine.applyDegradation(items, budget);

    assertEqual(result.applied.level, 5, 'Should apply emergency level');
    assert(result.degraded[0].content.includes('// '), 'Should have minimal content');
    assertLessThan(tokenizer.countTokens(result.degraded[0].content), 50, 'Should fit budget');
  });
  
  // Test 4: Integration
  await asyncTest('Integration - end-to-end degradation', async () => {
    const engine = new DegradePolicyEngine();
    const tokenizer = new MockTokenizer();
    
    // Simulate real search results
    const searchResults = [
      createTestSearchResult('1', sampleCode, 'src/services/UserService.js', 'class', 0.95),
      createTestSearchResult('2', sampleTest, 'tests/services/UserService.test.js', 'test', 0.9),
      createTestSearchResult('3', '// Low priority comment', 'src/utils/helpers.js', 'comment', 0.3),
      createTestSearchResult('4', sampleCode.repeat(2), 'src/services/LongService.js', 'class', 0.85)
    ];

    const budget = 500; // Moderate budget constraint
    const policy = engine.getPolicyForModel('gpt-4');

    const result = await engine.applyDegradePolicy(searchResults, budget, policy, tokenizer);

    // Verify degradation worked
    assertGreaterThan(result.savings.originalTokens, result.savings.degradedTokens, 'Should reduce tokens');
    assertGreaterThan(result.savings.savingsPercentage, 0, 'Should achieve savings');
    assertGreaterThan(result.applied.itemsProcessed, 0, 'Should process items');
    
    // Verify quality is maintained
    assertGreaterThan(result.applied.qualityScore, 0.3, 'Should maintain quality');
    
    // Verify performance is reasonable
    assertLessThan(result.performance.totalTime, 2000, 'Should complete quickly');

    // Verify important content is prioritized
    const hasUserService = result.degraded.some(item => item.path.includes('UserService'));
    const hasTest = result.degraded.some(item => item.path.includes('.test.'));
    assert(hasUserService || hasTest, 'Should preserve important content');
  });
  
  await asyncTest('Integration - model-specific adaptation', async () => {
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
    assertGreaterThanOrEqual(claudeResult.savings.degradedTokens, gpt35Result.savings.degradedTokens, 
      'Claude should preserve more content');
    assertGreaterThanOrEqual(claudeResult.applied.qualityScore, gpt35Result.applied.qualityScore, 
      'Claude should maintain higher quality');
  });
  
  // Helper function for the last test
  function assertLessThanOrEqual(actual, threshold, message) {
    if (actual > threshold) {
      throw new Error(`Assertion failed: ${message}. Expected <= ${threshold}, Actual: ${actual}`);
    }
  }
  
  function assertGreaterThanOrEqual(actual, threshold, message) {
    if (actual < threshold) {
      throw new Error(`Assertion failed: ${message}. Expected >= ${threshold}, Actual: ${actual}`);
    }
  }
  
  // Results
  console.log(`\n📊 Test Results: ${passedTests}/${totalTests} passed`);
  
  if (passedTests === totalTests) {
    console.log('🎉 All tests passed!');
    return true;
  } else {
    console.log(`⚠️  ${totalTests - passedTests} tests failed`);
    return false;
  }
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runTests().then(success => {
    process.exit(success ? 0 : 1);
  }).catch(error => {
    console.error('Test runner error:', error);
    process.exit(1);
  });
}

export { runTests };