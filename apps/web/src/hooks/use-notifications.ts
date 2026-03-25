import useSWR from 'swr';
import { api } from '@/lib/api';

export interface Notification {
  id: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  link: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

interface NotificationsResponse {
  data: Notification[];
  meta: { total: number; limit: number; offset: number; hasMore: boolean };
}

export function useNotifications(options?: {
  limit?: number;
  offset?: number;
  unreadOnly?: boolean;
}) {
  const params = new URLSearchParams();
  if (options?.limit) params.set('limit', String(options.limit));
  if (options?.offset) params.set('offset', String(options.offset));
  if (options?.unreadOnly) params.set('unreadOnly', 'true');
  const qs = params.toString();

  return useSWR<NotificationsResponse>(`/notifications${qs ? `?${qs}` : ''}`);
}

export function useUnreadCount() {
  return useSWR<{ count: number }>('/notifications/unread-count', {
    refreshInterval: 30000,
  });
}

export async function markAsRead(id: string) {
  return api.patch(`/notifications/${id}/read`);
}

export async function markAllAsRead() {
  return api.patch('/notifications/read-all');
}

export async function deleteNotification(id: string) {
  return api.delete(`/notifications/${id}`);
}
