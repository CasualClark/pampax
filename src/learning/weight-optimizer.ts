import { logger } from '../config/logger.js';
import { policyGate } from '../policy/policy-gate.js';
import type { OutcomeSignal } from './outcome-analyzer.js';

/**
 * Optimization options for weight tuning
 */
export interface OptimizationOptions {
  learningRate?: number;
  maxIterations?: number;
  convergenceThreshold?: number;
  minSignalsPerIntent?: number;
  weightBounds?: {
    min: number;
    max: number;
  };
}

/**
 * Result of weight optimization process
 */
export interface WeightOptimizationResult {
  optimizedWeights: Record<string, Record<string, number>>;
  improvement: number;
  convergence: boolean;
  iterations: number;
  rollbackData: Record<string, Record<string, number>>;
}

/**
 * Weight Optimizer - Optimizes seed mix weights based on outcome signals
 * 
 * This class implements gradient descent optimization to adjust seed weights
 * based on satisfaction signals from the OutcomeAnalyzer, improving retrieval
 * performance over time.
 */
export class WeightOptimizer {
  private readonly defaultOptions: Required<OptimizationOptions> = {
    learningRate: 0.1,
    maxIterations: 100,
    convergenceThreshold: 0.001,
    minSignalsPerIntent: 5,
    weightBounds: {
      min: 0.1,
      max: 5.0
    }
  };

  /**
   * Optimize weights based on outcome signals using gradient descent
   */
  async optimizeWeights(
    signals: OutcomeSignal[],
    currentWeights: Record<string, Record<string, number>>,
    options: OptimizationOptions = {}
  ): Promise<WeightOptimizationResult> {
    const startTime = Date.now();
    const opts = { ...this.defaultOptions, ...options };

    logger.info('Starting weight optimization', {
      signalCount: signals.length,
      intentCount: Object.keys(currentWeights).length,
      learningRate: opts.learningRate,
      maxIterations: opts.maxIterations
    }, 'weight-optimizer');

    try {
      // Validate inputs
      if (!signals || signals.length === 0) {
        logger.warn('No signals provided for optimization', {}, 'weight-optimizer');
        return {
          optimizedWeights: { ...currentWeights },
          improvement: 0,
          convergence: true,
          iterations: 0,
          rollbackData: { ...currentWeights }
        };
      }

      if (!currentWeights || Object.keys(currentWeights).length === 0) {
        logger.warn('No current weights provided for optimization', {}, 'weight-optimizer');
        return {
          optimizedWeights: {},
          improvement: 0,
          convergence: true,
          iterations: 0,
          rollbackData: {}
        };
      }

      // Group signals by intent for targeted optimization
      const signalsByIntent = this.groupSignalsByIntent(signals);
      
      // Filter intents with sufficient data
      const validIntents = Object.entries(signalsByIntent)
        .filter(([_, intentSignals]) => intentSignals.length >= opts.minSignalsPerIntent)
        .map(([intent, _]) => intent);

      if (validIntents.length === 0) {
        logger.warn('No intents with sufficient data for optimization', {
          minSignals: opts.minSignalsPerIntent,
          intentSignalCounts: Object.entries(signalsByIntent).map(([i, s]) => [i, s.length])
        }, 'weight-optimizer');
        return {
          optimizedWeights: { ...currentWeights },
          improvement: 0,
          convergence: true,
          iterations: 0,
          rollbackData: { ...currentWeights }
        };
      }

      // Calculate baseline satisfaction rate
      const baselineSatisfaction = this.calculateOverallSatisfaction(signals);
      logger.debug('Baseline satisfaction rate', { rate: baselineSatisfaction }, 'weight-optimizer');

      // Initialize optimization variables
      let optimizedWeights = JSON.parse(JSON.stringify(currentWeights));
      let previousLoss = Infinity;
      let converged = false;
      let iterations = 0;

      // Gradient descent optimization loop
      for (iterations = 0; iterations < opts.maxIterations; iterations++) {
        // Calculate gradients for each intent
        const gradients = this.calculateGradients(signals, optimizedWeights, validIntents);
        
        // Apply weight updates
        const newWeights = this.applyWeightUpdatesInternal(optimizedWeights, gradients, opts);
        
        // Calculate new loss (negative satisfaction rate for minimization)
        const currentLoss = this.calculateLoss(signals, newWeights, validIntents);
        
        // Check convergence
        const lossImprovement = Math.abs(previousLoss - currentLoss);
        if (lossImprovement < opts.convergenceThreshold) {
          converged = true;
          logger.debug('Optimization converged', {
            iterations,
            finalLoss: currentLoss,
            improvement: lossImprovement
          }, 'weight-optimizer');
          break;
        }
        
        // Update for next iteration
        optimizedWeights = newWeights;
        previousLoss = currentLoss;
        
        logger.debug('Optimization iteration', {
          iteration: iterations,
          loss: currentLoss,
          improvement: lossImprovement
        }, 'weight-optimizer');
      }

      // Calculate final improvement
      const finalSatisfaction = this.calculateOverallSatisfaction(signals);
      const improvement = Math.max(0, finalSatisfaction - baselineSatisfaction);

      const processingTime = Date.now() - startTime;
      logger.info('Weight optimization completed', {
        iterations,
        converged,
        improvement,
        baselineSatisfaction,
        finalSatisfaction,
        processingTimeMs: processingTime
      }, 'weight-optimizer');

      return {
        optimizedWeights,
        improvement,
        convergence: converged,
        iterations,
        rollbackData: { ...currentWeights }
      };

    } catch (error) {
      logger.error('Weight optimization failed', {
        signalCount: signals.length,
        error: error instanceof Error ? error.message : String(error)
      }, 'weight-optimizer');
      throw error;
    }
  }

