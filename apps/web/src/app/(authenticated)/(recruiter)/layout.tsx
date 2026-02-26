'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { ROUTES } from '@/lib/constants';

export default function RecruiterLayout({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (user && user.userType !== 'RECRUITER') {
      router.push(ROUTES.candidateDashboard);
    }
  }, [user, router]);

  if (user && user.userType !== 'RECRUITER') return null;

  return <>{children}</>;
}
