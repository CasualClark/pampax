#!/usr/bin/env node

import path from 'path';
import fs from 'fs';
import { Database } from '../../storage/database-simple.js';
import { PackingProfileManager, MODEL_PROFILES } from '../../tokenization/packing-profiles.js';
import { StorageOperations } from '../../storage/crud.js';
import { createTokenizer, getModelRecommendations } from '../../tokenization/tokenizer-factory.js';
import chalk from 'chalk';

// Simple logger fallback
const logger = {
  error: (message, meta) => console.error(`ERROR: ${message}`, meta || ''),
  info: (message, meta) => console.log(`INFO: ${message}`, meta || ''),
  warn: (message, meta) => console.warn(`WARN: ${message}`, meta || ''),
  debug: (message, meta) => process.env.DEBUG && console.log(`DEBUG: ${message}`, meta || '')
};



/**
 * Count tokens for specific text
 */
export async function tokenCountCommand(text, options = {}) {
  const model = options.model || 'default';
  const json = options.json || false;
  const verbose = options.verbose || false;

  try {
    const tokenizer = createTokenizer(model);
    const tokenCount = tokenizer.countTokens(text);
    const contextSize = tokenizer.getContextSize();
    const percentageUsed = ((tokenCount / contextSize) * 100).toFixed(1);
    const config = tokenizer.getConfig();

    if (json) {
      console.log(JSON.stringify({
        text: text.substring(0, 100) + (text.length > 100 ? '...' : ''),
        model,
        tokenCount,
        contextSize,
        percentageUsed: parseFloat(percentageUsed),
        characters: text.length,
        charsPerToken: (text.length / tokenCount).toFixed(2),
        config
      }, null, 2));
    } else {
      console.log(`${chalk.blue('Token Analysis for:')} ${chalk.cyan(text.substring(0, 50) + (text.length > 50 ? '...' : ''))}\n`);
      console.log(`${chalk.blue('Model:')} ${chalk.yellow(config.name)} (${model})`);
      console.log(`${chalk.blue('Token Count:')} ${chalk.green(tokenCount.toLocaleString())}`);
      console.log(`${chalk.blue('Characters:')} ${chalk.yellow(text.length.toLocaleString())}`);
      console.log(`${chalk.blue('Chars per Token:')} ${chalk.yellow((text.length / tokenCount).toFixed(2))}`);
      console.log(`${chalk.blue('Context Size:')} ${chalk.yellow(contextSize.toLocaleString())}`);
      console.log(`${chalk.blue('Usage:')} ${chalk.green(percentageUsed + '%')} of context`);
      
      if (verbose) {
        console.log(`\n${chalk.blue('Additional Info:')}`);
        console.log(`  Average word length: ${(text.length / text.split(/\s+/).length).toFixed(1)}`);
        console.log(`  Estimated words: ${text.split(/\s+/).length.toLocaleString()}`);
        console.log(`  Max tokens: ${config.maxTokens.toLocaleString()}`);
        console.log(`  Tokenizer: ${config.tokenizer}`);
      }
    }
  } catch (error) {
    logger.error('Token count failed', { error: error.message, model });
    if (json) {
      console.log(JSON.stringify({
        success: false,
        error: error.message,
        model
      }, null, 2));
    } else {
      console.error(chalk.red('❌ Token count failed:'), error.message);
    }
    process.exit(1);
  }
}

/**
 * Show packing profile for repository
 */
