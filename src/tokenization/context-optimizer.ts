/**
 * Context Optimization Algorithms for PAMPAX
 * 
 * This module implements:
 * - Hierarchical prioritization (must-have, important, supplementary, optional)
 * - Dynamic token budget allocation based on context type
 * - Smart capsule creation for large items
 * - Relevance-based truncation strategies
 */

import { logger } from '../config/logger.js';
import { PackingProfile, PackedItem, PackingResult, ContentPriorities } from './packing-profiles.js';
import { IntentResult } from '../intent/index.js';
import { ChunkRecord } from '../storage/crud.js';

// ============================================================================
// Content Classification
// ============================================================================

export interface ContentItem {
  id: string;
  content: string;
  path: string;
  spanKind?: string;
  spanName?: string;
  language?: string;
  score?: number;
  relevance?: number;
  metadata?: Record<string, any>;
}

export interface ClassificationResult {
  item: ContentItem;
  priority: number;
  category: 'must-have' | 'important' | 'supplementary' | 'optional';
  reasoning: string;
}

export interface Capsule {
  id: string;
  items: PackedItem[];
  totalTokens: number;
  preserveStructure: boolean;
}

// ============================================================================
// Content Classifier
// ============================================================================

export class ContentClassifier {
  constructor(private profile: PackingProfile) {}

  /**
   * Classify content items into priority categories
   */
  classifyItems(items: ContentItem[], intent?: IntentResult): ClassificationResult[] {
    const results: ClassificationResult[] = [];

    for (const item of items) {
      const result = this.classifyItem(item, intent);
      results.push(result);
    }

    // Sort by priority (descending) within each category
    return results.sort((a, b) => {
      const categoryOrder = { 'must-have': 4, 'important': 3, 'supplementary': 2, 'optional': 1 };
      const aOrder = categoryOrder[a.category];
      const bOrder = categoryOrder[b.category];
      
      if (aOrder !== bOrder) {
        return bOrder - aOrder;
      }
      
      return b.priority - a.priority;
    });
  }

  /**
   * Classify a single content item
   */
  private classifyItem(item: ContentItem, intent?: IntentResult): ClassificationResult {
    const priorities = this.adjustPrioritiesForIntent(this.profile.priorities, intent);
    let priority = 0.5; // Base priority
    let category: 'must-have' | 'important' | 'supplementary' | 'optional' = 'supplementary';
    const reasoning: string[] = [];

    // Determine content type and apply corresponding priority
    const contentType = this.getContentType(item);
    priority = priorities[contentType.type];
    reasoning.push(`Content type: ${contentType.type} (priority: ${priority})`);

    // Apply intent-based adjustments
    if (intent) {
      const intentAdjustment = this.getIntentAdjustment(item, intent);
      priority *= intentAdjustment.factor;
      if (intentAdjustment.reason) {
        reasoning.push(intentAdjustment.reason);
      }
    }

    // Apply quality and relevance adjustments
    if (item.score !== undefined) {
      const scoreFactor = 0.5 + (item.score * 0.5); // Map score 0-1 to 0.5-1
      priority *= scoreFactor;
      reasoning.push(`Search score: ${item.score.toFixed(3)} (factor: ${scoreFactor.toFixed(2)})`);
    }

    if (item.relevance !== undefined) {
      const relevanceFactor = 0.5 + (item.relevance * 0.5);
      priority *= relevanceFactor;
      reasoning.push(`Relevance: ${item.relevance.toFixed(3)} (factor: ${relevanceFactor.toFixed(2)})`);
    }

    // Apply path-based adjustments
    const pathAdjustment = this.getPathAdjustment(item);
    priority *= pathAdjustment.factor;
    if (pathAdjustment.reason) {
      reasoning.push(pathAdjustment.reason);
    }

    // Determine category based on final priority
    category = this.getCategoryFromPriority(priority);

    // Clamp priority to valid range
    priority = Math.max(0, Math.min(1, priority));

    return {
      item,
      priority,
      category,
      reasoning: reasoning.join('; ')
    };
  }

