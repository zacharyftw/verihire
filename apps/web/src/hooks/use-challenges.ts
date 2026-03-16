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
  const result = useSWR<{
    data?: Challenge[];
    items?: Challenge[];
    meta?: { total: number; limit: number; offset: number; hasMore: boolean };
    pagination?: { total: number; page: number; totalPages: number };
  }>(`/challenges${buildQuery(filters)}`);

  // Normalize API response (API returns data/meta, frontend expects items/pagination)
  const normalized = result.data
    ? {
        items: result.data.data || result.data.items || [],
        pagination: result.data.pagination || {
          total: result.data.meta?.total || 0,
          page: Math.floor((result.data.meta?.offset || 0) / (result.data.meta?.limit || 20)) + 1,
          totalPages: Math.ceil((result.data.meta?.total || 0) / (result.data.meta?.limit || 20)),
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
