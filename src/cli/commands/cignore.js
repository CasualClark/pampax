import path from 'path';
import fs from 'fs/promises';
import { parseCignore, validateCignoreFile } from '../../progressive/cignore-parser.js';

function resolveProjectPath(projectPath = '.') {
    return path.resolve(projectPath || '.');
}

function formatPattern(pattern, index) {
    const prefix = pattern.negated ? '!' : '';
    const type = pattern.type === 'special' ? `[${pattern.pattern}]` : pattern.pattern;
    const comment = pattern.comment ? `  # ${pattern.comment}` : '';
    return `${index + 1}. ${prefix}${type}${comment}`;
}

function formatGroup(group) {
    const lines = [];
    lines.push(`\n${group.name}:`);
    if (group.description) {
        lines.push(`  ${group.description}`);
    }
    group.patterns.forEach((pattern, i) => {
        lines.push(`  ${formatPattern(pattern, i)}`);
    });
    return lines.join('\n');
}

export function registerCignoreCommands(program) {
    const cignoreCommand = program
        .command('cignore')
        .description('Manage .cignore files for progressive context loading');

    cignoreCommand
        .command('init [path]')
        .description('Create a new .cignore file with common patterns')
        .action(async (projectPath = '.') => {
            const resolvedPath = resolveProjectPath(projectPath);
            const cignorePath = path.join(resolvedPath, '.cignore');
            
            try {
                // Check if file already exists
                await fs.access(cignorePath);
                console.log(`.cignore already exists at ${cignorePath}`);
                console.log('Use "pampa cignore show" to view contents or "pampa cignore edit" to modify');
                return;
            } catch {
                // File doesn't exist, create it
            }

            const defaultContent = `# .cignore - Progressive Context Loading Configuration
# Lines starting with # are comments
# Use ! to negate patterns (include instead of exclude)
# Special groups start with @

# Environment and configuration files
.env
.env.*
*.config.js
*.config.ts
package-lock.json
yarn.lock

# Build outputs and dependencies
node_modules/
dist/
build/
*.min.js
*.min.css

# Test files
test/
tests/
*.test.js
*.test.ts
*.spec.js
*.spec.ts

# Documentation
docs/
*.md
!README.md

# Special groups
@env        # Environment files (.env, .env.*)
@build      # Build outputs (dist/, build/, node_modules/)
@test       # Test files (test/, tests/, *.test.*)
@docs       # Documentation (docs/, *.md)
@vendor     # Third-party dependencies
@generated  # Generated files
`;

            await fs.writeFile(cignorePath, defaultContent, 'utf8');
            console.log(`Created .cignore at ${cignorePath}`);
            console.log('Edit the file to customize which files to exclude from progressive context loading');
        });

    cignoreCommand
        .command('show [path]')
        .description('Show parsed .cignore file contents')
        .action(async (projectPath = '.') => {
            const resolvedPath = resolveProjectPath(projectPath);
            const cignorePath = path.join(resolvedPath, '.cignore');
            
            try {
                const content = await fs.readFile(cignorePath, 'utf8');
                const parsed = parseCignore(content);
                
                console.log(`.cignore file at ${cignorePath}:`);
                
                if (parsed.patterns.length === 0 && parsed.groups.length === 0) {
                    console.log('  (empty file)');
                    return;
                }
                
                // Show regular patterns
                if (parsed.patterns.length > 0) {
                    console.log('\nPatterns:');
                    parsed.patterns.forEach((pattern, i) => {
                        console.log(`  ${formatPattern(pattern, i)}`);
                    });
                }
                
                // Show groups
                if (parsed.groups.length > 0) {
                    parsed.groups.forEach(group => {
                        console.log(formatGroup(group));
                    });
                }
                
            } catch (error) {
                if (error.code === 'ENOENT') {
                    console.log(`No .cignore file found at ${cignorePath}`);
                    console.log('Use "pampa cignore init" to create one');
                } else {
                    console.error(`Error reading .cignore: ${error.message}`);
                    process.exitCode = 1;
                }
            }
        });

    cignoreCommand
        .command('validate [path]')
        .description('Validate .cignore file syntax')
        .action(async (projectPath = '.') => {
            const resolvedPath = resolveProjectPath(projectPath);
            const cignorePath = path.join(resolvedPath, '.cignore');
            
            try {
                const content = await fs.readFile(cignorePath, 'utf8');
                const validation = validateCignoreFile(content);
                
                if (validation.valid) {
                    console.log('✅ .cignore file is valid');
                    console.log(`  ${validation.patternCount} patterns`);
                    console.log(`  ${validation.groupCount} groups`);
                } else {
                    console.log('❌ .cignore file has errors:');
                    validation.errors.forEach(error => {
                        console.log(`  Line ${error.line}: ${error.message}`);
                    });
                    process.exitCode = 1;
                }
                
            } catch (error) {
                if (error.code === 'ENOENT') {
                    console.log(`No .cignore file found at ${cignorePath}`);
                } else {
                    console.error(`Error validating .cignore: ${error.message}`);
                    process.exitCode = 1;
                }
            }
        });

    cignoreCommand
        .command('test <pattern> [path]')
        .description('Test if a file path matches .cignore patterns')
        .action(async (pattern, projectPath = '.') => {
            const resolvedPath = resolveProjectPath(projectPath);
            const cignorePath = path.join(resolvedPath, '.cignore');
            
            try {
                const content = await fs.readFile(cignorePath, 'utf8');
                const parsed = parseCignore(content);
                
                // Test the pattern
                const matches = parsed.matches(pattern);
                
                console.log(`Pattern: ${pattern}`);
                console.log(`Matches: ${matches ? '❌ Excluded' : '✅ Included'}`);
                
                if (matches && matches.matchedPattern) {
                    console.log(`Matched by: ${matches.matchedPattern.negated ? '!' : ''}${matches.matchedPattern.pattern}`);
                    if (matches.matchedPattern.comment) {
                        console.log(`Reason: ${matches.matchedPattern.comment}`);
                    }
                }
                
            } catch (error) {
                if (error.code === 'ENOENT') {
                    console.log(`No .cignore file found at ${cignorePath}`);
                } else {
                    console.error(`Error testing pattern: ${error.message}`);
                    process.exitCode = 1;
                }
            }
        });

    cignoreCommand
        .command('list-groups [path]')
        .description('List available special groups in .cignore')
        .action(async (projectPath = '.') => {
            const resolvedPath = resolveProjectPath(projectPath);
            const cignorePath = path.join(resolvedPath, '.cignore');
            
            try {
                const content = await fs.readFile(cignorePath, 'utf8');
                const parsed = parseCignore(content);
                
                if (parsed.groups.length === 0) {
                    console.log('No special groups found in .cignore');
                    return;
                }
                
                console.log('Available special groups:');
                parsed.groups.forEach(group => {
                    console.log(`  @${group.name}`);
                    if (group.description) {
                        console.log(`    ${group.description}`);
                    }
                    console.log(`    ${group.patterns.length} patterns`);
                });
                
            } catch (error) {
                if (error.code === 'ENOENT') {
                    console.log(`No .cignore file found at ${cignorePath}`);
                } else {
                    console.error(`Error listing groups: ${error.message}`);
                    process.exitCode = 1;
                }
            }
        });

    cignoreCommand.addHelpText('after', `
Examples:
  $ pampa cignore init                    # Create a new .cignore file
  $ pampa cignore show                    # Show parsed contents
  $ pampa cignore validate                # Check syntax
  $ pampa cignore test "node_modules/"    # Test if path is excluded
  $ pampa cignore list-groups             # Show special groups

.cignore files control which files are excluded from progressive context loading.
Use special groups (@env, @build, @test, @docs, @vendor, @generated) for common patterns.
    `);
}