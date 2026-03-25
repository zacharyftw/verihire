'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
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
import { useUnreadMessages } from '@/hooks/use-messages';
import { Badge } from '@/components/ui/badge';

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
}

const candidateNav: NavItem[] = [
  { label: 'Dashboard', href: ROUTES.candidateDashboard, icon: LayoutDashboard },
  { label: 'Jobs', href: ROUTES.candidateJobs, icon: Briefcase },
  { label: 'Challenges', href: ROUTES.challenges, icon: Code2 },
  { label: 'Submissions', href: ROUTES.submissions, icon: FileText },
  { label: 'Certificates', href: ROUTES.certificates, icon: Award },
  { label: 'Reviews', href: ROUTES.reviews, icon: MessageSquare },
  { label: 'Messages', href: '/messages', icon: Mail },
  { label: 'Profile', href: ROUTES.profile, icon: User },
];

const recruiterNav: NavItem[] = [
  { label: 'Dashboard', href: ROUTES.recruiterDashboard, icon: BarChart3 },
  { label: 'Company', href: ROUTES.company, icon: Building2 },
  { label: 'Jobs', href: ROUTES.jobs, icon: Briefcase },
  { label: 'Candidates', href: ROUTES.candidateSearch, icon: Search },
  { label: 'Messages', href: '/messages', icon: Mail },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user } = useAuth();
  const { data: unreadData } = useUnreadMessages();
  const unreadCount = unreadData?.unreadCount ?? 0;

  const navItems = user?.userType === 'RECRUITER' ? recruiterNav : candidateNav;

  return (
    <aside className="hidden w-64 shrink-0 border-r bg-card lg:block">
      <div className="flex h-16 items-center gap-2 border-b px-6">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
          <span className="text-sm font-bold text-primary-foreground">V</span>
        </div>
        <span className="text-lg font-bold">VeriHire</span>
      </div>
      <nav className="flex flex-col gap-1 p-4">
        {navItems.map(item => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link
              key={item.href}
              href={item.href}
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
    </aside>
  );
}