export async function tokenProfileCommand(repoPath, options = {}) {
  const model = options.model || 'default';
  const json = options.json || false;
  const verbose = options.verbose || false;

  try {
    const resolvedPath = path.resolve(repoPath);
    const dbPath = path.join(resolvedPath, '.pampax/pampax.sqlite');
    
    if (!fs.existsSync(dbPath)) {
      const error = `No PAMPAX database found at ${dbPath}. Run "pampax index" first.`;
      if (json) {
        console.log(JSON.stringify({ success: false, error }, null, 2));
      } else {
        console.error(chalk.red('❌'), error);
      }
      process.exit(1);
    }

    const db = new Database(dbPath);
    const storage = new StorageOperations(db);
    const profileManager = new PackingProfileManager(storage);
    
    const repoName = path.basename(resolvedPath);
    let profile = await profileManager.getProfile(repoName, model);
    
    // If no specific profile, use model template
    if (!profile) {
      const modelProfile = MODEL_PROFILES[model] || MODEL_PROFILES.default;
      profile = {
        id: `${repoName}-${model}-template`,
        repository: repoName,
        model,
        priorities: modelProfile.priorities,
        budgetAllocation: modelProfile.budgetAllocation,
        capsuleStrategies: modelProfile.capsuleStrategies,
        truncationStrategies: modelProfile.truncationStrategies,
        createdAt: new Date(),
        updatedAt: new Date(),
        version: 1,
        metadata: { source: 'template' }
      };
    }

    if (json) {
      console.log(JSON.stringify({
        repository: profile.repository,
        model: profile.model,
        profile: {
          id: profile.id,
          version: profile.version,
          priorities: profile.priorities,
          budgetAllocation: profile.budgetAllocation,
          capsuleStrategies: profile.capsuleStrategies,
          truncationStrategies: profile.truncationStrategies,
          metadata: profile.metadata
        }
      }, null, 2));
    } else {
      console.log(`${chalk.blue('Packing Profile for:')} ${chalk.cyan(profile.repository)} (${chalk.yellow(profile.model)})\n`);
      
      console.log(`${chalk.green('=== Budget Allocation ===')}`);
      console.log(`Total Budget: ${chalk.yellow(profile.budgetAllocation.total.toLocaleString())} tokens`);
      console.log(`Must Have: ${chalk.green(profile.budgetAllocation.mustHave.toLocaleString())} tokens (${((profile.budgetAllocation.mustHave / profile.budgetAllocation.total) * 100).toFixed(1)}%)`);
      console.log(`Important: ${chalk.blue(profile.budgetAllocation.important.toLocaleString())} tokens (${((profile.budgetAllocation.important / profile.budgetAllocation.total) * 100).toFixed(1)}%)`);
      console.log(`Supplementary: ${chalk.cyan(profile.budgetAllocation.supplementary.toLocaleString())} tokens (${((profile.budgetAllocation.supplementary / profile.budgetAllocation.total) * 100).toFixed(1)}%)`);
      console.log(`Optional: ${chalk.gray(profile.budgetAllocation.optional.toLocaleString())} tokens (${((profile.budgetAllocation.optional / profile.budgetAllocation.total) * 100).toFixed(1)}%)`);
      console.log(`Reserve: ${chalk.magenta(profile.budgetAllocation.reserve.toLocaleString())} tokens (${((profile.budgetAllocation.reserve / profile.budgetAllocation.total) * 100).toFixed(1)}%)`);
      
      console.log(`\n${chalk.green('=== Content Priorities ===')}`);
      Object.entries(profile.priorities).forEach(([type, priority]) => {
        const color = priority >= 0.9 ? chalk.green : priority >= 0.7 ? chalk.yellow : chalk.gray;
        console.log(`${type.charAt(0).toUpperCase() + type.slice(1)}: ${color(priority.toFixed(2))}`);
      });
      
      if (verbose) {
        console.log(`\n${chalk.green('=== Capsule Strategies ===')}`);
        console.log(`Enabled: ${profile.capsuleStrategies.enabled ? chalk.green('Yes') : chalk.red('No')}`);
        console.log(`Max Capsule Size: ${chalk.yellow(profile.capsuleStrategies.maxCapsuleSize.toLocaleString())} tokens`);
        console.log(`Min Capsule Size: ${chalk.yellow(profile.capsuleStrategies.minCapsuleSize.toLocaleString())} tokens`);
        console.log(`Capsule Threshold: ${chalk.yellow(profile.capsuleStrategies.capsuleThreshold)}`);
        console.log(`Preserve Structure: ${profile.capsuleStrategies.preserveStructure ? chalk.green('Yes') : chalk.red('No')}`);
        
        console.log(`\n${chalk.green('=== Truncation Strategies ===')}`);
        console.log(`Strategy: ${chalk.yellow(profile.truncationStrategies.strategy)}`);
        console.log(`Preserve Important: ${profile.truncationStrategies.preserveImportant ? chalk.green('Yes') : chalk.red('No')}`);
        console.log(`Preserve Context: ${profile.truncationStrategies.preserveContext ? chalk.green('Yes') : chalk.red('No')}`);
        console.log(`Truncate Comments: ${profile.truncationStrategies.truncateComments ? chalk.green('Yes') : chalk.red('No')}`);
        console.log(`Preserve Signatures: ${profile.truncationStrategies.preserveSignatures ? chalk.green('Yes') : chalk.red('No')}`);
      }
      
      if (profile.metadata) {
        console.log(`\n${chalk.green('=== Metadata ===')}`);
        console.log(`Version: ${chalk.yellow(profile.version)}`);
        console.log(`Source: ${chalk.cyan(profile.metadata.source || 'database')}`);
        if (profile.updatedAt) {
          console.log(`Last Updated: ${chalk.gray(new Date(profile.updatedAt).toLocaleString())}`);
        }
      }
    }
  } catch (error) {
    logger.error('Profile retrieval failed', { error: error.message, repoPath, model });
    if (json) {
      console.log(JSON.stringify({
        success: false,
        error: error.message,
        repoPath,
        model
      }, null, 2));
    } else {
      console.error(chalk.red('❌ Profile retrieval failed:'), error.message);
    }
    process.exit(1);
  }
}

