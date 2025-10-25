/**
 * Per-repo packing profiles with disk caching for PAMPAX
 * 
 * This system provides:
 * - Per-repo configuration for optimal context packing
 * - Model-specific packing strategies  
 * - Disk-based caching with TTL
 * - Profile validation and defaults
 * - Hierarchical prioritization and dynamic token budget allocation
 */

import { Database } from 'better-sqlite3';
import { logger } from '../config/logger.js';
import { StorageOperations } from '../storage/crud.js';
import { IntentType, IntentResult } from '../intent/index.js';

// ============================================================================
// Core Interfaces
// ============================================================================

export interface ContentPriorities {
  tests: number;        // 0-1 priority weight for test files
  code: number;         // Core implementation priority
  comments: number;     // Documentation and comments priority
  examples: number;     // Usage examples priority
  config: number;       // Configuration files priority
  docs: number;         // Documentation files priority
}

export interface BudgetAllocation {
  total: number;                    // Total token budget
  mustHave: number;                 // Minimum tokens for critical content
  important: number;                // Tokens for important content
  supplementary: number;            // Tokens for supplementary content
  optional: number;                 // Tokens for optional content
  reserve: number;                  // Reserve buffer for overflow
}

export interface CapsuleStrategies {
  enabled: boolean;                 // Enable smart capsule creation
  maxCapsuleSize: number;           // Maximum tokens per capsule
  minCapsuleSize: number;           // Minimum tokens per capsule
  capsuleThreshold: number;         // Threshold for creating capsules
  preserveStructure: boolean;       // Preserve code structure in capsules
}

export interface TruncationStrategies {
  strategy: 'head' | 'tail' | 'middle' | 'smart';
  preserveImportant: boolean;       // Preserve high-priority content
  preserveContext: boolean;         // Preserve surrounding context
  truncateComments: boolean;        // Truncate comments first
  preserveSignatures: boolean;      // Preserve function/class signatures
}

export interface PackingProfile {
  id: string;
  repository: string;
  model: string;
  priorities: ContentPriorities;
  budgetAllocation: BudgetAllocation;
  capsuleStrategies: CapsuleStrategies;
  truncationStrategies: TruncationStrategies;
  createdAt: Date;
  updatedAt: Date;
  ttl?: number;                     // Time to live in milliseconds
  version: number;                  // Profile version for migrations
  metadata?: Record<string, any>;   // Additional metadata
}

export interface PackingProfileOptions {
  repository: string;
  model: string;
  intent?: IntentResult;
  customBudget?: number;
  overridePriorities?: Partial<ContentPriorities>;
}

export interface PackingResult {
  packed: PackedItem[];
  totalTokens: number;
  budgetUsed: number;
  strategy: string;
  truncated: boolean;
  profile: PackingProfile;
}

export interface PackedItem {
  id: string;
  content: string;
  tokens: number;
  priority: number;
  type: 'must-have' | 'important' | 'supplementary' | 'optional';
  metadata: {
    path: string;
    spanKind?: string;
    spanName?: string;
    language?: string;
    score?: number;
    relevance?: number;
  };
  capsule?: {
    id: string;
    index: number;
    total: number;
  };
}

// ============================================================================
// Database Operations
// ============================================================================

export interface PackingProfileRecord {
  id: string;
  repository: string;
  model: string;
  priorities: string;     // JSON string
  budget_allocation: string; // JSON string
  capsule_strategies: string; // JSON string
  truncation_strategies: string; // JSON string
  created_at: number;
  updated_at: number;
  ttl?: number;
  version: number;
  metadata?: string;      // JSON string
}

export class PackingProfileOperations {
  constructor(private db: Database) {}

