import useSWR from 'swr';
import { api } from '@/lib/api';
import type { Challenge } from '@/lib/types';

interface ChallengeFilters {
  skillId?: string;
  difficulty?: string;
  type?: string;
  limit?: number;
  offset?: number;
}

function buildQuery(filters: ChallengeFilters) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, val]) => {
    if (val !== undefined && val !== '') params.set(key, String(val));
  });
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export function useChallenges(filters: ChallengeFilters = {}) {
  // api.get() auto-unwraps data.data, so SWR receives the challenges array directly
  const result = useSWR<Challenge[]>(`/challenges${buildQuery(filters)}`);

  const normalized = result.data
    ? {
        items: Array.isArray(result.data) ? result.data : [],
        pagination: {
          total: Array.isArray(result.data) ? result.data.length : 0,
          page: 1,
          totalPages: 1,
        },
      }
    : undefined;

  return { ...result, data: normalized };
}

export function useChallenge(id: string | undefined) {
  return useSWR<Challenge>(id ? `/challenges/${id}` : null);
}

export function useRecommendedChallenges() {
  return useSWR<Challenge[]>('/challenges/recommended');
}

export function startChallenge(challengeId: string) {
  return api.get<Challenge>(`/challenges/${challengeId}/start`);
}
