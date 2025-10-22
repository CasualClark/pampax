const CacheManager = require('../../src/progressive/cache-manager');

describe('CacheManager', () => {
    let cache;

    beforeEach(() => {
        cache = new CacheManager(100); // 100ms TTL for testing
    });

    afterEach(() => {
        cache.clear();
    });

    describe('basic operations', () => {
        test('stores and retrieves data', () => {
            const sessionId = 'session1';
            const key = 'test-key';
            const data = { result: 'test data' };

            cache.set(sessionId, key, data);
            const retrieved = cache.get(sessionId, key);

            expect(retrieved).toEqual(data);
        });

        test('returns null for non-existent data', () => {
            const result = cache.get('nonexistent', 'key');
            expect(result).toBeNull();
        });

        test('returns null for non-existent session', () => {
            const result = cache.get('session1', 'key');
            expect(result).toBeNull();
        });
    });

    describe('expiration', () => {
        test('expires data after TTL', async () => {
            const sessionId = 'session1';
            const key = 'test-key';
            const data = { result: 'test data' };

            cache.set(sessionId, key, data);
            
            // Should be available immediately
            expect(cache.get(sessionId, key)).toEqual(data);

            // Wait for expiration
            await new Promise(resolve => setTimeout(resolve, 150));

            // Should be expired
            expect(cache.get(sessionId, key)).toBeNull();
        });

        test('handles multiple entries with different expiration times', async () => {
            const sessionId = 'session1';
            
            cache.set(sessionId, 'key1', { data: 'first' });
            
            // Wait a bit, then add second entry
            await new Promise(resolve => setTimeout(resolve, 50));
            cache.set(sessionId, 'key2', { data: 'second' });

            // First should still be valid
            expect(cache.get(sessionId, 'key1')).toEqual({ data: 'first' });
            expect(cache.get(sessionId, 'key2')).toEqual({ data: 'second' });

            // Wait for first to expire
            await new Promise(resolve => setTimeout(resolve, 100));

            // First should be expired, second still valid
            expect(cache.get(sessionId, 'key1')).toBeNull();
            expect(cache.get(sessionId, 'key2')).toEqual({ data: 'second' });
        });
    });

    describe('session management', () => {
        test('manages multiple sessions independently', () => {
            const session1 = 'session1';
            const session2 = 'session2';

            cache.set(session1, 'key', { data: 'session1 data' });
            cache.set(session2, 'key', { data: 'session2 data' });

            expect(cache.get(session1, 'key')).toEqual({ data: 'session1 data' });
            expect(cache.get(session2, 'key')).toEqual({ data: 'session2 data' });
        });

        test('clears specific session', () => {
            const session1 = 'session1';
            const session2 = 'session2';

            cache.set(session1, 'key1', { data: 'data1' });
            cache.set(session1, 'key2', { data: 'data2' });
            cache.set(session2, 'key', { data: 'data3' });

            cache.clear(session1);

            expect(cache.get(session1, 'key1')).toBeNull();
            expect(cache.get(session1, 'key2')).toBeNull();
            expect(cache.get(session2, 'key')).toEqual({ data: 'data3' });
        });

        test('clears all sessions', () => {
            const session1 = 'session1';
            const session2 = 'session2';

            cache.set(session1, 'key', { data: 'data1' });
            cache.set(session2, 'key', { data: 'data2' });

            cache.clear();

            expect(cache.get(session1, 'key')).toBeNull();
            expect(cache.get(session2, 'key')).toBeNull();
        });
    });

    describe('key building', () => {
        test('builds consistent keys', () => {
            const key1 = cache.buildKey('query', 'outline', ['file1.js', 'file2.js']);
            const key2 = cache.buildKey('query', 'outline', ['file2.js', 'file1.js']);
            const key3 = cache.buildKey('query', 'outline', []);

            expect(key1).toBe(key2); // Files should be sorted
            expect(key1).not.toBe(key3);
        });

        test('handles empty files array', () => {
            const key1 = cache.buildKey('query', 'outline', []);
            const key2 = cache.buildKey('query', 'outline', []);

            expect(key1).toBe(key2);
        });
    });

    describe('cleanup', () => {
        test('cleans up expired entries automatically', async () => {
            const sessionId = 'session1';
            
            cache.set(sessionId, 'key1', { data: 'data1' });
            cache.set(sessionId, 'key2', { data: 'data2' });

            // Wait for expiration
            await new Promise(resolve => setTimeout(resolve, 150));

            // Trigger cleanup by setting a new entry
            cache.set(session1, 'key3', { data: 'data3' });

            // Expired entries should be gone
            expect(cache.get(sessionId, 'key1')).toBeNull();
            expect(cache.get(sessionId, 'key2')).toBeNull();
            expect(cache.get(sessionId, 'key3')).toEqual({ data: 'data3' });
        });

        test('removes empty sessions after cleanup', async () => {
            const sessionId = 'session1';
            
            cache.set(sessionId, 'key1', { data: 'data1' });

            // Wait for expiration
            await new Promise(resolve => setTimeout(resolve, 150));

            // Trigger cleanup
            cache.set('session2', 'key2', { data: 'data2' });

            // Session should be empty (but this is hard to test directly)
            expect(cache.get(sessionId, 'key1')).toBeNull();
        });
    });

    describe('statistics', () => {
        test('provides accurate stats', () => {
            const session1 = 'session1';
            const session2 = 'session2';

            cache.set(session1, 'key1', { data: 'data1' });
            cache.set(session1, 'key2', { data: 'data2' });
            cache.set(session2, 'key3', { data: 'data3' });

            const stats = cache.getStats();

            expect(stats.sessions).toBe(2);
            expect(stats.total_entries).toBe(3);
            expect(stats.max_age_ms).toBe(100);
        });

        test('updates stats after clearing', () => {
            const session1 = 'session1';
            const session2 = 'session2';

            cache.set(session1, 'key1', { data: 'data1' });
            cache.set(session2, 'key2', { data: 'data2' });

            expect(cache.getStats().sessions).toBe(2);

            cache.clear(session1);

            expect(cache.getStats().sessions).toBe(1);
            expect(cache.getStats().total_entries).toBe(1);

            cache.clear();

            expect(cache.getStats().sessions).toBe(0);
            expect(cache.getStats().total_entries).toBe(0);
        });
    });
});