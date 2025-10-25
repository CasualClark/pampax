import { logger } from '../config/logger.js';
import { policyGate, type PolicyDecision } from '../policy/policy-gate.js';
import type { OutcomeSignal } from './outcome-analyzer.js';

/**
 * Interface for policy tuning result
 */
export interface PolicyTuningResult {
  optimizedPolicies: Record<string, PolicyDecision>;
  improvement: number;
  parameterChanges: Record<string, ParameterChange>;
  rollbackData: Record<string, PolicyDecision>;
  validationErrors: string[];
}

/**
 * Interface for parameter change tracking
 */
export interface ParameterChange {
  parameter: string;
  oldValue: any;
  newValue: any;
  impact: number;
  confidence: number;
}

/**
 * Interface for tuning options
 */
export interface TuningOptions {
  learningRate?: number;
  maxIterations?: number;
  convergenceThreshold?: number;
  minSignalsPerIntent?: number;
  repository?: string;
  language?: string;
  parameterBounds?: {
    maxDepth: { min: number; max: number };
    earlyStopThreshold: { min: number; max: number };
    seedWeight: { min: number; max: number };
  };
}

/**
 * Policy Tuner - Optimizes policy parameters based on outcome signals
 * 
 * This class implements optimization algorithms to adjust early-stop thresholds,
 * max depth, include flags, and other policy parameters based on satisfaction
 * signals from the OutcomeAnalyzer, supporting per-intent, per-language, 
 * and per-repository tuning.
 */
export class PolicyTuner {
  private readonly defaultOptions: Required<TuningOptions> = {
    learningRate: 0.1,
    maxIterations: 100,
    convergenceThreshold: 0.001,
    minSignalsPerIntent: 5,
    repository: '',
    language: '',
    parameterBounds: {
      maxDepth: { min: 1, max: 10 },
      earlyStopThreshold: { min: 1, max: 50 },
      seedWeight: { min: 0.1, max: 5.0 }
    }
  };

