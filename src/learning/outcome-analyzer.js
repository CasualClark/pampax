import { logger } from '../config/logger.js';

/**
 * Simple Outcome Analyzer for CLI learning
 * 
 * This is a minimal JavaScript implementation that analyzes interaction
 * outcomes to generate learning signals for weight optimization.
 */
export class OutcomeAnalyzer {
  constructor(memoryOperations) {
    this.memoryOps = memoryOperations;
  }

  /**
   * Analyze interactions from the specified time period
   */
  async analyzeInteractions(fromDays = 30) {
    try {
      const cutoffDate = new Date(Date.now() - (fromDays * 24 * 60 * 60 * 1000));
      
      // Get recent interactions from memory operations
      const interactions = await this.memoryOps.getRecentInteractions(fromDays);
      
      // Convert to learning signals
      const signals = interactions.map(interaction => this.extractLearningSignal(interaction))
        .filter(signal => signal !== null);
      
      logger.info('Analyzed interactions for learning', {
        totalInteractions: interactions.length,
        validSignals: signals.length,
        fromDays
      }, 'outcome-analyzer');
      
      return signals;
    } catch (error) {
      logger.error('Failed to analyze interactions', {
        fromDays,
        error: error.message
      }, 'outcome-analyzer');
      return [];
    }
  }

