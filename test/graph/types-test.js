/**
 * Graph Edge Types and Interfaces (for testing)
 */

export const EdgeType = {
  CALL: 'call',
  IMPORT: 'import',
  TEST_OF: 'test-of',
  ROUTES: 'routes',
  CONFIG_KEY: 'config-key'
};

// For type checking in tests
export function isValidEdgeType(type) {
  return Object.values(EdgeType).includes(type);
}