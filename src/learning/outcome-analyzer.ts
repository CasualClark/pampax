import { logger } from '../config/logger.js';
import { MemoryOperations } from '../storage/memory-operations.js';
import { policyGate, type PolicyDecision } from '../policy/policy-gate.js';
import type { IntentResult } from '../intent/intent-classifier.js';
import * as crypto from 'crypto';

/**
 * Interface for outcome signals extracted from interaction data
 */
export interface OutcomeSignal {
  sessionId: string;
  query: string;
  intent: string;
  bundleSignature: string;
  satisfied: boolean;
  timeToFix?: number;
  topClickId?: string;
  tokenUsage: number;
  seedWeights: Record<string, number>;
  policyThresholds: Record<string, number>;
}

/**
 * Bundle structure for signature generation
 */
export interface BundleStructure {
  sources: Array<{
    type: string;
    items: Array<{
      path?: string;
      id?: string;
      kind?: string;
      score?: number;
      [key: string]: any;
    }>;
  }>;
  intent?: IntentResult;
  total_tokens?: number;
  budget_used?: number;
  [key: string]: any;
}

/**
 * Satisfaction metrics computed from outcome signals
 */
export interface SatisfactionMetrics {
  totalInteractions: number;
  satisfiedInteractions: number;
  unsatisfiedInteractions: number;
  overallSatisfactionRate: number;
  averageTimeToFix?: number;
  averageTokenUsage?: number;
  byIntent: Record<string, {
    total: number;
    satisfied: number;
    satisfactionRate: number;
    averageTimeToFix?: number;
    averageTokenUsage?: number;
  }>;
  byBundleSignature: Record<string, {
    total: number;
    satisfied: number;
    satisfactionRate: number;
    averageTimeToFix?: number;
    averageTokenUsage?: number;
  }>;
}

/**
 * Outcome Analyzer - Processes interaction data to extract learning signals
 * 
 * This class analyzes historical interaction data to extract patterns and signals
 * that can be used to optimize retrieval policies and improve user satisfaction.
 */
export class OutcomeAnalyzer {
  private memoryOps: MemoryOperations;

  constructor(memoryOps: MemoryOperations) {
    this.memoryOps = memoryOps;
    logger.debug('OutcomeAnalyzer initialized', {}, 'outcome-analyzer');
  }

  /**
   * Analyze interactions from the last N days and extract outcome signals
   */
  async analyzeInteractions(fromDays: number): Promise<OutcomeSignal[]> {
    const startTime = Date.now();
    const cutoffTime = Date.now() - (fromDays * 24 * 60 * 60 * 1000);

    try {
      logger.info('Starting interaction analysis', { fromDays, cutoffTime }, 'outcome-analyzer');

      // Get recent interactions
      const interactions = await this.getInteractionsSince(cutoffTime);
      logger.debug('Retrieved interactions', { count: interactions.length }, 'outcome-analyzer');

      if (interactions.length === 0) {
        logger.info('No interactions found in specified timeframe', { fromDays }, 'outcome-analyzer');
        return [];
      }

      // Extract signals from interactions
      const signals: OutcomeSignal[] = [];
      
      for (const interaction of interactions) {
        try {
          const signal = await this.extractSignalFromInteraction(interaction);
          if (signal) {
            signals.push(signal);
          }
        } catch (error) {
          logger.warn('Failed to extract signal from interaction', {
            interactionId: interaction.id,
            error: error instanceof Error ? error.message : String(error)
          }, 'outcome-analyzer');
          // Continue processing other interactions
        }
      }

      const processingTime = Date.now() - startTime;
      logger.info('Interaction analysis completed', {
        totalInteractions: interactions.length,
        extractedSignals: signals.length,
        processingTimeMs: processingTime
      }, 'outcome-analyzer');

      return signals;
    } catch (error) {
      logger.error('Failed to analyze interactions', {
        fromDays,
        error: error instanceof Error ? error.message : String(error)
      }, 'outcome-analyzer');
      throw error;
    }
  }

