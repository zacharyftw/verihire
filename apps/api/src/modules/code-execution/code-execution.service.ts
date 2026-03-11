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
  private readonly judge0Url: string;

  constructor(private configService: ConfigService) {
    this.judge0Url = this.configService.get<string>('judge0.url') || 'http://localhost:2358';
  }

  getLanguageId(language: string): number {
    const map: Record<string, number> = {
      javascript: 63,
      typescript: 74,
      python: 71,
      python3: 71,
      java: 62,
      c: 50,
      cpp: 54,
      'c++': 54,
      go: 60,
      rust: 73,
      ruby: 72,
      csharp: 51,
      php: 68,
      swift: 83,
      kotlin: 78,
    };
    return map[language.toLowerCase()] || 63;
  }

  async executeCode(params: {
    code: string;
    language: string;
    stdin?: string;
    expectedOutput?: string;
    timeLimit?: number;
    memoryLimit?: number;
  }): Promise<ExecutionResult> {
    const languageId = this.getLanguageId(params.language);

    try {
      const response = await fetch(`${this.judge0Url}/submissions?base64_encoded=false&wait=true`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_code: params.code,
          language_id: languageId,
          stdin: params.stdin || '',
          expected_output: params.expectedOutput || undefined,
          cpu_time_limit: params.timeLimit || 5,
          memory_limit: params.memoryLimit || 256000,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(`Judge0 submission failed: ${response.status} - ${errorText}`);
        return this.errorResult(`Judge0 error: ${response.status}`);
      }

      const data = await response.json();
      return this.parseResult(data, params.expectedOutput);
    } catch (error) {
      this.logger.error(`Judge0 request failed: ${error}`);
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
    const languageId = this.getLanguageId(params.language);

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
      // Submit all test cases as a batch
      const submissions = params.testCases.map(tc => ({
        source_code: params.code,
        language_id: languageId,
        stdin: tc.input,
        expected_output: tc.expectedOutput,
        cpu_time_limit: params.timeLimit || 5,
        memory_limit: params.memoryLimit || 256000,
      }));

      const response = await fetch(`${this.judge0Url}/submissions/batch?base64_encoded=false`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submissions }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(`Judge0 batch submission failed: ${response.status} - ${errorText}`);
        return this.errorTestResults(
          params.testCases,
          `Judge0 error: ${response.status}`,
          startTime
        );
      }

      const tokens: Array<{ token: string }> = await response.json();

      // Poll for results with exponential backoff
      const results = await this.pollBatchResults(tokens.map(t => t.token));

      // Map results to test cases with normalized comparison
      const testCaseResults: TestCaseResult[] = params.testCases.map((tc, i) => {
        const result = results[i];
        const actualOutput = result?.stdout || null;

        // Judge0 status 3 = Accepted (exact match), but we also do normalized comparison
        // to handle whitespace/formatting differences
        const judge0Accepted = result?.status?.id === 3;
        const normalizedMatch =
          actualOutput != null &&
          this.normalizeOutput(actualOutput) === this.normalizeOutput(tc.expectedOutput);
        const passed = judge0Accepted || normalizedMatch;

        return {
          name: tc.name || `Test Case ${i + 1}`,
          input: tc.input,
          expectedOutput: tc.expectedOutput,
          actualOutput: actualOutput?.trim() || null,
          passed,
          status: passed ? 'Accepted' : result?.status?.description || 'Wrong Answer',
          time: result?.time || null,
          memory: result?.memory || null,
          error: result?.stderr || result?.compile_output || null,
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
      this.logger.error(`Judge0 batch request failed: ${error}`);
      return this.errorTestResults(
        params.testCases,
        `Execution service unavailable: ${error}`,
        startTime
      );
    }
  }

  async checkHealth(): Promise<boolean> {
    try {
      const response = await fetch(`${this.judge0Url}/languages`, {
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  private async pollBatchResults(tokens: string[], maxWaitMs = 30000): Promise<any[]> {
    const startTime = Date.now();
    let delay = 500;

    while (Date.now() - startTime < maxWaitMs) {
      const tokenQuery = tokens.map(t => `tokens=${t}`).join('&');
      const response = await fetch(
        `${this.judge0Url}/submissions/batch?${tokenQuery}&base64_encoded=false&fields=stdout,stderr,status,time,memory,compile_output`
      );

      if (!response.ok) {
        this.logger.warn(`Poll failed with status ${response.status}`);
        await this.sleep(delay);
        delay = Math.min(delay * 1.5, 3000);
        continue;
      }

      const data = await response.json();
      const submissions = data.submissions || data;

      // Check if all are done (status.id >= 3 means finished)
      const allDone = submissions.every((s: any) => s.status && s.status.id >= 3);

      if (allDone) {
        return submissions;
      }

      await this.sleep(delay);
      delay = Math.min(delay * 1.5, 3000);
    }

    this.logger.warn('Batch polling timed out');
    // Return whatever we have
    const tokenQuery = tokens.map(t => `tokens=${t}`).join('&');
    const response = await fetch(
      `${this.judge0Url}/submissions/batch?${tokenQuery}&base64_encoded=false&fields=stdout,stderr,status,time,memory,compile_output`
    );
    if (response.ok) {
      const data = await response.json();
      return data.submissions || data;
    }
    return tokens.map(() => ({ status: { id: 0, description: 'Timeout' } }));
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Normalize output for comparison — handles whitespace, trailing newlines,
   * inconsistent spacing in arrays/objects, etc.
   */
  normalizeOutput(output: string): string {
    return output
      .trim() // remove leading/trailing whitespace
      .replace(/\r\n/g, '\n') // normalize line endings
      .replace(/\n+$/g, '') // remove trailing newlines
      .replace(/[ \t]+$/gm, '') // remove trailing spaces per line
      .replace(/,\s+/g, ',') // "1, 2, 3" → "1,2,3"
      .replace(/\[\s+/g, '[') // "[ 1" → "[1"
      .replace(/\s+\]/g, ']') // "1 ]" → "1]"
      .replace(/\{\s+/g, '{') // "{ key" → "{key"
      .replace(/\s+\}/g, '}') // "key }" → "key}"
      .replace(/:\s+/g, ':') // "key: val" → "key:val"
      .toLowerCase(); // case-insensitive
  }

  private parseResult(data: any, _expectedOutput?: string): ExecutionResult {
    const passed = data.status?.id === 3; // 3 = Accepted

    return {
      stdout: data.stdout || null,
      stderr: data.stderr || null,
      compileOutput: data.compile_output || null,
      status: {
        id: data.status?.id || 0,
        description: data.status?.description || 'Unknown',
      },
      time: data.time || null,
      memory: data.memory || null,
      passed,
    };
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
