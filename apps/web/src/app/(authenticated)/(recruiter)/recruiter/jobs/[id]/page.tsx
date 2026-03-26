'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, Play, Pause, Trash2, Users, BarChart3, Pencil, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Separator } from '@/components/ui/separator';
import { PageLoader } from '@/components/loading-spinner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { useRecruiterJob, publishJob, closeJob, deleteJob, updateJob } from '@/hooks/use-jobs';
import { jobSchema, type JobValues } from '@/lib/validations';
import { ROUTES, JOB_STATUS_LABELS } from '@/lib/constants';
import { toast } from '@/hooks/use-toast';
import { formatDate } from '@/lib/utils';

export default function JobDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { data: job, isLoading, mutate } = useRecruiterJob(id);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const canEdit = job?.status === 'DRAFT' || job?.status === 'PAUSED';

  const form = useForm<JobValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(jobSchema) as any,
  });

  function startEditing() {
    if (!job) return;
    form.reset({
      title: job.title ?? '',
      description: job.description ?? '',
      requirements: job.requirements ?? '',
      responsibilities: job.responsibilities ?? '',
      locationCity: job.locationCity ?? '',
      remotePolicy: job.remotePolicy ?? undefined,
      employmentType: job.employmentType ?? undefined,
      experienceLevel: job.experienceLevel ?? '',
      salaryMin: job.salaryMin ?? undefined,
      salaryMax: job.salaryMax ?? undefined,
      salaryCurrency: job.salaryCurrency ?? 'USD',
    });
    setEditing(true);
  }

  async function onSave(values: JobValues) {
    setSaving(true);
    try {
      await updateJob(id, values);
      await mutate();
      setEditing(false);
      toast({ title: 'Job updated' });
    } catch (err) {
      toast({
        title: 'Failed to update job',
        variant: 'destructive',
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setSaving(false);
    }
  }

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
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{JOB_STATUS_LABELS[job.status] || job.status}</Badge>
              {canEdit && !editing && (
                <Button variant="outline" size="sm" onClick={startEditing}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </Button>
              )}
              {editing && (
                <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
                  <X className="mr-2 h-4 w-4" />
                  Cancel
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {editing ? (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSave)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Job Title</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea rows={6} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="requirements"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Requirements</FormLabel>
                      <FormControl>
                        <Textarea rows={4} {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="responsibilities"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Responsibilities</FormLabel>
                      <FormControl>
                        <Textarea rows={4} {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="locationCity"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Location</FormLabel>
                        <FormControl>
                          <Input placeholder="San Francisco, CA" {...field} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="remotePolicy"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Remote Policy</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select..." />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="REMOTE">Remote</SelectItem>
                            <SelectItem value="HYBRID">Hybrid</SelectItem>
                            <SelectItem value="ONSITE">Onsite</SelectItem>
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="employmentType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Employment Type</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select..." />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="FULL_TIME">Full Time</SelectItem>
                            <SelectItem value="PART_TIME">Part Time</SelectItem>
                            <SelectItem value="CONTRACT">Contract</SelectItem>
                            <SelectItem value="INTERNSHIP">Internship</SelectItem>
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="experienceLevel"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Experience Level</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. Senior" {...field} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="salaryMin"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Salary Min</FormLabel>
                        <FormControl>
                          <Input type="number" {...field} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="salaryMax"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Salary Max</FormLabel>
                        <FormControl>
                          <Input type="number" {...field} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="salaryCurrency"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Currency</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>
                <div className="flex gap-3">
                  <Button type="submit" disabled={saving}>
                    {saving ? 'Saving...' : 'Save Changes'}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setEditing(false)}>
                    Cancel
                  </Button>
                </div>
              </form>
            </Form>
          ) : (
            <>
              {job.description && (
                <div>
                  <h3 className="mb-2 font-medium">Description</h3>
                  <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                    {job.description}
                  </p>
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
            </>
          )}

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
