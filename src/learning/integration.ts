import { logger } from '../config/logger.js';
import { MemoryOperations } from '../storage/memory-operations.js';
import { OutcomeAnalyzer, type OutcomeSignal, type SatisfactionMetrics } from './outcome-analyzer.js';
import { WeightOptimizer, type WeightOptimizationResult } from './weight-optimizer.js';
import { PolicyTuner, type PolicyTuningResult } from './policy-tuner.js';
import { SignatureCache } from './signature-cache.js';
import { policyGate, type PolicyDecision } from '../policy/policy-gate.js';
import { intentClassifier, type IntentResult } from '../intent/intent-classifier.js';
import { PerformanceTracker } from '../analytics/performance-tracker.js';

/**
 * Configuration for learning system integration
 */
export interface LearningIntegrationConfig {
  enabled: boolean;
  analysisInterval: number; // milliseconds
  minSignalsForOptimization: number;
  cacheEnabled: boolean;
  autoApplyOptimizations: boolean;
  performanceTracking: boolean;
  rollbackOnFailure: boolean;
}

/**
 * Learning system state and statistics
 */
export interface LearningState {
  lastAnalysis: number;
  totalSignals: number;
  lastOptimization: number;
  optimizationCount: number;
  cacheHitRate: number;
  averageSatisfaction: number;
  isActive: boolean;
}

/**
 * Integration result for operations
 */
export interface IntegrationResult {
  success: boolean;
  signalsProcessed?: number;
  optimizationsApplied?: number;
  cacheHits?: number;
  errors?: string[];
  performance?: {
    analysisTime: number;
    optimizationTime: number;
    totalTime: number;
  };
}

/**
 * Learning System Integration - Coordinates all learning components
 * 
 * This class provides the main integration point between the learning system
 * and existing search, intent, and policy components. It manages the complete
 * learning workflow from signal collection to policy optimization.
 */
export class LearningIntegration {
  private memoryOps: MemoryOperations;
  private outcomeAnalyzer: OutcomeAnalyzer;
  private weightOptimizer: WeightOptimizer;
  private policyTuner: PolicyTuner;
  private signatureCache: SignatureCache;
  private performanceTracker: PerformanceTracker;
  private config: LearningIntegrationConfig;
  private state: LearningState;
  private analysisTimer?: NodeJS.Timeout;

  constructor(memoryOps: MemoryOperations, config: Partial<LearningIntegrationConfig> = {}) {
    this.memoryOps = memoryOps;
    this.config = {
      enabled: true,
      analysisInterval: 60 * 60 * 1000, // 1 hour
      minSignalsForOptimization: 10,
      cacheEnabled: true,
      autoApplyOptimizations: true,
      performanceTracking: true,
      rollbackOnFailure: true,
      ...config
    };

    // Initialize components
    this.outcomeAnalyzer = new OutcomeAnalyzer(memoryOps);
    this.weightOptimizer = new WeightOptimizer();
    this.policyTuner = new PolicyTuner();
    this.signatureCache = new SignatureCache();
    this.performanceTracker = new PerformanceTracker();

    // Initialize state
    this.state = {
      lastAnalysis: 0,
      totalSignals: 0,
      lastOptimization: 0,
      optimizationCount: 0,
      cacheHitRate: 0,
      averageSatisfaction: 0,
      isActive: false
    };

    logger.info('LearningIntegration initialized', { config: this.config }, 'learning-integration');
  }

  /**
   * Start the learning system integration
   */
  async start(): Promise<void> {
    if (!this.config.enabled) {
      logger.info('Learning integration disabled by configuration', {}, 'learning-integration');
      return;
    }

    try {
      this.state.isActive = true;
      
      // Load existing state if available
      await this.loadState();
      
      // Start periodic analysis
      this.startPeriodicAnalysis();
      
      // Performance tracking is initialized in constructor

      logger.info('Learning integration started', { 
        analysisInterval: this.config.analysisInterval,
        autoApply: this.config.autoApplyOptimizations
      }, 'learning-integration');
    } catch (error) {
      logger.error('Failed to start learning integration', {
        error: error instanceof Error ? error.message : String(error)
      }, 'learning-integration');
      throw error;
    }
  }

