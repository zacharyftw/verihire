'use client';

import { Briefcase, Users, Eye, TrendingUp } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/page-header';
import { useRecruiterDashboard } from '@/hooks/use-recruiter';

export default function RecruiterDashboardPage() {
  const { data, isLoading } = useRecruiterDashboard();

  const stats = [
    { label: 'Active Jobs', value: data?.activeJobs ?? 0, icon: Briefcase },
    { label: 'Total Candidates', value: data?.totalCandidates ?? 0, icon: Users },
    { label: 'Total Views', value: data?.totalViews ?? 0, icon: Eye },
    {
      label: 'Hire Rate',
      value: data?.hireRate ? `${Math.round(data.hireRate)}%` : '—',
      icon: TrendingUp,
    },
  ];

  return (
    <div>
      <PageHeader title="Recruiter Dashboard" description="Overview of your hiring activity" />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map(stat => (
          <Card key={stat.label}>
            <CardContent className="flex items-center gap-4 p-6">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <stat.icon className="h-5 w-5 text-primary" />
              </div>
              <div>
                {isLoading ? (
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
    </div>
  );
}
