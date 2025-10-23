import { logger } from '../config/logger.js';

export type IntentType = 'symbol' | 'config' | 'api' | 'incident' | 'search';

export interface QueryEntity {
  type: 'function' | 'class' | 'file' | 'config' | 'route';
  value: string;
  position: number;
}

export interface IntentResult {
  intent: IntentType;
  confidence: number;
  entities: QueryEntity[];
  suggestedPolicies: string[];
}

export interface IntentClassifierConfig {
  thresholds: {
    symbol: number;
    config: number;
    api: number;
    incident: number;
  };
  patterns: {
    symbol: string[];
    config: string[];
    api: string[];
    incident: string[];
  };
  entityPatterns: {
    function: RegExp[];
    class: RegExp[];
    file: RegExp[];
    config: RegExp[];
    route: RegExp[];
  };
}

export class IntentClassifier {
  private config: IntentClassifierConfig;

  constructor(config?: Partial<IntentClassifierConfig>) {
    this.config = {
      thresholds: {
        symbol: 0.2,
        config: 0.2,
        api: 0.2,
        incident: 0.2,
        ...config?.thresholds
      },
      patterns: {
        symbol: [
          'function', 'method', 'class', 'definition', 'implementation', 'code',
          'declaration', 'signature', 'return type', 'parameter', 'argument'
        ],
        config: [
          'config', 'configuration', 'setting', 'settings', 'environment', 'env',
          '.env', 'yaml', 'yml', 'json', 'ini', 'toml', 'properties', 'constant'
        ],
        api: [
          'api', 'endpoint', 'route', 'handler', 'rest', 'http', 'get', 'post',
          'put', 'delete', 'patch', 'request', 'response', 'middleware', 'controller'
        ],
        incident: [
          'error', 'bug', 'issue', 'crash', 'failure', 'exception', 'problem',
          'debug', 'fix', 'broken', 'wrong', 'incorrect', 'fail', 'panic'
        ],
        ...config?.patterns
      },
entityPatterns: {
        function: [
          /\b(getUserById|calculateTotal|handleError|validateInput|fetchData|updateRecord|authenticate|render|init|setup|start|stop|connect|parse|save|load|read|write|delete|create|update|get|set|add|remove|find|search|check|verify|login|logout|open|close|show|hide)\b/gi,
          /\b([a-zA-Z_][a-zA-Z0-9_]{2,})\s*\(/g,
          /\bfunction\s+([a-zA-Z_][a-zA-Z0-9_]*)/g,
          /\bdef\s+([a-zA-Z_][a-zA-Z0-9_]*)/g,
        ],
        class: [
          /\b(UserService|OrderService|AuthService|DatabaseService|LoggerService|ConfigService|EmailService|FileService|ReportService|AnalyticsService|SecurityService|RepositoryService|EntityService|ModelService|ControllerService|ComponentService)\b/gi,
          /\b(User|Order|Product|Customer|Account|Payment|Auth|Database|Logger|Config|Email|File|Report|Analytics|Security|Repository|Entity|Model|View|Controller|Component|Application|Manager|Handler|Processor|Client|Server)\b/gi,
          /\bclass\s+([A-Z][a-zA-Z0-9_]*)/g,
          /\binterface\s+([A-Z][a-zA-Z0-9_]*)/g,
          /\b([A-Z][a-zA-Z0-9_]*)\b/g,
        ],
        file: [
          /\b([a-zA-Z0-9_\-\/]+\.(js|ts|py|java|cpp|c|h|go|rs|php|rb|swift|kt|dart|json|yaml|yml|xml|html|css|sql|md|txt))\b/g,
        ],
        config: [
          /\b([a-zA-Z0-9_\-]+\.(env|config|conf|ini|toml|properties|yaml|yml|json))\b/g,
        ],
        route: [
          /\b\/[a-zA-Z0-9_\-\/]*\b/g,
          /\b(GET|POST|PUT|DELETE|PATCH)\s+\/[^\s]*/g,
        ],
        ...config?.entityPatterns
      }
    };
  }

  /**
   * Classify a query into intent type with confidence scoring
   */
  classify(query: string | null | undefined): IntentResult {
    // Handle edge cases
    if (!query || typeof query !== 'string') {
      return {
        intent: 'search',
        confidence: 0,
        entities: [],
        suggestedPolicies: ['search-default']
      };
    }

    const normalizedQuery = query.toLowerCase().trim();
    
    logger.debug('Classifying intent', { query: normalizedQuery }, 'intent-classifier');

    // Calculate scores for each intent
    const scores = {
      symbol: this.calculateIntentScore(normalizedQuery, 'symbol'),
      config: this.calculateIntentScore(normalizedQuery, 'config'),
      api: this.calculateIntentScore(normalizedQuery, 'api'),
      incident: this.calculateIntentScore(normalizedQuery, 'incident')
    };

    // Find the best intent
    const bestIntent = this.findBestIntent(scores);
    
    // Extract entities
    const entities = this.extractEntities(query);
    
    // Get suggested policies
    const suggestedPolicies = this.getSuggestedPolicies(bestIntent.intent, entities);

    const result: IntentResult = {
      intent: bestIntent.intent,
      confidence: bestIntent.confidence,
      entities,
      suggestedPolicies
    };

    logger.debug('Intent classification result', { 
      intent: result.intent, 
      confidence: result.confidence,
      entityCount: entities.length 
    }, 'intent-classifier');

    return result;
  }

  /**
   * Calculate score for a specific intent based on keyword matches
   */
  private calculateIntentScore(query: string, intent: keyof typeof this.config.patterns): number {
    const patterns = this.config.patterns[intent];
    let score = 0;
    let matches = 0;

    for (const pattern of patterns) {
      if (query.includes(pattern)) {
        score += 1;
        matches++;
      }
    }

    // Normalize score based on pattern count
    let normalizedScore = matches > 0 ? score / patterns.length : 0;
    
    // Boost score for exact phrase matches
    if (query.includes(patterns[0])) {
      normalizedScore += 0.2;
    }

    // Additional boost for multiple matches
    if (matches >= 2) {
      normalizedScore += 0.1 * matches;
    }

    return Math.min(normalizedScore, 1.0);
  }

  /**
   * Find the best intent based on scores and thresholds
   */
  private findBestIntent(scores: Record<string, number>): { intent: IntentType; confidence: number } {
    let bestIntent: IntentType = 'search';
    let bestScore = 0;

    // Check each intent against its threshold
    for (const [intent, score] of Object.entries(scores)) {
      const threshold = this.config.thresholds[intent as keyof typeof this.config.thresholds];
      
      if (score >= threshold && score > bestScore) {
        bestIntent = intent as IntentType;
        bestScore = score;
      }
    }

    // If no intent meets threshold, default to search
    if (bestScore === 0) {
      bestIntent = 'search';
      bestScore = 0.3; // Give search a minimal confidence
    }

    return { intent: bestIntent, confidence: bestScore };
  }

  /**
   * Extract entities from the query using regex patterns
   */
  private extractEntities(query: string): QueryEntity[] {
    const entities: QueryEntity[] = [];

    // Extract each type of entity
    for (const [entityType, patterns] of Object.entries(this.config.entityPatterns)) {
      for (const pattern of patterns) {
        let match;
        while ((match = pattern.exec(query)) !== null) {
          // For patterns with capture groups, use the captured group
          const value = match[1] || match[0];
          
          // Skip empty matches and common words
          if (!value || this.isCommonWord(value.toLowerCase())) {
            continue;
          }

          entities.push({
            type: entityType as QueryEntity['type'],
            value: value.trim(),
            position: match.index
          });
        }
      }
    }

    // Remove duplicates and sort by position
    const uniqueEntities = entities.filter((entity, index, arr) => 
      arr.findIndex(e => e.value === entity.value && e.position === entity.position) === index
    ).sort((a, b) => a.position - b.position);

    return uniqueEntities;
  }

  /**
   * Check if a word is too common to be a meaningful entity
   */
  private isCommonWord(word: string): boolean {
    const commonWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'by', 'from', 'as', 'is', 'are', 'was', 'were', 'be',
      'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
      'would', 'could', 'should', 'may', 'might', 'must', 'can', 'this',
      'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they',
      'what', 'where', 'when', 'why', 'how', 'who', 'which', 'whose'
    ]);

