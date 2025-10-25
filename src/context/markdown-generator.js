#!/usr/bin/env node

/**
 * MarkdownGenerator - Convert explained bundles into human-readable markdown
 * 
 * Generates structured markdown output with evidence tables, stopping reasons,
 * token reports, and structured content sections for explainable context bundles.
 */

import { logger } from '../config/logger.js';

/**
 * MarkdownGenerator class with template-based output
 */
export class MarkdownGenerator {
  constructor(options = {}) {
    this.options = {
      includeTimestamps: options.includeTimestamps !== false,
      includeMetadata: options.includeMetadata !== false,
      includeActionableAdvice: options.includeActionableAdvice !== false,
      maxTableRows: options.maxTableRows || 50,
      formatNumbers: options.formatNumbers !== false,
      emojiEnabled: options.emojiEnabled !== false,
      ...options
    };
    
    // Markdown templates
    this.templates = {
      header: this.createHeaderTemplate(),
      evidenceTable: this.createEvidenceTableTemplate(),
      stoppingReasons: this.createStoppingReasonsTemplate(),
      tokenReport: this.createTokenReportTemplate(),
      contentSection: this.createContentSectionTemplate(),
      footer: this.createFooterTemplate()
    };
  }

  /**
   * Generate complete markdown output from explained bundle
   */
  generateMarkdown(bundle, options = {}) {
    try {
      const sections = [];
      
      // Add header
      sections.push(this.generateHeader(bundle, options));
      
      // Add evidence table
      if (bundle.evidence && bundle.evidence.length > 0) {
        sections.push(this.generateEvidenceTable(bundle.evidence, bundle));
      }
      
      // Add stopping reasons section
      if (bundle.stopping_reasons || bundle.stopping_conditions) {
        sections.push(this.generateStoppingReasons(bundle.stopping_reasons || bundle.stopping_conditions));
      }
      
      // Add token report
      if (bundle.total_tokens || bundle.token_report) {
        sections.push(this.generateTokenReport(bundle));
      }
      
      // Add structured content sections
      if (bundle.sources && bundle.sources.length > 0) {
        sections.push(this.generateContentSections(bundle.sources, bundle));
      }
      
      // Add metadata and footer
      if (this.options.includeMetadata) {
        sections.push(this.generateFooter(bundle));
      }
      
      return sections.join('\n\n');
    } catch (error) {
      logger.error('Failed to generate markdown', { error: error.message }, 'markdown-generator');
      return this.generateErrorOutput(error, bundle);
    }
  }

  /**
   * Generate document header
   */
  generateHeader(bundle, options = {}) {
    const timestamp = this.options.includeTimestamps 
      ? new Date().toISOString().split('T')[0] 
      : '';
    const query = bundle.query || options.query || 'Unknown Query';
    const repo = bundle.repository || options.repo || 'Unknown Repository';
    
    const emoji = this.options.emojiEnabled ? '📋 ' : '';
    const title = `${emoji}Context Bundle Report`;
    
    let header = `# ${title}\n\n`;
    
    if (timestamp) {
      header += `**Generated:** ${timestamp}  \n`;
    }
    
    header += `**Query:** \`${query}\`  \n`;
    header += `**Repository:** ${repo}  \n`;
    
    if (bundle.total_items) {
      header += `**Items Found:** ${bundle.total_items.toLocaleString()}  \n`;
    }
    
    if (bundle.session_id) {
      header += `**Session ID:** \`${bundle.session_id}\`  \n`;
    }
    
    return header;
  }

