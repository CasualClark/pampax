import { logger } from '../config/logger.js';

/**
 * Time period for analytics queries
 */
export class TimePeriod {
  constructor(start, end) {
    this.start = start;
    this.end = end;
  }
}

/**
 * Time series data point
 */
export class TimeSeriesPoint {
  constructor(timestamp, value, metadata = {}) {
    this.timestamp = timestamp;
    this.value = value;
    this.metadata = metadata;
  }
}

/**
 * Time series data collection
 */
export class TimeSeriesData {
  constructor(label, points = [], unit = '') {
    this.label = label;
    this.points = points;
    this.unit = unit;
  }
}

/**
 * Cost analysis metrics
 */
export class CostAnalysis {
  constructor(
    totalTokens,
    totalCost,
    averageCostPerInteraction,
    costByIntent = {},
    costByLanguage = {},
    costEfficiency = 0,
    costTrend = null
  ) {
    this.totalTokens = totalTokens;
    this.totalCost = totalCost;
    this.averageCostPerInteraction = averageCostPerInteraction;
    this.costByIntent = costByIntent;
    this.costByLanguage = costByLanguage;
    this.costEfficiency = costEfficiency;
    this.costTrend = costTrend;
  }
}

/**
 * Performance Tracker - Comprehensive analytics for outcome-driven retrieval
 * 
 * This class provides detailed performance tracking, trend analysis, and comparison
 * capabilities for the Phase 6 Outcome-Driven Retrieval Tuning system.
 */
export class PerformanceTracker {
  constructor(config = {}) {
    this.config = {
      tokenCostPerMillion: config.tokenCostPerMillion ?? 0.002,
      significanceThreshold: config.significanceThreshold ?? 0.05,
      forecastHorizon: config.forecastHorizon ?? 30,
      minSampleSize: config.minSampleSize ?? 100,
      enableCache: config.enableCache ?? true,
    };

    this.cache = new Map();

    logger.debug('PerformanceTracker initialized', { config: this.config }, 'performance-tracker');
  }

  /**
   * Track comprehensive performance metrics for a given set of signals and time period
   */
  async trackMetrics(signals, period) {
    const startTime = Date.now();
    const cacheKey = `metrics_${period.start.getTime()}_${period.end.getTime()}_${signals.length}`;

    try {
      logger.info('Starting performance metrics tracking', {
        signalCount: signals.length,
        period: { start: period.start, end: period.end }
      }, 'performance-tracker');

      // Check cache first
      if (this.config.enableCache && this.cache.has(cacheKey)) {
        logger.debug('Returning cached metrics', { cacheKey }, 'performance-tracker');
        return this.cache.get(cacheKey);
      }

      // Filter signals by time period
      const filteredSignals = this.filterSignalsByPeriod(signals, period);
      
      if (filteredSignals.length < this.config.minSampleSize) {
        logger.warn('Insufficient sample size for reliable metrics', {
          sampleSize: filteredSignals.length,
          minRequired: this.config.minSampleSize
        }, 'performance-tracker');
      }

      // Compute all metrics
      const [
        winRates,
        satisfactionTrends,
        tokenCostAnalysis,
        intentPerformance,
        languagePerformance,
        repositoryPerformance
      ] = await Promise.all([
        this.computeWinRates(filteredSignals),
        this.computeSatisfactionTrends(filteredSignals, period),
        this.computeTokenCostAnalysis(filteredSignals),
        this.computeIntentPerformance(filteredSignals, period),
        this.computeLanguagePerformance(filteredSignals, period),
        this.computeRepositoryPerformance(filteredSignals, period)
      ]);

      const overallSatisfactionRate = this.calculateOverallSatisfactionRate(filteredSignals);
      const overallCostEfficiency = this.calculateOverallCostEfficiency(filteredSignals, tokenCostAnalysis);

      const metrics = {
        winRates,
        satisfactionTrends,
        tokenCostAnalysis,
        intentPerformance,
        languagePerformance,
        repositoryPerformance,
        period,
        totalInteractions: filteredSignals.length,
        overallSatisfactionRate,
        overallCostEfficiency
      };

      // Cache results
      if (this.config.enableCache) {
        this.cache.set(cacheKey, metrics);
      }

      const processingTime = Date.now() - startTime;
      logger.info('Performance metrics tracking completed', {
        signalCount: filteredSignals.length,
        processingTimeMs: processingTime,
        overallSatisfactionRate,
        overallCostEfficiency
      }, 'performance-tracker');

      return metrics;
    } catch (error) {
      logger.error('Failed to track performance metrics', {
        period,
        signalCount: signals.length,
        error: error instanceof Error ? error.message : String(error)
      }, 'performance-tracker');
      throw error;
    }
  }

