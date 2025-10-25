#!/usr/bin/env node

/**
 * Analytics Demo - Demonstrating the Phase 6 Analytics System
 * 
 * This script shows how to use the comprehensive analytics system
 * for tracking performance metrics, generating comparison reports,
 * and analyzing trends in outcome-driven retrieval tuning.
 */

import { PerformanceTracker } from '../src/analytics/performance-tracker.js';

// Sample outcome signals that would come from the learning system
const sampleSignals = [
  {
    sessionId: 'webapp-session-001',
    query: 'how to implement JWT authentication',
    intent: 'api',
    bundleSignature: 'b_jwt_auth_v1',
    satisfied: true,
    timeToFix: 3500,
    topClickId: 'auth-middleware.js',
    tokenUsage: 280,
    seedWeights: { api: 0.8, search: 0.2, symbol: 0, config: 0, incident: 0 },
    policyThresholds: { 
      earlyStop: 0.8, 
      maxDepth: 4, 
      includeSymbols: 1, 
      includeFiles: 1, 
      includeContent: 1 
    }
  },
  {
    sessionId: 'webapp-session-002',
    query: 'database connection timeout error',
    intent: 'incident',
    bundleSignature: 'b_db_timeout_v2',
    satisfied: false,
    timeToFix: 15000,
    tokenUsage: 320,
    seedWeights: { api: 0, search: 0.3, symbol: 0, config: 0, incident: 0.7 },
    policyThresholds: { 
      earlyStop: 0.6, 
      maxDepth: 6, 
      includeSymbols: 1, 
      includeFiles: 1, 
      includeContent: 1 
    }
  },
  {
    sessionId: 'mobileapp-session-003',
    query: 'React component lifecycle methods',
    intent: 'symbol',
    bundleSignature: 'b_react_lifecycle_v1',
    satisfied: true,
    timeToFix: 2500,
    topClickId: 'component.jsx',
    tokenUsage: 180,
    seedWeights: { api: 0, search: 0.1, symbol: 0.9, config: 0, incident: 0 },
    policyThresholds: { 
      earlyStop: 0.9, 
      maxDepth: 3, 
      includeSymbols: 1, 
      includeFiles: 0, 
      includeContent: 0 
    }
  },
  {
    sessionId: 'backend-session-004',
    query: 'environment configuration variables',
    intent: 'config',
    bundleSignature: 'b_env_config_v1',
    satisfied: true,
    timeToFix: 4000,
    topClickId: '.env.example',
    tokenUsage: 150,
    seedWeights: { api: 0, search: 0.2, symbol: 0, config: 0.8, incident: 0 },
    policyThresholds: { 
      earlyStop: 0.7, 
      maxDepth: 2, 
      includeSymbols: 0, 
      includeFiles: 1, 
      includeContent: 0 
    }
  },
  {
    sessionId: 'webapp-session-005',
    query: 'user search functionality',
    intent: 'search',
    bundleSignature: 'b_user_search_v3',
    satisfied: false,
    timeToFix: 8000,
    tokenUsage: 220,
    seedWeights: { api: 0, search: 1.0, symbol: 0, config: 0, incident: 0 },
    policyThresholds: { 
      earlyStop: 0.5, 
      maxDepth: 3, 
      includeSymbols: 0, 
      includeFiles: 1, 
      includeContent: 0 
    }
  }
];

// Simulate policy optimization by creating "before" and "after" datasets
const beforeOptimization = [
  {
    sessionId: 'test-session-001',
    query: 'API endpoint documentation',
    intent: 'api',
    bundleSignature: 'b_api_old_policy',
    satisfied: false,
    timeToFix: 10000,
    tokenUsage: 400,
    seedWeights: { api: 0.4, search: 0.6, symbol: 0, config: 0, incident: 0 },
    policyThresholds: { 
      earlyStop: 0.4, 
      maxDepth: 2, 
      includeSymbols: 0, 
      includeFiles: 1, 
      includeContent: 0 
    }
  }
];

const afterOptimization = [
  {
    sessionId: 'test-session-001',
    query: 'API endpoint documentation',
    intent: 'api',
    bundleSignature: 'b_api_new_policy',
    satisfied: true,
    timeToFix: 3000,
    tokenUsage: 200,
    seedWeights: { api: 0.8, search: 0.2, symbol: 0, config: 0, incident: 0 },
    policyThresholds: { 
      earlyStop: 0.8, 
      maxDepth: 4, 
      includeSymbols: 1, 
      includeFiles: 1, 
      includeContent: 1 
    }
  }
];

