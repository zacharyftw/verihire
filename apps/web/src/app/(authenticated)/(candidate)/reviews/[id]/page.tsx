'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Send } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { PageLoader } from '@/components/loading-spinner';
import { useReview, submitReview } from '@/hooks/use-reviews';
import { reviewSchema, type ReviewValues } from '@/lib/validations';
import { ROUTES } from '@/lib/constants';
import { toast } from '@/hooks/use-toast';

interface ReviewDetail {
  id: string;
  status: string;
  submission?: {
    id: string;
    code?: string;
    language?: string;
    challenge?: {
      title: string;
      description?: string;
      difficulty?: string;
    };
  };
}

export default function ReviewDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { data, isLoading } = useReview(id);
  const review = data as ReviewDetail | undefined;
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<ReviewValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(reviewSchema) as any,
    defaultValues: {
      overallScore: 0,
      strengths: '',
      areasForImprovement: '',
      suggestions: '',
      confidenceLevel: 'MEDIUM',
    },
  });

  async function onSubmit(values: ReviewValues) {
    setSubmitting(true);
    try {
      await submitReview(id, values);
      toast({ title: 'Review submitted' });
      router.push(ROUTES.reviews);
    } catch (err) {
      toast({
        title: 'Failed to submit review',
        variant: 'destructive',
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setSubmitting(false);
    }
  }

  if (isLoading) return <PageLoader />;
  if (!review) return <div>Review not found</div>;

  const alreadySubmitted = review.status !== 'PENDING' && review.status !== 'IN_PROGRESS';

  return (
    <div className="mx-auto max-w-3xl">
      <Button variant="ghost" size="sm" className="mb-4" asChild>
        <Link href={ROUTES.reviews}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Reviews
        </Link>
      </Button>

      {review.submission?.challenge && (
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-start justify-between">
              <CardTitle>{review.submission.challenge.title}</CardTitle>
              {review.submission.challenge.difficulty && (
                <Badge variant="secondary">{review.submission.challenge.difficulty}</Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {review.submission.challenge.description && (
              <p className="text-sm text-muted-foreground">
                {review.submission.challenge.description}
              </p>
            )}
            {review.submission.code && (
              <div>
                <h4 className="mb-2 text-sm font-medium">
                  Submitted Code
                  {review.submission.language && (
                    <Badge variant="outline" className="ml-2 text-xs">
                      {review.submission.language}
                    </Badge>
                  )}
                </h4>
                <pre className="max-h-96 overflow-auto rounded-lg bg-muted p-4 text-sm">
                  <code>{review.submission.code}</code>
                </pre>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {alreadySubmitted ? (
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-muted-foreground">This review has already been submitted.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Submit Your Review</CardTitle>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="overallScore"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Overall Score (0-100)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          {...field}
                          onChange={e => field.onChange(Number(e.target.value))}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="strengths"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Strengths</FormLabel>
                      <FormControl>
                        <Textarea
                          rows={3}
                          placeholder="What did the candidate do well?"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="areasForImprovement"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Areas for Improvement</FormLabel>
                      <FormControl>
                        <Textarea rows={3} placeholder="What could be improved?" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="suggestions"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Suggestions (optional)</FormLabel>
                      <FormControl>
                        <Textarea rows={2} placeholder="Any specific suggestions..." {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="confidenceLevel"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Confidence Level</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="LOW">Low</SelectItem>
                          <SelectItem value="MEDIUM">Medium</SelectItem>
                          <SelectItem value="HIGH">High</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />

                <Separator />

                <Button type="submit" disabled={submitting}>
                  <Send className="mr-2 h-4 w-4" />
                  {submitting ? 'Submitting...' : 'Submit Review'}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
