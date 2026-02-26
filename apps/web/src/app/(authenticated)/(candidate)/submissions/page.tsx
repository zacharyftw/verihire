'use client';

import { useState } from 'react';
import Link from 'next/link';
import { FileText } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/empty-state';
import { StatusBadge } from '@/components/status-badge';
import { useMySubmissions } from '@/hooks/use-submissions';
import { ROUTES, SUBMISSION_STATUS_LABELS, SUBMISSION_STATUS_COLORS } from '@/lib/constants';
import { formatRelativeTime } from '@/lib/utils';

export default function SubmissionsPage() {
  const [status, setStatus] = useState('');
  const { data, isLoading } = useMySubmissions({ status: status || undefined, limit: 50 });
  const submissions = data?.items || [];

  return (
    <div>
      <PageHeader
        title="My Submissions"
        description="Track your challenge submissions and results"
      />

      <div className="mb-6">
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
            <SelectItem value="SUBMITTED">Submitted</SelectItem>
            <SelectItem value="EVALUATING">Evaluating</SelectItem>
            <SelectItem value="EVALUATED">Evaluated</SelectItem>
            <SelectItem value="FAILED">Failed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <Skeleton className="h-12 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : !submissions.length ? (
        <EmptyState
          icon={FileText}
          title="No submissions yet"
          description="Start a challenge to see your submissions here"
        />
      ) : (
        <div className="space-y-3">
          {submissions.map(sub => (
            <Link
              key={sub.id}
              href={
                sub.status === 'IN_PROGRESS'
                  ? ROUTES.challengeSubmit(sub.challengeId)
                  : ROUTES.submissionResults(sub.id)
              }
            >
              <Card className="transition-shadow hover:shadow-md">
                <CardContent className="flex items-center justify-between p-4">
                  <div>
                    <p className="font-medium">{sub.challenge?.title || 'Challenge'}</p>
                    <p className="text-xs text-muted-foreground">
                      {sub.language && <span className="mr-3">{sub.language}</span>}
                      {sub.submittedAt
                        ? formatRelativeTime(sub.submittedAt)
                        : formatRelativeTime(sub.createdAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {sub.finalScore != null && (
                      <span className="text-sm font-medium">{Math.round(sub.finalScore)}%</span>
                    )}
                    <StatusBadge
                      status={sub.status}
                      labels={SUBMISSION_STATUS_LABELS}
                      colors={SUBMISSION_STATUS_COLORS}
                    />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