  /**
   * Generate evidence table with all required columns
   */
  generateEvidenceTable(evidence, bundle = {}) {
    if (!evidence || evidence.length === 0) {
      return '## Evidence\n\nNo evidence items found.\n';
    }

    const limitedEvidence = evidence.slice(0, this.options.maxTableRows);
    const hasMore = evidence.length > this.options.maxTableRows;
    
    let table = '## Evidence\n\n';
    table += '| File | Symbol | Reason | Edge Type | Rank | Cached |\n';
    table += '|------|--------|--------|-----------|------|--------|\n';

    limitedEvidence.forEach(item => {
      const file = this.escapeMarkdown(item.file || item.path || 'Unknown');
      const symbol = this.escapeMarkdown(item.symbol || 'N/A');
      const reason = this.escapeMarkdown(item.reason || 'N/A');
      const edgeType = this.escapeMarkdown(item.edge_type || 'N/A');
      const rank = typeof item.rank === 'number' ? item.rank.toFixed(3) : 'N/A';
      const cached = item.cached ? '✅' : '❌';
      
      table += `| ${file} | ${symbol} | ${reason} | ${edgeType} | ${rank} | ${cached} |\n`;
    });

    if (hasMore) {
      table += `\n*Showing ${limitedEvidence.length} of ${evidence.length} evidence items*`;
    }

    // Add evidence summary
    if (Object.keys(bundle).length > 0) {
      table += '\n\n### Evidence Summary\n\n';
      
      const cacheHits = evidence.filter(item => item.cached).length;
      const cacheHitRate = evidence.length > 0 ? (cacheHits / evidence.length * 100).toFixed(1) : 0;
      const avgRank = evidence
        .filter(item => typeof item.rank === 'number')
        .reduce((sum, item) => sum + item.rank, 0) / evidence.filter(item => typeof item.rank === 'number').length || 0;
      
      table += `- **Cache Hit Rate:** ${cacheHitRate}% (${cacheHits}/${evidence.length})\n`;
      table += `- **Average Rank:** ${avgRank.toFixed(3)}\n`;
      table += `- **Edge Types:** ${[...new Set(evidence.map(item => item.edge_type).filter(Boolean))].join(', ') || 'None'}\n`;
    }

    return table;
  }

  /**
   * Generate stopping reasons section with clear explanations
   */
  generateStoppingReasons(stoppingData) {
    let section = '## Stopping Reasons\n\n';

    if (!stoppingData) {
      section += 'No stopping conditions recorded.\n';
      return section;
    }

    // Handle different data formats
    let reasons = [];
    let summary = null;
    
    if (Array.isArray(stoppingData)) {
      reasons = stoppingData;
    } else if (stoppingData.conditions) {
      reasons = stoppingData.conditions;
      summary = stoppingData.summary;
    } else if (stoppingData.explanations) {
      reasons = stoppingData.explanations;
    }

    if (reasons.length === 0 && !summary) {
      section += 'No stopping conditions recorded.\n';
      return section;
    }

    // Add summary if available
    if (summary) {
      const emoji = this.options.emojiEnabled ? '📊 ' : '';
      section += `### ${emoji}Summary\n\n`;
      
      if (summary.totalConditions) {
        section += `- **Total Conditions:** ${summary.totalConditions}\n`;
      }
      if (summary.tokensUsed) {
        section += `- **Tokens Used:** ${summary.tokensUsed.toLocaleString()}\n`;
      }
      if (summary.duration) {
        section += `- **Duration:** ${summary.duration}ms\n`;
      }
      if (summary.cacheHitRate !== undefined) {
        section += `- **Cache Hit Rate:** ${(summary.cacheHitRate * 100).toFixed(1)}%\n`;
      }
      
      if (summary.highSeverityCount > 0) {
        section += `- **🚨 High Severity Issues:** ${summary.highSeverityCount}\n`;
      }
      if (summary.mediumSeverityCount > 0) {
        section += `- **⚠️ Medium Severity Issues:** ${summary.mediumSeverityCount}\n`;
      }
      section += '\n';
    }

    // Group by severity
    const grouped = reasons.reduce((acc, reason) => {
      const severity = reason.severity || 'unknown';
      acc[severity] = acc[severity] || [];
      acc[severity].push(reason);
      return acc;
    }, {});

    // Generate sections by severity
    const severityOrder = ['high', 'medium', 'low'];
    severityOrder.forEach(severity => {
      if (grouped[severity] && grouped[severity].length > 0) {
        const emoji = this.options.emojiEnabled ? 
          (severity === 'high' ? '🚨 ' : severity === 'medium' ? '⚠️ ' : 'ℹ️ ') : '';
        section += `### ${emoji}${severity.charAt(0).toUpperCase() + severity.slice(1)} Severity\n\n`;
        
        grouped[severity].forEach(reason => {
          const title = reason.title || reason.type || 'Unknown Condition';
          const explanation = reason.explanation || reason.description || 'No explanation provided';
          
          section += `**${title}**\n\n`;
          section += `${explanation}\n\n`;
          
          if (this.options.includeActionableAdvice && reason.actionable && reason.actionable.length > 0) {
            section += '**Actionable Steps:**\n';
            reason.actionable.forEach(step => {
              section += `- ${step}\n`;
            });
            section += '\n';
          }
          
          // Add technical details
          if (reason.values || reason.source) {
            section += '*Technical Details:* ';
            const details = [];
            if (reason.source) details.push(`Source: ${reason.source}`);
            if (reason.values) {
              Object.entries(reason.values).forEach(([key, value]) => {
                details.push(`${key}: ${value}`);
              });
            }
            section += details.join(', ');
            section += '\n\n';
          }
        });
      }
    });

    // Add recommendations if available
    if (stoppingData.recommendations && stoppingData.recommendations.length > 0) {
      const emoji = this.options.emojiEnabled ? '💡 ' : '';
      section += `### ${emoji}Recommendations\n\n`;
      
      stoppingData.recommendations.forEach(rec => {
        section += `**${rec.title}** (Priority: ${rec.priority})\n\n`;
        section += `${rec.description}\n\n`;
        if (rec.actions && rec.actions.length > 0) {
          section += '**Actions:**\n';
          rec.actions.forEach(action => {
            section += `- ${action}\n`;
          });
          section += '\n';
        }
      });
    }

    return section;
  }

