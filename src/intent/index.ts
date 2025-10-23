export { IntentClassifier, intentClassifier } from './intent-classifier.js';
export type { IntentType, IntentResult, QueryEntity, IntentClassifierConfig } from './intent-classifier.js';

// Re-export policy gate for convenience
export { PolicyGate, policyGate } from '../policy/policy-gate.js';
export type { PolicyDecision, SearchContext } from '../policy/policy-gate.js';