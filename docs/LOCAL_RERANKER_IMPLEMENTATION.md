# Local Reranker Implementation

## Overview

This document describes the implementation of local cross-encoder rerankers in PAMPAX, following the provider pattern for extensibility and maintaining parity with cloud API patterns.

## Architecture

### Provider Pattern

The reranking system is built around a provider pattern that allows for:

- **Extensibility**: Easy addition of new reranking providers
- **Consistency**: Uniform interface across all providers
- **Fallback**: Automatic fallback to alternative providers
- **Caching**: Built-in caching with deterministic outputs
- **Configuration**: Flexible configuration per provider

### Core Components

1. **RerankerProvider** (Base Class)
   - Abstract base class defining the provider interface
   - Handles caching, validation, and common functionality
   - Enforces consistent error handling

2. **LocalCrossEncoderProvider**
   - Local implementation using Transformers.js
   - Supports multiple cross-encoder models
   - Quantized models for memory efficiency
   - Graceful fallback when models fail to load

3. **APIRerankerProvider**
   - Wrapper for cloud-based reranking APIs
   - Supports Cohere, Voyage, Jina AI, and compatible APIs
   - Handles different response formats automatically

4. **RerankerService**
   - High-level service orchestrating providers
   - Backward compatibility with legacy code
   - Provider routing and fallback logic
   - RRF fusion implementation

5. **RerankerProviderRegistry**
   - Registry for available providers
   - Provider discovery and status checking
   - Dynamic provider registration

## Usage

### CLI Interface

```bash
# List available providers
pampax rerank --list-providers

# List available models for a provider
pampax rerank --list-models --provider local

# Show service statistics
pampax rerank --stats

# Rerank with local cross-encoder
pampax rerank "search query" --provider local --model Xenova/ms-marco-MiniLM-L-6-v2 --input results.json

# Rerank with API provider
pampax rerank "search query" --provider api --api-key YOUR_KEY --input results.json

# RRF fusion
pampax rerank "search query" --provider rrf --input results1.json results2.json
```

### Programmatic Interface

```javascript
import { rerank, getAvailableProviders } from './src/ranking/reranker-service.js';

// Simple reranking
const results = await rerank('search query', documents, {
    provider: 'local',
    model: 'Xenova/ms-marco-MiniLM-L-6-v2',
    topK: 10
});

// Get available providers
const providers = await getAvailableProviders();
console.log(providers);
```

### Provider Configuration

```javascript
import { LocalCrossEncoderProvider } from './src/ranking/reranker-provider.js';

const localProvider = new LocalCrossEncoderProvider({
    model: 'Xenova/bge-reranker-base',
    maxCandidates: 100,
    maxTokens: 512,
    quantized: true,
    cachePath: '.pampax/custom-cache.json'
});

const results = await localProvider.rerank('query', documents);
```

## Available Models

### Local Cross-Encoder Models

- **Xenova/ms-marco-MiniLM-L-6-v2** (default)
  - Fast, lightweight model
  - Good for general-purpose reranking
  - ~22MB when quantized

- **Xenova/ms-marco-MiniLM-L-12-v2**
  - Larger version with better accuracy
  - ~44MB when quantized

- **Xenova/bge-reranker-base**
  - BGE reranking model
  - Good performance on code and technical content
  - ~400MB when quantized

- **Xenova/bge-reranker-large**
  - High-performance BGE model
  - Best accuracy for complex queries
  - ~1.1GB when quantized

### API Models

- **Cohere**: rerank-v3.5, rerank-english-v2.0, rerank-multilingual-v2.0
- **Voyage**: rerank-lite-1, rerank-1
- **Jina AI**: jina-reranker-v1-base-en

## Caching

### Cache Semantics

- **Deterministic**: Same inputs always produce same cache key
- **TTL**: 24-hour cache expiration by default
- **Provider-aware**: Separate cache per provider
- **Configurable**: Custom cache paths and TTLs

### Cache Key Generation

```javascript
// Cache key includes:
// - Provider name
// - Query text
// - Document IDs/content hashes
// - Model configuration
// - Options that affect results
```

### Cache Management

```javascript
// Clear cache
provider.cache.clear();

// Cleanup expired entries
provider.cache.cleanup();

// Custom cache configuration
const provider = new LocalCrossEncoderProvider({
    cachePath: '.pampax/rerank-cache.json'
});
```

## Performance

### Local Model Performance

| Model | Size (Quantized) | Latency (per doc) | Memory Usage |
|-------|------------------|-------------------|--------------|
| MiniLM-L-6-v2 | ~22MB | ~10ms | ~50MB |
| MiniLM-L-12-v2 | ~44MB | ~15ms | ~80MB |
| BGE-base | ~400MB | ~50ms | ~600MB |
| BGE-large | ~1.1GB | ~80ms | ~1.5GB |

