'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  MapPin,
  Clock,
  UserCheck,
  XCircle,
  Users,
  Mail,
  ChevronDown,
  ChevronUp,
  FileText,
  Award,
  CheckCircle,
  Circle,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PageLoader } from '@/components/loading-spinner';
import { EmptyState } from '@/components/empty-state';
import { useRecruiterJob } from '@/hooks/use-jobs';
import {
  useJobApplicants,
  updateApplication,
  type JobApplication,
  type ApplicationChallenge,
} from '@/hooks/use-recruiter';
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

const CHALLENGE_TYPE_COLORS: Record<string, string> = {
  GENERAL_SWE: 'bg-indigo-100 text-indigo-800',
  DOMAIN_SPECIFIC: 'bg-orange-100 text-orange-800',
  CODING: 'bg-indigo-100 text-indigo-800',
  WRITTEN: 'bg-teal-100 text-teal-800',
  DESIGN: 'bg-pink-100 text-pink-800',
};

const DIFFICULTY_COLORS: Record<string, string> = {
  EASY: 'bg-green-100 text-green-700',
  MEDIUM: 'bg-yellow-100 text-yellow-700',
  HARD: 'bg-red-100 text-red-700',
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

function getStepIndex(status: string): number {
  switch (status) {
    case 'APPLIED':
      return 0;
    case 'TESTING':
      return 1;
    case 'COMPLETED':
    case 'REVIEWED':
      return 2;
    default:
      // SHORTLISTED, REJECTED, HIRED all mean decision made
      return 4;
  }
}

function getChallengeStats(challenges?: ApplicationChallenge[]) {
  if (!challenges || challenges.length === 0) return { total: 0, completed: 0, inProgress: 0 };
  const total = challenges.length;
  const completed = challenges.filter(c =>
    c.submissions.some(s => s.status === 'EVALUATED' || s.status === 'COMPLETED')
  ).length;
  const inProgress = challenges.filter(
    c =>
      c.submissions.length > 0 &&
      !c.submissions.some(s => s.status === 'EVALUATED' || s.status === 'COMPLETED')
  ).length;
  return { total, completed, inProgress };
}

function getSubmissionStatus(challenge: ApplicationChallenge): {
  label: string;
  color: string;
  score?: number;
} {
  if (!challenge.submissions || challenge.submissions.length === 0) {
    return { label: 'Not Started', color: 'bg-gray-100 text-gray-600' };
  }
  const evaluated = challenge.submissions.find(
    s => s.status === 'EVALUATED' || s.status === 'COMPLETED'
  );
  if (evaluated) {
    return {
      label: 'Evaluated',
      color: 'bg-green-100 text-green-700',
      score: evaluated.finalScore,
    };
  }
  return { label: 'In Progress', color: 'bg-yellow-100 text-yellow-700' };
}

function PipelineStep({
  label,
  isCompleted,
  isActive,
  children,
  isLast,
}: {
  label: string;
  isCompleted: boolean;
  isActive: boolean;
  children?: React.ReactNode;
  isLast?: boolean;
}) {
  return (
    <div className="flex flex-1 items-start gap-0">
      <div className="flex flex-col items-center">
        <div
          className={`flex h-8 w-8 items-center justify-center rounded-full border-2 transition-colors ${
            isCompleted
              ? 'border-green-500 bg-green-500 text-white'
              : isActive
                ? 'border-blue-500 bg-blue-50 text-blue-600'
                : 'border-gray-300 bg-white text-gray-400'
          }`}
        >
          {isCompleted ? (
            <CheckCircle className="h-4 w-4" />
          ) : isActive ? (
            <Circle className="h-4 w-4 fill-current" />
          ) : (
            <Circle className="h-4 w-4" />
          )}
        </div>
        <span
          className={`mt-1.5 text-xs font-medium ${
            isCompleted ? 'text-green-700' : isActive ? 'text-blue-700' : 'text-gray-400'
          }`}
        >
          {label}
        </span>
        {children && <div className="mt-1">{children}</div>}
      </div>
      {!isLast && (
        <div className="mt-4 flex-1 px-1">
          <div className={`h-0.5 w-full ${isCompleted ? 'bg-green-400' : 'bg-gray-200'}`} />
        </div>
      )}
    </div>
  );
}

function PipelineTracker({ app }: { app: JobApplication }) {
  const currentStep = getStepIndex(app.status);
  const challengeStats = getChallengeStats(app.challenges);
  const hasCertificate = !!app.certificate;
  const isDecided = ['SHORTLISTED', 'REJECTED', 'HIRED'].includes(app.status);

  return (
    <div className="flex w-full items-start py-4">
      {/* Applied */}
      <PipelineStep label="Applied" isCompleted={currentStep >= 0} isActive={currentStep === 0}>
        <span className="text-[10px] text-muted-foreground">{formatDate(app.appliedAt)}</span>
      </PipelineStep>

      {/* Testing */}
      <PipelineStep label="Testing" isCompleted={currentStep > 1} isActive={currentStep === 1}>
        {challengeStats.total > 0 && (
          <span className="text-[10px] text-muted-foreground">
            {challengeStats.completed}/{challengeStats.total}
          </span>
        )}
      </PipelineStep>

      {/* Completed */}
      <PipelineStep label="Completed" isCompleted={currentStep > 2} isActive={currentStep === 2}>
        {app.averageScore != null ? (
          <ScoreIndicator score={app.averageScore} />
        ) : currentStep >= 1 ? (
          <span className="text-[10px] text-muted-foreground">In Progress</span>
        ) : null}
      </PipelineStep>

      {/* Certificate */}
      <PipelineStep
        label="Certificate"
        isCompleted={hasCertificate}
        isActive={currentStep >= 2 && !hasCertificate}
      >
        {hasCertificate ? (
          <Badge variant="secondary" className="text-[10px]">
            {app.certificate!.grade}
          </Badge>
        ) : currentStep >= 2 ? (
          <span className="text-[10px] text-muted-foreground">
            {app.averageScore != null && app.averageScore < 60 ? 'Not eligible' : 'Pending'}
          </span>
        ) : null}
      </PipelineStep>

      {/* Decision */}
      <PipelineStep label="Decision" isCompleted={isDecided} isActive={false} isLast>
        {isDecided && (
          <Badge
            className={`text-[10px] ${APPLICATION_STATUS_COLORS[app.status] || 'bg-gray-100 text-gray-800'}`}
          >
            {APPLICATION_STATUS_LABELS[app.status] || app.status}
          </Badge>
        )}
      </PipelineStep>
    </div>
  );
}

function ChallengeDetailsTable({ challenges }: { challenges: ApplicationChallenge[] }) {
  if (!challenges || challenges.length === 0) {
    return <p className="py-2 text-sm text-muted-foreground">No challenges assigned yet.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
            <th className="px-3 py-2 font-medium">Challenge</th>
            <th className="px-3 py-2 font-medium">Type</th>
            <th className="px-3 py-2 font-medium">Difficulty</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 font-medium">Score</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {challenges.map(challenge => {
            const sub = getSubmissionStatus(challenge);
            return (
              <tr key={challenge.id} className="hover:bg-accent/30">
                <td className="px-3 py-2 font-medium">{challenge.title}</td>
                <td className="px-3 py-2">
                  <Badge
                    className={`text-xs ${CHALLENGE_TYPE_COLORS[challenge.type] || 'bg-gray-100 text-gray-700'}`}
                  >
                    {challenge.type.replace('_', ' ')}
                  </Badge>
                </td>
                <td className="px-3 py-2">
                  <Badge
                    className={`text-xs ${DIFFICULTY_COLORS[challenge.difficulty] || 'bg-gray-100 text-gray-700'}`}
                  >
                    {challenge.difficulty}
                  </Badge>
                </td>
                <td className="px-3 py-2">
                  <Badge className={`text-xs ${sub.color}`}>{sub.label}</Badge>
                </td>
                <td className="px-3 py-2">
                  {sub.score != null ? <ScoreIndicator score={sub.score} /> : '\u2014'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function CertificateCard({ certificate }: { certificate: JobApplication['certificate'] }) {
  if (!certificate) return null;

  const gradeColor =
    certificate.grade === 'A' || certificate.grade === 'A+'
      ? 'text-green-600'
      : certificate.grade === 'B' || certificate.grade === 'B+'
        ? 'text-blue-600'
        : certificate.grade === 'C'
          ? 'text-yellow-600'
          : 'text-gray-600';

  return (
    <div className="flex items-center gap-4 rounded-lg border bg-gradient-to-r from-amber-50 to-yellow-50 p-4">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-100">
        <Award className="h-6 w-6 text-amber-600" />
      </div>
      <div className="flex-1">
        <p className="text-sm font-medium">
          {certificate.metadata?.title || 'VeriHire Certificate'}
        </p>
        <p className="text-xs text-muted-foreground">#{certificate.certificateNumber}</p>
        <p className="text-xs text-muted-foreground">Issued {formatDate(certificate.issuedAt)}</p>
      </div>
      <div className="text-right">
        <p className={`text-2xl font-bold ${gradeColor}`}>{certificate.grade}</p>
        <p className="text-sm text-muted-foreground">{Math.round(certificate.finalScore)}%</p>
      </div>
    </div>
  );
}

function ResumeSection({ resumeUrl }: { resumeUrl?: string }) {
  if (!resumeUrl) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="flex items-center gap-2 text-sm font-semibold">
          <FileText className="h-4 w-4" />
          Resume
        </h4>
        <Button variant="outline" size="sm" asChild>
          <a href={resumeUrl} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="mr-1 h-3 w-3" />
            Open in New Tab
          </a>
        </Button>
      </div>
      <div className="overflow-hidden rounded-md border">
        <object data={resumeUrl} type="application/pdf" className="h-[400px] w-full">
          <div className="flex h-[200px] flex-col items-center justify-center gap-2 bg-muted/30">
            <FileText className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Unable to preview PDF inline.</p>
            <Button variant="outline" size="sm" asChild>
              <a href={resumeUrl} target="_blank" rel="noopener noreferrer">
                Download Resume
              </a>
            </Button>
          </div>
        </object>
      </div>
    </div>
  );
}

function ApplicantCard({
  app,
  isExpanded,
  onToggle,
  onStatusUpdate,
  onMessage,
  actionLoading,
  messagingId,
}: {
  app: JobApplication;
  isExpanded: boolean;
  onToggle: () => void;
  onStatusUpdate: (applicationId: string, status: string) => void;
  onMessage: (applicationId: string, candidateProfileId: string) => void;
  actionLoading: string | null;
  messagingId: string | null;
}) {
  const candidate = app.candidate;
  const fullName = candidate?.user
    ? `${candidate.user.firstName} ${candidate.user.lastName}`
    : 'Unknown';
  const isUpdating = actionLoading === app.id;
  const challengeStats = getChallengeStats(app.challenges);

  return (
    <Card className="transition-shadow hover:shadow-md">
      {/* Collapsed View */}
      <div
        className="flex cursor-pointer items-center gap-4 p-4"
        onClick={onToggle}
        role="button"
        tabIndex={0}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggle();
          }
        }}
      >
        {/* Candidate Info */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold">{fullName}</p>
            <Badge className={APPLICATION_STATUS_COLORS[app.status] || 'bg-gray-100 text-gray-800'}>
              {APPLICATION_STATUS_LABELS[app.status] || app.status}
            </Badge>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            {candidate?.headline && <span className="max-w-64 truncate">{candidate.headline}</span>}
            {candidate?.locationCity && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3 shrink-0" />
                {candidate.locationCity}
              </span>
            )}
            {candidate?.yearsExperience != null && <span>{candidate.yearsExperience}y exp</span>}
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3 shrink-0" />
              {formatDate(app.appliedAt)}
            </span>
          </div>
        </div>

        {/* Score */}
        <div className="hidden shrink-0 items-center gap-3 sm:flex">
          {app.averageScore != null && <ScoreIndicator score={app.averageScore} />}
          {challengeStats.total > 0 && (
            <span className="text-xs text-muted-foreground">
              {challengeStats.completed}/{challengeStats.total} challenges
            </span>
          )}
        </div>

        {/* Actions */}
        <div className="flex shrink-0 items-center gap-2" onClick={e => e.stopPropagation()}>
          <Button variant="outline" size="sm" asChild>
            <Link href={ROUTES.candidateProfile(candidate.id)}>View Profile</Link>
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={messagingId === app.id}
            onClick={() => onMessage(app.id, candidate.id)}
          >
            <Mail className="mr-1 h-3 w-3" />
            <span className="hidden lg:inline">Message</span>
          </Button>
          {candidate?.resumeUrl && (
            <Button variant="outline" size="sm" asChild>
              <a href={candidate.resumeUrl} target="_blank" rel="noopener noreferrer">
                <FileText className="mr-1 h-3 w-3" />
                <span className="hidden lg:inline">Resume</span>
              </a>
            </Button>
          )}
          {(app.status === 'COMPLETED' || app.status === 'REVIEWED') && (
            <Button
              size="sm"
              variant="default"
              disabled={isUpdating}
              onClick={() => onStatusUpdate(app.id, 'SHORTLISTED')}
            >
              <UserCheck className="mr-1 h-3 w-3" />
              <span className="hidden lg:inline">Shortlist</span>
            </Button>
          )}
          {app.status !== 'REJECTED' && app.status !== 'HIRED' && (
            <Button
              size="sm"
              variant="ghost"
              className="text-red-600 hover:bg-red-50 hover:text-red-700"
              disabled={isUpdating}
              onClick={() => onStatusUpdate(app.id, 'REJECTED')}
            >
              <XCircle className="mr-1 h-3 w-3" />
              <span className="hidden lg:inline">Reject</span>
            </Button>
          )}
          {isExpanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </div>

      {/* Expanded View */}
      {isExpanded && (
        <div className="border-t px-4 pb-4">
          {/* Pipeline Tracker */}
          <div className="overflow-x-auto">
            <PipelineTracker app={app} />
          </div>

          <Separator className="my-4" />

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Left Column: Challenges */}
            <div className="space-y-3">
              <h4 className="flex items-center gap-2 text-sm font-semibold">
                <AlertCircle className="h-4 w-4" />
                Challenge Details
                {challengeStats.total > 0 && (
                  <span className="text-xs font-normal text-muted-foreground">
                    ({challengeStats.completed} of {challengeStats.total} completed)
                  </span>
                )}
              </h4>
              {challengeStats.total > 0 && (
                <Progress
                  value={(challengeStats.completed / challengeStats.total) * 100}
                  className="h-2"
                />
              )}
              <ChallengeDetailsTable challenges={app.challenges ?? []} />
            </div>

            {/* Right Column: Certificate + Resume */}
            <div className="space-y-4">
              {/* Certificate */}
              <div className="space-y-3">
                <h4 className="flex items-center gap-2 text-sm font-semibold">
                  <Award className="h-4 w-4" />
                  Certificate
                </h4>
                {app.certificate ? (
                  <CertificateCard certificate={app.certificate} />
                ) : (
                  <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                    {app.averageScore != null && app.averageScore < 60
                      ? 'Not eligible (score below 60%)'
                      : app.status === 'COMPLETED' || app.status === 'REVIEWED'
                        ? 'Certificate pending'
                        : 'Testing not yet complete'}
                  </div>
                )}
              </div>

              {/* Resume */}
              <ResumeSection resumeUrl={candidate?.resumeUrl} />
            </div>
          </div>

          {/* Skills */}
          {candidate?.candidateSkills && candidate.candidateSkills.length > 0 && (
            <>
              <Separator className="my-4" />
              <div className="space-y-2">
                <h4 className="text-sm font-semibold">Skills</h4>
                <div className="flex flex-wrap gap-1.5">
                  {candidate.candidateSkills.map((s, i) => (
                    <Badge key={i} variant="secondary" className="text-xs">
                      {s.skill?.name}
                    </Badge>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </Card>
  );
}

export default function JobApplicantsPage() {
  const params = useParams();
  const router = useRouter();
  const jobId = params.id as string;
  const { data: job, isLoading: jobLoading } = useRecruiterJob(jobId);
  const [statusFilter, setStatusFilter] = useState('all');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [messagingId, setMessagingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

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

      {/* Applicant Cards */}
      {applicantsLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}
        </div>
      ) : !applicants.length ? (
        <Card>
          <CardContent className="py-12">
            <EmptyState
              icon={Users}
              title="No applicants found"
              description={
                statusFilter !== 'all'
                  ? 'Try changing the status filter'
                  : 'No one has applied to this job yet'
              }
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {applicants.map(app => (
            <ApplicantCard
              key={app.id}
              app={app}
              isExpanded={expandedId === app.id}
              onToggle={() => setExpandedId(expandedId === app.id ? null : app.id)}
              onStatusUpdate={handleStatusUpdate}
              onMessage={handleMessage}
              actionLoading={actionLoading}
              messagingId={messagingId}
            />
          ))}
        </div>
      )}
    </div>
  );
}
