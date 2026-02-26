import useSWR from 'swr';
import { api } from '@/lib/api';
import type { Challenge } from '@verihire/types';

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
  return useSWR<{
    items: Challenge[];
    pagination: { total: number; page: number; totalPages: number };
  }>(`/challenges${buildQuery(filters)}`);
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
