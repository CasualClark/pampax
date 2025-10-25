/**
 * Degrade Policy System with Capsule Downshifting for PAMPAX
 * 
 * This module implements:
 * - Policy-driven degradation with capsule downshifting before dropping content
 * - Configurable degrade thresholds and strategies
 * - Content-aware degradation based on importance and type
 * - Progressive degradation levels with smart capsule creation
 * - Integration with tokenizer factory for accurate token counting
 * - Dynamic policy adjustment based on model capabilities
 * - Real-time degradation monitoring and feedback
 */

import { logger } from '../config/logger.js';
import { SearchResult } from './search-integration.js';
import { PackingProfile } from './packing-profiles.js';

// ============================================================================
// Core Interfaces
// ============================================================================

export interface DegradeThresholds {
  level1: number;    // Remove low-priority items (e.g., 90% of budget)
  level2: number;    // Truncate medium-priority items (e.g., 80% of budget)
  level3: number;    // Create capsule summaries (e.g., 70% of budget)
  level4: number;    // Critical minimal representations (e.g., 60% of budget)
  emergency: number; // Last resort (e.g., 50% of budget)
}

export interface DegradeStrategies {
  level1Strategy: 'remove-low-priority' | 'truncate-comments' | 'compress-whitespace';
  level2Strategy: 'truncate-medium' | 'smart-head-tail' | 'preserve-signatures';
  level3Strategy: 'capsule-summary' | 'key-extraction' | 'outline-only';
  level4Strategy: 'minimal-essence' | 'signatures-only' | 'key-words';
  emergencyStrategy: 'titles-only' | 'file-list' | 'path-only';
}

export interface CapsuleConfig {
  maxCodeLength: number;
  maxCommentLength: number;
  maxTestLength: number;
  maxDocLength: number;
  preserveTests: boolean;
  preserveExamples: boolean;
  preserveSignatures: boolean;
  summaryStyle: 'concise' | 'detailed' | 'minimal';
  compressionRatio: number;    // Target compression ratio (0.1 = 90% reduction)
  qualityThreshold: number;    // Minimum quality score (0-1)
}

