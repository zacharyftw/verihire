import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface GeneratedTestCase {
  input: string;
  expectedOutput: string;
  category: 'normal' | 'edge' | 'boundary' | 'performance';
  description: string;
}

export interface GeneratedFeedback {
  feedback: string;
  suggestions: string[];
  codeQualityScore: number;
  codeQualityNotes: string;
}

@Injectable()
export class TestCaseGeneratorService {
  private readonly logger = new Logger(TestCaseGeneratorService.name);
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;

  constructor(private configService: ConfigService) {
    this.apiKey = this.configService.get<string>('openai.apiKey') || '';
    this.model = this.configService.get<string>('openai.model') || 'llama-3.3-70b-versatile';
    this.baseUrl = this.configService.get<string>('openai.baseUrl', 'https://api.openai.com/v1');
  }

  async generateTestCases(params: {
    challengeTitle: string;
    challengeDescription: string;
    requirements: string[];
    language: string;
    functionSignature?: string;
    numTestCases?: number;
  }): Promise<GeneratedTestCase[]> {
    const numTestCases = params.numTestCases || 10;

    const systemPrompt = `You are a test case generator for coding challenges. Generate test cases that thoroughly test a solution.

RULES:
- Generate exactly ${numTestCases} test cases
- Include: 3-4 normal cases, 3-4 edge cases, 2-3 boundary cases
- Each test case has an input (stdin) and expected output (stdout)
- For edge cases: empty inputs, single elements, negative numbers, large values, duplicates, special characters
- The input and output must be exact strings as they would appear in stdin/stdout
- Output ONLY a valid JSON array, no markdown, no explanation

FORMAT:
[
  {
    "input": "exact stdin input",
    "expectedOutput": "exact expected stdout output",
    "category": "normal|edge|boundary|performance",
    "description": "what this test case checks"
  }
]`;

    const requirementsList =
      params.requirements.length > 0
        ? `\nREQUIREMENTS:\n${params.requirements.map((r, i) => `${i + 1}. ${r}`).join('\n')}`
        : '';

    const signatureInfo = params.functionSignature
      ? `\nFUNCTION SIGNATURE: ${params.functionSignature}`
      : '';

    const userPrompt = `CHALLENGE: ${params.challengeTitle}

DESCRIPTION:
${params.challengeDescription}
${requirementsList}
${signatureInfo}
LANGUAGE: ${params.language}

Generate ${numTestCases} test cases for this challenge. The program reads from stdin and writes to stdout.`;

    return this.callLLMForTestCases(systemPrompt, userPrompt, numTestCases);
  }

  async generateDSATestCases(params: {
    problemType: string;
    challengeDescription: string;
    functionSignature: string;
    numTestCases?: number;
  }): Promise<GeneratedTestCase[]> {
    const numTestCases = params.numTestCases || 12;

    const systemPrompt = `You are a DSA test case generator specializing in ${params.problemType} problems. Generate thorough test cases.

RULES:
- Generate exactly ${numTestCases} test cases
- Include small inputs, medium inputs, and at least one larger input
- Include all relevant edge cases for ${params.problemType}:
  ${this.getDSAEdgeCaseHints(params.problemType)}
- Input/output must be exact stdin/stdout format
- Output ONLY a valid JSON array

FORMAT:
[
  {
    "input": "exact stdin input",
    "expectedOutput": "exact expected stdout output",
    "category": "normal|edge|boundary|performance",
    "description": "what this test case checks"
  }
]`;

    const userPrompt = `PROBLEM TYPE: ${params.problemType}
DESCRIPTION: ${params.challengeDescription}
FUNCTION: ${params.functionSignature}

Generate ${numTestCases} test cases.`;

    return this.callLLMForTestCases(systemPrompt, userPrompt, numTestCases);
  }