  /**
   * Generate a comprehensive comparison report between two sets of metrics
   */
  async generateComparisonReport(before, after) {
    try {
      logger.info('Generating comparison report', {
        beforePeriod: before.period,
        afterPeriod: after.period
      }, 'performance-tracker');

      const improvements = {};
      const regressions = {};
      const significantChanges = [];

      // Compare overall metrics
      const overallSatisfactionChange = after.overallSatisfactionRate - before.overallSatisfactionRate;
      const overallCostEfficiencyChange = after.overallCostEfficiency - before.overallCostEfficiency;

      if (overallSatisfactionChange > 0) {
        improvements.overallSatisfactionRate = overallSatisfactionChange;
      } else if (overallSatisfactionChange < 0) {
        regressions.overallSatisfactionRate = Math.abs(overallSatisfactionChange);
      }

      if (overallCostEfficiencyChange > 0) {
        improvements.overallCostEfficiency = overallCostEfficiencyChange;
      } else if (overallCostEfficiencyChange < 0) {
        regressions.overallCostEfficiency = Math.abs(overallCostEfficiencyChange);
      }

      // Compare intent performance
      for (const [intent, afterIntent] of Object.entries(after.intentPerformance)) {
        const beforeIntent = before.intentPerformance[intent];
        if (!beforeIntent) continue;

        const winRateChange = afterIntent.winRate - beforeIntent.winRate;
        const metricKey = `intent_${intent}_winRate`;

        if (Math.abs(winRateChange) > this.config.significanceThreshold) {
          const significance = this.calculateSignificance(Math.abs(winRateChange));
          const impact = winRateChange > 0 ? 'positive' : 'negative';
          
          significantChanges.push({
            metric: metricKey,
            change: winRateChange,
            significance,
            impact
          });

          if (winRateChange > 0) {
            improvements[metricKey] = winRateChange;
          } else {
            regressions[metricKey] = Math.abs(winRateChange);
          }
        }
      }

      // Calculate net impact
      const totalImprovements = Object.values(improvements).reduce((sum, val) => sum + val, 0);
      const totalRegressions = Object.values(regressions).reduce((sum, val) => sum + val, 0);
      const netImpact = totalImprovements - totalRegressions;

      // Generate recommendations
      const recommendations = this.generateRecommendations(improvements, regressions, significantChanges);

      const report = {
        beforeMetrics: before,
        afterMetrics: after,
        improvements,
        regressions,
        netImpact,
        recommendations,
        significantChanges
      };

      logger.info('Comparison report generated', {
        netImpact,
        improvementsCount: Object.keys(improvements).length,
        regressionsCount: Object.keys(regressions).length,
        significantChangesCount: significantChanges.length
      }, 'performance-tracker');

      return report;
    } catch (error) {
      logger.error('Failed to generate comparison report', {
        error: error instanceof Error ? error.message : String(error)
      }, 'performance-tracker');
      throw error;
    }
  }