  /**
   * Tune policies based on outcome signals
   */
  async tunePolicies(
    signals: OutcomeSignal[],
    currentPolicies: Record<string, PolicyDecision>,
    options?: TuningOptions
  ): Promise<PolicyTuningResult> {
    const startTime = Date.now();
    const opts = { ...this.defaultOptions, ...options };

    logger.info('Starting policy tuning', {
      signalCount: signals.length,
      policyCount: Object.keys(currentPolicies).length,
      repository: opts.repository,
      language: opts.language
    }, 'policy-tuner');

    try {
      // Validate inputs
      if (!signals || signals.length === 0) {
        logger.warn('No signals provided for tuning', {}, 'policy-tuner');
        return {
          optimizedPolicies: { ...currentPolicies },
          improvement: 0,
          parameterChanges: {},
          rollbackData: { ...currentPolicies },
          validationErrors: []
        };
      }

      if (!currentPolicies || Object.keys(currentPolicies).length === 0) {
        logger.warn('No current policies provided for tuning', {}, 'policy-tuner');
        return {
          optimizedPolicies: {},
          improvement: 0,
          parameterChanges: {},
          rollbackData: {},
          validationErrors: []
        };
      }

      // Validate and clamp current policies to constraints
      const validatedPolicies: Record<string, PolicyDecision> = {};
      const inputValidationErrors: string[] = [];

      for (const [intent, policy] of Object.entries(currentPolicies)) {
        const errors = this.validatePolicy(policy);
        if (errors.length > 0) {
          inputValidationErrors.push(`Intent ${intent}: ${errors.join(', ')}`);
        }

        // Clamp values to valid ranges
        validatedPolicies[intent] = {
          maxDepth: Math.max(opts.parameterBounds.maxDepth.min, 
                   Math.min(opts.parameterBounds.maxDepth.max, policy.maxDepth)),
          includeSymbols: policy.includeSymbols,
          includeFiles: policy.includeFiles,
          includeContent: policy.includeContent,
          earlyStopThreshold: Math.max(opts.parameterBounds.earlyStopThreshold.min,
                              Math.min(opts.parameterBounds.earlyStopThreshold.max, policy.earlyStopThreshold)),
          seedWeights: {}
        };

        // Clamp seed weights
        for (const [key, weight] of Object.entries(policy.seedWeights)) {
          validatedPolicies[intent].seedWeights[key] = Math.max(opts.parameterBounds.seedWeight.min,
                                                    Math.min(opts.parameterBounds.seedWeight.max, weight));
        }
      }

      // Use validated policies instead of original
      const policiesToTune = validatedPolicies;

      // Group signals by intent for targeted optimization
      const signalsByIntent = this.groupSignalsByIntent(signals);
      
      // Filter intents with sufficient data
      const validIntents = Object.entries(signalsByIntent)
        .filter(([_, intentSignals]) => intentSignals.length >= opts.minSignalsPerIntent)
        .map(([intent, _]) => intent);

      if (validIntents.length === 0) {
        logger.warn('No intents with sufficient data for tuning', {
          minSignals: opts.minSignalsPerIntent,
          intentSignalCounts: Object.entries(signalsByIntent).map(([i, s]) => [i, s.length])
        }, 'policy-tuner');
        return {
          optimizedPolicies: { ...currentPolicies },
          improvement: 0,
          parameterChanges: {},
          rollbackData: { ...currentPolicies },
          validationErrors: []
        };
      }

      // Calculate baseline satisfaction rate
      const baselineSatisfaction = this.calculateOverallSatisfaction(signals);
      logger.debug('Baseline satisfaction rate', { rate: baselineSatisfaction }, 'policy-tuner');

      // Initialize optimization variables
      let optimizedPolicies = JSON.parse(JSON.stringify(policiesToTune));
      let previousLoss = Infinity;
      let converged = false;
      let iterations = 0;
      const parameterChanges: Record<string, ParameterChange> = {};

      // Optimization loop
      for (iterations = 0; iterations < opts.maxIterations; iterations++) {
        // Calculate parameter adjustments for each intent
        const adjustments = this.calculateParameterAdjustments(
          signals, 
          optimizedPolicies, 
          validIntents, 
          opts
        );
        
        // Apply parameter updates
        const newPolicies = this.applyParameterUpdates(
          optimizedPolicies, 
          adjustments, 
          opts
        );
        
        // Calculate new loss (negative satisfaction rate for minimization)
        const currentLoss = this.calculateLoss(signals, newPolicies, validIntents);
        
        // Check convergence
        const lossImprovement = Math.abs(previousLoss - currentLoss);
        if (lossImprovement < opts.convergenceThreshold) {
          converged = true;
          logger.debug('Policy tuning converged', {
            iterations,
            finalLoss: currentLoss,
            improvement: lossImprovement
          }, 'policy-tuner');
          break;
        }
        
        // Update for next iteration
        optimizedPolicies = newPolicies;
        previousLoss = currentLoss;
        
        logger.debug('Policy tuning iteration', {
          iteration: iterations,
          loss: currentLoss,
          improvement: lossImprovement
        }, 'policy-tuner');
      }

      // Calculate final improvement and parameter changes
      const finalSatisfaction = this.calculateOverallSatisfaction(signals);
      const improvement = Math.max(0, finalSatisfaction - baselineSatisfaction);

      // Track parameter changes
      for (const [intent, originalPolicy] of Object.entries(currentPolicies)) {
        const optimizedPolicy = optimizedPolicies[intent];
        if (!optimizedPolicy) continue;

        // Compare each parameter
        this.compareParameters(originalPolicy, optimizedPolicy, intent, parameterChanges);
      }

      // Validate optimized policies
      const validationErrors: string[] = [];
      for (const [intent, policy] of Object.entries(optimizedPolicies)) {
        const errors = this.validatePolicy(policy as PolicyDecision);
        if (errors.length > 0) {
          validationErrors.push(`Intent ${intent}: ${errors.join(', ')}`);
        }
      }

      const processingTime = Date.now() - startTime;
      logger.info('Policy tuning completed', {
        iterations,
        converged,
        improvement,
        baselineSatisfaction,
        finalSatisfaction,
        parameterChangesCount: Object.keys(parameterChanges).length,
        validationErrorsCount: validationErrors.length,
        processingTimeMs: processingTime
      }, 'policy-tuner');

      return {
        optimizedPolicies,
        improvement,
        parameterChanges,
        rollbackData: { ...currentPolicies },
        validationErrors: [...validationErrors, ...inputValidationErrors]
      };

    } catch (error) {
      logger.error('Policy tuning failed', {
        signalCount: signals.length,
        error: error instanceof Error ? error.message : String(error)
      }, 'policy-tuner');
      throw error;
    }
  }