export interface DegradePolicy {
  id: string;
  name: string;
  description: string;
  thresholds: DegradeThresholds;
  strategies: DegradeStrategies;
  capsuleConfig: CapsuleConfig;
  modelCapabilities: {
    contextSize: number;
    supportsCompression: boolean;
    qualitySensitivity: number; // 0-1, how sensitive to quality loss
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface DegradationLevel {
  level: number;
  name: string;
  threshold: number;
  strategy: string;
  description: string;
  estimatedSavings: number;
}

export interface DegradedResult {
  original: SearchResult[];
  degraded: SearchResult[];
  savings: {
    originalTokens: number;
    degradedTokens: number;
    savingsPercentage: number;
    compressionRatio: number;
  };
  applied: {
    level: number;
    strategy: string;
    itemsProcessed: number;
    capsulesCreated: number;
    qualityScore: number;
  };
  performance: {
    degradationTime: number;
    estimationTime: number;
    totalTime: number;
  };
  policy: DegradePolicy;
}

export interface CapsuleMetadata {
  id: string;
  originalId: string;
  type: 'code' | 'test' | 'comment' | 'doc' | 'example';
  compressionRatio: number;
  qualityScore: number;
  preservedElements: string[];
  strategy: string;
  originalTokens: number;
  capsuleTokens: number;
}

export interface TokenizerProvider {
  countTokens(text: string): number;
  estimateTokens(text: string): number;
  getModel(): string;
  getContextSize(): number;
}

// ============================================================================
// Default Policy Definitions
// ============================================================================

export const DEFAULT_THRESHOLDS: DegradeThresholds = {
  level1: 0.9,    // 90% of budget
  level2: 0.8,    // 80% of budget
  level3: 0.7,    // 70% of budget
  level4: 0.6,    // 60% of budget
  emergency: 0.5  // 50% of budget
};

export const DEFAULT_STRATEGIES: DegradeStrategies = {
  level1Strategy: 'remove-low-priority',
  level2Strategy: 'smart-head-tail',
  level3Strategy: 'capsule-summary',
  level4Strategy: 'minimal-essence',
  emergencyStrategy: 'titles-only'
};

export const DEFAULT_CAPSULE_CONFIG: CapsuleConfig = {
  maxCodeLength: 500,
  maxCommentLength: 200,
  maxTestLength: 300,
  maxDocLength: 400,
  preserveTests: true,
  preserveExamples: true,
  preserveSignatures: true,
  summaryStyle: 'concise',
  compressionRatio: 0.3,
  qualityThreshold: 0.6
};

// Model-specific policy templates
export const MODEL_DEGRADE_POLICIES = {
  'gpt-4': {
    thresholds: { ...DEFAULT_THRESHOLDS },
    strategies: { ...DEFAULT_STRATEGIES },
    capsuleConfig: { ...DEFAULT_CAPSULE_CONFIG, qualityThreshold: 0.7 },
    modelCapabilities: {
      contextSize: 8192,
      supportsCompression: true,
      qualitySensitivity: 0.7
    }
  },
  'gpt-3.5-turbo': {
    thresholds: { ...DEFAULT_THRESHOLDS, level1: 0.85, level2: 0.75 },
    strategies: { ...DEFAULT_STRATEGIES, level2Strategy: 'truncate-medium' as const },
    capsuleConfig: { ...DEFAULT_CAPSULE_CONFIG, compressionRatio: 0.4, qualityThreshold: 0.5 },
    modelCapabilities: {
      contextSize: 4096,
      supportsCompression: true,
      qualitySensitivity: 0.5
    }
  },
  'claude-3': {
    thresholds: { ...DEFAULT_THRESHOLDS, level3: 0.75, level4: 0.65 },
    strategies: { ...DEFAULT_STRATEGIES, level3Strategy: 'key-extraction' as const },
    capsuleConfig: { ...DEFAULT_CAPSULE_CONFIG, qualityThreshold: 0.8, compressionRatio: 0.25 },
    modelCapabilities: {
      contextSize: 100000,
      supportsCompression: true,
      qualitySensitivity: 0.8
    }
  },
  'default': {
    thresholds: DEFAULT_THRESHOLDS,
    strategies: DEFAULT_STRATEGIES,
    capsuleConfig: DEFAULT_CAPSULE_CONFIG,
    modelCapabilities: {
      contextSize: 4096,
      supportsCompression: true,
      qualitySensitivity: 0.6
    }
  }
};

// ============================================================================
// Capsule Creation System
// ============================================================================

export class CapsuleCreator {
  constructor(private config: CapsuleConfig, private tokenizer: TokenizerProvider) {}

  /**
   * Create a capsule from a search result
   */
  async createCapsule(item: SearchResult, type: string): Promise<{ content: string; metadata: CapsuleMetadata }> {
    const originalTokens = this.tokenizer.countTokens(item.content);
    const capsuleType = this.detectCapsuleType(item, type);
    
    let capsuleContent: string;
    let qualityScore: number;
    let preservedElements: string[];

    switch (capsuleType) {
      case 'code':
        ({ content: capsuleContent, qualityScore, preservedElements } = 
          await this.createCodeCapsule(item));
        break;
      case 'test':
        ({ content: capsuleContent, qualityScore, preservedElements } = 
          await this.createTestCapsule(item));
        break;
      case 'comment':
        ({ content: capsuleContent, qualityScore, preservedElements } = 
          await this.createCommentCapsule(item));
        break;
      case 'doc':
        ({ content: capsuleContent, qualityScore, preservedElements } = 
          await this.createDocCapsule(item));
        break;
      case 'example':
        ({ content: capsuleContent, qualityScore, preservedElements } = 
          await this.createExampleCapsule(item));
        break;
      default:
        ({ content: capsuleContent, qualityScore, preservedElements } = 
          await this.createGenericCapsule(item));
    }

    const capsuleTokens = this.tokenizer.countTokens(capsuleContent);
    const compressionRatio = capsuleTokens / originalTokens;

    // Ensure capsule meets quality threshold
    if (qualityScore < this.config.qualityThreshold) {
      // Fall back to more aggressive compression
      capsuleContent = this.createMinimalCapsule(item);
      qualityScore = this.calculateQualityScore(item.content, capsuleContent, capsuleType);
    }

    const metadata: CapsuleMetadata = {
      id: `${item.id}-capsule-${Date.now()}`,
      originalId: item.id,
      type: capsuleType,
      compressionRatio,
      qualityScore,
      preservedElements,
      strategy: this.config.summaryStyle,
      originalTokens,
      capsuleTokens
    };

    return { content: capsuleContent, metadata };
  }

  /**
   * Detect the type of capsule to create
   */
  private detectCapsuleType(item: SearchResult, fallbackType: string): 'code' | 'test' | 'comment' | 'doc' | 'example' {
    const path = item.path.toLowerCase();
    const content = item.content.toLowerCase();
    const spanKind = item.spanKind?.toLowerCase();

    // Test files
    if (path.includes('/test/') || path.includes('.test.') || path.includes('.spec.') ||
        path.includes('__tests__') || spanKind === 'test') {
      return 'test';
    }

    // Documentation files
    if (path.includes('docs/') || path.endsWith('.md') || path.endsWith('.rst') ||
        path.includes('readme') || spanKind === 'comment') {
      return 'doc';
    }

    // Example files
    if (path.includes('example') || path.includes('demo') || path.includes('sample') ||
        path.includes('/examples/')) {
      return 'example';
    }

    // Comment-heavy content
    if (content.includes('//') || content.includes('/*') || content.includes('#') ||
        content.includes("'''") || content.includes('"""')) {
      return 'comment';
    }

    // Code files (default)
    return 'code';
  }

  /**
   * Create a code capsule preserving essential structure
   */
  private async createCodeCapsule(item: SearchResult): Promise<{ content: string; qualityScore: number; preservedElements: string[] }> {
    const lines = item.content.split('\n');
    const essentialLines: string[] = [];
    const preservedElements: string[] = [];
    
    // Track imports, exports, class/function signatures
    for (const line of lines) {
      const trimmed = line.trim();
      
      if (this.isSignatureLine(trimmed)) {
        essentialLines.push(line);
        preservedElements.push('signature');
      } else if (this.isImportExportLine(trimmed)) {
        essentialLines.push(line);
        preservedElements.push('import');
      } else if (this.isKeyLogicLine(trimmed)) {
        essentialLines.push(line);
        preservedElements.push('logic');
      } else if (this.config.preserveSignatures && this.isCommentLine(trimmed)) {
        // Keep key comments only
        if (trimmed.includes('@param') || trimmed.includes('@return') || 
            trimmed.includes('@throws') || trimmed.includes('TODO') ||
            trimmed.includes('FIXME') || trimmed.includes('NOTE')) {
          essentialLines.push(line);
          preservedElements.push('comment');
        }
      }
    }

    // Apply length limit
    let capsuleContent = essentialLines.join('\n');
    if (this.tokenizer.countTokens(capsuleContent) > this.config.maxCodeLength) {
      capsuleContent = this.truncateToLength(capsuleContent, this.config.maxCodeLength);
    }

    const qualityScore = this.calculateQualityScore(item.content, capsuleContent, 'code');
    
    return { content: capsuleContent, qualityScore, preservedElements };
  }

  /**
   * Create a test capsule preserving test structure
   */
  private async createTestCapsule(item: SearchResult): Promise<{ content: string; qualityScore: number; preservedElements: string[] }> {
    const lines = item.content.split('\n');
    const testLines: string[] = [];
    const preservedElements: string[] = [];
    
    let inTest = false;
    let testDescription = '';
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      // Detect test function/method
      if (this.isTestFunction(trimmed)) {
        if (inTest && testDescription) {
          testLines.push(testDescription);
          preservedElements.push('test-description');
        }
        testLines.push(line); // Test signature
        preservedElements.push('test-signature');
        testDescription = '';
        inTest = true;
      } else if (inTest && this.isAssertionLine(trimmed)) {
        testLines.push(line);
        preservedElements.push('assertion');
      } else if (inTest && this.isKeyTestSetup(trimmed)) {
        testLines.push(line);
        preservedElements.push('setup');
      } else if (inTest && trimmed.length > 0) {
        // Collect test description
        testDescription += (testDescription ? ' ' : '') + trimmed;
      }
    }
    
    // Add last test description
    if (inTest && testDescription) {
      testLines.push(testDescription);
      preservedElements.push('test-description');
    }

    // Apply length limit
    let capsuleContent = testLines.join('\n');
    if (this.tokenizer.countTokens(capsuleContent) > this.config.maxTestLength) {
      capsuleContent = this.truncateToLength(capsuleContent, this.config.maxTestLength);
    }

    const qualityScore = this.calculateQualityScore(item.content, capsuleContent, 'test');
    
    return { content: capsuleContent, qualityScore, preservedElements };
  }

  /**
   * Create a comment capsule extracting key insights
   */
  private async createCommentCapsule(item: SearchResult): Promise<{ content: string; qualityScore: number; preservedElements: string[] }> {
    const lines = item.content.split('\n');
    const commentLines: string[] = [];
    const preservedElements: string[] = [];
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      if (this.isCommentLine(trimmed)) {
        // Extract meaningful comments
        if (this.isMeaningfulComment(trimmed)) {
          commentLines.push(line);
          preservedElements.push('meaningful-comment');
        }
      } else if (this.config.preserveSignatures && this.isSignatureLine(trimmed)) {
        commentLines.push(line);
        preservedElements.push('context-signature');
      }
    }

    // Apply length limit
    let capsuleContent = commentLines.join('\n');
    if (this.tokenizer.countTokens(capsuleContent) > this.config.maxCommentLength) {
      capsuleContent = this.truncateToLength(capsuleContent, this.config.maxCommentLength);
    }

    const qualityScore = this.calculateQualityScore(item.content, capsuleContent, 'comment');
    
    return { content: capsuleContent, qualityScore, preservedElements };
  }