  /**
   * Analyze trends across multiple time periods
   */
  async analyzeTrends(metrics, periods) {
    try {
      logger.info('Starting trend analysis', {
        metricsCount: metrics.length,
        periodsCount: periods.length
      }, 'performance-tracker');

      const trends = {};
      const insights = [];

      // Analyze overall satisfaction trend
      const satisfactionTrend = this.analyzeTimeSeries(
        metrics.map(m => ({ timestamp: m.period.start, value: m.overallSatisfactionRate })),
        'overall_satisfaction'
      );
      trends.overallSatisfaction = satisfactionTrend;

      // Analyze cost efficiency trend
      const costEfficiencyTrend = this.analyzeTimeSeries(
        metrics.map(m => ({ timestamp: m.period.start, value: m.overallCostEfficiency })),
        'cost_efficiency'
      );
      trends.costEfficiency = costEfficiencyTrend;

      // Detect anomalies
      const anomalies = this.detectAnomalies(metrics);

      // Generate insights
      insights.push(...this.generateTrendInsights(trends, anomalies));

      const analysis = {
        trends,
        seasonalPatterns: {}, // TODO: Implement seasonal pattern detection
        anomalies,
        insights
      };

      logger.info('Trend analysis completed', {
        trendsCount: Object.keys(trends).length,
        anomaliesCount: anomalies.length,
        insightsCount: insights.length
      }, 'performance-tracker');

      return analysis;
    } catch (error) {
      logger.error('Failed to analyze trends', {
        error: error instanceof Error ? error.message : String(error)
      }, 'performance-tracker');
      throw error;
    }
  }

  /**
   * Export metrics in various formats
   */
  async exportMetrics(metrics, format) {
    try {
      logger.debug('Exporting metrics', { format }, 'performance-tracker');

      switch (format) {
        case 'json':
          return JSON.stringify(metrics, null, 2);
        
        case 'csv':
          return this.exportToCSV(metrics);
        
        case 'md':
          return this.exportToMarkdown(metrics);
        
        default:
          throw new Error(`Unsupported export format: ${format}`);
      }
    } catch (error) {
      logger.error('Failed to export metrics', {
        format,
        error: error instanceof Error ? error.message : String(error)
      }, 'performance-tracker');
      throw error;
    }
  }

  /**
   * Filter signals by time period
   */
  filterSignalsByPeriod(signals, _period) {
    // Since OutcomeSignal doesn't have timestamp, we'll assume all signals are within the period
    // In a real implementation, you'd need to add timestamp to OutcomeSignal or join with interaction data
    return signals;
  }

  /**
   * Compute win rates by different dimensions
   */
  async computeWinRates(signals) {
    const winRates = {};

    // Overall win rate
    const totalSignals = signals.length;
    const satisfiedSignals = signals.filter(s => s.satisfied).length;
    winRates.overall = totalSignals > 0 ? satisfiedSignals / totalSignals : 0;

    // Win rates by intent
    const intentGroups = this.groupBy(signals, 'intent');
    for (const [intent, group] of Object.entries(intentGroups)) {
      const satisfied = group.filter(s => s.satisfied).length;
      winRates[`intent_${intent}`] = group.length > 0 ? satisfied / group.length : 0;
    }

    // Win rates by bundle signature
    const bundleGroups = this.groupBy(signals, 'bundleSignature');
    for (const [signature, group] of Object.entries(bundleGroups)) {
      const satisfied = group.filter(s => s.satisfied).length;
      winRates[`bundle_${signature}`] = group.length > 0 ? satisfied / group.length : 0;
    }

    return winRates;
  }

