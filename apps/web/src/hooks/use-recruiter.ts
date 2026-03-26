import useSWR from 'swr';
import { api } from '@/lib/api';
import type { RecruiterProfile } from '@verihire/types';

export function useRecruiterProfile() {
  return useSWR<RecruiterProfile>('/recruiters/me');
}

export function useRecruiterStats() {
  return useSWR('/recruiters/me/stats', { refreshInterval: 30000 });
}

export function useRecruiterDashboard() {
  return useSWR('/analytics/recruiter/dashboard', { refreshInterval: 30000 });
}

export function createRecruiterProfile(data: Record<string, unknown>) {
  return api.post<RecruiterProfile>('/recruiters', data);
}

export function updateRecruiterProfile(data: Record<string, unknown>) {
  return api.patch<RecruiterProfile>('/recruiters/me', data);
}

// Job applicant types
export interface ApplicationCandidate {
  id: string;
  headline?: string;
  locationCity?: string;
  yearsExperience?: number;
  resumeUrl?: string;
  user: { firstName: string; lastName: string; email: string };
  candidateSkills: Array<{ skill: { name: string }; level?: string }>;
}

export interface ApplicationChallenge {
  id: string;
  title: string;
  type: string;
  difficulty: string;
  submissions: Array<{ id: string; status: string; finalScore?: number }>;
}

export interface ApplicationCertificate {
  id: string;
  certificateNumber: string;
  finalScore: number;
  grade: string;
  metadata: { title?: string };
  issuedAt: string;
}

export interface JobApplication {
  id: string;
  status: 'APPLIED' | 'TESTING' | 'COMPLETED' | 'REVIEWED' | 'SHORTLISTED' | 'REJECTED' | 'HIRED';
  appliedAt: string;
  completedAt?: string;
  averageScore?: number;
  reviewerNotes?: string;
  candidate: ApplicationCandidate;
  challenges?: ApplicationChallenge[];
  certificate?: ApplicationCertificate;
  _count?: { challenges: number };
  completedChallenges?: number;
}

export interface JobApplicationsResponse {
  items: JobApplication[];
  meta: { total: number; limit: number; offset: number };
}

export function useJobApplicants(
  jobId: string | undefined,
  status?: string,
  limit = 20,
  offset = 0
) {
  const params = new URLSearchParams();
  if (status && status !== 'all') params.set('status', status);
  params.set('limit', String(limit));
  params.set('offset', String(offset));
  const qs = params.toString();

  return useSWR<JobApplicationsResponse>(jobId ? `/jobs/${jobId}/applications?${qs}` : null, {
    refreshInterval: 10000,
  });
}

export function updateApplication(
  jobId: string,
  applicationId: string,
  data: { status: string; reviewerNotes?: string }
) {
  return api.patch(`/jobs/${jobId}/applications/${applicationId}`, data);
}
