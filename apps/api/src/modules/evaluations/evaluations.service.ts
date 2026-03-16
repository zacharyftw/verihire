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

    // 2. Atomic status claim — prevents two concurrent requests from both evaluating the same submission.
    //    updateMany with the status condition returns count=0 if another process already claimed it.
    const claimed = await prisma.submission.updateMany({
      where: { id: submissionId, status: 'SUBMITTED' },
      data: { status: 'EVALUATING' },
    });

    if (claimed.count === 0) {
      throw new BadRequestException(
        `Submission is already being evaluated or has already been evaluated (status: ${submission.status})`
      );
    }

    try {
      const code = submission.content || '';
      const language = submission.language || 'javascript';
      const challengeType = submission.challenge.type || 'CODING';

      let overallScore: number;
      let criteriaScores: Record<string, { score: number; maxScore: number; feedback: string }>;
      let feedback: string;
      let suggestions: string[] = [];
      let confidence: number;
      let plagiarismResult = {
        flagged: false,
        maxSimilarity: 0,
        similarSubmissionId: null as string | null,
      };
      let testResultsData: any = { totalTests: 0, passed: 0, failed: 0, accuracy: 0, results: [] };

      if (challengeType === 'DESIGN' || challengeType === 'WRITTEN') {
        // ── TEXT-ONLY EVALUATION (no code execution) ──
        this.logger.log(`Evaluating ${challengeType} submission via LLM text evaluation`);

        const textResult = await this.testCaseGenerator.evaluateTextSubmission({
          challengeTitle: submission.challenge.title,
          challengeDescription: submission.challenge.description,
          candidateAnswer: code,
          referenceSolution: submission.challenge.referenceSolution || '',
          challengeType,
        });

        overallScore = textResult.overallScore;
        criteriaScores = textResult.criteriaScores;
        feedback = textResult.feedback;
        suggestions = textResult.suggestions;
        confidence = 0.8;

        // Plagiarism check on text answers too
        plagiarismResult = await this.checkPlagiarism(submissionId, submission.challengeId, code);
      } else if (challengeType === 'MIXED') {
        // ── MIXED EVALUATION (code execution + text evaluation) ──
        this.logger.log('Evaluating MIXED submission: code execution + text evaluation');

        // Split submission: look for explanation markers
        const { codePart, textPart } = this.splitMixedSubmission(code);

        // Evaluate the code part via normal execution pipeline
        const codeEval = await this.evaluateCodePart(submission, codePart, language);

        // Evaluate the text/explanation part via LLM
        const textResult = await this.testCaseGenerator.evaluateTextSubmission({
          challengeTitle: submission.challenge.title,
          challengeDescription: submission.challenge.description,
          candidateAnswer: textPart || 'No explanation provided.',
          referenceSolution: submission.challenge.referenceSolution || '',
          challengeType: 'MIXED',
        });

        // Combine: 60% code execution + 40% text explanation
        overallScore = Math.round(codeEval.score * 0.6 + textResult.overallScore * 0.4);
        criteriaScores = {
          ...codeEval.criteriaScores,
          ...textResult.criteriaScores,
        };
        feedback = `Code evaluation: ${codeEval.feedback}\n\nExplanation evaluation: ${textResult.feedback}`;
        suggestions = [...codeEval.suggestions, ...textResult.suggestions];
        confidence = 0.8;
        testResultsData = codeEval.testResultsData;

        plagiarismResult = await this.checkPlagiarism(
          submissionId,
          submission.challengeId,
          codePart
        );
      } else {
        // ── CODING EVALUATION (existing pipeline) ──

        // 3. Gather manual test cases from the challenge
        const manualTestCases = this.parseManualTestCases(submission.challenge.testCases);

        // 4. Parse requirements
        const requirements = this.parseRequirements(submission.challenge.requirements);

        // 5. Get test cases — use cached ones if available, otherwise generate via LLM
        const cachedRaw = submission.challenge.cachedTestCases;
        const cachedTestCases = Array.isArray(cachedRaw)
          ? (cachedRaw as unknown as GeneratedTestCase[])
          : null;
        let generatedTestCases: GeneratedTestCase[] = [];

        if (cachedTestCases && Array.isArray(cachedTestCases) && cachedTestCases.length > 0) {
          generatedTestCases = cachedTestCases;
          this.logger.log(`Using ${generatedTestCases.length} cached test cases for challenge`);
        } else {
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
            this.logger.warn(
              `LLM test case generation failed: ${error}, using manual test cases only`
            );
          }

          const referenceSolution = submission.challenge.referenceSolution;
          const solutionLanguage = submission.challenge.solutionLanguage;

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

            const validatedTestCases: GeneratedTestCase[] = [];
            for (let i = 0; i < generatedTestCases.length; i++) {
              const refResult = refResults.results[i];
              if (refResult && refResult.actualOutput != null && !refResult.error) {
                validatedTestCases.push({
                  ...generatedTestCases[i],
                  expectedOutput: refResult.actualOutput,
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

          if (generatedTestCases.length > 0) {
            await prisma.challenge.update({
              where: { id: submission.challengeId },
              data: { cachedTestCases: generatedTestCases as any },
            });
            this.logger.log(
              `Cached ${generatedTestCases.length} test cases for challenge ${submission.challengeId}`
            );
          }
        }

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

        const [executionResults, codePlagiarismResult] = await Promise.all([
          allTestCases.length > 0
            ? this.codeExecutionService.runTestCases({ code, language, testCases: allTestCases })
            : Promise.resolve<TestCaseResults>({
                totalTests: 0,
                passed: 0,
                failed: 0,
                accuracy: 0,
                results: [],
                totalExecutionTimeMs: 0,
              }),
          this.checkPlagiarism(submissionId, submission.challengeId, code),
        ]);
        plagiarismResult = codePlagiarismResult;

        if (allTestCases.length > 0) {
          this.logger.log(
            `Execution complete: ${executionResults.passed}/${executionResults.totalTests} passed (${executionResults.accuracy}%)`
          );
        } else {
          this.logger.warn('No test cases available, scoring on code quality only');
        }

        let codeFeedback = 'Evaluation complete.';
        let codeSuggestions: string[] = [];
        let codeQualityScore = 70;
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
          codeFeedback = feedbackResult.feedback;
          codeSuggestions = feedbackResult.suggestions;
          codeQualityScore = feedbackResult.codeQualityScore;
          codeQualityNotes = feedbackResult.codeQualityNotes;
        } catch (error) {
          this.logger.warn(`Feedback generation failed: ${error}`);
        }

        const accuracyScore = executionResults.accuracy;

        if (allTestCases.length > 0) {
          overallScore = Math.round(accuracyScore * 0.6 + codeQualityScore * 0.4);
        } else {
          overallScore = 0;
        }

        criteriaScores = {
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
        feedback = codeFeedback;
        suggestions = codeSuggestions;
        confidence = allTestCases.length > 0 ? 0.85 : 0.5;
        testResultsData = {
          totalTests: executionResults.totalTests,
          passed: executionResults.passed,
          failed: executionResults.failed,
          accuracy: executionResults.accuracy,
          results: executionResults.results,
        };
      } // end CODING branch

      const processingTimeMs = Date.now() - startTime;

      // 10. Save evaluation to DB
      const evaluation = await prisma.evaluation.create({
        data: {
          submissionId,
          overallScore,
          criteriaScores: criteriaScores as any,
          staticAnalysis: {
            plagiarism: {
              flagged: plagiarismResult.flagged,
              similarityScore: plagiarismResult.maxSimilarity,
              mostSimilarSubmissionId: plagiarismResult.similarSubmissionId,
            },
          } as any,
          testResults: testResultsData as any,
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

      // 13. Recalculate domain scores for this candidate
      const domainScores = await this.recalculateDomainScores(submission.candidateId);

      // 14. Check if any domain now qualifies for a domain certificate
      let certificate: GeneratedCertificate | null = null;
      const challengeDomain = submission.challenge.domainTag;

      if (challengeDomain && domainScores[challengeDomain]) {
        const ds = domainScores[challengeDomain];
        // Domain certificate criteria: ≥3 challenges + score ≥70 + attempted INTERMEDIATE+
        const diffWeight: Record<string, number> = {
          BEGINNER: 1,
          INTERMEDIATE: 2,
          ADVANCED: 3,
          EXPERT: 4,
        };
        const maxDiffWeight = diffWeight[ds.maxDifficulty] || 1;
        const qualifies = ds.count >= 3 && ds.score >= 70 && maxDiffWeight >= 2;

        if (qualifies) {
          // Check if domain certificate already exists for this candidate + domain
          const existingDomainCert = await prisma.certificate.findFirst({
            where: {
              candidateId: submission.candidateId,
              metadata: { path: ['domainTag'], equals: challengeDomain },
            },
          });

          if (!existingDomainCert) {
            certificate = await this.certificateService.generateCertificate({
              candidateId: submission.candidateId,
              skillId: submission.challenge.skillId || submission.challengeId,
              challengeId: submission.challengeId,
              submissionId: submission.id,
              finalScore: Math.round(ds.score),
              aiScore: Math.round(ds.score),
              criteriaScores: {
                domain_score: { score: Math.round(ds.score), maxScore: 100 },
                challenges_completed: { score: ds.count, maxScore: 10 },
              },
              confidence,
              domainTag: challengeDomain,
              domainLevel: ds.level,
            });
            this.logger.log(
              `Domain certificate issued for ${challengeDomain}: ${ds.level} (score: ${ds.score}, ${ds.count} challenges)`
            );
          } else {
            // Update existing domain certificate if score improved
            if (ds.score > Number(existingDomainCert.finalScore)) {
              await prisma.certificate.update({
                where: { id: existingDomainCert.id },
                data: {
                  finalScore: Math.round(ds.score),
                  metadata: {
                    ...((existingDomainCert.metadata as any) || {}),
                    domainTag: challengeDomain,
                    domainLevel: ds.level,
                    challengesCompleted: ds.count,
                    lastUpdated: new Date().toISOString(),
                  },
                },
              });
              this.logger.log(
                `Domain certificate updated for ${challengeDomain}: ${ds.level} (score: ${ds.score})`
              );
            }
          }
        }
      }

      const passed = overallScore >= 70;

      this.logger.log(
        `Evaluation complete for ${submissionId}: score=${overallScore}, passed=${passed}, type=${challengeType}`
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
   * Process pending submissions in parallel batches
   */
  async processPendingSubmissions(limit = 10, concurrency = 3): Promise<number> {
    const pending = await prisma.submission.findMany({
      where: { status: 'SUBMITTED' },
      orderBy: { submittedAt: 'asc' },
      take: limit,
      select: { id: true },
    });

    let processed = 0;

    for (let i = 0; i < pending.length; i += concurrency) {
      const batch = pending.slice(i, i + concurrency);
      const results = await Promise.allSettled(batch.map(s => this.evaluateSubmission(s.id)));

      for (const result of results) {
        if (result.status === 'fulfilled') processed++;
        else this.logger.error(`Failed to evaluate submission: ${result.reason}`);
      }
    }

    this.logger.log(`Processed ${processed}/${pending.length} pending submissions`);
    return processed;
  }

  // --- Private helpers ---

  /**
   * Split a MIXED submission into code and text parts.
   * Looks for markers like "## Explanation", "// Explanation:", or triple-dash separators.
   */
  private splitMixedSubmission(content: string): { codePart: string; textPart: string } {
    // Try common separators
    const markers = [
      /\n---+\n/,
      /\n## ?Explanation\n/i,
      /\n\/\/ ?Explanation:?\n/i,
      /\n# ?Explanation:?\n/i,
      /\nExplanation:\n/i,
    ];

    for (const marker of markers) {
      const match = content.match(marker);
      if (match && match.index !== undefined) {
        return {
          codePart: content.slice(0, match.index).trim(),
          textPart: content.slice(match.index + match[0].length).trim(),
        };
      }
    }

    // No separator found — treat everything as code, no explanation
    return { codePart: content, textPart: '' };
  }

  /**
   * Evaluate just the code portion of a submission (used by MIXED evaluation)
   */
  private async evaluateCodePart(
    submission: any,
    code: string,
    language: string
  ): Promise<{
    score: number;
    criteriaScores: Record<string, { score: number; maxScore: number; feedback: string }>;
    feedback: string;
    suggestions: string[];
    testResultsData: any;
  }> {
    const manualTestCases = this.parseManualTestCases(submission.challenge.testCases);
    const requirements = this.parseRequirements(submission.challenge.requirements);

    const cachedRaw = submission.challenge.cachedTestCases;
    const cachedTestCases = Array.isArray(cachedRaw)
      ? (cachedRaw as unknown as GeneratedTestCase[])
      : null;
    let generatedTestCases: GeneratedTestCase[] = [];

    if (cachedTestCases && cachedTestCases.length > 0) {
      generatedTestCases = cachedTestCases;
    } else {
      try {
        generatedTestCases = await this.testCaseGenerator.generateTestCases({
          challengeTitle: submission.challenge.title,
          challengeDescription: submission.challenge.description,
          requirements,
          language,
          numTestCases: 10,
        });
      } catch {
        // fall through with empty
      }

      const ref = submission.challenge.referenceSolution;
      const refLang = submission.challenge.solutionLanguage || language;
      if (ref && generatedTestCases.length > 0) {
        const refResults = await this.codeExecutionService.runTestCases({
          code: ref,
          language: refLang,
          testCases: generatedTestCases.map(tc => ({
            input: tc.input,
            expectedOutput: tc.expectedOutput,
            name: tc.description,
          })),
        });
        generatedTestCases = generatedTestCases.filter((tc, i) => {
          const r = refResults.results[i];
          if (r && r.actualOutput != null && !r.error) {
            tc.expectedOutput = r.actualOutput;
            return true;
          }
          return false;
        });
      }

      if (generatedTestCases.length > 0) {
        await prisma.challenge.update({
          where: { id: submission.challengeId },
          data: { cachedTestCases: generatedTestCases as any },
        });
      }
    }

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

    const executionResults =
      allTestCases.length > 0
        ? await this.codeExecutionService.runTestCases({ code, language, testCases: allTestCases })
        : ({
            totalTests: 0,
            passed: 0,
            failed: 0,
            accuracy: 0,
            results: [],
            totalExecutionTimeMs: 0,
          } as TestCaseResults);

    let codeQualityScore = 70;
    let codeFeedback = 'Evaluation complete.';
    let codeSuggestions: string[] = [];
    let codeQualityNotes = '';

    try {
      const fb = await this.testCaseGenerator.generateFeedback({
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
      codeFeedback = fb.feedback;
      codeSuggestions = fb.suggestions;
      codeQualityScore = fb.codeQualityScore;
      codeQualityNotes = fb.codeQualityNotes;
    } catch {
      /* use defaults */
    }

    const accuracyScore = executionResults.accuracy;
    const score =
      allTestCases.length > 0 ? Math.round(accuracyScore * 0.6 + codeQualityScore * 0.4) : 0;

    return {
      score,
      criteriaScores: {
        correctness: {
          score: Math.round(accuracyScore),
          maxScore: 100,
          feedback: `${executionResults.passed}/${executionResults.totalTests} test cases passed`,
        },
        code_quality: {
          score: codeQualityScore,
          maxScore: 100,
          feedback: codeQualityNotes || 'Code quality analysis.',
        },
      },
      feedback: codeFeedback,
      suggestions: codeSuggestions,
      testResultsData: {
        totalTests: executionResults.totalTests,
        passed: executionResults.passed,
        failed: executionResults.failed,
        accuracy: executionResults.accuracy,
        results: executionResults.results,
      },
    };
  }

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

  private async checkPlagiarism(
    submissionId: string,
    challengeId: string,
    code: string
  ): Promise<{ flagged: boolean; maxSimilarity: number; similarSubmissionId: string | null }> {
    const normalized = this.normalizeCodeForSimilarity(code);

    if (normalized.length < 50) {
      return { flagged: false, maxSimilarity: 0, similarSubmissionId: null };
    }

    const codeNgrams = this.getCharNgrams(normalized);

    const others = await prisma.submission.findMany({
      where: {
        challengeId,
        id: { not: submissionId },
        status: 'EVALUATED',
        content: { not: null },
      },
      select: { id: true, content: true },
      take: 100,
      orderBy: { submittedAt: 'desc' },
    });

    let maxSimilarity = 0;
    let similarSubmissionId: string | null = null;

    for (const other of others) {
      if (!other.content) continue;
      const otherNgrams = this.getCharNgrams(this.normalizeCodeForSimilarity(other.content));
      const similarity = this.jaccardSimilarity(codeNgrams, otherNgrams);
      if (similarity > maxSimilarity) {
        maxSimilarity = similarity;
        similarSubmissionId = other.id;
      }
    }

    const flagged = maxSimilarity >= 0.85;
    if (flagged) {
      this.logger.warn(
        `Plagiarism flagged for ${submissionId}: ${Math.round(maxSimilarity * 100)}% similar to ${similarSubmissionId}`
      );
    }

    return {
      flagged,
      maxSimilarity: Math.round(maxSimilarity * 10000) / 100,
      similarSubmissionId,
    };
  }

  private normalizeCodeForSimilarity(code: string): string {
    return code
      .replace(/\/\/[^\n]*/g, '') // single-line comments (JS/TS/Java/Go/Rust)
      .replace(/#[^\n]*/g, '') // single-line comments (Python/Ruby)
      .replace(/\/\*[\s\S]*?\*\//g, '') // multi-line comments
      .replace(/"""[\s\S]*?"""/g, '') // Python docstrings
      .replace(/'''[\s\S]*?'''/g, '') // Python docstrings
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  private getCharNgrams(text: string, n = 5): Set<string> {
    const ngrams = new Set<string>();
    for (let i = 0; i <= text.length - n; i++) {
      ngrams.add(text.slice(i, i + n));
    }
    return ngrams;
  }

  private jaccardSimilarity(a: Set<string>, b: Set<string>): number {
    if (a.size === 0 && b.size === 0) return 1;
    if (a.size === 0 || b.size === 0) return 0;
    let intersection = 0;
    for (const item of a) {
      if (b.has(item)) intersection++;
    }
    return intersection / (a.size + b.size - intersection);
  }

  /**
   * Recalculate domain scores for a candidate after each evaluation.
   * Formula: domainScore = Σ(challengeScore × difficultyWeight) / Σ(difficultyWeight)
   * Weights: BEGINNER=1, INTERMEDIATE=2, ADVANCED=3, EXPERT=4
   */
  private async recalculateDomainScores(
    candidateId: string
  ): Promise<
    Record<string, { score: number; count: number; level: string; maxDifficulty: string }>
  > {
    try {
      // Get all evaluated submissions for this candidate with their challenge details
      const submissions = await prisma.submission.findMany({
        where: {
          candidateId,
          status: 'EVALUATED',
          aiScore: { not: null },
        },
        include: {
          challenge: {
            select: { domainTag: true, difficulty: true },
          },
        },
      });

      const difficultyWeights: Record<string, number> = {
        BEGINNER: 1,
        INTERMEDIATE: 2,
        ADVANCED: 3,
        EXPERT: 4,
      };

      // Group by domainTag
      const domainMap: Record<
        string,
        { totalWeightedScore: number; totalWeight: number; count: number; maxDifficulty: string }
      > = {};

      for (const sub of submissions) {
        const domain = sub.challenge.domainTag || 'General';
        const difficulty = sub.challenge.difficulty || 'BEGINNER';
        const weight = difficultyWeights[difficulty] || 1;
        const score = Number(sub.aiScore) || 0;

        if (!domainMap[domain]) {
          domainMap[domain] = {
            totalWeightedScore: 0,
            totalWeight: 0,
            count: 0,
            maxDifficulty: 'BEGINNER',
          };
        }

        domainMap[domain].totalWeightedScore += score * weight;
        domainMap[domain].totalWeight += weight;
        domainMap[domain].count += 1;

        // Track max difficulty attempted
        const currentMax = difficultyWeights[domainMap[domain].maxDifficulty] || 0;
        if (weight > currentMax) {
          domainMap[domain].maxDifficulty = difficulty;
        }
      }

      // Calculate final scores and levels
      const domainScores: Record<
        string,
        { score: number; count: number; level: string; maxDifficulty: string }
      > = {};

      for (const [domain, data] of Object.entries(domainMap)) {
        const score = Math.round((data.totalWeightedScore / data.totalWeight) * 10) / 10;
        const maxDiff = data.maxDifficulty;
        const maxWeight = difficultyWeights[maxDiff] || 1;

        // Level: based on score + max difficulty attempted
        let level: string;
        if (score >= 85 && maxWeight >= 3) level = 'EXPERT';
        else if (score >= 70 && maxWeight >= 2) level = 'ADVANCED';
        else if (score >= 60) level = 'INTERMEDIATE';
        else level = 'BEGINNER';

        domainScores[domain] = {
          score,
          count: data.count,
          level,
          maxDifficulty: maxDiff,
        };
      }

      // Store on candidate profile
      await prisma.candidateProfile.update({
        where: { id: candidateId },
        data: { domainScores: domainScores as any },
      });

      this.logger.log(
        `Domain scores updated for candidate ${candidateId}: ${Object.entries(domainScores)
          .map(([d, s]) => `${d}=${s.score}% (${s.level})`)
          .join(', ')}`
      );

      return domainScores;
    } catch (error) {
      this.logger.error(`Failed to recalculate domain scores: ${error}`);
      return {};
    }
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
