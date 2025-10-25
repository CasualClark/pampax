/**
 * Performance Tests for Token System
 * 
 * Benchmarks tokenizer performance across models, caching effectiveness,
 * memory usage patterns, and end-to-end token budgeting performance.
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import performance from 'perf_hooks';
import { createTokenizer, TokenizerFactory } from '../src/tokenization/tokenizer-factory.js';
import { PackingProfileManager } from '../src/tokenization/packing-profiles.js';
import { DegradePolicyEngine } from '../src/tokenization/degrade-policy.js';
import { SearchIntegrationManager } from '../src/tokenization/search-integration.js';
import { Database } from 'better-sqlite3';
import { StorageOperations } from '../src/storage/crud.js';

// Performance monitoring utilities
class PerformanceMonitor {
  constructor() {
    this.measurements = new Map();
  }

  start(label) {
    this.measurements.set(label, { start: performance.now() });
  }

  end(label) {
    const measurement = this.measurements.get(label);
    if (measurement) {
      measurement.end = performance.now();
      measurement.duration = measurement.end - measurement.start;
      return measurement.duration;
    }
    return 0;
  }

  getDuration(label) {
    const measurement = this.measurements.get(label);
    return measurement ? measurement.duration : 0;
  }

  getAllMeasurements() {
    const results = {};
    this.measurements.forEach((value, key) => {
      results[key] = {
        duration: value.duration || 0,
        start: value.start,
        end: value.end
      };
    });
    return results;
  }

  reset() {
    this.measurements.clear();
  }
}

// Memory usage monitoring
class MemoryMonitor {
  constructor() {
    this.initialMemory = this.getMemoryUsage();
    this.measurements = [];
  }

  getMemoryUsage() {
    if (global.gc) {
      global.gc(); // Force garbage collection if available
    }
    
    const usage = process.memoryUsage();
    return {
      rss: usage.rss,
      heapUsed: usage.heapUsed,
      heapTotal: usage.heapTotal,
      external: usage.external,
      timestamp: Date.now()
    };
  }

  sample(label) {
    const current = this.getMemoryUsage();
    this.measurements.push({
      label,
      ...current,
      heapDelta: current.heapUsed - this.initialMemory.heapUsed
    });
  }

  getPeakMemory() {
    return Math.max(...this.measurements.map(m => m.heapUsed));
  }

  getMemoryGrowth() {
    if (this.measurements.length < 2) return 0;
    const first = this.measurements[0].heapUsed;
    const last = this.measurements[this.measurements.length - 1].heapUsed;
    return last - first;
  }

  getMeasurements() {
    return this.measurements;
  }
}

// Test data generators
const generateTestContent = (size = 'medium') => {
  const sizes = {
    small: 'function test() { return "small"; }',
    medium: `
export class MediumTestClass {
  constructor(private value: number) {}
  
  getValue(): number {
    return this.value;
  }
  
  setValue(value: number): void {
    this.value = value;
  }
  
  async processAsync(): Promise<string> {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve(\`Processed: \${this.value}\`);
      }, 100);
    });
  }
  
  private validateValue(): boolean {
    return typeof this.value === 'number' && !isNaN(this.value);
  }
}
    `.trim(),
    large: `
/**
 * Large test class with multiple methods and comprehensive documentation
 * This simulates a complex real-world code file that would be encountered
 * in a typical software project with various concerns and responsibilities.
 */
export class LargeComplexService {
  private dependencies: Map<string, any> = new Map();
  private cache: Map<string, any> = new Map();
  private eventListeners: Map<string, Function[]> = new Map();
  private metrics: { [key: string]: number } = {};
  
  constructor(
    private config: ServiceConfig,
    private logger: Logger,
    private database: DatabaseConnection,
    private eventBus: EventBus
  ) {
    this.initializeDependencies();
    this.setupEventHandlers();
    this.startMetricsCollection();
  }
  