  /**
   * Apply optimized policies to the policy gate system
   */
  async applyPolicyUpdates(policies: Record<string, PolicyDecision>): Promise<void> {
    try {
      logger.info('Applying policy updates', {
        intentCount: Object.keys(policies).length
      }, 'policy-tuner');

      // Convert to repository policy format
      const repositoryPolicies: Record<string, any> = {};
      
      for (const [intent, policy] of Object.entries(policies)) {
        if (!repositoryPolicies['*']) {
          repositoryPolicies['*'] = {};
        }
        repositoryPolicies['*'][intent] = { ...policy };
      }

      // Apply through policy gate
      policyGate.updateRepositoryPolicies(repositoryPolicies);
      
      logger.info('Policy updates applied successfully', {}, 'policy-tuner');
    } catch (error) {
      logger.error('Failed to apply policy updates', {
        error: error instanceof Error ? error.message : String(error)
      }, 'policy-tuner');
      throw error;
    }
  }

  /**
   * Rollback policies to previous state
   */
  async rollbackPolicies(rollbackData: Record<string, PolicyDecision>): Promise<void> {
    try {
      logger.info('Rolling back policies', {
        intentCount: Object.keys(rollbackData).length
      }, 'policy-tuner');

      await this.applyPolicyUpdates(rollbackData);
      
      logger.info('Policy rollback completed', {}, 'policy-tuner');
    } catch (error) {
      logger.error('Failed to rollback policies', {
        error: error instanceof Error ? error.message : String(error)
      }, 'policy-tuner');
      throw error;
    }
  }

  /**
   * Validate policy constraints
   */
  validatePolicy(policy: Partial<PolicyDecision>): string[] {
    const errors: string[] = [];

    if (policy.maxDepth !== undefined && (policy.maxDepth < 1 || policy.maxDepth > 10)) {
      errors.push('maxDepth must be between 1 and 10');
    }

    if (policy.earlyStopThreshold !== undefined && (policy.earlyStopThreshold < 1 || policy.earlyStopThreshold > 50)) {
      errors.push('earlyStopThreshold must be between 1 and 50');
    }

    if (policy.seedWeights) {
      for (const [key, weight] of Object.entries(policy.seedWeights)) {
        if (typeof weight !== 'number' || weight < 0.1 || weight > 5.0) {
          errors.push(`seedWeight for '${key}' must be a number between 0.1 and 5.0`);
        }
      }
    }

    return errors;
  }

  /**
   * Group signals by intent for targeted optimization
   */
  private groupSignalsByIntent(signals: OutcomeSignal[]): Record<string, OutcomeSignal[]> {
    const grouped: Record<string, OutcomeSignal[]> = {};
    
    for (const signal of signals) {
      if (!signal.intent) continue;
      
      if (!grouped[signal.intent]) {
        grouped[signal.intent] = [];
      }
      grouped[signal.intent].push(signal);
    }
    
    return grouped;
  }

