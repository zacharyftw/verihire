import { Injectable } from '@nestjs/common';
import { prisma } from '@verihire/database';
import {
  RecruiterDashboardDto,
  ActivityItem,
  RecruiterJobMetricsDto,
  PlatformStatsDto,
} from './dto/analytics.dto';

@Injectable()
export class AnalyticsService {
  async getRecruiterDashboard(recruiterId: string): Promise<RecruiterDashboardDto> {
    const [totalJobs, activeJobs, shortlists, interviewing, hired] = await Promise.all([
      prisma.job.count({
        where: { recruiterId },
      }),
      prisma.job.count({
        where: { recruiterId, status: 'ACTIVE' },
      }),
      prisma.shortlist.count({
        where: { recruiterId },
      }),
      prisma.shortlist.count({
        where: { recruiterId, stage: 'INTERVIEW' },
      }),
      prisma.shortlist.count({
        where: { recruiterId, stage: 'HIRED' },
      }),
    ]);

    // Calculate avg time to hire
    const hiredCandidates = await prisma.shortlist.findMany({
      where: { recruiterId, stage: 'HIRED' },
      select: {
        createdAt: true,
        updatedAt: true,
      },
    });

    const avgTimeToHire =
      hiredCandidates.length > 0
        ? hiredCandidates.reduce(
            (acc, s) => acc + (s.updatedAt.getTime() - s.createdAt.getTime()),
            0
          ) /
          hiredCandidates.length /
          (1000 * 60 * 60 * 24)
        : 0;

    // Get recent activity
    const recentShortlists = await prisma.shortlist.findMany({
      where: { recruiterId },
      include: {
        candidate: {
          include: {
            user: {
              select: {
                firstName: true,
                lastName: true,
              },
            },
          },
        },
        job: {
          select: {
            title: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    const recentActivity: ActivityItem[] = recentShortlists.map(s => ({
      id: s.id,
      type: 'shortlist',
      message: `${s.candidate.user.firstName} ${s.candidate.user.lastName} moved to ${s.stage} for ${s.job.title}`,
      timestamp: s.updatedAt,
    }));

    return {
      totalJobs,
      activeJobs,
      totalShortlisted: shortlists,
      totalInterviewing: interviewing,
      totalHired: hired,
      avgTimeToHire: Math.round(avgTimeToHire),
      recentActivity,
    };
  }

  async getJobMetrics(jobId: string, recruiterId: string): Promise<RecruiterJobMetricsDto> {
    // Verify job belongs to recruiter
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      select: {
        id: true,
        title: true,
        recruiterId: true,
      },
    });

    if (!job || job.recruiterId !== recruiterId) {
      throw new Error('Job not found or unauthorized');
    }

    const [totalApplications, shortlisted, interviewing, offers, hired, rejected, candidates] =
      await Promise.all([
        prisma.shortlist.count({
          where: { jobId },
        }),
        prisma.shortlist.count({
          where: { jobId, stage: 'SHORTLISTED' },
        }),
        prisma.shortlist.count({
          where: { jobId, stage: 'INTERVIEW' },
        }),
        prisma.shortlist.count({
          where: { jobId, stage: 'OFFER' },
        }),
        prisma.shortlist.count({
          where: { jobId, stage: 'HIRED' },
        }),
        prisma.shortlist.count({
          where: { jobId, stage: 'REJECTED' },
        }),
        prisma.shortlist.findMany({
          where: { jobId },
          include: {
            candidate: {
              include: {
                certificates: {
                  where: { revokedAt: null },
                  select: {
                    finalScore: true,
                  },
                },
              },
            },
          },
        }),
      ]);

    // Calculate average candidate score based on certificates
    const scores = candidates
      .flatMap(c => c.candidate.certificates.map(cert => Number(cert.finalScore)))
      .filter(score => !isNaN(score));

    const avgCandidateScore =
      scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;

    return {
      jobId: job.id,
      jobTitle: job.title,
      totalApplications,
      shortlistedCount: shortlisted,
      interviewingCount: interviewing,
      offersCount: offers,
      hiredCount: hired,
      rejectedCount: rejected,
      avgCandidateScore: Math.round(avgCandidateScore * 10) / 10,
    };
  }

  async getPlatformStats(): Promise<PlatformStatsDto> {
    const [
      totalCandidates,
      totalRecruiters,
      totalJobs,
      totalCertificates,
      totalSubmissions,
      totalHires,
    ] = await Promise.all([
      prisma.candidateProfile.count(),
      prisma.recruiterProfile.count(),
      prisma.job.count(),
      prisma.certificate.count({
        where: { revokedAt: null },
      }),
      prisma.submission.count(),
      prisma.shortlist.count({
        where: { stage: 'HIRED' },
      }),
    ]);

    return {
      totalCandidates,
      totalRecruiters,
      totalJobs,
      totalCertificates,
      totalSubmissions,
      totalHires,
    };
  }
}