  /**
   * Determine the content type of an item
   */
  private getContentType(item: ContentItem): { type: keyof ContentPriorities; confidence: number } {
    const path = item.path.toLowerCase();
    const content = item.content.toLowerCase();
    const spanKind = item.spanKind?.toLowerCase();

    // Test files
    if (path.includes('/test/') || path.includes('.test.') || path.includes('.spec.') ||
        path.includes('__tests__') || spanKind === 'test') {
      return { type: 'tests', confidence: 0.9 };
    }

    // Configuration files
    if (path.includes('config') || path.includes('.env') || path.includes('package.json') ||
        path.includes('tsconfig') || path.includes('webpack') || path.includes('vite') ||
        path.endsWith('.yml') || path.endsWith('.yaml') || path.endsWith('.ini') ||
        path.endsWith('.toml') || path.endsWith('.properties')) {
      return { type: 'config', confidence: 0.9 };
    }

    // Documentation files
    if (path.includes('docs/') || path.endsWith('.md') || path.endsWith('.rst') ||
        path.includes('readme') || spanKind === 'comment') {
      return { type: 'docs', confidence: 0.8 };
    }

    // Example files
    if (path.includes('example') || path.includes('demo') || path.includes('sample') ||
        path.includes('/examples/')) {
      return { type: 'examples', confidence: 0.8 };
    }

    // Code files (default)
    if (spanKind === 'function' || spanKind === 'class' || spanKind === 'method' ||
        spanKind === 'interface' || spanKind === 'module') {
      return { type: 'code', confidence: 0.9 };
    }

    // Check content for code-like patterns
    if (content.includes('function') || content.includes('class') || content.includes('import') ||
        content.includes('export') || content.includes('def ') || content.includes('public class')) {
      return { type: 'code', confidence: 0.7 };
    }

    // Check content for comment patterns
    if (content.includes('//') || content.includes('/*') || content.includes('#') ||
        content.includes("'''") || content.includes('"""')) {
      return { type: 'comments', confidence: 0.6 };
    }

    // Default to code
    return { type: 'code', confidence: 0.5 };
  }

  /**
   * Adjust priorities based on intent
   */
  private adjustPrioritiesForIntent(base: ContentPriorities, intent?: IntentResult): ContentPriorities {
    if (!intent) return base;

    const adjusted = { ...base };
    
    switch (intent.intent) {
      case 'symbol':
        adjusted.code = Math.min(1.0, adjusted.code * 1.2);
        adjusted.comments = Math.min(1.0, adjusted.comments * 1.1);
        break;
      case 'config':
        adjusted.config = Math.min(1.0, adjusted.config * 1.3);
        adjusted.docs = Math.min(1.0, adjusted.docs * 1.1);
        break;
      case 'api':
        adjusted.code = Math.min(1.0, adjusted.code * 1.1);
        adjusted.examples = Math.min(1.0, adjusted.examples * 1.2);
        break;
      case 'incident':
        adjusted.code = Math.min(1.0, adjusted.code * 1.2);
        adjusted.tests = Math.min(1.0, adjusted.tests * 1.1);
        break;
      case 'search':
        adjusted.docs = Math.min(1.0, adjusted.docs * 1.1);
        adjusted.examples = Math.min(1.0, adjusted.examples * 1.1);
        break;
    }

    return adjusted;
  }

  /**
   * Get intent-specific adjustment factor
   */
  private getIntentAdjustment(item: ContentItem, intent: IntentResult): { factor: number; reason?: string } {
    const contentType = this.getContentType(item);
    
    // Check if entities match the content
    for (const entity of intent.entities) {
      if (entity.type === 'function' && contentType.type === 'code' && item.spanName) {
        if (item.spanName.toLowerCase().includes(entity.value.toLowerCase())) {
          return { factor: 1.3, reason: `Function name matches entity: ${entity.value}` };
        }
      }
      
      if (entity.type === 'class' && contentType.type === 'code' && item.spanName) {
        if (item.spanName.toLowerCase().includes(entity.value.toLowerCase())) {
          return { factor: 1.3, reason: `Class name matches entity: ${entity.value}` };
        }
      }
      
      if (entity.type === 'file' && item.path) {
        if (item.path.toLowerCase().includes(entity.value.toLowerCase())) {
          return { factor: 1.2, reason: `File path matches entity: ${entity.value}` };
        }
      }
    }

    return { factor: 1.0 };
  }