  insert(profile: Omit<PackingProfileRecord, 'created_at' | 'updated_at'>): string {
    const now = Date.now();

    try {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO packing_profile 
        (id, repository, model, priorities, budget_allocation, capsule_strategies, 
         truncation_strategies, created_at, updated_at, ttl, version, metadata)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        profile.id,
        profile.repository,
        profile.model,
        profile.priorities,
        profile.budget_allocation,
        profile.capsule_strategies,
        profile.truncation_strategies,
        now,
        now,
        profile.ttl,
        profile.version,
        profile.metadata
      );

      return profile.id;
    } catch (error) {
      logger.error('Failed to insert packing profile record', { 
        error: error instanceof Error ? error.message : String(error),
        profileId: profile.id 
      });
      throw error;
    }
  }

  findById(id: string): PackingProfileRecord | undefined {
    const stmt = this.db.prepare(`
      SELECT * FROM packing_profile WHERE id = ?
    `);
    return stmt.get(id) as PackingProfileRecord | undefined;
  }

  findByRepositoryAndModel(repository: string, model: string): PackingProfileRecord | undefined {
    const stmt = this.db.prepare(`
      SELECT * FROM packing_profile 
      WHERE repository = ? AND model = ? 
      ORDER BY updated_at DESC 
      LIMIT 1
    `);
    return stmt.get(repository, model) as PackingProfileRecord | undefined;
  }

  findByRepository(repository: string): PackingProfileRecord[] {
    const stmt = this.db.prepare(`
      SELECT * FROM packing_profile 
      WHERE repository = ? 
      ORDER BY updated_at DESC
    `);
    return stmt.all(repository) as PackingProfileRecord[];
  }

  update(id: string, updates: Partial<Omit<PackingProfileRecord, 'id' | 'created_at'>>): boolean {
    const fields = [];
    const values = [];

    if (updates.repository !== undefined) {
      fields.push('repository = ?');
      values.push(updates.repository);
    }
    if (updates.model !== undefined) {
      fields.push('model = ?');
      values.push(updates.model);
    }
    if (updates.priorities !== undefined) {
      fields.push('priorities = ?');
      values.push(updates.priorities);
    }
    if (updates.budget_allocation !== undefined) {
      fields.push('budget_allocation = ?');
      values.push(updates.budget_allocation);
    }
    if (updates.capsule_strategies !== undefined) {
      fields.push('capsule_strategies = ?');
      values.push(updates.capsule_strategies);
    }
    if (updates.truncation_strategies !== undefined) {
      fields.push('truncation_strategies = ?');
      values.push(updates.truncation_strategies);
    }
    if (updates.ttl !== undefined) {
      fields.push('ttl = ?');
      values.push(updates.ttl);
    }
    if (updates.version !== undefined) {
      fields.push('version = ?');
      values.push(updates.version);
    }
    if (updates.metadata !== undefined) {
      fields.push('metadata = ?');
      values.push(updates.metadata);
    }

    if (fields.length === 0) {
      return false;
    }

    fields.push('updated_at = ?');
    values.push(Date.now());
    values.push(id);

    const stmt = this.db.prepare(`
      UPDATE packing_profile 
      SET ${fields.join(', ')} 
      WHERE id = ?
    `);

    const result = stmt.run(...values);
    return result.changes > 0;
  }

  delete(id: string): boolean {
    const stmt = this.db.prepare(`
      DELETE FROM packing_profile WHERE id = ?
    `);
    const result = stmt.run(id);
    return result.changes > 0;
  }

  deleteByRepository(repository: string): number {
    const stmt = this.db.prepare(`
      DELETE FROM packing_profile WHERE repository = ?
    `);
    const result = stmt.run(repository);
    return result.changes;
  }

  deleteExpired(): number {
    const cutoffTime = Date.now();
    
    const stmt = this.db.prepare(`
      DELETE FROM packing_profile 
      WHERE ttl IS NOT NULL AND (created_at + ttl) < ?
    `);
    const result = stmt.run(cutoffTime);
    return result.changes;
  }

  findAll(): PackingProfileRecord[] {
    const stmt = this.db.prepare(`
      SELECT * FROM packing_profile 
      ORDER BY repository, model, updated_at DESC
    `);
    return stmt.all() as PackingProfileRecord[];
  }
}

// ============================================================================
// Default Profile Definitions
// ============================================================================

export const DEFAULT_PRIORITIES: ContentPriorities = {
  tests: 0.8,
  code: 1.0,
  comments: 0.6,
  examples: 0.7,
  config: 0.5,
  docs: 0.4
};

export const DEFAULT_BUDGET_ALLOCATION: BudgetAllocation = {
  total: 8000,
  mustHave: 2000,
  important: 3000,
  supplementary: 2000,
  optional: 800,
  reserve: 200
};

