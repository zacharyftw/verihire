import useSWR from 'swr';
import { api } from '@/lib/api';

export interface ConversationParticipant {
  userId: string;
  firstName: string | null;
  lastName: string | null;
  userType: string;
  avatarUrl: string | null;
}

export interface ConversationPreview {
  id: string;
  jobApplication: {
    id: string;
    jobTitle: string;
    jobId: string;
  } | null;
  otherParticipant: ConversationParticipant | null;
  lastMessage: {
    id: string;
    content: string;
    createdAt: string;
    senderId: string;
    senderName: string;
  } | null;
  unreadCount: number;
  updatedAt: string;
}

export interface MessageSender {
  id: string;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
  userType: string;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  createdAt: string;
  editedAt: string | null;
  sender: MessageSender;
}

export interface ConversationDetail {
  id: string;
  jobApplication: {
    id: string;
    jobTitle: string;
    jobId: string;
  } | null;
  otherParticipant: MessageSender | null;
}

export interface MessagesResponse {
  messages: Message[];
  conversation: ConversationDetail | null;
  hasMore: boolean;
}

export function useConversations() {
  return useSWR<ConversationPreview[]>('/messages/conversations', {
    refreshInterval: 15000,
  });
}

export function useMessages(conversationId: string | null) {
  return useSWR<MessagesResponse>(
    conversationId ? `/messages/conversations/${conversationId}` : null,
    {
      refreshInterval: 5000,
    }
  );
}

export function useUnreadMessages() {
  return useSWR<{ unreadCount: number }>('/messages/unread-count', {
    refreshInterval: 30000,
  });
}

export function sendMessage(conversationId: string, content: string) {
  return api.post<Message>(`/messages/conversations/${conversationId}`, { content });
}

export function startConversation(
  userId?: string,
  jobApplicationId?: string,
  candidateProfileId?: string
) {
  return api.post<{ id: string }>('/messages/conversations', {
    userId,
    jobApplicationId,
    candidateProfileId,
  });
}

export function markConversationRead(id: string) {
  return api.patch(`/messages/conversations/${id}/read`);
}
