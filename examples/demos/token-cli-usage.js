#!/usr/bin/env node

/**
 * Examples demonstrating the new token CLI integration
 * 
 * Run these examples to see the token budgeting system in action:
 * 
 * node examples/token-cli-usage.js
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PAMPAX_CLI = path.join(__dirname, '..', 'src', 'cli-new.js');

/**
 * Run a pampax command and capture output
 */
function runCommand(args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [PAMPAX_CLI, ...args], {
      stdio: options.silent ? 'pipe' : 'inherit',
      cwd: options.cwd || process.cwd()
    });

    let stdout = '';
    let stderr = '';

    if (options.silent) {
      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });
    }

    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr, code });
      } else {
        reject(new Error(`Command failed with code ${code}: ${stderr}`));
      }
    });

    child.on('error', reject);
  });
}

/**
 * Example 1: Token counting for different models
 */
async function exampleTokenCounting() {
  console.log('\n🔢 Example 1: Token Counting\n');
  
  const sampleCode = `
function getUserById(id) {
  return users.find(user => user.id === id);
}

class UserService {
  constructor(database) {
    this.db = database;
  }
  
  async createUser(userData) {
    const user = { id: generateId(), ...userData, createdAt: new Date() };
    await this.db.users.insert(user);
    return user;
  }
}
`;

  const models = ['gpt-4', 'gpt-3.5-turbo', 'claude-3'];
  
  for (const model of models) {
    console.log(`\n--- Counting tokens for ${model} ---`);
    try {
      await runCommand(['token', 'count', sampleCode, '--model', model]);
    } catch (error) {
      console.error('Error:', error.message);
    }
  }
}

/**
 * Example 2: Show supported models
 */
async function exampleModelListing() {
  console.log('\n📋 Example 2: Supported Models\n');
  
  try {
    await runCommand(['token', 'models', '--verbose']);
  } catch (error) {
    console.error('Error:', error.message);
  }
}

/**
 * Example 3: Set token budget
 */
async function exampleBudgetSetting() {
  console.log('\n💰 Example 3: Setting Token Budget\n');
  
  try {
    await runCommand(['token', 'budget', '3000', '--model', 'gpt-4']);
  } catch (error) {
    console.error('Error:', error.message);
  }
}

/**
 * Example 4: Search with token reporting
 */
async function exampleSearchWithTokenReport() {
  console.log('\n🔍 Example 4: Search with Token Reporting\n');
  
  try {
    // First try a search with token report
    await runCommand([
      'search', 'database connection',
      '--target-model', 'gpt-4',
      '--token-report',
      '--limit', '5',
      '--json'
    ], { silent: true }).then(result => {
      try {
        const output = JSON.parse(result.stdout);
        console.log('Search Results Summary:');
        console.log(`- Found ${output.totalResults} results`);
        if (output.tokenReport) {
          console.log(`- Token Usage: ${output.tokenReport.actual}/${output.tokenReport.budget} (${output.tokenReport.usagePercentage}%)`);
          console.log(`- Model: ${output.tokenReport.model}`);
          console.log(`- Average tokens per result: ${output.tokenReport.averageTokensPerResult}`);
        }
      } catch (parseError) {
        console.log('Raw output:', result.stdout);
      }
    });
  } catch (error) {
    console.error('Error:', error.message);
  }
}

/**
 * Example 5: Repository profile
 */
async function exampleRepositoryProfile() {
  console.log('\n📊 Example 5: Repository Profile\n');
  
  try {
    await runCommand(['token', 'profile', '.', '--model', 'gpt-4', '--verbose']);
  } catch (error) {
    console.error('Error:', error.message);
  }
}

/**
 * Example 6: Model recommendations
 */
async function exampleModelRecommendations() {
  console.log('\n🎯 Example 6: Model Recommendations\n');
  
  const sampleText = `
// A comprehensive user authentication system with JWT tokens
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const User = require('../models/User');

class AuthService {
  constructor(secretKey, expiresIn = '24h') {
    this.secretKey = secretKey;
    this.expiresIn = expiresIn;
  }

  async register(userData) {
    const { email, password, ...profile } = userData;
    
    // Check if user already exists
    const existingUser = await User.findByEmail(email);
    if (existingUser) {
      throw new Error('User already exists');
    }

    // Hash password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Create user
    const user = await User.create({
      email,
      password: hashedPassword,
      profile,
      createdAt: new Date(),
      isActive: true
    });

    // Generate JWT token
    const token = this.generateToken(user.id, user.email);
    
    return {
      user: {
        id: user.id,
        email: user.email,
        profile: user.profile
      },
      token
    };
  }

  async login(email, password) {
    const user = await User.findByEmail(email);
    if (!user) {
      throw new Error('Invalid credentials');
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      throw new Error('Invalid credentials');
    }

    if (!user.isActive) {
      throw new Error('Account is deactivated');
    }

    const token = this.generateToken(user.id, user.email);
    
    return {
      user: {
        id: user.id,
        email: user.email,
        profile: user.profile
      },
      token
    };
  }

  generateToken(userId, email) {
    return jwt.sign(
      { userId, email },
      this.secretKey,
      { expiresIn: this.expiresIn }
    );
  }

  verifyToken(token) {
    try {
      return jwt.verify(token, this.secretKey);
    } catch (error) {
      throw new Error('Invalid token');
    }
  }

  async refreshToken(oldToken) {
    try {
      const decoded = this.verifyToken(oldToken);
      const user = await User.findById(decoded.userId);
      
      if (!user || !user.isActive) {
        throw new Error('User not found or inactive');
      }

      const newToken = this.generateToken(user.id, user.email);
      return { token: newToken };
    } catch (error) {
      throw new Error('Token refresh failed');
    }
  }
}

module.exports = AuthService;
`;

  try {
    await runCommand(['token', 'count', sampleText, '--model', 'gpt-4', '--verbose']);
  } catch (error) {
    console.error('Error:', error.message);
  }
}

/**
 * Run all examples
 */
async function runAllExamples() {
  console.log('🚀 PAMPAX Token CLI Integration Examples\n');
  console.log('This demo showcases the new token budgeting system features.\n');

  try {
    await exampleTokenCounting();
    await exampleModelListing();
    await exampleBudgetSetting();
    await exampleRepositoryProfile();
    await exampleModelRecommendations();
    
    // Note: Search examples require indexed data
    console.log('\n🔍 Example 4: Search with Token Reporting');
    console.log('Note: This requires an indexed repository. Run "pampax index ." first to try search examples.');
    
  } catch (error) {
    console.error('Example failed:', error.message);
  }

  console.log('\n✅ Examples completed!');
  console.log('\nTry these commands yourself:');
  console.log('  pampax token count "your code here" --model gpt-4');
  console.log('  pampax token models');
  console.log('  pampax token budget 5000 --model claude-3');
  console.log('  pampax search "database" --target-model gpt-4 --token-report');
  console.log('  pampax token profile . --model gpt-3.5-turbo');
}

// Run examples if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllExamples().catch(console.error);
}

export {
  exampleTokenCounting,
  exampleModelListing,
  exampleBudgetSetting,
  exampleSearchWithTokenReport,
  exampleRepositoryProfile,
  exampleModelRecommendations,
  runAllExamples
};