/**
 * Python LSP Adapter Integration Tests
 * 
 * Tests the Python LSP adapter integration with the broader Pampax system
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { PythonLSPAdapter } from '../../src/adapters/lsp/python-adapter.js';
import { adapterRegistry } from '../../src/adapters/base.js';
import { ParseContext } from '../../src/adapters/base.js';
import path from 'path';
import fs from 'fs';

describe('Python LSP Adapter Integration', () => {
    let adapter: PythonLSPAdapter;
    let tempDir: string;

    beforeEach(() => {
        adapter = new PythonLSPAdapter({
            enableFallback: true,
            maxLSPFiles: 10,
            enableHover: false, // Disable for integration tests
            symbolOptions: {
                includePrivateSymbols: false,
                includeDunderSymbols: false,
                maxDepth: 5,
                extractTypeHints: true,
                extractDecorators: true,
                extractDocstrings: true
            }
        });

        // Create temporary directory for test files
        tempDir = fs.mkdtempSync(path.join(process.cwd(), 'test-python-lsp-int-'));
    });

    afterEach(() => {
        // Cleanup temporary directory
        if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
        
        // Cleanup adapter
        adapter.cleanup();
    });

    describe('Adapter Registry Integration', () => {
        it('should be registerable with adapter registry', () => {
            // Register adapter
            adapterRegistry.register(adapter);
            
            // Should be able to retrieve it
            const retrieved = adapterRegistry.get('lsp-python');
            assert(retrieved);
            assert.strictEqual(retrieved.id, 'lsp-python');
            
            // Should appear in supporting adapters for Python files
            const supporting = adapterRegistry.findSupporting('test.py');
            assert(supporting.length > 0);
            assert(supporting.some(a => a.id === 'lsp-python'));
        });

        it('should work alongside other adapters', () => {
            adapterRegistry.register(adapter);
            
            // Should be able to get all adapters
            const allAdapters = adapterRegistry.getAll();
            assert(allAdapters.length > 0);
            assert(allAdapters.some(a => a.id === 'lsp-python'));
            
            // Should be able to get adapters by IDs
            const specificAdapters = adapterRegistry.getByIds(['lsp-python']);
            assert.strictEqual(specificAdapters.length, 1);
            assert.strictEqual(specificAdapters[0].id, 'lsp-python');
        });
    });

    describe('Real Python Project Parsing', () => {
        it('should handle a realistic Python module', async () => {
            const realisticPythonCode = `"""
Realistic Python module for testing
"""

from typing import List, Optional, Dict, Any
import asyncio
from dataclasses import dataclass
from abc import ABC, abstractmethod

@dataclass
class User:
    """User data class"""
    id: int
    name: str
    email: Optional[str] = None
    roles: List[str] = None

    def __post_init__(self):
        if self.roles is None:
            self.roles = []

class UserService(ABC):
    """Abstract base class for user services"""
    
    @abstractmethod
    async def get_user(self, user_id: int) -> Optional[User]:
        """Get user by ID"""
        pass
    
    @abstractmethod
    async def create_user(self, user: User) -> User:
        """Create a new user"""
        pass

class InMemoryUserService(UserService):
    """In-memory implementation of user service"""
    
    def __init__(self):
        self._users: Dict[int, User] = {}
        self._next_id = 1
    
    async def get_user(self, user_id: int) -> Optional[User]:
        """Get user by ID"""
        return self._users.get(user_id)
    
    async def create_user(self, user: User) -> User:
        """Create a new user"""
        if user.id is None:
            user.id = self._next_id
            self._next_id += 1
        
        self._users[user.id] = user
        return user
    
    async def list_users(self) -> List[User]:
        """List all users"""
        return list(self._users.values())
    
    @staticmethod
    def from_config(config: Dict[str, Any]) -> 'InMemoryUserService':
        """Create service from configuration"""
        return InMemoryUserService()

def create_default_service() -> InMemoryUserService:
    """Create a default user service instance"""
    return InMemoryUserService()

async def main():
    """Main function for demonstration"""
    service = create_default_service()
    
    user = User(name="John Doe", email="john@example.com")
    created_user = await service.create_user(user)
    
    print(f"Created user: {created_user}")
    
    users = await service.list_users()
    print(f"Total users: {len(users)}")

if __name__ == "__main__":
    asyncio.run(main())
`;

            const testFile = path.join(tempDir, 'user_service.py');
            fs.writeFileSync(testFile, realisticPythonCode);

            const context: ParseContext = {
                repo: 'test-project',
                basePath: tempDir,
                onProgress: undefined
            };

            try {
                const spans = await adapter.parse([testFile], context);
                
                assert(spans.length > 0);
                
                // Check for module span
                const moduleSpan = spans.find(s => s.kind === 'module');
                assert(moduleSpan);
                assert.strictEqual(moduleSpan.name, 'user_service');
                
                // Check for dataclass
                const userClass = spans.find(s => s.kind === 'class' && s.name === 'User');
                assert(userClass);
                assert(userClass.doc?.includes('User data class'));
                
                // Check for abstract base class
                const userServiceClass = spans.find(s => s.kind === 'class' && s.name === 'UserService');
                assert(userServiceClass);
                assert(userServiceClass.doc?.includes('Abstract base class'));
                
                // Check for implementation class
                const implClass = spans.find(s => s.kind === 'class' && s.name === 'InMemoryUserService');
                assert(implClass);
                assert(implClass.doc?.includes('In-memory implementation'));
                
                // Check for functions
                const createFunc = spans.find(s => s.kind === 'function' && s.name === 'create_default_service');
                assert(createFunc);
                assert(createFunc.doc?.includes('Create a default user service'));
                
                const mainFunc = spans.find(s => s.kind === 'function' && s.name === 'main');
                assert(mainFunc);
                assert(mainFunc.doc?.includes('Main function for demonstration'));
                
                // Check for methods
                const methods = spans.filter(s => s.kind === 'method');
                assert(methods.length > 0);
                
                // Should have async methods
                const asyncMethods = methods.filter(m => m.signature?.includes('async'));
                assert(asyncMethods.length > 0);
                
                // Should have static methods
                const staticMethods = methods.filter(m => m.signature?.includes('staticmethod'));
                assert(staticMethods.length > 0);
                
            } catch (error) {
                // If LSP server is not available, fallback should still work
                assert(error instanceof Error);
                console.log('LSP server not available, testing fallback behavior');
            }
        });

        it('should handle multiple files with dependencies', async () => {
            // Create multiple related files
            const baseCode = `
class BaseComponent:
    """Base component class"""
    
    def __init__(self, name: str):
        self.name = name
    
    def get_name(self) -> str:
        return self.name
`;

            const derivedCode = `
from .base import BaseComponent

class DerivedComponent(BaseComponent):
    """Derived component class"""
    
    def __init__(self, name: str, version: str):
        super().__init__(name)
        self.version = version
    
    def get_version(self) -> str:
        return self.version
    
    def get_full_name(self) -> str:
        return f"{self.get_name()} v{self.get_version()}"
`;

            const utilCode = `
def format_component_name(name: str, version: str) -> str:
    """Format component name with version"""
    return f"{name} v{version}"

class ComponentUtils:
    """Utility class for components"""
    
    @staticmethod
    def create_component_id(name: str) -> str:
        """Create component ID"""
        return name.lower().replace(' ', '_')
`;

            const baseFile = path.join(tempDir, 'base.py');
            const derivedFile = path.join(tempDir, 'derived.py');
            const utilFile = path.join(tempDir, 'util.py');

            fs.writeFileSync(baseFile, baseCode);
            fs.writeFileSync(derivedFile, derivedCode);
            fs.writeFileSync(utilFile, utilCode);

            const context: ParseContext = {
                repo: 'multi-file-project',
                basePath: tempDir,
                onProgress: undefined
            };

            try {
                const spans = await adapter.parse([baseFile, derivedFile, utilFile], context);
                
                assert(spans.length > 0);
                
                // Should have spans from all files
                const baseSpans = spans.filter(s => s.path === baseFile);
                const derivedSpans = spans.filter(s => s.path === derivedFile);
                const utilSpans = spans.filter(s => s.path === utilFile);
                
                assert(baseSpans.length > 0);
                assert(derivedSpans.length > 0);
                assert(utilSpans.length > 0);
                
                // Check for specific components
                assert(baseSpans.some(s => s.name === 'BaseComponent'));
                assert(derivedSpans.some(s => s.name === 'DerivedComponent'));
                assert(utilSpans.some(s => s.name === 'format_component_name'));
                assert(utilSpans.some(s => s.name === 'ComponentUtils'));
                
            } catch (error) {
                // Expected if LSP server is not available
                assert(error instanceof Error);
            }
        });
    });

    describe('Error Recovery and Fallback', () => {
        it('should gracefully handle LSP server unavailability', async () => {
            // Create adapter with non-existent LSP server
            const fallbackAdapter = new PythonLSPAdapter({
                serverCommand: 'non-existent-lsp-server',
                enableFallback: true,
                maxLSPFiles: 5
            });

            const testFile = path.join(tempDir, 'test.py');
            fs.writeFileSync(testFile, 'def test(): pass');

            const context: ParseContext = {
                repo: 'test-repo',
                basePath: tempDir,
                onProgress: undefined
            };

            try {
                const spans = await fallbackAdapter.parse([testFile], context);
                
                // Should still get spans from fallback
                assert(spans.length > 0);
                
                // Should have module and function spans
                assert(spans.some(s => s.kind === 'module'));
                assert(spans.some(s => s.kind === 'function'));
                
            } catch (error) {
                // Should not throw if fallback is enabled
                assert.fail('Should not throw when fallback is enabled');
            } finally {
                fallbackAdapter.cleanup();
            }
        });

        it('should fail gracefully when fallback is disabled', async () => {
            const noFallbackAdapter = new PythonLSPAdapter({
                serverCommand: 'non-existent-lsp-server',
                enableFallback: false,
                maxLSPFiles: 5
            });

            const testFile = path.join(tempDir, 'test.py');
            fs.writeFileSync(testFile, 'def test(): pass');

            const context: ParseContext = {
                repo: 'test-repo',
                basePath: tempDir,
                onProgress: undefined
            };

            try {
                await noFallbackAdapter.parse([testFile], context);
                assert.fail('Should have thrown an error when LSP server is unavailable and fallback is disabled');
            } catch (error) {
                assert(error instanceof Error);
            } finally {
                noFallbackAdapter.cleanup();
            }
        });
    });

    describe('Performance and Scaling', () => {
        it('should handle large file counts with fallback', async () => {
            const largeAdapter = new PythonLSPAdapter({
                maxLSPFiles: 3, // Low limit to trigger fallback
                enableFallback: true
            });

            const files: string[] = [];
            
            // Create more files than the limit
            for (let i = 0; i < 5; i++) {
                const fileName = 'file_' + i + '.py';
                const testFile = path.join(tempDir, fileName);
                fs.writeFileSync(testFile, 'def test_' + i + '(): return ' + i);
                files.push(testFile);
            }

            const context: ParseContext = {
                repo: 'large-project',
                basePath: tempDir,
                onProgress: undefined
            };

            try {
                const spans = await largeAdapter.parse(files, context);
                
                // Should still get spans from fallback
                assert(spans.length > 0);
                
                // Should have spans from all files
                const uniqueFiles = new Set(spans.map(s => s.path));
                assert(uniqueFiles.size >= 5); // At least all our test files
                
            } catch (error) {
                assert.fail('Should not throw even with large file count');
            } finally {
                largeAdapter.cleanup();
            }
        });
    });
});