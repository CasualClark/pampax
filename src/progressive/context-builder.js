/**
 * Main progressive context building logic
 */

const { formatAtLevel, DETAIL_LEVELS } = require('./detail-levels');
const { fitToBudget, countTokensInObject } = require('./token-counter');
const CacheManager = require('./cache-manager');

class ProgressiveContextBuilder {
  constructor(vectorStore) {
    this.vectorStore = vectorStore;
    this.cache = new CacheManager();
  }
  
  /**
   * Build context at specified detail level
   */
  async buildContext(options) {
    const {
      query,
      detail_level = 'implementation',
      token_budget = 4000,
      specific_files = [],
      include_related = true,
      session_id = null
    } = options;
    
    // Validate detail level
    if (!DETAIL_LEVELS[detail_level]) {
      throw new Error(`Invalid detail_level: ${detail_level}. Must be one of: outline, signatures, implementation, full`);
    }
    
    // Check cache for this session
    const cacheKey = this.cache.buildKey(query, detail_level, specific_files);
    const cached = session_id ? this.cache.get(session_id, cacheKey) : null;
    
    if (cached) {
      return {
        ...cached,
        _cached: true
      };
    }
    
    // Step 1: Search for relevant files
    let relevantFiles = [];
    
    if (specific_files.length > 0) {
      // User specified exact files
      relevantFiles = await this.getFilesByPath(specific_files);
    } else {
      // Search based on query
      const searchResults = await this.vectorStore.search(query, {
        limit: this.calculateSearchLimit(detail_level),
        threshold: 0.3
      });
      relevantFiles = searchResults;
    }
    
    // Step 2: Expand with related files if requested
    if (include_related && detail_level !== 'outline') {
      relevantFiles = await this.expandWithRelated(relevantFiles);
    }
    
    // Step 3: Format at requested detail level
    const formatted = relevantFiles.map(file => 
      formatAtLevel(file, detail_level)
    );
    
    // Step 4: Fit to token budget
    const { results, tokenReport } = fitToBudget(formatted, token_budget);
    
    // Step 5: Build response
    const response = {
      query,
      detail_level,
      files_found: relevantFiles.length,
      files_included: results.length,
      results,
      token_usage: tokenReport,
      next_steps: this.suggestNextSteps(detail_level, tokenReport, results)
    };
    
    // Cache for this session
    if (session_id) {
      this.cache.set(session_id, cacheKey, response);
    }
    
    return response;
  }
  
  calculateSearchLimit(detailLevel) {
    // Fetch more files for lower detail levels (they're cheaper)
    const limits = {
      outline: 50,
      signatures: 20,
      implementation: 10,
      full: 5
    };
    return limits[detailLevel] || 10;
  }
  
  async expandWithRelated(files) {
    const related = new Set(files);
    
    for (const file of files) {
      // Add imported files
      if (file.imports) {
        for (const importPath of file.imports) {
          const imported = await this.resolveImport(importPath, file.path);
          if (imported) related.add(imported);
        }
      }
    }
    
    return Array.from(related);
  }
  
  async resolveImport(importPath, fromFile) {
    // Try to resolve relative imports to actual files
    // This is simplified - you'd want proper path resolution
    try {
      const resolved = await this.vectorStore.getFileByPath(importPath);
      return resolved;
    } catch (err) {
      return null;
    }
  }
  
  async getFilesByPath(paths) {
    const files = [];
    for (const path of paths) {
      try {
        const file = await this.vectorStore.getFileByPath(path);
        if (file) files.push(file);
      } catch (err) {
        console.warn(`Could not load file: ${path}`);
      }
    }
    return files;
  }
  
  suggestNextSteps(currentLevel, tokenReport, results) {
    const suggestions = [];
    
    // Suggest going deeper if budget allows
    const levelOrder = ['outline', 'signatures', 'implementation', 'full'];
    const currentIndex = levelOrder.indexOf(currentLevel);
    
    if (currentIndex < levelOrder.length - 1) {
      const nextLevel = levelOrder[currentIndex + 1];
      const avgTokensNeeded = DETAIL_LEVELS[nextLevel].avgTokensPerFile * results.length;
      
      if (avgTokensNeeded < tokenReport.budget) {
        suggestions.push({
          action: 'increase_detail',
          detail_level: nextLevel,
          reason: `Budget allows for more detail (${avgTokensNeeded} tokens estimated)`
        });
      }
    }
    
    // Suggest specific files if too many results
    if (results.length > 5 && currentLevel === 'outline') {
      suggestions.push({
        action: 'specify_files',
        reason: `${results.length} files found. Consider requesting specific files for more detail`,
        example_files: results.slice(0, 3).map(r => r.file)
      });
    }
    
    // Suggest related files if we found key imports
    const hasImports = results.some(r => r.imports && r.imports.length > 0);
    if (hasImports && !suggestions.some(s => s.action === 'increase_detail')) {
      suggestions.push({
        action: 'explore_related',
        reason: 'Found imported dependencies that might be relevant'
      });
    }
    
    return suggestions.length > 0 ? suggestions : null;
  }
}

module.exports = ProgressiveContextBuilder;