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

function parseJsonField(value: unknown): unknown {
  if (!value) return null;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
}

function RequirementsList({ data }: { data: unknown }) {
  const parsed = parseJsonField(data);
  if (!parsed) return null;

  // Array of strings (e.g. ["Implement a function...", ...])
  if (Array.isArray(parsed) && parsed.every(item => typeof item === 'string')) {
    return (
      <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
        {parsed.map((item: string, i: number) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    );
  }

  // Plain string
  if (typeof parsed === 'string') {
    return <p className="text-sm text-muted-foreground">{parsed}</p>;
  }

  // Fallback for other shapes
  return <p className="text-sm text-muted-foreground">{JSON.stringify(parsed, null, 2)}</p>;
}

function CriteriaList({ data }: { data: unknown }) {
  const parsed = parseJsonField(data);
  if (!parsed) return null;

  // Array of {name, weight} objects
  if (Array.isArray(parsed) && parsed.length > 0 && parsed[0]?.name) {
    return (
      <div className="space-y-2">
        {parsed.map((item: { name: string; weight: number }, i: number) => (
          <div key={i} className="flex items-center justify-between rounded-md border px-3 py-2">
            <span className="text-sm">{item.name}</span>
            <Badge variant="outline">{Math.round(item.weight * 100)}%</Badge>
          </div>
        ))}
      </div>
    );
  }

  // Fallback
  return <RequirementsList data={data} />;
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
              <span>
                Type:{' '}
                {challenge.type
                  ? challenge.type.charAt(0) + challenge.type.slice(1).toLowerCase()
                  : 'General'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Award className="h-4 w-4 text-muted-foreground" />
              <span>
                {challenge.timesAttempted || 0}{' '}
                {(challenge.timesAttempted || 0) === 1 ? 'attempt' : 'attempts'}
              </span>
            </div>
          </div>

          {challenge.requirements && (
            <>
              <Separator />
              <div>
                <h3 className="mb-2 font-medium">Requirements</h3>
                <RequirementsList data={challenge.requirements} />
              </div>
            </>
          )}

          {challenge.evaluationCriteria && (
            <div>
              <h3 className="mb-2 font-medium">Evaluation Criteria</h3>
              <CriteriaList data={challenge.evaluationCriteria} />
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