async function demonstrateAnalytics() {
  console.log('🔍 Phase 6 Analytics System Demo\n');
  
  const tracker = new PerformanceTracker({
    tokenCostPerMillion: 0.002,
    significanceThreshold: 0.05,
    forecastHorizon: 7,
    minSampleSize: 5,
    enableCache: false
  });

  const period = {
    start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    end: new Date()
  };

  try {
    // 1. Track comprehensive performance metrics
    console.log('📊 Tracking Performance Metrics...');
    const metrics = await tracker.trackMetrics(sampleSignals, period);
    
    console.log(`\n📈 Overall Performance:`);
    console.log(`   Total Interactions: ${metrics.totalInteractions}`);
    console.log(`   Satisfaction Rate: ${(metrics.overallSatisfactionRate * 100).toFixed(1)}%`);
    console.log(`   Cost Efficiency: ${metrics.overallCostEfficiency.toFixed(2)}`);
    console.log(`   Total Tokens Used: ${metrics.tokenCostAnalysis.totalTokens}`);
    console.log(`   Total Cost: $${metrics.tokenCostAnalysis.totalCost.toFixed(6)}`);

    console.log(`\n🎯 Intent Performance:`);
    Object.entries(metrics.intentPerformance).forEach(([intent, data]) => {
      console.log(`   ${intent}: ${(data.winRate * 100).toFixed(1)}% satisfaction (${data.totalInteractions} interactions)`);
    });

    console.log(`\n💰 Cost Analysis by Intent:`);
    Object.entries(metrics.tokenCostAnalysis.costByIntent).forEach(([intent, cost]) => {
      console.log(`   ${intent}: $${cost.toFixed(6)}`);
    });

    // 2. Generate comparison report for policy optimization
    console.log('\n🔄 Policy Optimization Analysis...');
    const beforeMetrics = await tracker.trackMetrics(beforeOptimization, period);
    const afterMetrics = await tracker.trackMetrics(afterOptimization, period);
    const comparison = await tracker.generateComparisonReport(beforeMetrics, afterMetrics);

    console.log(`\n📊 Optimization Results:`);
    console.log(`   Net Impact: ${comparison.netImpact > 0 ? '+' : ''}${comparison.netImpact.toFixed(2)}`);
    console.log(`   Improvements: ${Object.keys(comparison.improvements).length}`);
    console.log(`   Regressions: ${Object.keys(comparison.regressions).length}`);

    if (comparison.recommendations.length > 0) {
      console.log(`\n💡 Recommendations:`);
      comparison.recommendations.forEach((rec, i) => {
        console.log(`   ${i + 1}. ${rec}`);
      });
    }

    // 3. Export metrics in different formats
    console.log('\n📄 Exporting Metrics...');
    
    const jsonExport = await tracker.exportMetrics(metrics, 'json');
    const csvExport = await tracker.exportMetrics(metrics, 'csv');
    const mdExport = await tracker.exportMetrics(metrics, 'md');

    console.log(`   JSON Export: ${jsonExport.length} characters`);
    console.log(`   CSV Export: ${csvExport.split('\n').length} lines`);
    console.log(`   Markdown Export: ${mdExport.split('\n').length} lines`);

    // Show a sample of the markdown export
    console.log('\n📝 Sample Markdown Report:');
    console.log(mdExport.split('\n').slice(0, 15).join('\n'));
    console.log('... (truncated)');

    // 4. Trend analysis with multiple periods
    console.log('\n📈 Trend Analysis...');
    const trendMetrics = [
      await tracker.trackMetrics(sampleSignals.slice(0, 2), {
        start: new Date(Date.now() - 21 * 24 * 60 * 60 * 1000),
        end: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)
      }),
      await tracker.trackMetrics(sampleSignals.slice(2, 4), {
        start: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
        end: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      }),
      await tracker.trackMetrics(sampleSignals.slice(4, 5), {
        start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        end: new Date()
      })
    ];

    const periods = [
      {
        start: new Date(Date.now() - 21 * 24 * 60 * 60 * 1000),
        end: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)
      },
      {
        start: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
        end: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      },
      {
        start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        end: new Date()
      }
    ];

    const trendAnalysis = await tracker.analyzeTrends(trendMetrics, periods);
    
    console.log(`\n📊 Trend Insights:`);
    trendAnalysis.insights.forEach((insight, i) => {
      console.log(`   ${i + 1}. ${insight}`);
    });

    if (trendAnalysis.anomalies.length > 0) {
      console.log(`\n⚠️  Anomalies Detected: ${trendAnalysis.anomalies.length}`);
    }

    console.log('\n✅ Analytics demo completed successfully!');
    console.log('\n🚀 Key Features Demonstrated:');
    console.log('   • Comprehensive performance tracking');
    console.log('   • Intent-specific metrics analysis');
    console.log('   • Token cost optimization insights');
    console.log('   • Before/after policy comparison');
    console.log('   • Actionable recommendations');
    console.log('   • Multi-format export (JSON, CSV, Markdown)');
    console.log('   • Trend analysis and anomaly detection');
    console.log('   • Scalable to large datasets');

  } catch (error) {
    console.error('❌ Demo failed:', error.message);
    process.exit(1);
  }
}

// Run the demo
if (import.meta.url === `file://${process.argv[1]}`) {
  demonstrateAnalytics();
}

export { demonstrateAnalytics };