  /**
   * Calculate parameter adjustments based on signals
   */
  private calculateParameterAdjustments(
    signals: OutcomeSignal[],
    policies: Record<string, PolicyDecision>,
    validIntents: string[],
    options: Required<TuningOptions>
  ): Record<string, Partial<PolicyDecision>> {
    const adjustments: Record<string, Partial<PolicyDecision>> = {};

    for (const intent of validIntents) {
      const intentSignals = signals.filter(s => s.intent === intent);
      const policy = policies[intent];
      if (!policy) continue;

      adjustments[intent] = {};

      // Calculate early-stop threshold adjustment
      const earlyStopAdjustment = this.calculateEarlyStopAdjustment(intentSignals, policy);
      if (earlyStopAdjustment !== 0) {
        adjustments[intent].earlyStopThreshold = earlyStopAdjustment;
      }

      // Calculate max depth adjustment
      const maxDepthAdjustment = this.calculateMaxDepthAdjustment(intentSignals, policy);
      if (maxDepthAdjustment !== 0) {
        adjustments[intent].maxDepth = maxDepthAdjustment;
      }

      // Calculate seed weight adjustments
      const seedWeightAdjustments = this.calculateSeedWeightAdjustments(intentSignals, policy);
      if (Object.keys(seedWeightAdjustments).length > 0) {
        adjustments[intent].seedWeights = seedWeightAdjustments;
      }

      // Calculate include flag adjustments
      const includeAdjustments = this.calculateIncludeAdjustments(intentSignals, policy);
      if (Object.keys(includeAdjustments).length > 0) {
        Object.assign(adjustments[intent]!, includeAdjustments);
      }
    }

    return adjustments;
  }

  /**
   * Calculate early-stop threshold adjustment
   */
  private calculateEarlyStopAdjustment(signals: OutcomeSignal[], policy: PolicyDecision): number {
    const satisfiedSignals = signals.filter(s => s.satisfied);
    const unsatisfiedSignals = signals.filter(s => !s.satisfied);

    if (satisfiedSignals.length === 0 && unsatisfiedSignals.length === 0) {
      return 0;
    }

    // If many unsatisfied signals have low thresholds, increase threshold
    const unsatisfiedWithLowThreshold = unsatisfiedSignals.filter(
      s => (s.policyThresholds.earlyStop || 0) < policy.earlyStopThreshold
    );

    // If many satisfied signals have high thresholds, we might be able to decrease
    const satisfiedWithHighThreshold = satisfiedSignals.filter(
      s => (s.policyThresholds.earlyStop || 0) > policy.earlyStopThreshold
    );

    let adjustment = 0;

    if (unsatisfiedWithLowThreshold.length > unsatisfiedSignals.length * 0.6) {
      adjustment = 1; // Increase threshold
    } else if (satisfiedWithHighThreshold.length > satisfiedSignals.length * 0.7) {
      adjustment = -1; // Decrease threshold
    }

    return adjustment;
  }

  /**
   * Calculate max depth adjustment
   */
  private calculateMaxDepthAdjustment(signals: OutcomeSignal[], policy: PolicyDecision): number {
    const signalsWithLongTimeToFix = signals.filter(
      s => s.timeToFix && s.timeToFix > 10000 // > 10 seconds
    );

    if (signalsWithLongTimeToFix.length > signals.length * 0.5) {
      return 1; // Increase depth for complex queries
    }

    const signalsWithShortTimeToFix = signals.filter(
      s => s.timeToFix && s.timeToFix < 3000 // < 3 seconds
    );

    if (signalsWithShortTimeToFix.length > signals.length * 0.7) {
      return -1; // Decrease depth for simple queries
    }

    return 0;
  }

  /**
   * Calculate seed weight adjustments
   */
  private calculateSeedWeightAdjustments(
    signals: OutcomeSignal[], 
    policy: PolicyDecision
  ): Record<string, number> {
    const adjustments: Record<string, number> = {};
    const seedTypes = new Set<string>();

    // Collect all seed types from signals
    for (const signal of signals) {
      Object.keys(signal.seedWeights).forEach(type => seedTypes.add(type));
    }

    for (const seedType of seedTypes) {
      const satisfiedSignals = signals.filter(s => s.satisfied && s.seedWeights[seedType]);
      const unsatisfiedSignals = signals.filter(s => !s.satisfied && s.seedWeights[seedType]);

      if (satisfiedSignals.length === 0 && unsatisfiedSignals.length === 0) {
        continue;
      }

      // Calculate correlation between seed weight and satisfaction
      const satisfiedAvgWeight = satisfiedSignals.length > 0 
        ? satisfiedSignals.reduce((sum, s) => sum + s.seedWeights[seedType], 0) / satisfiedSignals.length
        : 0;

      const unsatisfiedAvgWeight = unsatisfiedSignals.length > 0
        ? unsatisfiedSignals.reduce((sum, s) => sum + s.seedWeights[seedType], 0) / unsatisfiedSignals.length
        : 0;

      // If satisfied signals have higher weights, increase this weight
      if (satisfiedAvgWeight > unsatisfiedAvgWeight) {
        adjustments[seedType] = 0.1; // Small increase
      } else if (unsatisfiedAvgWeight > satisfiedAvgWeight) {
        adjustments[seedType] = -0.1; // Small decrease
      }
    }

    return adjustments;
  }