  /**
   * Initialize all required dependencies for the service
   * Sets up injection points and prepares the service for operation
   */
  private initializeDependencies(): void {
    this.dependencies.set('config', this.config);
    this.dependencies.set('logger', this.logger);
    this.dependencies.set('database', this.database);
    this.dependencies.set('eventBus', this.eventBus);
    
    // Initialize additional dependencies
    this.dependencies.set('validator', new ValidationService());
    this.dependencies.set('transformer', new DataTransformer());
    this.dependencies.set('serializer', new JsonSerializer());
  }
  
  /**
   * Setup event handlers for various service events
   * Configures the event bus to listen for relevant events
   */
  private setupEventHandlers(): void {
    this.eventBus.on('data.updated', this.handleDataUpdate.bind(this));
    this.eventBus.on('cache.invalidated', this.handleCacheInvalidation.bind(this));
    this.eventBus.on('error.occurred', this.handleError.bind(this));
    this.eventBus.on('metrics.requested', this.handleMetricsRequest.bind(this));
  }
  
  /**
   * Start collecting performance metrics
   * Initializes counters and timers for monitoring
   */
  private startMetricsCollection(): void {
    this.metrics = {
      operationsPerformed: 0,
      cacheHits: 0,
      cacheMisses: 0,
      errorsHandled: 0,
      averageResponseTime: 0,
      memoryUsage: 0
    };
    
    // Start periodic metrics reporting
    setInterval(() => {
      this.reportMetrics();
    }, 60000); // Every minute
  }
  
  /**
   * Main processing method for incoming data
   * Validates, transforms, and stores the data
   */
  public async processData(data: any, options: ProcessingOptions = {}): Promise<ProcessingResult> {
    const startTime = Date.now();
    
    try {
      // Validate input data
      const validator = this.dependencies.get('validator');
      const validationResult = await validator.validate(data);
      
      if (!validationResult.isValid) {
        throw new ValidationError(validationResult.errors);
      }
      
      // Transform data
      const transformer = this.dependencies.get('transformer');
      const transformedData = await transformer.transform(data, options.transformOptions);
      
      // Check cache first
      const cacheKey = this.generateCacheKey(transformedData);
      const cachedResult = this.cache.get(cacheKey);
      
      if (cachedResult && !options.skipCache) {
        this.metrics.cacheHits++;
        return cachedResult;
      }
      
      this.metrics.cacheMisses++;
      
      // Process data through database
      const database = this.dependencies.get('database');
      const result = await database.store(transformedData);
      
      // Cache the result
      this.cache.set(cacheKey, result);
      
      // Update metrics
      this.metrics.operationsPerformed++;
      const responseTime = Date.now() - startTime;
      this.updateAverageResponseTime(responseTime);
      
      // Emit success event
      this.eventBus.emit('data.processed', { data: result, responseTime });
      
      return {
        success: true,
        data: result,
        responseTime,
        cached: false
      };
      
    } catch (error) {
      this.metrics.errorsHandled++;
      this.logger.error('Processing failed', { error, data });
      this.eventBus.emit('error.occurred', { error, data });
      
      return {
        success: false,
        error: error.message,
        responseTime: Date.now() - startTime
      };
    }
  }
  
  /**
   * Handle data update events
   */
  private handleDataUpdate(event: DataUpdateEvent): void {
    const cacheKeys = Array.from(this.cache.keys()).filter(key => 
      key.includes(event.dataId)
    );
    
    cacheKeys.forEach(key => this.cache.delete(key));
    
    this.logger.info('Cache invalidated for data update', { 
      dataId: event.dataId, 
      keysInvalidated: cacheKeys.length 
    });
  }
  
  /**
   * Handle cache invalidation events
   */
  private handleCacheInvalidation(event: CacheInvalidationEvent): void {
    if (event.pattern) {
      const regex = new RegExp(event.pattern);
      const keysToDelete = Array.from(this.cache.keys()).filter(key => 
        regex.test(key)
      );
      
      keysToDelete.forEach(key => this.cache.delete(key));
      
      this.logger.info('Pattern-based cache invalidation', { 
        pattern: event.pattern, 
        keysInvalidated: keysToDelete.length 
      });
    } else {
      this.cache.clear();
      this.logger.info('Full cache invalidation');
    }
  }
  
