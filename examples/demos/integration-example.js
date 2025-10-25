/**
 * Integration example for MarkdownGenerator with Context Assembler
 * 
 * This example shows how to integrate the markdown generator
 * with the existing context assembly workflow.
 */

import { MarkdownGeneratorFactory } from './markdown-generator.js';

/**
 * Enhanced assembler method that includes markdown generation
 */
export function enhanceAssemblerWithMarkdown(assembler) {
  // Add markdown generation capability to the assembler
  assembler.generateMarkdownReport = async function(query, options = {}) {
    // Create explained bundle first
    const bundle = await this.assembleWithExplanation(query, options);
    
    // Generate markdown using appropriate factory
    const generator = options.outputFormat === 'file' 
      ? MarkdownGeneratorFactory.createForFile()
      : MarkdownGeneratorFactory.createForCLI();
    
    // Generate markdown
    const markdown = generator.generateMarkdown(bundle, {
      query,
      repo: options.repo
    });
    
    return {
      bundle,
      markdown,
      generator
    };
  };

  // Add method to output markdown directly
  assembler.outputMarkdown = async function(query, options = {}) {
    const { markdown } = await this.generateMarkdownReport(query, options);
    
    if (options.outputFile) {
      // Write to file
      await import('fs').then(fs => 
        fs.promises.writeFile(options.outputFile, markdown, 'utf8')
      );
      return { success: true, file: options.outputFile, length: markdown.length };
    } else {
      // Return string for console output
      return { success: true, content: markdown, length: markdown.length };
    }
  };

  return assembler;
}

/**
 * CLI integration helper
 */
export function createMarkdownCLIHandler(assembler) {
  return async function(query, options = {}) {
    try {
      const enhancedAssembler = enhanceAssemblerWithMarkdown(assembler);
      
      if (options.md || options.markdown) {
        // Generate markdown output
        const result = await enhancedAssembler.outputMarkdown(query, {
          ...options,
          outputFormat: options.output ? 'file' : 'cli'
        });
        
        if (result.success) {
          if (options.output) {
            console.log(`✅ Markdown report written to: ${options.output}`);
            console.log(`📊 Report length: ${result.length.toLocaleString()} characters`);
          } else {
            console.log(result.content);
          }
          return true;
        }
      } else {
        // Regular assembly (existing behavior)
        const bundle = await assembler.assembleWithExplanation(query, options);
        console.log('📋 Bundle assembled successfully');
        console.log(`📊 Items: ${bundle.total_items || 0}`);
        console.log(`💰 Tokens: ${bundle.total_tokens || 0}`);
        return true;
      }
    } catch (error) {
      console.error('❌ Assembly failed:', error.message);
      return false;
    }
  };
}

/**
 * Example usage in CLI commands
 */
export function exampleCLIIntegration() {
  // This shows how the integration would work in the CLI
  return `
// In assemble.js command handler
export async function assembleCommand(query, options = {}) {
  const assembler = new ContextAssembler(db, options);
  const handler = createMarkdownCLIHandler(assembler);
  
  // Handle both regular and markdown output
  await handler(query, {
    budget: options.budget,
    limit: options.limit,
    md: options.md, // --md flag
    output: options.output, // --output flag
    ...options
  });
}
`;
}

/**
 * Example bundle data structure for testing
 */
export const exampleBundle = {
  query: "refresh rotation",
  repository: "example-repo",
  session_id: "session_123",
  total_items: 3,
  total_tokens: 1250,
  budget: 3000,
  model: "gpt-4-turbo",
  provider: "openai",
  evidence: [
    {
      file: "src/components/RefreshButton.js",
      symbol: "RefreshButton",
      reason: "semantic match for refresh functionality",
      edge_type: "code",
      rank: 0.95,
      cached: false,
      score: 0.95
    }
  ],
  stopping_reasons: {
    conditions: [
      {
        type: "BUDGET_WARNING",
        severity: "medium",
        title: "Token Budget Warning",
        explanation: "Assembly approaching token budget limit.",
        actionable: ["Monitor remaining token usage"]
      }
    ],
    summary: {
      totalConditions: 1,
      tokensUsed: 1250,
      cacheHitRate: 0.33
    }
  },
  sources: [
    {
      type: "code",
      items: [
        {
          file: "src/components/RefreshButton.js",
          score: 0.95,
          content: "export function RefreshButton() { ... }",
          metadata: { spanName: "RefreshButton" }
        }
      ],
      tokens: 650
    }
  ]
};