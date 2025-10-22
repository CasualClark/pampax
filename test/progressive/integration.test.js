const ProgressiveContextBuilder = require('../../src/progressive/context-builder');
const { parseCignore } = require('../../src/progressive/cignore-parser');
const CacheManager = require('../../src/progressive/cache-manager');

describe('Progressive Context Integration Tests', () => {
    let mockVectorStore;
    let contextBuilder;
    let cache;

    beforeEach(() => {
        mockVectorStore = {
            search: jest.fn(),
            getFileByPath: jest.fn()
        };
        contextBuilder = new ProgressiveContextBuilder(mockVectorStore);
        cache = new CacheManager(1000);
    });

    describe('end-to-end workflow', () => {
        test('complete progressive context workflow', async () => {
            // Mock search results
            mockVectorStore.search.mockResolvedValue([
                {
                    path: 'src/auth.js',
                    language: 'javascript',
                    symbols: [
                        {
                            name: 'login',
                            type: 'function',
                            exported: true,
                            signature: 'login(email, password)',
                            params: ['email', 'password'],
                            returnType: 'Promise<User>',
                            content: 'async function login(email, password) { /* implementation */ }'
                        }
                    ],
                    content: 'export async function login(email, password) { /* implementation */ }'
                },
                {
                    path: 'src/middleware.js',
                    language: 'javascript',
                    symbols: [
                        {
                            name: 'requireAuth',
                            type: 'function',
                            exported: true,
                            signature: 'requireAuth(req, res, next)',
                            params: ['req', 'res', 'next'],
                            returnType: 'void'
                        }
                    ],
                    content: 'export function requireAuth(req, res, next) { /* implementation */ }'
                }
            ]);

            // Step 1: Get outline
            const outlineResult = await contextBuilder.buildContext({
                query: 'authentication',
                detail_level: 'outline',
                token_budget: 1000
            });

            expect(outlineResult.detail_level).toBe('outline');
            expect(outlineResult.files_found).toBe(2);
            expect(outlineResult.results[0]).toHaveProperty('exports');
            expect(outlineResult.token_usage.used).toBeLessThan(100);

            // Step 2: Get signatures for specific file
            const signaturesResult = await contextBuilder.buildContext({
                query: 'authentication',
                detail_level: 'signatures',
                specific_files: ['src/auth.js'],
                token_budget: 1000
            });

            expect(signaturesResult.detail_level).toBe('signatures');
            expect(signaturesResult.files_included).toBe(1);
            expect(signaturesResult.results[0]).toHaveProperty('functions');
            expect(signaturesResult.results[0].functions[0].name).toBe('login');

            // Step 3: Get full implementation
            const fullResult = await contextBuilder.buildContext({
                query: 'authentication',
                detail_level: 'full',
                specific_files: ['src/auth.js'],
                token_budget: 2000
            });

            expect(fullResult.detail_level).toBe('full');
            expect(fullResult.results[0]).toHaveProperty('content');
            expect(fullResult.results[0].content).toContain('login');
        });

        test('caching across multiple requests', async () => {
            mockVectorStore.search.mockResolvedValue([
                {
                    path: 'src/utils.js',
                    language: 'javascript',
                    symbols: [{ name: 'formatDate', exported: true }],
                    content: 'export function formatDate() {}'
                }
            ]);

            const sessionId = 'test-session';
            const options = {
                query: 'date formatting',
                detail_level: 'outline',
                session_id: sessionId
            };

            // First request
            const result1 = await contextBuilder.buildContext(options);
            expect(result1._cached).toBeUndefined();

            // Second request (should use cache)
            const result2 = await contextBuilder.buildContext(options);
            expect(result2._cached).toBe(true);

            // Should only call search once
            expect(mockVectorStore.search).toHaveBeenCalledTimes(1);
        });

        test('token budget enforcement across levels', async () => {
            // Create many large files
            const manyFiles = Array(10).fill().map((_, i) => ({
                path: `src/file${i}.js`,
                language: 'javascript',
                symbols: [],
                content: 'x'.repeat(1000) // Large content
            }));

            mockVectorStore.search.mockResolvedValue(manyFiles);

            // Test with small budget
            const result = await contextBuilder.buildContext({
                query: 'large files',
                detail_level: 'full',
                token_budget: 500
            });

            expect(result.token_usage.used).toBeLessThanOrEqual(500);
            expect(result.files_included).toBeLessThan(result.files_found);
        });
    });

    describe('cignore integration', () => {
        test('cignore patterns affect file filtering', () => {
            const cignoreContent = `
node_modules/
*.test.js
@build
dist/
`;

            const parsed = parseCignore(cignoreContent);

            // Test pattern matching
            expect(parsed.matches('src/app.js')).toBe(false);
            expect(parsed.matches('node_modules/package.json')).toBe(true);
            expect(parsed.matches('app.test.js')).toBe(true);
            expect(parsed.matches('dist/bundle.js')).toBe(true);
        });

        test('special groups work correctly', () => {
            const cignoreContent = `@env`;
            const parsed = parseCignore(cignoreContent);

            expect(parsed.matches('.env')).toBe(true);
            expect(parsed.matches('.env.production')).toBe(true);
            expect(parsed.matches('config.js')).toBe(false);
        });

        test('negated patterns override includes', () => {
            const cignoreContent = `
*.js
!important.js
node_modules/
!node_modules/important/
`;

            const parsed = parseCignore(cignoreContent);

            expect(parsed.matches('app.js')).toBe(true);
            expect(parsed.matches('important.js')).toBe(false);
            expect(parsed.matches('node_modules/package.json')).toBe(true);
            expect(parsed.matches('node_modules/important/index.js')).toBe(false);
        });
    });

    describe('cache integration', () => {
        test('cache handles multiple sessions', () => {
            const session1 = 'user1';
            const session2 = 'user2';

            cache.set(session1, 'key1', { data: 'user1 data' });
            cache.set(session2, 'key1', { data: 'user2 data' });

            expect(cache.get(session1, 'key1')).toEqual({ data: 'user1 data' });
            expect(cache.get(session2, 'key1')).toEqual({ data: 'user2 data' });
        });

        test('cache respects TTL', async () => {
            const shortCache = new CacheManager(50); // 50ms TTL
            const sessionId = 'test';

            shortCache.set(sessionId, 'key', { data: 'test' });
            expect(shortCache.get(sessionId, 'key')).toEqual({ data: 'test' });

            // Wait for expiration
            await new Promise(resolve => setTimeout(resolve, 100));
            expect(shortCache.get(sessionId, 'key')).toBeNull();
        });
    });

    describe('error handling', () => {
        test('handles vector store errors gracefully', async () => {
            mockVectorStore.search.mockRejectedValue(new Error('Database connection failed'));

            await expect(contextBuilder.buildContext({
                query: 'test',
                detail_level: 'outline'
            })).rejects.toThrow('Database connection failed');
        });

        test('validates input parameters', async () => {
            await expect(contextBuilder.buildContext({
                query: '',
                detail_level: 'outline'
            })).rejects.toThrow();

            await expect(contextBuilder.buildContext({
                query: 'test',
                detail_level: 'invalid'
            })).rejects.toThrow('Invalid detail_level');
        });

        test('handles missing files', async () => {
            mockVectorStore.getFileByPath.mockRejectedValue(new Error('File not found'));

            const result = await contextBuilder.buildContext({
                query: 'test',
                specific_files: ['missing.js'],
                detail_level: 'outline'
            });

            expect(result.files_found).toBe(0);
            expect(result.files_included).toBe(0);
        });
    });

    describe('performance considerations', () => {
        test('large result sets are handled efficiently', async () => {
            // Mock many small files
            const manyFiles = Array(100).fill().map((_, i) => ({
                path: `src/file${i}.js`,
                language: 'javascript',
                symbols: [{ name: `func${i}`, exported: true }],
                content: `export function func${i}() { return ${i}; }`
            }));

            mockVectorStore.search.mockResolvedValue(manyFiles);

            const startTime = Date.now();
            const result = await contextBuilder.buildContext({
                query: 'many files',
                detail_level: 'outline',
                token_budget: 2000
            });
            const endTime = Date.now();

            expect(endTime - startTime).toBeLessThan(1000); // Should complete in <1s
            expect(result.files_included).toBeLessThan(result.files_found);
        });

        test('concurrent requests are handled correctly', async () => {
            mockVectorStore.search.mockResolvedValue([
                {
                    path: 'src/concurrent.js',
                    language: 'javascript',
                    symbols: [{ name: 'concurrent', exported: true }],
                    content: 'export function concurrent() {}'
                }
            ]);

            // Make multiple concurrent requests
            const promises = Array(5).fill().map((_, i) =>
                contextBuilder.buildContext({
                    query: `concurrent ${i}`,
                    detail_level: 'outline'
                })
            );

            const results = await Promise.all(promises);

            expect(results).toHaveLength(5);
            results.forEach(result => {
                expect(result.detail_level).toBe('outline');
                expect(result.files_found).toBe(1);
            });
        });
    });
});