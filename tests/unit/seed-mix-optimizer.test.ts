import { test, describe } from 'node:test';
import assert from 'node:assert';
import { SeedMixOptimizer, type SeedMixConfig, type SearchResult } from '../../dist/src/search/seed-mix-optimizer.js';
import type { IntentResult } from '../../dist/src/intent/intent-classifier.js';
import type { PolicyDecision } from '../../dist/src/policy/policy-gate.js';

describe('SeedMixOptimizer', () => {
    let optimizer: SeedMixOptimizer;

    test('should initialize optimizer', () => {
        optimizer = new SeedMixOptimizer();
        assert.ok(optimizer);
    });

    test('should clear cache and reset metrics', () => {
        optimizer = new SeedMixOptimizer();
        optimizer.clearCache();
        optimizer.resetMetrics();
        const metrics = optimizer.getPerformanceMetrics();
        assert.strictEqual(metrics.totalResultsProcessed, 0);
        assert.strictEqual(metrics.earlyStopActivations, 0);
    });

    describe('optimize', () => {
        test('should return appropriate config for symbol intent with high confidence', () => {
            optimizer = new SeedMixOptimizer();
            const intent: IntentResult = {
                intent: 'symbol',
                confidence: 0.9,
                entities: [],
                suggestedPolicies: ['symbol-level-2']
            };

            const policy: PolicyDecision = {
                maxDepth: 3,
                includeSymbols: true,
                includeFiles: false,
                includeContent: true,
                earlyStopThreshold: 4,
                seedWeights: { definition: 2.0 }
            };

            const config = optimizer.optimize(intent, policy);

            assert.ok(config.symbolWeight > config.vectorWeight);
            assert.ok(config.symbolWeight > config.bm25Weight);
            assert.ok(config.maxDepth <= policy.maxDepth);
            assert.ok(config.earlyStopThreshold <= policy.earlyStopThreshold);
        });

        test('should return appropriate config for config intent with medium confidence', () => {
            optimizer = new SeedMixOptimizer();
            const intent: IntentResult = {
                intent: 'config',
                confidence: 0.6,
                entities: [],
                suggestedPolicies: ['config-key-source']
            };

            const policy: PolicyDecision = {
                maxDepth: 2,
                includeSymbols: false,
                includeFiles: true,
                includeContent: true,
                earlyStopThreshold: 3,
                seedWeights: { config: 1.5 }
            };

            const config = optimizer.optimize(intent, policy);

            assert.ok(config.bm25Weight > config.symbolWeight);
            assert.ok(config.maxDepth <= policy.maxDepth);
            assert.ok(config.earlyStopThreshold <= policy.earlyStopThreshold);
        });

        test('should return appropriate config for api intent with low confidence', () => {
            optimizer = new SeedMixOptimizer();
            const intent: IntentResult = {
                intent: 'api',
                confidence: 0.3,
                entities: [],
                suggestedPolicies: ['api-handler-registration']
            };

            const policy: PolicyDecision = {
                maxDepth: 2,
                includeSymbols: true,
                includeFiles: false,
                includeContent: true,
                earlyStopThreshold: 2,
                seedWeights: { handler: 1.5 }
            };

            const config = optimizer.optimize(intent, policy);

            assert.ok(config.maxDepth <= 2); // Conservative due to low confidence
            assert.ok(config.earlyStopThreshold <= 2);
        });

        test('should return appropriate config for incident intent', () => {
            optimizer = new SeedMixOptimizer();
            const intent: IntentResult = {
                intent: 'incident',
                confidence: 0.8,
                entities: [],
                suggestedPolicies: ['incident-callers-diffs']
            };

            const policy: PolicyDecision = {
                maxDepth: 4,
                includeSymbols: true,
                includeFiles: true,
                includeContent: true,
                earlyStopThreshold: 6,
                seedWeights: { error: 2.0 }
            };

            const config = optimizer.optimize(intent, policy);

            assert.ok(config.memoryWeight > config.vectorWeight);
            assert.ok(config.maxDepth > 2); // Incident allows deeper search
            assert.ok(config.earlyStopThreshold > 3);
        });

        test('should return default config for unknown intent', () => {
            optimizer = new SeedMixOptimizer();
            const intent: IntentResult = {
                intent: 'unknown' as any,
                confidence: 0.5,
                entities: [],
                suggestedPolicies: []
            };

            const policy: PolicyDecision = {
                maxDepth: 2,
                includeSymbols: true,
                includeFiles: true,
                includeContent: true,
                earlyStopThreshold: 10,
                seedWeights: {}
            };

            const config = optimizer.optimize(intent, policy);

            assert.strictEqual(config.vectorWeight, 1.0);
            assert.strictEqual(config.bm25Weight, 1.0);
            assert.strictEqual(config.memoryWeight, 1.0);
            assert.strictEqual(config.symbolWeight, 1.0);
        });

        test('should apply confidence multiplier correctly', () => {
            optimizer = new SeedMixOptimizer();
            const highConfidenceIntent: IntentResult = {
                intent: 'symbol',
                confidence: 0.9,
                entities: [],
                suggestedPolicies: []
            };

            const lowConfidenceIntent: IntentResult = {
                intent: 'symbol',
                confidence: 0.3,
                entities: [],
                suggestedPolicies: []
            };

            const policy: PolicyDecision = {
                maxDepth: 2,
                includeSymbols: true,
                includeFiles: false,
                includeContent: true,
                earlyStopThreshold: 3,
                seedWeights: {}
            };

            const highConfig = optimizer.optimize(highConfidenceIntent, policy);
            const lowConfig = optimizer.optimize(lowConfidenceIntent, policy);

            assert.ok(highConfig.symbolWeight > lowConfig.symbolWeight);
        });

        test('should cache configurations for repeated requests', () => {
            optimizer = new SeedMixOptimizer();
            const intent: IntentResult = {
                intent: 'symbol',
                confidence: 0.7,
                entities: [],
                suggestedPolicies: []
            };

            const policy: PolicyDecision = {
                maxDepth: 2,
                includeSymbols: true,
                includeFiles: false,
                includeContent: true,
                earlyStopThreshold: 3,
                seedWeights: {}
            };

            const config1 = optimizer.optimize(intent, policy);
            const config2 = optimizer.optimize(intent, policy);

            assert.deepStrictEqual(config1, config2);
            
            const metrics = optimizer.getPerformanceMetrics();
            assert.ok(metrics.cacheHitRate > 0);
        });
    });

    describe('applyEarlyStop', () => {
        test('should return all results when under threshold', () => {
            optimizer = new SeedMixOptimizer();
            const config: SeedMixConfig = {
                vectorWeight: 1.0,
                bm25Weight: 1.0,
                memoryWeight: 1.0,
                symbolWeight: 1.0,
                maxDepth: 2,
                earlyStopThreshold: 10,
                confidenceMultiplier: 1.0
            };

            const results: SearchResult[] = [
                { id: '1', score: 0.9 },
                { id: '2', score: 0.8 },
                { id: '3', score: 0.7 }
            ];

            const result = optimizer.applyEarlyStop(results, config);
            assert.strictEqual(result.length, 3);
        });

        test('should apply early stop when over threshold with significant score drop', () => {
            optimizer = new SeedMixOptimizer();
            const config: SeedMixConfig = {
                vectorWeight: 1.0,
                bm25Weight: 1.0,
                memoryWeight: 1.0,
                symbolWeight: 1.0,
                maxDepth: 2,
                earlyStopThreshold: 3,
                confidenceMultiplier: 1.0
            };

            const results: SearchResult[] = [
                { id: '1', score: 1.0 },
                { id: '2', score: 0.9 },
                { id: '3', score: 0.25 }, // Significant drop (below 0.3 threshold)
                { id: '4', score: 0.2 },
                { id: '5', score: 0.1 }
            ];

            const result = optimizer.applyEarlyStop(results, config);
            assert.strictEqual(result.length, 3);
            
            const metrics = optimizer.getPerformanceMetrics();
            assert.strictEqual(metrics.earlyStopActivations, 1);
        });

        test('should not apply early stop when score drop is not significant', () => {
            optimizer = new SeedMixOptimizer();
            const config: SeedMixConfig = {
                vectorWeight: 1.0,
                bm25Weight: 1.0,
                memoryWeight: 1.0,
                symbolWeight: 1.0,
                maxDepth: 2,
                earlyStopThreshold: 3,
                confidenceMultiplier: 1.0
            };

            const results: SearchResult[] = [
                { id: '1', score: 1.0 },
                { id: '2', score: 0.9 },
                { id: '3', score: 0.8 },
                { id: '4', score: 0.7 }, // Not a significant drop
                { id: '5', score: 0.6 }
            ];

            const result = optimizer.applyEarlyStop(results, config);
            assert.strictEqual(result.length, 5);
        });

        test('should sort results by score before applying early stop', () => {
            optimizer = new SeedMixOptimizer();
            const config: SeedMixConfig = {
                vectorWeight: 1.0,
                bm25Weight: 1.0,
                memoryWeight: 1.0,
                symbolWeight: 1.0,
                maxDepth: 2,
                earlyStopThreshold: 2,
                confidenceMultiplier: 1.0
            };

            const results: SearchResult[] = [
                { id: '3', score: 0.3 },
                { id: '1', score: 0.9 },
                { id: '2', score: 0.2 }, // Significant drop
                { id: '4', score: 0.1 }
            ];

            const result = optimizer.applyEarlyStop(results, config);
            assert.strictEqual(result.length, 2);
            assert.strictEqual(result[0].id, '1');
            assert.strictEqual(result[1].id, '2');
        });
    });

    describe('reciprocalRankFusion', () => {
        test('should fuse results from multiple sources with weights', () => {
            optimizer = new SeedMixOptimizer();
const config: SeedMixConfig = {
                vectorWeight: 0.5, // Lower weight to make stability matter more
                bm25Weight: 0.5,
                memoryWeight: 1.0,
                symbolWeight: 1.0,
                maxDepth: 2,
                earlyStopThreshold: 10,
                confidenceMultiplier: 1.0
            };

            const results = {
                vectorResults: [
                    { id: '1', score: 0.9 },
                    { id: '2', score: 0.8 }
                ],
                bm25Results: [
                    { id: '2', score: 0.7 },
                    { id: '3', score: 0.6 }
                ],
                memoryResults: [
                    { id: '1', score: 0.8 },
                    { id: '4', score: 0.5 }
                ],
                symbolResults: [
                    { id: '3', score: 0.9 }
                ]
            };

            const fused = optimizer.reciprocalRankFusion(results, config, 5);

            assert.strictEqual(fused.length, 4); // All unique IDs
            
            // Check that results are properly fused with rank information
            const result1 = fused.find(r => r.id === '1');
            const result2 = fused.find(r => r.id === '2');
            const result3 = fused.find(r => r.id === '3');
            const result4 = fused.find(r => r.id === '4');

            assert.ok(result1);
            assert.strictEqual(result1!.vectorRank, 0);
            assert.strictEqual(result1!.memoryRank, 0);
            assert.strictEqual(result1!.vectorScore, 0.9);
            assert.strictEqual(result1!.memoryScore, 0.8);

            assert.ok(result2);
            assert.strictEqual(result2!.vectorRank, 1);
            assert.strictEqual(result2!.bm25Rank, 0);

            assert.ok(result3);
            assert.strictEqual(result3!.bm25Rank, 1);
            assert.strictEqual(result3!.symbolRank, 0);

            assert.ok(result4);
            assert.strictEqual(result4!.memoryRank, 1);
        });

        test('should handle empty result sets', () => {
            optimizer = new SeedMixOptimizer();
            const config: SeedMixConfig = {
                vectorWeight: 1.0,
                bm25Weight: 1.0,
                memoryWeight: 1.0,
                symbolWeight: 1.0,
                maxDepth: 2,
                earlyStopThreshold: 10,
                confidenceMultiplier: 1.0
            };

            const results = {
                vectorResults: [],
                bm25Results: [],
                memoryResults: [],
                symbolResults: []
            };

            const fused = optimizer.reciprocalRankFusion(results, config);
            assert.strictEqual(fused.length, 0);
        });

        test('should respect limit parameter', () => {
            optimizer = new SeedMixOptimizer();
            const config: SeedMixConfig = {
                vectorWeight: 1.0,
                bm25Weight: 1.0,
                memoryWeight: 1.0,
                symbolWeight: 1.0,
                maxDepth: 2,
                earlyStopThreshold: 10,
                confidenceMultiplier: 1.0
            };

            const results = {
                vectorResults: [
                    { id: '1', score: 0.9 },
                    { id: '2', score: 0.8 },
                    { id: '3', score: 0.7 },
                    { id: '4', score: 0.6 },
                    { id: '5', score: 0.5 }
                ],
                bm25Results: [],
                memoryResults: [],
                symbolResults: []
            };

            const fused = optimizer.reciprocalRankFusion(results, config, 3);
            assert.strictEqual(fused.length, 3);
        });

        test('should sort by score then by rank stability', () => {
            optimizer = new SeedMixOptimizer();
            const config: SeedMixConfig = {
                vectorWeight: 1.0,
                bm25Weight: 1.0,
                memoryWeight: 1.0,
                symbolWeight: 1.0,
                maxDepth: 2,
                earlyStopThreshold: 10,
                confidenceMultiplier: 1.0
            };

            const results = {
                vectorResults: [
                    { id: '1', score: 0.9 }, // High stability (rank 0)
                    { id: '2', score: 0.8 }  // Lower stability (rank 1)
                ],
                bm25Results: [
                    { id: '2', score: 0.9 }, // Improves stability for id 2
                    { id: '3', score: 0.8 }
                ],
                memoryResults: [],
                symbolResults: []
            };

            const fused = optimizer.reciprocalRankFusion(results, config);
            
            // Both should have similar scores, but id 2 should rank higher due to better stability
            assert.strictEqual(fused[0].id, '1'); // Still highest due to vector weight
            assert.strictEqual(fused[1].id, '2'); // Better stability than id 3
            assert.strictEqual(fused[2].id, '3');
        });
    });

    describe('performance metrics', () => {
        test('should track intent distribution', () => {
            optimizer = new SeedMixOptimizer();
            const intent: IntentResult = {
                intent: 'symbol',
                confidence: 0.7,
                entities: [],
                suggestedPolicies: []
            };

            const policy: PolicyDecision = {
                maxDepth: 2,
                includeSymbols: true,
                includeFiles: false,
                includeContent: true,
                earlyStopThreshold: 3,
                seedWeights: {}
            };

            optimizer.optimize(intent, policy);
            optimizer.optimize(intent, policy);

            const metrics = optimizer.getPerformanceMetrics();
            assert.strictEqual(metrics.intentDistribution['symbol'], 2);
        });

        test('should track early stop activations', () => {
            optimizer = new SeedMixOptimizer();
            const config: SeedMixConfig = {
                vectorWeight: 1.0,
                bm25Weight: 1.0,
                memoryWeight: 1.0,
                symbolWeight: 1.0,
                maxDepth: 2,
                earlyStopThreshold: 2,
                confidenceMultiplier: 1.0
            };

            const results: SearchResult[] = [
                { id: '1', score: 1.0 },
                { id: '2', score: 0.25 }, // Significant drop (below 0.3 threshold)
                { id: '3', score: 0.2 },
                { id: '4', score: 0.1 }
            ];

            optimizer.applyEarlyStop(results, config);

            const metrics = optimizer.getPerformanceMetrics();
            assert.strictEqual(metrics.earlyStopActivations, 1);
        });

        test('should reset metrics correctly', () => {
            optimizer = new SeedMixOptimizer();
            const intent: IntentResult = {
                intent: 'symbol',
                confidence: 0.7,
                entities: [],
                suggestedPolicies: []
            };

            const policy: PolicyDecision = {
                maxDepth: 2,
                includeSymbols: true,
                includeFiles: false,
                includeContent: true,
                earlyStopThreshold: 3,
                seedWeights: {}
            };

            optimizer.optimize(intent, policy);
            optimizer.resetMetrics();

            const metrics = optimizer.getPerformanceMetrics();
            assert.strictEqual(metrics.totalResultsProcessed, 0);
            assert.strictEqual(metrics.earlyStopActivations, 0);
            assert.strictEqual(metrics.averageProcessingTime, 0);
            assert.strictEqual(metrics.cacheHitRate, 0);
            assert.strictEqual(Object.keys(metrics.intentDistribution).length, 0);
        });
    });

    describe('cache management', () => {
        test('should clear cache', () => {
            optimizer = new SeedMixOptimizer();
            const intent: IntentResult = {
                intent: 'symbol',
                confidence: 0.7,
                entities: [],
                suggestedPolicies: []
            };

            const policy: PolicyDecision = {
                maxDepth: 2,
                includeSymbols: true,
                includeFiles: false,
                includeContent: true,
                earlyStopThreshold: 3,
                seedWeights: {}
            };

            optimizer.optimize(intent, policy);
            optimizer.clearCache();

            // Cache should be empty, so this should be a miss
            optimizer.optimize(intent, policy);
            const metrics = optimizer.getPerformanceMetrics();
            assert.strictEqual(metrics.cacheHitRate, 0);
        });
    });

    describe('error handling', () => {
        test('should handle invalid config gracefully', () => {
            optimizer = new SeedMixOptimizer();
            const intent: IntentResult = {
                intent: 'symbol',
                confidence: 0.7,
                entities: [],
                suggestedPolicies: []
            };

            const policy: PolicyDecision = {
                maxDepth: 20, // Invalid: too high
                includeSymbols: true,
                includeFiles: false,
                includeContent: true,
                earlyStopThreshold: 3,
                seedWeights: {}
            };

            const config = optimizer.optimize(intent, policy);
            assert.ok(config.maxDepth <= 10); // Should fall back to default
        });

        test('should handle missing results gracefully', () => {
            optimizer = new SeedMixOptimizer();
            const config: SeedMixConfig = {
                vectorWeight: 1.0,
                bm25Weight: 1.0,
                memoryWeight: 1.0,
                symbolWeight: 1.0,
                maxDepth: 2,
                earlyStopThreshold: 10,
                confidenceMultiplier: 1.0
            };

            const results = {
                vectorResults: undefined as any,
                bm25Results: undefined as any,
                memoryResults: undefined as any,
                symbolResults: undefined as any
            };

            const fused = optimizer.reciprocalRankFusion(results, config);
            assert.strictEqual(fused.length, 0);
        });
    });
});