  /**
   * Generate a consistent signature for a bundle to enable caching and pattern analysis
   */
  generateBundleSignature(bundle: BundleStructure): string {
    try {
      // Extract key features for signature
      const features: string[] = [];
      
      // Source types and counts
      const sourceTypes = bundle.sources.map(s => `${s.type}:${s.items.length}`).sort();
      features.push(`sources:${sourceTypes.join(',')}`);

      // Intent information
      if (bundle.intent) {
        features.push(`intent:${bundle.intent.intent}:${Math.floor(bundle.intent.confidence * 100)}`);
      }

      // Token usage ranges (bucketed for consistency)
      if (bundle.total_tokens !== undefined) {
        const tokenBucket = this.bucketTokenCount(bundle.total_tokens);
        features.push(`tokens:${tokenBucket}`);
      }

      // Budget usage ranges
      if (bundle.budget_used !== undefined) {
        const budgetBucket = this.bucketBudgetUsage(bundle.budget_used);
        features.push(`budget:${budgetBucket}`);
      }

      // Content types from items
      const itemTypes = new Set<string>();
      for (const source of bundle.sources) {
        for (const item of source.items) {
          if (item.kind) itemTypes.add(item.kind);
          if (item.path && item.path.includes('.')) {
            const ext = item.path.split('.').pop()?.toLowerCase();
            if (ext) itemTypes.add(`ext:${ext}`);
          }
        }
      }
      if (itemTypes.size > 0) {
        features.push(`types:${Array.from(itemTypes).sort().join(',')}`);
      }

      // Create hash from features
      const featureString = features.join('|');
      const signature = crypto.createHash('sha256')
        .update(featureString)
        .digest('hex')
        .substring(0, 16);

      return `b_${signature}`;
    } catch (error) {
      logger.warn('Failed to generate bundle signature', {
        error: error instanceof Error ? error.message : String(error)
      }, 'outcome-analyzer');
      // Fallback to simple hash
      return `b_${crypto.createHash('sha256').update(JSON.stringify(bundle)).digest('hex').substring(0, 16)}`;
    }
  }

  /**
   * Compute satisfaction metrics from extracted signals
   */
  async computeSatisfactionMetrics(signals: OutcomeSignal[]): Promise<SatisfactionMetrics> {
    try {
      logger.debug('Computing satisfaction metrics', { signalCount: signals.length }, 'outcome-analyzer');

      const metrics: SatisfactionMetrics = {
        totalInteractions: signals.length,
        satisfiedInteractions: 0,
        unsatisfiedInteractions: 0,
        overallSatisfactionRate: 0,
        averageTimeToFix: undefined,
        averageTokenUsage: undefined,
        byIntent: {},
        byBundleSignature: {}
      };

      const timeToFixValues: number[] = [];
      const tokenUsageValues: number[] = [];

      // Process each signal
      for (const signal of signals) {
        // Count satisfaction
        if (signal.satisfied) {
          metrics.satisfiedInteractions++;
        } else {
          metrics.unsatisfiedInteractions++;
        }

        // Collect time and token metrics
        if (signal.timeToFix !== undefined) {
          timeToFixValues.push(signal.timeToFix);
        }
        tokenUsageValues.push(signal.tokenUsage);

        // Group by intent
        if (!metrics.byIntent[signal.intent]) {
          metrics.byIntent[signal.intent] = {
            total: 0,
            satisfied: 0,
            satisfactionRate: 0,
            averageTimeToFix: undefined,
            averageTokenUsage: undefined
          };
        }
        metrics.byIntent[signal.intent].total++;
        if (signal.satisfied) {
          metrics.byIntent[signal.intent].satisfied++;
        }

        // Group by bundle signature
        if (!metrics.byBundleSignature[signal.bundleSignature]) {
          metrics.byBundleSignature[signal.bundleSignature] = {
            total: 0,
            satisfied: 0,
            satisfactionRate: 0,
            averageTimeToFix: undefined,
            averageTokenUsage: undefined
          };
        }
        metrics.byBundleSignature[signal.bundleSignature].total++;
        if (signal.satisfied) {
          metrics.byBundleSignature[signal.bundleSignature].satisfied++;
        }
      }

      // Calculate overall satisfaction rate
      metrics.overallSatisfactionRate = metrics.totalInteractions > 0 
        ? metrics.satisfiedInteractions / metrics.totalInteractions 
        : 0;

      // Calculate averages
      if (timeToFixValues.length > 0) {
        metrics.averageTimeToFix = timeToFixValues.reduce((a, b) => a + b, 0) / timeToFixValues.length;
      }
      if (tokenUsageValues.length > 0) {
        metrics.averageTokenUsage = tokenUsageValues.reduce((a, b) => a + b, 0) / tokenUsageValues.length;
      }

      // Calculate intent-specific metrics
      for (const [intent, intentMetrics] of Object.entries(metrics.byIntent)) {
        intentMetrics.satisfactionRate = intentMetrics.total > 0 
          ? intentMetrics.satisfied / intentMetrics.total 
          : 0;

        // Calculate intent-specific averages
        const intentSignals = signals.filter(s => s.intent === intent);
        const intentTimeValues = intentSignals.filter(s => s.timeToFix !== undefined).map(s => s.timeToFix!);
        const intentTokenValues = intentSignals.map(s => s.tokenUsage);

        if (intentTimeValues.length > 0) {
          intentMetrics.averageTimeToFix = intentTimeValues.reduce((a, b) => a + b, 0) / intentTimeValues.length;
        }
        if (intentTokenValues.length > 0) {
          intentMetrics.averageTokenUsage = intentTokenValues.reduce((a, b) => a + b, 0) / intentTokenValues.length;
        }
      }

      // Calculate bundle signature-specific metrics
      for (const [signature, sigMetrics] of Object.entries(metrics.byBundleSignature)) {
        sigMetrics.satisfactionRate = sigMetrics.total > 0 
          ? sigMetrics.satisfied / sigMetrics.total 
          : 0;

        // Calculate signature-specific averages
        const sigSignals = signals.filter(s => s.bundleSignature === signature);
        const sigTimeValues = sigSignals.filter(s => s.timeToFix !== undefined).map(s => s.timeToFix!);
        const sigTokenValues = sigSignals.map(s => s.tokenUsage);

        if (sigTimeValues.length > 0) {
          sigMetrics.averageTimeToFix = sigTimeValues.reduce((a, b) => a + b, 0) / sigTimeValues.length;
        }
        if (sigTokenValues.length > 0) {
          sigMetrics.averageTokenUsage = sigTokenValues.reduce((a, b) => a + b, 0) / sigTokenValues.length;
        }
      }

      logger.debug('Satisfaction metrics computed', {
        totalInteractions: metrics.totalInteractions,
        overallSatisfactionRate: metrics.overallSatisfactionRate,
        intentCount: Object.keys(metrics.byIntent).length,
        signatureCount: Object.keys(metrics.byBundleSignature).length
      }, 'outcome-analyzer');

      return metrics;
    } catch (error) {
      logger.error('Failed to compute satisfaction metrics', {
        error: error instanceof Error ? error.message : String(error)
      }, 'outcome-analyzer');
      throw error;
    }
  }

