'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Play, Pause, Trash2, Users, BarChart3 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { PageLoader } from '@/components/loading-spinner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { useJob, publishJob, closeJob, deleteJob } from '@/hooks/use-jobs';
import { ROUTES, JOB_STATUS_LABELS } from '@/lib/constants';
import { toast } from '@/hooks/use-toast';
import { formatDate } from '@/lib/utils';

export default function JobDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { data: job, isLoading, mutate } = useJob(id);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  if (isLoading) return <PageLoader />;
  if (!job) return <div>Job not found</div>;

  async function handlePublish() {
    setActionLoading(true);
    try {
      await publishJob(id);
      await mutate();
      toast({ title: 'Job published' });
    } catch (err) {
      toast({
        title: 'Failed',
        variant: 'destructive',
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setActionLoading(false);
    }
  }

  async function handleClose() {
    setActionLoading(true);
    try {
      await closeJob(id);
      await mutate();
      toast({ title: 'Job closed' });
    } catch (err) {
      toast({
        title: 'Failed',
        variant: 'destructive',
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDelete() {
    setActionLoading(true);
    try {
      await deleteJob(id);
      toast({ title: 'Job deleted' });
      router.push(ROUTES.jobs);
    } catch (err) {
      toast({
        title: 'Failed',
        variant: 'destructive',
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setActionLoading(false);
      setDeleteOpen(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <Button variant="ghost" size="sm" className="mb-4" asChild>
        <Link href={ROUTES.jobs}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Jobs
        </Link>
      </Button>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle>{job.title}</CardTitle>
              <div className="mt-1 flex gap-2 text-sm text-muted-foreground">
                {job.locationCity && <span>{job.locationCity}</span>}
                {job.employmentType && <span>{job.employmentType.replace('_', ' ')}</span>}
              </div>
            </div>
            <Badge variant="secondary">{JOB_STATUS_LABELS[job.status] || job.status}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {job.description && (
            <div>
              <h3 className="mb-2 font-medium">Description</h3>
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">{job.description}</p>
            </div>
          )}

          <div className="flex flex-wrap gap-4 text-sm">
            {job.salaryMin && job.salaryMax && (
              <span>
                {job.salaryCurrency} {job.salaryMin.toLocaleString()} -{' '}
                {job.salaryMax.toLocaleString()}
              </span>
            )}
            {job.remotePolicy && <span>Remote: {job.remotePolicy}</span>}
            {job.publishedAt && <span>Published: {formatDate(job.publishedAt)}</span>}
          </div>

          <Separator />

          <div className="flex flex-wrap gap-3">
            <Button variant="outline" asChild>
              <Link href={ROUTES.jobShortlist(id)}>
                <Users className="mr-2 h-4 w-4" />
                Shortlist
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href={ROUTES.jobMatches(id)}>
                <BarChart3 className="mr-2 h-4 w-4" />
                AI Matches
              </Link>
            </Button>

            {(job.status === 'DRAFT' || job.status === 'PAUSED') && (
              <Button onClick={handlePublish} disabled={actionLoading}>
                <Play className="mr-2 h-4 w-4" />
                Publish
              </Button>
            )}
            {job.status === 'ACTIVE' && (
              <Button variant="outline" onClick={handleClose} disabled={actionLoading}>
                <Pause className="mr-2 h-4 w-4" />
                Close
              </Button>
            )}
            <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
          </div>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete Job"
        description="This will permanently delete this job posting. This action cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleDelete}
        loading={actionLoading}
      />
    </div>
  );
}
