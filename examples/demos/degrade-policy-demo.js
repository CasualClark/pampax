/**
 * Degrade Policy System Demo
 * 
 * This example demonstrates how the degrade policy system works
 * with capsule downshifting for PAMPAX.
 */

import { DegradePolicyEngine } from '../dist/src/tokenization/degrade-policy.js';

// Mock tokenizer for demonstration
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

// Sample search results
const createSearchResult = (id, content, path, spanKind, score) => ({
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
  
  // Update user
  async updateUser(id: string, updates: Partial<User>): Promise<User | null> {
    const user = await this.getUser(id);
    if (!user) return null;
    
    Object.assign(user, updates);
    await this.database.save(user);
    return user;
  }
  
  // Delete user
  async deleteUser(id: string): Promise<boolean> {
    try {
      await this.database.delete(id);
      return true;
    } catch (error) {
      console.error('Failed to delete user:', error);
      return false;
    }
  }
  
  // List all users
  async listUsers(): Promise<User[]> {
    try {
      return await this.database.findAll();
    } catch (error) {
      console.error('Failed to list users:', error);
      return [];
    }
  }
  
  private validateUser(userData: CreateUserDto): boolean {
    return userData.email && userData.name && userData.email.includes('@');
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
  
  describe('getUser', () => {
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
    
    it('should handle database errors', async () => {
      mockDatabase.findById.mockRejectedValue(new Error('Database error'));
      
      const result = await userService.getUser('123');
      
      expect(result).toBeNull();
    });
  });
  
  describe('createUser', () => {
    it('should create new user', async () => {
      const userData = { name: 'Jane Doe', email: 'jane@example.com' };
      const expectedUser = { id: '456', ...userData };
      
      mockDatabase.save.mockResolvedValue(expectedUser);
      
      const result = await userService.createUser(userData);
      
      expect(result).toEqual(expectedUser);
      expect(mockDatabase.save).toHaveBeenCalled();
    });
  });
  
  describe('updateUser', () => {
    it('should update existing user', async () => {
      const userId = '123';
      const updates = { name: 'Updated Name' };
      const existingUser = { id: userId, name: 'Original Name', email: 'test@example.com' };
      const updatedUser = { ...existingUser, ...updates };
      
      mockDatabase.findById.mockResolvedValue(existingUser);
      mockDatabase.save.mockResolvedValue(updatedUser);
      
      const result = await userService.updateUser(userId, updates);
      
      expect(result).toEqual(updatedUser);
    });
    
    it('should return null for non-existent user', async () => {
      mockDatabase.findById.mockResolvedValue(null);
      
      const result = await userService.updateUser('nonexistent', { name: 'Test' });
      
      expect(result).toBeNull();
    });
  });
});
`;

const sampleDocumentation = `
# UserService API Documentation

## Overview
The UserService provides comprehensive user management functionality including CRUD operations, authentication, and profile management.

## Class Definition

\`\`\`typescript
export class UserService {
  constructor(database: Database)
  async getUser(id: string): Promise<User | null>
  async createUser(userData: CreateUserDto): Promise<User>
  async updateUser(id: string, updates: Partial<User>): Promise<User | null>
  async deleteUser(id: string): Promise<boolean>
  async listUsers(): Promise<User[]>
}
\`\`\`

## Methods

### \`getUser(id: string): Promise<User | null>\`
Retrieves a user by their unique identifier.

**Parameters:**
- \`id\` (string): The unique identifier of the user

**Returns:**
- Promise resolving to User object or null if not found

**Example:**
\`\`\`typescript
const user = await userService.getUser('123');
if (user) {
  console.log(\`Found user: \${user.name}\`);
}
\`\`\`

### \`createUser(userData: CreateUserDto): Promise<User>\`
Creates a new user with the provided data.

**Parameters:**
- \`userData\` (CreateUserDto): User creation data including name and email

**Returns:**
- Promise resolving to the created User object

**Example:**
\`\`\`typescript
const newUser = await userService.createUser({
  name: 'John Doe',
  email: 'john@example.com'
});
\`\`\`

## Error Handling
All methods include proper error handling and logging. Database errors are caught and appropriate null values or default responses are returned.

## Best Practices
- Always validate user input before creating users
- Handle null returns appropriately
- Use try-catch blocks for error handling
`;

async function demonstrateDegradePolicy() {
  console.log('🚀 Degrade Policy System Demo\n');
  
  const engine = new DegradePolicyEngine();
  const tokenizer = new MockTokenizer();
  
  // Create realistic search results
  const searchResults = [
    createSearchResult('1', sampleCode, 'src/services/UserService.ts', 'class', 0.95),
    createSearchResult('2', sampleTest, 'tests/services/UserService.test.ts', 'test', 0.9),
    createSearchResult('3', sampleDocumentation, 'docs/UserService.md', 'comment', 0.8),
    createSearchResult('4', '// Low priority utility function\nexport function formatDate(date: Date): string {\n  return date.toISOString();\n}', 'src/utils/date.ts', 'function', 0.4),
    createSearchResult('5', sampleCode.repeat(3), 'src/services/ExtendedUserService.ts', 'class', 0.85)
  ];
  
  console.log('📊 Original Content:');
  console.log(`- Items: ${searchResults.length}`);
  console.log(`- Total tokens: ${searchResults.reduce((sum, item) => sum + tokenizer.countTokens(item.content), 0)}`);
  console.log(`- Content types: ${[...new Set(searchResults.map(item => item.spanKind))].join(', ')}`);
  console.log();
  
  // Test different budget scenarios
  const scenarios = [
    { name: 'Large Budget (No degradation)', budget: 2000 },
    { name: 'Medium Budget (Level 1 degradation)', budget: 800 },
    { name: 'Small Budget (Level 2-3 degradation)', budget: 400 },
    { name: 'Tiny Budget (Level 4+ degradation)', budget: 150 }
  ];
  
  for (const scenario of scenarios) {
    console.log(`\n--- ${scenario.name} ---`);
    
    const policy = engine.getPolicyForModel('gpt-4');
    const result = await engine.applyDegradePolicy(searchResults, scenario.budget, policy, tokenizer);
    
    console.log(`Budget: ${scenario.budget} tokens`);
    console.log(`Applied level: ${result.applied.level}`);
    console.log(`Strategy: ${result.applied.strategy}`);
    console.log(`Items processed: ${result.applied.itemsProcessed}`);
    console.log(`Capsules created: ${result.applied.capsulesCreated}`);
    console.log(`Quality score: ${result.applied.qualityScore.toFixed(2)}`);
    console.log(`Savings: ${result.savings.savingsPercentage.toFixed(1)}%`);
    console.log(`Compression ratio: ${(result.savings.compressionRatio * 100).toFixed(1)}%`);
    console.log(`Processing time: ${result.performance.totalTime}ms`);
    
    // Show sample of degraded content
    if (result.degraded.length > 0) {
      const sampleItem = result.degraded[0];
      const originalItem = searchResults.find(item => item.id === sampleItem.id);
      
      if (originalItem) {
        const originalTokens = tokenizer.countTokens(originalItem.content);
        const degradedTokens = tokenizer.countTokens(sampleItem.content);
        
        console.log(`\nSample degradation (${originalItem.path}):`);
        console.log(`Original: ${originalTokens} tokens`);
        console.log(`Degraded: ${degradedTokens} tokens`);
        console.log(`--- Original Content ---`);
        console.log(originalItem.content.substring(0, 200) + '...');
        console.log(`--- Degraded Content ---`);
        console.log(sampleItem.content);
        
        if (sampleItem.metadata?.capsule) {
          console.log(`--- Capsule Metadata ---`);
          console.log(`Type: ${sampleItem.metadata.capsule.type}`);
          console.log(`Quality: ${sampleItem.metadata.capsule.qualityScore.toFixed(2)}`);
          console.log(`Compression: ${(sampleItem.metadata.capsule.compressionRatio * 100).toFixed(1)}%`);
          console.log(`Preserved: ${sampleItem.metadata.capsule.preservedElements.join(', ')}`);
        }
      }
    }
  }
  
  // Demonstrate model-specific adaptation
  console.log('\n--- Model-Specific Adaptation ---');
  const models = ['gpt-3.5-turbo', 'gpt-4', 'claude-3'];
  const budget = 400;
  
  for (const model of models) {
    const policy = engine.getPolicyForModel(model);
    const result = await engine.applyDegradePolicy(searchResults, budget, policy, tokenizer);
    
    console.log(`${model}:`);
    console.log(`  - Degradation level: ${result.applied.level}`);
    console.log(`  - Quality score: ${result.applied.qualityScore.toFixed(2)}`);
    console.log(`  - Tokens preserved: ${result.savings.degradedTokens}`);
    console.log(`  - Savings: ${result.savings.savingsPercentage.toFixed(1)}%`);
  }
  
  console.log('\n✨ Demo completed successfully!');
  console.log('\nKey Features Demonstrated:');
  console.log('✅ Progressive degradation levels');
  console.log('✅ Smart capsule creation');
  console.log('✅ Content-aware degradation');
  console.log('✅ Model-specific adaptation');
  console.log('✅ Quality preservation');
  console.log('✅ Performance monitoring');
}

// Run the demo
if (import.meta.url === `file://${process.argv[1]}`) {
  demonstrateDegradePolicy().catch(console.error);
}

export { demonstrateDegradePolicy };