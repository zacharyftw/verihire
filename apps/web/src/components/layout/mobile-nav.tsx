'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { X } from 'lucide-react';
import {
  LayoutDashboard,
  Code2,
  FileText,
  Award,
  User,
  MessageSquare,
  Mail,
  Briefcase,
  Building2,
  Search,
  BarChart3,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth-context';
import { ROUTES } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useUnreadMessages } from '@/hooks/use-messages';

const candidateNav = [
  { label: 'Dashboard', href: ROUTES.candidateDashboard, icon: LayoutDashboard },
  { label: 'Jobs', href: ROUTES.candidateJobs, icon: Briefcase },
  { label: 'Challenges', href: ROUTES.challenges, icon: Code2 },
  { label: 'Submissions', href: ROUTES.submissions, icon: FileText },
  { label: 'Certificates', href: ROUTES.certificates, icon: Award },
  { label: 'Reviews', href: ROUTES.reviews, icon: MessageSquare },
  { label: 'Messages', href: '/messages', icon: Mail },
  { label: 'Profile', href: ROUTES.profile, icon: User },
];

const recruiterNav = [
  { label: 'Dashboard', href: ROUTES.recruiterDashboard, icon: BarChart3 },
  { label: 'Company', href: ROUTES.company, icon: Building2 },
  { label: 'Jobs', href: ROUTES.jobs, icon: Briefcase },
  { label: 'Candidates', href: ROUTES.candidateSearch, icon: Search },
  { label: 'Messages', href: '/messages', icon: Mail },
];

interface MobileNavProps {
  open: boolean;
  onClose: () => void;
}

export function MobileNav({ open, onClose }: MobileNavProps) {
  const pathname = usePathname();
  const { user } = useAuth();
  const { data: unreadData } = useUnreadMessages();
  const unreadCount = unreadData?.unreadCount ?? 0;

  if (!open) return null;

  const navItems = user?.userType === 'RECRUITER' ? recruiterNav : candidateNav;

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="fixed left-0 top-0 h-full w-64 bg-card shadow-lg">
        <div className="flex h-16 items-center justify-between border-b px-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <span className="text-sm font-bold text-primary-foreground">V</span>
            </div>
            <span className="text-lg font-bold">VeriHire</span>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>
        <nav className="flex flex-col gap-1 p-4">
          {navItems.map(item => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
                {item.label === 'Messages' && unreadCount > 0 && (
                  <Badge className="ml-auto bg-primary px-1.5 py-0 text-xs text-primary-foreground">
                    {unreadCount}
                  </Badge>
                )}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