  /**
   * Compute satisfaction trends over time
   */
  async computeSatisfactionTrends(signals, _period) {
    // Since we don't have timestamps in signals, we'll create a synthetic trend
    // In a real implementation, you'd need actual timestamps
    const days = Math.ceil((_period.end.getTime() - _period.start.getTime()) / (1000 * 60 * 60 * 24));
    const signalsPerDay = Math.ceil(signals.length / days);

    const trends = [];
    
    // Overall satisfaction trend
    const overallPoints = [];
    for (let i = 0; i < days; i++) {
      const dayStart = new Date(_period.start.getTime() + i * 24 * 60 * 60 * 1000);
      const daySignals = signals.slice(i * signalsPerDay, (i + 1) * signalsPerDay);
      const satisfactionRate = daySignals.length > 0 
        ? daySignals.filter(s => s.satisfied).length / daySignals.length 
        : 0;
      
      overallPoints.push({
        timestamp: dayStart,
        value: satisfactionRate
      });
    }

    trends.push(new TimeSeriesData('Overall Satisfaction Rate', overallPoints, 'rate'));

    return trends;
  }

  /**
   * Compute token cost analysis
   */
  async computeTokenCostAnalysis(signals) {
    const totalTokens = signals.reduce((sum, s) => sum + s.tokenUsage, 0);
    const totalCost = (totalTokens / 1000000) * this.config.tokenCostPerMillion;
    const averageCostPerInteraction = signals.length > 0 ? totalCost / signals.length : 0;

    // Cost by intent
    const costByIntent = {};
    const intentGroups = this.groupBy(signals, 'intent');
    for (const [intent, group] of Object.entries(intentGroups)) {
      const intentTokens = group.reduce((sum, s) => sum + s.tokenUsage, 0);
      costByIntent[intent] = (intentTokens / 1000000) * this.config.tokenCostPerMillion;
    }

    // Cost by language (inferred from bundle signature or other metadata)
    const costByLanguage = {};
    // This would need language detection from signals or bundle data
    costByLanguage.unknown = totalCost; // Placeholder

    // Cost efficiency (satisfaction per cost unit)
    const satisfiedSignals = signals.filter(s => s.satisfied).length;
    const costEfficiency = totalCost > 0 ? satisfiedSignals / totalCost : 0;

    // Cost trend (synthetic - would need actual timestamps)
    const costTrend = new TimeSeriesData('Token Cost Trend', [{
      timestamp: new Date(),
      value: totalCost
    }], 'cost');

    return new CostAnalysis(
      totalTokens,
      totalCost,
      averageCostPerInteraction,
      costByIntent,
      costByLanguage,
      costEfficiency,
      costTrend
    );
  }

  /**
   * Compute intent-specific performance metrics
   */
  async computeIntentPerformance(signals, _period) {
    const intentGroups = this.groupBy(signals, 'intent');
    const intentMetrics = {};

    for (const [intent, group] of Object.entries(intentGroups)) {
      const satisfied = group.filter(s => s.satisfied).length;
      const winRate = group.length > 0 ? satisfied / group.length : 0;
      const averageTokenUsage = group.reduce((sum, s) => sum + s.tokenUsage, 0) / group.length;
      const timeToFixValues = group.filter(s => s.timeToFix !== undefined).map(s => s.timeToFix);
      const averageTimeToFix = timeToFixValues.length > 0 
        ? timeToFixValues.reduce((a, b) => a + b, 0) / timeToFixValues.length 
        : 0;
      
      // Cost efficiency for this intent
      const intentCost = (averageTokenUsage / 1000000) * this.config.tokenCostPerMillion;
      const costEfficiency = intentCost > 0 ? winRate / intentCost : 0;

      // Synthetic trend data
      const trend = new TimeSeriesData(`${intent} Performance Trend`, [{
        timestamp: new Date(),
        value: winRate
      }], 'rate');

      intentMetrics[intent] = {
        winRate,
        totalInteractions: group.length,
        satisfiedInteractions: satisfied,
        averageTokenUsage,
        averageTimeToFix,
        costEfficiency,
        trend
      };
    }

    return intentMetrics;
  }

