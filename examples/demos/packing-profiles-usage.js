/**
 * Example usage of the Packing Profiles system
 * 
 * This example demonstrates how to:
 * - Create and manage packing profiles
 * - Optimize search results with context packing
 * - Use intent-aware packing strategies
 * - Monitor performance and enable learning
 */

import { PackingProfileManager } from '../src/tokenization/packing-profiles.js';
import { SearchIntegrationManager } from '../src/tokenization/search-integration.js';
import { StorageOperations } from '../src/storage/crud.js';
import { intentClassifier } from '../src/intent/index.js';

async function demonstratePackingProfiles() {
  console.log('🚀 PAMPAX Packing Profiles Demo\n');

  // Initialize storage and managers
  const storage = new StorageOperations(/* database connection */);
  const profileManager = new PackingProfileManager(storage);
  const searchIntegration = new SearchIntegrationManager(profileManager, storage);

  try {
    // ====================================================================
    // 1. Create a custom packing profile
    // ====================================================================
    console.log('📋 Creating custom packing profile...');
    
    const customProfile = await profileManager.createProfile({
      repository: 'my-awesome-project',
      model: 'gpt-4',
      priorities: {
        tests: 0.9,        // High priority for tests
        code: 1.0,         // Maximum priority for code
        comments: 0.7,     // Medium-high priority for comments
        examples: 0.8,     // High priority for examples
        config: 0.6,       // Medium priority for config
        docs: 0.5          // Medium priority for docs
      },
      budgetAllocation: {
        total: 10000,      // 10k token budget
        mustHave: 3000,    // 30% for critical content
        important: 4000,   // 40% for important content
        supplementary: 2000, // 20% for supplementary
        optional: 800,     // 8% for optional
        reserve: 200       // 2% reserve
      },
      capsuleStrategies: {
        enabled: true,
        maxCapsuleSize: 1200,
        minCapsuleSize: 300,
        capsuleThreshold: 1800,
        preserveStructure: true
      },
      truncationStrategies: {
        strategy: 'smart',
        preserveImportant: true,
        preserveContext: true,
        truncateComments: true,
        preserveSignatures: true
      },
      ttl: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    console.log(`✅ Profile created with ID: ${customProfile}`);

    // ====================================================================
    // 2. Optimize profile based on repository analysis
    // ====================================================================
    console.log('\n🔍 Optimizing profile based on repository analysis...');
    
    const optimizedProfile = await profileManager.optimizeProfile(
      'my-awesome-project', 
      'gpt-4'
    );
    
    console.log(`✅ Optimized profile generated for ${optimizedProfile.repository}`);
    console.log(`   - Model: ${optimizedProfile.model}`);
    console.log(`   - Version: ${optimizedProfile.version}`);
    console.log(`   - Budget: ${optimizedProfile.budgetAllocation.total} tokens`);
    console.log(`   - Generated: ${optimizedProfile.metadata?.generated}`);

    // ====================================================================
    // 3. Simulate search results and optimize them
    // ====================================================================
    console.log('\n🔎 Optimizing search results...');
    
    const searchResults = [
      {
        id: '1',
        content: `
          class UserService {
            constructor(database) {
              this.db = database;
            }
            
            async getUserById(id) {
              const query = 'SELECT * FROM users WHERE id = ?';
              return await this.db.get(query, [id]);
            }
            
            async createUser(userData) {
              const query = 'INSERT INTO users (name, email) VALUES (?, ?)';
              return await this.db.run(query, [userData.name, userData.email]);
            }
          }
        `,
        path: 'src/services/UserService.js',
        spanKind: 'class',
        spanName: 'UserService',
        language: 'javascript',
        score: 0.95
      },
      {
        id: '2',
        content: `
          describe('UserService', () => {
            let userService;
            let mockDb;
            
            beforeEach(() => {
              mockDb = {
                get: jest.fn(),
                run: jest.fn()
              };
              userService = new UserService(mockDb);
            });
            
            describe('getUserById', () => {
              it('should return user when found', async () => {
                const expectedUser = { id: 1, name: 'John', email: 'john@example.com' };
                mockDb.get.mockResolvedValue(expectedUser);
                
                const result = await userService.getUserById(1);
                
                expect(result).toEqual(expectedUser);
                expect(mockDb.get).toHaveBeenCalledWith('SELECT * FROM users WHERE id = ?', [1]);
              });
            });
          });
        `,
        path: 'test/services/UserService.test.js',
        language: 'javascript',
        score: 0.85
      },
      {
        id: '3',
        content: `
          # UserService API Documentation
          
          ## Overview
          The UserService class provides database operations for user management.
          
          ## Methods
          
          ### getUserById(id)
          Retrieves a user by their ID.
          
          **Parameters:**
          - id (number): The user ID
          
          **Returns:** Promise<User | null>
          
          ### createUser(userData)
          Creates a new user in the database.
          
          **Parameters:**
          - userData (object): User data with name and email
          
          **Returns:** Promise<DatabaseResult>
        `,
        path: 'docs/UserService.md',
        language: 'markdown',
        score: 0.75
      },
      {
        id: '4',
        content: `
          DATABASE_URL=postgres://localhost:5432/myapp
          REDIS_URL=redis://localhost:6379
          JWT_SECRET=your-secret-key-here
          API_PORT=3000
          NODE_ENV=development
        `,
        path: '.env.example',
        language: 'env',
        score: 0.65
      }
    ];

    // Classify intent for the query
    const query = 'UserService getUserById implementation';
    const intent = intentClassifier.classify(query);
    
    console.log(`📊 Query Intent: ${intent.intent} (confidence: ${intent.confidence})`);
    console.log(`   Entities: ${intent.entities.map(e => `${e.type}:${e.value}`).join(', ')}`);
    console.log(`   Suggested Policies: ${intent.suggestedPolicies.join(', ')}`);

    // Optimize search results
    const optimizedResult = await searchIntegration.optimizeSearchResults(
      query,
      searchResults,
      {
        repository: 'my-awesome-project',
        model: 'gpt-4',
        intent,
        options: {
          customBudget: 5000,
          trackPerformance: true,
          enableLearning: true
        }
      }
    );

    console.log('\n📦 Optimization Results:');
    console.log(`   Original Results: ${optimizedResult.results.length}`);
    console.log(`   Optimized Items: ${optimizedResult.optimized.packed.length}`);
    console.log(`   Original Tokens: ~${Math.round(optimizedResult.results.reduce((sum, r) => sum + r.content.length / 4, 0))}`);
    console.log(`   Optimized Tokens: ${optimizedResult.optimized.totalTokens}`);
    console.log(`   Budget Used: ${(optimizedResult.optimized.budgetUsed * 100).toFixed(1)}%`);
    console.log(`   Strategy: ${optimizedResult.optimized.strategy}`);
    console.log(`   Truncated: ${optimizedResult.optimized.truncated}`);
    console.log(`   Performance: ${optimizedResult.performance.totalTime}ms`);

    // Show packed items with their priorities
    console.log('\n📋 Packed Items:');
    optimizedResult.optimized.packed.forEach((item, index) => {
      console.log(`   ${index + 1}. ${item.metadata.path}`);
      console.log(`      Type: ${item.type} | Priority: ${item.priority.toFixed(2)} | Tokens: ${item.tokens}`);
      if (item.capsule) {
        console.log(`      Capsule: ${item.capsule.index + 1}/${item.capsule.total}`);
      }
    });

    // ====================================================================
    // 4. Performance monitoring
    // ====================================================================
    console.log('\n📈 Performance Statistics:');
    
    const perfStats = searchIntegration.getPerformanceStats('my-awesome-project', 'gpt-4');
    console.log(`   Total Queries: ${perfStats.totalQueries}`);
    console.log(`   Avg Tokens Reduced: ${perfStats.avgTokensReduced.toFixed(1)}%`);
    console.log(`   Avg Budget Used: ${(perfStats.avgBudgetUsed * 100).toFixed(1)}%`);
    console.log(`   Truncation Rate: ${perfStats.truncationRate.toFixed(1)}%`);
    console.log(`   Avg Time: ${perfStats.avgTime.toFixed(1)}ms`);
    console.log('   Strategy Distribution:', perfStats.strategyDistribution);

    // ====================================================================
    // 5. Learning system statistics
    // ====================================================================
    console.log('\n🧠 Learning System Statistics:');
    
    const learningStats = searchIntegration.getLearningStats();
    console.log(`   Profiles with Learning: ${learningStats.learningProfiles.length}`);
    console.log(`   Total Learning Events: ${learningStats.totalEvents}`);
    console.log(`   Active Profiles: ${learningStats.profileCount}`);

    // ====================================================================
    // 6. Profile management operations
    // ====================================================================
    console.log('\n🔧 Profile Management:');
    
    // List all profiles for the repository
    const profiles = await profileManager.getProfilesByRepository('my-awesome-project');
    console.log(`   Total Profiles: ${profiles.length}`);
    profiles.forEach(profile => {
      console.log(`   - ${profile.model} (v${profile.version}, updated: ${profile.updatedAt.toISOString()})`);
    });

    // Update a profile
    await profileManager.updateProfile(optimizedProfile.id, {
      priorities: {
        ...optimizedProfile.priorities,
        tests: 0.95  // Increase test priority
      }
    });
    console.log('✅ Profile updated with higher test priority');

    // Cleanup expired profiles
    const cleanedCount = await profileManager.cleanupExpired();
    console.log(`🧹 Cleaned up ${cleanedCount} expired profiles`);

  } catch (error) {
    console.error('❌ Error in demo:', error.message);
  }

  console.log('\n🎉 Demo completed!');
}

// ====================================================================
// Additional utility functions
// ====================================================================

/**
 * Create a profile for a specific type of repository
 */
async function createProfileForRepositoryType(repository, model, repositoryType) {
  const profileManager = new PackingProfileManager(/* storage */);
  
  const typeSpecificProfiles = {
    'frontend': {
      priorities: {
        tests: 0.8,
        code: 1.0,
        comments: 0.6,
        examples: 0.9,  // Frontend benefits from examples
        config: 0.7,    // Config is important for frontend
        docs: 0.5
      },
      budgetAllocation: {
        total: 8000,
        mustHave: 2500,
        important: 3000,
        supplementary: 1500,
        optional: 800,
        reserve: 200
      }
    },
    'backend': {
      priorities: {
        tests: 0.9,     // Backend tests are critical
        code: 1.0,
        comments: 0.7,  // Backend needs good documentation
        examples: 0.6,
        config: 0.8,    // Backend config is very important
        docs: 0.6
      },
      budgetAllocation: {
        total: 10000,
        mustHave: 3500,
        important: 3500,
        supplementary: 2000,
        optional: 800,
        reserve: 200
      }
    },
    'ml': {
      priorities: {
        tests: 0.8,
        code: 1.0,
        comments: 0.8,  // ML code needs good comments
        examples: 0.9,  // Examples are crucial for ML
        config: 0.7,
        docs: 0.7       // Documentation is important for ML
      },
      budgetAllocation: {
        total: 12000,
        mustHave: 4000,
        important: 4000,
        supplementary: 2500,
        optional: 1000,
        reserve: 500
      }
    }
  };

  const profileConfig = typeSpecificProfiles[repositoryType] || typeSpecificProfiles['backend'];
  
  return await profileManager.createProfile({
    repository,
    model,
    ...profileConfig,
    capsuleStrategies: {
      enabled: true,
      maxCapsuleSize: 1000,
      minCapsuleSize: 200,
      capsuleThreshold: 1500,
      preserveStructure: true
    },
    truncationStrategies: {
      strategy: 'smart',
      preserveImportant: true,
      preserveContext: true,
      truncateComments: false,  // Keep comments for ML
      preserveSignatures: true
    }
  });
}

/**
 * Batch optimize multiple repositories
 */
async function batchOptimizeRepositories(repositories, model) {
  const profileManager = new PackingProfileManager(/* storage */);
  const results = [];
  
  for (const repo of repositories) {
    try {
      const profile = await profileManager.optimizeProfile(repo, model);
      results.push({ repository: repo, success: true, profile });
    } catch (error) {
      results.push({ repository: repo, success: false, error: error.message });
    }
  }
  
  return results;
}

// Export for use in other modules
export {
  demonstratePackingProfiles,
  createProfileForRepositoryType,
  batchOptimizeRepositories
};

// Run demo if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  demonstratePackingProfiles().catch(console.error);
}