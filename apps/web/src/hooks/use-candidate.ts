import useSWR from 'swr';
import { api } from '@/lib/api';
import type { CandidateProfile, CandidateSkill } from '@verihire/types';

export function useCandidateProfile() {
  return useSWR<CandidateProfile>('/candidates/me');
}

export function useCandidateStats() {
  return useSWR<{
    challengesCompleted: number;
    averageScore: number;
    certificatesCount: number;
    submissionsCount: number;
  }>('/candidates/me/stats');
}

export function useCandidateSkills() {
  return useSWR<CandidateSkill[]>('/candidates/me/skills');
}

export function updateCandidateProfile(data: Record<string, unknown>) {
  return api.patch<CandidateProfile>('/candidates/me', data);
}

export function addCandidateSkill(data: { skillId: string; level?: string }) {
  return api.post('/candidates/me/skills', data);
}

export function removeCandidateSkill(skillId: string) {
  return api.delete(`/candidates/me/skills/${skillId}`);
}
