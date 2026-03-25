import { ApiProperty } from '@nestjs/swagger';

export class RecruiterDashboardDto {
  @ApiProperty()
  activeJobs: number;

  @ApiProperty()
  totalCandidates: number;

  @ApiProperty()
  totalViews: number;

  @ApiProperty()
  hireRate: number;
}

export class ActivityItem {
  @ApiProperty()
  id: string;

  @ApiProperty()
  type: string;

  @ApiProperty()
  message: string;

  @ApiProperty()
  timestamp: Date;
}

export class RecruiterJobMetricsDto {
  @ApiProperty()
  jobId: string;

  @ApiProperty()
  jobTitle: string;

  @ApiProperty()
  totalApplications: number;

  @ApiProperty()
  shortlistedCount: number;

  @ApiProperty()
  interviewingCount: number;

  @ApiProperty()
  offersCount: number;

  @ApiProperty()
  hiredCount: number;

  @ApiProperty()
  rejectedCount: number;

  @ApiProperty()
  avgCandidateScore: number;
}

export class PlatformStatsDto {
  @ApiProperty()
  totalCandidates: number;

  @ApiProperty()
  totalRecruiters: number;

  @ApiProperty()
  totalJobs: number;

  @ApiProperty()
  totalCertificates: number;

  @ApiProperty()
  totalSubmissions: number;

  @ApiProperty()
  totalHires: number;
}
