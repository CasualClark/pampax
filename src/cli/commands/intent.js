#!/usr/bin/env node

import { intentClassifier } from '../../intent/intent-classifier.js';
import { policyGate } from '../../policy/policy-gate.js';
import chalk from 'chalk';

/**
 * Analyze intent for a given query
 */
export async function intentAnalyzeCommand(query, options = {}) {
  const json = options.json || false;
  
  try {
    // Classify intent
    const intent = intentClassifier.classify(query);
    
    if (json) {
      console.log(JSON.stringify({
        success: true,
        query,
        intent: {
          type: intent.intent,
          confidence: intent.confidence,
          entities: intent.entities,
          suggestedPolicies: intent.suggestedPolicies
        },
        classifier: {
          config: intentClassifier.getConfig()
        }
      }, null, 2));
    } else {
      console.log(`\n${chalk.blue('=== Intent Analysis ===')}`);
      console.log(`Query: "${chalk.white(query)}"`);
      console.log(`\n${chalk.green('Detected Intent:')} ${chalk.cyan(intent.intent)} (${chalk.yellow((intent.confidence * 100).toFixed(1) + '%')})`);
      
      if (intent.entities.length > 0) {
        console.log(`\n${chalk.green('Entities Found:')}`);
        intent.entities.forEach(entity => {
          console.log(`  • ${chalk.cyan(entity.type)}: "${chalk.white(entity.value)}" (position: ${entity.position})`);
        });
      } else {
        console.log(`\n${chalk.gray('No entities detected')}`);
      }
      
      if (intent.suggestedPolicies.length > 0) {
        console.log(`\n${chalk.green('Suggested Policies:')}`);
        intent.suggestedPolicies.forEach(policy => {
          console.log(`  • ${policy}`);
        });
      }
      
      // Show classifier configuration if verbose
      if (options.verbose) {
        const config = intentClassifier.getConfig();
        console.log(`\n${chalk.blue('Classifier Configuration:')}`);
        console.log(`${chalk.green('Thresholds:')}`);
        Object.entries(config.thresholds).forEach(([intent, threshold]) => {
          console.log(`  • ${intent}: ${threshold}`);
        });
        
        console.log(`\n${chalk.green('Patterns (sample):')}`);
        Object.entries(config.patterns).forEach(([intent, patterns]) => {
          console.log(`  • ${intent}: ${patterns.slice(0, 3).join(', ')}${patterns.length > 3 ? '...' : ''}`);
        });
      }
      
      console.log('');
    }
    
  } catch (error) {
    if (json) {
      console.log(JSON.stringify({
        success: false,
        error: error.message,
        query
      }, null, 2));
    } else {
      console.error(`${chalk.red('❌ Intent analysis failed:')} ${error.message}`);
    }
    process.exit(1);
  }
}

/**
 * Show policy configuration for a specific intent
 */
export async function policyShowCommand(intentType, options = {}) {
  const json = options.json || false;
  
  try {
    // Validate intent type
    const validIntents = ['symbol', 'config', 'api', 'incident', 'search'];
    if (!validIntents.includes(intentType)) {
      const error = `Invalid intent type: ${intentType}. Valid types: ${validIntents.join(', ')}`;
      if (json) {
        console.log(JSON.stringify({
          success: false,
          error,
          intentType
        }, null, 2));
      } else {
        console.error(`${chalk.red('❌')} ${error}`);
      }
      process.exit(1);
    }
    
    // Create a mock intent for policy evaluation
    const mockIntent = {
      intent: intentType,
      confidence: 1.0,
      entities: [],
      suggestedPolicies: [`${intentType}-default`]
    };
    
    // Create search context
    const searchContext = {
      repo: options.repo || 'default',
      queryLength: 20,
      budget: options.tokenBudget || 4000,
      language: options.lang
    };
    
    // Evaluate policy
    const policy = policyGate.evaluate(mockIntent, searchContext);
    
    if (json) {
      console.log(JSON.stringify({
        success: true,
        intentType,
        searchContext,
        policy: {
          maxDepth: policy.maxDepth,
          includeSymbols: policy.includeSymbols,
          includeFiles: policy.includeFiles,
          includeContent: policy.includeContent,
          earlyStopThreshold: policy.earlyStopThreshold,
          seedWeights: policy.seedWeights
        }
      }, null, 2));
    } else {
      console.log(`\n${chalk.blue('=== Policy Configuration ===')}`);
      console.log(`Intent Type: ${chalk.cyan(intentType)}`);
      console.log(`Repository: ${chalk.cyan(searchContext.repo)}`);
      console.log(`Token Budget: ${chalk.cyan(searchContext.budget)}`);
      if (searchContext.language) {
        console.log(`Language: ${chalk.cyan(searchContext.language)}`);
      }
      
      console.log(`\n${chalk.green('Policy Settings:')}`);
      console.log(`  • Max Depth: ${chalk.yellow(policy.maxDepth)}`);
      console.log(`  • Include Symbols: ${chalk.yellow(policy.includeSymbols)}`);
      console.log(`  • Include Files: ${chalk.yellow(policy.includeFiles)}`);
      console.log(`  • Include Content: ${chalk.yellow(policy.includeContent)}`);
      console.log(`  • Early Stop Threshold: ${chalk.yellow(policy.earlyStopThreshold)}`);
      
      console.log(`\n${chalk.green('Seed Weights:')}`);
      Object.entries(policy.seedWeights).forEach(([key, weight]) => {
        console.log(`  • ${key}: ${chalk.yellow(weight.toFixed(2))}`);
      });
      
      // Show all available policies if verbose
      if (options.verbose) {
        const allPolicies = policyGate.getAllPolicies();
        console.log(`\n${chalk.blue('All Available Policies:')}`);
        Object.entries(allPolicies.default).forEach(([intent, policy]) => {
          console.log(`  • ${chalk.cyan(intent)}: maxDepth=${policy.maxDepth}, earlyStop=${policy.earlyStopThreshold}`);
        });
      }
      
      console.log('');
    }
    
  } catch (error) {
    if (json) {
      console.log(JSON.stringify({
        success: false,
        error: error.message,
        intentType
      }, null, 2));
    } else {
      console.error(`${chalk.red('❌ Policy show failed:')} ${error.message}`);
    }
    process.exit(1);
  }
}

/**
 * Configure intent command routing
 */
export function configureIntentCommand(program) {
  const intentCmd = program
    .command('intent')
    .description('Intent analysis and policy debugging tools');
  
  // Intent analyze subcommand
  intentCmd
    .command('analyze <query>')
    .description('Analyze intent classification for a query')
    .option('--json', 'Output in JSON format')
    .option('--verbose', 'Show classifier configuration')
    .action(intentAnalyzeCommand);
  
  // Policy show subcommand
  intentCmd
    .command('show <intentType>')
    .description('Show policy configuration for a specific intent type')
    .option('--repo <name>', 'Repository name for context', 'default')
    .option('--lang <language>', 'Programming language for context')
    .option('--token-budget <num>', 'Token budget for context', '4000')
    .option('--json', 'Output in JSON format')
    .option('--verbose', 'Show all available policies')
    .action(policyShowCommand);
}