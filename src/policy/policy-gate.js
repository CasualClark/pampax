import { logger } from '../config/logger.js';
import { config } from '../config/config-loader.js';

// Policy interfaces for documentation purposes
// SearchContext: { repo?, language?, filePaths?, queryLength?, budget?, scope? }
// PolicyDecision: { maxDepth, includeSymbols, includeFiles, includeContent, earlyStopThreshold, seedWeights }
// PolicyConfig: { symbol, config, api, incident, search }
// RepositoryPolicyConfig: { [repoName]: Partial<PolicyConfig> }

/**
 * Default policy configurations for each intent type
 */
const DEFAULT_POLICIES = {
  symbol: {
    maxDepth: 2,
    includeSymbols: true,
    includeFiles: false,
    includeContent: true,
    earlyStopThreshold: 3, // Level-2 defs + 1 usage + 1 test
    seedWeights: {
      'definition': 2.0,
      'declaration': 1.8,
      'implementation': 1.5,
      'usage': 1.0,
      'test': 0.8,
      'reference': 0.5
    }
  },
  config: {
    maxDepth: 1,
    includeSymbols: false,
    includeFiles: true,
    includeContent: true,
    earlyStopThreshold: 2, // key + default + source file
    seedWeights: {
      'config': 2.0,
      'setting': 1.8,
      'environment': 1.5,
      'constant': 1.2,
      'default': 1.0
    }
  },
  api: {
    maxDepth: 2,
    includeSymbols: true,
    includeFiles: false,
    includeContent: true,
    earlyStopThreshold: 2, // handler signature + router registration
    seedWeights: {
      'handler': 2.0,
      'endpoint': 1.8,
      'route': 1.5,
      'controller': 1.3,
      'middleware': 1.0,
      'registration': 0.8
    }
  },
  incident: {
    maxDepth: 3,
    includeSymbols: true,
    includeFiles: true,
    includeContent: true,
    earlyStopThreshold: 5, // callers r=1 + last N diffs touching those spans
    seedWeights: {
      'error': 2.5,
      'exception': 2.2,
      'caller': 2.0,
      'stack': 1.8,
      'diff': 1.5,
      'recent': 1.2,
      'related': 1.0
    }
  },
  search: {
    maxDepth: 2,
    includeSymbols: true,
    includeFiles: true,
    includeContent: true,
    earlyStopThreshold: 10, // General search, more generous
    seedWeights: {
      'match': 1.0,
      'relevant': 0.9,
      'similar': 0.8,
      'related': 0.7
    }
  }
};

/**
 * Policy Gate - Maps intent to retrieval policies
 * 
 * This class evaluates intent results and search context to determine
 * the optimal retrieval policy for a given query.
 */
export class PolicyGate {
  constructor(repositoryPolicies = {}) {
    this.repositoryPolicies = repositoryPolicies;
    this.defaultPolicies = this.loadPoliciesFromConfig() || DEFAULT_POLICIES;
    
    logger.debug('PolicyGate initialized', { 
      repositoryCount: Object.keys(this.repositoryPolicies).length 
    }, 'policy-gate');
  }

  /**
   * Evaluate intent and context to produce a policy decision
   */
  evaluate(intent, context = {}) {
    const basePolicy = this.getBasePolicy(intent.intent);
    const repositoryPolicy = this.getRepositoryPolicy(context.repo);
    const mergedPolicy = this.mergePolicies(basePolicy, repositoryPolicy?.[intent.intent]);
    const contextualPolicy = this.applyContextAdjustments(mergedPolicy, intent, context);

    logger.debug('Policy evaluation completed', {
      intent: intent.intent,
      confidence: intent.confidence,
      repo: context.repo,
      maxDepth: contextualPolicy.maxDepth,
      earlyStopThreshold: contextualPolicy.earlyStopThreshold
    }, 'policy-gate');

    return contextualPolicy;
  }

  /**
   * Get base policy for intent type
   */
  getBasePolicy(intentType) {
    const policy = this.defaultPolicies[intentType];
    if (!policy) {
      logger.warn(`Unknown intent type: ${intentType}, using search policy`, {}, 'policy-gate');
      return this.defaultPolicies.search;
    }
    return { ...policy };
  }

  /**
   * Get repository-specific policy overrides
   */
  getRepositoryPolicy(repoName) {
    if (!repoName) {
      return undefined;
    }

    // Try exact match first
    if (this.repositoryPolicies[repoName]) {
      return this.repositoryPolicies[repoName];
    }

    // Try pattern matching for repo names
    for (const [pattern, policy] of Object.entries(this.repositoryPolicies)) {
      if (this.matchesPattern(repoName, pattern)) {
        return policy;
      }
    }

    return undefined;
  }

  /**
   * Check if repository name matches a pattern
   */
  matchesPattern(repoName, pattern) {
    // Simple glob-like matching
    if (pattern.includes('*')) {
      const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
      return regex.test(repoName);
    }
    return false;
  }

