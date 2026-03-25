'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, MapPin, Clock, UserCheck, XCircle, Users, Mail } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PageLoader } from '@/components/loading-spinner';
import { EmptyState } from '@/components/empty-state';
import { useJob } from '@/hooks/use-jobs';
import { useJobApplicants, updateApplication, type JobApplication } from '@/hooks/use-recruiter';
import { ROUTES } from '@/lib/constants';
import { toast } from '@/hooks/use-toast';
import { startConversation } from '@/hooks/use-messages';
import { formatDate } from '@/lib/utils';

const APPLICATION_STATUS_COLORS: Record<string, string> = {
  APPLIED: 'bg-blue-100 text-blue-800',
  TESTING: 'bg-yellow-100 text-yellow-800',
  COMPLETED: 'bg-green-100 text-green-800',
  REVIEWED: 'bg-teal-100 text-teal-800',
  SHORTLISTED: 'bg-emerald-100 text-emerald-800',
  REJECTED: 'bg-red-100 text-red-800',
  HIRED: 'bg-purple-100 text-purple-800',
};

const APPLICATION_STATUS_LABELS: Record<string, string> = {
  APPLIED: 'Applied',
  TESTING: 'Testing',
  COMPLETED: 'Completed',
  REVIEWED: 'Reviewed',
  SHORTLISTED: 'Shortlisted',
  REJECTED: 'Rejected',
  HIRED: 'Hired',
};