  /**
   * Compute language-specific performance metrics
   */
  async computeLanguagePerformance(signals, _period) {
    // Group by inferred language (placeholder implementation)
    const languageGroups = {
      unknown: signals // Placeholder - would need actual language detection
    };

    const languageMetrics = {};

    for (const [language, group] of Object.entries(languageGroups)) {
      const satisfied = group.filter(s => s.satisfied).length;
      const winRate = group.length > 0 ? satisfied / group.length : 0;
      const averageTokenUsage = group.reduce((sum, s) => sum + s.tokenUsage, 0) / group.length;
      const timeToFixValues = group.filter(s => s.timeToFix !== undefined).map(s => s.timeToFix);
      const averageTimeToFix = timeToFixValues.length > 0 
        ? timeToFixValues.reduce((a, b) => a + b, 0) / timeToFixValues.length 
        : 0;
      
      const languageCost = (averageTokenUsage / 1000000) * this.config.tokenCostPerMillion;
      const costEfficiency = languageCost > 0 ? winRate / languageCost : 0;

      const trend = new TimeSeriesData(`${language} Performance Trend`, [{
        timestamp: new Date(),
        value: winRate
      }], 'rate');

      languageMetrics[language] = {
        winRate,
        totalInteractions: group.length,
        satisfiedInteractions: satisfied,
        averageTokenUsage,
        averageTimeToFix,
        costEfficiency,
        trend
      };
    }

    return languageMetrics;
  }

  /**
   * Compute repository-specific performance metrics
   */
  async computeRepositoryPerformance(signals, _period) {
    // Group by session ID as a proxy for repository
    const repoGroups = this.groupBy(signals, 'sessionId');
    const repoMetrics = {};

    for (const [repo, group] of Object.entries(repoGroups)) {
      const satisfied = group.filter(s => s.satisfied).length;
      const winRate = group.length > 0 ? satisfied / group.length : 0;
      const averageTokenUsage = group.reduce((sum, s) => sum + s.tokenUsage, 0) / group.length;
      const timeToFixValues = group.filter(s => s.timeToFix !== undefined).map(s => s.timeToFix);
      const averageTimeToFix = timeToFixValues.length > 0 
        ? timeToFixValues.reduce((a, b) => a + b, 0) / timeToFixValues.length 
        : 0;
      
      const repoCost = (averageTokenUsage / 1000000) * this.config.tokenCostPerMillion;
      const costEfficiency = repoCost > 0 ? winRate / repoCost : 0;

      const trend = new TimeSeriesData(`${repo} Performance Trend`, [{
        timestamp: new Date(),
        value: winRate
      }], 'rate');

      repoMetrics[repo] = {
        winRate,
        totalInteractions: group.length,
        satisfiedInteractions: satisfied,
        averageTokenUsage,
        averageTimeToFix,
        costEfficiency,
        trend,
        language: 'unknown' // Placeholder - would need actual language detection
      };
    }

    return repoMetrics;
  }

  /**
   * Calculate overall satisfaction rate
   */
  calculateOverallSatisfactionRate(signals) {
    if (signals.length === 0) return 0;
    const satisfied = signals.filter(s => s.satisfied).length;
    return satisfied / signals.length;
  }

  /**
   * Calculate overall cost efficiency
   */
  calculateOverallCostEfficiency(signals, costAnalysis) {
    if (costAnalysis.totalCost === 0) return 0;
    const satisfiedSignals = signals.filter(s => s.satisfied).length;
    return satisfiedSignals / costAnalysis.totalCost;
  }

  /**
   * Calculate significance level based on change magnitude
   */
  calculateSignificance(change) {
    if (change >= 0.1) return 'high';
    if (change >= 0.05) return 'medium';
    return 'low';
  }

