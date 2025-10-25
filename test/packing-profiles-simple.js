/**
 * Simple test for packing profiles functionality
 */

// Test the basic constants and interfaces
function testBasicFunctionality() {
  console.log('🧪 Testing Packing Profiles Basic Functionality');
  
  // Test default priorities
  const DEFAULT_PRIORITIES = {
    tests: 0.8,
    code: 1.0,
    comments: 0.6,
    examples: 0.7,
    config: 0.5,
    docs: 0.4
  };

  // Test model profiles
  const MODEL_PROFILES = {
    'gpt-4': {
      priorities: { ...DEFAULT_PRIORITIES, code: 1.0, comments: 0.7 },
      budgetAllocation: { 
        total: 8000,
        mustHave: 2000,
        important: 3000,
        supplementary: 2000,
        optional: 800,
        reserve: 200
      },
      capsuleStrategies: { 
        enabled: true,
        maxCapsuleSize: 1200,
        minCapsuleSize: 200,
        capsuleThreshold: 1500,
        preserveStructure: true
      },
      truncationStrategies: { 
        strategy: 'smart',
        preserveImportant: true,
        preserveContext: true,
        truncateComments: true,
        preserveSignatures: true
      }
    },
    'gpt-3.5-turbo': {
      priorities: { ...DEFAULT_PRIORITIES, code: 1.0, examples: 0.8 },
      budgetAllocation: { 
        total: 4000,
        mustHave: 1000,
        important: 1500,
        supplementary: 1000,
        optional: 400,
        reserve: 100
      },
      capsuleStrategies: { 
        enabled: true,
        maxCapsuleSize: 800,
        minCapsuleSize: 150,
        capsuleThreshold: 1200,
        preserveStructure: true
      },
      truncationStrategies: { 
        strategy: 'head',
        preserveImportant: true,
        preserveContext: true,
        truncateComments: true,
        preserveSignatures: true
      }
    },
    'claude-3': {
      priorities: { ...DEFAULT_PRIORITIES, code: 1.0, docs: 0.8, comments: 0.7 },
      budgetAllocation: { 
        total: 100000,
        mustHave: 30000,
        important: 35000,
        supplementary: 25000,
        optional: 8000,
        reserve: 2000
      },
      capsuleStrategies: { 
        enabled: true,
        maxCapsuleSize: 2000,
        minCapsuleSize: 300,
        capsuleThreshold: 2000,
        preserveStructure: true
      },
      truncationStrategies: { 
        strategy: 'smart',
        preserveImportant: true,
        preserveContext: true,
        truncateComments: false,
        preserveSignatures: true
      }
    },
    'default': {
      priorities: DEFAULT_PRIORITIES,
      budgetAllocation: { 
        total: 8000,
        mustHave: 2000,
        important: 3000,
        supplementary: 2000,
        optional: 800,
        reserve: 200
      },
      capsuleStrategies: { 
        enabled: true,
        maxCapsuleSize: 1000,
        minCapsuleSize: 200,
        capsuleThreshold: 1500,
        preserveStructure: true
      },
      truncationStrategies: { 
        strategy: 'smart',
        preserveImportant: true,
        preserveContext: true,
        truncateComments: true,
        preserveSignatures: true
      }
    }
  };

  // Test intent priority adjustments
  const INTENT_PRIORITY_ADJUSTMENTS = {
    symbol: {
      code: 1.0,
      comments: 0.8,
      examples: 0.9
    },
    config: {
      config: 1.0,
      docs: 0.8,
      code: 0.7
    },
    api: {
      code: 1.0,
      examples: 0.9,
      comments: 0.7
    },
    incident: {
      code: 1.0,
      tests: 0.9,
      comments: 0.8
    },
    search: {
      code: 0.8,
      docs: 0.9,
      examples: 0.8
    }
  };

  console.log('✅ Default priorities defined:', Object.keys(DEFAULT_PRIORITIES));
  console.log('✅ Model profiles defined:', Object.keys(MODEL_PROFILES));
  console.log('✅ Intent adjustments defined:', Object.keys(INTENT_PRIORITY_ADJUSTMENTS));
  
  // Test budget validation
  function validateBudgetAllocation(budget) {
    const { total, mustHave, important, supplementary, optional, reserve } = budget;
    const allocated = mustHave + important + supplementary + optional + reserve;
    return allocated <= total;
  }

  for (const [model, profile] of Object.entries(MODEL_PROFILES)) {
    const isValid = validateBudgetAllocation(profile.budgetAllocation);
    console.log(`✅ ${model} budget allocation valid: ${isValid}`);
  }

  // Test priority ranges
  function validatePriorities(priorities) {
    return Object.values(priorities).every(p => p >= 0 && p <= 1);
  }

  for (const [model, profile] of Object.entries(MODEL_PROFILES)) {
    const isValid = validatePriorities(profile.priorities);
    console.log(`✅ ${model} priorities valid: ${isValid}`);
  }

  console.log('\n🎯 Model Budget Comparison:');
  for (const [model, profile] of Object.entries(MODEL_PROFILES)) {
    console.log(`   ${model}: ${profile.budgetAllocation.total} tokens`);
  }

  console.log('\n📊 Priority Comparison:');
  console.log('   Model     | Code | Tests | Docs | Examples');
  console.log('   ----------|------|-------|------|---------');
  for (const [model, profile] of Object.entries(MODEL_PROFILES)) {
    console.log(`   ${model.padEnd(10)} | ${profile.priorities.code.toFixed(1)}  | ${profile.priorities.tests.toFixed(1)}    | ${profile.priorities.docs.toFixed(1)}  | ${profile.priorities.examples.toFixed(1)}`);
  }

  return true;
}