  /**
   * Apply optimized weights to the policy gate system
   */
  async applyWeightUpdates(weights: Record<string, Record<string, number>>): Promise<void> {
    try {
      logger.info('Applying weight updates', {
        intentCount: Object.keys(weights).length
      }, 'weight-optimizer');

      // Convert to repository policy format
      const repositoryPolicies: Record<string, any> = {};
      
      for (const [intent, seedWeights] of Object.entries(weights)) {
        if (!repositoryPolicies['*']) {
          repositoryPolicies['*'] = {};
        }
        repositoryPolicies['*'][intent] = {
          seedWeights: { ...seedWeights }
        };
      }

      // Apply through policy gate
      policyGate.updateRepositoryPolicies(repositoryPolicies);
      
      logger.info('Weight updates applied successfully', {}, 'weight-optimizer');
    } catch (error) {
      logger.error('Failed to apply weight updates', {
        error: error instanceof Error ? error.message : String(error)
      }, 'weight-optimizer');
      throw error;
    }
  }

  /**
   * Rollback weights to previous state
   */
  async rollbackWeights(rollbackData: Record<string, Record<string, number>>): Promise<void> {
    try {
      logger.info('Rolling back weights', {
        intentCount: Object.keys(rollbackData).length
      }, 'weight-optimizer');

      await this.applyWeightUpdates(rollbackData);
      
      logger.info('Weight rollback completed', {}, 'weight-optimizer');
    } catch (error) {
      logger.error('Failed to rollback weights', {
        error: error instanceof Error ? error.message : String(error)
      }, 'weight-optimizer');
      throw error;
    }
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
   * Calculate gradients for weight optimization
   */
  private calculateGradients(
    signals: OutcomeSignal[],
    weights: Record<string, Record<string, number>>,
    validIntents: string[]
  ): Record<string, Record<string, number>> {
    const gradients: Record<string, Record<string, number>> = {};

    for (const intent of validIntents) {
      const intentSignals = signals.filter(s => s.intent === intent);
      const intentWeights = weights[intent] || {};
      
      gradients[intent] = {};
      
      for (const [seedType, currentWeight] of Object.entries(intentWeights)) {
        // Calculate gradient based on satisfaction correlation
        let gradient = 0;
        
        for (const signal of intentSignals) {
          const signalWeight = signal.seedWeights[seedType] || 0;
          const satisfaction = signal.satisfied ? 1 : 0;
          
          // Gradient: positive if high weight correlates with satisfaction
          // negative if high weight correlates with dissatisfaction
          const weightContribution = signalWeight * currentWeight;
          const error = satisfaction - this.predictSatisfaction(weightContribution);
          gradient += error * signalWeight;
        }
        
        // Normalize gradient
        gradient = gradient / intentSignals.length;
        gradients[intent][seedType] = gradient;
      }
    }

    return gradients;
  }

  /**
   * Apply weight updates with constraints (internal method)
   */
  private applyWeightUpdatesInternal(
    weights: Record<string, Record<string, number>>,
    gradients: Record<string, Record<string, number>>,
    options: Required<OptimizationOptions>
  ): Record<string, Record<string, number>> {
    const newWeights: Record<string, Record<string, number>> = {};

    for (const [intent, intentWeights] of Object.entries(weights)) {
      newWeights[intent] = {};
      const intentGradients = gradients[intent] || {};
      
      for (const [seedType, currentWeight] of Object.entries(intentWeights)) {
        const gradient = intentGradients[seedType] || 0;
        
        // Apply gradient descent update
        let newWeight = currentWeight - (options.learningRate * gradient);
        
        // Apply weight constraints
        newWeight = Math.max(options.weightBounds.min, 
                     Math.min(options.weightBounds.max, newWeight));
        
        newWeights[intent][seedType] = newWeight;
      }
    }

    return newWeights;
  }

  /**
   * Calculate loss function (negative satisfaction rate)
   */
  private calculateLoss(
    signals: OutcomeSignal[],
    weights: Record<string, Record<string, number>>,
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
   * Predict satisfaction based on weight contribution
   */
  private predictSatisfaction(weightContribution: number): number {
    // Simple sigmoid function to map weight contribution to satisfaction probability
    return 1 / (1 + Math.exp(-weightContribution / 2));
  }
}