  /**
   * Stop the learning system integration
   */
  async stop(): Promise<void> {
    try {
      this.state.isActive = false;
      
      if (this.analysisTimer) {
        clearInterval(this.analysisTimer);
        this.analysisTimer = undefined;
      }

      // Save current state
      await this.saveState();

      // Performance tracking cleanup

      logger.info('Learning integration stopped', {}, 'learning-integration');
    } catch (error) {
      logger.error('Failed to stop learning integration', {
        error: error instanceof Error ? error.message : String(error)
      }, 'learning-integration');
      throw error;
    }
  }

  /**
   * Record a search interaction for learning
   */
  async recordInteraction(interaction: {
    sessionId: string;
    query: string;
    intent?: IntentResult;
    bundleId?: string;
    bundleData?: any;
    satisfied: boolean;
    timeToFix?: number;
    topClickId?: string;
    tokenUsage?: number;
    repo?: string;
    branch?: string;
  }): Promise<void> {
    if (!this.config.enabled || !this.state.isActive) {
      return;
    }

    try {
      // Generate bundle signature if bundle data is provided
      let bundleSignature = 'unknown';
      if (interaction.bundleData) {
        bundleSignature = this.outcomeAnalyzer.generateBundleSignature(interaction.bundleData);
      } else if (interaction.bundleId) {
        bundleSignature = `bundle_${interaction.bundleId}`;
      }

      // Get policy decision for this interaction
      const intent = interaction.intent || intentClassifier.classify(interaction.query);
      const policyDecision = policyGate.evaluate(intent, {
        repo: interaction.repo,
        language: this.detectLanguage(interaction.repo)
      });

      // Store interaction in memory for analysis
      await this.memoryOps.insert({
        scope: 'learning',
        repo: interaction.repo || 'unknown',
        branch: interaction.branch || 'main',
        kind: 'interaction',
        key: `interaction_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        value: JSON.stringify({
          sessionId: interaction.sessionId,
          query: interaction.query,
          intent: intent.intent,
          confidence: intent.confidence,
          bundleSignature,
          satisfied: interaction.satisfied,
          timeToFix: interaction.timeToFix,
          topClickId: interaction.topClickId,
          tokenUsage: interaction.tokenUsage || this.estimateTokenUsage(interaction.query),
          seedWeights: policyDecision.seedWeights,
          policyThresholds: {
            earlyStop: policyDecision.earlyStopThreshold,
            maxDepth: policyDecision.maxDepth,
            includeSymbols: policyDecision.includeSymbols ? 1 : 0,
            includeFiles: policyDecision.includeFiles ? 1 : 0,
            includeContent: policyDecision.includeContent ? 1 : 0
          },
          timestamp: Date.now()
        }),
        weight: 1.0,
        source_json: JSON.stringify({
          type: 'learning_interaction',
          version: '1.0'
        })
      });

      this.state.totalSignals++;
      
      logger.debug('Interaction recorded for learning', {
        sessionId: interaction.sessionId,
        intent: intent.intent,
        satisfied: interaction.satisfied
      }, 'learning-integration');
    } catch (error) {
      logger.warn('Failed to record learning interaction', {
        sessionId: interaction.sessionId,
        error: error instanceof Error ? error.message : String(error)
      }, 'learning-integration');
      // Don't throw - recording failures shouldn't break the search flow
    }
  }

  /**
   * Check cache for similar successful queries
   */
  async checkCache(querySignature: string): Promise<string | null> {
    if (!this.config.cacheEnabled || !this.state.isActive) {
      return null;
    }

    try {
      const cacheResult = await this.signatureCache.get(querySignature);
      
      if (cacheResult) {
        const stats = await this.signatureCache.getStats();
        this.state.cacheHitRate = stats.hitRate;
        logger.debug('Cache hit for query', { 
          querySignature: querySignature.substring(0, 50), 
          bundleId: cacheResult.bundleId 
        }, 'learning-integration');
        return cacheResult.bundleId;
      }

      return null;
    } catch (error) {
      logger.warn('Cache check failed', {
        querySignature: querySignature.substring(0, 50),
        error: error instanceof Error ? error.message : String(error)
      }, 'learning-integration');
      return null;
    }
  }

  /**
   * Store successful bundle in cache
   */
  async storeInCache(querySignature: string, bundleId: string, satisfaction: number): Promise<void> {
    if (!this.config.cacheEnabled || !this.state.isActive) {
      return;
    }

    try {
      const cacheEntry = {
        querySignature,
        bundleId,
        satisfaction,
        usageCount: 1,
        createdAt: Date.now(),
        lastUsed: Date.now(),
        ttl: 7 * 24 * 60 * 60 * 1000 // 7 days
      };
      
      await this.signatureCache.set(cacheEntry);
      const stats = await this.signatureCache.getStats();
      this.state.cacheHitRate = stats.hitRate;
      
      logger.debug('Bundle stored in cache', {
        querySignature: querySignature.substring(0, 50),
        bundleId,
        satisfaction
      }, 'learning-integration');
    } catch (error) {
      logger.warn('Failed to store in cache', {
        querySignature: querySignature.substring(0, 50),
        error: error instanceof Error ? error.message : String(error)
      }, 'learning-integration');
    }
  }

  /**
   * Run the complete learning workflow
   */
  async runLearningWorkflow(fromDays: number = 7): Promise<IntegrationResult> {
    if (!this.config.enabled || !this.state.isActive) {
      return { success: false, errors: ['Learning integration disabled'] };
    }

    const startTime = Date.now();
    const result: IntegrationResult = { success: true };

    try {
      logger.info('Starting learning workflow', { fromDays }, 'learning-integration');

      // Step 1: Analyze interactions and extract signals
      const analysisStart = Date.now();
      const signals = await this.outcomeAnalyzer.analyzeInteractions(fromDays);
      result.signalsProcessed = signals.length;
      const analysisTime = Date.now() - analysisStart;

      if (signals.length < this.config.minSignalsForOptimization) {
        logger.info('Insufficient signals for optimization', {
          signalCount: signals.length,
          minRequired: this.config.minSignalsForOptimization
        }, 'learning-integration');
        return { 
          success: true, 
          signalsProcessed: signals.length,
          performance: { analysisTime, optimizationTime: 0, totalTime: Date.now() - startTime }
        };
      }

      // Step 2: Compute satisfaction metrics
      const metrics = await this.outcomeAnalyzer.computeSatisfactionMetrics(signals);
      this.state.averageSatisfaction = metrics.overallSatisfactionRate;

      // Step 3: Optimize weights
      const optimizationStart = Date.now();
      const currentWeights = this.getCurrentWeights();
      const weightResult = await this.weightOptimizer.optimizeWeights(signals, currentWeights);
      const optimizationTime = Date.now() - optimizationStart;

      // Step 4: Tune policies
      const currentPolicies = this.getCurrentPolicies();
      const policyResult = await this.policyTuner.tunePolicies(signals, currentPolicies);

      // Step 5: Apply optimizations if configured
      if (this.config.autoApplyOptimizations) {
        await this.applyOptimizations(weightResult, policyResult);
        result.optimizationsApplied = 1;
      }

      // Step 6: Update state
      this.state.lastAnalysis = Date.now();
      this.state.lastOptimization = Date.now();
      this.state.optimizationCount++;
      await this.saveState();

      const totalTime = Date.now() - startTime;
      result.performance = { analysisTime, optimizationTime, totalTime };

      logger.info('Learning workflow completed', {
        signalsProcessed: signals.length,
        satisfactionRate: metrics.overallSatisfactionRate,
        weightImprovement: weightResult.improvement,
        policyImprovement: policyResult.improvement,
        totalTime
      }, 'learning-integration');

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Learning workflow failed', {
        fromDays,
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined
      }, 'learning-integration');

      result.success = false;
      result.errors = [errorMessage];
      result.performance = { 
        analysisTime: 0, 
        optimizationTime: 0, 
        totalTime: Date.now() - startTime 
      };

      return result;
    }
  }

  /**
   * Get current learning system state
   */
  getState(): LearningState {
    return { ...this.state };
  }

  /**
   * Get comprehensive learning statistics
   */
  async getLearningStats(): Promise<{
    state: LearningState;
    cacheStats: any;
    performanceMetrics?: any;
  }> {
    const cacheStats = await this.signatureCache.getStats();
    let performanceMetrics;

    if (this.config.performanceTracking) {
      // PerformanceTracker doesn't have getMetrics method, use placeholder
      performanceMetrics = { tracking: true };
    }

    return {
      state: this.getState(),
      cacheStats,
      performanceMetrics
    };
  }

  /**
   * Apply optimizations with rollback capability
   */
  private async applyOptimizations(
    weightResult: WeightOptimizationResult,
    policyResult: PolicyTuningResult
  ): Promise<void> {
    try {
      // Apply weight optimizations
      if (weightResult.improvement > 0) {
        await this.weightOptimizer.applyWeightUpdates(weightResult.optimizedWeights);
        logger.info('Weight optimizations applied', {
          improvement: weightResult.improvement,
          iterations: weightResult.iterations
        }, 'learning-integration');
      }

      // Apply policy optimizations
      if (policyResult.improvement > 0) {
        await this.policyTuner.applyPolicyUpdates(policyResult.optimizedPolicies);
        logger.info('Policy optimizations applied', {
          improvement: policyResult.improvement,
          parameterChanges: Object.keys(policyResult.parameterChanges).length
        }, 'learning-integration');
      }
    } catch (error) {
      if (this.config.rollbackOnFailure) {
        logger.warn('Optimization application failed, attempting rollback', {
          error: error instanceof Error ? error.message : String(error)
        }, 'learning-integration');

        try {
          await this.weightOptimizer.rollbackWeights(weightResult.rollbackData);
          await this.policyTuner.rollbackPolicies(policyResult.rollbackData);
          logger.info('Rollback completed successfully', {}, 'learning-integration');
        } catch (rollbackError) {
          logger.error('Rollback failed', {
            error: rollbackError instanceof Error ? rollbackError.message : String(rollbackError)
          }, 'learning-integration');
        }
      }
      throw error;
    }
  }

  /**
   * Start periodic analysis
   */
  private startPeriodicAnalysis(): void {
    if (this.analysisTimer) {
      clearInterval(this.analysisTimer);
    }

    this.analysisTimer = setInterval(async () => {
      if (this.state.isActive) {
        try {
          await this.runLearningWorkflow();
        } catch (error) {
          logger.error('Periodic learning workflow failed', {
            error: error instanceof Error ? error.message : String(error)
          }, 'learning-integration');
        }
      }
    }, this.config.analysisInterval);

    logger.debug('Periodic analysis started', {
      interval: this.config.analysisInterval
    }, 'learning-integration');
  }

  /**
   * Get current weights from policy gate
   */
  private getCurrentWeights(): Record<string, Record<string, number>> {
    const policies = policyGate.getAllPolicies();
    const weights: Record<string, Record<string, number>> = {};

    for (const [intentType, policy] of Object.entries(policies.default)) {
      weights[intentType] = { ...policy.seedWeights };
    }

    return weights;
  }

  /**
   * Get current policies from policy gate
   */
  private getCurrentPolicies(): Record<string, any> {
    return policyGate.getAllPolicies().default;
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
   * Estimate token usage based on query length
   */
  private estimateTokenUsage(query: string): number {
    return Math.ceil(query.length / 4) + 50; // Base tokens for processing
  }

  /**
   * Load learning state from storage
   */
  private async loadState(): Promise<void> {
    try {
      // This would typically load from persistent storage
      // For now, initialize with defaults
      logger.debug('Learning state loaded (defaults)', {}, 'learning-integration');
    } catch (error) {
      logger.warn('Failed to load learning state, using defaults', {
        error: error instanceof Error ? error.message : String(error)
      }, 'learning-integration');
    }
  }

  /**
   * Save learning state to storage
   */
  private async saveState(): Promise<void> {
    try {
      // This would typically save to persistent storage
      logger.debug('Learning state saved', {
        totalSignals: this.state.totalSignals,
        optimizationCount: this.state.optimizationCount
      }, 'learning-integration');
    } catch (error) {
      logger.warn('Failed to save learning state', {
        error: error instanceof Error ? error.message : String(error)
      }, 'learning-integration');
    }
  }
}

// Export singleton instance for easy integration
let learningIntegrationInstance: LearningIntegration | null = null;

export function getLearningIntegration(memoryOps: MemoryOperations, config?: Partial<LearningIntegrationConfig>): LearningIntegration {
  if (!learningIntegrationInstance) {
    learningIntegrationInstance = new LearningIntegration(memoryOps, config);
  }
  return learningIntegrationInstance;
}

export function resetLearningIntegration(): void {
  learningIntegrationInstance = null;
}