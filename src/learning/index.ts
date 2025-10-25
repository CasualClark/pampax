/**
 * Learning module for outcome-driven retrieval tuning
 * 
 * This module provides tools for analyzing interaction outcomes,
 * extracting learning signals, and optimizing retrieval policies
 * based on user satisfaction and performance metrics.
 */

export { OutcomeAnalyzer } from './outcome-analyzer.js';
export { WeightOptimizer } from './weight-optimizer.js';
export { PolicyTuner } from './policy-tuner.js';
export { SignatureCache } from './signature-cache.js';
export { CacheIntegration } from './cache-integration.js';
export { LearningIntegration, getLearningIntegration, resetLearningIntegration } from './integration.js';
export { LearningWorkflow, getLearningWorkflow, resetLearningWorkflow } from './learning-workflow.js';
export type { 
  OutcomeSignal, 
  BundleStructure, 
  SatisfactionMetrics 
} from './outcome-analyzer.js';
export type { 
  OptimizationOptions, 
  WeightOptimizationResult 
} from './weight-optimizer.js';
export type { 
  PolicyTuningResult, 
  ParameterChange, 
  TuningOptions 
} from './policy-tuner.js';
export type {
  LearningIntegrationConfig,
  LearningState,
  IntegrationResult
} from './integration.js';
export type {
  WorkflowStep,
  LearningWorkflowConfig,
  WorkflowContext,
  WorkflowResult
} from './learning-workflow.js';

// Re-export analytics for comprehensive performance tracking
export { PerformanceTracker } from '../analytics/performance-tracker.js';
export type {
  TimePeriod,
  TimeSeriesPoint,
  TimeSeriesData,
  CostAnalysis,
  IntentMetrics,
  LanguageMetrics,
  RepoMetrics,
  PerformanceMetrics,
  ComparisonReport,
  TrendAnalysis,
  PerformanceTrackerConfig
} from '../analytics/performance-tracker.js';