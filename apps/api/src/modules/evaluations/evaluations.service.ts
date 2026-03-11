import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { prisma } from '@verihire/database';
import { CertificateService, GeneratedCertificate } from './certificate.service';
import { TestCaseGeneratorService, GeneratedTestCase } from './test-case-generator.service';
import { CodeExecutionService, TestCaseResults } from '../code-execution/code-execution.service';

export interface EvaluationWithCertificate {
  evaluation: {
    id: string;
    overallScore: number;
    criteriaScores: Record<string, { score: number; maxScore: number; feedback: string }>;
    feedback: string;
    suggestions: string[];
    confidence: number;
    processingTimeMs: number;
  };
  certificate: GeneratedCertificate | null;
  passed: boolean;
}

@Injectable()
export class EvaluationsService {
  private readonly logger = new Logger(EvaluationsService.name);

  constructor(
    private certificateService: CertificateService,
    private testCaseGenerator: TestCaseGeneratorService,
    private codeExecutionService: CodeExecutionService
  ) {}

  /**
   * Evaluate a submission — main entry point
   * Flow: generate test cases → execute code → score → LLM feedback → save
   */
  async evaluateSubmission(submissionId: string): Promise<EvaluationWithCertificate> {
    const startTime = Date.now();

    // 1. Fetch submission with challenge details
    const submission = await prisma.submission.findUnique({
      where: { id: submissionId },
      include: {
        challenge: {
          include: {
            skill: true,
          },
        },
        candidate: true,
      },
    });

    if (!submission) {
      throw new NotFoundException('Submission not found');
    }

    if (submission.status !== 'SUBMITTED') {
      throw new BadRequestException(`Cannot evaluate submission with status: ${submission.status}`);
    }

    // 2. Mark as evaluating
    await prisma.submission.update({
      where: { id: submissionId },
      data: { status: 'EVALUATING' },
    });

    try {
      const code = submission.content || '';
      const language = submission.language || 'javascript';

      // 3. Gather manual test cases from the challenge
      const manualTestCases = this.parseManualTestCases(submission.challenge.testCases);

      // 4. Parse requirements
      const requirements = this.parseRequirements(submission.challenge.requirements);

      // 5. Generate additional test cases via LLM
      //    LLM generates inputs + expected outputs, but expected outputs may be wrong.
      //    If a reference solution exists, we validate by running it through Judge0.
      let generatedTestCases: GeneratedTestCase[] = [];
      try {
        generatedTestCases = await this.testCaseGenerator.generateTestCases({
          challengeTitle: submission.challenge.title,
          challengeDescription: submission.challenge.description,
          requirements,
          language,
          numTestCases: 10,
        });
        this.logger.log(`Generated ${generatedTestCases.length} test cases via LLM`);
      } catch (error) {
        this.logger.warn(`LLM test case generation failed: ${error}, using manual test cases only`);
      }

      // 6. Validate LLM-generated test cases using reference solution
      //    Run the reference solution against LLM-generated inputs → use its output
      //    as the ground-truth expected output (replaces potentially hallucinated outputs)
      const referenceSolution = (submission.challenge as any).referenceSolution as string | null;
      const solutionLanguage = (submission.challenge as any).solutionLanguage as string | null;

      if (referenceSolution && generatedTestCases.length > 0) {
        this.logger.log('Validating LLM test cases against reference solution...');
        const refLang = solutionLanguage || language;

        const refResults = await this.codeExecutionService.runTestCases({
          code: referenceSolution,
          language: refLang,
          testCases: generatedTestCases.map(tc => ({
            input: tc.input,
            expectedOutput: tc.expectedOutput,
            name: tc.description,
          })),
        });

        // Replace LLM expected outputs with reference solution's actual outputs
        // Only keep test cases where the reference solution produced output
        const validatedTestCases: GeneratedTestCase[] = [];
        for (let i = 0; i < generatedTestCases.length; i++) {
          const refResult = refResults.results[i];
          if (refResult && refResult.actualOutput != null && !refResult.error) {
            validatedTestCases.push({
              ...generatedTestCases[i],
              expectedOutput: refResult.actualOutput, // ground-truth from reference
            });
          } else {
            this.logger.warn(
              `Dropping test case "${generatedTestCases[i].description}" — reference solution failed or produced no output`
            );
          }
        }

        this.logger.log(
          `Validated ${validatedTestCases.length}/${generatedTestCases.length} test cases against reference solution`
        );
        generatedTestCases = validatedTestCases;
      } else if (!referenceSolution && generatedTestCases.length > 0) {
        this.logger.warn(
          'No reference solution available — using LLM-generated expected outputs (may contain errors)'
        );
      }

      // 7. Combine manual + validated generated test cases
      const allTestCases = [
        ...manualTestCases.map(tc => ({
          input: tc.input,
          expectedOutput: tc.expectedOutput,
          name: `Manual: ${tc.name || 'test'}`,
        })),
        ...generatedTestCases.map(tc => ({
          input: tc.input,
          expectedOutput: tc.expectedOutput,
          name: `AI-${tc.category}: ${tc.description}`,
        })),
      ];

      // 8. Execute candidate's code against all test cases via Judge0
      let executionResults: TestCaseResults;
      if (allTestCases.length > 0) {
        executionResults = await this.codeExecutionService.runTestCases({
          code,
          language,
          testCases: allTestCases,
        });
        this.logger.log(
          `Execution complete: ${executionResults.passed}/${executionResults.totalTests} passed (${executionResults.accuracy}%)`
        );
      } else {
        executionResults = {
          totalTests: 0,
          passed: 0,
          failed: 0,
          accuracy: 0,
          results: [],
          totalExecutionTimeMs: 0,
        };
        this.logger.warn('No test cases available, scoring on code quality only');
      }

      // 8. Generate feedback via LLM
      let feedback = 'Evaluation complete.';
      let suggestions: string[] = [];
      let codeQualityNotes = '';

      try {
        const feedbackResult = await this.testCaseGenerator.generateFeedback({
          challengeTitle: submission.challenge.title,
          challengeDescription: submission.challenge.description,
          code,
          language,
          testResults: executionResults.results.map(r => ({
            name: r.name,
            passed: r.passed,
            input: r.input,
            expectedOutput: r.expectedOutput,
            actualOutput: r.actualOutput,
            error: r.error,
          })),
          accuracy: executionResults.accuracy,
        });
        feedback = feedbackResult.feedback;
        suggestions = feedbackResult.suggestions;
        codeQualityNotes = feedbackResult.codeQualityNotes;
      } catch (error) {
        this.logger.warn(`Feedback generation failed: ${error}`);
      }

      // 9. Calculate final score
      // 60% accuracy (test cases) + 40% code quality (LLM estimate)
      const accuracyScore = executionResults.accuracy; // 0-100
      const codeQualityScore = this.estimateCodeQualityScore(code, language, executionResults);

      let overallScore: number;
      if (allTestCases.length > 0) {
        overallScore = Math.round(accuracyScore * 0.6 + codeQualityScore * 0.4);
      } else {
        // No test cases — 100% code quality
        overallScore = codeQualityScore;
      }

      // Build criteria scores
      const criteriaScores: Record<string, { score: number; maxScore: number; feedback: string }> =
        {
          correctness: {
            score: Math.round(accuracyScore),
            maxScore: 100,
            feedback: `${executionResults.passed}/${executionResults.totalTests} test cases passed (${executionResults.accuracy}%)`,
          },
          code_quality: {
            score: codeQualityScore,
            maxScore: 100,
            feedback: codeQualityNotes || 'Code quality analysis based on structure and patterns.',
          },
        };

      const processingTimeMs = Date.now() - startTime;
      const confidence = allTestCases.length > 0 ? 0.85 : 0.5;

      // 10. Save evaluation to DB
      const evaluation = await prisma.evaluation.create({
        data: {
          submissionId,
          overallScore,
          criteriaScores: criteriaScores as any,
          testResults: {
            totalTests: executionResults.totalTests,
            passed: executionResults.passed,
            failed: executionResults.failed,
            accuracy: executionResults.accuracy,
            results: executionResults.results,
          } as any,
          feedback,
          suggestions,
          confidence,
          processingTimeMs,
          modelVersions: {
            llmModel: 'llama-3.3-70b-versatile',
            executionEngine: 'judge0-ce',
            evaluationVersion: '2.0.0',
          },
        },
      });

      // 11. Update submission status and score
      await prisma.submission.update({
        where: { id: submissionId },
        data: {
          status: 'EVALUATED',
          aiScore: overallScore,
        },
      });

      // 12. Update challenge stats
      await this.updateChallengeStats(submission.challengeId, overallScore);

      // 13. Generate certificate if passing
      const passed = this.certificateService.isPassing(overallScore);
      let certificate: GeneratedCertificate | null = null;

      if (passed && submission.challenge.skillId) {
        certificate = await this.certificateService.generateCertificate({
          candidateId: submission.candidateId,
          skillId: submission.challenge.skillId,
          challengeId: submission.challengeId,
          submissionId: submission.id,
          finalScore: overallScore,
          aiScore: overallScore,
          criteriaScores,
          confidence,
        });
      }

      this.logger.log(
        `Evaluation complete for ${submissionId}: score=${overallScore}, accuracy=${executionResults.accuracy}%, passed=${passed}`
      );

      return {
        evaluation: {
          id: evaluation.id,
          overallScore,
          criteriaScores,
          feedback,
          suggestions,
          confidence,
          processingTimeMs,
        },
        certificate,
        passed,
      };
    } catch (error) {
      // Revert status on failure
      this.logger.error(`Evaluation failed for ${submissionId}: ${error}`);
      await prisma.submission.update({
        where: { id: submissionId },
        data: { status: 'SUBMITTED' },
      });
      throw error;
    }
  }

