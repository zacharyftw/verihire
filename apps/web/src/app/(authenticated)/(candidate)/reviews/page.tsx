'use client';

import Link from 'next/link';
import { ClipboardCheck } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/empty-state';
import { usePendingReviews } from '@/hooks/use-reviews';
import { ROUTES } from '@/lib/constants';
import { formatDate } from '@/lib/utils';

interface PendingReview {
  id: string;
  submissionId: string;
  status: string;
  assignedAt?: string;
  deadline?: string;
  submission?: {
    challenge?: { title: string; difficulty?: string };
    language?: string;
  };
}

export default function ReviewsPage() {
  const { data, isLoading } = usePendingReviews();
  const reviews: PendingReview[] = (data?.items || data || []) as PendingReview[];

  return (
    <div>
      <PageHeader title="Peer Reviews" description="Review submissions from other candidates" />

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <Skeleton className="h-16 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : !reviews.length ? (
        <EmptyState
          icon={ClipboardCheck}
          title="No pending reviews"
          description="When submissions are assigned to you for review, they will appear here"
        />
      ) : (
        <div className="space-y-3">
          {reviews.map(review => (
            <Link key={review.id} href={ROUTES.reviewDetail(review.id)}>
              <Card className="transition-shadow hover:shadow-md">
                <CardContent className="flex items-center justify-between p-4">
                  <div>
                    <p className="font-medium">
                      {review.submission?.challenge?.title || 'Submission Review'}
                    </p>
                    <div className="mt-1 flex gap-3 text-xs text-muted-foreground">
                      {review.submission?.language && <span>{review.submission.language}</span>}
                      {review.submission?.challenge?.difficulty && (
                        <Badge variant="outline" className="text-xs">
                          {review.submission.challenge.difficulty}
                        </Badge>
                      )}
                      {review.assignedAt && <span>Assigned: {formatDate(review.assignedAt)}</span>}
                    </div>
                  </div>
                  <div className="text-right">
                    {review.deadline && (
                      <p className="text-xs text-muted-foreground">
                        Due: {formatDate(review.deadline)}
                      </p>
                    )}
                    <Badge variant="secondary" className="mt-1">
                      {review.status === 'PENDING' ? 'Pending' : review.status}
                    </Badge>
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
