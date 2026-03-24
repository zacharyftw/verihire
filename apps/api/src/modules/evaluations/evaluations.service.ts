import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { prisma } from '@verihire/database';
import { CertificateService, GeneratedCertificate } from './certificate.service';
import { TestCaseGeneratorService, GeneratedTestCase } from './test-case-generator.service';
import { CodeExecutionService, TestCaseResults } from '../code-execution/code-execution.service';
import { PlagiarismService } from './plagiarism.service';

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
    private codeExecutionService: CodeExecutionService,
    private plagiarismService: PlagiarismService
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
      const _language = submission.language || 'javascript';
      const challengeType = submission.challenge.type || 'CODING';

      // All evaluation goes through LLM — no code execution needed
      const textResult = await this.testCaseGenerator.evaluateTextSubmission({
        challengeTitle: submission.challenge.title,
        challengeDescription: submission.challenge.description,
        candidateAnswer: code,
        referenceSolution: submission.challenge.referenceSolution || '',
        challengeType,
      });

      let overallScore = textResult.overallScore;
      const criteriaScores = textResult.criteriaScores;
      let feedback = textResult.feedback;
      const suggestions = textResult.suggestions;
      const confidence = 0.8;
      const testResultsData = { totalTests: 0, passed: 0, failed: 0, accuracy: 0, results: [] };

      // CodeBERT plagiarism check (candidate vs candidate only)
      let plagiarismResult = {
        flagged: false,
        maxSimilarity: 0,
        similarSubmissionId: null as string | null,
        method: 'codebert' as string,
      };

      // Plagiarism check (CodeBERT candidate-vs-candidate)
      try {
        plagiarismResult = await this.plagiarismService.checkPlagiarism(
          submissionId,
          submission.challengeId,
          code
        );
        if (plagiarismResult.flagged) {
          overallScore = 0;
          feedback = `Plagiarism detected: ${plagiarismResult.maxSimilarity}% similarity. ${feedback}`;
        }
        const embedding = await this.plagiarismService.generateEmbedding(code);
        if (embedding) await this.plagiarismService.storeEmbedding(submissionId, embedding);
      } catch (err) {
        this.logger.warn(`Plagiarism check failed: ${err}`);
      }

      const processingTimeMs = Date.now() - startTime;

      if (plagiarismResult.flagged) {
        this.logger.warn(
          `Plagiarism detected for ${submissionId} via ${plagiarismResult.method}: zeroing score`
        );
        overallScore = 0;
        feedback = `Plagiarism detected: This submission has ${plagiarismResult.maxSimilarity}% similarity with another submission (method: ${plagiarismResult.method}). ${feedback}`;
      }

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
              method: plagiarismResult.method,
            },
          } as any,
          testResults: testResultsData as any,
          feedback,
          suggestions,
          confidence,
          processingTimeMs,
          modelVersions: {
            llmModel: 'llama-3.3-70b-versatile',
            executionEngine: 'llm-only',
            evaluationVersion: '3.0.0',
          },
        },
      });

      // 11. Update submission status and score
      // Set finalScore = aiScore when no peer review is pending
      await prisma.submission.update({
        where: { id: submissionId },
        data: {
          status: 'EVALUATED',
          aiScore: overallScore,
          finalScore: overallScore,
        },
      });

      // Core evaluation is done — submission is now EVALUATED.
      // Post-evaluation steps (stats, domain scores, certificate) run best-effort
      // so failures here do NOT revert the submission status.
      const passed = overallScore >= 70;

      this.logger.log(
        `Evaluation complete for ${submissionId}: score=${overallScore}, passed=${passed}, type=${challengeType}`
      );

      // 12–14 run outside the critical try/catch so errors don't revert status
      let certificate: GeneratedCertificate | null = null;

      try {
        // 12. Update challenge stats
        await this.updateChallengeStats(submission.challengeId, overallScore);

        // 13. Recalculate domain scores for this candidate
        const domainScores = await this.recalculateDomainScores(submission.candidateId);

        // 14. Check if ALL generated challenges are completed — if so, issue certificate
        const candidateId = submission.candidateId;
        const [totalChallenges, completedSubmissions] = await Promise.all([
          prisma.challenge.count({ where: { generatedForCandidateId: candidateId } }),
          prisma.submission.count({
            where: { candidateId, status: 'EVALUATED', aiScore: { not: null } },
          }),
        ]);

        if (totalChallenges > 0 && completedSubmissions >= totalChallenges) {
          // All challenges completed — calculate overall average score
          const allScores = Object.values(domainScores);
          const totalWeightedScore = allScores.reduce((sum, ds) => sum + ds.score * ds.count, 0);
          const totalCount = allScores.reduce((sum, ds) => sum + ds.count, 0);
          const avgScore = totalCount > 0 ? Math.round(totalWeightedScore / totalCount) : 0;

          // Determine overall level
          let level: string;
          if (avgScore >= 85) level = 'EXPERT';
          else if (avgScore >= 70) level = 'ADVANCED';
          else if (avgScore >= 60) level = 'INTERMEDIATE';
          else level = 'BEGINNER';

          if (avgScore >= 70) {
            // Check if certificate already exists for this candidate
            const existingCert = await prisma.certificate.findFirst({
              where: {
                candidateId,
                metadata: { path: ['certificateType'], equals: 'DOMAIN' },
              },
            });

            const sortedDomains = Object.entries(domainScores)
              .sort(([, a], [, b]) => b.score - a.score)
              .map(([domain]) => domain);

            if (!existingCert) {
              certificate = await this.certificateService.generateCertificate({
                candidateId,
                skillId: submission.challenge.skillId || submission.challengeId,
                challengeId: submission.challengeId,
                submissionId: submission.id,
                finalScore: avgScore,
                aiScore: avgScore,
                criteriaScores: {
                  overall_score: { score: avgScore, maxScore: 100 },
                  challenges_completed: { score: completedSubmissions, maxScore: totalChallenges },
                },
                confidence,
                domainTag: sortedDomains[0] || 'General',
                domainLevel: level,
              });
              this.logger.log(
                `Certificate issued: ${level} (avg score: ${avgScore}%, ${completedSubmissions}/${totalChallenges} challenges)`
              );
            } else if (avgScore > Number(existingCert.finalScore)) {
              await prisma.certificate.update({
                where: { id: existingCert.id },
                data: {
                  finalScore: avgScore,
                  metadata: {
                    ...((existingCert.metadata as any) || {}),
                    certificateType: 'DOMAIN',
                    domainLevel: level,
                    challengesCompleted: completedSubmissions,
                    avgScore,
                    domains: Object.keys(domainScores),
                    lastUpdated: new Date().toISOString(),
                  },
                },
              });
              this.logger.log(`Certificate updated: ${level} (avg score: ${avgScore}%)`);
            }
          } else {
            this.logger.log(
              `All challenges completed but avg score ${avgScore}% < 70% — no certificate`
            );
          }
        }
      } catch (postError) {
        // Post-evaluation steps failed but submission is already EVALUATED — don't revert
        this.logger.error(
          `Post-evaluation steps failed for ${submissionId} (submission is still EVALUATED): ${postError}`
        );
      }

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
      // Revert status on failure — only if core evaluation (LLM + score save) failed
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

    // Same cache-invalidation caveat as evaluateSubmission — see comment there.
    const cachedRaw = submission.challenge.cachedTestCases;
    let cachedTestCases: GeneratedTestCase[] | null = null;

    if (Array.isArray(cachedRaw) && cachedRaw.length > 0) {
      // Validate that cached test cases have required fields
      const isValid = cachedRaw.every(
        (tc: any) =>
          tc &&
          typeof tc.input === 'string' &&
          typeof tc.expectedOutput === 'string' &&
          typeof tc.category === 'string' &&
          typeof tc.description === 'string'
      );
      if (isValid) {
        cachedTestCases = cachedRaw as unknown as GeneratedTestCase[];
      } else {
        this.logger.warn('Cached test cases are corrupted, regenerating...');
      }
    }
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
        try {
          const refResults = await this.codeExecutionService.runTestCases({
            code: ref,
            language: refLang,
            testCases: generatedTestCases.map(tc => ({
              input: tc.input,
              expectedOutput: tc.expectedOutput,
              name: tc.description,
            })),
          });
          const validatedCount = generatedTestCases.filter((tc, i) => {
            if (i >= refResults.results.length) return false;
            const r = refResults.results[i];
            if (r && r.actualOutput != null && !r.error) {
              tc.expectedOutput = r.actualOutput;
              return true;
            }
            return false;
          }).length;
          if (validatedCount === 0) {
            this.logger.warn(
              'Reference solution failed on all test cases in MIXED evaluation — keeping LLM-generated expected outputs'
            );
          }
        } catch (refError) {
          this.logger.warn(
            `Judge0 unavailable for reference validation in MIXED evaluation, using LLM-generated expected outputs: ${refError}`
          );
        }
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

    let executionResults: TestCaseResults = {
      totalTests: 0,
      passed: 0,
      failed: 0,
      accuracy: 0,
      results: [],
      totalExecutionTimeMs: 0,
    };
    let judge0Available = true;

    try {
      executionResults =
        allTestCases.length > 0
          ? await this.codeExecutionService.runTestCases({
              code,
              language,
              testCases: allTestCases,
            })
          : executionResults;
    } catch (execError) {
      this.logger.warn(
        `Judge0 unavailable, falling back to LLM-only evaluation for MIXED code part: ${execError}`
      );
      judge0Available = false;
    }

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

    if (!judge0Available) {
      return {
        score: codeQualityScore,
        criteriaScores: {
          correctness: {
            score: 0,
            maxScore: 100,
            feedback:
              'Code execution unavailable (Judge0 unreachable). Correctness could not be verified.',
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
          totalTests: 0,
          passed: 0,
          failed: 0,
          accuracy: 0,
          results: [],
        },
      };
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
      // Include evaluations so we can exclude plagiarized submissions
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
          evaluations: {
            select: { staticAnalysis: true },
            orderBy: { createdAt: 'desc' },
            take: 1,
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
        if (!sub.challenge.domainTag) continue;

        // Skip plagiarized or integrity-compromised submissions — they should not contribute to domain scores
        const latestEval = sub.evaluations?.[0];
        const staticAnalysis = latestEval?.staticAnalysis as any;
        if (staticAnalysis?.plagiarism?.flagged) continue;
        if (staticAnalysis?.integrityCompromised) continue;

        const domain = sub.challenge.domainTag;
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

  private async updateChallengeStats(challengeId: string, _score: number) {
    // Recompute the average from all evaluations to avoid race conditions
    // with concurrent evaluations that could corrupt a read-modify-write cycle.
    const avg = await prisma.evaluation.aggregate({
      where: { submission: { challengeId } },
      _avg: { overallScore: true },
    });

    await prisma.challenge.update({
      where: { id: challengeId },
      data: { averageScore: avg._avg.overallScore || 0 },
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
