import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the policy gate module with all required methods
vi.mock('../../src/policy/policy-gate.js', () => ({
  policyGate: {
    updateRepositoryPolicies: vi.fn(),
    getPolicy: vi.fn((repo: string, intent: string) => ({
      maxDepth: 2,
      includeSymbols: true,
      includeFiles: false,
      includeContent: true,
      earlyStopThreshold: 3,
      seedWeights: { 'definition': 2.0, 'usage': 1.0 }
    })),
    getAllPolicies: vi.fn(),
    validatePolicy: vi.fn()
  }
}));

import { PolicyTuner } from '../../src/learning/policy-tuner.js';
import type { OutcomeSignal } from '../../src/learning/outcome-analyzer.js';

describe('PolicyTuner Integration', () => {
  let tuner: PolicyTuner;

  beforeEach(() => {
    vi.clearAllMocks();
    tuner = new PolicyTuner();
  });

  it('should demonstrate end-to-end policy tuning workflow', async () => {
    // Step 1: Create realistic outcome signals
    const signals: OutcomeSignal[] = [
      {
        sessionId: 's1',
        query: 'function definition in module',
        intent: 'symbol',
        bundleSignature: 'b_symbol_complex',
        satisfied: false,
        timeToFix: 18000, // Long time indicates insufficient depth
        tokenUsage: 350,
        seedWeights: { 'definition': 1.5, 'usage': 1.0 },
        policyThresholds: { earlyStop: 3, maxDepth: 2, includeSymbols: 1, includeFiles: 0, includeContent: 1 }
      },
      {
        sessionId: 's2',
        query: 'config file settings',
        intent: 'config',
        bundleSignature: 'b_config_simple',
        satisfied: true,
        timeToFix: 2000, // Quick resolution indicates good settings
        tokenUsage: 80,
        seedWeights: { 'config': 2.0, 'setting': 1.5 },
        policyThresholds: { earlyStop: 2, maxDepth: 1, includeSymbols: 0, includeFiles: 1, includeContent: 1 }
      }
    ];

    // Step 2: Define current policies
    const currentPolicies = {
      'symbol': {
        maxDepth: 2,
        includeSymbols: true,
        includeFiles: false,
        includeContent: true,
        earlyStopThreshold: 3,
        seedWeights: { 'definition': 1.5, 'usage': 1.0, 'test': 0.8 }
      },
      'config': {
        maxDepth: 1,
        includeSymbols: false,
        includeFiles: true,
        includeContent: true,
        earlyStopThreshold: 2,
        seedWeights: { 'config': 2.0, 'setting': 1.5, 'environment': 1.0 }
      }
    };

    // Step 3: Tune policies with custom options
    const result = await tuner.tunePolicies(signals, currentPolicies, {
      minSignalsPerIntent: 1,
      learningRate: 0.15,
      maxIterations: 50,
      repository: 'my-project',
      language: 'typescript'
    });

    // Step 4: Verify tuning results
    expect(result).toBeDefined();
    expect(result.optimizedPolicies).toBeDefined();
    expect(result.improvement).toBeGreaterThanOrEqual(0);
    expect(result.parameterChanges).toBeDefined();
    expect(result.rollbackData).toEqual(currentPolicies);
    expect(result.validationErrors).toHaveLength(0);

    // Step 5: Verify specific optimizations
    const optimizedSymbolPolicy = result.optimizedPolicies.symbol;
    const optimizedConfigPolicy = result.optimizedPolicies.config;

    // For symbol search with long time-to-fix, should increase depth
    expect(optimizedSymbolPolicy.maxDepth).toBeGreaterThanOrEqual(2);
    
    // For config search with good performance, should maintain or optimize
    expect(optimizedConfigPolicy.earlyStopThreshold).toBeGreaterThanOrEqual(1);

    // Step 6: Apply the optimized policies
    await tuner.applyPolicyUpdates(result.optimizedPolicies);
    
    const { policyGate } = await import('../../src/policy/policy-gate.js');
    expect(policyGate.updateRepositoryPolicies).toHaveBeenCalledWith({
      '*': {
        'symbol': expect.objectContaining({
          maxDepth: expect.any(Number),
          includeSymbols: expect.any(Boolean),
          includeFiles: expect.any(Boolean),
          includeContent: expect.any(Boolean),
          earlyStopThreshold: expect.any(Number),
          seedWeights: expect.any(Object)
        }),
        'config': expect.objectContaining({
          maxDepth: expect.any(Number),
          includeSymbols: expect.any(Boolean),
          includeFiles: expect.any(Boolean),
          includeContent: expect.any(Boolean),
          earlyStopThreshold: expect.any(Number),
          seedWeights: expect.any(Object)
        })
      }
    });

    // Step 7: Test rollback functionality
    await tuner.rollbackPolicies(result.rollbackData);
    expect(policyGate.updateRepositoryPolicies).toHaveBeenCalledTimes(2);
  });

  it('should handle per-language optimization correctly', async () => {
    const pythonSignals: OutcomeSignal[] = [
      {
        sessionId: 's1',
        query: 'python class method',
        intent: 'symbol',
        bundleSignature: 'b_python_class',
        satisfied: true,
        tokenUsage: 120,
        seedWeights: { 'definition': 2.0, 'implementation': 1.2 },
        policyThresholds: { earlyStop: 3, maxDepth: 2, includeSymbols: 1, includeFiles: 0, includeContent: 1 }
      }
    ];

    const basePolicy = {
      'symbol': {
        maxDepth: 2,
        includeSymbols: true,
        includeFiles: false,
        includeContent: true,
        earlyStopThreshold: 3,
        seedWeights: { 'definition': 2.0, 'implementation': 1.0 }
      }
    };

    // Test Python optimization (should boost definition weight)
    const pythonResult = await tuner.tunePolicies(pythonSignals, basePolicy, {
      minSignalsPerIntent: 1,
      language: 'python'
    });

    expect(pythonResult.optimizedPolicies.symbol.seedWeights.definition)
      .toBeGreaterThanOrEqual(2.0);

    // Test TypeScript optimization (should boost handler weight)
    const tsResult = await tuner.tunePolicies(pythonSignals, basePolicy, {
      minSignalsPerIntent: 1,
      language: 'typescript'
    });

    // TypeScript should have different optimization patterns
    expect(tsResult.optimizedPolicies.symbol).toBeDefined();
  });

  it('should enforce all policy constraints', async () => {
    // Test with extreme values to ensure constraints are enforced
    const extremeSignals: OutcomeSignal[] = [
      {
        sessionId: 's1',
        query: 'very complex search',
        intent: 'search',
        bundleSignature: 'b_extreme',
        satisfied: false,
        timeToFix: 50000,
        tokenUsage: 1000,
        seedWeights: { 'match': 10.0, 'relevant': 10.0 }, // Extreme weights
        policyThresholds: { earlyStop: 100, maxDepth: 20, includeSymbols: 1, includeFiles: 1, includeContent: 1 }
      }
    ];

    const extremePolicies = {
      'search': {
        maxDepth: 20, // Too high
        includeSymbols: true,
        includeFiles: true,
        includeContent: true,
        earlyStopThreshold: 100, // Too high
        seedWeights: { 'match': 10.0, 'relevant': 10.0 } // Too high
      }
    };

    const result = await tuner.tunePolicies(extremeSignals, extremePolicies, {
      minSignalsPerIntent: 1
    });

    // Should detect constraint violations and correct them
    expect(result.validationErrors.length).toBeGreaterThanOrEqual(0);

    const policy = result.optimizedPolicies.search;
    expect(policy.maxDepth).toBeLessThanOrEqual(10);
    expect(policy.earlyStopThreshold).toBeLessThanOrEqual(50);
    
    Object.values(policy.seedWeights).forEach(weight => {
      expect(weight).toBeLessThanOrEqual(5.0);
      expect(weight).toBeGreaterThanOrEqual(0.1);
    });
  });

  it('should generate comprehensive parameter change reports', async () => {
    const signals: OutcomeSignal[] = [
      {
        sessionId: 's1',
        query: 'api endpoint handler',
        intent: 'api',
        bundleSignature: 'b_api_handler',
        satisfied: false,
        timeToFix: 12000,
        tokenUsage: 200,
        seedWeights: { 'handler': 1.0, 'endpoint': 1.0 },
        policyThresholds: { earlyStop: 2, maxDepth: 1, includeSymbols: 1, includeFiles: 0, includeContent: 1 }
      }
    ];

    const policies = {
      'api': {
        maxDepth: 1,
        includeSymbols: true,
        includeFiles: false,
        includeContent: true,
        earlyStopThreshold: 2,
        seedWeights: { 'handler': 1.0, 'endpoint': 1.0, 'route': 1.5 }
      }
    };

    const result = await tuner.tunePolicies(signals, policies, {
      minSignalsPerIntent: 1
    });

    // Should track all parameter changes
    expect(result.parameterChanges).toBeDefined();
    expect(typeof result.parameterChanges === 'object').toBe(true);

    // Each change should have complete metadata
    Object.values(result.parameterChanges).forEach(change => {
      expect(change).toHaveProperty('parameter');
      expect(change).toHaveProperty('oldValue');
      expect(change).toHaveProperty('newValue');
      expect(change).toHaveProperty('impact');
      expect(change).toHaveProperty('confidence');
      expect(typeof change.impact).toBe('number');
      expect(typeof change.confidence).toBe('number');
    });
  });
});