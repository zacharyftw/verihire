'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { decodeJwt } from 'jose';
import { setTokens } from '@/lib/api';
import { ROUTES } from '@/lib/constants';

export default function OAuthCallbackPage() {
  return (
    <Suspense>
      <OAuthCallbackInner />
    </Suspense>
  );
}

function OAuthCallbackInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const accessToken = searchParams.get('accessToken');
    const refreshToken = searchParams.get('refreshToken');
    const error = searchParams.get('error');

    if (error) {
      router.replace(`${ROUTES.login}?error=${error}`);
      return;
    }

    if (accessToken && refreshToken) {
      setTokens(accessToken, refreshToken);
      const payload = decodeJwt(accessToken);
      const userType = payload?.userType as string | undefined;
      router.replace(
        userType === 'RECRUITER' ? ROUTES.recruiterDashboard : ROUTES.candidateDashboard
      );
    } else {
      router.replace(ROUTES.login);
    }
  }, [router, searchParams]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <p className="mt-4 text-sm text-muted-foreground">Signing you in...</p>
      </div>
    </div>
  );
}
