import useSWR from 'swr';
import type { Certificate } from '@verihire/types';
import { API_URL } from '@/lib/constants';

export function useMyCertificates() {
  return useSWR<{ items: Certificate[]; pagination: { total: number } }>('/certificates');
}

export function useCertificate(id: string | undefined) {
  return useSWR<Certificate>(id ? `/certificates/${id}` : null);
}

export function useCertificateByNumber(certNumber: string | undefined) {
  return useSWR<Certificate>(certNumber ? `/certificates/number/${certNumber}` : null);
}

export function useVerifyCertificate(certNumber: string | undefined) {
  return useSWR(certNumber ? `/certificates/verify/${certNumber}` : null);
}

export function getCertificateDownloadUrl(id: string, format: 'pdf' | 'json' | 'image' = 'pdf') {
  return `${API_URL}/certificates/${id}/download?format=${format}`;
}
