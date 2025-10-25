import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WeightOptimizer } from '../../src/learning/weight-optimizer.js';
import type { OutcomeSignal } from '../../src/learning/outcome-analyzer.js';
import { policyGate } from '../../src/policy/policy-gate.js';

describe('WeightOptimizer', () => {
  let optimizer: WeightOptimizer;
  let mockPolicyGate: any;

  beforeEach(() => {
    // Mock policyGate to avoid actual policy evaluation
    mockPolicyGate = {
      updateRepositoryPolicies: vi.fn(),
      getPolicy: vi.fn(),
      getAllPolicies: vi.fn()
    };
    
    // Replace the imported policyGate with our mock
    vi.mock('../../policy/policy-gate.js', () => ({
      policyGate: mockPolicyGate
    }));

    optimizer = new WeightOptimizer();
  });

  describe('optimizeWeights', () => {
    it('should optimize weights based on satisfaction signals', async () => {
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
        },
        {
          sessionId: 's2',
          query: 'another query',
          intent: 'symbol',
          bundleSignature: 'b_test2',
          satisfied: false,
          tokenUsage: 150,
          seedWeights: { 'definition': 2.0, 'usage': 1.0 },
          policyThresholds: { earlyStop: 3, maxDepth: 2, includeSymbols: 1, includeFiles: 0, includeContent: 1 }
        }
      ];

      const currentWeights = {
        'symbol': { 'definition': 2.0, 'usage': 1.0, 'test': 0.8 }
      };

      const result = await optimizer.optimizeWeights(signals, currentWeights);

      expect(result).toBeDefined();
      expect(result.optimizedWeights).toBeDefined();
      expect(result.improvement).toBeGreaterThanOrEqual(0);
      expect(result.convergence).toBeDefined();
      expect(result.iterations).toBeGreaterThan(0);
      expect(result.rollbackData).toBeDefined();
    });

    it('should maintain weight constraints (0.1 to 5.0)', async () => {
      const signals: OutcomeSignal[] = [
        {
          sessionId: 's1',
          query: 'test',
          intent: 'symbol',
          bundleSignature: 'b_test',
          satisfied: true,
          tokenUsage: 100,
          seedWeights: { 'definition': 5.0, 'usage': 0.1 },
          policyThresholds: { earlyStop: 3, maxDepth: 2, includeSymbols: 1, includeFiles: 0, includeContent: 1 }
        }
      ];

      const currentWeights = {
        'symbol': { 'definition': 5.0, 'usage': 0.1 }
      };

      const result = await optimizer.optimizeWeights(signals, currentWeights);

      // Check that all weights remain within constraints
      const optimizedWeights = result.optimizedWeights;
      if (optimizedWeights.symbol) {
        Object.values(optimizedWeights.symbol).forEach(weight => {
          expect(weight).toBeGreaterThanOrEqual(0.1);
          expect(weight).toBeLessThanOrEqual(5.0);
        });
      }
    });

    it('should handle insufficient data gracefully', async () => {
      const signals: OutcomeSignal[] = []; // No signals
      const currentWeights = {
        'symbol': { 'definition': 2.0, 'usage': 1.0 }
      };

      const result = await optimizer.optimizeWeights(signals, currentWeights);

      expect(result.optimizedWeights).toEqual(currentWeights);
      expect(result.improvement).toBe(0);
      expect(result.convergence).toBe(true);
    });

    it('should converge within reasonable iterations', async () => {
      const signals: OutcomeSignal[] = Array.from({ length: 50 }, (_, i) => ({
        sessionId: `s${i}`,
        query: `query ${i}`,
        intent: 'symbol',
        bundleSignature: `b_test${i}`,
        satisfied: i % 3 !== 0, // 67% satisfaction rate
        tokenUsage: 100 + i * 10,
        seedWeights: { 'definition': 2.0, 'usage': 1.0 },
        policyThresholds: { earlyStop: 3, maxDepth: 2, includeSymbols: 1, includeFiles: 0, includeContent: 1 }
      }));

      const currentWeights = {
        'symbol': { 'definition': 2.0, 'usage': 1.0, 'test': 0.8 }
      };

      const result = await optimizer.optimizeWeights(signals, currentWeights);

      expect(result.iterations).toBeLessThan(100);
      expect(result.convergence).toBe(true);
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

      const currentWeights = {
        'symbol': { 'definition': 2.0, 'usage': 1.0 },
        'config': { 'config': 2.0, 'setting': 1.0 }
      };

      const result = await optimizer.optimizeWeights(signals, currentWeights);

      expect(result.optimizedWeights).toHaveProperty('symbol');
      expect(result.optimizedWeights).toHaveProperty('config');
      expect(Object.keys(result.optimizedWeights)).toHaveLength(2);
    });

    it('should use custom optimization options', async () => {
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

      const currentWeights = {
        'symbol': { 'definition': 2.0, 'usage': 1.0 }
      };

      const options = {
        learningRate: 0.01,
        maxIterations: 50,
        convergenceThreshold: 0.001,
        minSignalsPerIntent: 1
      };

      const result = await optimizer.optimizeWeights(signals, currentWeights, options);

      expect(result.iterations).toBeLessThanOrEqual(50);
    });
  });

  describe('applyWeightUpdates', () => {
    it('should apply weight updates through policy gate', async () => {
      const weights = {
        'symbol': { 'definition': 2.5, 'usage': 1.2 }
      };

      await optimizer.applyWeightUpdates(weights);

      expect(mockPolicyGate.updateRepositoryPolicies).toHaveBeenCalled();
    });
  });

  describe('rollbackWeights', () => {
    it('should rollback weights using provided data', async () => {
      const rollbackData = {
        'symbol': { 'definition': 2.0, 'usage': 1.0 }
      };

      await optimizer.rollbackWeights(rollbackData);

      expect(mockPolicyGate.updateRepositoryPolicies).toHaveBeenCalled();
    });
  });

  describe('gradient calculation', () => {
    it('should calculate gradients correctly for satisfied interactions', async () => {
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

      const currentWeights = {
        'symbol': { 'definition': 2.0, 'usage': 1.0 }
      };

      // Access private method through type assertion for testing
      const optimizerAny = optimizer as any;
      const gradients = optimizerAny.calculateGradients(signals, currentWeights);

      expect(gradients).toHaveProperty('symbol');
      expect(gradients.symbol).toHaveProperty('definition');
      expect(gradients.symbol).toHaveProperty('usage');
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
          tokenUsage: -100, // Negative token usage
          seedWeights: {}, // Empty weights
          policyThresholds: {} // Empty thresholds
        } as OutcomeSignal
      ];

      const currentWeights = {
        'symbol': { 'definition': 2.0, 'usage': 1.0 }
      };

      // Should not throw an error
      const result = await optimizer.optimizeWeights(malformedSignals, currentWeights);
      expect(result).toBeDefined();
    });

    it('should handle empty current weights', async () => {
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

      const currentWeights = {};

      const result = await optimizer.optimizeWeights(signals, currentWeights);
      expect(result.optimizedWeights).toEqual({});
    });
  });
});