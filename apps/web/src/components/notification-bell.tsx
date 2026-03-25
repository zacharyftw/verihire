'use client';

import { useRouter } from 'next/navigation';
import { Bell, Briefcase, CheckCircle, XCircle, Trophy, Star, FileText, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  useNotifications,
  useUnreadCount,
  markAsRead,
  markAllAsRead,
  type Notification,
} from '@/hooks/use-notifications';
import { cn } from '@/lib/utils';

const typeIcons: Record<string, React.ElementType> = {
  APPLICATION_RECEIVED: Briefcase,
  APPLICATION_STATUS: FileText,
  APPLICATION_COMPLETED: CheckCircle,
  CHALLENGE_GENERATED: FileText,
  SHORTLISTED: Star,
  REJECTED: XCircle,
  HIRED: Trophy,
  GENERAL: Info,
};

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function NotificationItem({
  notification,
  onRead,
}: {
  notification: Notification;
  onRead: (n: Notification) => void;
}) {
  const Icon = typeIcons[notification.type] || Info;

  return (
    <button
      className={cn(
        'flex w-full items-start gap-3 rounded-md px-3 py-2.5 text-left text-sm transition-colors hover:bg-accent',
        !notification.read && 'bg-primary/5'
      )}
      onClick={() => onRead(notification)}
    >
      <div
        className={cn(
          'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
          !notification.read ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
        )}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className={cn('truncate text-sm', !notification.read && 'font-medium')}>
            {notification.title}
          </p>
          {!notification.read && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />}
        </div>
        <p className="truncate text-xs text-muted-foreground">{notification.message}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{timeAgo(notification.createdAt)}</p>
      </div>
    </button>
  );
}

export function NotificationBell() {
  const router = useRouter();
  const { data: unreadData, mutate: mutateCount } = useUnreadCount();
  const { data: notifData, mutate: mutateNotifs } = useNotifications({ limit: 10 });

  const unreadCount = unreadData?.count ?? 0;
  const notifications = notifData?.data ?? [];

  async function handleRead(notification: Notification) {
    if (!notification.read) {
      await markAsRead(notification.id);
      mutateCount();
      mutateNotifs();
    }
    if (notification.link) {
      router.push(notification.link);
    }
  }

  async function handleMarkAllRead() {
    await markAllAsRead();
    mutateCount();
    mutateNotifs();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-80" align="end" forceMount>
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>Notifications</span>
          {unreadCount > 0 && (
            <button
              className="text-xs font-normal text-primary hover:underline"
              onClick={handleMarkAllRead}
            >
              Mark all as read
            </button>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <div className="max-h-80 overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">
              No notifications yet
            </div>
          ) : (
            notifications.map(n => (
              <NotificationItem key={n.id} notification={n} onRead={handleRead} />
            ))
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
