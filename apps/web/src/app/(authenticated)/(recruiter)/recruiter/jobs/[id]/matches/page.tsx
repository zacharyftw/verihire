'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Sparkles, UserPlus, BarChart3 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { PageLoader } from '@/components/loading-spinner';
import { EmptyState } from '@/components/empty-state';
import { useRecruiterJob, useMatchingCandidates, addToShortlist } from '@/hooks/use-jobs';
import { ROUTES } from '@/lib/constants';
import { toast } from '@/hooks/use-toast';
import { useState } from 'react';

interface DomainMatch {
  skillName: string;
  domainScore: number;
  domainLevel: string;
}

interface MatchedCandidate {
  id: string;
  matchScore: number;
  matchedSkillsCount: number;
  totalRequiredSkills: number;
  hasAllRequired: boolean;
  domainMatchPercentage: number;
  domainMatches: DomainMatch[];
  user?: { firstName: string; lastName: string };
  currentRole?: string;
  currentCompany?: string;
  locationCity?: string;
  yearsExperience?: number;
  candidateSkills?: Array<{ skillId: string; skill?: { name: string } }>;
  aiScore?: number | null;
  aiReasoning?: string | null;
  aiStrengths?: string[];
  aiGaps?: string[];
}

export default function MatchesPage() {
  const params = useParams();
  const jobId = params.id as string;
  const { data: job } = useRecruiterJob(jobId);
  const { data: rawData, isLoading } = useMatchingCandidates(jobId);
  const matches: MatchedCandidate[] = (rawData?.data ||
    rawData?.matches ||
    rawData ||
    []) as MatchedCandidate[];
  const [adding, setAdding] = useState<string | null>(null);

  async function handleAdd(candidateId: string) {
    setAdding(candidateId);
    try {
      await addToShortlist(jobId, candidateId);
      toast({ title: 'Added to shortlist' });
    } catch (err: unknown) {
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

      <div className="mb-6">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <h1 className="text-2xl font-bold">AI-Powered Matching</h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Candidates are pre-filtered by skills, then ranked by AI analysis.
        </p>
      </div>

      {!matches.length ? (
        <EmptyState
          icon={Sparkles}
          title="No matches found"
          description="AI matching requires candidates with verified skills that align with this job's requirements"
        />
      ) : (
        <div className="space-y-3">
          {matches.map(match => {
            const normalizedScore = Math.min(
              100,
              Math.round((match.matchScore / (match.totalRequiredSkills * 2 || 1)) * 100)
            );
            return (
              <Card key={match.id}>
                <CardContent className="flex items-start gap-4 p-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10">
                    <span className="text-lg font-bold text-primary">{normalizedScore}%</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Link
                        href={ROUTES.candidateProfile(match.id)}
                        className="font-medium hover:underline"
                      >
                        {match.user ? `${match.user.firstName} ${match.user.lastName}` : 'Unknown'}
                      </Link>
                      {match.hasAllRequired && (
                        <Badge variant="default" className="text-xs">
                          All required
                        </Badge>
                      )}
                    </div>
                    {match.currentRole && (
                      <p className="text-sm text-muted-foreground">
                        {match.currentRole}
                        {match.currentCompany && ` at ${match.currentCompany}`}
                      </p>
                    )}
                    <div className="mt-1 flex flex-wrap gap-2">
                      {match.locationCity && (
                        <Badge variant="outline" className="text-xs">
                          {match.locationCity}
                        </Badge>
                      )}
                      {match.yearsExperience != null && (
                        <Badge variant="outline" className="text-xs">
                          {match.yearsExperience}y exp
                        </Badge>
                      )}
                      {match.candidateSkills?.slice(0, 3).map(s => (
                        <Badge key={s.skillId} variant="secondary" className="text-xs">
                          {s.skill?.name || s.skillId}
                        </Badge>
                      ))}
                    </div>
                    {match.domainMatches && match.domainMatches.length > 0 && (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <BarChart3 className="h-3 w-3 text-muted-foreground" />
                        {match.domainMatches.map(dm => (
                          <Badge key={dm.skillName} variant="outline" className="text-xs">
                            {dm.skillName}: {Math.round(dm.domainScore)}%
                          </Badge>
                        ))}
                        <span className="text-xs text-muted-foreground">
                          ({match.domainMatchPercentage}% domain match)
                        </span>
                      </div>
                    )}
                    <Progress value={normalizedScore} className="mt-2 h-1.5" />
                    <p className="mt-1 text-xs text-muted-foreground">
                      {match.matchedSkillsCount}/{match.totalRequiredSkills} required skills matched
                    </p>
                    {match.aiScore != null && (
                      <div className="mt-3 space-y-2 rounded-lg border border-blue-200 bg-blue-50 p-3">
                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-1 text-sm font-medium">
                            <Sparkles className="h-3 w-3 text-blue-600" />
                            AI Analysis
                          </span>
                          <Badge variant="outline" className="border-blue-300 text-blue-700">
                            {match.aiScore}% match
                          </Badge>
                        </div>
                        {match.aiReasoning && (
                          <p className="text-sm text-blue-800">{match.aiReasoning}</p>
                        )}
                        {match.aiStrengths && match.aiStrengths.length > 0 && (
                          <div>
                            <p className="text-xs font-medium text-green-700">Strengths:</p>
                            <ul className="ml-4 list-disc text-xs text-green-700">
                              {match.aiStrengths.map((s, i) => (
                                <li key={i}>{s}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {match.aiGaps && match.aiGaps.length > 0 && (
                          <div>
                            <p className="text-xs font-medium text-amber-700">Gaps:</p>
                            <ul className="ml-4 list-disc text-xs text-amber-700">
                              {match.aiGaps.map((g, i) => (
                                <li key={i}>{g}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    {match.aiScore != null ? (
                      <Badge variant="default" className="bg-blue-600 text-xs">
                        AI Ranked
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-xs">
                        Rule-Based
                      </Badge>
                    )}
                    <Button
                      size="sm"
                      onClick={() => handleAdd(match.id)}
                      disabled={adding === match.id}
                    >
                      <UserPlus className="mr-1 h-4 w-4" />
                      Shortlist
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
