import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface EvaluationCriteria {
  name: string;
  weight: number;
  description: string;
  maxScore: number;
}

export interface EvaluationResult {
  overallScore: number;
  criteriaScores: Record<string, { score: number; maxScore: number; feedback: string }>;
  feedback: string;
  suggestions: string[];
  confidence: number;
  staticAnalysis?: StaticAnalysisResult;
  testResults?: TestResult[];
}

export interface StaticAnalysisResult {
  complexity: number;
  linesOfCode: number;
  issues: Array<{
    type: 'error' | 'warning' | 'info';
    message: string;
    line?: number;
  }>;
}

export interface TestResult {
  name: string;
  passed: boolean;
  message?: string;
  executionTimeMs?: number;
}

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OpenAIResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

@Injectable()
export class AiEvaluationService {
  private readonly logger = new Logger(AiEvaluationService.name);
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;

  constructor(private configService: ConfigService) {
    this.apiKey = this.configService.get<string>('openai.apiKey') || '';
    this.model = this.configService.get<string>('openai.model') || 'gpt-4o';
    this.baseUrl = this.configService.get<string>('openai.baseUrl') || 'https://api.openai.com/v1';
  }

  /**
   * Evaluate a code submission using AI
   */
  async evaluateCode(params: {
    code: string;
    language: string;
    challengeTitle: string;
    challengeDescription: string;
    requirements: string[];
    evaluationCriteria: EvaluationCriteria[];
    testCases?: Array<{ input: string; expectedOutput: string }>;
  }): Promise<EvaluationResult> {
    const startTime = Date.now();

    // Perform static analysis first
    const staticAnalysis = this.performStaticAnalysis(params.code, params.language);

    // Run test cases if provided
    const testResults = params.testCases
      ? await this.runTestCases(params.code, params.language, params.testCases)
      : undefined;

    // Generate AI evaluation
    const aiEvaluation = await this.getAiEvaluation(params);

    const processingTime = Date.now() - startTime;
    this.logger.log(`Evaluation completed in ${processingTime}ms`);

    return {
      ...aiEvaluation,
      staticAnalysis,
      testResults,
    };
  }

  /**
   * Evaluate a written/essay response using AI
   */
  async evaluateWrittenResponse(params: {
    response: string;
    challengeTitle: string;
    challengeDescription: string;
    requirements: string[];
    evaluationCriteria: EvaluationCriteria[];
  }): Promise<EvaluationResult> {
    const systemPrompt = this.buildWrittenEvaluationPrompt(params.evaluationCriteria);
    const userPrompt = this.buildWrittenUserPrompt(params);

    return this.callOpenAI(systemPrompt, userPrompt, params.evaluationCriteria);
  }

  /**
   * Get default evaluation criteria based on challenge type
   */
  getDefaultCriteria(
    challengeType: 'CODING' | 'WRITTEN' | 'MULTIPLE_CHOICE' | 'SYSTEM_DESIGN'
  ): EvaluationCriteria[] {
    switch (challengeType) {
      case 'CODING':
        return [
          {
            name: 'correctness',
            weight: 0.35,
            description: 'Code produces correct output for all test cases',
            maxScore: 100,
          },
          {
            name: 'code_quality',
            weight: 0.25,
            description: 'Clean, readable, well-organized code',
            maxScore: 100,
          },
          {
            name: 'efficiency',
            weight: 0.2,
            description: 'Optimal time and space complexity',
            maxScore: 100,
          },
          {
            name: 'best_practices',
            weight: 0.15,
            description: 'Follows language conventions and best practices',
            maxScore: 100,
          },
          {
            name: 'error_handling',
            weight: 0.05,
            description: 'Handles edge cases and errors gracefully',
            maxScore: 100,
          },
        ];

      case 'WRITTEN':
        return [
          {
            name: 'understanding',
            weight: 0.3,
            description: 'Demonstrates deep understanding of the topic',
            maxScore: 100,
          },
          {
            name: 'completeness',
            weight: 0.25,
            description: 'Addresses all requirements and aspects',
            maxScore: 100,
          },
          {
            name: 'clarity',
            weight: 0.2,
            description: 'Clear, well-structured explanation',
            maxScore: 100,
          },
          {
            name: 'accuracy',
            weight: 0.15,
            description: 'Technically accurate information',
            maxScore: 100,
          },
          {
            name: 'examples',
            weight: 0.1,
            description: 'Uses relevant examples to illustrate points',
            maxScore: 100,
          },
        ];

      case 'SYSTEM_DESIGN':
        return [
          {
            name: 'architecture',
            weight: 0.3,
            description: 'Sound architectural decisions and patterns',
            maxScore: 100,
          },
          {
            name: 'scalability',
            weight: 0.25,
            description: 'Design scales to handle growth',
            maxScore: 100,
          },
          {
            name: 'reliability',
            weight: 0.2,
            description: 'Handles failures gracefully',
            maxScore: 100,
          },
          {
            name: 'trade_offs',
            weight: 0.15,
            description: 'Identifies and explains trade-offs',
            maxScore: 100,
          },
          {
            name: 'communication',
            weight: 0.1,
            description: 'Clearly communicates the design',
            maxScore: 100,
          },
        ];

      case 'MULTIPLE_CHOICE':
        return [
          {
            name: 'correctness',
            weight: 1.0,
            description: 'Correct answers selected',
            maxScore: 100,
          },
        ];

      default:
        return [
          {
            name: 'overall',
            weight: 1.0,
            description: 'Overall quality of submission',
            maxScore: 100,
          },
        ];
    }
  }