export const DEFAULT_CAPSULE_STRATEGIES: CapsuleStrategies = {
  enabled: true,
  maxCapsuleSize: 1000,
  minCapsuleSize: 200,
  capsuleThreshold: 1500,
  preserveStructure: true
};

export const DEFAULT_TRUNCATION_STRATEGIES: TruncationStrategies = {
  strategy: 'smart',
  preserveImportant: true,
  preserveContext: true,
  truncateComments: true,
  preserveSignatures: true
};

// Model-specific profile templates
export const MODEL_PROFILES = {
  'gpt-4': {
    priorities: { ...DEFAULT_PRIORITIES, code: 1.0, comments: 0.7 },
    budgetAllocation: { ...DEFAULT_BUDGET_ALLOCATION, total: 8000 },
    capsuleStrategies: { ...DEFAULT_CAPSULE_STRATEGIES, maxCapsuleSize: 1200 },
    truncationStrategies: { ...DEFAULT_TRUNCATION_STRATEGIES, strategy: 'smart' as const }
  },
  'gpt-3.5-turbo': {
    priorities: { ...DEFAULT_PRIORITIES, code: 1.0, examples: 0.8 },
    budgetAllocation: { ...DEFAULT_BUDGET_ALLOCATION, total: 4000 },
    capsuleStrategies: { ...DEFAULT_CAPSULE_STRATEGIES, maxCapsuleSize: 800 },
    truncationStrategies: { ...DEFAULT_TRUNCATION_STRATEGIES, strategy: 'head' as const }
  },
  'claude-3': {
    priorities: { ...DEFAULT_PRIORITIES, code: 1.0, docs: 0.8, comments: 0.7 },
    budgetAllocation: { ...DEFAULT_BUDGET_ALLOCATION, total: 100000 },
    capsuleStrategies: { ...DEFAULT_CAPSULE_STRATEGIES, maxCapsuleSize: 2000 },
    truncationStrategies: { ...DEFAULT_TRUNCATION_STRATEGIES, strategy: 'smart' as const }
  },
  'default': {
    priorities: DEFAULT_PRIORITIES,
    budgetAllocation: DEFAULT_BUDGET_ALLOCATION,
    capsuleStrategies: DEFAULT_CAPSULE_STRATEGIES,
    truncationStrategies: DEFAULT_TRUNCATION_STRATEGIES
  }
};

// Intent-specific priority adjustments
export const INTENT_PRIORITY_ADJUSTMENTS: Record<IntentType, Partial<ContentPriorities>> = {
  symbol: {
    code: 1.0,
    comments: 0.8,
    examples: 0.9
  },
  config: {
    config: 1.0,
    docs: 0.8,
    code: 0.7
  },
  api: {
    code: 1.0,
    examples: 0.9,
    comments: 0.7
  },
  incident: {
    code: 1.0,
    tests: 0.9,
    comments: 0.8
  },
  search: {
    code: 0.8,
    docs: 0.9,
    examples: 0.8
  }
};

// ============================================================================
// Profile Manager
// ============================================================================

export class PackingProfileManager {
  private operations: PackingProfileOperations;
  private cache = new Map<string, PackingProfile>();
  private cacheTimeout = 5 * 60 * 1000; // 5 minutes

  constructor(private storage: StorageOperations) {
    this.operations = new PackingProfileOperations((storage as any).db);
  }

  /**
   * Create a new packing profile
   */
  async createProfile(profile: Omit<PackingProfile, 'id' | 'createdAt' | 'updatedAt' | 'version'>): Promise<string> {
    const id = this.generateProfileId(profile.repository, profile.model);
    const now = new Date();
    
    const fullProfile: PackingProfile = {
      ...profile,
      id,
      createdAt: now,
      updatedAt: now,
      version: 1
    };

    // Validate profile
    this.validateProfile(fullProfile);

    // Store in database
    const record = this.profileToRecord(fullProfile);
    this.operations.insert(record);

    // Update cache
    this.cache.set(id, fullProfile);

    logger.info('Created packing profile', { 
      id, 
      repository: profile.repository, 
      model: profile.model 
    });

    return id;
  }

