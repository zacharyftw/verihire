import useSWR from 'swr';
import { api } from '@/lib/api';
import type { RecruiterProfile } from '@verihire/types';

export function useRecruiterProfile() {
  return useSWR<RecruiterProfile>('/recruiters/me');
}

export function useRecruiterStats() {
  return useSWR('/recruiters/me/stats');
}

export function useRecruiterDashboard() {
  return useSWR('/analytics/recruiter/dashboard');
}

export function createRecruiterProfile(data: Record<string, unknown>) {
  return api.post<RecruiterProfile>('/recruiters', data);
}

export function updateRecruiterProfile(data: Record<string, unknown>) {
  return api.patch<RecruiterProfile>('/recruiters/me', data);
}