  async generateDomainTestCases(params: {
    domain: string;
    challengeDescription: string;
    requirements: string[];
    numTestCases?: number;
  }): Promise<GeneratedTestCase[]> {
    const numTestCases = params.numTestCases || 8;

    const systemPrompt = `You are a test case generator for ${params.domain} challenges. Generate test cases that verify the solution works correctly.

RULES:
- Generate exactly ${numTestCases} test cases
- Test both happy path and error scenarios
- Test domain-specific requirements
- Input/output must be exact stdin/stdout format
- Output ONLY a valid JSON array

FORMAT:
[
  {
    "input": "exact stdin input",
    "expectedOutput": "exact expected stdout output",
    "category": "normal|edge|boundary|performance",
    "description": "what this test case checks"
  }
]`;

    const requirementsList = params.requirements.map((r, i) => `${i + 1}. ${r}`).join('\n');
    const userPrompt = `DOMAIN: ${params.domain}
DESCRIPTION: ${params.challengeDescription}
REQUIREMENTS:
${requirementsList}

Generate ${numTestCases} test cases.`;

    return this.callLLMForTestCases(systemPrompt, userPrompt, numTestCases);
  }

  async generateFeedback(params: {
    challengeTitle: string;
    challengeDescription: string;
    code: string;
    language: string;
    testResults: Array<{
      name: string;
      passed: boolean;
      input: string;
      expectedOutput: string;
      actualOutput: string | null;
      error: string | null;
    }>;
    accuracy: number;
  }): Promise<GeneratedFeedback> {
    if (!this.apiKey) {
      return this.getMockFeedback(params.accuracy);
    }

    const passedTests = params.testResults.filter(t => t.passed);
    const failedTests = params.testResults.filter(t => !t.passed);

    const failedSummary = failedTests
      .slice(0, 5)
      .map(
        t =>
          `- ${t.name}: input="${t.input}" expected="${t.expectedOutput}" got="${t.actualOutput || 'no output'}" ${t.error ? `error: ${t.error}` : ''}`
      )
      .join('\n');

    const systemPrompt = `You are an expert code reviewer. Analyze the code and test results to provide constructive feedback.

RESPONSE FORMAT (JSON):
{
  "feedback": "overall assessment paragraph",
  "suggestions": ["specific improvement 1", "specific improvement 2", ...],
  "codeQualityScore": 75,
  "codeQualityNotes": "notes on code style, readability, efficiency"
}

codeQualityScore is an integer from 0-100 evaluating: readability, structure, error handling, naming, efficiency, and best practices.

Output ONLY valid JSON, no markdown.`;

    const userPrompt = `CHALLENGE: ${params.challengeTitle}
DESCRIPTION: ${params.challengeDescription}
LANGUAGE: ${params.language}
ACCURACY: ${params.accuracy}% (${passedTests.length}/${params.testResults.length} tests passed)

CODE:
\`\`\`${params.language}
${params.code.slice(0, 3000)}
\`\`\`

${failedTests.length > 0 ? `FAILED TESTS:\n${failedSummary}` : 'ALL TESTS PASSED'}

Provide feedback on this submission.`;

    try {
      const response = await this.callLLM(systemPrompt, userPrompt);
      const parsed = JSON.parse(response);
      return {
        feedback: parsed.feedback || 'Evaluation complete.',
        suggestions: parsed.suggestions || [],
        codeQualityScore:
          typeof parsed.codeQualityScore === 'number'
            ? Math.min(100, Math.max(0, Math.round(parsed.codeQualityScore)))
            : 70,
        codeQualityNotes: parsed.codeQualityNotes || '',
      };
    } catch (error) {
      this.logger.error(`Feedback generation failed: ${error}`);
      return this.getMockFeedback(params.accuracy);
    }
  }

