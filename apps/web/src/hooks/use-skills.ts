import useSWR from 'swr';
import type { Skill, SkillCategory } from '@verihire/types';

export function useSkills(search?: string) {
  const params = search ? `?search=${encodeURIComponent(search)}` : '';
  return useSWR<{ items: Skill[] }>(`/skills${params}`);
}

export function usePopularSkills(limit: number = 10) {
  return useSWR<Skill[]>(`/skills/popular?limit=${limit}`);
}

export function useSkillCategories() {
  return useSWR<SkillCategory[]>('/skills/categories');
}