  /**
   * Get path-based adjustment factor
   */
  private getPathAdjustment(item: ContentItem): { factor: number; reason?: string } {
    const path = item.path.toLowerCase();
    
    // Boost for source files in main directories
    if (path.includes('/src/') || path.includes('/lib/') || path.includes('/app/')) {
      return { factor: 1.1, reason: 'Main source directory' };
    }
    
    // Reduce for generated files
    if (path.includes('/node_modules/') || path.includes('/target/') || path.includes('/build/') ||
        path.includes('/dist/') || path.includes('/.git/') || path.includes('coverage/')) {
      return { factor: 0.3, reason: 'Generated or ignored directory' };
    }
    
    // Reduce for vendor files
    if (path.includes('/vendor/') || path.includes('/third_party/') || path.includes('/external/')) {
      return { factor: 0.5, reason: 'Third-party code' };
    }

    return { factor: 1.0 };
  }

  /**
   * Get category from priority value
   */
  private getCategoryFromPriority(priority: number): 'must-have' | 'important' | 'supplementary' | 'optional' {
    if (priority >= 0.8) return 'must-have';
    if (priority >= 0.6) return 'important';
    if (priority >= 0.4) return 'supplementary';
    return 'optional';
  }
}

// ============================================================================
// Token Budget Manager
// ============================================================================

export class TokenBudgetManager {
  constructor(private profile: PackingProfile) {}

  /**
   * Allocate token budget across categories
   */
  allocateBudget(totalItems: number, totalTokens: number): {
    mustHave: number;
    important: number;
    supplementary: number;
    optional: number;
    reserve: number;
  } {
    const allocation = this.profile.budgetAllocation;
    
    // If total tokens exceed budget, scale down proportionally
    if (totalTokens > allocation.total) {
      const scale = (allocation.total - allocation.reserve) / totalTokens;
      
      return {
        mustHave: Math.floor(allocation.mustHave * scale),
        important: Math.floor(allocation.important * scale),
        supplementary: Math.floor(allocation.supplementary * scale),
        optional: Math.floor(allocation.optional * scale),
        reserve: allocation.reserve
      };
    }

    return {
      mustHave: allocation.mustHave,
      important: allocation.important,
      supplementary: allocation.supplementary,
      optional: allocation.optional,
      reserve: allocation.reserve
    };
  }

  /**
   * Get available budget for a category
   */
  getAvailableBudget(
    category: 'must-have' | 'important' | 'supplementary' | 'optional',
    used: Record<string, number>,
    allocation: Record<string, number>
  ): number {
    const allocated = allocation[category];
    const usedInCategory = used[category] || 0;
    return Math.max(0, allocated - usedInCategory);
  }
}

// ============================================================================
// Capsule Creator
// ============================================================================

export class CapsuleCreator {
  constructor(private profile: PackingProfile) {}

  /**
   * Create capsules from large content items
   */
  createCapsules(items: PackedItem[]): PackedItem[] {
    if (!this.profile.capsuleStrategies.enabled) {
      return items;
    }

    const result: PackedItem[] = [];
    const { maxCapsuleSize, minCapsuleSize, capsuleThreshold, preserveStructure } = this.profile.capsuleStrategies;

    for (const item of items) {
      if (item.tokens <= capsuleThreshold) {
        result.push(item);
        continue;
      }

      const capsules = this.splitItemIntoCapsules(item, maxCapsuleSize, minCapsuleSize, preserveStructure);
      result.push(...capsules);
    }

    return result;
  }