  private async getAiEvaluation(params: {
    code: string;
    language: string;
    challengeTitle: string;
    challengeDescription: string;
    requirements: string[];
    evaluationCriteria: EvaluationCriteria[];
  }): Promise<Omit<EvaluationResult, 'staticAnalysis' | 'testResults'>> {
    const systemPrompt = this.buildCodeEvaluationPrompt(params.evaluationCriteria);
    const userPrompt = this.buildCodeUserPrompt(params);

    return this.callOpenAI(systemPrompt, userPrompt, params.evaluationCriteria);
  }

  private async callOpenAI(
    systemPrompt: string,
    userPrompt: string,
    criteria: EvaluationCriteria[]
  ): Promise<Omit<EvaluationResult, 'staticAnalysis' | 'testResults'>> {
    // If no API key, return mock evaluation for development
    if (!this.apiKey) {
      this.logger.warn('No OpenAI API key configured, returning mock evaluation');
      return this.getMockEvaluation(criteria);
    }

    try {
      const messages: OpenAIMessage[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ];

      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages,
          temperature: 0.3,
          response_format: { type: 'json_object' },
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        this.logger.error(`OpenAI API error: ${error}`);
        throw new Error(`OpenAI API error: ${response.status}`);
      }

      const data: OpenAIResponse = await response.json();
      const content = data.choices[0]?.message?.content;

      if (!content) {
        throw new Error('Empty response from OpenAI');
      }

      const parsed = JSON.parse(content);
      return this.parseEvaluationResponse(parsed, criteria);
    } catch (error) {
      this.logger.error(`AI evaluation failed: ${error}`);
      // Return mock evaluation on error
      return this.getMockEvaluation(criteria);
    }
  }

  private buildCodeEvaluationPrompt(criteria: EvaluationCriteria[]): string {
    const criteriaList = criteria
      .map(c => `- ${c.name} (${c.weight * 100}% weight): ${c.description}`)
      .join('\n');

    return `You are an expert code reviewer and evaluator. Your task is to evaluate code submissions based on specific criteria.

EVALUATION CRITERIA:
${criteriaList}

RESPONSE FORMAT:
Return a JSON object with this exact structure:
{
  "overallScore": <number 0-100>,
  "criteriaScores": {
    "<criterion_name>": {
      "score": <number 0-100>,
      "feedback": "<specific feedback for this criterion>"
    }
  },
  "feedback": "<overall feedback paragraph>",
  "suggestions": ["<improvement suggestion 1>", "<improvement suggestion 2>", ...],
  "confidence": <number 0-1 indicating confidence in evaluation>
}

GUIDELINES:
- Be fair and objective in your assessment
- Provide constructive, actionable feedback
- Consider the difficulty level of the challenge
- Score based on the quality relative to professional standards
- A score of 70+ indicates passing quality
- A score of 85+ indicates excellent quality
- A score of 95+ indicates exceptional/professional quality`;
  }

  private buildCodeUserPrompt(params: {
    code: string;
    language: string;
    challengeTitle: string;
    challengeDescription: string;
    requirements: string[];
  }): string {
    const requirements = params.requirements.map((r, i) => `${i + 1}. ${r}`).join('\n');

    return `CHALLENGE: ${params.challengeTitle}

DESCRIPTION:
${params.challengeDescription}

REQUIREMENTS:
${requirements}

LANGUAGE: ${params.language}

SUBMITTED CODE:
\`\`\`${params.language}
${params.code}
\`\`\`

Please evaluate this code submission based on the criteria provided.`;
  }

  private buildWrittenEvaluationPrompt(criteria: EvaluationCriteria[]): string {
    const criteriaList = criteria
      .map(c => `- ${c.name} (${c.weight * 100}% weight): ${c.description}`)
      .join('\n');

    return `You are an expert evaluator for technical written responses. Your task is to evaluate written submissions based on specific criteria.

EVALUATION CRITERIA:
${criteriaList}

RESPONSE FORMAT:
Return a JSON object with this exact structure:
{
  "overallScore": <number 0-100>,
  "criteriaScores": {
    "<criterion_name>": {
      "score": <number 0-100>,
      "feedback": "<specific feedback for this criterion>"
    }
  },
  "feedback": "<overall feedback paragraph>",
  "suggestions": ["<improvement suggestion 1>", "<improvement suggestion 2>", ...],
  "confidence": <number 0-1 indicating confidence in evaluation>
}

GUIDELINES:
- Be fair and objective in your assessment
- Provide constructive, actionable feedback
- Evaluate technical accuracy carefully
- Score based on depth of understanding demonstrated
- A score of 70+ indicates passing quality
- A score of 85+ indicates excellent quality`;
  }

  private buildWrittenUserPrompt(params: {
    response: string;
    challengeTitle: string;
    challengeDescription: string;
    requirements: string[];
  }): string {
    const requirements = params.requirements.map((r, i) => `${i + 1}. ${r}`).join('\n');

    return `CHALLENGE: ${params.challengeTitle}

DESCRIPTION:
${params.challengeDescription}

REQUIREMENTS:
${requirements}

SUBMITTED RESPONSE:
${params.response}

Please evaluate this written submission based on the criteria provided.`;
  }

  private parseEvaluationResponse(
    response: any,
    criteria: EvaluationCriteria[]
  ): Omit<EvaluationResult, 'staticAnalysis' | 'testResults'> {
    // Ensure all criteria have scores
    const criteriaScores: Record<string, { score: number; maxScore: number; feedback: string }> =
      {};

    for (const c of criteria) {
      const responseScore = response.criteriaScores?.[c.name];
      criteriaScores[c.name] = {
        score: responseScore?.score ?? 0,
        maxScore: c.maxScore,
        feedback: responseScore?.feedback ?? 'No feedback provided',
      };
    }

    // Calculate weighted overall score if not provided
    let overallScore = response.overallScore;
    if (overallScore === undefined) {
      overallScore = criteria.reduce((sum, c) => {
        const score = criteriaScores[c.name]?.score ?? 0;
        return sum + score * c.weight;
      }, 0);
    }

    return {
      overallScore: Math.round(overallScore * 100) / 100,
      criteriaScores,
      feedback: response.feedback || 'Evaluation complete.',
      suggestions: response.suggestions || [],
      confidence: response.confidence ?? 0.8,
    };
  }

  private getMockEvaluation(
    criteria: EvaluationCriteria[]
  ): Omit<EvaluationResult, 'staticAnalysis' | 'testResults'> {
    const criteriaScores: Record<string, { score: number; maxScore: number; feedback: string }> =
      {};

    // Generate random but realistic scores
    for (const c of criteria) {
      const baseScore = 65 + Math.random() * 30; // 65-95 range
      criteriaScores[c.name] = {
        score: Math.round(baseScore),
        maxScore: c.maxScore,
        feedback: `[Mock] Good demonstration of ${c.name.replace(/_/g, ' ')}.`,
      };
    }

    const overallScore = criteria.reduce((sum, c) => {
      return sum + criteriaScores[c.name].score * c.weight;
    }, 0);

    return {
      overallScore: Math.round(overallScore * 100) / 100,
      criteriaScores,
      feedback:
        '[Mock Evaluation] This is a mock evaluation. Configure OPENAI_API_KEY for real AI evaluation.',
      suggestions: [
        'Consider adding more comprehensive error handling',
        'Code documentation could be improved',
        'Test coverage could be expanded',
      ],
      confidence: 0.5,
    };
  }

  private performStaticAnalysis(code: string, language: string): StaticAnalysisResult {
    const lines = code.split('\n');
    const issues: StaticAnalysisResult['issues'] = [];

    // Basic static analysis checks
    let complexity = 1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Count complexity indicators
      const complexityKeywords = [
        'if',
        'else',
        'for',
        'while',
        'switch',
        'case',
        'catch',
        '&&',
        '||',
        '?',
      ];
      for (const keyword of complexityKeywords) {
        if (line.includes(keyword)) {
          complexity++;
        }
      }

      // Check for common issues
      if (line.includes('console.log') && language === 'typescript') {
        issues.push({
          type: 'warning',
          message: 'Debug console.log statement found',
          line: i + 1,
        });
      }

      if (line.includes('TODO') || line.includes('FIXME')) {
        issues.push({
          type: 'info',
          message: 'Unresolved TODO/FIXME comment',
          line: i + 1,
        });
      }

      if (line.length > 120) {
        issues.push({
          type: 'warning',
          message: 'Line exceeds 120 characters',
          line: i + 1,
        });
      }
    }

    return {
      complexity,
      linesOfCode: lines.filter(l => l.trim().length > 0).length,
      issues,
    };
  }

  private async runTestCases(
    code: string,
    language: string,
    testCases: Array<{ input: string; expectedOutput: string }>
  ): Promise<TestResult[]> {
    // In a production environment, this would run code in a sandboxed environment
    // For now, return mock test results
    this.logger.log(`Would run ${testCases.length} test cases for ${language} code`);

    return testCases.map((tc, index) => ({
      name: `Test Case ${index + 1}`,
      passed: Math.random() > 0.2, // 80% pass rate for mock
      message: 'Mock test execution',
      executionTimeMs: Math.round(Math.random() * 100),
    }));
  }
}
