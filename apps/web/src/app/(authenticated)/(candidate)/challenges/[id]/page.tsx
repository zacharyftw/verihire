'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { Clock, Code2, Award, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { PageLoader } from '@/components/loading-spinner';
import { useChallenge } from '@/hooks/use-challenges';
import { startSubmission, useActiveSubmission } from '@/hooks/use-submissions';
import { ROUTES, DIFFICULTY_LABELS, DIFFICULTY_COLORS } from '@/lib/constants';
import { toast } from '@/hooks/use-toast';

function formatRequirements(req: Record<string, unknown> | string | null): string {
  if (!req) return '';
  if (typeof req === 'string') return req;
  return JSON.stringify(req, null, 2);
}

export default function ChallengeDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { data: challenge, isLoading } = useChallenge(id);
  const { data: activeSubmission } = useActiveSubmission(id);
  const [starting, setStarting] = useState(false);

  if (isLoading) return <PageLoader />;
  if (!challenge) return <div>Challenge not found</div>;

  async function handleStart() {
    setStarting(true);
    try {
      await startSubmission(id);
      router.push(ROUTES.challengeSubmit(id));
    } catch (err) {
      toast({
        title: 'Failed to start challenge',
        description: err instanceof Error ? err.message : 'Something went wrong',
        variant: 'destructive',
      });
    } finally {
      setStarting(false);
    }
  }

  const reqText = formatRequirements(challenge.requirements);
  const criteriaText = formatRequirements(challenge.evaluationCriteria);

  return (
    <div className="mx-auto max-w-3xl">
      <Button variant="ghost" size="sm" className="mb-4" asChild>
        <Link href={ROUTES.challenges}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Challenges
        </Link>
      </Button>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-xl">{challenge.title}</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                {challenge.skill?.name || 'General'}
              </p>
            </div>
            {challenge.difficulty && (
              <Badge variant="secondary" className={DIFFICULTY_COLORS[challenge.difficulty]}>
                {DIFFICULTY_LABELS[challenge.difficulty]}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-sm text-muted-foreground">{challenge.description}</p>

          <div className="flex flex-wrap gap-4 text-sm">
            {challenge.timeLimitMinutes && (
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span>Time Limit: {challenge.timeLimitMinutes} minutes</span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <Code2 className="h-4 w-4 text-muted-foreground" />
              <span>Type: {challenge.type}</span>
            </div>
            <div className="flex items-center gap-2">
              <Award className="h-4 w-4 text-muted-foreground" />
              <span>{challenge.timesAttempted || 0} attempts</span>
            </div>
          </div>

          {reqText && (
            <>
              <Separator />
              <div>
                <h3 className="mb-2 font-medium">Requirements</h3>
                <div className="whitespace-pre-wrap text-sm text-muted-foreground">{reqText}</div>
              </div>
            </>
          )}

          {criteriaText && (
            <div>
              <h3 className="mb-2 font-medium">Evaluation Criteria</h3>
              <div className="whitespace-pre-wrap text-sm text-muted-foreground">
                {criteriaText}
              </div>
            </div>
          )}

          <Separator />

          <div className="flex gap-3">
            {activeSubmission ? (
              <Button asChild>
                <Link href={ROUTES.challengeSubmit(id)}>Continue Submission</Link>
              </Button>
            ) : (
              <Button onClick={handleStart} disabled={starting}>
                {starting ? 'Starting...' : 'Start Challenge'}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
