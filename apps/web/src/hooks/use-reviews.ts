import useSWR from 'swr';
import { api } from '@/lib/api';

export function usePendingReviews(
  filters: { skillId?: string; limit?: number; offset?: number } = {}
) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, val]) => {
    if (val !== undefined && val !== '') params.set(key, String(val));
  });
  const qs = params.toString();
  return useSWR(`/reviews/pending${qs ? `?${qs}` : ''}`);
}

export function useReview(reviewId: string | undefined) {
  return useSWR(reviewId ? `/reviews/${reviewId}` : null);
}

export function useMyReviewStats() {
  return useSWR('/reviews/me/stats');
}

export function submitReview(reviewId: string, data: Record<string, unknown>) {
  return api.post(`/reviews/${reviewId}/submit`, data);
}
