/**
 * Estimates and tracks token usage for progressive context
 */

// Simple token estimation (you can replace with tiktoken for accuracy)
function estimateTokens(text) {
  if (!text) return 0;
  
  // Rough estimate: 1 token ≈ 3 characters for code
  // More conservative than prose (which is ~4 chars = 0.75 tokens)
  return Math.ceil(text.length / 3);
}

function countTokensInObject(obj) {
  const json = JSON.stringify(obj, null, 2);
  return estimateTokens(json);
}

class TokenBudgetTracker {
  constructor(budget = 4000) {
    this.budget = budget;
    this.used = 0;
    this.items = [];
  }
  
  addItem(item, tokens) {
    this.used += tokens;
    this.items.push({ item, tokens });
    return this.remaining();
  }
  
  remaining() {
    return Math.max(0, this.budget - this.used);
  }
  
  canFit(tokens) {
    return this.used + tokens <= this.budget;
  }
  
  getReport() {
    return {
      budget: this.budget,
      used: this.used,
      remaining: this.remaining(),
      percentage: Math.round((this.used / this.budget) * 100),
      items: this.items.length
    };
  }
}

/**
 * Fit results to token budget by trimming less relevant items
 */
function fitToBudget(results, budget) {
  const tracker = new TokenBudgetTracker(budget);
  const fitted = [];
  
  // Sort by relevance score (highest first)
  const sorted = [...results].sort((a, b) => (b.score || 0) - (a.score || 0));
  
  for (const result of sorted) {
    const tokens = countTokensInObject(result);
    
    if (tracker.canFit(tokens)) {
      tracker.addItem(result, tokens);
      fitted.push({
        ...result,
        _tokens: tokens
      });
    } else {
      // Try to include at least file path and summary
      const minimal = {
        file: result.file,
        summary: `(truncated - ${tokens} tokens, budget exceeded)`,
        score: result.score
      };
      const minimalTokens = countTokensInObject(minimal);
      
      if (tracker.canFit(minimalTokens)) {
        tracker.addItem(minimal, minimalTokens);
        fitted.push({
          ...minimal,
          _tokens: minimalTokens,
          _truncated: true
        });
      }
      break; // Budget exhausted
    }
  }
  
  return {
    results: fitted,
    tokenReport: tracker.getReport()
  };
}

module.exports = {
  estimateTokens,
  countTokensInObject,
  TokenBudgetTracker,
  fitToBudget
};