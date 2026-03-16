'use client';

import Link from 'next/link';
import { Award, Code2, FileText, TrendingUp, CheckCircle2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/empty-state';
import { useAuth } from '@/lib/auth-context';
import { useCandidateStats, useDomainScores, useCandidateProfile } from '@/hooks/use-candidate';
import { useRecommendedChallenges } from '@/hooks/use-challenges';
import { useMySubmissions } from '@/hooks/use-submissions';
import {
  ROUTES,
  DIFFICULTY_COLORS,
  SUBMISSION_STATUS_LABELS,
  SUBMISSION_STATUS_COLORS,
} from '@/lib/constants';
import { StatusBadge } from '@/components/status-badge';

export default function CandidateDashboardPage() {
  const { user } = useAuth();
  const { data: stats, isLoading: statsLoading } = useCandidateStats();
  const { data: profile } = useCandidateProfile();
  const { data: domainScores, isLoading: domainLoading } = useDomainScores(profile?.id);
  const { data: challenges } = useRecommendedChallenges();
  const { data: submissions } = useMySubmissions({ limit: 5 });

  const statCards = [
    { label: 'Challenges Completed', value: stats?.challengesCompleted ?? 0, icon: Code2 },
    {
      label: 'Average Score',
      value: stats?.averageScore ? `${Math.round(stats.averageScore)}%` : '—',
      icon: TrendingUp,
    },
    { label: 'Certificates', value: stats?.certificatesCount ?? 0, icon: Award },
    { label: 'Submissions', value: stats?.submissionsCount ?? 0, icon: FileText },
  ];

  return (
    <div>
      <PageHeader
        title={`Welcome back, ${user?.firstName || 'there'}!`}
        description="Here's an overview of your progress"
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map(stat => (
          <Card key={stat.label}>
            <CardContent className="flex items-center gap-4 p-6">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <stat.icon className="h-5 w-5 text-primary" />
              </div>
              <div>
                {statsLoading ? (
                  <Skeleton className="h-7 w-16" />
                ) : (
                  <p className="text-2xl font-bold">{stat.value}</p>
                )}
                <p className="text-xs text-muted-foreground">{stat.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="mt-8">
        <CardHeader>
          <CardTitle className="text-lg">Domain Progress</CardTitle>
        </CardHeader>
        <CardContent>
          {domainLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map(i => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : !domainScores?.domains || Object.keys(domainScores.domains).length === 0 ? (
            <EmptyState
              title="No domain scores yet"
              description="Complete challenges to build your domain scores"
            />
          ) : (
            <div className="space-y-4">
              {Object.entries(domainScores.domains).map(([name, domain]) => (
                <div key={name} className="rounded-lg border p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">{name}</p>
                      <Badge variant="secondary">{domain.level}</Badge>
                      {domain.score >= 70 && domain.count >= 3 && (
                        <Badge className="bg-green-600 text-white hover:bg-green-600">
                          <CheckCircle2 className="mr-1 h-3 w-3" />
                          Certified
                        </Badge>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold">{Math.round(domain.score)}%</p>
                      <p className="text-xs text-muted-foreground">
                        {domain.count} challenge{domain.count !== 1 ? 's' : ''} completed
                      </p>
                    </div>
                  </div>
                  <div className="h-2 w-full rounded-full bg-secondary">
                    <div
                      className="h-2 rounded-full bg-primary transition-all"
                      style={{ width: `${Math.min(100, Math.round(domain.score))}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Recommended Challenges</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link href={ROUTES.challenges}>View all</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {!challenges?.length ? (
              <EmptyState
                title="No recommendations yet"
                description="Complete more challenges to get personalized recommendations"
              />
            ) : (
              <div className="space-y-3">
                {challenges.slice(0, 5).map(c => (
                  <Link
                    key={c.id}
                    href={ROUTES.challengeDetail(c.id)}
                    className="flex items-center justify-between rounded-lg border p-3 transition-colors hover:bg-accent"
                  >
                    <div>
                      <p className="text-sm font-medium">{c.title}</p>
                      <p className="text-xs text-muted-foreground">{c.skill?.name || 'General'}</p>
                    </div>
                    {c.difficulty && (
                      <Badge variant="secondary" className={DIFFICULTY_COLORS[c.difficulty]}>
                        {c.difficulty}
                      </Badge>
                    )}
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Recent Submissions</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link href={ROUTES.submissions}>View all</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {!submissions?.items?.length ? (
              <EmptyState
                title="No submissions yet"
                description="Start a challenge to make your first submission"
              />
            ) : (
              <div className="space-y-3">
                {submissions.items.map(s => (
                  <Link
                    key={s.id}
                    href={ROUTES.submissionResults(s.id)}
                    className="flex items-center justify-between rounded-lg border p-3 transition-colors hover:bg-accent"
                  >
                    <div>
                      <p className="text-sm font-medium">{s.challenge?.title || 'Challenge'}</p>
                      <p className="text-xs text-muted-foreground">
                        {(s.finalScore ?? s.aiScore) != null
                          ? `Score: ${Math.round(s.finalScore ?? s.aiScore!)}%`
                          : 'Pending'}
                      </p>
                    </div>
                    <StatusBadge
                      status={s.status}
                      labels={SUBMISSION_STATUS_LABELS}
                      colors={SUBMISSION_STATUS_COLORS}
                    />
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