  /**
   * Generate token report with budget/used/model information
   */
  generateTokenReport(bundle) {
    let section = '## Token Report\n\n';

    const tokenData = bundle.token_report || {};
    const totalTokens = bundle.total_tokens || tokenData.used || 0;
    const budget = bundle.budget || tokenData.budget || 0;
    const model = bundle.model || tokenData.model || 'Unknown';
    const provider = bundle.provider || tokenData.provider || 'Unknown';

    if (!totalTokens && !budget) {
      section += 'No token information available.\n';
      return section;
    }

    // Calculate percentage
    const percentage = budget > 0 ? (totalTokens / budget * 100).toFixed(1) : 0;
    const remaining = Math.max(0, budget - totalTokens);
    
    // Add visual progress bar
    const barLength = 20;
    const filledLength = Math.round(barLength * totalTokens / budget);
    const emptyLength = barLength - filledLength;
    const progressBar = '█'.repeat(filledLength) + '░'.repeat(emptyLength);
    
    const emoji = this.options.emojiEnabled ? '💰 ' : '';
    section += `### ${emoji}Token Usage\n\n`;
    section += `**Model:** ${model} (${provider})\n\n`;
    section += `**Budget:** ${budget.toLocaleString()} tokens\n\n`;
    section += `**Used:** ${totalTokens.toLocaleString()} tokens (${percentage}%)\n\n`;
    section += `**Remaining:** ${remaining.toLocaleString()} tokens\n\n`;
    section += `**Progress:** \`${progressBar}\` ${percentage}%\n\n`;

    // Add breakdown if available
    if (bundle.sources && bundle.sources.length > 0) {
      section += '### Token Breakdown by Source\n\n';
      section += '| Source Type | Tokens | Percentage |\n';
      section += '|-------------|--------|------------|\n';
      
      bundle.sources.forEach(source => {
        const tokens = source.tokens || 0;
        const sourcePercentage = totalTokens > 0 ? (tokens / totalTokens * 100).toFixed(1) : 0;
        section += `| ${source.type} | ${tokens.toLocaleString()} | ${sourcePercentage}% |\n`;
      });
      
      section += '\n';
    }

    // Add cost estimation if model info available
    if (model !== 'Unknown') {
      const estimatedCost = this.estimateCost(totalTokens, model);
      if (estimatedCost !== null) {
        section += '### Cost Estimation\n\n';
        section += `**Estimated Cost:** $${estimatedCost.toFixed(6)} USD\n\n`;
        
        if (budget > 0) {
          const totalCost = this.estimateCost(budget, model);
          section += `**Total Budget Cost:** $${totalCost.toFixed(6)} USD\n\n`;
        }
      }
    }

    // Add optimization suggestions
    if (percentage > 90) {
      section += '### ⚠️ Optimization Suggestions\n\n';
      section += 'Token usage is near the budget limit. Consider:\n';
      section += '- Reducing result limits with `--limit` flag\n';
      section += '- Using more specific search queries\n';
      section += '- Enabling content degradation policies\n';
      section += '- Increasing token budget with `--budget` flag\n\n';
    }

    return section;
  }

