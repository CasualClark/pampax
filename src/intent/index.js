/**
 * Stub intent classifier for Phase 5 development
 * This will be replaced by the full implementation when available
 */

export const intentClassifier = {
  classify(query) {
    // Simple keyword-based classification for now
    const lowerQuery = query.toLowerCase();
    
    if (lowerQuery.includes('function') || lowerQuery.includes('method') || lowerQuery.includes('class')) {
      return {
        intent: 'symbol',
        confidence: 0.7,
        entities: [],
        suggestedPolicies: ['symbol-aware']
      };
    }
    
    if (lowerQuery.includes('config') || lowerQuery.includes('setting')) {
      return {
        intent: 'config',
        confidence: 0.8,
        entities: [],
        suggestedPolicies: ['config-context']
      };
    }
    
    if (lowerQuery.includes('api') || lowerQuery.includes('endpoint') || lowerQuery.includes('route')) {
      return {
        intent: 'api',
        confidence: 0.6,
        entities: [],
        suggestedPolicies: ['api-context']
      };
    }
    
    if (lowerQuery.includes('error') || lowerQuery.includes('bug') || lowerQuery.includes('issue')) {
      return {
        intent: 'incident',
        confidence: 0.7,
        entities: [],
        suggestedPolicies: ['incident-callers-diffs']
      };
    }
    
    // Default to search
    return {
      intent: 'search',
      confidence: 0.5,
      entities: [],
      suggestedPolicies: ['default']
    };
  }
};