  /**
   * Split a large item into smaller capsules
   */
  private splitItemIntoCapsules(
    item: PackedItem,
    maxSize: number,
    minSize: number,
    preserveStructure: boolean
  ): PackedItem[] {
    const content = item.content;
    const lines = content.split('\n');
    const capsules: PackedItem[] = [];
    
    let currentCapsule: string[] = [];
    let currentTokens = 0;
    let capsuleIndex = 0;

    for (const line of lines) {
      const lineTokens = this.estimateTokens(line);
      
      // If adding this line would exceed max size and we have enough content, create capsule
      if (currentTokens + lineTokens > maxSize && currentTokens >= minSize) {
        const capsuleContent = currentCapsule.join('\n');
        const capsuleTokens = this.estimateTokens(capsuleContent);
        
        capsules.push({
          ...item,
          id: `${item.id}-capsule-${capsuleIndex}`,
          content: capsuleContent,
          tokens: capsuleTokens,
          capsule: {
            id: item.id,
            index: capsuleIndex,
            total: -1 // Will be updated later
          }
        });

        currentCapsule = [];
        currentTokens = 0;
        capsuleIndex++;
      }

      currentCapsule.push(line);
      currentTokens += lineTokens;
    }

    // Add remaining content
    if (currentCapsule.length > 0) {
      const capsuleContent = currentCapsule.join('\n');
      const capsuleTokens = this.estimateTokens(capsuleContent);
      
      capsules.push({
        ...item,
        id: `${item.id}-capsule-${capsuleIndex}`,
        content: capsuleContent,
        tokens: capsuleTokens,
        capsule: {
          id: item.id,
          index: capsuleIndex,
          total: -1 // Will be updated later
        }
      });
    }

    // Update total capsule count
    const totalCapsules = capsules.length;
    for (const capsule of capsules) {
      if (capsule.capsule) {
        capsule.capsule.total = totalCapsules;
      }
    }

    return capsules;
  }

  /**
   * Simple token estimation
   */
  private estimateTokens(text: string): number {
    // Rough estimation: ~4 characters per token
    return Math.ceil(text.length / 4);
  }
}

// ============================================================================
// Truncation Manager
// ============================================================================

export class TruncationManager {
  constructor(private profile: PackingProfile) {}

  /**
   * Apply truncation strategy to items that exceed budget
   */
  applyTruncation(items: PackedItem[], budget: number): { items: PackedItem[]; truncated: boolean } {
    const totalTokens = items.reduce((sum, item) => sum + item.tokens, 0);
    
    if (totalTokens <= budget) {
      return { items, truncated: false };
    }

    const strategy = this.profile.truncationStrategies;
    let result = [...items];
    let truncated = true;

    switch (strategy.strategy) {
      case 'head':
        result = this.truncateFromHead(result, budget);
        break;
      case 'tail':
        result = this.truncateFromTail(result, budget);
        break;
      case 'middle':
        result = this.truncateFromMiddle(result, budget);
        break;
      case 'smart':
        result = this.smartTruncate(result, budget);
        break;
    }

    return { items: result, truncated };
  }

  /**
   * Truncate from the head (keep beginning)
   */
  private truncateFromHead(items: PackedItem[], budget: number): PackedItem[] {
    const result: PackedItem[] = [];
    let usedTokens = 0;

    for (const item of items) {
      if (usedTokens + item.tokens <= budget) {
        result.push(item);
        usedTokens += item.tokens;
      } else {
        // Try to partially include the item
        const remainingTokens = budget - usedTokens;
        if (remainingTokens > 100) { // Only include if meaningful amount remains
          const truncatedItem = this.truncateItemContent(item, remainingTokens);
          result.push(truncatedItem);
        }
        break;
      }
    }

    return result;
  }

  /**
   * Truncate from the tail (keep end)
   */
  private truncateFromTail(items: PackedItem[], budget: number): PackedItem[] {
    const result: PackedItem[] = [];
    let usedTokens = 0;

    for (let i = items.length - 1; i >= 0; i--) {
      const item = items[i];
      if (usedTokens + item.tokens <= budget) {
        result.unshift(item);
        usedTokens += item.tokens;
      } else {
        // Try to partially include the item
        const remainingTokens = budget - usedTokens;
        if (remainingTokens > 100) {
          const truncatedItem = this.truncateItemContent(item, remainingTokens);
          result.unshift(truncatedItem);
        }
        break;
      }
    }

    return result;
  }

