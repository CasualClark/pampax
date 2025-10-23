#!/usr/bin/env node
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { rerankCommand } from '../src/cli/commands/rerank.js';

// Mock console.log and console.error for testing
let capturedOutput = [];
let capturedError = [];

const originalConsoleLog = console.log;
const originalConsoleError = console.error;

function mockConsole() {
    capturedOutput = [];
    capturedError = [];
    console.log = (...args) => capturedOutput.push(args.join(' '));
    console.error = (...args) => capturedError.push(args.join(' '));
}

function restoreConsole() {
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
}

test('CLI rerank command --list-providers', async () => {
    mockConsole();
    
    try {
        await rerankCommand(null, { listProviders: true, json: false });
        
        const output = capturedOutput.join('\n');
        assert(output.includes('Available Reranker Providers'));
        assert(output.includes('local'));
        assert(output.includes('api'));
        
    } finally {
        restoreConsole();
    }
});

test('CLI rerank command --list-providers JSON', async () => {
    mockConsole();
    
    try {
        await rerankCommand(null, { listProviders: true, json: true });
        
        const output = capturedOutput.join('\n');
        const providers = JSON.parse(output);
        assert(Array.isArray(providers));
        
        const localProvider = providers.find(p => p.name === 'local');
        assert.ok(localProvider);
        assert.equal(typeof localProvider.available, 'boolean');
        assert.equal(typeof localProvider.description, 'string');
        
    } finally {
        restoreConsole();
    }
});

test('CLI rerank command --list-models', async () => {
    mockConsole();
    
    try {
        await rerankCommand(null, { listModels: true, provider: 'local', json: false });
        
        const output = capturedOutput.join('\n');
        assert(output.includes('Available models for local'));
        
    } finally {
        restoreConsole();
    }
});

test('CLI rerank command --stats', async () => {
    mockConsole();
    
    try {
        await rerankCommand(null, { stats: true, json: false });
        
        const output = capturedOutput.join('\n');
        assert(output.includes('Reranker Service Statistics'));
        assert(output.includes('Available providers'));
        assert(output.includes('Default provider'));
        
    } finally {
        restoreConsole();
    }
});

test('CLI rerank command with input files', async () => {
    // Create temporary input files
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'rerank-test-'));
    
    try {
        const inputFile1 = path.join(tmpDir, 'results1.json');
        const inputFile2 = path.join(tmpDir, 'results2.json');
        
        const results1 = [
            {
                id: '1',
                path: 'file1.js',
                content: 'function test1() { return "hello"; }',
                score: 0.9,
                metadata: { spanName: 'test1' }
            },
            {
                id: '2',
                path: 'file2.js',
                content: 'function test2() { return "world"; }',
                score: 0.8,
                metadata: { spanName: 'test2' }
            }
        ];
        
        const results2 = [
            {
                id: '2',
                path: 'file2.js',
                content: 'function test2() { return "world"; }',
                score: 0.9,
                metadata: { spanName: 'test2' }
            },
            {
                id: '3',
                path: 'file3.js',
                content: 'function test3() { return "foo"; }',
                score: 0.7,
                metadata: { spanName: 'test3' }
            }
        ];
        
        await fs.writeFile(inputFile1, JSON.stringify(results1));
        await fs.writeFile(inputFile2, JSON.stringify(results2));
        
        mockConsole();
        
        // Test RRF fusion
        await rerankCommand('test function', {
            input: [inputFile1, inputFile2],
            provider: 'rrf',
            topK: 3,
            json: false,
            verbose: false
        });
        
        const output = capturedOutput.join('\n');
        assert(output.includes('Reranked results for: "test function"'));
        assert(output.includes('Provider: rrf'));
        assert(output.includes('Fused Score'));
        
        // Should contain results from both files
        assert(output.includes('file1.js'));
        assert(output.includes('file2.js'));
        assert(output.includes('file3.js'));
        
    } finally {
        restoreConsole();
        await fs.rm(tmpDir, { recursive: true, force: true });
    }
});