  /**
   * Merge base policy with repository overrides
   */
  mergePolicies(base, override) {
    if (!override) {
      return base;
    }

    return {
      maxDepth: override.maxDepth ?? base.maxDepth,
      includeSymbols: override.includeSymbols ?? base.includeSymbols,
      includeFiles: override.includeFiles ?? base.includeFiles,
      includeContent: override.includeContent ?? base.includeContent,
      earlyStopThreshold: override.earlyStopThreshold ?? base.earlyStopThreshold,
      seedWeights: { ...base.seedWeights, ...override.seedWeights }
    };
  }

  /**
   * Apply context-based adjustments to policy
   */
  applyContextAdjustments(policy, intent, context) {
    const adjusted = { ...policy };

    // Adjust based on confidence
    if (intent.confidence < 0.5) {
      // Lower confidence = more conservative search
      adjusted.maxDepth = Math.max(1, adjusted.maxDepth - 1);
      adjusted.earlyStopThreshold = Math.max(2, adjusted.earlyStopThreshold - 1);
    } else if (intent.confidence > 0.8) {
      // Higher confidence = more aggressive search
      adjusted.maxDepth = Math.min(5, adjusted.maxDepth + 1);
      adjusted.earlyStopThreshold = Math.min(15, adjusted.earlyStopThreshold + 2);
    }

    // Adjust based on query length
    if (context.queryLength) {
      if (context.queryLength < 10) {
        // Short queries = broader search
        adjusted.maxDepth = Math.min(5, adjusted.maxDepth + 1);
      } else if (context.queryLength > 50) {
        // Long queries = more focused search
        adjusted.maxDepth = Math.max(1, adjusted.maxDepth - 1);
        adjusted.earlyStopThreshold = Math.max(2, adjusted.earlyStopThreshold - 1);
      }
    }

    // Adjust based on budget
    if (context.budget && context.budget < 2000) {
      // Low budget = conservative search
      adjusted.includeContent = false;
      adjusted.earlyStopThreshold = Math.max(2, Math.floor(adjusted.earlyStopThreshold * 0.7));
    }

    // Adjust based on language-specific patterns
    if (context.language) {
      adjusted.seedWeights = this.adjustWeightsForLanguage(adjusted.seedWeights, context.language);
    }

    return adjusted;
  }

  /**
   * Adjust seed weights based on programming language
   */
  adjustWeightsForLanguage(weights, language) {
    const adjusted = { ...weights };

    switch (language.toLowerCase()) {
      case 'python':
        adjusted['definition'] = (adjusted['definition'] || 1.0) * 1.2; // Python values definitions highly
        adjusted['implementation'] = (adjusted['implementation'] || 1.0) * 1.1;
        break;
      case 'typescript':
      case 'javascript':
        adjusted['handler'] = (adjusted['handler'] || 1.0) * 1.3; // JS/TS value handlers highly
        adjusted['middleware'] = (adjusted['middleware'] || 1.0) * 1.2;
        break;
      case 'java':
        adjusted['class'] = (adjusted['class'] || 1.0) * 1.4; // Java is class-heavy
        break;
      case 'go':
        adjusted['package'] = (adjusted['package'] || 1.0) * 1.3; // Go values packages
        break;
    }

    return adjusted;
  }

  /**
   * Load policies from configuration
   */
  loadPoliciesFromConfig() {
    try {
      const appConfig = config.getConfig();
      if (appConfig.policy) {
        logger.info('Loading policies from configuration', {}, 'policy-gate');
        return { ...DEFAULT_POLICIES, ...appConfig.policy };
      }
    } catch (error) {
      logger.warn('Failed to load policies from config, using defaults', { error }, 'policy-gate');
    }
    return null;
  }

  /**
   * Update repository-specific policies
   */
  updateRepositoryPolicies(policies) {
    this.repositoryPolicies = { ...this.repositoryPolicies, ...policies };
    logger.info('Repository policies updated', { 
      repositoryCount: Object.keys(this.repositoryPolicies).length 
    }, 'policy-gate');
  }

  /**
   * Get policy for a specific repository and intent
   */
  getPolicy(repoName, intentType) {
    const repositoryPolicy = this.getRepositoryPolicy(repoName);
    const basePolicy = this.getBasePolicy(intentType);
    
    if (repositoryPolicy && repositoryPolicy[intentType]) {
      return this.mergePolicies(basePolicy, repositoryPolicy[intentType]);
    }
    
    return basePolicy;
  }

  /**
   * Get all available policies
   */
  getAllPolicies() {
    return {
      default: this.defaultPolicies,
      repository: this.repositoryPolicies
    };
  }

  /**
   * Validate policy configuration
   */
  validatePolicy(policy) {
    const errors = [];

    if (policy.maxDepth !== undefined && (policy.maxDepth < 1 || policy.maxDepth > 10)) {
      errors.push('maxDepth must be between 1 and 10');
    }

    if (policy.earlyStopThreshold !== undefined && (policy.earlyStopThreshold < 1 || policy.earlyStopThreshold > 50)) {
      errors.push('earlyStopThreshold must be between 1 and 50');
    }

    if (policy.seedWeights) {
      for (const [key, weight] of Object.entries(policy.seedWeights)) {
        if (typeof weight !== 'number' || weight < 0 || weight > 5) {
          errors.push(`seedWeight for '${key}' must be a number between 0 and 5`);
        }
      }
    }

    return errors;
  }
}

// Export singleton instance
export const policyGate = new PolicyGate();