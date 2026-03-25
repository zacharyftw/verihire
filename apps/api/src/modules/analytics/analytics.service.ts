import { Injectable } from '@nestjs/common';
import { prisma } from '@verihire/database';
import {
  RecruiterDashboardDto,
  RecruiterJobMetricsDto,
  PlatformStatsDto,
} from './dto/analytics.dto';

@Injectable()
export class AnalyticsService {
  async getRecruiterDashboard(recruiterId: string): Promise<RecruiterDashboardDto> {
    const [activeJobs, totalCandidates, shortlists, hired] = await Promise.all([
      prisma.job.count({ where: { recruiterId, status: 'ACTIVE' } }),
      prisma.candidateProfile.count(),
      prisma.shortlist.count({ where: { recruiterId } }),
      prisma.shortlist.count({ where: { recruiterId, stage: 'HIRED' } }),
    ]);

    const hireRate = shortlists > 0 ? Math.round((hired / shortlists) * 100) : 0;

    return {
      activeJobs,
      totalCandidates,
      totalViews: shortlists,
      hireRate,
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