  private async callLLMForTestCases(
    systemPrompt: string,
    userPrompt: string,
    _numTestCases: number
  ): Promise<GeneratedTestCase[]> {
    if (!this.apiKey) {
      this.logger.warn('No API key configured, skipping LLM test case generation');
      return [];
    }

    // Try up to 2 times (initial + 1 retry)
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const content = await this.callLLM(systemPrompt, userPrompt);

        // Extract JSON from response (handle markdown code blocks)
        const jsonStr = content
          .replace(/```json?\n?/g, '')
          .replace(/```/g, '')
          .trim();
        const parsed = JSON.parse(jsonStr);

        if (!Array.isArray(parsed)) {
          throw new Error('Response is not an array');
        }

        // Validate and normalize
        return parsed.map((tc: any, i: number) => ({
          input: String(tc.input ?? ''),
          expectedOutput: String(tc.expectedOutput ?? ''),
          category: ['normal', 'edge', 'boundary', 'performance'].includes(tc.category)
            ? tc.category
            : 'normal',
          description: tc.description || `Test case ${i + 1}`,
        }));
      } catch (error) {
        this.logger.warn(`Test case generation attempt ${attempt + 1} failed: ${error}`);
        if (attempt === 1) {
          this.logger.error('Test case generation failed after retries, returning empty');
          return [];
        }
      }
    }

    return [];
  }

  private async callLLM(systemPrompt: string, userPrompt: string): Promise<string> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 4096,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`LLM API error ${response.status}: ${error}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('Empty response from LLM');
    }

    return content;
  }

  private getDSAEdgeCaseHints(problemType: string): string {
    const hints: Record<string, string> = {
      sorting:
        '- Empty array, single element, already sorted, reverse sorted, all duplicates, negative numbers',
      binary_tree:
        '- Empty tree, single node, skewed tree (all left/right), balanced tree, duplicate values',
      graph: '- Empty graph, single node, disconnected graph, cycle, self-loop',
      linked_list: '- Empty list, single node, two nodes, cycle detection if applicable',
      dynamic_programming: '- Base cases (n=0, n=1), small inputs, negative values if applicable',
      string:
        '- Empty string, single char, palindrome, all same chars, special characters, unicode',
      array: '- Empty array, single element, all same, sorted, reverse sorted, contains negatives',
      hash_map: '- Empty input, single entry, collisions, duplicate keys, large input',
      stack_queue: '- Empty structure, single element, overflow scenario',
      recursion: '- Base case, small inputs, deep recursion potential',
    };
    return hints[problemType] || '- Empty input, single element, typical input, large input';
  }

  /**
   * Evaluate a text-based submission (DESIGN, WRITTEN, or the explanation part of MIXED)
   * Uses LLM to score against reference solution on 5 criteria
   */
  async evaluateTextSubmission(params: {
    challengeTitle: string;
    challengeDescription: string;
    candidateAnswer: string;
    referenceSolution: string;
    challengeType: string;
  }): Promise<{
    overallScore: number;
    criteriaScores: Record<string, { score: number; maxScore: number; feedback: string }>;
    feedback: string;
    suggestions: string[];
  }> {
    if (!this.apiKey) {
      return this.getMockTextEvaluation();
    }

    const typeLabel =
      params.challengeType === 'DESIGN'
        ? 'system design'
        : params.challengeType === 'WRITTEN'
          ? 'written/conceptual'
          : 'mixed (explanation portion)';

    const systemPrompt = `You are an expert technical evaluator scoring a ${typeLabel} answer.

RESPONSE FORMAT (JSON only, no markdown):
{
  "completeness": { "score": 0-20, "feedback": "..." },
  "technicalAccuracy": { "score": 0-20, "feedback": "..." },
  "depthOfAnalysis": { "score": 0-20, "feedback": "..." },
  "practicality": { "score": 0-20, "feedback": "..." },
  "communication": { "score": 0-20, "feedback": "..." },
  "overallFeedback": "2-3 sentence overall assessment",
  "suggestions": ["improvement 1", "improvement 2", "improvement 3"]
}

SCORING GUIDE:
- completeness: Did they cover all aspects of the problem? Missing key components?
- technicalAccuracy: Are the technical facts, tradeoffs, and claims correct?
- depthOfAnalysis: Surface-level vs deep understanding? Did they consider edge cases, failure modes, scalability?
- practicality: Could this actually work in production? Is it realistic and implementable?
- communication: Is the answer clear, well-structured, and easy to follow?