/**
 * Set token budget for session
 */
export async function tokenBudgetCommand(amount, options = {}) {
  const model = options.model || 'default';
  const json = options.json || false;
  const repoPath = options.repo || '.';

  try {
    const budget = parseInt(amount);
    if (isNaN(budget) || budget <= 0) {
      throw new Error('Invalid budget amount. Must be a positive integer.');
    }

    // Store budget in environment or config file for session persistence
    const budgetConfig = {
      budget,
      model,
      repoPath: path.resolve(repoPath),
      timestamp: Date.now()
    };

    // Store in .pampax directory
    const resolvedPath = path.resolve(repoPath);
    const pampaxDir = path.join(resolvedPath, '.pampax');
    const budgetFile = path.join(pampaxDir, 'token-budget.json');

    if (!fs.existsSync(pampaxDir)) {
      fs.mkdirSync(pampaxDir, { recursive: true });
    }

    fs.writeFileSync(budgetFile, JSON.stringify(budgetConfig, null, 2));

    const tokenizer = createTokenizer(model);
    const contextSize = tokenizer.getContextSize();
    const percentageOfContext = ((budget / contextSize) * 100).toFixed(1);

    if (json) {
      console.log(JSON.stringify({
        success: true,
        budget,
        model,
        repoPath: path.resolve(repoPath),
        contextSize,
        percentageOfContext: parseFloat(percentageOfContext),
        config: budgetConfig
      }, null, 2));
    } else {
      console.log(`${chalk.green('✅ Token budget set successfully!')}\n`);
      console.log(`${chalk.blue('Budget:')} ${chalk.yellow(budget.toLocaleString())} tokens`);
      console.log(`${chalk.blue('Model:')} ${chalk.yellow(model)}`);
      console.log(`${chalk.blue('Repository:')} ${chalk.cyan(path.resolve(repoPath))}`);
      console.log(`${chalk.blue('Context Usage:')} ${chalk.green(percentageOfContext + '%')} of model context`);
      console.log(`${chalk.blue('Config File:')} ${chalk.gray(budgetFile)}`);
      
      // Show model recommendations based on budget
      const recommendations = getModelRecommendations(budget);
      const bestFit = recommendations.find(r => r.recommendation === 'good') || recommendations[0];
      
      if (bestFit && bestFit.model !== model) {
        console.log(`\n${chalk.blue('💡 Better Model Fit:')}`);
        console.log(`  ${chalk.cyan(bestFit.name)} would use ${chalk.yellow(bestFit.usagePercentage + '%')} of context`);
        console.log(`  Consider using: ${chalk.yellow('--target-model ' + bestFit.model)}`);
      }
      
      // Show recommendations based on budget
      const budgetRecommendations = getBudgetRecommendations(budget, model);
      if (budgetRecommendations.length > 0) {
        console.log(`\n${chalk.blue('💡 Budget Recommendations:')}`);
        budgetRecommendations.forEach(rec => console.log(`  • ${rec}`));
      }
    }
  } catch (error) {
    logger.error('Budget setting failed', { error: error.message, amount, model });
    if (json) {
      console.log(JSON.stringify({
        success: false,
        error: error.message,
        amount,
        model
      }, null, 2));
    } else {
      console.error(chalk.red('❌ Budget setting failed:'), error.message);
    }
    process.exit(1);
  }
}

/**
 * List supported models and their token limits
 */
