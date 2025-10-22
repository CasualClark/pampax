const { parseCignore, validateCignoreFile } = require('../../src/progressive/cignore-parser');

describe('Cignore Parser', () => {
    describe('parseCignore', () => {
        test('parses simple patterns', () => {
            const content = `
node_modules/
*.log
.env
`;
            const parsed = parseCignore(content);

            expect(parsed.patterns).toHaveLength(3);
            expect(parsed.patterns[0].pattern).toBe('node_modules/');
            expect(parsed.patterns[1].pattern).toBe('*.log');
            expect(parsed.patterns[2].pattern).toBe('.env');
        });

        test('parses negated patterns', () => {
            const content = `
node_modules/
!src/
*.log
!README.md
`;
            const parsed = parseCignore(content);

            expect(parsed.patterns).toHaveLength(4);
            expect(parsed.patterns[0].negated).toBe(false);
            expect(parsed.patterns[1].negated).toBe(true);
            expect(parsed.patterns[1].pattern).toBe('src/');
            expect(parsed.patterns[3].negated).toBe(true);
            expect(parsed.patterns[3].pattern).toBe('README.md');
        });

        test('parses comments', () => {
            const content = `
# This is a comment
node_modules/  # ignore dependencies
*.log          # ignore log files

# Another comment
.env
`;
            const parsed = parseCignore(content);

            expect(parsed.patterns).toHaveLength(3);
            expect(parsed.patterns[0].comment).toBe('ignore dependencies');
            expect(parsed.patterns[1].comment).toBe('ignore log files');
            expect(parsed.patterns[2].comment).toBeUndefined();
        });

        test('parses special groups', () => {
            const content = `
@env
@build
@custom Custom group description
  *.custom.js
  !important.custom.js
`;
            const parsed = parseCignore(content);

            expect(parsed.groups).toHaveLength(3);
            
            const envGroup = parsed.groups.find(g => g.name === 'env');
            expect(envGroup).toBeDefined();
            expect(envGroup.description).toBe('Environment files');
            
            const customGroup = parsed.groups.find(g => g.name === 'custom');
            expect(customGroup).toBeDefined();
            expect(customGroup.description).toBe('Custom group description');
            expect(customGroup.patterns).toHaveLength(2);
        });

        test('handles empty content', () => {
            const parsed = parseCignore('');
            expect(parsed.patterns).toHaveLength(0);
            expect(parsed.groups).toHaveLength(0);
        });

        test('handles whitespace-only content', () => {
            const content = `
   
# Just comments
   
   
`;
            const parsed = parseCignore(content);
            expect(parsed.patterns).toHaveLength(0);
            expect(parsed.groups).toHaveLength(0);
        });
    });

    describe('validateCignoreFile', () => {
        test('validates correct content', () => {
            const content = `
node_modules/
*.log
@env
`;
            const validation = validateCignoreFile(content);
            
            expect(validation.valid).toBe(true);
            expect(validation.errors).toHaveLength(0);
            expect(validation.patternCount).toBe(2);
            expect(validation.groupCount).toBe(1);
        });

        test('detects invalid group syntax', () => {
            const content = `
node_modules/
@invalid-group-name
@123invalid
`;
            const validation = validateCignoreFile(content);
            
            expect(validation.valid).toBe(false);
            expect(validation.errors.length).toBeGreaterThan(0);
        });

        test('handles empty file', () => {
            const validation = validateCignoreFile('');
            
            expect(validation.valid).toBe(true);
            expect(validation.patternCount).toBe(0);
            expect(validation.groupCount).toBe(0);
        });
    });

    describe('pattern matching', () => {
        test('matches simple glob patterns', () => {
            const content = `
*.js
node_modules/
src/
`;
            const parsed = parseCignore(content);

            expect(parsed.matches('app.js')).toBe(true);
            expect(parsed.matches('node_modules/package.json')).toBe(true);
            expect(parsed.matches('src/index.js')).toBe(true);
            expect(parsed.matches('README.md')).toBe(false);
        });

        test('respects negated patterns', () => {
            const content = `
node_modules/
!node_modules/important/
*.log
!important.log
`;
            const parsed = parseCignore(content);

            expect(parsed.matches('node_modules/package.json')).toBe(true);
            expect(parsed.matches('node_modules/important/index.js')).toBe(false);
            expect(parsed.matches('debug.log')).toBe(true);
            expect(parsed.matches('important.log')).toBe(false);
        });

        test('matches special groups', () => {
            const content = `
@env
@build
`;
            const parsed = parseCignore(content);

            expect(parsed.matches('.env')).toBe(true);
            expect(parsed.matches('dist/')).toBe(true);
            expect(parsed.matches('src/')).toBe(false);
        });

        test('provides match details', () => {
            const content = `
*.js  # JavaScript files
!test.js  # Keep test file
`;
            const parsed = parseCignore(content);

            const match = parsed.matches('app.js');
            expect(match).toBe(true);
            expect(match.matchedPattern.pattern).toBe('*.js');
            expect(match.matchedPattern.comment).toBe('JavaScript files');

            const negatedMatch = parsed.matches('test.js');
            expect(negatedMatch).toBe(false);
            expect(negatedMatch.matchedPattern.pattern).toBe('test.js');
            expect(negatedMatch.matchedPattern.negated).toBe(true);
        });
    });

    describe('special groups', () => {
        test('built-in groups have correct patterns', () => {
            const content = `@env`;
            const parsed = parseCignore(content);

            expect(parsed.matches('.env')).toBe(true);
            expect(parsed.matches('.env.local')).toBe(true);
            expect(parsed.matches('.env.production')).toBe(true);
            expect(parsed.matches('config.js')).toBe(false);
        });

        test('custom groups override built-in', () => {
            const content = `
@env
  .custom-env
`;
            const parsed = parseCignore(content);

            expect(parsed.matches('.env')).toBe(false);
            expect(parsed.matches('.custom-env')).toBe(true);
        });
    });
});