### Optimization Tips

1. **Use quantized models** (default: enabled)
2. **Limit maxCandidates** for large result sets
3. **Enable caching** for repeated queries
4. **Choose appropriate model size** for your use case
5. **Use fallback providers** for reliability

## Error Handling

### Provider Fallback

```javascript
const service = new RerankerService({
    defaultProvider: 'local',
    fallbackProvider: 'rrf'
});

// If local fails, automatically falls back to RRF
const results = await service.rerank('query', documents);
```

### Graceful Degradation

- Model loading failures → Return original order
- API failures → Fallback to alternative provider
- Cache errors → Continue without caching
- Invalid inputs → Detailed error messages

## Testing

### Unit Tests

```bash
# Run reranker provider tests
npm test test/reranker-provider.test.js

# Run reranker service tests
npm test test/reranker-service.test.js

# Run CLI integration tests
npm test test/cli-rerank-integration.test.js
```

### Mock Mode

Set `PAMPAX_MOCK_RERANKER_TESTS=1` to enable mock mode for testing:

```javascript
process.env.PAMPAX_MOCK_RERANKER_TESTS = '1';
const results = await rerank('query', documents);
// Uses mock scoring instead of actual models
```

## Configuration

### Environment Variables

```bash
# Local reranker configuration
PAMPAX_RERANKER_MODEL=Xenova/ms-marco-MiniLM-L-6-v2
PAMPAX_RERANKER_MAX=50
PAMPAX_RERANKER_MAX_TOKENS=512

# API reranker configuration
PAMPAX_RERANK_API_URL=https://api.cohere.ai/v1/rerank
PAMPAX_RERANK_API_KEY=your-api-key
PAMPAX_RERANK_MODEL=rerank-v3.5

# Cache configuration
PAMPAX_RERANK_CACHE_PATH=.pampax/rerank-cache.json
```

### Configuration File

```json
{
  "reranker": {
    "defaultProvider": "local",
    "fallbackProvider": "rrf",
    "cache": true,
    "local": {
      "model": "Xenova/ms-marco-MiniLM-L-6-v2",
      "maxCandidates": 50,
      "maxTokens": 512,
      "quantized": true
    },
    "api": {
      "apiUrl": "https://api.cohere.ai/v1/rerank",
      "apiKey": "${PAMPAX_RERANK_API_KEY}",
      "model": "rerank-v3.5"
    }
  }
}
```

## Integration with Existing Systems

### Backward Compatibility

The new system maintains full backward compatibility:

```javascript
// Legacy code continues to work
import { rerankCrossEncoder } from './src/ranking/crossEncoderReranker.js';
const results = await rerankCrossEncoder('query', candidates);

// New recommended approach
import { rerank } from './src/ranking/reranker-service.js';
const results = await rerank('query', documents, { provider: 'local' });
```

### Migration Guide

1. **Update CLI calls**: Change `--provider transformers` to `--provider local`
2. **Update API calls**: Use new `rerank()` function instead of direct provider calls
3. **Configuration**: Migrate to new configuration format
4. **Testing**: Update tests to use new interfaces

## Troubleshooting

### Common Issues

1. **Model loading fails**
   - Check network connection for first download
   - Verify sufficient disk space (~2GB for largest models)
   - Try smaller model or enable quantization

2. **Memory issues**
   - Use smaller models (MiniLM instead of BGE)
   - Reduce `maxCandidates` limit
   - Enable quantization

3. **Slow performance**
   - Enable caching
   - Use smaller models for prototyping
   - Limit document length with `maxTokens`

4. **API provider issues**
   - Verify API key and URL
   - Check rate limits
   - Configure fallback provider

### Debug Mode

```bash
# Enable debug logging
DEBUG=1 pampax rerank "query" --provider local --input results.json --verbose

# Test provider availability
pampax rerank --list-providers --json
```

## Future Enhancements

### Planned Features

1. **Additional local models**
   - Code-specific rerankers
   - Multilingual models
   - Domain-specific models

2. **Performance improvements**
   - Batch processing
   - Model streaming
   - GPU acceleration

3. **Advanced features**
   - Query expansion
   - Multi-stage reranking
   - Custom scoring functions

4. **Monitoring**
   - Performance metrics
   - Usage analytics
   - Error tracking

### Contributing

To add a new provider:

1. Extend `RerankerProvider` class
2. Implement required methods
3. Register in `RerankerProviderRegistry`
4. Add comprehensive tests
5. Update documentation

See `src/ranking/reranker-provider.js` for the base interface and examples.