  /**
   * Get evaluation for a submission
   */
  async getEvaluation(submissionId: string) {
    const evaluation = await prisma.evaluation.findFirst({
      where: { submissionId },
      orderBy: { createdAt: 'desc' },
    });

    if (!evaluation) {
      throw new NotFoundException('Evaluation not found for this submission');
    }

    return {
      id: evaluation.id,
      overallScore: Number(evaluation.overallScore),
      criteriaScores: evaluation.criteriaScores,
      staticAnalysis: evaluation.staticAnalysis,
      testResults: evaluation.testResults,
      feedback: evaluation.feedback,
      suggestions: evaluation.suggestions,
      confidence: evaluation.confidence ? Number(evaluation.confidence) : null,
      processingTimeMs: evaluation.processingTimeMs,
      createdAt: evaluation.createdAt,
    };
  }

  /**
   * Get all evaluations for admin/analytics
   */
  async getEvaluations(options?: {
    limit?: number;
    offset?: number;
    minScore?: number;
    maxScore?: number;
  }) {
    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;

    const where: any = {};
    if (options?.minScore !== undefined) {
      where.overallScore = { ...where.overallScore, gte: options.minScore };
    }
    if (options?.maxScore !== undefined) {
      where.overallScore = { ...where.overallScore, lte: options.maxScore };
    }

    const [evaluations, total] = await Promise.all([
      prisma.evaluation.findMany({
        where,
        include: {
          submission: {
            include: {
              challenge: {
                select: { id: true, title: true, difficulty: true },
              },
              candidate: {
                select: {
                  id: true,
                  user: {
                    select: { firstName: true, lastName: true, email: true },
                  },
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.evaluation.count({ where }),
    ]);

    return {
      data: evaluations.map(e => ({
        id: e.id,
        overallScore: Number(e.overallScore),
        confidence: e.confidence ? Number(e.confidence) : null,
        processingTimeMs: e.processingTimeMs,
        createdAt: e.createdAt,
        submission: {
          id: e.submission.id,
          challenge: e.submission.challenge,
          candidate: {
            id: e.submission.candidate.id,
            name: `${e.submission.candidate.user.firstName} ${e.submission.candidate.user.lastName}`,
          },
        },
      })),
      meta: { total, limit, offset, hasMore: offset + evaluations.length < total },
    };
  }

  /**
   * Get evaluation statistics
   */
  async getEvaluationStats() {
    const [totalEvaluations, passedEvaluations, avgScore, avgProcessingTime] = await Promise.all([
      prisma.evaluation.count(),
      prisma.evaluation.count({ where: { overallScore: { gte: 70 } } }),
      prisma.evaluation.aggregate({ _avg: { overallScore: true } }),
      prisma.evaluation.aggregate({ _avg: { processingTimeMs: true } }),
    ]);

    const passRate = totalEvaluations > 0 ? (passedEvaluations / totalEvaluations) * 100 : 0;
    const scoreDistribution = await this.getScoreDistribution();

    return {
      totalEvaluations,
      passedEvaluations,
      failedEvaluations: totalEvaluations - passedEvaluations,
      passRate: Math.round(passRate * 100) / 100,
      averageScore: avgScore._avg.overallScore
        ? Math.round(Number(avgScore._avg.overallScore) * 100) / 100
        : 0,
      averageProcessingTimeMs: avgProcessingTime._avg.processingTimeMs
        ? Math.round(Number(avgProcessingTime._avg.processingTimeMs))
        : 0,
      scoreDistribution,
    };
  }

  /**
   * Re-evaluate a submission (admin function)
   */
  async reEvaluate(submissionId: string): Promise<EvaluationWithCertificate> {
    const submission = await prisma.submission.findUnique({
      where: { id: submissionId },
    });

    if (!submission) {
      throw new NotFoundException('Submission not found');
    }

    await prisma.submission.update({
      where: { id: submissionId },
      data: { status: 'SUBMITTED' },
    });

    return this.evaluateSubmission(submissionId);
  }

  /**
   * Process pending submissions (batch job)
   */
  async processPendingSubmissions(limit = 10): Promise<number> {
    const pending = await prisma.submission.findMany({
      where: { status: 'SUBMITTED' },
      orderBy: { submittedAt: 'asc' },
      take: limit,
      select: { id: true },
    });

    let processed = 0;
    for (const submission of pending) {
      try {
        await this.evaluateSubmission(submission.id);
        processed++;
      } catch (error) {
        this.logger.error(`Failed to evaluate submission ${submission.id}: ${error}`);
      }
    }

    this.logger.log(`Processed ${processed}/${pending.length} pending submissions`);
    return processed;
  }

  // --- Private helpers ---

  private parseManualTestCases(
    testCases: any
  ): Array<{ input: string; expectedOutput: string; name?: string }> {
    if (!testCases) return [];

    try {
      const parsed = typeof testCases === 'string' ? JSON.parse(testCases) : testCases;
      if (!Array.isArray(parsed)) return [];

      return parsed
        .filter((tc: any) => tc.input !== undefined && (tc.expectedOutput || tc.expected_output))
        .map((tc: any) => ({
          input: String(tc.input),
          expectedOutput: String(tc.expectedOutput || tc.expected_output),
          name: tc.name || tc.description,
        }));
    } catch {
      return [];
    }
  }

  private parseRequirements(requirements: any): string[] {
    if (!requirements) return [];
    if (Array.isArray(requirements)) return requirements.map(String);
    if (typeof requirements === 'string') {
      try {
        const parsed = JSON.parse(requirements);
        return Array.isArray(parsed) ? parsed.map(String) : [];
      } catch {
        return [requirements];
      }
    }
    if (typeof requirements === 'object') return Object.values(requirements).map(String);
    return [];
  }

  private estimateCodeQualityScore(
    code: string,
    language: string,
    executionResults: TestCaseResults
  ): number {
    let score = 70; // Base score

    const lines = code.split('\n');
    const nonEmptyLines = lines.filter(l => l.trim().length > 0);

    // Penalize very short solutions (likely incomplete)
    if (nonEmptyLines.length < 3) score -= 20;

    // Bonus for reasonable length
    if (nonEmptyLines.length >= 5 && nonEmptyLines.length <= 100) score += 5;

    // Penalize very long lines
    const longLines = lines.filter(l => l.length > 120);
    if (longLines.length > 3) score -= 5;

    // Check for basic code quality indicators
    if (code.includes('console.log') && language !== 'javascript') score -= 3;
    if (code.includes('TODO') || code.includes('FIXME')) score -= 5;
    if (code.includes('try') || code.includes('catch') || code.includes('except')) score += 5;

    // Bonus if all tests pass
    if (executionResults.totalTests > 0 && executionResults.accuracy === 100) score += 10;

    // Bonus for handling edge cases (if many tests pass)
    if (executionResults.accuracy >= 80) score += 5;

    return Math.max(0, Math.min(100, score));
  }

  private async updateChallengeStats(challengeId: string, score: number) {
    const challenge = await prisma.challenge.findUnique({
      where: { id: challengeId },
      select: { averageScore: true, timesAttempted: true },
    });

    if (!challenge) return;

    const currentAvg = challenge.averageScore ? Number(challenge.averageScore) : 0;
    const attempts = challenge.timesAttempted || 1;
    const newAvg = (currentAvg * (attempts - 1) + score) / attempts;

    await prisma.challenge.update({
      where: { id: challengeId },
      data: { averageScore: newAvg },
    });
  }

  private async getScoreDistribution() {
    const ranges = [
      { label: '90-100', min: 90, max: 100 },
      { label: '80-89', min: 80, max: 89 },
      { label: '70-79', min: 70, max: 79 },
      { label: '60-69', min: 60, max: 69 },
      { label: '50-59', min: 50, max: 59 },
      { label: '0-49', min: 0, max: 49 },
    ];

    return Promise.all(
      ranges.map(async range => {
        const count = await prisma.evaluation.count({
          where: { overallScore: { gte: range.min, lte: range.max } },
        });
        return { range: range.label, count };
      })
    );
  }
}
