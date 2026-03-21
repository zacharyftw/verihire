import useSWR from 'swr';
import { api } from '@/lib/api';
import type { Submission } from '@/lib/types';

interface SubmissionFilters {
  status?: string;
  skillId?: string;
  limit?: number;
  offset?: number;
}

function buildQuery(filters: SubmissionFilters) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, val]) => {
    if (val !== undefined && val !== '') params.set(key, String(val));
  });
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export function useMySubmissions(filters: SubmissionFilters = {}) {
  // api.get() auto-unwraps data.data, so SWR receives the array directly
  const result = useSWR<Submission[]>(`/submissions/my${buildQuery(filters)}`);

  const normalized = result.data
    ? {
        items: Array.isArray(result.data) ? result.data : [],
        pagination: { total: Array.isArray(result.data) ? result.data.length : 0 },
      }
    : undefined;

  return { ...result, data: normalized };
}

export function useSubmission(id: string | undefined) {
  return useSWR<Submission>(id ? `/submissions/${id}` : null);
}

export function useSubmissionResults(id: string | undefined) {
  return useSWR(id ? `/submissions/${id}/results` : null);
}

export function useActiveSubmission(challengeId: string | undefined) {
  return useSWR<Submission>(challengeId ? `/submissions/active/${challengeId}` : null);
}

export function startSubmission(challengeId: string) {
  return api.post<Submission>('/submissions/start', { challengeId });
}

export function updateSubmission(id: string, data: { content?: string; language?: string }) {
  return api.patch<Submission>(`/submissions/${id}`, data);
}

export function submitSolution(
  id: string,
  data: {
    content: string;
    language?: string;
    files?: { name: string; content: string; type: string }[];
  }
) {
  return api.post<Submission>(`/submissions/${id}/submit`, data);
}
