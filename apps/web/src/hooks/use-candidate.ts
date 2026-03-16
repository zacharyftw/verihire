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

export function uploadResume(file: File) {
  const formData = new FormData();
  formData.append('file', file);
  return api.upload<{ url: string; key: string }>('/candidates/me/resume', formData);
}

export function deleteResume() {
  return api.delete('/candidates/me/resume');
}

export interface DomainScore {
  score: number;
  count: number;
  level: string;
  maxDifficulty: string;
}

export interface DomainScores {
  domains: Record<string, DomainScore>;
}

export function useDomainScores(profileId: string | undefined) {
  return useSWR<DomainScores>(profileId ? `/candidates/${profileId}/domain-scores` : null);
}

export function useResumeAnalysis(candidateId: string | undefined) {
  return useSWR<{
    analyzed: boolean;
    analyzedAt: string | null;
    seniorityLevel: string | null;
    domains: string[];
    yearsExperience: number | null;
    hasResume: boolean;
  }>(candidateId ? `/candidates/${candidateId}/resume-analysis` : null);
}
