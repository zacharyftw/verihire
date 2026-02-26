import useSWR from 'swr';
import { api } from '@/lib/api';
import type { Company } from '@verihire/types';

export function useCompanies() {
  return useSWR<{ items: Company[] }>('/companies');
}

export function useCompany(id: string | undefined) {
  return useSWR<Company>(id ? `/companies/${id}` : null);
}

export function createCompany(data: Record<string, unknown>) {
  return api.post<Company>('/companies', data);
}

export function updateCompany(id: string, data: Record<string, unknown>) {
  return api.patch<Company>(`/companies/${id}`, data);
}