  /**
   * Get interactions since a specific timestamp
   */
  private async getInteractionsSince(cutoffTime: number): Promise<any[]> {
    return new Promise((resolve, reject) => {
      const db = (this.memoryOps as any).db.db;
      
      const sql = `
        SELECT 
          i.*,
          s.tool,
          s.repo,
          s.branch
        FROM interaction i
        JOIN session s ON i.session_id = s.id
        WHERE i.ts >= ?
        ORDER BY i.ts DESC
      `;

      db.all(sql, [cutoffTime], (err: any, rows: any[]) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows || []);
        }
      });
    });
  }

  /**
   * Extract outcome signal from a single interaction record
   */
  private async extractSignalFromInteraction(interaction: any): Promise<OutcomeSignal | null> {
    try {
      // Parse notes for additional metadata
      let notesData: any = {};
      if (interaction.notes) {
        try {
          notesData = JSON.parse(interaction.notes);
        } catch (e) {
          logger.debug('Failed to parse interaction notes', {
            interactionId: interaction.id,
            notes: interaction.notes
          }, 'outcome-analyzer');
        }
      }

      // Extract intent from notes or classify from query
      let intent: string = 'search'; // default
      if (notesData.intent) {
        intent = notesData.intent;
      } else {
        // Simple intent classification based on query patterns
        intent = this.classifyIntent(interaction.query);
      }

      // Generate bundle signature (use bundle_id if available, otherwise create synthetic one)
      let bundleSignature = 'unknown';
      if (interaction.bundle_id) {
        // Try to get actual bundle data for signature generation
        try {
          const bundleData = await this.getBundleData(interaction.bundle_id);
          if (bundleData) {
            bundleSignature = this.generateBundleSignature(bundleData);
          } else {
            bundleSignature = `bundle_${interaction.bundle_id}`;
          }
        } catch (e) {
          bundleSignature = `bundle_${interaction.bundle_id}`;
        }
      }

      // Get policy information for this intent
      const policyDecision = policyGate.evaluate(
        { intent: intent as any, confidence: notesData.confidence || 0.5, entities: [], suggestedPolicies: [] },
        { repo: interaction.repo, language: this.detectLanguage(interaction.repo) }
      );

      // Extract time to fix
      const timeToFix = (notesData as any).time_to_fix_ms || (notesData as any).timeToFix;

      // Extract top click ID
      const topClickId = (notesData as any).top_click_id || (notesData as any).topClickId;

      // Estimate token usage (this would ideally come from the actual bundle)
      const tokenUsage = (notesData as any).tokenUsage || (notesData as any).total_tokens || this.estimateTokenUsage(interaction.query);

      const signal: OutcomeSignal = {
        sessionId: interaction.session_id,
        query: interaction.query,
        intent,
        bundleSignature,
        satisfied: Boolean(interaction.satisfied),
        timeToFix,
        topClickId,
        tokenUsage,
        seedWeights: policyDecision.seedWeights,
        policyThresholds: {
          earlyStop: policyDecision.earlyStopThreshold,
          maxDepth: policyDecision.maxDepth,
          includeSymbols: policyDecision.includeSymbols ? 1 : 0,
          includeFiles: policyDecision.includeFiles ? 1 : 0,
          includeContent: policyDecision.includeContent ? 1 : 0
        }
      };

      return signal;
    } catch (error) {
      logger.warn('Failed to extract signal from interaction', {
        interactionId: interaction.id,
        error: error instanceof Error ? error.message : String(error)
      }, 'outcome-analyzer');
      return null;
    }
  }

  /**
   * Simple intent classification based on query patterns
   */
  private classifyIntent(query: string): string {
    const lowerQuery = query.toLowerCase();
    
    if (lowerQuery.includes('function') || lowerQuery.includes('class') || lowerQuery.includes('method') || 
        lowerQuery.includes('variable') || lowerQuery.includes('symbol')) {
      return 'symbol';
    }
    
    if (lowerQuery.includes('config') || lowerQuery.includes('setting') || lowerQuery.includes('env') ||
        lowerQuery.includes('environment') || lowerQuery.includes('option')) {
      return 'config';
    }
    
    if (lowerQuery.includes('api') || lowerQuery.includes('endpoint') || lowerQuery.includes('route') ||
        lowerQuery.includes('handler') || lowerQuery.includes('controller')) {
      return 'api';
    }
    
    if (lowerQuery.includes('error') || lowerQuery.includes('exception') || lowerQuery.includes('bug') ||
        lowerQuery.includes('issue') || lowerQuery.includes('problem') || lowerQuery.includes('incident')) {
      return 'incident';
    }
    
    return 'search';
  }

  /**
   * Detect programming language from repository path
   */
  private detectLanguage(repo?: string): string {
    if (!repo) return 'unknown';
    
    const lowerRepo = repo.toLowerCase();
    
    if (lowerRepo.includes('.py') || lowerRepo.includes('python')) return 'python';
    if (lowerRepo.includes('.ts') || lowerRepo.includes('.js') || lowerRepo.includes('typescript') || lowerRepo.includes('javascript')) return 'typescript';
    if (lowerRepo.includes('.java') || lowerRepo.includes('java')) return 'java';
    if (lowerRepo.includes('.go') || lowerRepo.includes('golang')) return 'go';
    
    return 'unknown';
  }

  /**
   * Get bundle data for signature generation
   */
  private async getBundleData(bundleId: string): Promise<BundleStructure | null> {
    try {
      // Try to retrieve bundle data from memory storage using the bundle_id as a memory key
      const bundleMemories = await this.memoryOps.findByKey(bundleId, 'repo');
      
      if (bundleMemories && bundleMemories.length > 0) {
        // Parse the bundle data from the memory value
        const bundleData = JSON.parse(bundleMemories[0].value);
        
        // Validate that it has the expected structure
        if (bundleData && bundleData.sources && Array.isArray(bundleData.sources)) {
          logger.debug('Retrieved bundle data from memory storage', {
            bundleId,
            sourceCount: bundleData.sources.length,
            totalTokens: bundleData.total_tokens
          }, 'outcome-analyzer');
          
          return bundleData;
        }
      }
      
      // If not found in memory, try to reconstruct from interaction notes if available
      logger.debug('Bundle data not found in memory storage', {
        bundleId
      }, 'outcome-analyzer');
      
      return null;
    } catch (error) {
      logger.warn('Failed to retrieve bundle data', {
        bundleId,
        error: error instanceof Error ? error.message : String(error)
      }, 'outcome-analyzer');
      
      return null;
    }
  }

  /**
   * Estimate token usage based on query length
   */
  private estimateTokenUsage(query: string): number {
    // Rough estimation: ~4 characters per token
    return Math.ceil(query.length / 4) + 50; // Base tokens for processing
  }

  /**
   * Bucket token counts for signature consistency
   */
  private bucketTokenCount(tokens: number): string {
    if (tokens < 100) return 'small';
    if (tokens < 500) return 'medium';
    if (tokens < 2000) return 'large';
    return 'xlarge';
  }

  /**
   * Bucket budget usage for signature consistency
   */
  private bucketBudgetUsage(budgetUsed: number): string {
    if (budgetUsed < 0.3) return 'low';
    if (budgetUsed < 0.7) return 'medium';
    if (budgetUsed < 0.9) return 'high';
    return 'critical';
  }
}