  /**
   * Handle error events
   */
  private handleError(event: ErrorEvent): void {
    this.metrics.errorsHandled++;
    
    // Implement error handling logic
    if (event.error.critical) {
      this.eventBus.emit('service.critical_error', event);
    }
    
    this.logger.error('Service error handled', { 
      error: event.error.message, 
      critical: event.error.critical 
    });
  }
  
  /**
   * Handle metrics request events
   */
  private handleMetricsRequest(): void {
    const currentMemory = process.memoryUsage();
    this.metrics.memoryUsage = currentMemory.heapUsed;
    
    this.eventBus.emit('metrics.reported', this.metrics);
  }
  
  /**
   * Generate cache key for data
   */
  private generateCacheKey(data: any): string {
    const serializer = this.dependencies.get('serializer');
    const serialized = serializer.serialize(data);
    return \`cache_\${this.hashString(serialized)}\`;
  }
  
  /**
   * Simple hash function for cache keys
   */
  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }
  
  /**
   * Update average response time
   */
  private updateAverageResponseTime(responseTime: number): void {
    const total = this.metrics.operationsPerformed;
    const current = this.metrics.averageResponseTime;
    this.metrics.averageResponseTime = ((current * (total - 1)) + responseTime) / total;
  }
  
  /**
   * Report metrics to monitoring system
   */
  private reportMetrics(): void {
    this.logger.info('Service metrics', this.metrics);
    this.eventBus.emit('metrics.reported', this.metrics);
  }
  
  /**
   * Get current service metrics
   */
  public getMetrics(): any {
    return { ...this.metrics };
  }
  
  /**
   * Clear all caches
   */
  public clearCache(): void {
    this.cache.clear();
    this.logger.info('Service cache cleared');
  }
  
  /**
   * Shutdown the service gracefully
   */
  public async shutdown(): Promise<void> {
    this.logger.info('Shutting down service');
    
    // Clear caches
    this.clearCache();
    
    // Remove event listeners
    this.eventBus.removeAllListeners();
    
    // Final metrics report
    this.reportMetrics();
    
    this.logger.info('Service shutdown complete');
  }
}
    `.trim()
  };
  
  return sizes[size] || sizes.medium;
};

