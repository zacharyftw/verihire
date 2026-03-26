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
  const result = useSWR<{ items: Challenge[]; meta: { total: number } } | Challenge[]>(
    `/challenges${buildQuery(filters)}`
  );

  const raw = result.data;
  const items = Array.isArray(raw) ? raw : (raw?.items ?? []);
  const total = Array.isArray(raw) ? raw.length : (raw?.meta?.total ?? items.length);

  const normalized = raw ? { items, pagination: { total, page: 1, totalPages: 1 } } : undefined;

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