  /**
   * Get a packing profile for a repository and model
   */
  async getProfile(repository: string, model: string): Promise<PackingProfile> {
    const cacheKey = `${repository}:${model}`;
    
    // Check cache first
    const cached = this.cache.get(cacheKey);
    if (cached && this.isCacheValid(cached)) {
      return cached;
    }

    // Try to find existing profile
    const record = this.operations.findByRepositoryAndModel(repository, model);
    
    if (record) {
      const profile = this.recordToProfile(record);
      
      // Check if profile is expired
      if (this.isProfileExpired(profile)) {
        logger.debug('Profile expired, generating new one', { 
          repository, 
          model, 
          profileId: profile.id 
        });
        return await this.optimizeProfile(repository, model);
      }

      // Update cache
      this.cache.set(cacheKey, profile);
      return profile;
    }

    // No profile found, create optimized one
    logger.info('No profile found, generating optimized profile', { repository, model });
    return await this.optimizeProfile(repository, model);
  }

  /**
   * Update an existing packing profile
   */
  async updateProfile(id: string, updates: Partial<PackingProfile>): Promise<void> {
    const existing = this.operations.findById(id);
    if (!existing) {
      throw new Error(`Profile not found: ${id}`);
    }

    const updatedProfile: PackingProfile = {
      ...this.recordToProfile(existing),
      ...updates,
      updatedAt: new Date(),
      version: existing.version + 1
    };

    // Validate updated profile
    this.validateProfile(updatedProfile);

    // Update database
    const record = this.profileToRecord(updatedProfile);
    this.operations.update(id, record);

    // Update cache
    this.cache.set(id, updatedProfile);

    logger.info('Updated packing profile', { id, version: updatedProfile.version });
  }

  /**
   * Delete a packing profile
   */
  async deleteProfile(id: string): Promise<void> {
    const success = this.operations.delete(id);
    if (!success) {
      throw new Error(`Failed to delete profile: ${id}`);
    }

    // Remove from cache
    this.cache.delete(id);

    logger.info('Deleted packing profile', { id });
  }

  /**
   * Generate an optimized profile based on repository analysis
   */
  async optimizeProfile(repository: string, model: string): Promise<PackingProfile> {
    logger.info('Optimizing profile for repository', { repository, model });

    // Get base template for model
    const template = MODEL_PROFILES[model as keyof typeof MODEL_PROFILES] || MODEL_PROFILES.default;

    // Analyze repository characteristics
    const analysis = await this.analyzeRepository(repository);

    // Adjust priorities based on analysis
    const priorities = this.adjustPriorities(template.priorities, analysis);

    // Adjust budget based on model and repository size
    const budgetAllocation = this.adjustBudget(template.budgetAllocation, model, analysis);

    // Adjust capsule strategies based on content patterns
    const capsuleStrategies = this.adjustCapsuleStrategies(template.capsuleStrategies, analysis);

    // Truncation strategies remain mostly model-dependent
    const truncationStrategies = template.truncationStrategies;

    // Create profile data
    const profileInput = {
      repository,
      model,
      priorities,
      budgetAllocation,
      capsuleStrategies,
      truncationStrategies,
      ttl: 7 * 24 * 60 * 60 * 1000, // 7 days
      metadata: {
        generated: true,
        analysis,
        generatedAt: new Date().toISOString()
      }
    };

    // Create the profile and return it
    const profileId = await this.createProfile(profileInput);
    
    // Get the created profile to return it
    return await this.getProfile(repository, model);
  }

  /**
   * Get all profiles for a repository
   */
  async getProfilesByRepository(repository: string): Promise<PackingProfile[]> {
    const records = this.operations.findByRepository(repository);
    return records.map(record => this.recordToProfile(record));
  }

  /**
   * Clean up expired profiles
   */
  async cleanupExpired(): Promise<number> {
    const deleted = this.operations.deleteExpired();
    
    // Clear cache entries for expired profiles
    for (const [key, profile] of Array.from(this.cache.entries())) {
      if (this.isProfileExpired(profile)) {
        this.cache.delete(key);
      }
    }

    if (deleted > 0) {
      logger.info('Cleaned up expired profiles', { count: deleted });
    }

    return deleted;
  }