function ScoreIndicator({ score }: { score: number }) {
  const color = score >= 80 ? 'text-green-600' : score >= 60 ? 'text-yellow-600' : 'text-red-600';
  const bg = score >= 80 ? 'bg-green-100' : score >= 60 ? 'bg-yellow-100' : 'bg-red-100';

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${color} ${bg}`}
    >
      {Math.round(score)}%
    </span>
  );
}

export default function JobApplicantsPage() {
  const params = useParams();
  const router = useRouter();
  const jobId = params.id as string;
  const { data: job, isLoading: jobLoading } = useJob(jobId);
  const [statusFilter, setStatusFilter] = useState('all');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [messagingId, setMessagingId] = useState<string | null>(null);

  const {
    data: applicantsData,
    isLoading: applicantsLoading,
    mutate,
  } = useJobApplicants(jobId, statusFilter !== 'all' ? statusFilter : undefined);

  const applicants: JobApplication[] = applicantsData?.items ?? [];
  const total = applicantsData?.meta?.total ?? 0;

  async function handleStatusUpdate(applicationId: string, status: string) {
    setActionLoading(applicationId);
    try {
      await updateApplication(jobId, applicationId, { status });
      await mutate();
      toast({ title: `Application ${status.toLowerCase()}` });
    } catch (err) {
      toast({
        title: 'Failed to update',
        variant: 'destructive',
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setActionLoading(null);
    }
  }

  async function handleMessage(applicationId: string, candidateProfileId: string) {
    setMessagingId(applicationId);
    try {
      await startConversation(undefined, applicationId, candidateProfileId);
      router.push('/messages');
    } catch (err) {
      toast({
        title: 'Failed to start conversation',
        variant: 'destructive',
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setMessagingId(null);
    }
  }

  if (jobLoading) return <PageLoader />;

  return (
    <div>
      {/* Header */}
      <div className="mb-4 flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href={ROUTES.recruiterDashboard}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Dashboard
          </Link>
        </Button>
        {job && <span className="text-sm text-muted-foreground">{job.title}</span>}
      </div>

      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Applicants{total > 0 ? ` (${total})` : ''}
          </h1>
          {job && <p className="mt-1 text-muted-foreground">{job.title}</p>}
        </div>
      </div>

      {/* Filter Bar */}
      <div className="mb-6">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="APPLIED">Applied</SelectItem>
            <SelectItem value="TESTING">Testing</SelectItem>
            <SelectItem value="COMPLETED">Completed</SelectItem>
            <SelectItem value="REVIEWED">Reviewed</SelectItem>
            <SelectItem value="SHORTLISTED">Shortlisted</SelectItem>
            <SelectItem value="REJECTED">Rejected</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Applicant Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Applicants</CardTitle>
        </CardHeader>
        <CardContent>
          {applicantsLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : !applicants.length ? (
            <EmptyState
              icon={Users}
              title="No applicants found"
              description={
                statusFilter !== 'all'
                  ? 'Try changing the status filter'
                  : 'No one has applied to this job yet'
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">Candidate</th>
                    <th className="pb-2 pr-4 font-medium">Location</th>
                    <th className="pb-2 pr-4 font-medium">Experience</th>
                    <th className="pb-2 pr-4 font-medium">Skills</th>
                    <th className="pb-2 pr-4 font-medium">Status</th>
                    <th className="pb-2 pr-4 font-medium">Score</th>
                    <th className="pb-2 pr-4 font-medium">Applied</th>
                    <th className="pb-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {applicants.map(app => {
                    const candidate = app.candidate;
                    const fullName = candidate?.user
                      ? `${candidate.user.firstName} ${candidate.user.lastName}`
                      : 'Unknown';
                    const isUpdating = actionLoading === app.id;

                    return (
                      <tr key={app.id} className="group transition-colors hover:bg-accent/50">
                        <td className="py-3 pr-4">
                          <p className="font-medium">{fullName}</p>
                          {candidate?.headline && (
                            <p className="max-w-48 truncate text-xs text-muted-foreground">
                              {candidate.headline}
                            </p>
                          )}
                        </td>
                        <td className="py-3 pr-4 text-muted-foreground">
                          {candidate?.locationCity ? (
                            <span className="flex items-center gap-1">
                              <MapPin className="h-3 w-3 shrink-0" />
                              {candidate.locationCity}
                            </span>
                          ) : (
                            '\u2014'
                          )}
                        </td>
                        <td className="py-3 pr-4 text-muted-foreground">
                          {candidate?.yearsExperience != null
                            ? `${candidate.yearsExperience}y`
                            : '\u2014'}
                        </td>
                        <td className="py-3 pr-4">
                          <div className="flex flex-wrap gap-1">
                            {candidate?.candidateSkills?.slice(0, 3).map((s, i) => (
                              <Badge key={i} variant="secondary" className="text-xs">
                                {s.skill?.name}
                              </Badge>
                            ))}
                            {(candidate?.candidateSkills?.length ?? 0) > 3 && (
                              <Badge variant="outline" className="text-xs">
                                +{candidate!.candidateSkills.length - 3}
                              </Badge>
                            )}
                          </div>
                        </td>
                        <td className="py-3 pr-4">
                          <Badge
                            className={
                              APPLICATION_STATUS_COLORS[app.status] || 'bg-gray-100 text-gray-800'
                            }
                          >
                            {APPLICATION_STATUS_LABELS[app.status] || app.status}
                          </Badge>
                        </td>
                        <td className="py-3 pr-4">
                          {app.averageScore != null ? (
                            <ScoreIndicator score={app.averageScore} />
                          ) : (
                            <span className="text-muted-foreground">{'\u2014'}</span>
                          )}
                        </td>
                        <td className="py-3 pr-4 text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3 shrink-0" />
                            {formatDate(app.appliedAt)}
                          </span>
                        </td>
                        <td className="py-3">
                          <div className="flex gap-2">
                            <Button variant="outline" size="sm" asChild>
                              <Link href={ROUTES.candidateProfile(candidate.id)}>View Profile</Link>
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={messagingId === app.id}
                              onClick={() => handleMessage(app.id, candidate.id)}
                            >
                              <Mail className="mr-1 h-3 w-3" />
                              Message
                            </Button>
                            {(app.status === 'COMPLETED' || app.status === 'REVIEWED') && (
                              <Button
                                size="sm"
                                variant="default"
                                disabled={isUpdating}
                                onClick={() => handleStatusUpdate(app.id, 'SHORTLISTED')}
                              >
                                <UserCheck className="mr-1 h-3 w-3" />
                                Shortlist
                              </Button>
                            )}
                            {app.status !== 'REJECTED' && app.status !== 'HIRED' && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-red-600 hover:bg-red-50 hover:text-red-700"
                                disabled={isUpdating}
                                onClick={() => handleStatusUpdate(app.id, 'REJECTED')}
                              >
                                <XCircle className="mr-1 h-3 w-3" />
                                Reject
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