    return commonWords.has(word) || word.length < 2;
  }

  /**
   * Get suggested policies based on intent and entities
   */
  private getSuggestedPolicies(intent: IntentType, entities: QueryEntity[]): string[] {
    const policies: string[] = [];

    switch (intent) {
      case 'symbol':
        policies.push('symbol-level-2');
        if (entities.some(e => e.type === 'function')) {
          policies.push('symbol-function-usage');
        }
        if (entities.some(e => e.type === 'class')) {
          policies.push('symbol-class-members');
        }
        break;

      case 'config':
        policies.push('config-key-source');
        if (entities.some(e => e.type === 'file')) {
          policies.push('config-file-context');
        }
        break;

      case 'api':
        policies.push('api-handler-registration');
        if (entities.some(e => e.type === 'route')) {
          policies.push('api-route-mapping');
        }
        break;

      case 'incident':
        policies.push('incident-callers-diffs');
        if (entities.some(e => e.type === 'function')) {
          policies.push('incident-function-context');
        }
        break;

      case 'search':
      default:
        policies.push('search-default');
        if (entities.length > 0) {
          policies.push('search-entity-boost');
        }
        break;
    }

    return policies;
  }

  /**
   * Update classifier configuration
   */
  updateConfig(config: Partial<IntentClassifierConfig>): void {
    this.config = {
      thresholds: { ...this.config.thresholds, ...config.thresholds },
      patterns: { ...this.config.patterns, ...config.patterns },
      entityPatterns: { ...this.config.entityPatterns, ...config.entityPatterns }
    };

    logger.info('Intent classifier configuration updated', { config }, 'intent-classifier');
  }

  /**
   * Get current configuration
   */
  getConfig(): IntentClassifierConfig {
    return { ...this.config };
  }

  /**
   * Add custom patterns for an intent
   */
  addPatterns(intent: keyof typeof this.config.patterns, patterns: string[]): void {
    this.config.patterns[intent] = [...this.config.patterns[intent], ...patterns];
    logger.debug(`Added patterns to ${intent} intent`, { patterns }, 'intent-classifier');
  }

  /**
   * Add custom entity patterns
   */
  addEntityPatterns(entityType: keyof typeof this.config.entityPatterns, patterns: RegExp[]): void {
    this.config.entityPatterns[entityType] = [...this.config.entityPatterns[entityType], ...patterns];
    logger.debug(`Added entity patterns for ${entityType}`, { patternCount: patterns.length }, 'intent-classifier');
  }
}

// Export singleton instance
export const intentClassifier = new IntentClassifier();