export async function tokenModelsCommand(options = {}) {
  const json = options.json || false;
  const verbose = options.verbose || false;

  try {
    const { TokenizerFactory, MODEL_CONFIGS } = await import('../../tokenization/tokenizer-factory.js');
    const models = TokenizerFactory.getSupportedModels();
    
    if (json) {
      console.log(JSON.stringify({
        models: models.map(model => {
          const config = MODEL_CONFIGS[model];
          return {
            name: model,
            displayName: config.name,
            contextSize: config.contextSize,
            maxTokens: config.maxTokens,
            charsPerToken: config.charsPerToken,
            tokenizer: config.tokenizer,
            recommendedBudget: Math.floor(config.contextSize * 0.7)
          };
        })
      }, null, 2));
    } else {
      console.log(`${chalk.blue('Supported Models and Token Limits')}\n`);
      
      models.forEach(model => {
        const config = MODEL_CONFIGS[model];
        const recommendedBudget = Math.floor(config.contextSize * 0.7);
        
        console.log(`${chalk.cyan(config.name)} (${model})`);
        console.log(`  Context Size: ${chalk.yellow(config.contextSize.toLocaleString())} tokens`);
        console.log(`  Max Tokens: ${chalk.yellow(config.maxTokens.toLocaleString())} tokens`);
        console.log(`  Chars per Token: ${chalk.yellow(config.charsPerToken)}`);
        console.log(`  Recommended Budget: ${chalk.green(recommendedBudget.toLocaleString())} tokens (${Math.round(0.7 * 100)}%)`);
        console.log(`  Tokenizer: ${chalk.gray(config.tokenizer)}`);
        
        if (verbose) {
          const profile = MODEL_PROFILES[model];
          if (profile) {
            console.log(`  Default Priorities: ${Object.entries(profile.priorities).map(([k, v]) => `${k}=${v}`).join(', ')}`);
            console.log(`  Default Budget: ${profile.budgetAllocation.total.toLocaleString()} tokens`);
          }
        }
        console.log('');
      });
      
      console.log(`${chalk.blue('💡 Usage Tips:')}`);
      console.log(`  • Use ${chalk.yellow('--target-model <model>')} with search commands`);
      console.log(`  • Set budget with ${chalk.yellow('pampax token budget <amount> --model <model>')}`);
      console.log(`  • View repo profile with ${chalk.yellow('pampax token profile . --model <model>')}`);
      console.log(`  • Get model recommendations with ${chalk.yellow('pampax token count <text> --verbose')}`);
    }
  } catch (error) {
    logger.error('Models listing failed', { error: error.message });
    if (json) {
      console.log(JSON.stringify({
        success: false,
        error: error.message
      }, null, 2));
    } else {
      console.error(chalk.red('❌ Models listing failed:'), error.message);
    }
    process.exit(1);
  }
}

/**
 * Get budget recommendations based on amount and model
 */
function getBudgetRecommendations(budget, model) {
  const recommendations = [];
  const tokenizer = new SimpleTokenizer(model);
  const contextSize = tokenizer.getContextSize();
  const percentageUsed = (budget / contextSize) * 100;

  if (percentageUsed > 90) {
    recommendations.push('⚠️  Budget is very high (>90% of context). Consider reducing for safety.');
  } else if (percentageUsed > 70) {
    recommendations.push('Budget is high (>70% of context). Leave room for conversation history.');
  } else if (percentageUsed < 20) {
    recommendations.push('Budget is low (<20% of context). You may want to increase for better results.');
  } else {
    recommendations.push('Budget looks good for this model.');
  }

  // Model-specific recommendations
  if (model.includes('claude') && budget > 50000) {
    recommendations.push('Claude models handle large contexts well. Consider using more detailed search results.');
  } else if (model.includes('gpt-3.5') && budget > 3000) {
    recommendations.push('GPT-3.5-turbo has limited context. Consider using GPT-4 for larger budgets.');
  }

  return recommendations;
}

/**
 * Configure token command
 */
export function configureTokenCommand(program) {
  const tokenCmd = program
    .command('token')
    .description('Token counting and budget management utilities');

  // Count subcommand
  tokenCmd
    .command('count <text>')
    .description('Count tokens for specific text')
    .option('--model <model>', 'Target model for tokenization', 'default')
    .option('--json', 'Output in JSON format')
    .option('--verbose', 'Verbose output')
    .action(tokenCountCommand);

  // Profile subcommand
  tokenCmd
    .command('profile <repo>')
    .description('Show packing profile for repository')
    .option('--model <model>', 'Target model', 'default')
    .option('--json', 'Output in JSON format')
    .option('--verbose', 'Verbose output')
    .action(tokenProfileCommand);

  // Budget subcommand
  tokenCmd
    .command('budget <amount>')
    .description('Set token budget for session')
    .option('--model <model>', 'Target model', 'default')
    .option('--repo <path>', 'Repository path', '.')
    .option('--json', 'Output in JSON format')
    .action(tokenBudgetCommand);

  // Models subcommand
  tokenCmd
    .command('models')
    .description('List supported models and their token limits')
    .option('--json', 'Output in JSON format')
    .option('--verbose', 'Verbose output')
    .action(tokenModelsCommand);
}