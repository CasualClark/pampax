const ProgressiveContextBuilder = require('../../src/progressive/context-builder');
const { DETAIL_LEVELS } = require('../../src/progressive/detail-levels');

describe('ProgressiveContextBuilder', () => {
    let builder;
    let mockVectorStore;

    beforeEach(() => {
        mockVectorStore = {
            search: jest.fn(),
            getFileByPath: jest.fn()
        };
        builder = new ProgressiveContextBuilder(mockVectorStore);
    });

    describe('buildContext', () => {
        test('outline level returns minimal tokens', async () => {
            mockVectorStore.search.mockResolvedValue([
                {
                    path: 'src/auth.js',
                    language: 'javascript',
                    symbols: [{ name: 'login', exported: true }],
                    content: 'function login() {}'
                }
            ]);

            const result = await builder.buildContext({
                query: 'auth',
                detail_level: 'outline',
                token_budget: 1000
            });

            expect(result.detail_level).toBe('outline');
            expect(result.token_usage.used).toBeLessThan(100);
            expect(result.results[0]).toHaveProperty('exports');
            expect(result.results[0]).not.toHaveProperty('implementations');
        });

        test('signatures level includes function signatures', async () => {
            mockVectorStore.search.mockResolvedValue([
                {
                    path: 'src/utils.js',
                    language: 'javascript',
                    symbols: [
                        { 
                            name: 'formatDate', 
                            type: 'function',
                            signature: 'formatDate(date: Date): string',
                            params: ['date'],
                            returnType: 'string',
                            exported: true
                        }
                    ],
                    content: 'function formatDate(date) { return date.toISOString(); }'
                }
            ]);

            const result = await builder.buildContext({
                query: 'format date',
                detail_level: 'signatures',
                token_budget: 1000
            });

            expect(result.detail_level).toBe('signatures');
            expect(result.results[0]).toHaveProperty('functions');
            expect(result.results[0].functions).toHaveLength(1);
            expect(result.results[0].functions[0].name).toBe('formatDate');
            expect(result.results[0].functions[0].signature).toBe('formatDate(date: Date): string');
        });

        test('implementation level includes implementation summaries', async () => {
            mockVectorStore.search.mockResolvedValue([
                {
                    path: 'src/calculator.js',
                    language: 'javascript',
                    symbols: [
                        { 
                            name: 'add', 
                            type: 'function',
                            signature: 'add(a: number, b: number): number',
                            content: 'function add(a, b) { return a + b; }',
                            calls: [],
                            exported: true
                        }
                    ],
                    content: 'function add(a, b) { return a + b; }'
                }
            ]);

            const result = await builder.buildContext({
                query: 'addition',
                detail_level: 'implementation',
                token_budget: 1000
            });

            expect(result.detail_level).toBe('implementation');
            expect(result.results[0]).toHaveProperty('implementations');
            expect(result.results[0].implementations).toHaveLength(1);
            expect(result.results[0].implementations[0].name).toBe('add');
        });

        test('full level returns complete content', async () => {
            const fullContent = 'function complete() { /* full implementation */ return true; }';
            mockVectorStore.search.mockResolvedValue([
                {
                    path: 'src/complete.js',
                    language: 'javascript',
                    symbols: [{ name: 'complete', exported: true }],
                    content: fullContent
                }
            ]);

            const result = await builder.buildContext({
                query: 'complete',
                detail_level: 'full',
                token_budget: 1000
            });

            expect(result.detail_level).toBe('full');
            expect(result.results[0]).toHaveProperty('content');
            expect(result.results[0].content).toBe(fullContent);
        });

        test('respects token budget', async () => {
            mockVectorStore.search.mockResolvedValue(
                Array(20).fill({
                    path: 'src/test.js',
                    language: 'javascript',
                    symbols: [],
                    content: 'x'.repeat(5000)
                })
            );

            const result = await builder.buildContext({
                query: 'test',
                detail_level: 'full',
                token_budget: 1000
            });

            expect(result.token_usage.used).toBeLessThanOrEqual(1000);
            expect(result.files_included).toBeLessThan(result.files_found);
        });

        test('handles specific files parameter', async () => {
            const specificFile = {
                path: 'src/specific.js',
                language: 'javascript',
                symbols: [{ name: 'specific', exported: true }],
                content: 'export function specific() {}'
            };

            mockVectorStore.getFileByPath.mockResolvedValue(specificFile);

            const result = await builder.buildContext({
                query: 'specific',
                specific_files: ['src/specific.js'],
                detail_level: 'outline'
            });

            expect(mockVectorStore.search).not.toHaveBeenCalled();
            expect(mockVectorStore.getFileByPath).toHaveBeenCalledWith('src/specific.js');
            expect(result.results).toHaveLength(1);
            expect(result.results[0].file).toBe('src/specific.js');
        });

        test('caches results when session_id provided', async () => {
            mockVectorStore.search.mockResolvedValue([
                {
                    path: 'src/cache.js',
                    language: 'javascript',
                    symbols: [{ name: 'cache', exported: true }],
                    content: 'export function cache() {}'
                }
            ]);

            const sessionId = 'test-session';
            const options = {
                query: 'cache',
                detail_level: 'outline',
                session_id: sessionId
            };

            // First call
            const result1 = await builder.buildContext(options);
            expect(result1._cached).toBeUndefined();

            // Second call with same parameters
            const result2 = await builder.buildContext(options);
            expect(result2._cached).toBe(true);

            // Should only call search once
            expect(mockVectorStore.search).toHaveBeenCalledTimes(1);
        });

        test('suggests next steps appropriately', async () => {
            mockVectorStore.search.mockResolvedValue([
                {
                    path: 'src/simple.js',
                    language: 'javascript',
                    symbols: [],
                    content: 'const x = 1;'
                }
            ]);

            const result = await builder.buildContext({
                query: 'simple',
                detail_level: 'outline',
                token_budget: 4000
            });

            expect(result.next_steps).toBeTruthy();
            expect(result.next_steps[0].action).toBe('increase_detail');
            expect(result.next_steps[0].detail_level).toBe('signatures');
        });

        test('validates detail level parameter', async () => {
            await expect(builder.buildContext({
                query: 'test',
                detail_level: 'invalid'
            })).rejects.toThrow('Invalid detail_level: invalid');
        });

        test('handles empty search results gracefully', async () => {
            mockVectorStore.search.mockResolvedValue([]);

            const result = await builder.buildContext({
                query: 'nonexistent',
                detail_level: 'outline'
            });

            expect(result.files_found).toBe(0);
            expect(result.files_included).toBe(0);
            expect(result.results).toHaveLength(0);
        });
    });

    describe('calculateSearchLimit', () => {
        test('returns appropriate limits for each detail level', () => {
            expect(builder.calculateSearchLimit('outline')).toBe(50);
            expect(builder.calculateSearchLimit('signatures')).toBe(20);
            expect(builder.calculateSearchLimit('implementation')).toBe(10);
            expect(builder.calculateSearchLimit('full')).toBe(5);
            expect(builder.calculateSearchLimit('unknown')).toBe(10);
        });
    });

    describe('expandWithRelated', () => {
        test('expands with imported files', async () => {
            const files = [
                {
                    path: 'src/main.js',
                    imports: ['./utils.js', './config.js']
                }
            ];

            mockVectorStore.getFileByPath.mockImplementation((path) => {
                return Promise.resolve({
                    path,
                    language: 'javascript',
                    symbols: [],
                    content: ''
                });
            });

            const result = await builder.expandWithRelated(files);

            expect(result).toHaveLength(3);
            expect(result.map(f => f.path)).toContain('src/main.js');
            expect(result.map(f => f.path)).toContain('./utils.js');
            expect(result.map(f => f.path)).toContain('./config.js');
        });

        test('handles missing imports gracefully', async () => {
            const files = [
                {
                    path: 'src/main.js',
                    imports: ['./missing.js']
                }
            ];

            mockVectorStore.getFileByPath.mockRejectedValue(new Error('File not found'));

            const result = await builder.expandWithRelated(files);

            expect(result).toHaveLength(1);
            expect(result[0].path).toBe('src/main.js');
        });
    });

    describe('getFilesByPath', () => {
        test('retrieves files by path', async () => {
            const files = ['src/file1.js', 'src/file2.js'];
            
            mockVectorStore.getFileByPath.mockImplementation((path) => {
                return Promise.resolve({
                    path,
                    language: 'javascript',
                    symbols: [],
                    content: ''
                });
            });

            const result = await builder.getFilesByPath(files);

            expect(result).toHaveLength(2);
            expect(mockVectorStore.getFileByPath).toHaveBeenCalledTimes(2);
        });

        test('handles file not found errors', async () => {
            const files = ['src/missing.js'];
            
            mockVectorStore.getFileByPath.mockRejectedValue(new Error('File not found'));

            const result = await builder.getFilesByPath(files);

            expect(result).toHaveLength(0);
        });
    });
});