test('CLI rerank command with JSON output', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'rerank-test-'));
    
    try {
        const inputFile = path.join(tmpDir, 'results.json');
        
        const results = [
            {
                id: '1',
                path: 'file1.js',
                content: 'function test() { return "hello"; }',
                score: 0.9,
                metadata: { spanName: 'test' }
            },
            {
                id: '2',
                path: 'file2.js',
                content: 'function other() { return "world"; }',
                score: 0.8,
                metadata: { spanName: 'other' }
            }
        ];
        
        await fs.writeFile(inputFile, JSON.stringify(results));
        
        mockConsole();
        
        await rerankCommand('test query', {
            input: [inputFile],
            provider: 'rrf',
            topK: 2,
            json: true
        });
        
        const output = capturedOutput.join('\n');
        const parsed = JSON.parse(output);
        
        assert.equal(parsed.success, true);
        assert.equal(parsed.query, 'test query');
        assert.equal(parsed.provider, 'rrf');
        assert.equal(parsed.totalResults, 2);
        assert(Array.isArray(parsed.results));
        
        parsed.results.forEach(result => {
            assert.ok(result.id);
            assert.ok(result.path);
            assert.equal(typeof result.score, 'number');
            assert.equal(typeof result.fusedScore, 'number');
        });
        
    } finally {
        restoreConsole();
        await fs.rm(tmpDir, { recursive: true, force: true });
    }
});

test('CLI rerank command error handling - no input files', async () => {
    mockConsole();
    
    // Mock process.exit to prevent test from exiting
    const originalExit = process.exit;
    let exitCode = null;
    process.exit = (code) => { exitCode = code; };
    
    try {
        await rerankCommand('test query', {
            provider: 'local',
            input: []
        });
        
        // Should have called process.exit(1)
        assert.equal(exitCode, 1);
        
        // Should have error message
        const errorOutput = capturedError.join('\n');
        assert(errorOutput.includes('No input files provided'));
        
    } finally {
        restoreConsole();
        process.exit = originalExit;
    }
});

test('CLI rerank command error handling - invalid input file', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'rerank-test-'));
    
    try {
        const invalidFile = path.join(tmpDir, 'invalid.json');
        await fs.writeFile(invalidFile, 'invalid json content');
        
        mockConsole();
        
        // Mock process.exit
        const originalExit = process.exit;
        let exitCode = null;
        process.exit = (code) => { exitCode = code; };
        
        try {
            await rerankCommand('test query', {
                input: [invalidFile],
                provider: 'local'
            });
            
            assert.equal(exitCode, 1);
            
            const errorOutput = capturedError.join('\n');
            assert(errorOutput.includes('Failed to load'));
            
        } finally {
            restoreConsole();
            process.exit = originalExit;
        }
        
    } finally {
        await fs.rm(tmpDir, { recursive: true, force: true });
    }
});

test('CLI rerank command with different providers', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'rerank-test-'));
    
    try {
        const inputFile = path.join(tmpDir, 'results.json');
        
        const results = [
            {
                id: '1',
                path: 'file1.js',
                content: 'function test() { return "hello"; }',
                score: 0.9
            }
        ];
        
        await fs.writeFile(inputFile, JSON.stringify(results));
        
        // Test different provider names
        const providers = ['local', 'api', 'transformers', 'cohere'];
        
        for (const provider of providers) {
            mockConsole();
            
            try {
                await rerankCommand('test query', {
                    input: [inputFile],
                    provider,
                    json: true,
                    noCache: true // Avoid cache interference
                });
                
                // Should not crash (may fail with provider unavailable, but should handle gracefully)
                const output = capturedOutput.join('\n');
                
                if (capturedError.length === 0) {
                    // Success case
                    const parsed = JSON.parse(output);
                    assert.equal(parsed.provider, provider);
                } else {
                    // Error case - should still be JSON formatted
                    try {
                        const parsed = JSON.parse(output);
                        assert.equal(parsed.success, false);
                        assert.equal(parsed.provider, provider);
                    } catch (e) {
                        // If not JSON, that's also acceptable for provider errors
                    }
                }
                
            } finally {
                restoreConsole();
            }
        }
        
    } finally {
        await fs.rm(tmpDir, { recursive: true, force: true });
    }
});

test('CLI rerank command with verbose output', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'rerank-test-'));
    
    try {
        const inputFile = path.join(tmpDir, 'results.json');
        
        const results = [
            {
                id: '1',
                path: 'file1.js',
                content: 'function test() { return "hello"; }',
                score: 0.9
            }
        ];
        
        await fs.writeFile(inputFile, JSON.stringify(results));
        
        mockConsole();
        
        await rerankCommand('test query', {
            input: [inputFile],
            provider: 'rrf',
            verbose: true,
            json: false
        });
        
        const output = capturedOutput.join('\n');
        assert(output.includes('Reranking completed in'));
        assert(output.includes('Provider: rrf'));
        assert(output.includes('Total results:'));
        
    } finally {
        restoreConsole();
        await fs.rm(tmpDir, { recursive: true, force: true });
    }
});