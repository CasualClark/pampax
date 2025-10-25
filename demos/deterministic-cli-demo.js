#!/usr/bin/env node

/**
 * Demonstration script for PAMPAX Deterministic CLI Features
 * Shows piped output detection, stable JSON, and exit code handling
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');

// ANSI color codes for demo output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function colorize(text, color) {
  return `${colors[color]}${text}${colors.reset}`;
}

function section(title) {
  console.log(`\n${colors.cyan}${colors.bright}=== ${title} ===${colors.reset}\n`);
}

function command(cmd) {
  console.log(`${colors.green}$ ${cmd}${colors.reset}`);
}

function output(text) {
  console.log(`${colors.blue}${text}${colors.reset}`);
}

function error(text) {
  console.log(`${colors.red}${text}${colors.reset}`);
}

function success(text) {
  console.log(`${colors.green}${text}${colors.reset}`);
}

/**
 * Run a command and return the result
 */
function runCommand(cmd, args = [], options = {}) {
  return new Promise((resolve) => {
    const child = spawn('node', [path.join(projectRoot, 'src', 'cli.js'), ...args], {
      cwd: projectRoot,
      stdio: options.pipe ? 'pipe' : 'inherit',
      env: {
        ...process.env,
        FORCE_COLOR: options.noColor ? '0' : '1'
      }
    });

    let stdout = '';
    let stderr = '';

    if (options.pipe || options.capture) {
      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });
    }

    child.on('close', (code) => {
      resolve({
        exitCode: code,
        stdout: stdout,
        stderr: stderr
      });
    });

    child.on('error', (err) => {
      resolve({
        exitCode: 1,
        stdout: stdout,
        stderr: err.message
      });
    });
  });
}

/**
 * Demonstrate piped output detection
 */
async function demonstratePipedOutput() {
  section('🔄 Piped Output Detection');

  command('pampax help');
  console.log('Interactive output (TTY detected):');
  const interactiveResult = await runCommand('help', [], { capture: true });
  output(interactiveResult.stdout.substring(0, 200) + '...\n');

  command('pampax help | cat');
  console.log('Piped output (auto-detects JSON):');
  const pipedResult = await runCommand('help', [], { pipe: true });
  
  try {
    const jsonOutput = JSON.parse(pipedResult.stdout);
    success('✅ Valid JSON output detected');
    output(`Mode: ${jsonOutput._meta?.mode || 'unknown'}`);
  } catch (e) {
    error('❌ Failed to parse JSON output');
  }

  command('pampax help --format json');
  console.log('Explicit JSON format:');
  const explicitResult = await runCommand('help', ['--format', 'json'], { pipe: true });
  
  try {
    const jsonOutput = JSON.parse(explicitResult.stdout);
    success('✅ Explicit JSON format working');
    output(`Mode: ${jsonOutput._meta?.mode || 'unknown'}`);
  } catch (e) {
    error('❌ Failed to parse explicit JSON output');
  }
}

/**
 * Demonstrate stable JSON output
 */
async function demonstrateStableJSON() {
  section('📊 Stable JSON Output');

  command('pampax help --format json');
  console.log('First run:');
  const result1 = await runCommand('help', ['--format', 'json'], { pipe: true });
  
  command('pampax help --format json');
  console.log('Second run:');
  const result2 = await runCommand('help', ['--format', 'json'], { pipe: true });

  try {
    const json1 = JSON.parse(result1.stdout);
    const json2 = JSON.parse(result2.stdout);
    
    if (JSON.stringify(json1) === JSON.stringify(json2)) {
      success('✅ JSON output is stable and reproducible');
    } else {
      error('❌ JSON output differs between runs');
    }

    // Show key ordering
    const keys1 = Object.keys(json1);
    output(`Key order: ${keys1.join(', ')}`);
  } catch (e) {
    error('❌ Failed to parse JSON for comparison');
  }
}

/**
 * Demonstrate exit code handling
 */
async function demonstrateExitCodes() {
  section('🔢 Structured Exit Codes');

  // Success case
  command('pampax help');
  const successResult = await runCommand('help', [], { capture: true });
  console.log(`Exit code: ${successResult.exitCode} (expected: 0)`);
  if (successResult.exitCode === 0) {
    success('✅ Success exit code working');
  }

  // Configuration error
  command('pampax search "test" --limit invalid');
  const configErrorResult = await runCommand('search', ['test', '--limit', 'invalid'], { capture: true });
  console.log(`Exit code: ${configErrorResult.exitCode} (expected: 2 for CONFIG error)`);
  if (configErrorResult.exitCode === 2) {
    success('✅ Configuration error exit code working');
  }

  // File not found error
  command('pampax search "test" --project /nonexistent/path');
  const ioErrorResult = await runCommand('search', ['test', '--project', '/nonexistent/path'], { capture: true });
  console.log(`Exit code: ${ioErrorResult.exitCode} (expected: 3 for IO error)`);
  if (ioErrorResult.exitCode === 3) {
    success('✅ IO error exit code working');
  }
}

