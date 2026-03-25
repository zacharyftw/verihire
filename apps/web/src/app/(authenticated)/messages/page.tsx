'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { ArrowLeft, Send, MessageSquare, Briefcase } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/empty-state';
import { useAuth } from '@/lib/auth-context';
import { cn } from '@/lib/utils';
import { formatRelativeTime } from '@/lib/utils';
import {
  useConversations,
  useMessages,
  sendMessage,
  markConversationRead,
  type ConversationPreview,
} from '@/hooks/use-messages';
import { toast } from '@/hooks/use-toast';

function getInitials(firstName: string | null, lastName: string | null): string {
  const f = firstName?.[0] || '';
  const l = lastName?.[0] || '';
  return (f + l).toUpperCase() || '?';
}

function getRoleLabel(userType: string): string {
  switch (userType) {
    case 'RECRUITER':
      return 'Recruiter';
    case 'CANDIDATE':
      return 'Candidate';
    default:
      return userType;
  }
}

function ConversationListItem({
  conversation,
  isSelected,
  currentUserId,
  onClick,
}: {
  conversation: ConversationPreview;
  isSelected: boolean;
  currentUserId: string;
  onClick: () => void;
}) {
  const other = conversation.otherParticipant;
  const name = other
    ? `${other.firstName || ''} ${other.lastName || ''}`.trim() || 'Unknown'
    : 'Unknown';
  const lastMsg = conversation.lastMessage;
  const isOwnLastMsg = lastMsg?.senderId === currentUserId;

  return (
    <button
      onClick={onClick}
      className={cn(
        'flex w-full items-start gap-3 rounded-lg p-3 text-left transition-colors',
        isSelected ? 'bg-primary/10' : 'hover:bg-accent'
      )}
    >
      <Avatar className="h-10 w-10 shrink-0">
        <AvatarFallback className="text-xs">
          {getInitials(other?.firstName ?? null, other?.lastName ?? null)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-medium">{name}</span>
          {lastMsg && (
            <span className="shrink-0 text-xs text-muted-foreground">
              {formatRelativeTime(lastMsg.createdAt)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Badge variant="outline" className="px-1 py-0 text-[10px]">
            {getRoleLabel(other?.userType || '')}
          </Badge>
          {conversation.jobApplication && (
            <span className="truncate text-xs text-muted-foreground">
              {conversation.jobApplication.jobTitle}
            </span>
          )}
        </div>
        {lastMsg && (
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {isOwnLastMsg ? 'You: ' : ''}
            {lastMsg.content}
          </p>
        )}
      </div>
      {conversation.unreadCount > 0 && (
        <Badge className="shrink-0 bg-primary px-1.5 py-0.5 text-xs text-primary-foreground">
          {conversation.unreadCount}
        </Badge>
      )}
    </button>
  );
}

function ConversationList({
  conversations,
  selectedId,
  currentUserId,
  isLoading,
  onSelect,
}: {
  conversations: ConversationPreview[];
  selectedId: string | null;
  currentUserId: string;
  isLoading: boolean;
  onSelect: (id: string) => void;
}) {
  if (isLoading) {
    return (
      <div className="space-y-2 p-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-start gap-3">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!conversations.length) {
    return (
      <EmptyState
        icon={MessageSquare}
        title="No conversations"
        description="Start messaging by clicking 'Message' on an applicant"
        className="py-16"
      />
    );
  }

  return (
    <div className="space-y-1 p-2">
      {conversations.map(conv => (
        <ConversationListItem
          key={conv.id}
          conversation={conv}
          isSelected={conv.id === selectedId}
          currentUserId={currentUserId}
          onClick={() => onSelect(conv.id)}
        />
      ))}
    </div>
  );
}

function MessageThread({
  conversationId,
  currentUserId,
  onBack,
}: {
  conversationId: string;
  currentUserId: string;
  onBack?: () => void;
}) {
  const { data, isLoading, mutate } = useMessages(conversationId);
  const [messageText, setMessageText] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const prevMessageCount = useRef(0);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    const currentCount = data?.messages?.length ?? 0;
    if (currentCount > prevMessageCount.current) {
      scrollToBottom();
    }
    prevMessageCount.current = currentCount;
  }, [data?.messages?.length, scrollToBottom]);

  // Mark as read on mount
  useEffect(() => {
    markConversationRead(conversationId).catch(() => {});
  }, [conversationId]);

  async function handleSend() {
    if (!messageText.trim() || sending) return;

    setSending(true);
    try {
      await sendMessage(conversationId, messageText.trim());
      setMessageText('');
      await mutate();
    } catch (err) {
      toast({
        title: 'Failed to send message',
        variant: 'destructive',
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  const messages = data?.messages ?? [];
  const otherParticipant = data?.conversation?.otherParticipant;
  const jobApplication = data?.conversation?.jobApplication;

  const otherName = otherParticipant
    ? `${otherParticipant.firstName || ''} ${otherParticipant.lastName || ''}`.trim() || 'Unknown'
    : 'Unknown';

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 border-b px-4 py-3">
        {onBack && (
          <Button variant="ghost" size="icon" onClick={onBack} className="lg:hidden">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        )}
        <Avatar className="h-8 w-8">
          <AvatarFallback className="text-xs">
            {getInitials(otherParticipant?.firstName ?? null, otherParticipant?.lastName ?? null)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{otherName}</p>
          <div className="flex items-center gap-2">
            {otherParticipant && (
              <span className="text-xs text-muted-foreground">
                {getRoleLabel(otherParticipant.userType)}
              </span>
            )}
            {jobApplication && (
              <>
                <span className="text-xs text-muted-foreground">-</span>
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Briefcase className="h-3 w-3" />
                  {jobApplication.jobTitle}
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4">
        {isLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className={cn('flex', i % 2 === 0 ? 'justify-start' : 'justify-end')}>
                <Skeleton className="h-12 w-48 rounded-lg" />
              </div>
            ))}
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-muted-foreground">
              No messages yet. Send a message to start the conversation.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map(msg => {
              const isOwn = msg.senderId === currentUserId;
              return (
                <div key={msg.id} className={cn('flex', isOwn ? 'justify-end' : 'justify-start')}>
                  <div
                    className={cn(
                      'max-w-[75%] rounded-lg px-3 py-2',
                      isOwn ? 'bg-primary text-primary-foreground' : 'bg-muted'
                    )}
                  >
                    <p className="whitespace-pre-wrap break-words text-sm">{msg.content}</p>
                    <p
                      className={cn(
                        'mt-1 text-[10px]',
                        isOwn ? 'text-primary-foreground/70' : 'text-muted-foreground'
                      )}
                    >
                      {formatRelativeTime(msg.createdAt)}
                    </p>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <Separator />
      <div className="flex items-center gap-2 p-3">
        <Input
          placeholder="Type a message..."
          value={messageText}
          onChange={e => setMessageText(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={sending}
          className="flex-1"
        />
        <Button size="icon" onClick={handleSend} disabled={!messageText.trim() || sending}>
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export default function MessagesPage() {
  const { user } = useAuth();
  const { data: conversations, isLoading } = useConversations();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileShowThread, setMobileShowThread] = useState(false);

  const currentUserId = user?.id || '';

  function handleSelectConversation(id: string) {
    setSelectedId(id);
    setMobileShowThread(true);
  }

  function handleBack() {
    setMobileShowThread(false);
  }

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold tracking-tight">Messages</h1>

      <Card className="overflow-hidden" style={{ height: 'calc(100vh - 180px)' }}>
        <div className="flex h-full">
          {/* Left panel — conversation list */}
          <div
            className={cn(
              'h-full w-full flex-col border-r lg:flex lg:w-80',
              mobileShowThread ? 'hidden' : 'flex'
            )}
          >
            <div className="border-b px-4 py-3">
              <h2 className="text-sm font-semibold">Conversations</h2>
            </div>
            <div className="flex-1 overflow-y-auto">
              <ConversationList
                conversations={conversations ?? []}
                selectedId={selectedId}
                currentUserId={currentUserId}
                isLoading={isLoading}
                onSelect={handleSelectConversation}
              />
            </div>
          </div>

          {/* Right panel — message thread */}
          <div
            className={cn('h-full flex-1 flex-col', mobileShowThread ? 'flex' : 'hidden lg:flex')}
          >
            {selectedId ? (
              <MessageThread
                key={selectedId}
                conversationId={selectedId}
                currentUserId={currentUserId}
                onBack={handleBack}
              />
            ) : (
              <div className="flex h-full items-center justify-center">
                <EmptyState
                  icon={MessageSquare}
                  title="Select a conversation"
                  description="Choose a conversation from the list to start messaging"
                />
              </div>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
