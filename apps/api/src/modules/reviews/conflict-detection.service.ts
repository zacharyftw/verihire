import { Injectable, Logger } from '@nestjs/common';
import { prisma } from '@verihire/database';

interface ConflictResult {
  hasConflict: boolean;
  conflictType?: string;
  details?: string;
}

/**
 * Service for detecting conflicts of interest between reviewers and candidates.
 * Filters out reviewers who may have bias or relationships with the candidate.
 */
@Injectable()
export class ConflictDetectionService {
  private readonly logger = new Logger(ConflictDetectionService.name);

  /**
   * Filter out reviewers with potential conflicts of interest
   */
  async filterConflicts(
    reviewerIds: string[],
    candidateId: string,
    submissionId: string
  ): Promise<string[]> {
    const cleanReviewers: string[] = [];

    for (const reviewerId of reviewerIds) {
      const conflicts = await this.detectConflicts(reviewerId, candidateId, submissionId);

      if (!conflicts.hasConflict) {
        cleanReviewers.push(reviewerId);
      } else {
        this.logger.debug(
          `Filtered reviewer ${reviewerId} due to conflict: ${conflicts.conflictType}`
        );
      }
    }

    return cleanReviewers;
  }

  /**
   * Detect all potential conflicts between a reviewer and candidate
   */
  async detectConflicts(
    reviewerId: string,
    candidateId: string,
    _submissionId: string
  ): Promise<ConflictResult> {
    // 1. Check for same organization
    const orgConflict = await this.checkSameOrganization(reviewerId, candidateId);
    if (orgConflict.hasConflict) return orgConflict;

    // 2. Check for previous mutual reviews
    const mutualReviewConflict = await this.checkMutualReviews(reviewerId, candidateId);
    if (mutualReviewConflict.hasConflict) return mutualReviewConflict;

    // 3. Check for recent interactions (reviewed same challenges)
    const interactionConflict = await this.checkRecentInteractions(reviewerId, candidateId);
    if (interactionConflict.hasConflict) return interactionConflict;

    // 4. Self-review check (should never happen but safety check)
    if (reviewerId === candidateId) {
      return {
        hasConflict: true,
        conflictType: 'self_review',
        details: 'Cannot review own submission',
      };
    }

    return { hasConflict: false };
  }

  /**
   * Check if reviewer and candidate work at the same organization
   */
  private async checkSameOrganization(
    reviewerId: string,
    candidateId: string
  ): Promise<ConflictResult> {
    // Get both profiles with their company associations
    const [reviewer, candidate] = await Promise.all([
      prisma.candidateProfile.findUnique({
        where: { id: reviewerId },
        select: { currentCompany: true },
      }),
      prisma.candidateProfile.findUnique({
        where: { id: candidateId },
        select: { currentCompany: true },
      }),
    ]);

    if (
      reviewer?.currentCompany &&
      candidate?.currentCompany &&
      this.normalizeCompanyName(reviewer.currentCompany) ===
        this.normalizeCompanyName(candidate.currentCompany)
    ) {
      return {
        hasConflict: true,
        conflictType: 'same_organization',
        details: `Both work at ${reviewer.currentCompany}`,
      };
    }

    return { hasConflict: false };
  }

  /**
   * Check if reviewer and candidate have reviewed each other before
   */
  private async checkMutualReviews(
    reviewerId: string,
    candidateId: string
  ): Promise<ConflictResult> {
    // Check if candidate has reviewed reviewer's submissions
    const candidateReviewedReviewer = await prisma.review.findFirst({
      where: {
        reviewerId: candidateId,
        submission: {
          candidateId: reviewerId,
        },
        status: { in: ['SUBMITTED', 'VALIDATED'] },
      },
      select: { id: true, submittedAt: true },
    });

    if (candidateReviewedReviewer) {
      // Check if this was recent (within 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      if (
        candidateReviewedReviewer.submittedAt &&
        candidateReviewedReviewer.submittedAt > thirtyDaysAgo
      ) {
        return {
          hasConflict: true,
          conflictType: 'mutual_review',
          details: 'Candidate recently reviewed this reviewer',
        };
      }
    }

    // Check if reviewer has reviewed candidate's submissions multiple times
    const reviewerReviewedCandidate = await prisma.review.count({
      where: {
        reviewerId,
        submission: {
          candidateId,
        },
        status: { in: ['SUBMITTED', 'VALIDATED'] },
      },
    });

    if (reviewerReviewedCandidate >= 3) {
      return {
        hasConflict: true,
        conflictType: 'repeated_reviewer',
        details: 'Reviewer has reviewed this candidate multiple times',
      };
    }

    return { hasConflict: false };
  }

  /**
   * Check for recent interactions between reviewer and candidate
   */
  private async checkRecentInteractions(
    reviewerId: string,
    candidateId: string
  ): Promise<ConflictResult> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Check if they've submitted to the same challenges recently
    const reviewerSubmissions = await prisma.submission.findMany({
      where: {
        candidateId: reviewerId,
        submittedAt: { gte: thirtyDaysAgo },
      },
      select: { challengeId: true },
    });

    const reviewerChallengeIds = reviewerSubmissions.map(s => s.challengeId);

    if (reviewerChallengeIds.length === 0) {
      return { hasConflict: false };
    }

    const candidateSubmissions = await prisma.submission.findMany({
      where: {
        candidateId,
        challengeId: { in: reviewerChallengeIds },
        submittedAt: { gte: thirtyDaysAgo },
      },
      select: { challengeId: true },
    });

    // If they've competed on the same challenge recently, there might be bias
    if (candidateSubmissions.length >= 2) {
      return {
        hasConflict: true,
        conflictType: 'competition_bias',
        details: 'Both recently submitted to the same challenges',
      };
    }

    return { hasConflict: false };
  }

  /**
   * Normalize company name for comparison
   */
  private normalizeCompanyName(name: string): string {
    return name
      .toLowerCase()
      .replace(/\s+(inc|llc|ltd|corp|corporation|company|co)\.?$/i, '')
      .replace(/[^a-z0-9]/g, '')
      .trim();
  }

  /**
   * Get detailed conflict report for admin review
   */
  async getConflictReport(
    reviewerId: string,
    candidateId: string,
    _submissionId: string
  ): Promise<{
    reviewerId: string;
    candidateId: string;
    conflicts: ConflictResult[];
    overallRisk: 'low' | 'medium' | 'high';
  }> {
    const conflicts: ConflictResult[] = [];

    // Run all checks
    const orgConflict = await this.checkSameOrganization(reviewerId, candidateId);
    if (orgConflict.hasConflict) conflicts.push(orgConflict);

    const mutualReviewConflict = await this.checkMutualReviews(reviewerId, candidateId);
    if (mutualReviewConflict.hasConflict) conflicts.push(mutualReviewConflict);

    const interactionConflict = await this.checkRecentInteractions(reviewerId, candidateId);
    if (interactionConflict.hasConflict) conflicts.push(interactionConflict);

    // Determine overall risk
    let overallRisk: 'low' | 'medium' | 'high' = 'low';
    if (conflicts.length >= 2) {
      overallRisk = 'high';
    } else if (conflicts.length === 1) {
      const highRiskTypes = ['same_organization', 'self_review'];
      if (highRiskTypes.includes(conflicts[0].conflictType || '')) {
        overallRisk = 'high';
      } else {
        overallRisk = 'medium';
      }
    }

    return {
      reviewerId,
      candidateId,
      conflicts,
      overallRisk,
    };
  }
}
