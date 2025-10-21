/**
 * Parses and manages .cignore files for excluding files from embedding
 */

const fs = require('fs');
const path = require('path');
const { micromatch } = require('micromatch');

class CignoreParser {
  constructor() {
    this.rules = [];
    this.defaultPatterns = [
      '**/.env*',
      '**/*.key',
      '**/*.pem',
      '**/*.p12',
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.git/**',
      '**/.DS_Store',
      '**/Thumbs.db',
      '**/*.log',
      '**/logs/**',
      '**/.vscode/**',
      '**/.idea/**',
      '**/*.swp',
      '**/*.swo'
    ];
    
    this.specialPatterns = {
      // Environment files
      env: ['**/.env*', '**/*.env', '**/config/.env*'],
      
      // Security files
      security: ['**/*.key', '**/*.pem', '**/*.p12', '**/*.crt', '**/*.pfx'],
      
      // Build artifacts
      build: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/target/**'],
      
      // IDE files
      ide: ['**/.vscode/**', '**/.idea/**', '**/*.swp', '**/*.swo'],
      
      // OS files
      os: ['**/.DS_Store', '**/Thumbs.db', '**/desktop.ini'],
      
      // Logs
      logs: ['**/*.log', '**/logs/**', '**/.logs/**'],
      
      // Temporary files
      temp: ['**/*.tmp', '**/*.temp', '**/tmp/**', '**/temp/**']
    };
  }
  
  parse(cignoreContent) {
    const lines = cignoreContent.split('\n');
    const rules = [...this.defaultPatterns];
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      // Skip comments and empty lines
      if (!trimmed || trimmed.startsWith('#')) continue;
      
      // Handle special pattern groups
      if (trimmed.startsWith('@')) {
        const groupName = trimmed.slice(1);
        if (this.specialPatterns[groupName]) {
          rules.push(...this.specialPatterns[groupName].map(pattern => ({
            pattern,
            negate: false,
            raw: trimmed,
            group: groupName
          })));
        }
        continue;
      }
      
      // Handle negation patterns (!pattern)
      if (trimmed.startsWith('!')) {
        rules.push({
          pattern: trimmed.slice(1),
          negate: true,
          raw: trimmed
        });
      } else {
        rules.push({
          pattern: trimmed,
          negate: false,
          raw: trimmed
        });
      }
    }
    
    this.rules = rules;
    return rules;
  }
  
  shouldIgnore(filePath, projectRoot) {
    const relativePath = path.relative(projectRoot, filePath);
    
    for (const rule of this.rules) {
      const matches = this.matchPattern(rule.pattern, relativePath);
      
      if (matches && !rule.negate) {
        return true; // File should be ignored
      }
      
      if (matches && rule.negate) {
        return false; // File explicitly included
      }
    }
    
    return false; // Not matched by any rule
  }
  
  matchPattern(pattern, filePath) {
    // Use micromatch for robust glob pattern matching
    return micromatch.isMatch(filePath, pattern);
  }
  
  loadFromFile(projectPath) {
    const cignorePath = path.join(projectPath, '.cignore');
    
    if (fs.existsSync(cignorePath)) {
      const content = fs.readFileSync(cignorePath, 'utf8');
      this.parse(content);
    } else {
      this.parse(''); // Use default patterns only
    }
  }
  
  getRules() {
    return [...this.rules];
  }
  
  getStats() {
    const stats = {
      totalRules: this.rules.length,
      negationRules: this.rules.filter(r => r.negate).length,
      groupRules: this.rules.filter(r => r.group).length,
      groups: {}
    };
    
    // Count rules by group
    for (const rule of this.rules) {
      if (rule.group) {
        stats.groups[rule.group] = (stats.groups[rule.group] || 0) + 1;
      }
    }
    
    return stats;
  }
}

module.exports = CignoreParser;