  /**
   * Calculate include flag adjustments
   */
  private calculateIncludeAdjustments(
    signals: OutcomeSignal[], 
    policy: PolicyDecision
  ): Partial<PolicyDecision> {
    const adjustments: Partial<PolicyDecision> = {};

    // Analyze content inclusion
    const signalsWithContent = signals.filter(s => s.policyThresholds.includeContent === 1);
    if (signalsWithContent.length > 0) {
      const satisfactionRate = signalsWithContent.filter(s => s.satisfied).length / signalsWithContent.length;
      if (satisfactionRate < 0.3 && policy.includeContent) {
        adjustments.includeContent = false;
      } else if (satisfactionRate > 0.8 && !policy.includeContent) {
        adjustments.includeContent = true;
      }
    }

    // Similar logic for other include flags
    const signalsWithSymbols = signals.filter(s => s.policyThresholds.includeSymbols === 1);
    if (signalsWithSymbols.length > 0) {
      const satisfactionRate = signalsWithSymbols.filter(s => s.satisfied).length / signalsWithSymbols.length;
      if (satisfactionRate < 0.3 && policy.includeSymbols) {
        adjustments.includeSymbols = false;
      } else if (satisfactionRate > 0.8 && !policy.includeSymbols) {
        adjustments.includeSymbols = true;
      }
    }

    return adjustments;
  }

  /**
   * Apply parameter updates with constraints
   */
  private applyParameterUpdates(
    policies: Record<string, PolicyDecision>,
    adjustments: Record<string, Partial<PolicyDecision>>,
    options: Required<TuningOptions>
  ): Record<string, PolicyDecision> {
    const newPolicies: Record<string, PolicyDecision> = {};

    for (const [intent, policy] of Object.entries(policies)) {
      const adjustment = adjustments[intent] || {};
      const newPolicy = { ...policy };

      // Apply early-stop threshold adjustment
      if (adjustment.earlyStopThreshold !== undefined) {
        newPolicy.earlyStopThreshold = Math.max(
          options.parameterBounds.earlyStopThreshold.min,
          Math.min(
            options.parameterBounds.earlyStopThreshold.max,
            newPolicy.earlyStopThreshold + adjustment.earlyStopThreshold
          )
        );
      }

      // Apply max depth adjustment
      if (adjustment.maxDepth !== undefined) {
        newPolicy.maxDepth = Math.max(
          options.parameterBounds.maxDepth.min,
          Math.min(
            options.parameterBounds.maxDepth.max,
            newPolicy.maxDepth + adjustment.maxDepth
          )
        );
      }

      // Apply include flag adjustments
      if (adjustment.includeSymbols !== undefined) {
        newPolicy.includeSymbols = adjustment.includeSymbols;
      }
      if (adjustment.includeFiles !== undefined) {
        newPolicy.includeFiles = adjustment.includeFiles;
      }
      if (adjustment.includeContent !== undefined) {
        newPolicy.includeContent = adjustment.includeContent;
      }

      // Apply seed weight adjustments
      if (adjustment.seedWeights) {
        newPolicy.seedWeights = { ...newPolicy.seedWeights };
        for (const [seedType, weightAdjustment] of Object.entries(adjustment.seedWeights)) {
          const currentWeight = newPolicy.seedWeights[seedType] || 1.0;
          const newWeight = currentWeight + weightAdjustment;
          newPolicy.seedWeights[seedType] = Math.max(
            options.parameterBounds.seedWeight.min,
            Math.min(options.parameterBounds.seedWeight.max, newWeight)
          );
        }
      }

      // Apply language-specific adjustments
      if (options.language) {
        newPolicy.seedWeights = this.adjustWeightsForLanguage(
          newPolicy.seedWeights, 
          options.language
        );
      }

      newPolicies[intent] = newPolicy;
    }

    return newPolicies;
  }