  /**
   * Clear the profile cache
   */
  clearCache(): void {
    this.cache.clear();
    logger.debug('Cleared packing profile cache');
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  private generateProfileId(repository: string, model: string): string {
    const normalizedRepo = repository.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const normalizedModel = model.toLowerCase().replace(/[^a-z0-9]/g, '-');
    return `profile-${normalizedRepo}-${normalizedModel}-${Date.now()}`;
  }

  private validateProfile(profile: PackingProfile): void {
    if (!profile.repository || !profile.model) {
      throw new Error('Profile must have repository and model');
    }

    if (profile.priorities) {
      const total = Object.values(profile.priorities).reduce((sum, val) => sum + val, 0);
      if (total === 0) {
        throw new Error('Priorities cannot all be zero');
      }
    }

    if (profile.budgetAllocation) {
      const { total, mustHave, important, supplementary, optional, reserve } = profile.budgetAllocation;
      const allocated = mustHave + important + supplementary + optional + reserve;
      if (allocated > total) {
        throw new Error(`Budget allocation (${allocated}) exceeds total (${total})`);
      }
    }
  }

  private isCacheValid(profile: PackingProfile): boolean {
    const age = Date.now() - profile.updatedAt.getTime();
    return age < this.cacheTimeout;
  }

  private isProfileExpired(profile: PackingProfile): boolean {
    if (!profile.ttl) {
      return false; // No TTL means never expires
    }
    const age = Date.now() - profile.createdAt.getTime();
    return age > profile.ttl;
  }

  private profileToRecord(profile: PackingProfile): Omit<PackingProfileRecord, 'created_at' | 'updated_at'> {
    return {
      id: profile.id,
      repository: profile.repository,
      model: profile.model,
      priorities: JSON.stringify(profile.priorities),
      budget_allocation: JSON.stringify(profile.budgetAllocation),
      capsule_strategies: JSON.stringify(profile.capsuleStrategies),
      truncation_strategies: JSON.stringify(profile.truncationStrategies),
      ttl: profile.ttl,
      version: profile.version,
      metadata: profile.metadata ? JSON.stringify(profile.metadata) : undefined
    };
  }

  private recordToProfile(record: PackingProfileRecord): PackingProfile {
    return {
      id: record.id,
      repository: record.repository,
      model: record.model,
      priorities: JSON.parse(record.priorities),
      budgetAllocation: JSON.parse(record.budget_allocation),
      capsuleStrategies: JSON.parse(record.capsule_strategies),
      truncationStrategies: JSON.parse(record.truncation_strategies),
      createdAt: new Date(record.created_at),
      updatedAt: new Date(record.updated_at),
      ttl: record.ttl,
      version: record.version,
      metadata: record.metadata ? JSON.parse(record.metadata) : undefined
    };
  }

  private async analyzeRepository(repository: string): Promise<any> {
    // This would analyze the repository structure
    // For now, return basic analysis
    try {
      const files = this.storage.files.findByRepo(repository);
      const chunks = this.storage.chunks.findByPath(repository, '');
      
      const analysis = {
        totalFiles: files.length,
        totalChunks: chunks.length,
        languages: {} as Record<string, number>,
        spanKinds: {} as Record<string, number>,
        avgFileSize: 0,
        avgChunkSize: 0,
        hasTests: false,
        hasConfig: false,
        hasDocs: false
      };

      // Analyze languages
      for (const file of files) {
        analysis.languages[file.lang] = (analysis.languages[file.lang] || 0) + 1;
        
        if (file.lang === 'test' || file.path.includes('/test/') || file.path.includes('.test.')) {
          analysis.hasTests = true;
        }
        if (file.path.includes('config') || file.path.includes('.env') || file.path.includes('package.json')) {
          analysis.hasConfig = true;
        }
        if (file.path.includes('docs/') || file.path.endsWith('.md')) {
          analysis.hasDocs = true;
        }
      }

      // Calculate averages
      if (files.length > 0) {
        analysis.avgFileSize = files.reduce((sum, file) => sum + ((file as any).size || 0), 0) / files.length;
      }
      
      if (chunks.length > 0) {
        analysis.avgChunkSize = chunks.reduce((sum, chunk) => sum + chunk.content.length, 0) / chunks.length;
      }

      return analysis;
    } catch (error) {
      logger.error('Failed to analyze repository', { 
        error: error instanceof Error ? error.message : String(error),
        repository 
      });
      
      // Return default analysis
      return {
        totalFiles: 0,
        totalChunks: 0,
        languages: {},
        spanKinds: {},
        avgFileSize: 0,
        avgChunkSize: 0,
        hasTests: false,
        hasConfig: false,
        hasDocs: false
      };
    }
  }

  private adjustPriorities(base: ContentPriorities, analysis: any): ContentPriorities {
    const adjusted = { ...base };

    // Boost test priority if repository has many tests
    if (analysis.hasTests) {
      adjusted.tests = Math.min(1.0, adjusted.tests + 0.2);
    }

    // Boost config priority if repository is configuration-heavy
    if (analysis.hasConfig) {
      adjusted.config = Math.min(1.0, adjusted.config + 0.3);
    }

    // Boost docs priority if repository has good documentation
    if (analysis.hasDocs) {
      adjusted.docs = Math.min(1.0, adjusted.docs + 0.2);
    }

    // Adjust based on dominant language
    const dominantLang = Object.entries(analysis.languages)
      .sort(([,a], [,b]) => (b as number) - (a as number))[0]?.[0];
    
    if (dominantLang === 'python') {
      adjusted.comments = Math.min(1.0, adjusted.comments + 0.1); // Python values documentation
    } else if (dominantLang === 'javascript' || dominantLang === 'typescript') {
      adjusted.examples = Math.min(1.0, adjusted.examples + 0.1); // JS/TS benefit from examples
    }

    return adjusted;
  }

  private adjustBudget(base: BudgetAllocation, model: string, analysis: any): BudgetAllocation {
    const adjusted = { ...base };

    // Adjust based on model capabilities
    if (model.includes('claude')) {
      adjusted.total = Math.min(200000, adjusted.total * 2); // Claude has larger context
    } else if (model.includes('gpt-3.5')) {
      adjusted.total = Math.max(2000, adjusted.total * 0.6); // GPT-3.5 has smaller context
    }

    // Adjust based on repository size
    if (analysis.totalChunks > 1000) {
      // Large repository - allocate more to important content
      adjusted.mustHave = Math.floor(adjusted.total * 0.3);
      adjusted.important = Math.floor(adjusted.total * 0.4);
      adjusted.supplementary = Math.floor(adjusted.total * 0.2);
      adjusted.optional = Math.floor(adjusted.total * 0.05);
      adjusted.reserve = adjusted.total - adjusted.mustHave - adjusted.important - adjusted.supplementary - adjusted.optional;
    } else if (analysis.totalChunks < 100) {
      // Small repository - can include more optional content
      adjusted.mustHave = Math.floor(adjusted.total * 0.2);
      adjusted.important = Math.floor(adjusted.total * 0.3);
      adjusted.supplementary = Math.floor(adjusted.total * 0.3);
      adjusted.optional = Math.floor(adjusted.total * 0.15);
      adjusted.reserve = adjusted.total - adjusted.mustHave - adjusted.important - adjusted.supplementary - adjusted.optional;
    }

    return adjusted;
  }

  private adjustCapsuleStrategies(base: CapsuleStrategies, analysis: any): CapsuleStrategies {
    const adjusted = { ...base };

    // Adjust capsule size based on average content size
    if (analysis.avgChunkSize > 2000) {
      adjusted.maxCapsuleSize = Math.min(2000, adjusted.maxCapsuleSize * 1.2);
      adjusted.capsuleThreshold = Math.min(2000, adjusted.capsuleThreshold * 1.2);
    } else if (analysis.avgChunkSize < 500) {
      adjusted.maxCapsuleSize = Math.max(500, adjusted.maxCapsuleSize * 0.8);
      adjusted.capsuleThreshold = Math.max(800, adjusted.capsuleThreshold * 0.8);
    }

    // Disable capsules for very small repositories
    if (analysis.totalChunks < 50) {
      adjusted.enabled = false;
    }

    return adjusted;
  }
}

export default PackingProfileManager;