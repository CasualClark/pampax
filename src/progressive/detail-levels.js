/**
 * Defines the four detail levels and their characteristics
 */

const DETAIL_LEVELS = {
  outline: {
    level: 0,
    description: "File structure with high-level summaries",
    includes: ["file_paths", "exports", "brief_summary"],
    avgTokensPerFile: 10,
    maxTokensTotal: 500
  },
  
  signatures: {
    level: 1,
    description: "Function/class signatures with parameters and return types",
    includes: ["outline", "function_signatures", "class_definitions", "imports"],
    avgTokensPerFile: 50,
    maxTokensTotal: 2000
  },
  
  implementation: {
    level: 2,
    description: "Key implementation details without full code",
    includes: ["signatures", "function_bodies_summary", "important_logic"],
    avgTokensPerFile: 150,
    maxTokensTotal: 4000
  },
  
  full: {
    level: 3,
    description: "Complete code with comments and documentation",
    includes: ["implementation", "full_source", "comments", "documentation"],
    avgTokensPerFile: 400,
    maxTokensTotal: 8000
  }
};

/**
 * Format code at specified detail level
 */
function formatAtLevel(fileData, detailLevel) {
  const level = DETAIL_LEVELS[detailLevel];
  if (!level) throw new Error(`Unknown detail level: ${detailLevel}`);
  
  const formatted = {
    file: fileData.path,
    level: detailLevel,
    content: {}
  };
  
  switch (detailLevel) {
    case 'outline':
      return formatOutline(fileData);
    case 'signatures':
      return formatSignatures(fileData);
    case 'implementation':
      return formatImplementation(fileData);
    case 'full':
      return formatFull(fileData);
  }
}

function formatOutline(fileData) {
  return {
    file: fileData.path,
    type: fileData.language,
    exports: fileData.symbols?.filter(s => s.exported).map(s => s.name) || [],
    summary: generateFileSummary(fileData),
    line_count: fileData.content ? fileData.content.split('\n').length : 0
  };
}

function formatSignatures(fileData) {
  const outline = formatOutline(fileData);
  
  return {
    ...outline,
    imports: extractImports(fileData),
    classes: fileData.symbols
      ?.filter(s => s.type === 'class')
      .map(c => ({
        name: c.name,
        extends: c.extends,
        implements: c.implements,
        methods: c.children?.map(m => m.signature) || []
      })) || [],
    functions: fileData.symbols
      ?.filter(s => s.type === 'function')
      .map(f => ({
        name: f.name,
        signature: f.signature,
        async: f.async,
        params: f.params,
        returns: f.returnType
      })) || []
  };
}

function formatImplementation(fileData) {
  const signatures = formatSignatures(fileData);
  
  return {
    ...signatures,
    implementations: fileData.symbols
      ?.filter(s => s.type === 'function' || s.type === 'method')
      .map(fn => ({
        name: fn.name,
        signature: fn.signature,
        summary: summarizeImplementation(fn),
        calls: fn.calls || [],
        complexity: estimateComplexity(fn)
      })) || []
  };
}

function formatFull(fileData) {
  return {
    file: fileData.path,
    level: 'full',
    content: fileData.content,
    symbols: fileData.symbols || []
  };
}

// Helper functions
function generateFileSummary(fileData) {
  if (!fileData.content) return `${fileData.language} file`;
  
  // Use first doc comment or generate from exports
  const docComment = fileData.content.match(/^\/\*\*[\s\S]*?\*\//);
  if (docComment) {
    return docComment[0].replace(/[\/\*]/g, '').trim().slice(0, 200);
  }
  
  const exports = fileData.symbols?.filter(s => s.exported) || [];
  if (exports.length > 0) {
    return `Exports: ${exports.map(s => s.name).join(', ')}`;
  }
  
  return `${fileData.language} file with ${fileData.symbols?.length || 0} symbols`;
}

function extractImports(fileData) {
  if (!fileData.content) return [];
  
  const importRegex = /import\s+.*?from\s+['"]([^'"]+)['"]/g;
  const imports = [];
  let match;
  
  while ((match = importRegex.exec(fileData.content)) !== null) {
    imports.push(match[1]);
  }
  
  return imports;
}

function summarizeImplementation(fn) {
  if (!fn.content) return 'No implementation available';
  
  const body = fn.content;
  const keyPatterns = [
    { pattern: /if\s*\(/g, name: 'conditionals' },
    { pattern: /for\s*\(/g, name: 'loops' },
    { pattern: /await\s+/g, name: 'asyncCalls' },
    { pattern: /throw\s+/g, name: 'errorHandling' },
    { pattern: /return\s+/g, name: 'returns' }
  ];
  
  const summary = {};
  keyPatterns.forEach(({ pattern, name }) => {
    const matches = body.match(pattern);
    summary[name] = matches ? matches.length : 0;
  });
  
  const parts = [];
  if (summary.conditionals) parts.push(`${summary.conditionals} branches`);
  if (summary.loops) parts.push(`${summary.loops} loops`);
  if (summary.asyncCalls) parts.push(`${summary.asyncCalls} async calls`);
  if (summary.errorHandling) parts.push('error handling');
  
  return parts.length > 0 ? parts.join(', ') : 'simple implementation';
}

function estimateComplexity(fn) {
  if (!fn.content) return 1;
  
  const body = fn.content;
  const complexityMarkers = [
    /if\s*\(/g,
    /else\s+if/g,
    /while\s*\(/g,
    /for\s*\(/g,
    /case\s+/g,
    /catch\s*\(/g,
    /&&|\|\|/g
  ];
  
  let complexity = 1; // base complexity
  complexityMarkers.forEach(pattern => {
    const matches = body.match(pattern);
    if (matches) complexity += matches.length;
  });
  
  return complexity;
}

module.exports = {
  DETAIL_LEVELS,
  formatAtLevel
};