  /**
   * Extract learning signal from interaction
   */
  extractLearningSignal(interaction) {
    try {
      // Skip interactions without essential data
      if (!interaction.query || !interaction.intent) {
        return null;
      }

      // Determine satisfaction based on interaction metrics
      const satisfied = this.determineSatisfaction(interaction);
      
      // Generate bundle signature
      const bundleSignature = this.generateBundleSignature(interaction);
      
      return {
        id: interaction.id || `signal_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        timestamp: interaction.timestamp || Date.now(),
        query: interaction.query,
        intent: interaction.intent,
        bundleSignature,
        satisfied,
        timeToFix: interaction.timeToFix || null,
        tokenUsage: interaction.tokenUsage || null,
        seedWeights: interaction.seedWeights || {},
        responseTime: interaction.responseTime || null,
        resultCount: interaction.resultCount || 0,
        userFeedback: interaction.userFeedback || null
      };
    } catch (error) {
      logger.warn('Failed to extract learning signal from interaction', {
        interactionId: interaction.id,
        error: error.message
      }, 'outcome-analyzer');
      return null;
    }
  }

  /**
   * Determine satisfaction based on interaction metrics
   */
  determineSatisfaction(interaction) {
    // Simple satisfaction logic - can be enhanced
    const hasUserFeedback = interaction.userFeedback !== undefined;
    const hasQuickResponse = interaction.responseTime && interaction.responseTime < 5000; // 5 seconds
    const hasResults = interaction.resultCount && interaction.resultCount > 0;
    const hasTokens = interaction.tokenUsage && interaction.tokenUsage > 0;
    
    if (hasUserFeedback) {
      return interaction.userFeedback > 0; // Positive feedback
    }
    
    // Heuristic satisfaction based on metrics
    const positiveSignals = [hasQuickResponse, hasResults, hasTokens].filter(Boolean).length;
    return positiveSignals >= 2; // At least 2 positive signals
  }

  /**
   * Generate bundle signature from interaction
   */
  generateBundleSignature(interaction) {
    // Simple signature based on query characteristics
    const query = interaction.query.toLowerCase();
    const intent = interaction.intent;
    
    // Generate simple hash-like signature
    const queryLength = query.length;
    const wordCount = query.split(/\s+/).length;
    const hasCode = /[{}();]/.test(query);
    
    return `${intent}_${queryLength}_${wordCount}_${hasCode ? 'code' : 'text'}`;
  }

  /**
   * Compute satisfaction metrics from signals
   */
  async computeSatisfactionMetrics(signals) {
    if (signals.length === 0) {
      return {
        totalInteractions: 0,
        satisfiedInteractions: 0,
        unsatisfiedInteractions: 0,
        overallSatisfactionRate: 0,
        averageTimeToFix: 0,
        averageTokenUsage: 0,
        byIntent: {},
        byBundleSignature: {}
      };
    }

    const totalInteractions = signals.length;
    const satisfiedSignals = signals.filter(s => s.satisfied);
    const satisfiedInteractions = satisfiedSignals.length;
    const unsatisfiedInteractions = totalInteractions - satisfiedInteractions;
    const overallSatisfactionRate = satisfiedInteractions / totalInteractions;

    // Calculate averages
    const timeToFixes = signals.map(s => s.timeToFix).filter(t => t !== null && t > 0);
    const tokenUsages = signals.map(s => s.tokenUsage).filter(t => t !== null && t > 0);
    
    const averageTimeToFix = timeToFixes.length > 0 
      ? timeToFixes.reduce((a, b) => a + b, 0) / timeToFixes.length 
      : 0;
    
    const averageTokenUsage = tokenUsages.length > 0
      ? tokenUsages.reduce((a, b) => a + b, 0) / tokenUsages.length
      : 0;

    // Group by intent
    const byIntent = {};
    for (const signal of signals) {
      const intent = signal.intent;
      if (!byIntent[intent]) {
        byIntent[intent] = {
          total: 0,
          satisfied: 0,
          satisfactionRate: 0,
          averageTimeToFix: 0,
          averageTokenUsage: 0
        };
      }
      
      byIntent[intent].total++;
      if (signal.satisfied) {
        byIntent[intent].satisfied++;
      }
    }

    // Calculate intent-specific metrics
    for (const [intent, metrics] of Object.entries(byIntent)) {
      metrics.satisfactionRate = metrics.satisfied / metrics.total;
      
      const intentSignals = signals.filter(s => s.intent === intent);
      const intentTimeToFixes = intentSignals.map(s => s.timeToFix).filter(t => t !== null && t > 0);
      const intentTokenUsages = intentSignals.map(s => s.tokenUsage).filter(t => t !== null && t > 0);
      
      metrics.averageTimeToFix = intentTimeToFixes.length > 0
        ? intentTimeToFixes.reduce((a, b) => a + b, 0) / intentTimeToFixes.length
        : 0;
      
      metrics.averageTokenUsage = intentTokenUsages.length > 0
        ? intentTokenUsages.reduce((a, b) => a + b, 0) / intentTokenUsages.length
        : 0;
    }

    // Group by bundle signature
    const byBundleSignature = {};
    for (const signal of signals) {
      const signature = signal.bundleSignature;
      if (!byBundleSignature[signature]) {
        byBundleSignature[signature] = {
          total: 0,
          satisfied: 0,
          satisfactionRate: 0,
          averageTimeToFix: 0,
          averageTokenUsage: 0
        };
      }
      
      byBundleSignature[signature].total++;
      if (signal.satisfied) {
        byBundleSignature[signature].satisfied++;
      }
    }

    // Calculate signature-specific metrics
    for (const [signature, metrics] of Object.entries(byBundleSignature)) {
      metrics.satisfactionRate = metrics.satisfied / metrics.total;
      
      const signatureSignals = signals.filter(s => s.bundleSignature === signature);
      const signatureTimeToFixes = signatureSignals.map(s => s.timeToFix).filter(t => t !== null && t > 0);
      const signatureTokenUsages = signatureSignals.map(s => s.tokenUsage).filter(t => t !== null && t > 0);
      
      metrics.averageTimeToFix = signatureTimeToFixes.length > 0
        ? signatureTimeToFixes.reduce((a, b) => a + b, 0) / signatureTimeToFixes.length
        : 0;
      
      metrics.averageTokenUsage = signatureTokenUsages.length > 0
        ? signatureTokenUsages.reduce((a, b) => a + b, 0) / signatureTokenUsages.length
        : 0;
    }

    return {
      totalInteractions,
      satisfiedInteractions,
      unsatisfiedInteractions,
      overallSatisfactionRate,
      averageTimeToFix,
      averageTokenUsage,
      byIntent,
      byBundleSignature
    };
  }
}