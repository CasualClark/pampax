import { Command } from 'commander';
import { writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { config } from '../../config/unified-config-loader.js';
import chalk from 'chalk';

/**
 * Configuration management CLI command
 */
const configCommand = new Command('config');

configCommand
  .description('Manage PAMPAX configuration')
  .option('--show', 'Show current configuration')
  .option('--validate', 'Validate configuration')
  .option('--summary', 'Show configuration summary')
  .option('--export', 'Export configuration as TOML')
  .option('--init', 'Create default configuration file')
  .option('--reload', 'Reload configuration from file')
  .option('--hot-reload', 'Enable hot reload')
  .option('--env-overrides', 'Show environment variable overrides')
  .action((options) => {
    if (options.show) {
      showConfiguration();
    } else if (options.validate) {
      validateConfiguration();
    } else if (options.summary) {
      showSummary();
    } else if (options.export) {
      exportConfiguration();
    } else if (options.init) {
      initConfiguration();
    } else if (options.reload) {
      reloadConfiguration();
    } else if (options.hotReload) {
      enableHotReload();
    } else if (options.envOverrides) {
      showEnvironmentOverrides();
    } else {
      // Default to showing configuration
      showConfiguration();
    }
  });

function showConfiguration() {
  console.log(chalk.bold.blue('Current PAMPAX Configuration:'));
  console.log('');
  
  const configObj = config.getConfig();
  
  // Display configuration sections
  const sections = [
    'logging', 'metrics', 'cache', 'performance', 
    'cli', 'indexer', 'storage', 'features', 'security'
  ];
  
  sections.forEach(section => {
    if (configObj[section]) {
      console.log(chalk.bold(`[${section}]`));
      displaySection(configObj[section], 1);
      console.log('');
    }
  });
}

function displaySection(obj, indent = 0) {
  const spaces = '  '.repeat(indent);
  
  Object.entries(obj).forEach(([key, value]) => {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      console.log(`${spaces}${chalk.cyan(key)} = {`);
      displaySection(value, indent + 1);
      console.log(`${spaces}}`);
    } else if (Array.isArray(value)) {
      console.log(`${spaces}${chalk.cyan(key)} = [`);
      value.forEach(item => {
        if (typeof item === 'string') {
          console.log(`${spaces}  "${chalk.green(item)}",`);
        } else {
          console.log(`${spaces}  ${chalk.green(JSON.stringify(item))},`);
        }
      });
      console.log(`${spaces}]`);
    } else {
      const displayValue = typeof value === 'string' ? `"${value}"` : value;
      console.log(`${spaces}${chalk.cyan(key)} = ${chalk.green(displayValue)}`);
    }
  });
}

function validateConfiguration() {
  console.log(chalk.bold.blue('Validating Configuration...'));
  
  const validation = config.validate();
  
  if (validation.valid) {
    console.log(chalk.green('✓ Configuration is valid'));
  } else {
    console.log(chalk.red('✗ Configuration validation failed:'));
    validation.errors.forEach(error => {
      console.log(`  ${chalk.red('•')} ${chalk.yellow(error.path)}: ${error.message}`);
    });
    process.exit(1);
  }
}

function showSummary() {
  console.log(chalk.bold.blue('Configuration Summary:'));
  console.log('');
  
  const summary = config.getSummary();
  
  Object.entries(summary).forEach(([key, value]) => {
    if (key === 'sections') {
      console.log(`${chalk.cyan(key)}: [${value.map(v => chalk.green(v)).join(', ')}]`);
    } else if (typeof value === 'boolean') {
      console.log(`${chalk.cyan(key)}: ${value ? chalk.green('true') : chalk.red('false')}`);
    } else {
      console.log(`${chalk.cyan(key)}: ${chalk.green(value)}`);
    }
  });
}

function exportConfiguration() {
  console.log(chalk.bold.blue('Exporting Configuration as TOML...'));
  
  const tomlExport = config.exportAsToml();
  
  if (tomlExport) {
    console.log(tomlExport);
    
    // Also write to file
    const exportPath = join(process.cwd(), 'pampax-exported.toml');
    writeFileSync(exportPath, tomlExport);
    console.log(chalk.green(`\nExported to: ${exportPath}`));
  } else {
    console.log(chalk.yellow('TOML export not available (using JSON configuration)'));
  }
}