  /**
   * Generate structured content sections
   */
  generateContentSections(sources, bundle = {}) {
    let section = '## Content Sections\n\n';

    if (!sources || sources.length === 0) {
      section += 'No content sections available.\n';
      return section;
    }

    sources.forEach((source) => {
      const emoji = this.options.emojiEnabled ? this.getSourceEmoji(source.type) : '';
      section += `### ${emoji}${source.type.charAt(0).toUpperCase() + source.type.slice(1)} Content\n\n`;
      
      if (source.items && source.items.length > 0) {
        section += `**Items:** ${source.items.length}\n`;
        if (source.tokens) {
          section += `**Tokens:** ${source.tokens.toLocaleString()}\n`;
        }
        section += '\n';
        
        // Add item details
        source.items.forEach((item) => {
          const title = item.file || item.path || item.id || `Item ${itemIndex + 1}`;
          const symbol = item.metadata?.spanName || item.symbol || '';
          
          section += `#### ${this.escapeMarkdown(title)}\n\n`;
          
          if (symbol) {
            section += `**Symbol:** \`${symbol}\`\n\n`;
          }
          
          if (item.score !== undefined) {
            section += `**Score:** ${item.score.toFixed(3)}\n\n`;
          }
          
          // Add content preview if available
          if (item.content || item.snippet) {
            const content = item.content || item.snippet;
            const preview = content.length > 300 ? content.substring(0, 300) + '...' : content;
            section += '**Preview:**\n';
            section += '```' + this.getLanguageForFile(title) + '\n';
            section += preview + '\n';
            section += '```\n\n';
          }
          
          // Add metadata if available
          if (item.metadata && Object.keys(item.metadata).length > 0) {
            section += '**Metadata:**\n';
            Object.entries(item.metadata).forEach(([key, value]) => {
              if (key !== 'spanName' && value !== undefined && value !== null) {
                section += `- ${key}: ${value}\n`;
              }
            });
            section += '\n';
          }
        });
      }
      
      section += '\n---\n\n';
    });

    return section;
  }

  /**
   * Generate document footer with metadata
   */
  generateFooter(bundle) {
    const timestamp = new Date().toISOString();
    let footer = '---\n\n';
    
    footer += '*This report was generated by Pampax Context Assembler*\n\n';
    footer += `**Generation Time:** ${timestamp}\n`;
    
    if (bundle.version) {
      footer += `**Version:** ${bundle.version}\n`;
    }
    
    if (bundle.config) {
      footer += `**Configuration:** \`${JSON.stringify(bundle.config, null, 2)}\`\n`;
    }
    
    return footer;
  }

  /**
   * Generate error output in markdown format
   */
  generateErrorOutput(error, bundle) {
    let output = '# Error Generating Report\n\n';
    output += `**Error:** ${error.message}\n\n`;
    
    if (error.stack) {
      output += '**Stack Trace:**\n';
      output += '```\n';
      output += error.stack;
      output += '\n```\n\n';
    }
    
    if (bundle) {
      output += '**Bundle Data:**\n';
      output += '```json\n';
      output += JSON.stringify(bundle, null, 2);
      output += '\n```\n';
    }
    
    return output;
  }

  /**
   * Helper methods
   */

