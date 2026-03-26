'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, MapPin, Building2, DollarSign, Clock, CheckCircle2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { PageLoader } from '@/components/loading-spinner';
import { StatusBadge } from '@/components/status-badge';
import { useJob } from '@/hooks/use-jobs';
import { useMyApplications, applyToJob } from '@/hooks/use-applications';
import { useCandidateProfile } from '@/hooks/use-candidate';
import { ROUTES, APPLICATION_STATUS_LABELS, APPLICATION_STATUS_COLORS } from '@/lib/constants';

const REMOTE_LABELS: Record<string, string> = {
  REMOTE: 'Remote',
  HYBRID: 'Hybrid',
  ONSITE: 'On-site',
};

const EMPLOYMENT_LABELS: Record<string, string> = {
  FULL_TIME: 'Full-time',
  PART_TIME: 'Part-time',
  CONTRACT: 'Contract',
  INTERNSHIP: 'Internship',
};

function formatSalary(min?: number | null, max?: number | null, currency?: string) {
  if (!min && !max) return null;
  const fmt = (n: number) => {
    if (n >= 1000) return `${Math.round(n / 1000)}k`;
    return String(n);
  };
  const cur = currency || 'USD';
  if (min && max) return `${cur} ${fmt(min)} - ${fmt(max)}`;
  if (min) return `${cur} ${fmt(min)}+`;
  return `Up to ${cur} ${fmt(max!)}`;
}

export default function JobDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const { data: job, isLoading } = useJob(id);
  const { data: applications } = useMyApplications();
  const { data: profile } = useCandidateProfile();
  const hasResume = !!profile?.resumeUrl;
  const [coverLetter, setCoverLetter] = useState('');
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState<{
    id: string;
    challenges: Array<{ id: string; title: string; skillName: string }>;
  } | null>(null);
  const [error, setError] = useState('');

  const existingApplication = applications?.find(a => a.jobId === id);

  const handleApply = async () => {
    setApplying(true);
    setError('');
    try {
      const result = await applyToJob(id, coverLetter || undefined);
      setApplied(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to apply. Please try again.';
      setError(message);
    } finally {
      setApplying(false);
    }
  };

  if (isLoading) return <PageLoader />;

  if (!job) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <h2 className="text-lg font-medium">Job not found</h2>
        <Button variant="ghost" className="mt-4" asChild>
          <Link href={ROUTES.candidateJobs}>Back to Jobs</Link>
        </Button>
      </div>
    );
  }

  const salary = formatSalary(job.salaryMin, job.salaryMax, job.salaryCurrency);
  const skills = job.jobSkills || [];

  return (
    <div>
      <Button variant="ghost" size="sm" className="mb-4" asChild>
        <Link href={ROUTES.candidateJobs}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Jobs
        </Link>
      </Button>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main content */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle className="text-xl">{job.title}</CardTitle>
                  {job.company && (
                    <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
                      <Building2 className="h-4 w-4" />
                      {job.company.name}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {job.remotePolicy && (
                    <Badge variant="secondary">
                      {REMOTE_LABELS[job.remotePolicy] || job.remotePolicy}
                    </Badge>
                  )}
                  {job.employmentType && (
                    <Badge variant="outline">
                      {EMPLOYMENT_LABELS[job.employmentType] || job.employmentType}
                    </Badge>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                {(job.locationCity || job.locationCountry) && (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-4 w-4" />
                    {[job.locationCity, job.locationCountry].filter(Boolean).join(', ')}
                  </span>
                )}
                {salary && (
                  <span className="flex items-center gap-1">
                    <DollarSign className="h-4 w-4" />
                    {salary}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Clock className="h-4 w-4" />
                  Posted {new Date(job.createdAt).toLocaleDateString()}
                </span>
              </div>

              <Separator className="my-6" />

              <div>
                <h3 className="text-base font-semibold">Description</h3>
                <div className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                  {job.description}
                </div>
              </div>

              {skills.length > 0 && (
                <>
                  <Separator className="my-6" />
                  <div>
                    <h3 className="text-base font-semibold">Required Skills</h3>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {skills.map(js => (
                        <Badge key={js.skill.id} variant={js.required ? 'default' : 'secondary'}>
                          {js.skill.name}
                          {js.minLevel && <span className="ml-1 opacity-75">({js.minLevel})</span>}
                          {!js.required && <span className="ml-1 opacity-75">(optional)</span>}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar - Apply section */}
        <div>
          <Card className="sticky top-6">
            <CardHeader>
              <CardTitle className="text-lg">
                {existingApplication ? 'Application Status' : 'Apply for this Job'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {applied ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-green-600">
                    <CheckCircle2 className="h-5 w-5" />
                    <p className="text-sm font-medium">Application submitted!</p>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    You have {applied.challenges.length} challenge
                    {applied.challenges.length !== 1 ? 's' : ''} to complete.
                  </p>
                  <Button className="w-full" asChild>
                    <Link href={ROUTES.challenges}>Go to Challenges</Link>
                  </Button>
                </div>
              ) : existingApplication ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Status</span>
                    <StatusBadge
                      status={existingApplication.status}
                      labels={APPLICATION_STATUS_LABELS}
                      colors={APPLICATION_STATUS_COLORS}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Applied</span>
                    <span className="text-sm">
                      {new Date(existingApplication.appliedAt).toLocaleDateString()}
                    </span>
                  </div>
                  {existingApplication.averageScore != null && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Score</span>
                      <span className="text-sm font-medium">
                        {Math.round(existingApplication.averageScore)}%
                      </span>
                    </div>
                  )}
                  {existingApplication.status === 'TESTING' && (
                    <Button className="w-full" asChild>
                      <Link href={ROUTES.challenges}>Continue Challenges</Link>
                    </Button>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label htmlFor="coverLetter" className="mb-2 block text-sm font-medium">
                      Cover Letter{' '}
                      <span className="font-normal text-muted-foreground">(optional)</span>
                    </label>
                    <Textarea
                      id="coverLetter"
                      placeholder="Tell the employer why you're a great fit..."
                      value={coverLetter}
                      onChange={e => setCoverLetter(e.target.value)}
                      rows={5}
                    />
                  </div>
                  {error && <p className="text-sm text-red-600">{error}</p>}
                  {!hasResume ? (
                    <>
                      <p className="text-sm text-amber-600">
                        You need to upload your resume before applying.
                      </p>
                      <Button className="w-full" asChild>
                        <Link href={ROUTES.profile}>Upload Resume</Link>
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button className="w-full" onClick={handleApply} disabled={applying}>
                        {applying ? 'Applying...' : 'Apply Now'}
                      </Button>
                      <p className="text-xs text-muted-foreground">
                        You will be assigned skill challenges after applying.
                      </p>
                    </>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