  /**
   * Truncate from the middle (keep head and tail)
   */
  private truncateFromMiddle(items: PackedItem[], budget: number): PackedItem[] {
    const totalTokens = items.reduce((sum, item) => sum + item.tokens, 0);
    const excessTokens = totalTokens - budget;
    
    if (excessTokens <= 0) {
      return items;
    }

    // Remove items from the middle first
    const middleStart = Math.floor(items.length * 0.3);
    const middleEnd = Math.ceil(items.length * 0.7);
    
    const result = [
      ...items.slice(0, middleStart),
      ...items.slice(middleEnd)
    ];

    // If still over budget, apply smart truncation
    const newTotalTokens = result.reduce((sum, item) => sum + item.tokens, 0);
    if (newTotalTokens > budget) {
      return this.smartTruncate(result, budget);
    }

    return result;
  }

  /**
   * Smart truncation based on priorities and content importance
   */
  private smartTruncate(items: PackedItem[], budget: number): PackedItem[] {
    const strategy = this.profile.truncationStrategies;
    const result: PackedItem[] = [];
    let usedTokens = 0;

    // Sort by priority (descending) if not already sorted
    const sortedItems = [...items].sort((a, b) => b.priority - a.priority);

    for (const item of sortedItems) {
      if (usedTokens + item.tokens <= budget) {
        result.push(item);
        usedTokens += item.tokens;
      } else {
        const remainingTokens = budget - usedTokens;
        
        // For high priority items, try to include truncated version
        if (item.priority >= 0.7 && remainingTokens > 100) {
          const truncatedItem = this.truncateItemContent(item, remainingTokens);
          result.push(truncatedItem);
        }
        
        break;
      }
    }

    // Restore original order for items that were included
    const originalOrder = items.filter(item => result.some(r => r.id === item.id));
    
    return originalOrder;
  }

  /**
   * Truncate content of a single item
   */
  private truncateItemContent(item: PackedItem, maxTokens: number): PackedItem {
    const strategy = this.profile.truncationStrategies;
    const content = item.content;
    const estimatedTokens = this.estimateTokens(content);
    
    if (estimatedTokens <= maxTokens) {
      return item;
    }

    let truncatedContent = content;
    
    if (strategy.truncateComments) {
      truncatedContent = this.removeComments(truncatedContent);
    }
    
    if (this.estimateTokens(truncatedContent) > maxTokens) {
      truncatedContent = this.preserveImportantParts(truncatedContent, maxTokens, strategy);
    }
    
    // If still too long, do simple truncation
    if (this.estimateTokens(truncatedContent) > maxTokens) {
      const targetLength = Math.floor((content.length * maxTokens) / estimatedTokens);
      truncatedContent = content.substring(0, targetLength) + '... [truncated]';
    }

    return {
      ...item,
      content: truncatedContent,
      tokens: this.estimateTokens(truncatedContent)
    };
  }

  /**
   * Remove comments from content
   */
  private removeComments(content: string): string {
    // Simple comment removal - could be made more sophisticated
    return content
      .replace(/\/\/.*$/gm, '') // Remove line comments
      .replace(/\/\*[\s\S]*?\*\//g, '') // Remove block comments
      .replace(/#[^\n]*$/gm, '') // Remove Python-style comments
      .replace(/'''[\s\S]*?'''/g, '') // Remove Python docstrings
      .replace(/"""[\s\S]*?"""/g, '') // Remove Python docstrings
      .trim();
  }

  /**
   * Preserve important parts of content
   */
  private preserveImportantParts(content: string, maxTokens: number, strategy: any): string {
    const lines = content.split('\n');
    const importantLines: string[] = [];
    const otherLines: string[] = [];
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      // Keep signatures, exports, imports, class/function definitions
      if (strategy.preserveSignatures && (
        trimmed.startsWith('export') ||
        trimmed.startsWith('import') ||
        trimmed.startsWith('function') ||
        trimmed.startsWith('class') ||
        trimmed.startsWith('interface') ||
        trimmed.startsWith('def ') ||
        trimmed.includes('constructor') ||
        trimmed.match(/^\s*(public|private|protected)\s+/)
      )) {
        importantLines.push(line);
      } else {
        otherLines.push(line);
      }
    }
    
    // Combine important lines first, then add as many other lines as fit
    let result = importantLines.join('\n');
    let currentTokens = this.estimateTokens(result);
    
    for (const line of otherLines) {
      const lineTokens = this.estimateTokens(line);
      if (currentTokens + lineTokens <= maxTokens) {
        result += '\n' + line;
        currentTokens += lineTokens;
      } else {
        break;
      }
    }
    
    return result;
  }

  /**
   * Simple token estimation
   */
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }
}