  /**
   * Adjust seed weights based on programming language
   */
  private adjustWeightsForLanguage(
    weights: Record<string, number>,
    language: string
  ): Record<string, number> {
    const adjusted = { ...weights };

    switch (language.toLowerCase()) {
      case 'python':
        adjusted['definition'] = (adjusted['definition'] || 1.0) * 1.2;
        adjusted['implementation'] = (adjusted['implementation'] || 1.0) * 1.1;
        break;
      case 'typescript':
      case 'javascript':
        adjusted['handler'] = (adjusted['handler'] || 1.0) * 1.3;
        adjusted['middleware'] = (adjusted['middleware'] || 1.0) * 1.2;
        break;
      case 'java':
        adjusted['class'] = (adjusted['class'] || 1.0) * 1.4;
        break;
      case 'go':
        adjusted['package'] = (adjusted['package'] || 1.0) * 1.3;
        break;
    }

    return adjusted;
  }

  /**
   * Calculate loss function (negative satisfaction rate)
   */
  private calculateLoss(
    signals: OutcomeSignal[],
    policies: Record<string, PolicyDecision>,
    validIntents: string[]
  ): number {
    const satisfaction = this.calculateOverallSatisfaction(signals);
    return -satisfaction; // Negative for minimization
  }

  /**
   * Calculate overall satisfaction rate
   */
  private calculateOverallSatisfaction(signals: OutcomeSignal[]): number {
    if (signals.length === 0) return 0;
    
    const satisfiedCount = signals.filter(s => s.satisfied).length;
    return satisfiedCount / signals.length;
  }

  /**
   * Compare parameters and track changes
   */
  private compareParameters(
    original: PolicyDecision,
    optimized: PolicyDecision,
    intent: string,
    changes: Record<string, ParameterChange>
  ): void {
    // Compare max depth
    if (original.maxDepth !== optimized.maxDepth) {
      changes[`${intent}.maxDepth`] = {
        parameter: 'maxDepth',
        oldValue: original.maxDepth,
        newValue: optimized.maxDepth,
        impact: Math.abs(optimized.maxDepth - original.maxDepth) * 0.1,
        confidence: 0.7
      };
    }

    // Compare early stop threshold
    if (original.earlyStopThreshold !== optimized.earlyStopThreshold) {
      changes[`${intent}.earlyStopThreshold`] = {
        parameter: 'earlyStopThreshold',
        oldValue: original.earlyStopThreshold,
        newValue: optimized.earlyStopThreshold,
        impact: Math.abs(optimized.earlyStopThreshold - original.earlyStopThreshold) * 0.05,
        confidence: 0.8
      };
    }

    // Compare seed weights
    for (const seedType of Object.keys(original.seedWeights)) {
      const originalWeight = original.seedWeights[seedType];
      const optimizedWeight = optimized.seedWeights[seedType] || 0;
      
      if (Math.abs(originalWeight - optimizedWeight) > 0.01) {
        changes[`${intent}.seedWeights.${seedType}`] = {
          parameter: `seedWeights.${seedType}`,
          oldValue: originalWeight,
          newValue: optimizedWeight,
          impact: Math.abs(optimizedWeight - originalWeight) * 0.2,
          confidence: 0.6
        };
      }
    }

    // Compare include flags
    ['includeSymbols', 'includeFiles', 'includeContent'].forEach(flag => {
      const originalValue = (original as any)[flag];
      const optimizedValue = (optimized as any)[flag];
      if (originalValue !== optimizedValue) {
        changes[`${intent}.${flag}`] = {
          parameter: flag,
          oldValue: originalValue,
          newValue: optimizedValue,
          impact: 0.3,
          confidence: 0.9
        };
      }
    });
  }
}