  escapeMarkdown(text) {
    if (typeof text !== 'string') return text;
    return text.replace(/[|`*{}_()[\]\\+-.!]/g, '\\$&');
  }

  getLanguageForFile(filename) {
    const ext = filename.split('.').pop()?.toLowerCase();
    const languageMap = {
      'js': 'javascript',
      'ts': 'typescript',
      'jsx': 'jsx',
      'tsx': 'tsx',
      'py': 'python',
      'java': 'java',
      'cpp': 'cpp',
      'c': 'c',
      'cs': 'csharp',
      'php': 'php',
      'rb': 'ruby',
      'go': 'go',
      'rs': 'rust',
      'sql': 'sql',
      'html': 'html',
      'css': 'css',
      'scss': 'scss',
      'sass': 'sass',
      'json': 'json',
      'xml': 'xml',
      'yaml': 'yaml',
      'yml': 'yaml',
      'md': 'markdown',
      'sh': 'bash',
      'bash': 'bash',
      'zsh': 'bash',
      'fish': 'fish'
    };
    return languageMap[ext] || '';
  }

  getSourceEmoji(sourceType) {
    const emojiMap = {
      'code': '💻 ',
      'memory': '🧠 ',
      'graph': '🕸️ ',
      'cache': '💾 ',
      'search': '🔍 ',
      'intent': '🎯 ',
      'learning': '📚 ',
      'performance': '⚡ '
    };
    return emojiMap[sourceType.toLowerCase()] || '';
  }

  estimateCost(tokens, model) {
    // Simple cost estimation (prices per 1M tokens)
    const pricing = {
      'gpt-4': 30,
      'gpt-4-turbo': 10,
      'gpt-3.5-turbo': 2,
      'claude-3-opus': 75,
      'claude-3-sonnet': 15,
      'claude-3-haiku': 1.25
    };
    
    // Find matching model (case-insensitive)
    const modelKey = Object.keys(pricing).find(key => 
      model.toLowerCase().includes(key.toLowerCase())
    );
    
    if (!modelKey) return null;
    
    return (tokens / 1000000) * pricing[modelKey];
  }

  /**
   * Template methods (can be customized)
   */

  createHeaderTemplate() {
    return {
      title: 'Context Bundle Report',
      includeTimestamp: true,
      includeQuery: true,
      includeRepository: true
    };
  }

  createEvidenceTableTemplate() {
    return {
      columns: ['File', 'Symbol', 'Reason', 'Edge Type', 'Rank', 'Cached'],
      maxRows: 50,
      includeSummary: true
    };
  }

  createStoppingReasonsTemplate() {
    return {
      includeSummary: true,
      groupBySeverity: true,
      includeActionableSteps: true,
      includeTechnicalDetails: true
    };
  }

  createTokenReportTemplate() {
    return {
      includeProgressBar: true,
      includeBreakdown: true,
      includeCostEstimation: true,
      includeOptimizationSuggestions: true
    };
  }

  createContentSectionTemplate() {
    return {
      includePreviews: true,
      previewLength: 300,
      includeMetadata: true,
      groupBySource: true
    };
  }

  createFooterTemplate() {
    return {
      includeGenerationTime: true,
      includeVersion: true,
      includeConfiguration: false
    };
  }

  /**
   * Static factory methods
   */

  static create(options = {}) {
    return new MarkdownGenerator(options);
  }

  static createCompact() {
    return new MarkdownGenerator({
      includeMetadata: false,
      includeActionableAdvice: false,
      emojiEnabled: false,
      maxTableRows: 20
    });
  }

  static createDetailed() {
    return new MarkdownGenerator({
      includeMetadata: true,
      includeActionableAdvice: true,
      emojiEnabled: true,
      maxTableRows: 100
    });
  }
}

/**
 * Create markdown generator with default configuration
 */
export function createMarkdownGenerator(options = {}) {
  return new MarkdownGenerator(options);
}

/**
 * Markdown generator factory for different use cases
 */
export const MarkdownGeneratorFactory = {
  /**
   * Create generator for CLI output
   */
  createForCLI() {
    return new MarkdownGenerator({
      includeMetadata: false,
      includeActionableAdvice: true,
      emojiEnabled: true,
      maxTableRows: 30,
      formatNumbers: true
    });
  },

  /**
   * Create generator for file output
   */
  createForFile() {
    return new MarkdownGenerator({
      includeMetadata: true,
      includeActionableAdvice: true,
      emojiEnabled: true,
      maxTableRows: 100,
      formatNumbers: true
    });
  },

  /**
   * Create generator for API response
   */
  createForAPI() {
    return new MarkdownGenerator({
      includeTimestamps: true,
      includeMetadata: true,
      includeActionableAdvice: true,
      emojiEnabled: false,
      maxTableRows: 50,
      formatNumbers: true
    });
  },

  /**
   * Create generator for debugging
   */
  createForDebugging() {
    return new MarkdownGenerator({
      includeMetadata: true,
      includeActionableAdvice: true,
      emojiEnabled: false,
      maxTableRows: 200,
      formatNumbers: true
    });
  }
};

export default MarkdownGenerator;