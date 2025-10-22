const { estimateTokens, countTokensInObject, TokenBudgetTracker, fitToBudget } = require('../../src/progressive/token-counter');

describe('Token Counter', () => {
    describe('estimateTokens', () => {
        test('estimates tokens for simple text', () => {
            const text = 'function hello() { return "world"; }';
            const tokens = estimateTokens(text);
            expect(tokens).toBeGreaterThan(0);
            expect(tokens).toBeLessThan(text.length);
        });

        test('returns 0 for empty text', () => {
            expect(estimateTokens('')).toBe(0);
            expect(estimateTokens(null)).toBe(0);
            expect(estimateTokens(undefined)).toBe(0);
        });

        test('estimates proportionally to text length', () => {
            const short = 'short';
            const long = 'a'.repeat(300);
            
            expect(estimateTokens(long)).toBeGreaterThan(estimateTokens(short));
        });
    });

    describe('countTokensInObject', () => {
        test('counts tokens in simple object', () => {
            const obj = { name: 'test', value: 42 };
            const tokens = countTokensInObject(obj);
            expect(tokens).toBeGreaterThan(0);
        });

        test('counts tokens in nested object', () => {
            const obj = {
                user: {
                    name: 'John',
                    profile: {
                        age: 30,
                        city: 'New York'
                    }
                }
            };
            const tokens = countTokensInObject(obj);
            expect(tokens).toBeGreaterThan(0);
        });

        test('counts tokens in array', () => {
            const arr = ['item1', 'item2', 'item3'];
            const tokens = countTokensInObject(arr);
            expect(tokens).toBeGreaterThan(0);
        });
    });

    describe('TokenBudgetTracker', () => {
        let tracker;

        beforeEach(() => {
            tracker = new TokenBudgetTracker(1000);
        });

        test('initializes with correct budget', () => {
            expect(tracker.budget).toBe(1000);
            expect(tracker.used).toBe(0);
            expect(tracker.remaining()).toBe(1000);
        });

        test('adds items and tracks usage', () => {
            const remaining = tracker.addItem('test item', 100);
            expect(tracker.used).toBe(100);
            expect(remaining).toBe(900);
            expect(tracker.items).toHaveLength(1);
        });

        test('canFit checks capacity', () => {
            expect(tracker.canFit(500)).toBe(true);
            expect(tracker.canFit(1500)).toBe(false);
            
            tracker.addItem('test', 800);
            expect(tracker.canFit(300)).toBe(true);
            expect(tracker.canFit(201)).toBe(false);
        });

        test('generates correct report', () => {
            tracker.addItem('item1', 200);
            tracker.addItem('item2', 300);
            
            const report = tracker.getReport();
            expect(report.budget).toBe(1000);
            expect(report.used).toBe(500);
            expect(report.remaining).toBe(500);
            expect(report.percentage).toBe(50);
            expect(report.items).toBe(2);
        });
    });

    describe('fitToBudget', () => {
        test('fits items within budget', () => {
            const items = [
                { content: 'small', score: 0.8 },
                { content: 'medium', score: 0.6 },
                { content: 'large', score: 0.9 }
            ];

            // Mock token counting
            const mockCountTokens = jest.fn().mockImplementation((item) => {
                if (item.content === 'small') return 100;
                if (item.content === 'medium') return 200;
                if (item.content === 'large') return 300;
                return 50;
            });

            // Temporarily replace the function
            const originalCountTokens = require('../../src/progressive/token-counter').countTokensInObject;
            require('../../src/progressive/token-counter').countTokensInObject = mockCountTokens;

            const result = fitToBudget(items, 400);

            expect(result.results).toHaveLength(2); // large (300) + small (100) = 400
            expect(result.tokenReport.used).toBeLessThanOrEqual(400);
            expect(result.tokenReport.budget).toBe(400);

            // Restore original function
            require('../../src/progressive/token-counter').countTokensInObject = originalCountTokens;
        });

        test('sorts by relevance score', () => {
            const items = [
                { content: 'low relevance', score: 0.2 },
                { content: 'high relevance', score: 0.9 },
                { content: 'medium relevance', score: 0.5 }
            ];

            const mockCountTokens = jest.fn().mockReturnValue(100);
            const originalCountTokens = require('../../src/progressive/token-counter').countTokensInObject;
            require('../../src/progressive/token-counter').countTokensInObject = mockCountTokens;

            const result = fitToBudget(items, 200);

            // Should include high and medium relevance first
            expect(result.results[0].score).toBe(0.9);
            expect(result.results[1].score).toBe(0.5);

            require('../../src/progressive/token-counter').countTokensInObject = originalCountTokens;
        });

        test('handles empty items array', () => {
            const result = fitToBudget([], 1000);
            expect(result.results).toHaveLength(0);
            expect(result.tokenReport.used).toBe(0);
        });

        test('creates minimal entries for oversized items', () => {
            const items = [
                { content: 'huge item that exceeds budget', score: 0.9, file: 'huge.js' }
            ];

            const mockCountTokens = jest.fn().mockReturnValue(2000);
            const originalCountTokens = require('../../src/progressive/token-counter').countTokensInObject;
            require('../../src/progressive/token-counter').countTokensInObject = mockCountTokens;

            const result = fitToBudget(items, 1000);

            expect(result.results).toHaveLength(1);
            expect(result.results[0]._truncated).toBe(true);
            expect(result.results[0].summary).toContain('truncated');

            require('../../src/progressive/token-counter').countTokensInObject = originalCountTokens;
        });
    });
});