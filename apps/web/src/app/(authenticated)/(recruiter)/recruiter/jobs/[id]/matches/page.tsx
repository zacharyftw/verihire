'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Sparkles, UserPlus } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { PageLoader } from '@/components/loading-spinner';
import { EmptyState } from '@/components/empty-state';
import { useJob, useMatchingCandidates, addToShortlist } from '@/hooks/use-jobs';
import { ROUTES } from '@/lib/constants';
import { toast } from '@/hooks/use-toast';
import { useState } from 'react';

interface MatchedCandidate {
  candidateId: string;
  score: number;
  candidate?: {
    id: string;
    user?: { firstName: string; lastName: string };
    headline?: string;
    currentRole?: string;
    currentCompany?: string;
    locationCity?: string;
    yearsExperience?: number;
    skills?: Array<{ skillId: string; skill?: { name: string } }>;
  };
}

export default function MatchesPage() {
  const params = useParams();
  const jobId = params.id as string;
  const { data: job } = useJob(jobId);
  const { data, isLoading } = useMatchingCandidates(jobId);
  const matches: MatchedCandidate[] = (data?.matches || data || []) as MatchedCandidate[];
  const [adding, setAdding] = useState<string | null>(null);

  async function handleAdd(candidateId: string) {
    setAdding(candidateId);
    try {
      await addToShortlist(jobId, candidateId);
      toast({ title: 'Added to shortlist' });
    } catch (err) {
      toast({
        title: 'Failed to add',
        variant: 'destructive',
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setAdding(null);
    }
  }

  if (isLoading) return <PageLoader />;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href={ROUTES.jobDetail(jobId)}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Job
          </Link>
        </Button>
        {job && <span className="text-sm text-muted-foreground">{job.title}</span>}
      </div>

      <div className="mb-6 flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-primary" />
        <h1 className="text-2xl font-bold">AI-Matched Candidates</h1>
      </div>

      {!matches.length ? (
        <EmptyState
          icon={Sparkles}
          title="No matches found"
          description="AI matching requires candidates with verified skills that align with this job's requirements"
        />
      ) : (
        <div className="space-y-3">
          {matches.map(match => (
            <Card key={match.candidateId}>
              <CardContent className="flex items-center gap-4 p-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <span className="text-lg font-bold text-primary">{Math.round(match.score)}%</span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Link
                      href={ROUTES.candidateProfile(match.candidateId)}
                      className="font-medium hover:underline"
                    >
                      {match.candidate?.user
                        ? `${match.candidate.user.firstName} ${match.candidate.user.lastName}`
                        : 'Unknown'}
                    </Link>
                  </div>
                  {match.candidate?.currentRole && (
                    <p className="text-sm text-muted-foreground">
                      {match.candidate.currentRole}
                      {match.candidate.currentCompany && ` at ${match.candidate.currentCompany}`}
                    </p>
                  )}
                  <div className="mt-1 flex flex-wrap gap-2">
                    {match.candidate?.locationCity && (
                      <Badge variant="outline" className="text-xs">
                        {match.candidate.locationCity}
                      </Badge>
                    )}
                    {match.candidate?.yearsExperience != null && (
                      <Badge variant="outline" className="text-xs">
                        {match.candidate.yearsExperience}y exp
                      </Badge>
                    )}
                    {match.candidate?.skills?.slice(0, 3).map(s => (
                      <Badge key={s.skillId} variant="secondary" className="text-xs">
                        {s.skill?.name || s.skillId}
                      </Badge>
                    ))}
                  </div>
                  <Progress value={match.score} className="mt-2 h-1.5" />
                </div>
                <Button
                  size="sm"
                  onClick={() => handleAdd(match.candidateId)}
                  disabled={adding === match.candidateId}
                >
                  <UserPlus className="mr-1 h-4 w-4" />
                  Shortlist
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