  /**
   * Create a documentation capsule summarizing key points
   */
  private async createDocCapsule(item: SearchResult): Promise<{ content: string; qualityScore: number; preservedElements: string[] }> {
    const lines = item.content.split('\n');
    const docLines: string[] = [];
    const preservedElements: string[] = [];
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      // Keep headers, lists, code blocks, and key sentences
      if (this.isHeaderLine(trimmed)) {
        docLines.push(line);
        preservedElements.push('header');
      } else if (this.isListItem(trimmed)) {
        docLines.push(line);
        preservedElements.push('list-item');
      } else if (this.isCodeBlock(trimmed)) {
        docLines.push(line);
        preservedElements.push('code-block');
      } else if (this.isKeyDocumentationSentence(trimmed)) {
        docLines.push(line);
        preservedElements.push('key-sentence');
      }
    }

    // Apply length limit
    let capsuleContent = docLines.join('\n');
    if (this.tokenizer.countTokens(capsuleContent) > this.config.maxDocLength) {
      capsuleContent = this.truncateToLength(capsuleContent, this.config.maxDocLength);
    }

    const qualityScore = this.calculateQualityScore(item.content, capsuleContent, 'doc');
    
    return { content: capsuleContent, qualityScore, preservedElements };
  }

  /**
   * Create an example capsule preserving usage patterns
   */
  private async createExampleCapsule(item: SearchResult): Promise<{ content: string; qualityScore: number; preservedElements: string[] }> {
    const lines = item.content.split('\n');
    const exampleLines: string[] = [];
    const preservedElements: string[] = [];
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      // Keep imports, key function calls, and explanatory comments
      if (this.isImportExportLine(trimmed)) {
        exampleLines.push(line);
        preservedElements.push('import');
      } else if (this.isKeyUsageLine(trimmed)) {
        exampleLines.push(line);
        preservedElements.push('usage');
      } else if (this.isMeaningfulComment(trimmed)) {
        exampleLines.push(line);
        preservedElements.push('explanation');
      }
    }

    // Apply length limit
    let capsuleContent = exampleLines.join('\n');
    if (this.tokenizer.countTokens(capsuleContent) > this.config.maxCodeLength) {
      capsuleContent = this.truncateToLength(capsuleContent, this.config.maxCodeLength);
    }

    const qualityScore = this.calculateQualityScore(item.content, capsuleContent, 'example');
    
    return { content: capsuleContent, qualityScore, preservedElements };
  }

  /**
   * Create a generic capsule for unknown content types
   */
  private async createGenericCapsule(item: SearchResult): Promise<{ content: string; qualityScore: number; preservedElements: string[] }> {
    // Use a simple head-tail approach
    const lines = item.content.split('\n');
    const totalLines = lines.length;
    const headLines = Math.min(10, Math.floor(totalLines * 0.3));
    const tailLines = Math.min(10, Math.floor(totalLines * 0.3));
    
    const selectedLines = [
      ...lines.slice(0, headLines),
      ...(totalLines > headLines + tailLines ? ['...'] : []),
      ...lines.slice(-tailLines)
    ];

    const capsuleContent = selectedLines.join('\n');
    const qualityScore = this.calculateQualityScore(item.content, capsuleContent, 'generic');
    const preservedElements = ['head', 'tail'];
    
    return { content: capsuleContent, qualityScore, preservedElements };
  }

  /**
   * Create a minimal capsule as fallback
   */
  private createMinimalCapsule(item: SearchResult): string {
    const lines = item.content.split('\n');
    const essentialLines: string[] = [];
    
    // Only keep signatures and key declarations
    for (const line of lines) {
      const trimmed = line.trim();
      if (this.isSignatureLine(trimmed) || this.isImportExportLine(trimmed)) {
        essentialLines.push(line);
      }
    }
    
    return essentialLines.length > 0 ? essentialLines.join('\n') : `// ${item.path} - content compressed`;
  }

  /**
   * Calculate quality score for a capsule
   */
  private calculateQualityScore(original: string, capsule: string, type: string): number {
    let score = 0.5; // Base score
    
    // Length preservation (up to 0.3)
    const originalTokens = this.tokenizer.countTokens(original);
    const capsuleTokens = this.tokenizer.countTokens(capsule);
    const lengthRatio = capsuleTokens / originalTokens;
    score += Math.max(0, (1 - lengthRatio) * 0.3);
    
    // Structure preservation (up to 0.2)
    const originalLines = original.split('\n').length;
    const capsuleLines = capsule.split('\n').length;
    if (capsuleLines > 0) {
      score += Math.min(0.2, capsuleLines / originalLines * 0.2);
    }
    
    // Type-specific scoring (up to 0.3)
    switch (type) {
      case 'code':
        if (this.hasSignatures(capsule)) score += 0.1;
        if (this.hasImports(capsule)) score += 0.1;
        if (this.hasKeyLogic(capsule)) score += 0.1;
        break;
      case 'test':
        if (this.hasTestFunctions(capsule)) score += 0.15;
        if (this.hasAssertions(capsule)) score += 0.15;
        break;
      case 'doc':
        if (this.hasHeaders(capsule)) score += 0.1;
        if (this.hasLists(capsule)) score += 0.1;
        if (this.hasCodeBlocks(capsule)) score += 0.1;
        break;
    }
    
    return Math.min(1.0, score);
  }

  // Helper methods for content analysis
  private isSignatureLine(line: string): boolean {
    return /^(function|class|interface|def|export\s+(default\s+)?(function|class)|\s*(public|private|protected)\s+\w+\s*\(|\w+\s*:\s*\w+\s*=|constructor\s*\()/.test(line);
  }

  private isImportExportLine(line: string): boolean {
    return /^(import|export|from|require)/.test(line);
  }

  private isKeyLogicLine(line: string): boolean {
    return /return|throw|if\s*\(|for\s*\(|while\s*\(|switch\s*\(|try\s*\{|catch\s*\(/.test(line);
  }

  private isCommentLine(line: string): boolean {
    return /^(\s*\/\/|\/\*|\*|\s*#|'''|""")/.test(line);
  }

  private isMeaningfulComment(line: string): boolean {
    const meaningful = /@param|@return|@throws|TODO|FIXME|NOTE|IMPORTANT|WARNING/.test(line);
    const notEmpty = line.replace(/\/\/|\/\*|\*|\s*#|'''|"""/g, '').trim().length > 5;
    return meaningful && notEmpty;
  }

  private isTestFunction(line: string): boolean {
    return /(test|spec|it|describe)\s*\(|def\s+test_|def\s+spec_/.test(line);
  }

  private isAssertionLine(line: string): boolean {
    return /(expect|assert|should|assert\.|assertTrue|assertFalse|assertEquals)/.test(line);
  }

  private isKeyTestSetup(line: string): boolean {
    return /(beforeEach|afterEach|beforeAll|afterAll|setUp|tearDown)/.test(line);
  }

  private isHeaderLine(line: string): boolean {
    return /^#+\s/.test(line);
  }

  private isListItem(line: string): boolean {
    return /^[-*+]\s|^\d+\.\s/.test(line);
  }

  private isCodeBlock(line: string): boolean {
    return /^```|^\s{4,}/.test(line);
  }

  private isKeyDocumentationSentence(line: string): boolean {
    return line.length > 20 && /[.!?]$/.test(line) && !line.toLowerCase().includes('this is a placeholder');
  }

  private isKeyUsageLine(line: string): boolean {
    return /\w+\.\w+\(|new\s+\w+|\w+\s*=\s*\w+\(/.test(line);
  }

  private truncateToLength(content: string, maxTokens: number): string {
    const lines = content.split('\n');
    let result = '';
    let currentTokens = 0;
    
    for (const line of lines) {
      const lineTokens = this.tokenizer.countTokens(line);
      if (currentTokens + lineTokens > maxTokens) {
        break;
      }
      result += (result ? '\n' : '') + line;
      currentTokens += lineTokens;
    }
    
    return result || '// Content truncated due to length limit';
  }

  private hasSignatures(content: string): boolean {
    return /^(function|class|interface|def|export)/m.test(content);
  }

  private hasImports(content: string): boolean {
    return /^(import|from|require)/m.test(content);
  }

  private hasKeyLogic(content: string): boolean {
    return /(return|throw|if|for|while|switch|try)/m.test(content);
  }

  private hasTestFunctions(content: string): boolean {
    return /(test|spec|it|describe)\s*\(/m.test(content);
  }

  private hasAssertions(content: string): boolean {
    return /(expect|assert|should)/m.test(content);
  }

  private hasHeaders(content: string): boolean {
    return /^#+\s/m.test(content);
  }

  private hasLists(content: string): boolean {
    return /^[-*+]\s|^\d+\.\s/m.test(content);
  }

  private hasCodeBlocks(content: string): boolean {
    return /^```/m.test(content);
  }
}

// ============================================================================
// Progressive Degradation Algorithm
// ============================================================================

export class ProgressiveDegradationEngine {
  constructor(private policy: DegradePolicy, private tokenizer: TokenizerProvider) {}

  /**
   * Apply progressive degradation to meet budget
   */
  async applyDegradation(items: SearchResult[], budget: number): Promise<DegradedResult> {
    const startTime = Date.now();
    const originalTokens = this.calculateTotalTokens(items);
    
    logger.debug('Starting progressive degradation', {
      itemCount: items.length,
      originalTokens,
      budget,
      policy: this.policy.name
    });

    let currentItems = [...items];
    let currentTokens = originalTokens;
    let appliedLevel = 0;
    let appliedStrategy = '';
    let capsulesCreated = 0;

    // Check if degradation is needed
    if (currentTokens <= budget) {
      return this.createResult(items, items, originalTokens, currentTokens, 0, appliedLevel, appliedStrategy, capsulesCreated, startTime);
    }

    // Apply degradation levels progressively
    const levels = this.getDegradationLevels();
    
    for (const level of levels) {
      if (currentTokens <= budget * level.threshold) {
        continue; // Skip if we're already under this threshold
      }

      logger.debug(`Applying degradation level ${level.level}`, {
        strategy: level.strategy,
        currentTokens,
        targetThreshold: budget * level.threshold
      });

      const degraded = await this.applyLevel(currentItems, level, budget);
      currentItems = degraded.items;
      currentTokens = degraded.tokens;
      capsulesCreated += degraded.capsulesCreated;
      appliedLevel = level.level;
      appliedStrategy = level.strategy;

      if (currentTokens <= budget) {
        break; // Budget satisfied
      }
    }

    // Emergency fallback if still over budget
    if (currentTokens > budget) {
      logger.warn('Emergency degradation triggered', {
        currentTokens,
        budget,
        appliedLevel
      });
      
      const emergency = await this.applyEmergencyDegradation(currentItems, budget);
      currentItems = emergency.items;
      currentTokens = emergency.tokens;
      capsulesCreated += emergency.capsulesCreated;
      appliedLevel = 5; // Emergency level
      appliedStrategy = this.policy.strategies.emergencyStrategy;
    }

    const qualityScore = this.calculateOverallQuality(currentItems);
    
    return this.createResult(items, currentItems, originalTokens, currentTokens, qualityScore, appliedLevel, appliedStrategy, capsulesCreated, startTime);
  }

  /**
   * Get degradation levels in order
   */
  private getDegradationLevels(): DegradationLevel[] {
    return [
      {
        level: 1,
        name: 'Remove Low Priority',
        threshold: this.policy.thresholds.level1,
        strategy: this.policy.strategies.level1Strategy,
        description: 'Remove low-priority items and truncate comments',
        estimatedSavings: 0.1
      },
      {
        level: 2,
        name: 'Truncate Medium Priority',
        threshold: this.policy.thresholds.level2,
        strategy: this.policy.strategies.level2Strategy,
        description: 'Truncate medium-priority items using smart strategies',
        estimatedSavings: 0.2
      },
      {
        level: 3,
        name: 'Create Capsules',
        threshold: this.policy.thresholds.level3,
        strategy: this.policy.strategies.level3Strategy,
        description: 'Create capsule summaries for large items',
        estimatedSavings: 0.4
      },
      {
        level: 4,
        name: 'Minimal Essence',
        threshold: this.policy.thresholds.level4,
        strategy: this.policy.strategies.level4Strategy,
        description: 'Extract only essential information',
        estimatedSavings: 0.6
      }
    ];
  }

  /**
   * Apply a specific degradation level
   */
  private async applyLevel(items: SearchResult[], level: DegradationLevel, budget: number): Promise<{ items: SearchResult[]; tokens: number; capsulesCreated: number }> {
    switch (level.strategy) {
      case 'remove-low-priority':
        return await this.removeLowPriority(items, budget);
      case 'truncate-comments':
        return await this.truncateComments(items, budget);
      case 'compress-whitespace':
        return await this.compressWhitespace(items, budget);
      case 'truncate-medium':
        return await this.truncateMedium(items, budget);
      case 'smart-head-tail':
        return await this.smartHeadTail(items, budget);
      case 'preserve-signatures':
        return await this.preserveSignatures(items, budget);
      case 'capsule-summary':
        return await this.createCapsuleSummaries(items, budget);
      case 'key-extraction':
        return await this.extractKeys(items, budget);
      case 'outline-only':
        return await this.createOutline(items, budget);
      case 'minimal-essence':
        return await this.extractMinimalEssence(items, budget);
      case 'signatures-only':
        return await this.extractSignaturesOnly(items, budget);
      case 'key-words':
        return await this.extractKeyWords(items, budget);
      default:
        return await this.removeLowPriority(items, budget);
    }
  }

  /**
   * Emergency degradation when all else fails
   */
  private async applyEmergencyDegradation(items: SearchResult[], budget: number): Promise<{ items: SearchResult[]; tokens: number; capsulesCreated: number }> {
    switch (this.policy.strategies.emergencyStrategy) {
      case 'titles-only':
        return await this.titlesOnly(items, budget);
      case 'file-list':
        return await this.fileListOnly(items, budget);
      case 'path-only':
        return await this.pathOnly(items, budget);
      default:
        return await this.titlesOnly(items, budget);
    }
  }

  // Degradation strategy implementations
  private async removeLowPriority(items: SearchResult[], budget: number): Promise<{ items: SearchResult[]; tokens: number; capsulesCreated: number }> {
    const sorted = this.sortByPriority(items);
    const result: SearchResult[] = [];
    let currentTokens = 0;

    for (const item of sorted) {
      const itemTokens = this.tokenizer.countTokens(item.content);
      if (currentTokens + itemTokens <= budget) {
        result.push(item);
        currentTokens += itemTokens;
      }
    }

    return { items: result, tokens: currentTokens, capsulesCreated: 0 };
  }

  private async truncateComments(items: SearchResult[], budget: number): Promise<{ items: SearchResult[]; tokens: number; capsulesCreated: number }> {
    const result: SearchResult[] = [];
    let currentTokens = 0;

    for (const item of items) {
      let content = item.content;
      
      // Remove comments
      content = content
        .replace(/\/\/.*$/gm, '') // Line comments
        .replace(/\/\*[\s\S]*?\*\//g, '') // Block comments
        .replace(/#[^\n]*$/gm, '') // Python comments
        .replace(/'''[\s\S]*?'''/g, '') // Python docstrings
        .replace(/"""[\s\S]*?"""/g, '') // Python docstrings
        .trim();

      const itemTokens = this.tokenizer.countTokens(content);
      if (currentTokens + itemTokens <= budget) {
        result.push({ ...item, content });
        currentTokens += itemTokens;
      }
    }

    return { items: result, tokens: currentTokens, capsulesCreated: 0 };
  }

  private async compressWhitespace(items: SearchResult[], budget: number): Promise<{ items: SearchResult[]; tokens: number; capsulesCreated: number }> {
    const result: SearchResult[] = [];
    let currentTokens = 0;

    for (const item of items) {
      // Compress whitespace
      const content = item.content
        .replace(/\s+/g, ' ') // Multiple spaces to single
        .replace(/\n\s*\n/g, '\n') // Multiple newlines to single
        .trim();

      const itemTokens = this.tokenizer.countTokens(content);
      if (currentTokens + itemTokens <= budget) {
        result.push({ ...item, content });
        currentTokens += itemTokens;
      }
    }

    return { items: result, tokens: currentTokens, capsulesCreated: 0 };
  }

  private async truncateMedium(items: SearchResult[], budget: number): Promise<{ items: SearchResult[]; tokens: number; capsulesCreated: number }> {
    const result: SearchResult[] = [];
    let currentTokens = 0;

    for (const item of items) {
      const itemTokens = this.tokenizer.countTokens(item.content);
      const remainingBudget = budget - currentTokens;
      
      if (itemTokens <= remainingBudget) {
        result.push(item);
        currentTokens += itemTokens;
      } else if (remainingBudget > 100) {
        // Truncate to fit remaining budget
        const targetLength = Math.floor((item.content.length * remainingBudget) / itemTokens);
        const truncated = item.content.substring(0, targetLength) + '... [truncated]';
        result.push({ ...item, content: truncated });
        currentTokens += this.tokenizer.countTokens(truncated);
      }
    }

    return { items: result, tokens: currentTokens, capsulesCreated: 0 };
  }

  private async smartHeadTail(items: SearchResult[], budget: number): Promise<{ items: SearchResult[]; tokens: number; capsulesCreated: number }> {
    const result: SearchResult[] = [];
    let currentTokens = 0;

    for (const item of items) {
      const itemTokens = this.tokenizer.countTokens(item.content);
      const remainingBudget = budget - currentTokens;
      
      if (itemTokens <= remainingBudget) {
        result.push(item);
        currentTokens += itemTokens;
      } else if (remainingBudget > 100) {
        // Smart head-tail truncation
        const lines = item.content.split('\n');
        const headCount = Math.floor(lines.length * 0.3);
        const tailCount = Math.floor(lines.length * 0.3);
        
        const headLines = lines.slice(0, headCount);
        const tailLines = lines.slice(-tailCount);
        
        let smartContent = [...headLines, '... [content omitted] ...', ...tailLines].join('\n');
        
        // If still too long, reduce further
        while (this.tokenizer.countTokens(smartContent) > remainingBudget && headCount > 0 && tailCount > 0) {
          headLines.pop();
          tailLines.shift();
          smartContent = [...headLines, '... [content omitted] ...', ...tailLines].join('\n');
        }
        
        result.push({ ...item, content: smartContent });
        currentTokens += this.tokenizer.countTokens(smartContent);
      }
    }

    return { items: result, tokens: currentTokens, capsulesCreated: 0 };
  }

  private async preserveSignatures(items: SearchResult[], budget: number): Promise<{ items: SearchResult[]; tokens: number; capsulesCreated: number }> {
    const result: SearchResult[] = [];
    let currentTokens = 0;

    for (const item of items) {
      const lines = item.content.split('\n');
      const signatureLines: string[] = [];
      
      for (const line of lines) {
        const trimmed = line.trim();
        if (this.isSignatureLine(trimmed) || this.isImportExportLine(trimmed)) {
          signatureLines.push(line);
        }
      }
      
      const content = signatureLines.length > 0 ? signatureLines.join('\n') : `// Signatures from ${item.path}`;
      const itemTokens = this.tokenizer.countTokens(content);
      
      if (currentTokens + itemTokens <= budget) {
        result.push({ ...item, content });
        currentTokens += itemTokens;
      }
    }

    return { items: result, tokens: currentTokens, capsulesCreated: 0 };
  }

  private async createCapsuleSummaries(items: SearchResult[], budget: number): Promise<{ items: SearchResult[]; tokens: number; capsulesCreated: number }> {
    const capsuleCreator = new CapsuleCreator(this.policy.capsuleConfig, this.tokenizer);
    const result: SearchResult[] = [];
    let currentTokens = 0;
    let capsulesCreated = 0;

    // Sort by priority first
    const sorted = this.sortByPriority(items);

    for (const item of sorted) {
      const itemTokens = this.tokenizer.countTokens(item.content);
      const remainingBudget = budget - currentTokens;
      
      if (itemTokens <= remainingBudget) {
        result.push(item);
        currentTokens += itemTokens;
      } else if (remainingBudget > 100) {
        // Create capsule
        const capsule = await capsuleCreator.createCapsule(item, item.spanKind || 'unknown');
        const capsuleTokens = this.tokenizer.countTokens(capsule.content);
        
        if (currentTokens + capsuleTokens <= budget) {
          result.push({
            ...item,
            content: capsule.content,
            metadata: {
              ...item.metadata,
              capsule: capsule.metadata
            }
          });
          currentTokens += capsuleTokens;
          capsulesCreated++;
        }
      }
    }

    return { items: result, tokens: currentTokens, capsulesCreated };
  }

  private async extractKeys(items: SearchResult[], budget: number): Promise<{ items: SearchResult[]; tokens: number; capsulesCreated: number }> {
    const result: SearchResult[] = [];
    let currentTokens = 0;

    for (const item of items) {
      const lines = item.content.split('\n');
      const keyLines: string[] = [];
      
      for (const line of lines) {
        const trimmed = line.trim();
        // Extract key patterns
        if (this.isSignatureLine(trimmed) || 
            this.isImportExportLine(trimmed) ||
            this.isKeyLogicLine(trimmed) ||
            (this.isCommentLine(trimmed) && this.isMeaningfulComment(trimmed))) {
          keyLines.push(line);
        }
      }
      
      const content = keyLines.length > 0 ? keyLines.join('\n') : `// Key elements from ${item.path}`;
      const itemTokens = this.tokenizer.countTokens(content);
      
      if (currentTokens + itemTokens <= budget) {
        result.push({ ...item, content });
        currentTokens += itemTokens;
      }
    }

    return { items: result, tokens: currentTokens, capsulesCreated: 0 };
  }

  private async createOutline(items: SearchResult[], budget: number): Promise<{ items: SearchResult[]; tokens: number; capsulesCreated: number }> {
    const result: SearchResult[] = [];
    let currentTokens = 0;

    for (const item of items) {
      const lines = item.content.split('\n');
      const outline: string[] = [];
      
      for (const line of lines) {
        const trimmed = line.trim();
        // Only keep structural elements
        if (this.isSignatureLine(trimmed) || 
            this.isHeaderLine(trimmed) ||
            this.isListItem(trimmed)) {
          outline.push(line);
        }
      }
      
      const content = outline.length > 0 ? outline.join('\n') : `// Outline of ${item.path}`;
      const itemTokens = this.tokenizer.countTokens(content);
      
      if (currentTokens + itemTokens <= budget) {
        result.push({ ...item, content });
        currentTokens += itemTokens;
      }
    }

    return { items: result, tokens: currentTokens, capsulesCreated: 0 };
  }

  private async extractMinimalEssence(items: SearchResult[], budget: number): Promise<{ items: SearchResult[]; tokens: number; capsulesCreated: number }> {
    const result: SearchResult[] = [];
    let currentTokens = 0;

    for (const item of items) {
      const lines = item.content.split('\n');
      const essence: string[] = [];
      
      for (const line of lines) {
        const trimmed = line.trim();
        // Only keep the most essential elements
        if (this.isSignatureLine(trimmed) && 
            (trimmed.includes('export') || trimmed.includes('class') || trimmed.includes('function'))) {
          essence.push(line);
        }
      }
      
      const content = essence.length > 0 ? essence.join('\n') : `// ${item.path}`;
      const itemTokens = this.tokenizer.countTokens(content);
      
      if (currentTokens + itemTokens <= budget) {
        result.push({ ...item, content });
        currentTokens += itemTokens;
      }
    }

    return { items: result, tokens: currentTokens, capsulesCreated: 0 };
  }

  private async extractSignaturesOnly(items: SearchResult[], budget: number): Promise<{ items: SearchResult[]; tokens: number; capsulesCreated: number }> {
    const result: SearchResult[] = [];
    let currentTokens = 0;

    for (const item of items) {
      const lines = item.content.split('\n');
      const signatures: string[] = [];
      
      for (const line of lines) {
        const trimmed = line.trim();
        if (this.isSignatureLine(trimmed)) {
          signatures.push(line);
        }
      }
      
      const content = signatures.length > 0 ? signatures.join('\n') : `// ${item.path}`;
      const itemTokens = this.tokenizer.countTokens(content);
      
      if (currentTokens + itemTokens <= budget) {
        result.push({ ...item, content });
        currentTokens += itemTokens;
      }
    }

    return { items: result, tokens: currentTokens, capsulesCreated: 0 };
  }

  private async extractKeyWords(items: SearchResult[], budget: number): Promise<{ items: SearchResult[]; tokens: number; capsulesCreated: number }> {
    const result: SearchResult[] = [];
    let currentTokens = 0;

    for (const item of items) {
      // Extract keywords and identifiers
      const words = item.content
        .split(/\s+/)
        .filter(word => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(word) && word.length > 3)
        .slice(0, 20); // Limit to first 20 words
      
      const content = words.length > 0 ? words.join(', ') : `// ${item.path}`;
      const itemTokens = this.tokenizer.countTokens(content);
      
      if (currentTokens + itemTokens <= budget) {
        result.push({ ...item, content });
        currentTokens += itemTokens;
      }
    }

    return { items: result, tokens: currentTokens, capsulesCreated: 0 };
  }

  // Emergency strategies
  private async titlesOnly(items: SearchResult[], budget: number): Promise<{ items: SearchResult[]; tokens: number; capsulesCreated: number }> {
    const result: SearchResult[] = [];
    let currentTokens = 0;

    for (const item of items) {
      const title = item.spanName || item.path.split('/').pop() || item.path;
      const content = `// ${title}`;
      const itemTokens = this.tokenizer.countTokens(content);
      
      if (currentTokens + itemTokens <= budget) {
        result.push({ ...item, content });
        currentTokens += itemTokens;
      }
    }

    return { items: result, tokens: currentTokens, capsulesCreated: 0 };
  }

  private async fileListOnly(items: SearchResult[], budget: number): Promise<{ items: SearchResult[]; tokens: number; capsulesCreated: number }> {
    const result: SearchResult[] = [];
    let currentTokens = 0;

    for (const item of items) {
      const content = item.path;
      const itemTokens = this.tokenizer.countTokens(content);
      
      if (currentTokens + itemTokens <= budget) {
        result.push({ ...item, content });
        currentTokens += itemTokens;
      }
    }

    return { items: result, tokens: currentTokens, capsulesCreated: 0 };
  }

  private async pathOnly(items: SearchResult[], budget: number): Promise<{ items: SearchResult[]; tokens: number; capsulesCreated: number }> {
    const result: SearchResult[] = [];
    let currentTokens = 0;

    // Just list file paths, one per line
    const paths = items.map(item => item.path).join('\n');
    const totalTokens = this.tokenizer.countTokens(paths);
    
    if (totalTokens <= budget) {
      // Return as a single item
      result.push({
        id: 'file-list',
        content: paths,
        path: 'file-list',
        metadata: { type: 'file-list' }
      });
      currentTokens = totalTokens;
    }

    return { items: result, tokens: currentTokens, capsulesCreated: 0 };
  }

  // Helper methods
  private sortByPriority(items: SearchResult[]): SearchResult[] {
    return [...items].sort((a, b) => {
      // Prioritize by score, then by span kind importance
      const scoreA = a.score || 0.5;
      const scoreB = b.score || 0.5;
      
      if (scoreA !== scoreB) {
        return scoreB - scoreA;
      }
      
      // Span kind priority
      const kindPriority = {
        'function': 5,
        'class': 5,
        'method': 4,
        'interface': 4,
        'module': 3,
        'property': 2,
        'enum': 2,
        'comment': 1
      };
      
      const priorityA = kindPriority[a.spanKind as keyof typeof kindPriority] || 0;
      const priorityB = kindPriority[b.spanKind as keyof typeof kindPriority] || 0;
      
      return priorityB - priorityA;
    });
  }

  private calculateTotalTokens(items: SearchResult[]): number {
    return items.reduce((total, item) => total + this.tokenizer.countTokens(item.content), 0);
  }

  private calculateOverallQuality(items: SearchResult[]): number {
    if (items.length === 0) return 0;
    
    const totalQuality = items.reduce((sum, item) => {
      const capsuleQuality = item.metadata?.capsule?.qualityScore || 1.0;
      const lengthRatio = Math.min(1.0, item.content.length / 100); // Assume 100 chars is "full quality"
      return sum + (capsuleQuality * lengthRatio);
    }, 0);
    
    return totalQuality / items.length;
  }

  private createResult(
    original: SearchResult[],
    degraded: SearchResult[],
    originalTokens: number,
    degradedTokens: number,
    qualityScore: number,
    appliedLevel: number,
    appliedStrategy: string,
    capsulesCreated: number,
    startTime: number
  ): DegradedResult {
    const endTime = Date.now();
    const savingsPercentage = ((originalTokens - degradedTokens) / originalTokens) * 100;
    const compressionRatio = degradedTokens / originalTokens;

    return {
      original,
      degraded,
      savings: {
        originalTokens,
        degradedTokens,
        savingsPercentage,
        compressionRatio
      },
      applied: {
        level: appliedLevel,
        strategy: appliedStrategy,
        itemsProcessed: degraded.length,
        capsulesCreated,
        qualityScore
      },
      performance: {
        degradationTime: endTime - startTime,
        estimationTime: 0, // Not tracked separately in this implementation
        totalTime: endTime - startTime
      },
      policy: this.policy
    };
  }

  // Reuse helper methods from CapsuleCreator
  private isSignatureLine(line: string): boolean {
    return /^(function|class|interface|def|export\s+(default\s+)?(function|class)|\s*(public|private|protected)\s+\w+\s*\(|\w+\s*:\s*\w+\s*=)/.test(line);
  }

  private isImportExportLine(line: string): boolean {
    return /^(import|export|from|require)/.test(line);
  }

  private isKeyLogicLine(line: string): boolean {
    return /return|throw|if\s*\(|for\s*\(|while\s*\(|switch\s*\(|try\s*\{|catch\s*\(/.test(line);
  }

  private isCommentLine(line: string): boolean {
    return /^(\s*\/\/|\/\*|\*|\s*#|'''|""")/.test(line);
  }

  private isMeaningfulComment(line: string): boolean {
    const meaningful = /@param|@return|@throws|TODO|FIXME|NOTE|IMPORTANT|WARNING/.test(line);
    const notEmpty = line.replace(/\/\/|\/\*|\*|\s*#|'''|"""/g, '').trim().length > 5;
    return meaningful && notEmpty;
  }

  private isHeaderLine(line: string): boolean {
    return /^#+\s/.test(line);
  }

  private isListItem(line: string): boolean {
    return /^[-*+]\s|^\d+\.\s/.test(line);
  }
}

// ============================================================================
// Main Degrade Policy Engine
// ============================================================================

export class DegradePolicyEngine {
  private policies = new Map<string, DegradePolicy>();
  private cache = new Map<string, DegradedResult>();
  private cacheTimeout = 5 * 60 * 1000; // 5 minutes

  constructor() {
    this.initializeDefaultPolicies();
  }

  /**
   * Apply degrade policy to search results
   */
  async applyDegradePolicy(
    items: SearchResult[], 
    budget: number, 
    policy: DegradePolicy,
    tokenizer: TokenizerProvider
  ): Promise<DegradedResult> {
    const startTime = Date.now();
    const cacheKey = this.generateCacheKey(items, budget, policy.id);
    
    // Check cache first
    const cached = this.cache.get(cacheKey);
    if (cached && this.isCacheValid(cached)) {
      logger.debug('Using cached degradation result', { 
        policy: policy.name,
        savings: cached.savings.savingsPercentage.toFixed(1) + '%'
      });
      return cached;
    }

    logger.info('Applying degrade policy', {
      policy: policy.name,
      itemCount: items.length,
      budget,
      originalTokens: this.calculateTotalTokens(items, tokenizer)
    });

    try {
      // Create degradation engine
      const engine = new ProgressiveDegradationEngine(policy, tokenizer);
      
      // Apply progressive degradation
      const result = await engine.applyDegradation(items, budget);
      
      // Cache the result
      this.cache.set(cacheKey, result);
      
      logger.info('Degradation completed', {
        policy: policy.name,
        level: result.applied.level,
        strategy: result.applied.strategy,
        savings: result.savings.savingsPercentage.toFixed(1) + '%',
        quality: result.applied.qualityScore.toFixed(2),
        capsulesCreated: result.applied.capsulesCreated,
        time: `${result.performance.totalTime}ms`
      });

      return result;
      
    } catch (error) {
      logger.error('Degradation failed', {
        error: error instanceof Error ? error.message : String(error),
        policy: policy.name
      });
      
      // Return unmodified results as fallback
      return this.createFallbackResult(items, budget, policy, tokenizer, startTime);
    }
  }

  /**
   * Create a smart capsule for a single item
   */
  async createCapsule(item: SearchResult, config: CapsuleConfig, tokenizer: TokenizerProvider): Promise<string> {
    const capsuleCreator = new CapsuleCreator(config, tokenizer);
    const capsule = await capsuleCreator.createCapsule(item, item.spanKind || 'unknown');
    return capsule.content;
  }

  /**
   * Estimate potential savings from degradation
   */
  async estimateSavings(items: SearchResult[], policy: DegradePolicy, tokenizer: TokenizerProvider): Promise<number> {
    const originalTokens = this.calculateTotalTokens(items, tokenizer);
    
    // Simulate degradation at different levels
    let maxSavings = 0;
    const levels = [0.9, 0.8, 0.7, 0.6, 0.5];
    
    for (const threshold of levels) {
      const budget = Math.floor(originalTokens * threshold);
      const engine = new ProgressiveDegradationEngine(policy, tokenizer);
      const result = await engine.applyDegradation(items, budget);
      const savings = result.savings.savingsPercentage;
      maxSavings = Math.max(maxSavings, savings);
    }
    
    return maxSavings;
  }

  /**
   * Get or create a policy for a model
   */
  getPolicyForModel(model: string): DegradePolicy {
    const policyKey = model.toLowerCase();
    let policy = this.policies.get(policyKey);
    
    if (!policy) {
      // Use default policy and adapt for model
      const template = MODEL_DEGRADE_POLICIES[model as keyof typeof MODEL_DEGRADE_POLICIES] || 
                       MODEL_DEGRADE_POLICIES.default;
      
      policy = {
        id: `policy-${model}-${Date.now()}`,
        name: `${model} Adaptive Policy`,
        description: `Adaptive degrade policy for ${model}`,
        ...template,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      this.policies.set(policyKey, policy);
    }
    
    return policy;
  }

  /**
   * Create a custom policy
   */
  createCustomPolicy(
    name: string,
    description: string,
    overrides: Partial<DegradePolicy>
  ): DegradePolicy {
    const policy: DegradePolicy = {
      id: `policy-custom-${Date.now()}`,
      name,
      description,
      thresholds: { ...DEFAULT_THRESHOLDS },
      strategies: { ...DEFAULT_STRATEGIES },
      capsuleConfig: { ...DEFAULT_CAPSULE_CONFIG },
      modelCapabilities: {
        contextSize: 4096,
        supportsCompression: true,
        qualitySensitivity: 0.6
      },
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides
    };
    
    this.policies.set(policy.id, policy);
    return policy;
  }

  /**
   * Update an existing policy
   */
  updatePolicy(policyId: string, updates: Partial<DegradePolicy>): DegradePolicy {
    const existing = this.policies.get(policyId);
    if (!existing) {
      throw new Error(`Policy not found: ${policyId}`);
    }
    
    const updated: DegradePolicy = {
      ...existing,
      ...updates,
      id: policyId, // Preserve ID
      updatedAt: new Date()
    };
    
    this.policies.set(policyId, updated);
    
    // Clear cache as policy changed
    this.cache.clear();
    
    logger.info('Degrade policy updated', { policyId, name: updated.name });
    return updated;
  }

  /**
   * Get all available policies
   */
  getAllPolicies(): DegradePolicy[] {
    return Array.from(this.policies.values());
  }

  /**
   * Get policy by ID
   */
  getPolicy(policyId: string): DegradePolicy | undefined {
    return this.policies.get(policyId);
  }

  /**
   * Delete a policy
   */
  deletePolicy(policyId: string): boolean {
    const deleted = this.policies.delete(policyId);
    if (deleted) {
      // Clear cache
      this.cache.clear();
      logger.info('Degrade policy deleted', { policyId });
    }
    return deleted;
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache.clear();
    logger.debug('Degrade policy cache cleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; hitRate: number } {
    return {
      size: this.cache.size,
      hitRate: 0 // Not tracking hits in this simple implementation
    };
  }

  // Private helper methods
  private initializeDefaultPolicies(): void {
    // Initialize model-specific policies
    for (const [model, template] of Object.entries(MODEL_DEGRADE_POLICIES)) {
      const policy: DegradePolicy = {
        id: `policy-${model}`,
        name: `${model} Default Policy`,
        description: `Default degrade policy for ${model}`,
        ...template,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      this.policies.set(policy.id, policy);
    }
  }

  private generateCacheKey(items: SearchResult[], budget: number, policyId: string): string {
    // Create a simple hash based on item IDs, budget, and policy
    const itemIds = items.map(item => item.id).sort().join(',');
    return `${policyId}:${budget}:${itemIds.slice(0, 10)}`;
  }

  private isCacheValid(result: DegradedResult): boolean {
    const age = Date.now() - result.performance.totalTime; // Using totalTime as timestamp proxy
    return age < this.cacheTimeout;
  }

  private calculateTotalTokens(items: SearchResult[], tokenizer: TokenizerProvider): number {
    return items.reduce((total, item) => total + tokenizer.countTokens(item.content), 0);
  }

  private createFallbackResult(
    items: SearchResult[],
    budget: number,
    policy: DegradePolicy,
    tokenizer: TokenizerProvider,
    startTime: number
  ): DegradedResult {
    const originalTokens = this.calculateTotalTokens(items, tokenizer);
    
    // Simple truncation as fallback
    const result: SearchResult[] = [];
    let currentTokens = 0;
    
    for (const item of items) {
      const itemTokens = tokenizer.countTokens(item.content);
      if (currentTokens + itemTokens <= budget) {
        result.push(item);
        currentTokens += itemTokens;
      }
    }
    
    const endTime = Date.now();
    const savingsPercentage = ((originalTokens - currentTokens) / originalTokens) * 100;
    const compressionRatio = currentTokens / originalTokens;

    return {
      original: items,
      degraded: result,
      savings: {
        originalTokens,
        degradedTokens: currentTokens,
        savingsPercentage,
        compressionRatio
      },
      applied: {
        level: 0,
        strategy: 'fallback-truncation',
        itemsProcessed: result.length,
        capsulesCreated: 0,
        qualityScore: 0.5
      },
      performance: {
        degradationTime: endTime - startTime,
        estimationTime: 0,
        totalTime: endTime - startTime
      },
      policy
    };
  }
}

export default DegradePolicyEngine;