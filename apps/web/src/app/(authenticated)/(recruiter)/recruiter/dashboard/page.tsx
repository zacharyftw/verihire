'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Briefcase, Users, UserCheck, TrendingUp, Plus, MapPin, Calendar } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/empty-state';
import { useRecruiterStats } from '@/hooks/use-recruiter';
import { useMyJobs } from '@/hooks/use-jobs';
import { ROUTES, JOB_STATUS_LABELS } from '@/lib/constants';
import { formatDate } from '@/lib/utils';

const JOB_STATUS_COLORS: Record<string, string> = {
  ACTIVE: 'bg-green-100 text-green-800',
  DRAFT: 'bg-gray-100 text-gray-800',
  PAUSED: 'bg-yellow-100 text-yellow-800',
  CLOSED: 'bg-red-100 text-red-800',
  FILLED: 'bg-purple-100 text-purple-800',
};

type JobRow = {
  id: string;
  title: string;
  status: string;
  locationCity?: string;
  remotePolicy?: string;
  createdAt: string;
  _count?: { applications: number };
  company?: { name: string };
};

export default function RecruiterDashboardPage() {
  const { data: statsData, isLoading: statsLoading } = useRecruiterStats();
  const { data: jobsData, isLoading: jobsLoading } = useMyJobs();
  const router = useRouter();

  const jobs: JobRow[] = (jobsData?.items ?? []) as unknown as JobRow[];

  const stats = [
    { label: 'Active Jobs', value: statsData?.activeJobs ?? 0, icon: Briefcase },
    { label: 'Total Applicants', value: statsData?.totalApplicants ?? 0, icon: Users },
    { label: 'Shortlisted', value: statsData?.shortlisted ?? 0, icon: UserCheck },
    {
      label: 'Hire Rate',
      value: statsData?.hireRate != null ? `${Math.round(statsData.hireRate)}%` : '\u2014',
      icon: TrendingUp,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Recruiter Dashboard"
        description="Overview of your hiring activity"
        action={
          <Button asChild>
            <Link href={ROUTES.jobNew}>
              <Plus className="mr-2 h-4 w-4" />
              Create Job
            </Link>
          </Button>
        }
      />

      {/* Stat Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map(stat => (
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

      {/* My Jobs Table */}
      <Card className="mt-8">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">My Jobs</CardTitle>
          <Button variant="ghost" size="sm" asChild>
            <Link href={ROUTES.jobs}>View all</Link>
          </Button>
        </CardHeader>
        <CardContent>
          {jobsLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : !jobs.length ? (
            <EmptyState
              icon={Briefcase}
              title="No jobs yet"
              description="Create your first job posting to start receiving applicants"
              action={
                <Button asChild>
                  <Link href={ROUTES.jobNew}>
                    <Plus className="mr-2 h-4 w-4" />
                    Create Job
                  </Link>
                </Button>
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">Job Title</th>
                    <th className="pb-2 pr-4 font-medium">Status</th>
                    <th className="pb-2 pr-4 font-medium">Location</th>
                    <th className="pb-2 pr-4 font-medium">Applicants</th>
                    <th className="pb-2 pr-4 font-medium">Posted</th>
                    <th className="pb-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {jobs.map(job => (
                    <tr
                      key={job.id}
                      className="group cursor-pointer transition-colors hover:bg-accent/50"
                      onClick={() => router.push(`/recruiter/jobs/${job.id}/applicants`)}
                    >
                      <td className="py-3 pr-4">
                        <p className="font-medium group-hover:underline">{job.title}</p>
                        {job.company?.name && (
                          <p className="text-xs text-muted-foreground">{job.company.name}</p>
                        )}
                      </td>
                      <td className="py-3 pr-4">
                        <Badge
                          className={JOB_STATUS_COLORS[job.status] || 'bg-gray-100 text-gray-800'}
                        >
                          {JOB_STATUS_LABELS[job.status] || job.status}
                        </Badge>
                      </td>
                      <td className="py-3 pr-4 text-muted-foreground">
                        {job.locationCity ? (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3 shrink-0" />
                            {job.locationCity}
                          </span>
                        ) : job.remotePolicy ? (
                          <span className="text-xs">{job.remotePolicy}</span>
                        ) : (
                          '\u2014'
                        )}
                      </td>
                      <td className="py-3 pr-4">
                        <span className="flex items-center gap-1">
                          <Users className="h-3 w-3 text-muted-foreground" />
                          {job._count?.applications ?? 0}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3 shrink-0" />
                          {formatDate(job.createdAt)}
                        </span>
                      </td>
                      <td className="py-3">
                        <div className="flex gap-2" onClick={e => e.stopPropagation()}>
                          <Button variant="outline" size="sm" asChild>
                            <Link href={ROUTES.jobDetail(job.id)}>Details</Link>
                          </Button>
                          <Button variant="ghost" size="sm" asChild>
                            <Link href={`/recruiter/jobs/${job.id}/applicants`}>Applicants</Link>
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
