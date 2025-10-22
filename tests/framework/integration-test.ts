import { execSync } from 'child_process';
import { existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { TestUtils } from './test-utils.js';

export interface IntegrationTestOptions {
  repoPath: string;
  command: string;
  expectedExitCode?: number;
  timeout?: number;
  cleanup?: boolean;
}

export class IntegrationTest {
  private options: IntegrationTestOptions;

  constructor(options: IntegrationTestOptions) {
    this.options = {
      expectedExitCode: 0,
      timeout: 30000,
      cleanup: true,
      ...options
    };
  }

  async run(): Promise<{
    exitCode: number;
    stdout: string;
    stderr: string;
    success: boolean;
  }> {
    const { repoPath, command, expectedExitCode, timeout, cleanup } = this.options;

    try {
      const result = execSync(command, {
        cwd: repoPath,
        encoding: 'utf-8',
        timeout,
        stdio: 'pipe'
      });

      const success = expectedExitCode === 0;

      return {
        exitCode: 0,
        stdout: result,
        stderr: '',
        success
      };
    } catch (error: any) {
      const success = error.status === expectedExitCode;

      return {
        exitCode: error.status || 1,
        stdout: error.stdout || '',
        stderr: error.stderr || '',
        success
      };
    } finally {
      if (cleanup) {
        this.cleanup();
      }
    }
  }

  private cleanup(): void {
    const filesToClean = [
      join(this.options.repoPath, '.pampax'),
      join(this.options.repoPath, 'error-history.json'),
      join(this.options.repoPath, 'pampax.log')
    ];

    filesToClean.forEach(file => {
      if (existsSync(file)) {
        try {
          unlinkSync(file);
        } catch (error) {
          console.warn(`Failed to cleanup ${file}:`, error);
        }
      }
    });
  }

  static createTestRepo(name: string, files: Record<string, string>): string {
    const tempDir = TestUtils.createTempDir(`integration-${name}`);
    
    for (const [filePath, content] of Object.entries(files)) {
      const fullPath = join(tempDir, filePath);
      const dir = fullPath.substring(0, fullPath.lastIndexOf('/'));
      
      if (!existsSync(dir)) {
        execSync(`mkdir -p "${dir}"`);
      }
      
      require('fs').writeFileSync(fullPath, content);
    }

    return tempDir;
  }
}