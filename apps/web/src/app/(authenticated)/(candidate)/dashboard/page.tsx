'use client';

import Link from 'next/link';
import {
  Award,
  Briefcase,
  Code2,
  FileText,
  TrendingUp,
  CheckCircle2,
  ExternalLink,
} from 'lucide-react';
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
import { useMyCertificates } from '@/hooks/use-certificates';
import { useMyApplications } from '@/hooks/use-applications';
import {
  ROUTES,
  DIFFICULTY_COLORS,
  SUBMISSION_STATUS_LABELS,
  SUBMISSION_STATUS_COLORS,
  APPLICATION_STATUS_LABELS,
  APPLICATION_STATUS_COLORS,
} from '@/lib/constants';
import { StatusBadge } from '@/components/status-badge';

export default function CandidateDashboardPage() {
  const { user } = useAuth();
  const { data: stats, isLoading: statsLoading } = useCandidateStats();
  const { data: profile } = useCandidateProfile();
  const { data: domainScores, isLoading: domainLoading } = useDomainScores(profile?.id);
  const { data: challenges } = useRecommendedChallenges();
  const { data: submissions, isLoading: submissionsLoading } = useMySubmissions({ limit: 10 });
  const { data: certificatesData, isLoading: certsLoading } = useMyCertificates();
  const { data: applications, isLoading: applicationsLoading } = useMyApplications();

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

  const certificates = certificatesData?.certificates ?? [];
  const avgScore = stats?.averageScore ?? null;
  const challengesCompleted = stats?.challengesCompleted ?? 0;
  const scoreBelowThreshold = challengesCompleted > 0 && avgScore !== null && avgScore < 70;

  return (
    <div>
      <PageHeader
        title={`Welcome back, ${user?.firstName || 'there'}!`}
        description="Here's an overview of your progress"
        action={
          <Button asChild>
            <Link href={ROUTES.candidateJobs}>
              <Briefcase className="mr-2 h-4 w-4" />
              Browse Jobs
            </Link>
          </Button>
        }
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

      {/* My Applications */}
      <Card className="mt-8">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">My Applications</CardTitle>
          <Button variant="ghost" size="sm" asChild>
            <Link href={ROUTES.candidateJobs}>Browse Jobs</Link>
          </Button>
        </CardHeader>
        <CardContent>
          {applicationsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : !applications?.length ? (
            <EmptyState
              icon={Briefcase}
              title="No applications yet"
              description="Browse jobs and apply to get started"
              action={
                <Button variant="outline" size="sm" asChild>
                  <Link href={ROUTES.candidateJobs}>Browse Jobs</Link>
                </Button>
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">Job</th>
                    <th className="pb-2 pr-4 font-medium">Company</th>
                    <th className="pb-2 pr-4 font-medium">Status</th>
                    <th className="pb-2 pr-4 font-medium">Applied</th>
                    <th className="pb-2 pr-4 font-medium">Score</th>
                    <th className="pb-2 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {applications.map(app => (
                    <tr key={app.id}>
                      <td className="py-3 pr-4 font-medium">{app.job.title}</td>
                      <td className="py-3 pr-4 text-muted-foreground">{app.job.company.name}</td>
                      <td className="py-3 pr-4">
                        <StatusBadge
                          status={app.status}
                          labels={APPLICATION_STATUS_LABELS}
                          colors={APPLICATION_STATUS_COLORS}
                        />
                      </td>
                      <td className="py-3 pr-4 text-muted-foreground">
                        {new Date(app.appliedAt).toLocaleDateString()}
                      </td>
                      <td className="py-3 pr-4 font-medium">
                        {app.averageScore != null ? `${Math.round(app.averageScore)}%` : '—'}
                      </td>
                      <td className="py-3">
                        {app.status === 'TESTING' ? (
                          <Button variant="ghost" size="sm" asChild>
                            <Link href={ROUTES.challenges}>Challenges</Link>
                          </Button>
                        ) : (
                          <Button variant="ghost" size="sm" asChild>
                            <Link href={ROUTES.candidateJobDetail(app.jobId)}>View</Link>
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Certificates */}
      <Card className="mt-8">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">My Certifications</CardTitle>
          <Button variant="ghost" size="sm" asChild>
            <Link href={ROUTES.certificates}>View all</Link>
          </Button>
        </CardHeader>
        <CardContent>
          {certsLoading ? (
            <div className="space-y-3">
              {[1, 2].map(i => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : !certificates.length && scoreBelowThreshold ? (
            <div className="flex items-start gap-3 rounded-lg border border-yellow-200 bg-yellow-50 p-4">
              <TrendingUp className="mt-0.5 h-5 w-5 shrink-0 text-yellow-600" />
              <div>
                <p className="text-sm font-medium text-yellow-800">
                  Score too low for a certificate
                </p>
                <p className="mt-0.5 text-xs text-yellow-700">
                  Your current average is{' '}
                  <span className="font-bold">{Math.round(avgScore!)}%</span>. You need at least{' '}
                  <span className="font-bold">70%</span> across all challenges to earn a
                  certificate. Keep practicing to improve your score!
                </p>
              </div>
            </div>
          ) : !certificates.length ? (
            <EmptyState
              icon={Award}
              title="No certificates yet"
              description="Complete all your challenges with a score ≥ 70% to earn a certificate"
            />
          ) : (
            <div className="space-y-3">
              {certificates.map(cert => (
                <div
                  key={cert.id}
                  className="flex items-center justify-between rounded-lg border p-4"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-green-100">
                      <Award className="h-4 w-4 text-green-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">
                        {(cert as any).metadata?.title ??
                          cert.skill?.name ??
                          cert.challenge?.title ??
                          'Certificate'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        #{cert.certificateNumber} &middot; Issued{' '}
                        {new Date(cert.issuedAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="text-sm font-bold">{Math.round(cert.finalScore)}%</p>
                      <Badge
                        variant="secondary"
                        className="bg-green-100 text-green-700 hover:bg-green-100"
                      >
                        {cert.grade}
                      </Badge>
                    </div>
                    <Button variant="ghost" size="icon" asChild>
                      <Link href={`/verify/${cert.certificateNumber}`} target="_blank">
                        <ExternalLink className="h-4 w-4" />
                      </Link>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Domain Progress */}
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

      {/* All Exam Attempts */}
      <Card className="mt-8">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Exam Attempts</CardTitle>
          <Button variant="ghost" size="sm" asChild>
            <Link href={ROUTES.submissions}>View all</Link>
          </Button>
        </CardHeader>
        <CardContent>
          {submissionsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : !submissions?.items?.length ? (
            <EmptyState
              title="No attempts yet"
              description="Start a challenge to make your first submission"
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">Challenge</th>
                    <th className="pb-2 pr-4 font-medium">Skill</th>
                    <th className="pb-2 pr-4 font-medium">Score</th>
                    <th className="pb-2 pr-4 font-medium">Status</th>
                    <th className="pb-2 font-medium">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {submissions.items.map(s => (
                    <tr key={s.id} className="group">
                      <td className="py-3 pr-4">
                        <Link
                          href={ROUTES.submissionResults(s.id)}
                          className="font-medium hover:underline"
                        >
                          {s.challenge?.title || 'Challenge'}
                        </Link>
                      </td>
                      <td className="py-3 pr-4 text-muted-foreground">
                        {(s.challenge as { skill?: { name: string } })?.skill?.name || '—'}
                      </td>
                      <td className="py-3 pr-4 font-medium">
                        {(s.finalScore ?? s.aiScore) != null
                          ? `${Math.round(s.finalScore ?? s.aiScore!)}%`
                          : '—'}
                      </td>
                      <td className="py-3 pr-4">
                        <StatusBadge
                          status={s.status}
                          labels={SUBMISSION_STATUS_LABELS}
                          colors={SUBMISSION_STATUS_COLORS}
                        />
                      </td>
                      <td className="py-3 text-muted-foreground">
                        {s.submittedAt
                          ? new Date(s.submittedAt).toLocaleDateString()
                          : new Date(s.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bottom row */}
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
                {submissions.items.slice(0, 5).map(s => (
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
