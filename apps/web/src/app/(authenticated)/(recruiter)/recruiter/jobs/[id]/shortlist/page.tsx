'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, GripVertical, Star, Trash2, User } from 'lucide-react';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PageLoader } from '@/components/loading-spinner';
import { EmptyState } from '@/components/empty-state';
import { ConfirmDialog } from '@/components/confirm-dialog';
import {
  useJob,
  useJobShortlist,
  updateShortlistEntry,
  removeFromShortlist,
} from '@/hooks/use-jobs';
import { ROUTES, SHORTLIST_STAGE_LABELS, SHORTLIST_STAGE_COLORS } from '@/lib/constants';
import { toast } from '@/hooks/use-toast';
import { useState } from 'react';
import type { ShortlistStage } from '@verihire/types';

const STAGES: ShortlistStage[] = [
  'SHORTLISTED',
  'SCREENING',
  'INTERVIEW',
  'ASSESSMENT',
  'OFFER',
  'HIRED',
  'REJECTED',
];

interface ShortlistItem {
  id: string;
  candidateId: string;
  stage: ShortlistStage;
  notes: string | null;
  rating: number | null;
  candidate?: {
    id: string;
    user?: { firstName: string; lastName: string; email: string };
    headline?: string;
    currentRole?: string;
    currentCompany?: string;
  };
}

export default function ShortlistPage() {
  const params = useParams();
  const jobId = params.id as string;
  const { data: job } = useJob(jobId);
  const { data: shortlistData, isLoading, mutate } = useJobShortlist(jobId);
  const items: ShortlistItem[] = (shortlistData?.items || shortlistData || []) as ShortlistItem[];
  const [removeTarget, setRemoveTarget] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);

  async function onDragEnd(result: DropResult) {
    if (!result.destination) return;
    const newStage = result.destination.droppableId as ShortlistStage;
    const candidateId = result.draggableId;

    const item = items.find(i => i.candidateId === candidateId);
    if (!item || item.stage === newStage) return;

    try {
      await updateShortlistEntry(jobId, candidateId, { stage: newStage });
      await mutate();
    } catch {
      toast({ title: 'Failed to update stage', variant: 'destructive' });
    }
  }

  async function handleRemove() {
    if (!removeTarget) return;
    setRemoving(true);
    try {
      await removeFromShortlist(jobId, removeTarget);
      await mutate();
      toast({ title: 'Removed from shortlist' });
    } catch {
      toast({ title: 'Failed to remove', variant: 'destructive' });
    } finally {
      setRemoving(false);
      setRemoveTarget(null);
    }
  }

  if (isLoading) return <PageLoader />;

  const grouped = STAGES.reduce(
    (acc, stage) => {
      acc[stage] = items.filter(i => i.stage === stage);
      return acc;
    },
    {} as Record<ShortlistStage, ShortlistItem[]>
  );

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href={ROUTES.jobDetail(jobId)}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Job
          </Link>
        </Button>
        {job && <span className="text-sm text-muted-foreground">{job.title}</span>}
      </div>

      <h1 className="mb-6 text-2xl font-bold">Shortlist Pipeline</h1>

      {!items.length ? (
        <EmptyState
          icon={User}
          title="No candidates shortlisted"
          description="Search for candidates and add them to this job's shortlist"
          action={
            <Button asChild>
              <Link href={ROUTES.candidateSearch}>Search Candidates</Link>
            </Button>
          }
        />
      ) : (
        <DragDropContext onDragEnd={onDragEnd}>
          <div className="flex gap-4 overflow-x-auto pb-4">
            {STAGES.map(stage => (
              <div key={stage} className="w-64 shrink-0">
                <div className="mb-2 flex items-center gap-2">
                  <Badge className={SHORTLIST_STAGE_COLORS[stage]}>
                    {SHORTLIST_STAGE_LABELS[stage]}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{grouped[stage].length}</span>
                </div>
                <Droppable droppableId={stage}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={`min-h-[120px] space-y-2 rounded-lg border border-dashed p-2 transition-colors ${
                        snapshot.isDraggingOver ? 'border-primary bg-primary/5' : 'border-muted'
                      }`}
                    >
                      {grouped[stage].map((item, index) => (
                        <Draggable
                          key={item.candidateId}
                          draggableId={item.candidateId}
                          index={index}
                        >
                          {dragProvided => (
                            <Card
                              ref={dragProvided.innerRef}
                              {...dragProvided.draggableProps}
                              className="shadow-sm"
                            >
                              <CardContent className="p-3">
                                <div className="flex items-start gap-2">
                                  <div
                                    {...dragProvided.dragHandleProps}
                                    className="mt-0.5 cursor-grab text-muted-foreground"
                                  >
                                    <GripVertical className="h-4 w-4" />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-medium">
                                      {item.candidate?.user
                                        ? `${item.candidate.user.firstName} ${item.candidate.user.lastName}`
                                        : 'Unknown'}
                                    </p>
                                    {item.candidate?.currentRole && (
                                      <p className="truncate text-xs text-muted-foreground">
                                        {item.candidate.currentRole}
                                        {item.candidate.currentCompany &&
                                          ` at ${item.candidate.currentCompany}`}
                                      </p>
                                    )}
                                    {item.rating && (
                                      <div className="mt-1 flex items-center gap-1">
                                        <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                                        <span className="text-xs">{item.rating}</span>
                                      </div>
                                    )}
                                  </div>
                                  <button
                                    onClick={() => setRemoveTarget(item.candidateId)}
                                    className="text-muted-foreground hover:text-destructive"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </CardContent>
                            </Card>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </div>
            ))}
          </div>
        </DragDropContext>
      )}

      <ConfirmDialog
        open={!!removeTarget}
        onOpenChange={open => !open && setRemoveTarget(null)}
        title="Remove from Shortlist"
        description="This candidate will be removed from this job's shortlist."
        confirmLabel="Remove"
        variant="destructive"
        onConfirm={handleRemove}
        loading={removing}
      />
    </div>
  );
}
