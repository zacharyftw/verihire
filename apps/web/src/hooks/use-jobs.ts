import useSWR from 'swr';
import { api } from '@/lib/api';
import type { Job, Shortlist } from '@verihire/types';

interface JobFilters {
  status?: string;
  limit?: number;
  offset?: number;
}

interface JobSearchFilters {
  status?: string;
  query?: string;
  remotePolicy?: string;
  employmentType?: string;
  locationCity?: string;
  limit?: number;
  offset?: number;
}

interface JobSearchResult {
  items: JobWithRelations[];
  meta: { total: number; limit: number; offset: number; hasMore: boolean };
}

function buildQuery(filters: Record<string, string | number | undefined>) {
  const params = new URLSearchParams();
  for (const [key, val] of Object.entries(filters)) {
    if (val !== undefined && val !== '') params.set(key, String(val));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

// Extended job type with relations included in search/detail API responses
export interface JobWithRelations extends Job {
  company?: { id: string; name: string; logoUrl?: string };
  jobSkills?: Array<{
    skill: { id: string; name: string };
    minLevel?: string;
    required: boolean;
  }>;
  recruiter?: { id: string; userId: string; user: { firstName: string; lastName: string } };
  createdAt: string;
}

export function useMyJobs(filters: JobFilters = {}) {
  return useSWR<{ items: Job[]; pagination: { total: number } }>(
    `/jobs/recruiter/my-jobs${buildQuery(filters as Record<string, string | number | undefined>)}`,
    { refreshInterval: 30000 }
  );
}

export function useJob(id: string | undefined) {
  return useSWR<JobWithRelations>(id ? `/jobs/${id}` : null);
}

export function useJobSearch(filters: JobSearchFilters = {}) {
  return useSWR<JobSearchResult>(
    `/jobs/search${buildQuery(filters as Record<string, string | number | undefined>)}`
  );
}

export function createJob(data: Record<string, unknown>) {
  return api.post<Job>('/jobs', data);
}

export function updateJob(id: string, data: Record<string, unknown>) {
  return api.patch<Job>(`/jobs/${id}`, data);
}

export function publishJob(id: string) {
  return api.post(`/jobs/${id}/publish`);
}

export function closeJob(id: string) {
  return api.post(`/jobs/${id}/close`);
}

export function deleteJob(id: string) {
  return api.delete(`/jobs/${id}`);
}

export function addJobSkill(jobId: string, skillId: string, required = true) {
  return api.post(`/jobs/${jobId}/skills`, { skillId, required });
}

// Shortlist
export function useJobShortlist(jobId: string | undefined, stage?: string) {
  const params = stage ? `?stage=${stage}` : '';
  return useSWR<{ items: Shortlist[] }>(jobId ? `/jobs/${jobId}/shortlist${params}` : null);
}

export function addToShortlist(jobId: string, candidateId: string, notes?: string) {
  return api.post(`/jobs/${jobId}/shortlist`, { candidateId, notes });
}

export function updateShortlistEntry(
  jobId: string,
  candidateId: string,
  data: { stage?: string; notes?: string; rating?: number }
) {
  return api.patch(`/jobs/${jobId}/shortlist/${candidateId}`, data);
}

export function removeFromShortlist(jobId: string, candidateId: string) {
  return api.delete(`/jobs/${jobId}/shortlist/${candidateId}`);
}

export function useMatchingCandidates(jobId: string | undefined) {
  return useSWR(jobId ? `/jobs/${jobId}/matching-candidates` : null);
}