  /**
   * Generate recommendations based on improvements and regressions
   */
  generateRecommendations(improvements, regressions, _significantChanges) {
    const recommendations = [];

    // Analyze improvements
    if (improvements.overallSatisfactionRate && improvements.overallSatisfactionRate > 0.1) {
      recommendations.push('Excellent improvement in overall satisfaction! Consider scaling current policies.');
    }

    // Analyze regressions
    if (regressions.overallSatisfactionRate && regressions.overallSatisfactionRate > 0.05) {
      recommendations.push('Significant drop in satisfaction detected. Review recent policy changes.');
    }

    // Intent-specific recommendations
    Object.entries(improvements).forEach(([key, value]) => {
      if (key.startsWith('intent_') && value > 0.1) {
        const intent = key.replace('intent_', '');
        recommendations.push(`Strong improvement in ${intent} intent. Consider applying similar strategies to related intents.`);
      }
    });

    Object.entries(regressions).forEach(([key, value]) => {
      if (key.startsWith('intent_') && value > 0.05) {
        const intent = key.replace('intent_', '');
        recommendations.push(`Performance decline in ${intent} intent. Review intent-specific policies.`);
      }
    });

    // Cost efficiency recommendations
    if (regressions.overallCostEfficiency && regressions.overallCostEfficiency > 0.1) {
      recommendations.push('Cost efficiency has decreased significantly. Review token usage and optimization strategies.');
    }

    return recommendations;
  }

