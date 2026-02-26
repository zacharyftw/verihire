'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { PageLoader } from '@/components/loading-spinner';
import { StatusBadge } from '@/components/status-badge';
import { useSubmissionResults } from '@/hooks/use-submissions';
import { ROUTES, SUBMISSION_STATUS_LABELS, SUBMISSION_STATUS_COLORS } from '@/lib/constants';

export default function SubmissionResultsPage() {
  const params = useParams();
  const id = params.id as string;
  const { data, isLoading } = useSubmissionResults(id);

  if (isLoading) return <PageLoader />;
  if (!data) return <div>Submission not found</div>;

  const submission = data.submission || data;
  const evaluation = data.evaluation || data;

  const isPassing = submission.finalScore != null && submission.finalScore >= 70;

  return (
    <div className="mx-auto max-w-3xl">
      <Button variant="ghost" size="sm" className="mb-4" asChild>
        <Link href={ROUTES.submissions}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Submissions
        </Link>
      </Button>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle>{submission.challenge?.title || 'Submission Results'}</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">{submission.language}</p>
            </div>
            <StatusBadge
              status={submission.status}
              labels={SUBMISSION_STATUS_LABELS}
              colors={SUBMISSION_STATUS_COLORS}
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {submission.status === 'EVALUATING' && (
            <div className="flex items-center gap-3 rounded-lg bg-blue-50 p-4 text-blue-800">
              <Clock className="h-5 w-5" />
              <p className="text-sm">
                Your submission is being evaluated. Results will appear shortly.
              </p>
            </div>
          )}

          {submission.finalScore != null && (
            <>
              <div className="text-center">
                <div
                  className={`inline-flex items-center gap-2 rounded-full px-4 py-2 ${isPassing ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}
                >
                  {isPassing ? (
                    <CheckCircle2 className="h-5 w-5" />
                  ) : (
                    <XCircle className="h-5 w-5" />
                  )}
                  <span className="text-lg font-bold">{Math.round(submission.finalScore)}%</span>
                  <span className="text-sm">{isPassing ? 'Passed' : 'Needs Improvement'}</span>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <ScoreCard label="AI Score" score={submission.aiScore} />
                <ScoreCard label="Peer Score" score={submission.peerScore} />
                <ScoreCard label="Percentile" score={submission.percentile} suffix="th" />
              </div>
            </>
          )}

          {evaluation?.feedback && (
            <>
              <Separator />
              <div>
                <h3 className="mb-2 font-medium">Feedback</h3>
                <div className="whitespace-pre-wrap text-sm text-muted-foreground">
                  {evaluation.feedback}
                </div>
              </div>
            </>
          )}

          {evaluation?.strengths && (
            <div>
              <h3 className="mb-2 font-medium">Strengths</h3>
              <div className="whitespace-pre-wrap text-sm text-muted-foreground">
                {Array.isArray(evaluation.strengths)
                  ? evaluation.strengths.join('\n')
                  : evaluation.strengths}
              </div>
            </div>
          )}

          {evaluation?.improvements && (
            <div>
              <h3 className="mb-2 font-medium">Areas for Improvement</h3>
              <div className="whitespace-pre-wrap text-sm text-muted-foreground">
                {Array.isArray(evaluation.improvements)
                  ? evaluation.improvements.join('\n')
                  : evaluation.improvements}
              </div>
            </div>
          )}

          {submission.finalScore != null && isPassing && (
            <>
              <Separator />
              <div className="text-center">
                <Button asChild>
                  <Link href={ROUTES.certificates}>View Certificates</Link>
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ScoreCard({
  label,
  score,
  suffix = '%',
}: {
  label: string;
  score?: number | null;
  suffix?: string;
}) {
  return (
    <div className="rounded-lg border p-4 text-center">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold">
        {score != null ? `${Math.round(score)}${suffix}` : '—'}
      </p>
      {score != null && <Progress value={score} className="mt-2 h-2" />}
    </div>
  );
}
