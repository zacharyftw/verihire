import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface ExecutionResult {
  stdout: string | null;
  stderr: string | null;
  compileOutput: string | null;
  status: {
    id: number;
    description: string;
  };
  time: string | null;
  memory: number | null;
  passed: boolean;
}

export interface TestCaseResult {
  name: string;
  input: string;
  expectedOutput: string;
  actualOutput: string | null;
  passed: boolean;
  status: string;
  time: string | null;
  memory: number | null;
  error: string | null;
}

export interface TestCaseResults {
  totalTests: number;
  passed: number;
  failed: number;
  accuracy: number;
  results: TestCaseResult[];
  totalExecutionTimeMs: number;
}

@Injectable()
export class CodeExecutionService {
  private readonly logger = new Logger(CodeExecutionService.name);
  private readonly executionUrl: string;

  constructor(private configService: ConfigService) {
    // Reads JUDGE0_URL env var for backwards compatibility — now points to our execution server
    this.executionUrl = this.configService.get<string>('judge0.url') || 'http://localhost:9090';
  }

  async executeCode(params: {
    code: string;
    language: string;
    stdin?: string;
    expectedOutput?: string;
    timeLimit?: number;
    memoryLimit?: number;
  }): Promise<ExecutionResult> {
    try {
      const response = await fetch(`${this.executionUrl}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_code: params.code,
          language: params.language,
          stdin: params.stdin || '',
          time_limit: params.timeLimit || 10,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(`Execution failed: ${response.status} - ${errorText}`);
        return this.errorResult(`Execution error: ${response.status}`);
      }

      const data = await response.json();
      const passed =
        params.expectedOutput != null &&
        this.normalizeOutput(data.stdout || '') === this.normalizeOutput(params.expectedOutput);

      return {
        stdout: data.stdout || null,
        stderr: data.stderr || null,
        compileOutput: null,
        status: {
          id: data.exitCode === 0 ? 3 : 6,
          description: data.exitCode === 0 ? 'Accepted' : 'Runtime Error',
        },
        time: data.time ? `${data.time / 1000}` : null,
        memory: null,
        passed,
      };
    } catch (error) {
      this.logger.error(`Execution request failed: ${error}`);
      return this.errorResult(`Execution service unavailable: ${error}`);
    }
  }

  async runTestCases(params: {
    code: string;
    language: string;
    testCases: Array<{
      input: string;
      expectedOutput: string;
      name?: string;
    }>;
    timeLimit?: number;
    memoryLimit?: number;
  }): Promise<TestCaseResults> {
    const startTime = Date.now();

    if (params.testCases.length === 0) {
      return {
        totalTests: 0,
        passed: 0,
        failed: 0,
        accuracy: 0,
        results: [],
        totalExecutionTimeMs: 0,
      };
    }

    try {
      // Build batch submissions — same code, different stdin for each test case
      const submissions = params.testCases.map(tc => ({
        source_code: params.code,
        language: params.language,
        stdin: tc.input,
        time_limit: params.timeLimit || 10,
      }));

      const response = await fetch(`${this.executionUrl}/execute/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submissions }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(`Batch execution failed: ${response.status} - ${errorText}`);
        return this.errorTestResults(
          params.testCases,
          `Execution error: ${response.status}`,
          startTime
        );
      }

      const data = await response.json();
      const results = data.results || [];

      // Map results to test cases with normalized comparison
      const testCaseResults: TestCaseResult[] = params.testCases.map((tc, i) => {
        const result = results[i];
        const actualOutput = result?.stdout || null;
        const hasError = result?.exitCode !== 0 || result?.stderr;

        const normalizedMatch =
          actualOutput != null &&
          this.normalizeOutput(actualOutput) === this.normalizeOutput(tc.expectedOutput);

        const passed = normalizedMatch;

        let status: string;
        if (passed) {
          status = 'Accepted';
        } else if (hasError && result?.stderr) {
          status = result.stderr.includes('timeout') ? 'Time Limit Exceeded' : 'Runtime Error';
        } else if (actualOutput != null) {
          status = 'Wrong Answer';
        } else {
          status = 'Internal Error';
        }

        return {
          name: tc.name || `Test Case ${i + 1}`,
          input: tc.input,
          expectedOutput: tc.expectedOutput,
          actualOutput: actualOutput?.trim() || null,
          passed,
          status,
          time: result?.time ? `${result.time}` : null,
          memory: null,
          error: result?.stderr || null,
        };
      });

      const passedCount = testCaseResults.filter(r => r.passed).length;

      return {
        totalTests: testCaseResults.length,
        passed: passedCount,
        failed: testCaseResults.length - passedCount,
        accuracy:
          testCaseResults.length > 0
            ? Math.round((passedCount / testCaseResults.length) * 10000) / 100
            : 0,
        results: testCaseResults,
        totalExecutionTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      this.logger.error(`Batch execution request failed: ${error}`);
      return this.errorTestResults(
        params.testCases,
        `Execution service unavailable: ${error}`,
        startTime
      );
    }
  }

  async checkHealth(): Promise<boolean> {
    try {
      const response = await fetch(`${this.executionUrl}/health`, {
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Normalize output for comparison — handles whitespace, trailing newlines,
   * inconsistent spacing in arrays/objects, etc.
   */
  normalizeOutput(output: string): string {
    return output
      .trim()
      .replace(/\r\n/g, '\n')
      .replace(/\n+$/g, '')
      .replace(/[ \t]+$/gm, '')
      .replace(/,\s+/g, ',')
      .replace(/\[\s+/g, '[')
      .replace(/\s+\]/g, ']')
      .replace(/\{\s+/g, '{')
      .replace(/\s+\}/g, '}')
      .toLowerCase();
  }

  private errorResult(message: string): ExecutionResult {
    return {
      stdout: null,
      stderr: message,
      compileOutput: null,
      status: { id: 0, description: 'Service Error' },
      time: null,
      memory: null,
      passed: false,
    };
  }

  private errorTestResults(
    testCases: Array<{ input: string; expectedOutput: string; name?: string }>,
    errorMessage: string,
    startTime: number
  ): TestCaseResults {
    return {
      totalTests: testCases.length,
      passed: 0,
      failed: testCases.length,
      accuracy: 0,
      results: testCases.map((tc, i) => ({
        name: tc.name || `Test Case ${i + 1}`,
        input: tc.input,
        expectedOutput: tc.expectedOutput,
        actualOutput: null,
        passed: false,
        status: 'Service Error',
        time: null,
        memory: null,
        error: errorMessage,
      })),
      totalExecutionTimeMs: Date.now() - startTime,
    };
  }
}