const generateSearchResults = (count = 10, contentSize = 'medium') => {
  const content = generateTestContent(contentSize);
  return Array.from({ length: count }, (_, i) => ({
    id: \`result-\${i}\`,
    content: content.replace(/LargeComplexService/g, \`Service\${i}\`),
    path: \`src/service\${i}.js\`,
    spanKind: i % 3 === 0 ? 'class' : i % 3 === 1 ? 'function' : 'comment',
    spanName: \`service\${i}\`,
    language: 'javascript',
    score: 0.5 + (Math.random() * 0.5),
    metadata: { index: i, size: contentSize }
  }));
};

describe('Token System Performance', () => {
  let perfMonitor, memMonitor;
  let db, storage, profileManager, degradeEngine, searchIntegration;

  beforeEach(() => {
    perfMonitor = new PerformanceMonitor();
    memMonitor = new MemoryMonitor();
    
    // Create in-memory database for testing
    db = new Database(':memory:');
    
    // Initialize tables
    db.exec(`
      CREATE TABLE packing_profile (
        id TEXT PRIMARY KEY,
        repository TEXT NOT NULL,
        model TEXT NOT NULL,
        priorities TEXT NOT NULL,
        budget_allocation TEXT NOT NULL,
        capsule_strategies TEXT NOT NULL,
        truncation_strategies TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        ttl INTEGER,
        version INTEGER NOT NULL DEFAULT 1,
        metadata TEXT
      )
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS file (
        id INTEGER PRIMARY KEY,
        repo TEXT NOT NULL,
        path TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        lang TEXT NOT NULL,
        size INTEGER,
        modified_time INTEGER,
        UNIQUE(repo, path)
      )
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS chunk (
        id TEXT PRIMARY KEY,
        span_id TEXT NOT NULL,
        repo TEXT NOT NULL,
        path TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at INTEGER
      )
    `);

    storage = new StorageOperations(db);
    profileManager = new PackingProfileManager(storage);
    degradeEngine = new DegradePolicyEngine();
    searchIntegration = new SearchIntegrationManager(profileManager, storage);
    
    // Clear any existing tokenizer instances
    TokenizerFactory.clearAllCaches();
  });

  afterEach(() => {
    if (db) {
      db.close();
    }
    TokenizerFactory.clearAllCaches();
  });

  describe('Tokenizer Performance Benchmarks', () => {
    test('should benchmark token counting speed across models', () => {
      const models = ['gpt-4', 'gpt-3.5-turbo', 'claude-3', 'gemini-pro', 'llama-3', 'mistral'];
      const testContent = generateTestContent('large');
      const iterations = 100;
      
      const results = {};
      
undefined
      
      // Log performance results
      console.log('\\nTokenizer Performance Results:');
      Object.entries(results).forEach(([model, result]) => {
        console.log(\`  \${model}: \${result.avgTimePerCall.toFixed(3)}ms/call, \${result.tokensPerSecond.toFixed(0)} tokens/sec\`);
      });
      
      // Performance assertions
      Object.values(results).forEach(result => {
        assert.ok(result.avgTimePerCall < 10, \`Tokenizer should be fast (< 10ms/call), got \${result.avgTimePerCall}ms\`);
        assert.ok(result.tokensPerSecond > 1000, \`Should process > 1000 tokens/sec, got \${result.tokensPerSecond}\`);
      });
    });

    test('should benchmark batch token counting performance', () => {
      const model = 'gpt-4';
      const tokenizer = createTokenizer(model);
      const contents = Array.from({ length: 50 }, (_, i) => generateTestContent('medium').replace(/test/g, \`test\${i}\`));
      
      perfMonitor.start('batch-token-counting');
      
      // Test batch processing
      const results = contents.map(content => tokenizer.countTokens(content));
      
      const duration = perfMonitor.end('batch-token-counting');
      const avgTimePerItem = duration / contents.length;
      
      assert.strictEqual(results.length, contents.length);
      assert.ok(avgTimePerItem < 5, \`Batch processing should be efficient (< 5ms/item), got \${avgTimePerItem}ms\`);
      assert.ok(results.every(count => count > 0), 'All token counts should be positive');
    });

    test('should benchmark context fitting performance', () => {
      const model = 'claude-3';
      const tokenizer = createTokenizer(model);
      const largeContent = generateTestContent('large').repeat(10);
      const reserveTokens = 1000;
      const iterations = 50;
      
      perfMonitor.start('context-fitting');
      
      for (let i = 0; i < iterations; i++) {
        tokenizer.fitToContext(largeContent, reserveTokens);
      }
      
      const duration = perfMonitor.end('context-fitting');
      const avgTime = duration / iterations;
      
      assert.ok(avgTime < 20, \`Context fitting should be fast (< 20ms/call), got \${avgTime}ms\`);
    });
  });

  describe('Caching Effectiveness Tests', () => {
    test('should measure tokenizer caching hit rates and speed improvements', () => {
      const model = 'gpt-4';
      const testContent = generateTestContent('medium');
      const uniqueContents = Array.from({ length: 20 }, (_, i) => 
        testContent.replace(/test/g, \`test\${i}\`)
      );
      
      // Clear cache to start fresh
      TokenizerFactory.clearAllCaches();
      
      // First pass - populate cache
      perfMonitor.start('first-pass');
      uniqueContents.forEach(content => {
        const tokenizer = createTokenizer(model);
        tokenizer.countTokens(content);
      });
      const firstPassTime = perfMonitor.end('first-pass');
      
      // Second pass - should hit cache
      perfMonitor.start('second-pass');
      uniqueContents.forEach(content => {
        const tokenizer = createTokenizer(model);
        tokenizer.countTokens(content);
      });
      const secondPassTime = perfMonitor.end('second-pass');
      
      const speedImprovement = firstPassTime / secondPassTime;
      const cacheStats = TokenizerFactory.getStats();
      
      console.log(\`\\nCaching Performance:
  First pass: \${firstPassTime.toFixed(2)}ms
  Second pass: \${secondPassTime.toFixed(2)}ms
  Speed improvement: \${speedImprovement.toFixed(2)}x
  Cache instances: \${cacheStats.totalInstances}\`);
      
      assert.ok(speedImprovement >= 1, \`Cache should provide speed improvement, got \${speedImprovement}x\`);
      assert.ok(cacheStats.totalInstances > 0, 'Should have cached instances');
    });

    test('should measure cache memory usage', () => {
      const model = 'gpt-4';
      const uniqueContents = Array.from({ length: 100 }, (_, i) => 
        generateTestContent('small').replace(/test/g, \`test\${i}\`)
      );
      
      // Sample memory before caching
      memMonitor.sample('before-caching');
      
      // Populate cache
      uniqueContents.forEach(content => {
        const tokenizer = createTokenizer(model);
        tokenizer.countTokens(content);
      });
      
      // Sample memory after caching
      memMonitor.sample('after-caching');
      
      const memoryGrowth = memMonitor.getMemoryGrowth();
      const cacheStats = TokenizerFactory.getStats();
      
      console.log(\`\\nCache Memory Usage:
  Memory growth: \${(memoryGrowth / 1024 / 1024).toFixed(2)}MB
  Cache instances: \${cacheStats.totalInstances}\`);
      
      // Memory growth should be reasonable (< 10MB for 100 cached instances)
      assert.ok(memoryGrowth < 10 * 1024 * 1024, \`Cache memory usage should be reasonable, got \${memoryGrowth / 1024 / 1024}MB\`);
    });

    test('should test cache eviction behavior', () => {
      const model = 'gpt-4';
      const cacheSize = 10; // Small cache for testing eviction
      const contents = Array.from({ length: cacheSize + 5 }, (_, i) => 
        generateTestContent('small').replace(/test/g, \`test\${i}\`)
      );
      
      // Create tokenizer with limited cache size
      const tokenizer = createTokenizer(model, { cacheSize });
      
      // Fill cache beyond capacity
      contents.forEach(content => {
        tokenizer.countTokens(content);
      });
      
      const cacheStats = tokenizer.getCacheStats();
      
      assert.ok(cacheStats.size <= cacheSize, \`Cache should respect size limit, got \${cacheStats.size}\`);
      assert.ok(cacheStats.maxSize === cacheSize, 'Should report correct max size');
    });
  });

  describe('Memory Usage Patterns', () => {
    test('should monitor memory usage during heavy tokenization', () => {
      const model = 'gpt-4';
      const largeContent = generateTestContent('large');
      const iterations = 100;
      
      memMonitor.sample('start');
      
      for (let i = 0; i < iterations; i++) {
        const tokenizer = createTokenizer(model);
        tokenizer.countTokens(largeContent + \` // iteration \${i}\`);
        
        if (i % 20 === 0) {
          memMonitor.sample(\`iteration-\${i}\`);
        }
      }
      
      memMonitor.sample('end');
      const peakMemory = memMonitor.getPeakMemory();
      const memoryGrowth = memMonitor.getMemoryGrowth();
      
      console.log(\`\\nMemory Usage During Heavy Tokenization:
  Peak memory: \${(peakMemory / 1024 / 1024).toFixed(2)}MB
  Memory growth: \${(memoryGrowth / 1024 / 1024).toFixed(2)}MB\`);
      
      // Memory growth should be reasonable for 100 iterations
      assert.ok(memoryGrowth < 50 * 1024 * 1024, \`Memory growth should be reasonable, got \${memoryGrowth / 1024 / 1024}MB\`);
    });

    test('should test memory efficiency with different content sizes', () => {
      const model = 'gpt-4';
      const sizes = ['small', 'medium', 'large'];
      const results = {};
      
      sizes.forEach(size => {
        memMonitor.sample(\`start-\${size}\`);
        
        const content = generateTestContent(size);
        const iterations = 50;
        
        for (let i = 0; i < iterations; i++) {
          const tokenizer = createTokenizer(model);
          tokenizer.countTokens(content + \` // \${i}\`);
        }
        
        memMonitor.sample(\`end-\${size}\`);
        
        const measurements = memMonitor.getMeasurements();
        const startIdx = measurements.findIndex(m => m.label === \`start-\${size}\`);
        const endIdx = measurements.findIndex(m => m.label === \`end-\${size}\`);
        
        if (startIdx !== -1 && endIdx !== -1) {
          results[size] = {
            memoryUsed: measurements[endIdx].heapUsed - measurements[startIdx].heapUsed,
            contentLength: content.length,
            iterations
          };
        }
      });
      
      console.log(\`\\nMemory Efficiency by Content Size:`);
      Object.entries(results).forEach(([size, result]) => {
        const memoryPerChar = result.memoryUsed / result.contentLength;
        console.log(\`  \${size}: \${(result.memoryUsed / 1024).toFixed(2)}KB, \${memoryPerChar.toFixed(2)} bytes/char\`);
      });
      
      // Memory usage should scale reasonably with content size
      assert.ok(results.small.memoryUsed < results.medium.memoryUsed, 'Small content should use less memory');
      assert.ok(results.medium.memoryUsed < results.large.memoryUsed, 'Medium content should use less memory than large');
    });
  });

  describe('End-to-End Token Budgeting Performance', () => {
    test('should benchmark complete token budgeting workflow', async () => {
      const searchResults = generateSearchResults(20, 'medium');
      const budget = 2000;
      const model = 'gpt-4';
      const repository = 'performance-test-repo';
      
      // Setup repository
      storage.files.insert({
        repo: repository,
        path: 'src/index.js',
        content_hash: 'hash1',
        lang: 'javascript'
      });
      
      memMonitor.sample('workflow-start');
      perfMonitor.start('complete-workflow');
      
      // Step 1: Get profile
      const profile = await profileManager.getProfile(repository, model);
      
      // Step 2: Optimize search results
      const result = await searchIntegration.optimizeSearchResults(
        'performance test query',
        searchResults,
        { repository, model, budget }
      );
      
      const workflowTime = perfMonitor.end('complete-workflow');
      memMonitor.sample('workflow-end');
      
      const memoryGrowth = memMonitor.getMemoryGrowth();
      
      console.log(\`\\nComplete Workflow Performance:
  Total time: \${workflowTime.toFixed(2)}ms
  Memory growth: \${(memoryGrowth / 1024).toFixed(2)}KB
  Results processed: \${result.results.length}
  Optimized items: \${result.optimized.packed.length}
  Total tokens: \${result.optimized.totalTokens}\`);
      
      // Performance assertions
      assert.ok(workflowTime < 1000, \`Complete workflow should be fast (< 1s), got \${workflowTime}ms\`);
      assert.ok(result.optimized.totalTokens <= budget, 'Should respect token budget');
      assert.ok(result.optimized.packed.length > 0, 'Should return optimized results');
      assert.ok(memoryGrowth < 10 * 1024 * 1024, 'Memory usage should be reasonable');
    });

    test('should test scalability with large result sets', async () => {
      const searchResults = generateSearchResults(100, 'medium');
      const budget = 5000;
      const model = 'claude-3';
      const repository = 'scalability-test-repo';
      
      // Setup repository
      storage.files.insert({
        repo: repository,
        path: 'src/index.js',
        content_hash: 'hash1',
        lang: 'javascript'
      });
      
      perfMonitor.start('large-scale-workflow');
      
      const result = await searchIntegration.optimizeSearchResults(
        'scalability test query',
        searchResults,
        { repository, model, budget }
      );
      
      const workflowTime = perfMonitor.end('large-scale-workflow');
      
      console.log(\`\\nLarge Scale Performance:
  Total time: \${workflowTime.toFixed(2)}ms
  Input results: \${searchResults.length}
  Output items: \${result.optimized.packed.length}
  Time per item: \${(workflowTime / searchResults.length).toFixed(2)}ms\`);
      
      // Should handle large sets efficiently
      assert.ok(workflowTime < 3000, \`Large scale workflow should be efficient (< 3s), got \${workflowTime}ms\`);
      assert.ok(result.optimized.totalTokens <= budget, 'Should respect token budget');
      assert.ok(result.optimized.packed.length > 0, 'Should return optimized results');
      assert.ok(workflowTime / searchResults.length < 50, \`Should be < 50ms per item, got \${workflowTime / searchResults.length}ms\`);
    });

    test('should measure degradation performance impact', async () => {
      const searchResults = generateSearchResults(30, 'large');
      const budgets = [500, 1500, 3000]; // Different constraint levels
      const model = 'gpt-4';
      const repository = 'degradation-test-repo';
      
      // Setup repository
      storage.files.insert({
        repo: repository,
        path: 'src/index.js',
        content_hash: 'hash1',
        lang: 'javascript'
      });
      
      const results = {};
      
      for (const budget of budgets) {
        perfMonitor.start(\`degradation-\${budget}\`);
        
        const result = await searchIntegration.optimizeSearchResults(
          'degradation test query',
          searchResults,
          { repository, model, budget }
        );
        
        const duration = perfMonitor.end(\`degradation-\${budget}\`);
        
        results[budget] = {
          duration,
          itemsProcessed: result.optimized.packed.length,
          tokensUsed: result.optimized.totalTokens,
          degraded: result.optimized.totalTokens < searchResults.reduce((sum, item) => sum + item.content.length / 4, 0)
        };
      }
      
      console.log(\`\\nDegradation Performance Impact:`);
      Object.entries(results).forEach(([budget, result]) => {
        console.log(\`  Budget \${budget}: \${result.duration.toFixed(2)}ms, \${result.itemsProcessed} items, \${result.tokensUsed} tokens\`);
      });
      
      // Performance should remain reasonable even with degradation
      Object.values(results).forEach(result => {
        assert.ok(result.duration < 2000, \`Degradation should be fast (< 2s), got \${result.duration}ms\`);
      });
    });
  });

  describe('Concurrent Performance Tests', () => {
    test('should handle concurrent tokenization efficiently', async () => {
      const model = 'gpt-4';
      const content = generateTestContent('medium');
      const concurrency = 10;
      const iterations = 20;
      
      perfMonitor.start('concurrent-tokenization');
      
      const promises = Array.from({ length: concurrency }, async (_, i) => {
        const results = [];
        for (let j = 0; j < iterations; j++) {
          const tokenizer = createTokenizer(model);
          const tokenCount = tokenizer.countTokens(content + \` // worker \${i} iteration \${j}\`);
          results.push(tokenCount);
        }
        return results;
      });
      
      const allResults = await Promise.all(promises);
      const duration = perfMonitor.end('concurrent-tokenization');
      
      const totalOperations = concurrency * iterations;
      const avgTimePerOperation = duration / totalOperations;
      
      console.log(\`\\nConcurrent Tokenization:
  Total time: \${duration.toFixed(2)}ms
  Operations: \${totalOperations}
  Avg time per operation: \${avgTimePerOperation.toFixed(3)}ms
  Concurrency: \${concurrency}\`);
      
      assert.ok(allResults.length === concurrency, 'Should complete all concurrent operations');
      assert.ok(allResults.every(results => results.length === iterations), 'Each worker should complete all iterations');
      assert.ok(avgTimePerOperation < 10, \`Concurrent operations should be efficient (< 10ms/op), got \${avgTimePerOperation}ms\`);
    });

    test('should handle concurrent profile operations', async () => {
      const repositories = Array.from({ length: 5 }, (_, i) => \`concurrent-repo-\${i}\`);
      const model = 'gpt-4';
      
      // Setup repositories
      repositories.forEach(repo => {
        storage.files.insert({
          repo,
          path: 'src/index.js',
          content_hash: 'hash1',
          lang: 'javascript'
        });
      });
      
      perfMonitor.start('concurrent-profiles');
      
      const promises = repositories.map(async repo => {
        return await profileManager.getProfile(repo, model);
      });
      
      const profiles = await Promise.all(promises);
      const duration = perfMonitor.end('concurrent-profiles');
      
      console.log(\`\\nConcurrent Profile Operations:
  Total time: \${duration.toFixed(2)}ms
  Repositories: \${repositories.length}
  Avg time per profile: \${(duration / repositories.length).toFixed(2)}ms\`);
      
      assert.strictEqual(profiles.length, repositories.length, 'Should create profile for each repository');
      assert.ok(duration / repositories.length < 500, \`Profile creation should be efficient (< 500ms/profile), got \${duration / repositories.length}ms\`);
    });
  });

  describe('Performance Regression Tests', () => {
    test('should maintain performance within acceptable bounds', () => {
      const model = 'gpt-4';
      const content = generateTestContent('medium');
      const iterations = 100;
      
      // Benchmark individual operations
      perfMonitor.start('token-counting-benchmark');
      const tokenizer = createTokenizer(model);
      
      for (let i = 0; i < iterations; i++) {
        tokenizer.countTokens(content + \` // iteration \${i}\`);
      }
      
      const tokenCountingTime = perfMonitor.end('token-counting-benchmark');
      const avgTimePerTokenCount = tokenCountingTime / iterations;
      
      // Benchmark context fitting
      perfMonitor.start('context-fitting-benchmark');
      
      for (let i = 0; i < Math.floor(iterations / 2); i++) {
        tokenizer.fitToContext(content, 1000);
      }
      
      const contextFittingTime = perfMonitor.end('context-fitting-benchmark');
      const avgTimePerContextFit = contextFittingTime / (iterations / 2);
      
      console.log(\`\\nPerformance Regression Tests:
  Token counting: \${avgTimePerTokenCount.toFixed(3)}ms/call
  Context fitting: \${avgTimePerContextFit.toFixed(3)}ms/call\`);
      
      // Regression thresholds
      assert.ok(avgTimePerTokenCount < 5, \`Token counting regression - should be < 5ms/call, got \${avgTimePerTokenCount}ms\`);
      assert.ok(avgTimePerContextFit < 15, \`Context fitting regression - should be < 15ms/call, got \${avgTimePerContextFit}ms\`);
    });

    test('should validate cache performance over time', () => {
      const model = 'gpt-4';
      const uniqueContents = Array.from({ length: 50 }, (_, i) => 
        generateTestContent('small').replace(/test/g, \`test\${i}\`)
      );
      
      // Warm up cache
      uniqueContents.forEach(content => {
        const tokenizer = createTokenizer(model);
        tokenizer.countTokens(content);
      });
      
      // Measure cache performance
      const cacheTimes = [];
      
      for (let round = 0; round < 5; round++) {
        perfMonitor.start(\`cache-round-\${round}\`);
        
        uniqueContents.forEach(content => {
          const tokenizer = createTokenizer(model);
          tokenizer.countTokens(content);
        });
        
        const roundTime = perfMonitor.end(\`cache-round-\${round}\`);
        cacheTimes.push(roundTime);
      }
      
      const avgCacheTime = cacheTimes.reduce((sum, time) => sum + time, 0) / cacheTimes.length;
      const maxCacheTime = Math.max(...cacheTimes);
      const minCacheTime = Math.min(...cacheTimes);
      
      console.log(\`\\nCache Performance Over Time:
  Average: \${avgCacheTime.toFixed(2)}ms
  Min: \${minCacheTime.toFixed(2)}ms
  Max: \${maxCacheTime.toFixed(2)}ms
  Variance: \${(maxCacheTime - minCacheTime).toFixed(2)}ms\`);
      
      // Cache performance should be stable
      assert.ok(maxCacheTime - minCacheTime < avgCacheTime * 0.5, 'Cache performance should be stable over time');
      assert.ok(avgCacheTime < 100, 'Cached operations should be fast');
    });
  });
});