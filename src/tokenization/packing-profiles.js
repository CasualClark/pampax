/**
 * Simple packing profiles stub for CLI tests
 */

// Mock MODEL_PROFILES for CLI tests
export const MODEL_PROFILES = {
  'gpt-4': {
    budget: 8000,
    priorities: {
      code: 0.8,
      documentation: 0.6,
      tests: 0.7
    }
  },
  'claude-3': {
    budget: 100000,
    priorities: {
      code: 0.8,
      documentation: 0.6,
      tests: 0.7
    }
  },
  'gpt-3.5-turbo': {
    budget: 16000,
    priorities: {
      code: 0.8,
      documentation: 0.6,
      tests: 0.7
    }
  }
};

export const DEFAULT_PRIORITIES = {
  code: 0.8,
  documentation: 0.6,
  tests: 0.7
};

export const DEFAULT_BUDGET_ALLOCATION = {
  code: 0.6,
  documentation: 0.2,
  tests: 0.2
};

export const DEFAULT_CAPSULE_STRATEGIES = {
  code: 'semantic',
  documentation: 'linear',
  tests: 'random'
};

export const DEFAULT_TRUNCATION_STRATEGIES = {
  code: 'smart',
  documentation: 'end',
  tests: 'beginning'
};

export const INTENT_PRIORITY_ADJUSTMENTS = {
  'bug-fix': { code: 0.9, tests: 0.8 },
  'feature': { code: 0.8, documentation: 0.7 },
  'documentation': { documentation: 0.9 },
  'testing': { tests: 0.9 }
};

// Simple PackingProfileManager class
export class PackingProfileManager {
  constructor(db, options = {}) {
    this.db = db;
    this.options = options;
  }

  async getProfile(repository, model) {
    return MODEL_PROFILES[model] || MODEL_PROFILES['gpt-4'];
  }

  async saveProfile(profile) {
    // Mock save implementation
    return profile;
  }

  async deleteProfile(id) {
    // Mock delete implementation
    return true;
  }

  async listProfiles(repository) {
    // Mock list implementation
    return Object.entries(MODEL_PROFILES).map(([model, profile]) => ({
      id: `${repository}-${model}`,
      repository,
      model,
      ...profile
    }));
  }
}

export default {
  MODEL_PROFILES,
  DEFAULT_PRIORITIES,
  DEFAULT_BUDGET_ALLOCATION,
  DEFAULT_CAPSULE_STRATEGIES,
  DEFAULT_TRUNCATION_STRATEGIES,
  INTENT_PRIORITY_ADJUSTMENTS,
  PackingProfileManager
};