  /**
   * Analyze time series data for trends
   */
  analyzeTimeSeries(points, metricName) {
    if (points.length < 2) {
      return {
        direction: 'stable',
        rate: 0,
        confidence: 0,
        forecast: new TimeSeriesData(`${metricName} Forecast`, [], 'rate')
      };
    }

    // Simple linear regression for trend detection
    const n = points.length;
    const x = points.map((_, i) => i);
    const y = points.map(p => p.value);
    
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
    const sumXX = x.reduce((sum, xi) => sum + xi * xi, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    // Determine direction
    let direction = 'stable';
    if (Math.abs(slope) > 0.001) {
      direction = slope > 0 ? 'improving' : 'declining';
    }

    // Simple confidence calculation
    const variance = y.reduce((sum, yi) => sum + Math.pow(yi - (slope * x[y.indexOf(yi)] + intercept), 2), 0) / n;
    const confidence = Math.max(0, 1 - variance);

    // Generate forecast
    const forecastPoints = [];
    const lastPoint = points[points.length - 1];
    for (let i = 1; i <= this.config.forecastHorizon; i++) {
      const futureDate = new Date(lastPoint.timestamp.getTime() + i * 24 * 60 * 60 * 1000);
      const futureValue = slope * (n + i - 1) + intercept;
      forecastPoints.push({
        timestamp: futureDate,
        value: Math.max(0, Math.min(1, futureValue)) // Clamp between 0 and 1
      });
    }

    return {
      direction,
      rate: slope,
      confidence,
      forecast: new TimeSeriesData(`${metricName} Forecast`, forecastPoints, 'rate')
    };
  }

  /**
   * Detect anomalies in metrics
   */
  detectAnomalies(metrics) {
    const anomalies = [];

    // Simple anomaly detection based on deviation from moving average
    for (let i = 1; i < metrics.length - 1; i++) {
      const current = metrics[i];
      const prev = metrics[i - 1];
      const next = metrics[i + 1];

      const avgSatisfaction = (prev.overallSatisfactionRate + next.overallSatisfactionRate) / 2;
      const deviation = Math.abs(current.overallSatisfactionRate - avgSatisfaction);

      if (deviation > 0.2) { // 20% deviation threshold
        anomalies.push({
          timestamp: current.period.start,
          metric: 'overallSatisfactionRate',
          value: current.overallSatisfactionRate,
          expectedValue: avgSatisfaction,
          deviation
        });
      }
    }

    return anomalies;
  }

  /**
   * Generate insights from trend analysis
   */
  generateTrendInsights(trends, anomalies) {
    const insights = [];

    // Overall trends
    if (trends.overallSatisfaction?.direction === 'improving') {
      insights.push('Overall satisfaction is trending upward, indicating positive policy impact.');
    } else if (trends.overallSatisfaction?.direction === 'declining') {
      insights.push('Overall satisfaction is declining, requiring immediate attention.');
    }

    // Cost efficiency trends
    if (trends.costEfficiency?.direction === 'declining') {
      insights.push('Cost efficiency is decreasing while satisfaction may be stable, consider optimization.');
    }

    // Anomaly insights
    if (anomalies.length > 0) {
      insights.push(`Detected ${anomalies.length} anomalous data points that may indicate external factors or measurement issues.`);
    }

    return insights;
  }

  /**
   * Export metrics to CSV format
   */
  exportToCSV(metrics) {
    const rows = [];
    
    // Header
    rows.push('Metric,Value,Unit');

    // Overall metrics
    rows.push(`Overall Satisfaction Rate,${metrics.overallSatisfactionRate},rate`);
    rows.push(`Overall Cost Efficiency,${metrics.overallCostEfficiency},efficiency`);
    rows.push(`Total Interactions,${metrics.totalInteractions},count`);

    // Win rates
    Object.entries(metrics.winRates).forEach(([key, value]) => {
      rows.push(`Win Rate - ${key},${value},rate`);
    });

    // Intent performance
    Object.entries(metrics.intentPerformance).forEach(([intent, data]) => {
      rows.push(`Intent ${intent} - Win Rate,${data.winRate},rate`);
      rows.push(`Intent ${intent} - Total Interactions,${data.totalInteractions},count`);
      rows.push(`Intent ${intent} - Cost Efficiency,${data.costEfficiency},efficiency`);
    });

    // Language performance
    Object.entries(metrics.languagePerformance).forEach(([language, data]) => {
      rows.push(`Language ${language} - Win Rate,${data.winRate},rate`);
      rows.push(`Language ${language} - Total Interactions,${data.totalInteractions},count`);
    });

    return rows.join('\n');
  }

  /**
   * Export metrics to Markdown format
   */
  exportToMarkdown(metrics) {
    const lines = [];

    lines.push('# Performance Metrics Report');
    lines.push('');
    lines.push(`**Period:** ${metrics.period.start.toISOString()} to ${metrics.period.end.toISOString()}`);
    lines.push(`**Total Interactions:** ${metrics.totalInteractions}`);
    lines.push('');

    // Overall Performance
    lines.push('## Overall Performance');
    lines.push('');
    lines.push('| Metric | Value |');
    lines.push('|--------|-------|');
    lines.push(`| Satisfaction Rate | ${(metrics.overallSatisfactionRate * 100).toFixed(1)}% |`);
    lines.push(`| Cost Efficiency | ${metrics.overallCostEfficiency.toFixed(4)} |`);
    lines.push('');

    // Win Rates
    lines.push('## Win Rates by Dimension');
    lines.push('');
    lines.push('| Dimension | Win Rate |');
    lines.push('|-----------|----------|');
    Object.entries(metrics.winRates).forEach(([key, value]) => {
      lines.push(`| ${key} | ${(value * 100).toFixed(1)}% |`);
    });
    lines.push('');

    // Intent Performance
    lines.push('## Intent Performance');
    lines.push('');
    Object.entries(metrics.intentPerformance).forEach(([intent, data]) => {
      lines.push(`### ${intent}`);
      lines.push(`- **Win Rate:** ${(data.winRate * 100).toFixed(1)}%`);
      lines.push(`- **Total Interactions:** ${data.totalInteractions}`);
      lines.push(`- **Average Token Usage:** ${data.averageTokenUsage.toFixed(0)}`);
      lines.push(`- **Cost Efficiency:** ${data.costEfficiency.toFixed(4)}`);
      lines.push('');
    });

    return lines.join('\n');
  }

  /**
   * Utility function to group array items by a key
   */
  groupBy(array, key) {
    return array.reduce((groups, item) => {
      const groupKey = String(item[key]);
      if (!groups[groupKey]) {
        groups[groupKey] = [];
      }
      groups[groupKey].push(item);
      return groups;
    }, {});
  }
}