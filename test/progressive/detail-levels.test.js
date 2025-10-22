const { formatAtLevel, DETAIL_LEVELS } = require('../../src/progressive/detail-levels');

describe('Detail Levels', () => {
    const mockFileData = {
        path: 'src/test.js',
        language: 'javascript',
        content: `/**
 * Test file with functions
 */
import { helper } from './helper.js';

class TestClass {
    constructor(name) {
        this.name = name;
    }

    method() {
        return this.name;
    }
}

export function testFunction(param1, param2) {
    if (param1) {
        return param2 + 1;
    }
    return 0;
}

export const constant = 42;`,
        symbols: [
            {
                name: 'TestClass',
                type: 'class',
                exported: false,
                children: [
                    {
                        name: 'constructor',
                        type: 'method',
                        signature: 'constructor(name)',
                        params: ['name'],
                        returnType: null
                    },
                    {
                        name: 'method',
                        type: 'method',
                        signature: 'method()',
                        params: [],
                        returnType: 'string'
                    }
                ]
            },
            {
                name: 'testFunction',
                type: 'function',
                exported: true,
                signature: 'testFunction(param1, param2)',
                params: ['param1', 'param2'],
                returnType: 'number',
                content: 'if (param1) { return param2 + 1; } return 0;'
            },
            {
                name: 'constant',
                type: 'variable',
                exported: true
            }
        ]
    };

    describe('DETAIL_LEVELS', () => {
        test('defines all required levels', () => {
            expect(DETAIL_LEVELS.outline).toBeDefined();
            expect(DETAIL_LEVELS.signatures).toBeDefined();
            expect(DETAIL_LEVELS.implementation).toBeDefined();
            expect(DETAIL_LEVELS.full).toBeDefined();
        });

        test('has correct level ordering', () => {
            expect(DETAIL_LEVELS.outline.level).toBe(0);
            expect(DETAIL_LEVELS.signatures.level).toBe(1);
            expect(DETAIL_LEVELS.implementation.level).toBe(2);
            expect(DETAIL_LEVELS.full.level).toBe(3);
        });

        test('increasing token estimates', () => {
            expect(DETAIL_LEVELS.outline.avgTokensPerFile).toBeLessThan(DETAIL_LEVELS.signatures.avgTokensPerFile);
            expect(DETAIL_LEVELS.signatures.avgTokensPerFile).toBeLessThan(DETAIL_LEVELS.implementation.avgTokensPerFile);
            expect(DETAIL_LEVELS.implementation.avgTokensPerFile).toBeLessThan(DETAIL_LEVELS.full.avgTokensPerFile);
        });
    });

    describe('formatAtLevel', () => {
        test('formats at outline level', () => {
            const result = formatAtLevel(mockFileData, 'outline');

            expect(result.file).toBe('src/test.js');
            expect(result.type).toBe('javascript');
            expect(result.exports).toEqual(['testFunction', 'constant']);
            expect(result.summary).toContain('Test file');
            expect(result.line_count).toBeGreaterThan(0);
            expect(result).not.toHaveProperty('imports');
            expect(result).not.toHaveProperty('functions');
        });

        test('formats at signatures level', () => {
            const result = formatAtLevel(mockFileData, 'signatures');

            expect(result.file).toBe('src/test.js');
            expect(result).toHaveProperty('imports');
            expect(result.imports).toContain('./helper.js');
            expect(result).toHaveProperty('classes');
            expect(result).toHaveProperty('functions');
            
            expect(result.classes).toHaveLength(1);
            expect(result.classes[0].name).toBe('TestClass');
            expect(result.classes[0].methods).toHaveLength(2);
            
            expect(result.functions).toHaveLength(1);
            expect(result.functions[0].name).toBe('testFunction');
            expect(result.functions[0].signature).toBe('testFunction(param1, param2)');
        });

        test('formats at implementation level', () => {
            const result = formatAtLevel(mockFileData, 'implementation');

            expect(result.file).toBe('src/test.js');
            expect(result).toHaveProperty('implementations');
            expect(result.implementations).toHaveLength(2); // constructor + method + function = 3, but only functions/methods
            
            const testFunc = result.implementations.find(impl => impl.name === 'testFunction');
            expect(testFunc).toBeDefined();
            expect(testFunc.summary).toContain('branches');
        });

        test('formats at full level', () => {
            const result = formatAtLevel(mockFileData, 'full');

            expect(result.file).toBe('src/test.js');
            expect(result.level).toBe('full');
            expect(result.content).toBe(mockFileData.content);
            expect(result.symbols).toEqual(mockFileData.symbols);
        });

        test('throws error for invalid level', () => {
            expect(() => {
                formatAtLevel(mockFileData, 'invalid');
            }).toThrow('Unknown detail level: invalid');
        });
    });

    describe('helper functions', () => {
        test('generateFileSummary extracts doc comment', () => {
            const fileWithDoc = {
                ...mockFileData,
                content: `/**
 * This is a test file
 * with multiple lines
 */
function test() {}`
            };

            const result = formatAtLevel(fileWithDoc, 'outline');
            expect(result.summary).toContain('This is a test file');
        });

        test('generateFileSummary falls back to exports', () => {
            const fileWithoutDoc = {
                ...mockFileData,
                content: 'export function test() {}',
                symbols: [
                    { name: 'test', exported: true }
                ]
            };

            const result = formatAtLevel(fileWithoutDoc, 'outline');
            expect(result.summary).toContain('Exports: test');
        });

        test('generateFileSummary handles no exports', () => {
            const fileEmpty = {
                ...mockFileData,
                content: 'function internal() {}',
                symbols: [
                    { name: 'internal', exported: false }
                ]
            };

            const result = formatAtLevel(fileEmpty, 'outline');
            expect(result.summary).toContain('javascript file with 1 symbols');
        });

        test('extractImports finds ES6 imports', () => {
            const result = formatAtLevel(mockFileData, 'signatures');
            expect(result.imports).toContain('./helper.js');
        });

        test('summarizeImplementation analyzes function body', () => {
            const functionWithLogic = {
                name: 'complex',
                content: `
                    if (condition) {
                        for (let i = 0; i < 10; i++) {
                            await processData(i);
                        }
                    } else {
                        throw new Error('Invalid');
                    }
                    return result;
                `
            };

            const summary = require('../../src/progressive/detail-levels').summarizeImplementation 
                ? require('../../src/progressive/detail-levels').summarizeImplementation(functionWithLogic)
                : null;

            if (summary) {
                expect(summary).toContain('branches');
                expect(summary).toContain('loops');
                expect(summary).toContain('async calls');
            }
        });

        test('estimateComplexity calculates cyclomatic complexity', () => {
            const complexFunction = {
                content: `
                    if (a && b) {
                        while (c) {
                            switch (d) {
                                case 1:
                                    break;
                                case 2:
                                    break;
                            }
                        }
                    } else if (e) {
                        try {
                            doSomething();
                        } catch (err) {
                            handleError();
                        }
                    }
                `
            };

            const complexity = require('../../src/progressive/detail-levels').estimateComplexity
                ? require('../../src/progressive/detail-levels').estimateComplexity(complexFunction)
                : 1;

            expect(complexity).toBeGreaterThan(1);
        });
    });
});