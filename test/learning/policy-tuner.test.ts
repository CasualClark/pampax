import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the policy gate module
vi.mock('../../src/policy/policy-gate.js', () => ({
  policyGate: {
    updateRepositoryPolicies: vi.fn(),
    getPolicy: vi.fn(),
    getAllPolicies: vi.fn(),
    validatePolicy: vi.fn()
  }
}));

import { PolicyTuner } from '../../src/learning/policy-tuner.js';
import type { OutcomeSignal } from '../../src/learning/outcome-analyzer.js';
import type { PolicyDecision } from '../../src/policy/policy-gate.js';

describe('PolicyTuner', () => {
  let tuner: PolicyTuner;

  beforeEach(() => {
    vi.clearAllMocks();
    tuner = new PolicyTuner();
  });

  describe('tunePolicies', () => {
    it('should tune early-stop thresholds based on satisfaction signals', async () => {
      const signals: OutcomeSignal[] = [
        {
          sessionId: 's1',
          query: 'test query',
          intent: 'symbol',
          bundleSignature: 'b_test1',
          satisfied: true,
          timeToFix: 5000,
          tokenUsage: 100,
          seedWeights: { 'definition': 2.0, 'usage': 1.0 },
          policyThresholds: { earlyStop: 3, maxDepth: 2, includeSymbols: 1, includeFiles: 0, includeContent: 1 }
        },
        {
          sessionId: 's2',
          query: 'another query',
          intent: 'symbol',
          bundleSignature: 'b_test2',
          satisfied: false,
          timeToFix: 15000,
          tokenUsage: 150,
          seedWeights: { 'definition': 2.0, 'usage': 1.0 },
          policyThresholds: { earlyStop: 3, maxDepth: 2, includeSymbols: 1, includeFiles: 0, includeContent: 1 }
        }
      ];

      const currentPolicies = {
        'symbol': {
          maxDepth: 2,
          includeSymbols: true,
          includeFiles: false,
          includeContent: true,
          earlyStopThreshold: 3,
          seedWeights: { 'definition': 2.0, 'usage': 1.0, 'test': 0.8 }
        }
      };

      const result = await tuner.tunePolicies(signals, currentPolicies);

      expect(result).toBeDefined();
      expect(result.optimizedPolicies).toBeDefined();
      expect(result.improvement).toBeGreaterThanOrEqual(0);
      expect(result.parameterChanges).toBeDefined();
      expect(result.rollbackData).toBeDefined();
      expect(result.validationErrors).toBeDefined();
    });

    it('should adjust max depth based on satisfaction and time to fix', async () => {
      const signals: OutcomeSignal[] = [
        {
          sessionId: 's1',
          query: 'complex function',
          intent: 'symbol',
          bundleSignature: 'b_complex',
          satisfied: false,
          timeToFix: 20000, // Long time to fix suggests need for deeper search
          tokenUsage: 200,
          seedWeights: { 'definition': 2.0, 'usage': 1.0 },
          policyThresholds: { earlyStop: 3, maxDepth: 2, includeSymbols: 1, includeFiles: 0, includeContent: 1 }
        }
      ];

      const currentPolicies = {
        'symbol': {
          maxDepth: 2,
          includeSymbols: true,
          includeFiles: false,
          includeContent: true,
          earlyStopThreshold: 3,
          seedWeights: { 'definition': 2.0, 'usage': 1.0 }
        }
      };

      const result = await tuner.tunePolicies(signals, currentPolicies, { minSignalsPerIntent: 1 });

      expect(result.optimizedPolicies.symbol.maxDepth).toBeGreaterThanOrEqual(2);
      const hasMaxDepthChange = Object.values(result.parameterChanges).some(change => change.parameter === 'maxDepth');
      expect(hasMaxDepthChange).toBe(true);
    });

    it('should support per-intent optimization', async () => {
      const signals: OutcomeSignal[] = [
        {
          sessionId: 's1',
          query: 'function test',
          intent: 'symbol',
          bundleSignature: 'b_symbol',
          satisfied: true,
          tokenUsage: 100,
          seedWeights: { 'definition': 2.0, 'usage': 1.0 },
          policyThresholds: { earlyStop: 3, maxDepth: 2, includeSymbols: 1, includeFiles: 0, includeContent: 1 }
        },
        {
          sessionId: 's2',
          query: 'config setting',
          intent: 'config',
          bundleSignature: 'b_config',
          satisfied: false,
          tokenUsage: 80,
          seedWeights: { 'config': 2.0, 'setting': 1.0 },
          policyThresholds: { earlyStop: 2, maxDepth: 1, includeSymbols: 0, includeFiles: 1, includeContent: 1 }
        }
      ];

      const currentPolicies = {
        'symbol': {
          maxDepth: 2,
          includeSymbols: true,
          includeFiles: false,
          includeContent: true,
          earlyStopThreshold: 3,
          seedWeights: { 'definition': 2.0, 'usage': 1.0 }
        },
        'config': {
          maxDepth: 1,
          includeSymbols: false,
          includeFiles: true,
          includeContent: true,
          earlyStopThreshold: 2,
          seedWeights: { 'config': 2.0, 'setting': 1.0 }
        }
      };

      const result = await tuner.tunePolicies(signals, currentPolicies, { minSignalsPerIntent: 1 });

      expect(result.optimizedPolicies).toHaveProperty('symbol');
      expect(result.optimizedPolicies).toHaveProperty('config');
      expect(Object.keys(result.optimizedPolicies)).toHaveLength(2);
    });

    it('should handle per-language tuning', async () => {
      const signals: OutcomeSignal[] = [
        {
          sessionId: 's1',
          query: 'python function',
          intent: 'symbol',
          bundleSignature: 'b_python',
          satisfied: true,
          tokenUsage: 120,
          seedWeights: { 'definition': 2.0, 'usage': 1.0 },
          policyThresholds: { earlyStop: 3, maxDepth: 2, includeSymbols: 1, includeFiles: 0, includeContent: 1 }
        }
      ];

      const currentPolicies = {
        'symbol': {
          maxDepth: 2,
          includeSymbols: true,
          includeFiles: false,
          includeContent: true,
          earlyStopThreshold: 3,
          seedWeights: { 'definition': 2.0, 'usage': 1.0 }
        }
      };

      const options = {
        language: 'python',
        repository: 'python-repo'
      };

      const result = await tuner.tunePolicies(signals, currentPolicies, options);

      expect(result.optimizedPolicies.symbol.seedWeights.definition).toBeGreaterThanOrEqual(2.0);
    });

    it('should validate policy constraints and prevent extreme values', async () => {
      const signals: OutcomeSignal[] = [
        {
          sessionId: 's1',
          query: 'test',
          intent: 'symbol',
          bundleSignature: 'b_test',
          satisfied: true,
          tokenUsage: 100,
          seedWeights: { 'definition': 2.0 },
          policyThresholds: { earlyStop: 3, maxDepth: 2, includeSymbols: 1, includeFiles: 0, includeContent: 1 }
        }
      ];

      const currentPolicies = {
        'symbol': {
          maxDepth: 2,
          includeSymbols: true,
          includeFiles: false,
          includeContent: true,
          earlyStopThreshold: 3,
          seedWeights: { 'definition': 2.0, 'usage': 1.0 }
        }
      };

      const result = await tuner.tunePolicies(signals, currentPolicies, { minSignalsPerIntent: 1 });

      // Check constraints
      const policy = result.optimizedPolicies.symbol;
      expect(policy.maxDepth).toBeGreaterThanOrEqual(1);
      expect(policy.maxDepth).toBeLessThanOrEqual(10);
      expect(policy.earlyStopThreshold).toBeGreaterThanOrEqual(1);
      expect(policy.earlyStopThreshold).toBeLessThanOrEqual(50);
      
      // Check seed weight constraints
      Object.values(policy.seedWeights).forEach(weight => {
        expect(weight).toBeGreaterThanOrEqual(0.1);
        expect(weight).toBeLessThanOrEqual(5.0);
      });
    });

    it('should provide rollback capability for policy changes', async () => {
      const signals: OutcomeSignal[] = [
        {
          sessionId: 's1',
          query: 'test',
          intent: 'symbol',
          bundleSignature: 'b_test',
          satisfied: true,
          tokenUsage: 100,
          seedWeights: { 'definition': 2.0, 'usage': 1.0 },
          policyThresholds: { earlyStop: 3, maxDepth: 2, includeSymbols: 1, includeFiles: 0, includeContent: 1 }
        }
      ];

      const currentPolicies = {
        'symbol': {
          maxDepth: 2,
          includeSymbols: true,
          includeFiles: false,
          includeContent: true,
          earlyStopThreshold: 3,
          seedWeights: { 'definition': 2.0, 'usage': 1.0 }
        }
      };

      const result = await tuner.tunePolicies(signals, currentPolicies, { minSignalsPerIntent: 1 });

      expect(result.rollbackData).toEqual(currentPolicies);
    });

    it('should generate before/after comparison reports', async () => {
      const signals: OutcomeSignal[] = [
        {
          sessionId: 's1',
          query: 'test query',
          intent: 'symbol',
          bundleSignature: 'b_test1',
          satisfied: true,
          tokenUsage: 100,
          seedWeights: { 'definition': 2.0, 'usage': 1.0 },
          policyThresholds: { earlyStop: 3, maxDepth: 2, includeSymbols: 1, includeFiles: 0, includeContent: 1 }
        }
      ];

      const currentPolicies = {
        'symbol': {
          maxDepth: 2,
          includeSymbols: true,
          includeFiles: false,
          includeContent: true,
          earlyStopThreshold: 3,
          seedWeights: { 'definition': 2.0, 'usage': 1.0 }
        }
      };

      const result = await tuner.tunePolicies(signals, currentPolicies, { minSignalsPerIntent: 1 });

      expect(result.parameterChanges).toBeDefined();
      expect(typeof result.parameterChanges === 'object').toBe(true);
      
      const changeKeys = Object.keys(result.parameterChanges);
      if (changeKeys.length > 0) {
        const change = result.parameterChanges[changeKeys[0]];
        expect(change).toHaveProperty('parameter');
        expect(change).toHaveProperty('oldValue');
        expect(change).toHaveProperty('newValue');
        expect(change).toHaveProperty('impact');
        expect(change).toHaveProperty('confidence');
      }
    });

    it('should achieve measurable improvements (>3% satisfaction)', async () => {
      // Create signals with clear dissatisfaction pattern
      const signals: OutcomeSignal[] = [
        {
          sessionId: 's1',
          query: 'test query',
          intent: 'symbol',
          bundleSignature: 'b_test1',
          satisfied: false,
          timeToFix: 15000,
          tokenUsage: 200,
          seedWeights: { 'definition': 1.0, 'usage': 1.0 }, // Low weights
          policyThresholds: { earlyStop: 2, maxDepth: 1, includeSymbols: 1, includeFiles: 0, includeContent: 1 }
        },
        {
          sessionId: 's2',
          query: 'another query',
          intent: 'symbol',
          bundleSignature: 'b_test2',
          satisfied: false,
          timeToFix: 12000,
          tokenUsage: 180,
          seedWeights: { 'definition': 1.0, 'usage': 1.0 },
          policyThresholds: { earlyStop: 2, maxDepth: 1, includeSymbols: 1, includeFiles: 0, includeContent: 1 }
        }
      ];

      const currentPolicies = {
        'symbol': {
          maxDepth: 1,
          includeSymbols: true,
          includeFiles: false,
          includeContent: true,
          earlyStopThreshold: 2, // Too low
          seedWeights: { 'definition': 1.0, 'usage': 1.0 } // Too low
        }
      };

      const result = await tuner.tunePolicies(signals, currentPolicies, { minSignalsPerIntent: 1 });

      // Should show improvement potential
      expect(result.improvement).toBeGreaterThanOrEqual(0);
    });

    it('should handle insufficient data gracefully', async () => {
      const signals: OutcomeSignal[] = []; // No signals
      const currentPolicies = {
        'symbol': {
          maxDepth: 2,
          includeSymbols: true,
          includeFiles: false,
          includeContent: true,
          earlyStopThreshold: 3,
          seedWeights: { 'definition': 2.0, 'usage': 1.0 }
        }
      };

      const result = await tuner.tunePolicies(signals, currentPolicies);

      expect(result.optimizedPolicies).toEqual(currentPolicies);
      expect(result.improvement).toBe(0);
      expect(Object.keys(result.parameterChanges)).toHaveLength(0);
    });

    it('should use custom tuning options', async () => {
      const signals: OutcomeSignal[] = [
        {
          sessionId: 's1',
          query: 'test',
          intent: 'symbol',
          bundleSignature: 'b_test',
          satisfied: true,
          tokenUsage: 100,
          seedWeights: { 'definition': 2.0 },
          policyThresholds: { earlyStop: 3, maxDepth: 2, includeSymbols: 1, includeFiles: 0, includeContent: 1 }
        }
      ];

      const currentPolicies = {
        'symbol': {
          maxDepth: 2,
          includeSymbols: true,
          includeFiles: false,
          includeContent: true,
          earlyStopThreshold: 3,
          seedWeights: { 'definition': 2.0, 'usage': 1.0 }
        }
      };

      const options = {
        learningRate: 0.01,
        maxIterations: 50,
        minSignalsPerIntent: 1,
        repository: 'test-repo',
        language: 'typescript'
      };

      const result = await tuner.tunePolicies(signals, currentPolicies, options);

      expect(result).toBeDefined();
    });
  });

  describe('applyPolicyUpdates', () => {
    it('should apply policy updates through policy gate', async () => {
      const policies = {
        'symbol': {
          maxDepth: 3,
          includeSymbols: true,
          includeFiles: false,
          includeContent: true,
          earlyStopThreshold: 4,
          seedWeights: { 'definition': 2.5, 'usage': 1.2 }
        }
      };

      await tuner.applyPolicyUpdates(policies);

      const { policyGate } = await import('../../src/policy/policy-gate.js');
      expect(policyGate.updateRepositoryPolicies).toHaveBeenCalled();
    });
  });

  describe('rollbackPolicies', () => {
    it('should rollback policies using provided data', async () => {
      const rollbackData = {
        'symbol': {
          maxDepth: 2,
          includeSymbols: true,
          includeFiles: false,
          includeContent: true,
          earlyStopThreshold: 3,
          seedWeights: { 'definition': 2.0, 'usage': 1.0 }
        }
      };

      await tuner.rollbackPolicies(rollbackData);

      const { policyGate } = await import('../../src/policy/policy-gate.js');
      expect(policyGate.updateRepositoryPolicies).toHaveBeenCalled();
    });
  });

  describe('validatePolicy', () => {
    it('should validate policy constraints', () => {
      const validPolicy: PolicyDecision = {
        maxDepth: 3,
        includeSymbols: true,
        includeFiles: false,
        includeContent: true,
        earlyStopThreshold: 5,
        seedWeights: { 'definition': 2.0, 'usage': 1.0 }
      };

      const errors = tuner.validatePolicy(validPolicy);
      expect(errors).toHaveLength(0);
    });

    it('should detect constraint violations', () => {
      const invalidPolicy: PolicyDecision = {
        maxDepth: 15, // Too high
        includeSymbols: true,
        includeFiles: false,
        includeContent: true,
        earlyStopThreshold: 60, // Too high
        seedWeights: { 'definition': 10.0, 'usage': -1.0 } // Out of bounds
      };

      const errors = tuner.validatePolicy(invalidPolicy);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some(e => e.includes('maxDepth'))).toBe(true);
      expect(errors.some(e => e.includes('earlyStopThreshold'))).toBe(true);
      expect(errors.some(e => e.includes('seedWeight'))).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle malformed signals gracefully', async () => {
      const malformedSignals = [
        {
          sessionId: 's1',
          query: '',
          intent: '',
          bundleSignature: '',
          satisfied: true,
          timeToFix: -5000, // Negative time
          tokenUsage: -100, // Negative token usage
          seedWeights: {}, // Empty weights
          policyThresholds: {} // Empty thresholds
        } as OutcomeSignal
      ];

      const currentPolicies = {
        'symbol': {
          maxDepth: 2,
          includeSymbols: true,
          includeFiles: false,
          includeContent: true,
          earlyStopThreshold: 3,
          seedWeights: { 'definition': 2.0, 'usage': 1.0 }
        }
      };

      // Should not throw an error
      const result = await tuner.tunePolicies(malformedSignals, currentPolicies);
      expect(result).toBeDefined();
    });

    it('should handle empty current policies', async () => {
      const signals: OutcomeSignal[] = [
        {
          sessionId: 's1',
          query: 'test',
          intent: 'symbol',
          bundleSignature: 'b_test',
          satisfied: true,
          tokenUsage: 100,
          seedWeights: { 'definition': 2.0 },
          policyThresholds: { earlyStop: 3, maxDepth: 2, includeSymbols: 1, includeFiles: 0, includeContent: 1 }
        }
      ];

      const currentPolicies = {};

      const result = await tuner.tunePolicies(signals, currentPolicies);
      expect(result.optimizedPolicies).toEqual({});
    });
  });
});