'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { ROUTES } from '@/lib/constants';

export default function CandidateLayout({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (user && user.userType === 'RECRUITER') {
      router.push(ROUTES.recruiterDashboard);
    }
  }, [user, router]);

  if (user?.userType === 'RECRUITER') return null;

  return <>{children}</>;
}