Each criterion is scored 0-20. Total max = 100.
Be fair but rigorous. A perfect score should be rare.
Output ONLY valid JSON.`;

    const userPrompt = `CHALLENGE: ${params.challengeTitle}
DESCRIPTION: ${params.challengeDescription}

REFERENCE SOLUTION (ideal answer):
${params.referenceSolution.slice(0, 3000)}

CANDIDATE'S ANSWER:
${params.candidateAnswer.slice(0, 4000)}

Evaluate the candidate's answer against the reference solution.`;

    try {
      const response = await this.callLLM(systemPrompt, userPrompt);
      const parsed = JSON.parse(
        response
          .replace(/```json?\n?/g, '')
          .replace(/```/g, '')
          .trim()
      );

      const criteria = [
        'completeness',
        'technicalAccuracy',
        'depthOfAnalysis',
        'practicality',
        'communication',
      ];
      const criteriaScores: Record<string, { score: number; maxScore: number; feedback: string }> =
        {};
      let totalScore = 0;

      for (const key of criteria) {
        const c = parsed[key] || { score: 10, feedback: 'No evaluation available' };
        const score = Math.min(20, Math.max(0, Math.round(c.score)));
        criteriaScores[key] = { score, maxScore: 20, feedback: c.feedback || '' };
        totalScore += score;
      }

      return {
        overallScore: totalScore,
        criteriaScores,
        feedback: parsed.overallFeedback || 'Evaluation complete.',
        suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
      };
    } catch (error) {
      this.logger.error(`Text evaluation failed: ${error}`);
      return this.getMockTextEvaluation();
    }
  }

  private getMockTextEvaluation(): {
    overallScore: number;
    criteriaScores: Record<string, { score: number; maxScore: number; feedback: string }>;
    feedback: string;
    suggestions: string[];
  } {
    return {
      overallScore: 50,
      criteriaScores: {
        completeness: {
          score: 10,
          maxScore: 20,
          feedback: 'Evaluation unavailable — default score applied.',
        },
        technicalAccuracy: {
          score: 10,
          maxScore: 20,
          feedback: 'Evaluation unavailable — default score applied.',
        },
        depthOfAnalysis: {
          score: 10,
          maxScore: 20,
          feedback: 'Evaluation unavailable — default score applied.',
        },
        practicality: {
          score: 10,
          maxScore: 20,
          feedback: 'Evaluation unavailable — default score applied.',
        },
        communication: {
          score: 10,
          maxScore: 20,
          feedback: 'Evaluation unavailable — default score applied.',
        },
      },
      feedback: 'AI evaluation was unavailable. A default score has been applied.',
      suggestions: ['Please retry submission when AI evaluation is available.'],
    };
  }

  private getMockFeedback(accuracy: number): GeneratedFeedback {
    if (accuracy >= 90) {
      return {
        feedback:
          'Excellent solution! Your code passes the vast majority of test cases and demonstrates strong problem-solving skills.',
        suggestions: [
          'Consider adding inline comments for complex logic',
          'Minor edge cases could be handled more explicitly',
        ],
        codeQualityScore: 85,
        codeQualityNotes: 'Clean, readable code with good structure.',
      };
    } else if (accuracy >= 70) {
      return {
        feedback:
          'Good solution that handles most cases correctly. Some edge cases need attention.',
        suggestions: [
          'Review failing test cases for edge case handling',
          'Consider input validation',
          'Test with boundary values',
        ],
        codeQualityScore: 70,
        codeQualityNotes: 'Decent code quality. Could benefit from better error handling.',
      };
    } else {
      return {
        feedback:
          'The solution needs improvement. Several test cases are failing, suggesting issues with the core logic.',
        suggestions: [
          'Review the algorithm logic carefully',
          'Handle edge cases (empty inputs, boundary values)',
          'Add error handling',
          'Test your solution step by step with small inputs',
        ],
        codeQualityScore: 50,
        codeQualityNotes: 'Focus on getting correctness first, then improve code quality.',
      };
    }
  }
}