function initConfiguration() {
  console.log(chalk.bold.blue('Creating default configuration file...'));
  
  const configPath = join(process.cwd(), 'pampax.toml');
  
  if (existsSync(configPath)) {
    console.log(chalk.yellow(`Configuration file already exists: ${configPath}`));
    console.log('Use --show to view current configuration');
    return;
  }
  
  const defaultConfig = `# PAMPAX Configuration File
# Generated on ${new Date().toISOString()}

[logging]
level = "info"
format = "json"
output = "stdout"
structured = true

[metrics]
enabled = true
sink = "stdout"
sampling_rate = 0.1

[cache]
enabled = true
ttl_seconds = 3600
max_size_mb = 500
strategy = "lru"

[performance]
query_timeout_ms = 5000
max_concurrent_searches = 10
sqlite_cache_size = 2000
parallel_processing = true
memory_limit_mb = 1024

[cli]
deterministic_output = true
color_output = "auto"
progress_bar = true
verbose_errors = false
interactive_mode = true

[indexer]
max_file_size_mb = 10
exclude_patterns = [
  "node_modules/**",
  ".git/**",
  "dist/**",
  "build/**",
  "*.min.js",
  "*.min.css",
  ".DS_Store",
  "Thumbs.db"
]
include_patterns = [
  "**/*.{js,ts,jsx,tsx,py,java,cpp,c,h,hpp,go,rs,php,rb,swift,kt,dart,scala,hs,ml,lua,elixir,sh,bash,zsh,fish}",
  "**/*.md",
  "**/*.txt",
  "**/*.json",
  "**/*.yaml",
  "**/*.yml",
  "**/*.toml",
  "**/*.xml",
  "**/*.sql"
]
follow_symlinks = false
respect_gitignore = true

[storage]
type = "sqlite"
path = ".pampax"
connection_pool_size = 10
backup_enabled = true
backup_interval_hours = 24

[features]
learning = true
analytics = true
policy_optimization = true
experimental_features = false
debug_mode = false

[security]
encrypt_storage = false
access_log_enabled = true
rate_limiting = false
max_requests_per_minute = 1000
`;
  
  writeFileSync(configPath, defaultConfig);
  console.log(chalk.green(`✓ Created default configuration: ${configPath}`));
  console.log('');
  console.log(chalk.blue('Next steps:'));
  console.log(`  1. Review and customize ${chalk.cyan(configPath)}`);
  console.log(`  2. Run ${chalk.cyan('pampax config --validate')} to check your configuration`);
  console.log(`  3. Use environment variables with ${chalk.cyan('PAMPAX_')} prefix for overrides`);
}

function reloadConfiguration() {
  console.log(chalk.bold.blue('Reloading Configuration...'));
  
  const reloaded = config.reload();
  
  if (reloaded) {
    console.log(chalk.green('✓ Configuration reloaded successfully'));
  } else {
    console.log(chalk.red('✗ Failed to reload configuration'));
    process.exit(1);
  }
}

function enableHotReload() {
  console.log(chalk.bold.blue('Enabling Hot Reload...'));
  
  const enabled = config.enableHotReload();
  
  if (enabled) {
    console.log(chalk.green('✓ Hot reload enabled'));
    console.log('Configuration will automatically reload when the file changes');
    
    // Set up a callback to show when configuration changes
    config.onHotReload((oldConfig, newConfig) => {
      console.log(chalk.yellow('\n🔄 Configuration reloaded at ' + new Date().toISOString()));
      
      // Show what changed
      const oldLevel = oldConfig.logging?.level;
      const newLevel = newConfig.logging?.level;
      if (oldLevel !== newLevel) {
        console.log(`  Logging level: ${chalk.red(oldLevel)} → ${chalk.green(newLevel)}`);
      }
    });
    
    console.log('Press Ctrl+C to stop watching');
    
    // Keep the process alive
    process.on('SIGINT', () => {
      console.log(chalk.blue('\nDisabling hot reload...'));
      config.disableHotReload();
      process.exit(0);
    });
    
    // Prevent process from exiting
    setInterval(() => {}, 1000);
  } else {
    console.log(chalk.yellow('Hot reload not available (requires TOML configuration file)'));
    console.log('Create a pampax.toml file to enable hot reload');
  }
}

function showEnvironmentOverrides() {
  console.log(chalk.bold.blue('Environment Variable Overrides:'));
  console.log('');
  
  const envOverrides = Object.keys(process.env)
    .filter(key => key.startsWith('PAMPAX_'))
    .sort();
  
  if (envOverrides.length === 0) {
    console.log(chalk.yellow('No PAMPAX environment variables set'));
    console.log('');
    console.log(chalk.blue('Examples:'));
    console.log('  PAMPAX_LOGGING_LEVEL=debug');
    console.log('  PAMPAX_METRICS_ENABLED=false');
    console.log('  PAMPAX_CACHE_TTL_SECONDS=7200');
    console.log('  PAMPAX_PERFORMANCE_QUERY_TIMEOUT_MS=10000');
    return;
  }
  
  envOverrides.forEach(envVar => {
    const value = process.env[envVar];
    const configPath = envVar.substring(7).toLowerCase().replace(/_/g, '.');
    console.log(`${chalk.cyan(envVar)}="${chalk.green(value)}" → ${chalk.yellow(configPath)}`);
  });
  
  console.log('');
  console.log(chalk.blue('Current effective values:'));
  envOverrides.forEach(envVar => {
    const configPath = envVar.substring(7).toLowerCase().replace(/_/g, '.');
    const currentValue = config.getValue(configPath);
    console.log(`  ${chalk.yellow(configPath)}: ${chalk.green(currentValue)} ${chalk.gray(`(from ${envVar})`)}`);
  });
}

export default configCommand;