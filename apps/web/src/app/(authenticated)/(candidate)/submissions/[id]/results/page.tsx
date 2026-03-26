'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2, XCircle, Clock, ShieldAlert } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { PageLoader } from '@/components/loading-spinner';
import { StatusBadge } from '@/components/status-badge';
import { useSubmissionResults } from '@/hooks/use-submissions';
import {
  ROUTES,
  PASSING_SCORE,
  SUBMISSION_STATUS_LABELS,
  SUBMISSION_STATUS_COLORS,
} from '@/lib/constants';

export default function SubmissionResultsPage() {
  const params = useParams();
  const id = params.id as string;
  const { data, isLoading } = useSubmissionResults(id);

  if (isLoading) return <PageLoader />;
  if (!data) return <div>Submission not found</div>;

  const submission = data.submission || data;
  const evaluation = data.evaluation || data;

  const displayScore = submission.finalScore ?? submission.aiScore;
  const isPassing = displayScore != null && displayScore >= PASSING_SCORE;
  const isWaiting = ['SUBMITTED', 'EVALUATING'].includes(submission.status);
  const hasResults = displayScore != null;

  // Check for plagiarism flag in evaluation staticAnalysis
  const staticAnalysis = evaluation?.staticAnalysis as
    | {
        plagiarism?: { flagged?: boolean };
        integrityCompromised?: boolean;
        integrityFlags?: string[];
      }
    | undefined;
  const isPlagiarized = staticAnalysis?.plagiarism?.flagged === true;
  const isIntegrityCompromised = staticAnalysis?.integrityCompromised === true;
  const integrityFlags = staticAnalysis?.integrityFlags || [];

  const flagLabels: Record<string, string> = {
    plagiarism: 'Code similarity with another submission',
    ai_generated: 'AI-generated code detected',
    suspicious_timing: 'Suspiciously fast completion',
    excessive_paste: 'Excessive copy-paste detected',
  };

  // Parse criteria scores
  const criteriaScores = evaluation?.criteriaScores || {};
  const criteriaEntries = Object.entries(criteriaScores) as [
    string,
    { score: number; maxScore: number; feedback?: string },
  ][];

  // Parse suggestions
  const suggestions: string[] = evaluation?.suggestions || [];

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
          {isIntegrityCompromised && (
            <div className="flex items-start gap-3 rounded-lg border border-red-300 bg-red-50 p-4">
              <ShieldAlert className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-600" />
              <div>
                <h3 className="font-semibold text-red-800">Submission Integrity Flagged</h3>
                <p className="mt-1 text-sm text-red-700">
                  This submission was flagged for:{' '}
                  {integrityFlags.map(f => flagLabels[f] || f).join(', ')}. It will not count toward
                  your domain score.
                </p>
              </div>
            </div>
          )}

          {isPlagiarized && !isIntegrityCompromised && (
            <div className="flex items-start gap-3 rounded-lg border border-red-300 bg-red-50 p-4">
              <ShieldAlert className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-600" />
              <div>
                <h3 className="font-semibold text-red-800">Plagiarism Detected</h3>
                <p className="mt-1 text-sm text-red-700">
                  This submission has been flagged for similarity with another submission. It will
                  not count toward your domain score.
                </p>
              </div>
            </div>
          )}

          {isWaiting && !hasResults && (
            <div className="flex flex-col items-center gap-4 py-8 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-100">
                <Clock className="h-8 w-8 animate-pulse text-blue-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold">Your submission is being evaluated</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Our AI is analyzing your submission for correctness, quality, and depth.
                  <br />
                  This usually takes a few moments.
                </p>
              </div>
              <div className="w-full max-w-xs">
                <Progress value={submission.status === 'EVALUATING' ? 60 : 30} className="h-2" />
                <p className="mt-2 text-xs text-muted-foreground">
                  {submission.status === 'EVALUATING'
                    ? 'Analyzing your submission...'
                    : 'Queued for evaluation...'}
                </p>
              </div>
            </div>
          )}

          {submission.status === 'FAILED' && !hasResults && (
            <div className="flex flex-col items-center gap-4 py-8 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
                <XCircle className="h-8 w-8 text-red-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold">Evaluation Failed</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Something went wrong while evaluating your submission.
                  <br />
                  Please try submitting again or contact support.
                </p>
              </div>
            </div>
          )}

          {hasResults && !isPlagiarized && !isIntegrityCompromised && (
            <>
              {/* Overall Score */}
              <div className="text-center">
                <div
                  className={`inline-flex items-center gap-2 rounded-full px-4 py-2 ${isPassing ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}
                >
                  {isPassing ? (
                    <CheckCircle2 className="h-5 w-5" />
                  ) : (
                    <XCircle className="h-5 w-5" />
                  )}
                  <span className="text-lg font-bold">{Math.round(displayScore)}%</span>
                  <span className="text-sm">{isPassing ? 'Passed' : 'Needs Improvement'}</span>
                </div>
              </div>

              {/* Criteria Breakdown */}
              {criteriaEntries.length > 0 && (
                <>
                  <Separator />
                  <div>
                    <h3 className="mb-3 font-medium">Score Breakdown</h3>
                    <div className="space-y-3">
                      {criteriaEntries.map(([key, val]) => (
                        <div key={key} className="rounded-lg border p-3">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium capitalize">
                              {key
                                .replace(/_/g, ' ')
                                .replace(/([A-Z])/g, ' $1')
                                .trim()}
                            </span>
                            <Badge variant="secondary">
                              {val.score}/{val.maxScore}
                            </Badge>
                          </div>
                          <Progress
                            value={(val.score / val.maxScore) * 100}
                            className="mt-2 h-1.5"
                          />
                          {val.feedback && (
                            <p className="mt-2 text-xs text-muted-foreground">{val.feedback}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </>
          )}

          {/* Feedback */}
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

          {/* Suggestions */}
          {suggestions.length > 0 && (
            <div>
              <h3 className="mb-2 font-medium">Suggestions for Improvement</h3>
              <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                {suggestions.map((s: string, i: number) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          )}

          {hasResults && isPassing && (
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