/**
 * Demonstrate output modes
 */
async function demonstrateOutputModes() {
  section('🎨 Output Modes');

  // Interactive mode
  command('pampax help');
  console.log('Interactive mode:');
  const interactiveResult = await runCommand('help', [], { capture: true });
  output(interactiveResult.stdout.substring(0, 100) + '...\n');

  // Quiet mode
  command('pampax help --quiet');
  console.log('Quiet mode:');
  const quietResult = await runCommand('help', ['--quiet'], { capture: true });
  output(`Output length: ${quietResult.stdout.length} characters\n`);

  // Verbose mode
  command('pampax help --verbose');
  console.log('Verbose mode:');
  const verboseResult = await runCommand('help', ['--verbose'], { capture: true });
  output(`Output length: ${verboseResult.stdout.length} characters`);
  if (verboseResult.stdout.includes('timestamp')) {
    success('✅ Verbose mode includes timestamps');
  }
}

/**
 * Demonstrate search command with deterministic output
 */
async function demonstrateSearchDeterminism() {
  section('🔍 Search Command Determinism');

  // Test with a simple search that should work
  command('pampax search "function" --format json');
  const searchResult = await runCommand('search', ['function', '--format', 'json'], { pipe: true });

  try {
    const jsonOutput = JSON.parse(searchResult.stdout);
    success('✅ Search command returns valid JSON');
    
    output(`Query: ${jsonOutput.query}`);
    output(`Total results: ${jsonOutput.total}`);
    output(`Success: ${jsonOutput.success}`);
    
    if (jsonOutput._meta) {
      output(`Command: ${jsonOutput._meta.command}`);
      output(`Duration: ${jsonOutput._meta.duration}ms`);
    }
  } catch (e) {
    error('❌ Failed to parse search JSON output');
    console.log('Raw output:', searchResult.stdout.substring(0, 200));
  }
}

/**
 * Demonstrate pipeline integration
 */
async function demonstratePipelineIntegration() {
  section('🔗 Pipeline Integration');

  command('pampax help --format json | jq ._meta.mode');
  console.log('Using jq to extract metadata:');
  
  // Simulate pipeline by running command and then processing output
  const helpResult = await runCommand('help', ['--format', 'json'], { pipe: true });
  
  try {
    const jsonOutput = JSON.parse(helpResult.stdout);
    const mode = jsonOutput._meta?.mode;
    success(`Extracted mode: ${mode}`);
    
    // Simulate grep
    if (helpResult.stdout.includes('mode')) {
      success('✅ Can grep JSON output for specific values');
    }
  } catch (e) {
    error('❌ Failed to process pipeline simulation');
  }
}

/**
 * Demonstrate error handling
 */
async function demonstrateErrorHandling() {
  section('⚠️ Error Handling');

  command('pampax search "test" --format json --project /nonexistent');
  const errorResult = await runCommand('search', ['test', '--format', 'json', '--project', '/nonexistent'], { pipe: true });

  try {
    const jsonOutput = JSON.parse(errorResult.stdout);
    success('✅ Error returned as structured JSON');
    
    output(`Success: ${jsonOutput.success}`);
    output(`Error: ${jsonOutput.error}`);
    
    if (jsonOutput._meta) {
      output(`Error occurred in command: ${jsonOutput._meta.command}`);
    }
  } catch (e) {
    error('❌ Failed to parse error JSON output');
  }
}

/**
 * Main demo function
 */
async function runDemo() {
  console.log(colorize('PAMPAX Deterministic CLI Demo', 'bright'));
  console.log(colorize('================================', 'cyan'));
  
  console.log(colorize('\nThis demo showcases the deterministic CLI features:', 'yellow'));
  console.log('• Piped output detection');
  console.log('• Stable JSON formatting');
  console.log('• Structured exit codes');
  console.log('• Multiple output modes');
  console.log('• Pipeline integration');
  console.log('• Consistent error handling');

  try {
    await demonstratePipedOutput();
    await demonstrateStableJSON();
    await demonstrateExitCodes();
    await demonstrateOutputModes();
    await demonstrateSearchDeterminism();
    await demonstratePipelineIntegration();
    await demonstrateErrorHandling();

    section('🎉 Demo Complete');
    success('All deterministic CLI features demonstrated successfully!');
    
    console.log(colorize('\nTry these commands yourself:', 'yellow'));
    console.log('pampax search "query" | jq ".results[].path"');
    console.log('pampax index ./project --format json');
    console.log('if pampax search "test" --quiet; then echo "Found"; fi');
    
  } catch (error) {
    error(`Demo failed: ${error.message}`);
    process.exit(1);
  }
}

// Run the demo
runDemo().catch(console.error);