// ============================================================================
// Main Context Optimizer
// ============================================================================

export class ContextOptimizer {
  private classifier: ContentClassifier;
  private budgetManager: TokenBudgetManager;
  private capsuleCreator: CapsuleCreator;
  private truncationManager: TruncationManager;

  constructor(private profile: PackingProfile) {
    this.classifier = new ContentClassifier(profile);
    this.budgetManager = new TokenBudgetManager(profile);
    this.capsuleCreator = new CapsuleCreator(profile);
    this.truncationManager = new TruncationManager(profile);
  }

  /**
   * Optimize content items according to the packing profile
   */
  async optimize(
    items: ContentItem[],
    intent?: IntentResult,
    customBudget?: number
  ): Promise<PackingResult> {
    logger.debug('Starting context optimization', { 
      itemCount: items.length, 
      repository: this.profile.repository,
      model: this.profile.model 
    });

    // Step 1: Classify items
    const classified = this.classifier.classifyItems(items, intent);
    
    // Step 2: Convert to packed items
    const packedItems: PackedItem[] = classified.map(c => ({
      id: c.item.id,
      content: c.item.content,
      tokens: this.estimateTokens(c.item.content),
      priority: c.priority,
      type: c.category,
      metadata: {
        path: c.item.path,
        spanKind: c.item.spanKind,
        spanName: c.item.spanName,
        language: c.item.language,
        score: c.item.score,
        relevance: c.item.relevance
      }
    }));

    // Step 3: Create capsules for large items
    const withCapsules = this.capsuleCreator.createCapsules(packedItems);

    // Step 4: Allocate budget
    const totalTokens = withCapsules.reduce((sum, item) => sum + item.tokens, 0);
    const budget = customBudget || this.profile.budgetAllocation.total;
    const allocation = this.budgetManager.allocateBudget(withCapsules.length, totalTokens);

    // Step 5: Apply budget constraints by category
    const budgetedItems = this.applyBudgetConstraints(withCapsules, allocation);

    // Step 6: Apply truncation if still over budget
    const finalBudget = budget - allocation.reserve;
    const { items: finalItems, truncated } = this.truncationManager.applyTruncation(budgetedItems, finalBudget);

    const finalTokens = finalItems.reduce((sum, item) => sum + item.tokens, 0);

    const result: PackingResult = {
      packed: finalItems,
      totalTokens: finalTokens,
      budgetUsed: finalTokens / budget,
      strategy: this.profile.truncationStrategies.strategy,
      truncated,
      profile: this.profile
    };

    logger.debug('Context optimization completed', {
      originalItems: items.length,
      finalItems: finalItems.length,
      originalTokens: totalTokens,
      finalTokens,
      budgetUsed: `${(result.budgetUsed * 100).toFixed(1)}%`,
      truncated
    });

    return result;
  }

  /**
   * Apply budget constraints by priority category
   */
  private applyBudgetConstraints(items: PackedItem[], allocation: Record<string, number>): PackedItem[] {
    const result: PackedItem[] = [];
    const used = { 'must-have': 0, 'important': 0, 'supplementary': 0, 'optional': 0 };

    // Process items in priority order
    const categories: Array<'must-have' | 'important' | 'supplementary' | 'optional'> = 
      ['must-have', 'important', 'supplementary', 'optional'];

    for (const category of categories) {
      const categoryItems = items.filter(item => item.type === category);
      const availableBudget = this.budgetManager.getAvailableBudget(category, used, allocation);

      for (const item of categoryItems) {
        if (used[category] + item.tokens <= availableBudget) {
          result.push(item);
          used[category] += item.tokens;
        }
      }
    }

    return result;
  }

  /**
   * Simple token estimation
   */
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }
}

export default ContextOptimizer;