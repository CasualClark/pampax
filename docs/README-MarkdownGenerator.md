# MarkdownGenerator

Converts explained bundles into human-readable markdown format with comprehensive evidence tables, stopping reasons, token reports, and structured content sections.

## Features

### 📋 Evidence Tables
- **All Required Columns:** File, Symbol, Reason, Edge Type, Rank, Cached
- **Smart Formatting:** Automatic number formatting and markdown escaping
- **Summary Statistics:** Cache hit rates, average scores, edge type analysis
- **Configurable Limits:** Maximum rows with overflow indicators

### 🚨 Stopping Reasons
- **Clear Explanations:** Human-readable descriptions of why assembly stopped
- **Severity Grouping:** High, medium, and low severity conditions organized separately
- **Actionable Advice:** Specific steps to resolve each condition
- **Technical Details:** Source, values, and metrics for debugging

### 💰 Token Reports
- **Budget Tracking:** Visual progress bars and percentage usage
- **Cost Estimation:** Automatic cost calculation for common models
- **Source Breakdown:** Token usage by source type (code, graph, cache, etc.)
- **Optimization Suggestions:** Smart recommendations based on usage patterns

### 📝 Structured Content
- **Source Organization:** Grouped by content type with emoji indicators
- **Code Previews:** Syntax-highlighted code snippets with file detection
- **Metadata Display:** Comprehensive item information and relationships
- **Configurable Previews:** Adjustable preview length and detail level

## Usage

### Basic Usage

```javascript
import { MarkdownGenerator } from './markdown-generator.js';

const generator = new MarkdownGenerator();
const markdown = generator.generateMarkdown(bundle);
console.log(markdown);
```

### Advanced Configuration

```javascript
const generator = new MarkdownGenerator({
  includeTimestamps: true,
  includeMetadata: true,
  includeActionableAdvice: true,
  maxTableRows: 100,
  formatNumbers: true,
  emojiEnabled: true
});
```

### Factory Methods

#### For CLI Output
```javascript
const generator = MarkdownGeneratorFactory.createForCLI();
// Optimized for terminal display with emojis and concise formatting
```

#### For File Output
```javascript
const generator = MarkdownGeneratorFactory.createForFile();
// Full-featured with metadata and comprehensive details
```

#### For API Responses
```javascript
const generator = MarkdownGeneratorFactory.createForAPI();
// Structured without emojis, perfect for programmatic consumption
```

#### For Debugging
```javascript
const generator = MarkdownGeneratorFactory.createForDebugging();
// Maximum detail with all available information
```

## Bundle Structure

The MarkdownGenerator expects bundles with the following structure:

```javascript
{
  // Basic information
  query: "search query",
  repository: "repo-name",
  session_id: "session-identifier",
  
  // Evidence data
  evidence: [
    {
      file: "path/to/file.js",
      symbol: "functionName",
      reason: "why this was selected",
      edge_type: "code|graph|cache|search",
      rank: 0.95,
      cached: false,
      score: 0.95
    }
  ],
  
  // Stopping reasons
  stopping_reasons: {
    conditions: [
      {
        type: "BUDGET_WARNING",
        severity: "medium",
        title: "Human-readable title",
        explanation: "Detailed explanation",
        actionable: ["Action 1", "Action 2"],
        source: "component-name",
        values: { used: 1000, budget: 3000 }
      }
    ],
    summary: {
      totalConditions: 1,
      tokensUsed: 1000,
      cacheHitRate: 0.33
    }
  },
  
  // Token information
  total_tokens: 1000,
  budget: 3000,
  model: "gpt-4-turbo",
  provider: "openai",
  
  // Content sources
  sources: [
    {
      type: "code|graph|memory",
      items: [
        {
          file: "path/to/file.js",
          score: 0.95,
          content: "file content or snippet",
          metadata: { /* additional metadata */ }
        }
      ],
      tokens: 650
    }
  ]
}
```

## Output Example

The generated markdown includes:

```markdown
# 📋 Context Bundle Report

**Generated:** 2025-01-24  
**Query:** `refresh rotation`  
**Repository:** test-repo  
**Items Found:** 3  

## Evidence

| File | Symbol | Reason | Edge Type | Rank | Cached |
|------|--------|--------|-----------|------|--------|
| src/components/RefreshButton.js | RefreshButton | semantic match | code | 0.950 | ❌ |

## Stopping Reasons

### ⚠️ Medium Severity

**Token Budget Warning**
Assembly approaching token budget limit. Used 1,250 of 3,000 tokens (41.7%).

## Token Report

### 💰 Token Usage

**Model:** gpt-4-turbo (openai)  
**Progress:** `████░░░░░░░░░░░░░░` 41.7%

## Content Sections

### 💻 Code Content

#### src/components/RefreshButton.js
```javascript
export function RefreshButton() { ... }
```
```

## Integration with CLI

```javascript
// In assemble.js
import { createMarkdownCLIHandler } from '../context/integration-example.js';

export async function assembleCommand(query, options = {}) {
  const assembler = new ContextAssembler(db, options);
  const handler = createMarkdownCLIHandler(assembler);
  
  await handler(query, {
    md: options.md,  // --md flag
    output: options.output,  // --output flag
    budget: options.budget,
    limit: options.limit
  });
}
```

## Options

### Configuration Options

- **`includeTimestamps`** (boolean): Include generation timestamps
- **`includeMetadata`** (boolean): Include technical metadata in footer
- **`includeActionableAdvice`** (boolean): Include actionable steps for stopping reasons
- **`maxTableRows`** (number): Maximum rows in evidence tables (default: 50)
- **`formatNumbers`** (boolean): Format numbers with locale formatting
- **`emojiEnabled`** (boolean): Include emoji indicators in sections

### Template Customization

The generator uses configurable templates that can be customized:

```javascript
const generator = new MarkdownGenerator({
  templates: {
    header: { /* custom header template */ },
    evidenceTable: { /* custom evidence table template */ },
    stoppingReasons: { /* custom stopping reasons template */ },
    tokenReport: { /* custom token report template */ },
    contentSection: { /* custom content section template */ },
    footer: { /* custom footer template */ }
  }
});
```

## Error Handling

The MarkdownGenerator includes robust error handling:

- **Graceful Degradation:** Continues generation even if some sections fail
- **Detailed Error Reports:** Includes stack traces and context for debugging
- **Validation:** Validates bundle structure before processing
- **Fallback Content:** Provides meaningful output even with incomplete data

## Performance

- **Memory Efficient:** Processes large bundles without excessive memory usage
- **Streaming Support:** Can handle large content sections with configurable limits
- **Fast Generation:** Optimized string building and template rendering
- **Scalable:** Handles bundles with hundreds of evidence items efficiently

## Language Support

Automatic language detection for syntax highlighting:

- **JavaScript/TypeScript:** `.js`, `.ts`, `.jsx`, `.tsx`
- **Python:** `.py`
- **Java:** `.java`
- **C/C++:** `.c`, `.cpp`
- **C#:** `.cs`
- **PHP:** `.php`
- **Ruby:** `.rb`
- **Go:** `.go`
- **Rust:** `.rs`
- **SQL:** `.sql`
- **Web:** `.html`, `.css`, `.scss`
- **Data:** `.json`, `.xml`, `.yaml`
- **Docs:** `.md`
- **Shell:** `.sh`, `.bash`, `.zsh`, `.fish`

## Cost Estimation

Built-in cost estimation for common models:

- **GPT-4:** $30/1M tokens
- **GPT-4 Turbo:** $10/1M tokens  
- **GPT-3.5 Turbo:** $2/1M tokens
- **Claude-3 Opus:** $75/1M tokens
- **Claude-3 Sonnet:** $15/1M tokens
- **Claude-3 Haiku:** $1.25/1M tokens

Costs are automatically calculated and displayed in the token report section.