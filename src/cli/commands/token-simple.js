#!/usr/bin/env node

import path from 'path';
import fs from 'fs';
import chalk from 'chalk';

// Simple logger fallback
const logger = {
  error: (message, meta) => console.error(`ERROR: ${message}`, meta || ''),
  info: (message, meta) => console.log(`INFO: ${message}`, meta || ''),
  warn: (message, meta) => console.warn(`WARN: ${message}`, meta || ''),
  debug: (message, meta) => process.env.DEBUG && console.log(`DEBUG: ${message}`, meta || '')
};

/**
 * Simple tokenizer implementation for CLI usage
 */
class SimpleTokenizer {
  constructor(model = 'default') {
    this.model = model;
    this.modelConfigs = {
      'gpt-4': { 
        name: 'GPT-4',
        charsPerToken: 3.5, 
        contextSize: 8192, 
        maxTokens: 8192,
        tokenizer: 'cl100k_base'
      },
      'gpt-4-turbo': { 
        name: 'GPT-4 Turbo',
        charsPerToken: 3.5, 
        contextSize: 128000, 
        maxTokens: 4096,
        tokenizer: 'cl100k_base'
      },
      'gpt-4o': { 
        name: 'GPT-4o',
        charsPerToken: 3.5, 
        contextSize: 128000, 
        maxTokens: 4096,
        tokenizer: 'cl100k_base'
      },
      'gpt-3.5-turbo': { 
        name: 'GPT-3.5 Turbo',
        charsPerToken: 4.0, 
        contextSize: 16384, 
        maxTokens: 4096,
        tokenizer: 'cl100k_base'
      },
      'claude-3': { 
        name: 'Claude 3',
        charsPerToken: 4.0, 
        contextSize: 100000, 
        maxTokens: 4096,
        tokenizer: 'claude'
      },
      'claude-3.5-sonnet': { 
        name: 'Claude 3.5 Sonnet',
        charsPerToken: 4.0, 
        contextSize: 200000, 
        maxTokens: 4096,
        tokenizer: 'claude'
      },
      'claude-3-opus': { 
        name: 'Claude 3 Opus',
        charsPerToken: 4.0, 
        contextSize: 200000, 
        maxTokens: 4096,
        tokenizer: 'claude'
      },
      'claude-3-haiku': { 
        name: 'Claude 3 Haiku',
        charsPerToken: 4.0, 
        contextSize: 200000, 
        maxTokens: 4096,
        tokenizer: 'claude'
      },
      'gemini-pro': { 
        name: 'Gemini Pro',
        charsPerToken: 4.0, 
        contextSize: 32768, 
        maxTokens: 8192,
        tokenizer: 'gemini'
      },
      'llama-2': { 
        name: 'LLaMA 2',
        charsPerToken: 3.8, 
        contextSize: 4096, 
        maxTokens: 4096,
        tokenizer: 'llama'
      },
      'llama-3': { 
        name: 'LLaMA 3',
        charsPerToken: 3.8, 
        contextSize: 8192, 
        maxTokens: 4096,
        tokenizer: 'llama3'
      },
      'mistral': { 
        name: 'Mistral',
        charsPerToken: 3.8, 
        contextSize: 8192, 
        maxTokens: 4096,
        tokenizer: 'mistral'
      },
      'mixtral': { 
        name: 'Mixtral',
        charsPerToken: 3.8, 
        contextSize: 32768, 
        maxTokens: 4096,
        tokenizer: 'mixtral'
      },
      'default': { 
        name: 'Default',
        charsPerToken: 4.0, 
        contextSize: 4096, 
        maxTokens: 4096,
        tokenizer: 'default'
      }
    };
  }

  countTokens(text) {
    if (!text) return 0;
    const config = this.modelConfigs[this.model] || this.modelConfigs.default;
    return Math.ceil(text.length / config.charsPerToken);
  }

  estimateTokens(text) {
    return this.countTokens(text);
  }

  getModel() {
    return this.model;
  }

  getConfig() {
    return { ...this.modelConfigs[this.model] } || { ...this.modelConfigs.default };
  }

  getContextSize() {
    const config = this.modelConfigs[this.model] || this.modelConfigs.default;
    return config.contextSize;
  }

  getMaxTokens() {
    const config = this.modelConfigs[this.model] || this.modelConfigs.default;
    return config.maxTokens;
  }

  getCharsPerToken() {
    const config = this.modelConfigs[this.model] || this.modelConfigs.default;
    return config.charsPerToken;
  }

  getSupportedModels() {
    return Object.keys(this.modelConfigs).filter(model => model !== 'default');
  }

  getAllConfigs() {
    return { ...this.modelConfigs };
  }
}

/**
 * Count tokens for specific text
 */
export async function tokenCountCommand(text, options = {}) {
  const model = options.model || 'default';
  const json = options.json || false;
  const verbose = options.verbose || false;

  try {
    const tokenizer = new SimpleTokenizer(model);
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

    const tokenizer = new SimpleTokenizer(model);
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
      
      // Show recommendations based on budget
      const recommendations = getBudgetRecommendations(budget, model);
      if (recommendations.length > 0) {
        console.log(`\n${chalk.blue('💡 Budget Recommendations:')}`);
        recommendations.forEach(rec => console.log(`  • ${rec}`));
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
    const tokenizer = new SimpleTokenizer();
    const models = tokenizer.getSupportedModels();
    const configs = tokenizer.getAllConfigs();
    
    if (json) {
      console.log(JSON.stringify({
        models: models.map(model => {
          const config = configs[model];
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
        const config = configs[model];
        const recommendedBudget = Math.floor(config.contextSize * 0.7);
        
        console.log(`${chalk.cyan(config.name)} (${model})`);
        console.log(`  Context Size: ${chalk.yellow(config.contextSize.toLocaleString())} tokens`);
        console.log(`  Max Tokens: ${chalk.yellow(config.maxTokens.toLocaleString())} tokens`);
        console.log(`  Chars per Token: ${chalk.yellow(config.charsPerToken)}`);
        console.log(`  Recommended Budget: ${chalk.green(recommendedBudget.toLocaleString())} tokens (${Math.round(0.7 * 100)}%)`);
        console.log(`  Tokenizer: ${chalk.gray(config.tokenizer)}`);
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