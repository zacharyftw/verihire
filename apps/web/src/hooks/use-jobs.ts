import useSWR from 'swr';
import { api } from '@/lib/api';
import type { Job, Shortlist } from '@verihire/types';

interface JobFilters {
  status?: string;
  limit?: number;
  offset?: number;
}

function buildQuery(filters: JobFilters) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, val]) => {
    if (val !== undefined && val !== '') params.set(key, String(val));
  });
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export function useMyJobs(filters: JobFilters = {}) {
  return useSWR<{ items: Job[]; pagination: { total: number } }>(
    `/jobs/recruiter/my-jobs${buildQuery(filters)}`
  );
}

export function useJob(id: string | undefined) {
  return useSWR<Job>(id ? `/jobs/${id}` : null);
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

// Shortlist
export function useJobShortlist(jobId: string | undefined, stage?: string) {
  const params = stage ? `?stage=${stage}` : '';
  return useSWR<{ items: Shortlist[] }>(jobId ? `/jobs/${jobId}/shortlist${params}` : null);
}

export function addToShortlist(jobId: string, candidateId: string, notes?: string) {
  return api.post(`/jobs/${jobId}/shortlist`, { jobId, candidateId, notes });
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