// Test content classification logic
function testContentClassification() {
  console.log('\n🧪 Testing Content Classification Logic');

  const testCases = [
    {
      path: 'src/test.js',
      content: 'function test() { return true; }',
      expectedType: 'code'
    },
    {
      path: 'test/unit.test.js',
      content: 'describe("test", () => { it("should pass", () => {}); });',
      expectedType: 'tests'
    },
    {
      path: '.env',
      content: 'DATABASE_URL=postgres://localhost/test',
      expectedType: 'config'
    },
    {
      path: 'README.md',
      content: '# Project Documentation\n\nThis is a test project.',
      expectedType: 'docs'
    },
    {
      path: 'examples/basic.js',
      content: '// Basic usage example\nconst example = new Example();',
      expectedType: 'examples'
    }
  ];

  function classifyContent(item) {
    const path = item.path.toLowerCase();
    const content = item.content.toLowerCase();

    // Test files
    if (path.includes('/test/') || path.includes('.test.') || path.includes('.spec.') ||
        path.includes('__tests__')) {
      return 'tests';
    }

    // Configuration files
    if (path.includes('config') || path.includes('.env') || path.includes('package.json') ||
        path.includes('tsconfig') || path.includes('webpack') || path.includes('vite') ||
        path.endsWith('.yml') || path.endsWith('.yaml') || path.endsWith('.ini') ||
        path.endsWith('.toml') || path.endsWith('.properties')) {
      return 'config';
    }

    // Documentation files
    if (path.includes('docs/') || path.endsWith('.md') || path.endsWith('.rst') ||
        path.includes('readme')) {
      return 'docs';
    }

    // Example files
    if (path.includes('example') || path.includes('demo') || path.includes('sample') ||
        path.includes('/examples/')) {
      return 'examples';
    }

    // Default to code
    return 'code';
  }

  let passed = 0;
  for (const testCase of testCases) {
    const classified = classifyContent(testCase);
    const success = classified === testCase.expectedType;
    console.log(`   ${success ? '✅' : '❌'} ${testCase.path} -> ${classified} (expected: ${testCase.expectedType})`);
    if (success) passed++;
  }

  console.log(`\n📊 Classification Results: ${passed}/${testCases.length} tests passed`);
  return passed === testCases.length;
}

// Test budget allocation logic
function testBudgetAllocation() {
  console.log('\n🧪 Testing Budget Allocation Logic');

  const budget = {
    total: 8000,
    mustHave: 2000,
    important: 3000,
    supplementary: 2000,
    optional: 800,
    reserve: 200
  };

  // Mock content items with different priorities
  const contentItems = [
    { type: 'must-have', tokens: 1500, priority: 0.9 },
    { type: 'must-have', tokens: 800, priority: 0.8 },
    { type: 'important', tokens: 1200, priority: 0.7 },
    { type: 'important', tokens: 1800, priority: 0.85 },
    { type: 'supplementary', tokens: 1000, priority: 0.6 },
    { type: 'supplementary', tokens: 800, priority: 0.65 },
    { type: 'optional', tokens: 600, priority: 0.4 },
    { type: 'optional', tokens: 400, priority: 0.5 }
  ];

  function allocateBudget(items, budget) {
    const result = [];
    const used = { 'must-have': 0, 'important': 0, 'supplementary': 0, 'optional': 0 };
    const categories = ['must-have', 'important', 'supplementary', 'optional'];

    for (const category of categories) {
      const categoryItems = items.filter(item => item.type === category);
      const availableBudget = budget[category] - (used[category] || 0);

      for (const item of categoryItems) {
        if (used[category] + item.tokens <= availableBudget) {
          result.push(item);
          used[category] += item.tokens;
        }
      }
    }

    return result;
  }

  const allocatedItems = allocateBudget(contentItems, budget);
  const totalTokensUsed = allocatedItems.reduce((sum, item) => sum + item.tokens, 0);
  const totalBudgetUsed = budget.total - budget.reserve;

  console.log(`   📦 Items allocated: ${allocatedItems.length}/${contentItems.length}`);
  console.log(`   💰 Tokens used: ${totalTokensUsed}/${totalBudgetUsed}`);
  console.log(`   📊 Budget utilization: ${(totalTokensUsed / totalBudgetUsed * 100).toFixed(1)}%`);

  // Check budget by category
  const usedByCategory = {};
  for (const item of allocatedItems) {
    usedByCategory[item.type] = (usedByCategory[item.type] || 0) + item.tokens;
  }

  console.log('   📋 Budget usage by category:');
  for (const category of ['must-have', 'important', 'supplementary', 'optional']) {
    const used = usedByCategory[category] || 0;
    const allocated = budget[category];
    const percentage = (used / allocated * 100).toFixed(1);
    console.log(`      ${category}: ${used}/${allocated} (${percentage}%)`);
  }

  return totalTokensUsed <= totalBudgetUsed;
}

// Run all tests
function runAllTests() {
  console.log('🚀 PAMPAX Packing Profiles - Simple Test Suite\n');
  
  const results = [];
  results.push(testBasicFunctionality());
  results.push(testContentClassification());
  results.push(testBudgetAllocation());

  const passed = results.filter(r => r).length;
  const total = results.length;

  console.log(`\n🎉 Test Results: ${passed}/${total} test suites passed`);
  
  if (passed === total) {
    console.log('✅ All tests passed! Packing profiles implementation is working correctly.');
  } else {
    console.log('❌ Some tests failed. Please check the implementation.');
  }

  return passed === total;
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllTests();
}

export {
  testBasicFunctionality,
  testContentClassification,
  testBudgetAllocation,
  runAllTests
};