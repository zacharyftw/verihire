'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Plus, Briefcase } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/empty-state';
import { useMyJobs } from '@/hooks/use-jobs';
import { ROUTES, JOB_STATUS_LABELS } from '@/lib/constants';
import { formatDate } from '@/lib/utils';

export default function JobsPage() {
  const [status, setStatus] = useState('');
  const { data, isLoading } = useMyJobs({ status: status || undefined });
  const jobs = data?.items || [];

  return (
    <div>
      <PageHeader
        title="My Jobs"
        description="Manage your job postings"
        action={
          <Button asChild>
            <Link href={ROUTES.jobNew}>
              <Plus className="mr-2 h-4 w-4" />
              Create Job
            </Link>
          </Button>
        }
      />

      <div className="mb-6">
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="DRAFT">Draft</SelectItem>
            <SelectItem value="ACTIVE">Active</SelectItem>
            <SelectItem value="PAUSED">Paused</SelectItem>
            <SelectItem value="CLOSED">Closed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <Skeleton className="h-16 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : !jobs.length ? (
        <EmptyState
          icon={Briefcase}
          title="No jobs yet"
          description="Create your first job posting"
          action={
            <Button asChild>
              <Link href={ROUTES.jobNew}>Create Job</Link>
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {jobs.map(job => (
            <Link key={job.id} href={ROUTES.jobDetail(job.id)}>
              <Card className="transition-shadow hover:shadow-md">
                <CardContent className="flex items-center justify-between p-4">
                  <div>
                    <p className="font-medium">{job.title}</p>
                    <div className="mt-1 flex gap-3 text-xs text-muted-foreground">
                      {job.locationCity && <span>{job.locationCity}</span>}
                      {job.employmentType && <span>{job.employmentType.replace('_', ' ')}</span>}
                      {job.publishedAt && <span>{formatDate(job.publishedAt)}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right text-xs text-muted-foreground">
                      <p>{job.viewsCount || 0} views</p>
                      <p>{job.applicationsCount || 0} applicants</p>
                    </div>
                    <Badge variant="secondary">{JOB_STATUS_LABELS[job.status] || job.status}</Badge>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
