'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  MapPin,
  Briefcase,
  Globe,
  Award,
  ExternalLink,
  BarChart3,
  MessageSquare,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { PageLoader } from '@/components/loading-spinner';
import { ROUTES, DIFFICULTY_LABELS } from '@/lib/constants';
import { useDomainScores, type DomainScore } from '@/hooks/use-candidate';
import { startConversation } from '@/hooks/use-messages';
import { toast } from '@/hooks/use-toast';
import useSWR from 'swr';

interface CandidateDetail {
  id: string;
  userId: string;
  headline?: string;
  bio?: string;
  currentRole?: string;
  currentCompany?: string;
  locationCity?: string;
  yearsExperience?: number;
  remotePreference?: string;
  linkedinUrl?: string;
  githubUrl?: string;
  portfolioUrl?: string;
  user?: { firstName: string; lastName: string; email: string };
  skills?: Array<{ skillId: string; skill?: { name: string }; verifiedLevel?: string }>;
  certificates?: Array<{
    id: string;
    certificateNumber: string;
    challenge?: { title: string };
    skill?: { name: string };
    score: number;
    metadata?: {
      title?: string;
      certificateType?: string;
      domainTag?: string;
      domainLevel?: string;
    };
  }>;
}

export default function CandidateDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { data: candidate, isLoading } = useSWR<CandidateDetail>(`/candidates/${id}/profile`);
  const { data: domainScoresData } = useDomainScores(id);
  const [messaging, setMessaging] = useState(false);

  const handleMessage = async () => {
    if (!candidate?.userId) return;
    setMessaging(true);
    try {
      await startConversation(candidate.userId);
      router.push('/messages');
    } catch (err) {
      toast({
        title: 'Failed to start conversation',
        variant: 'destructive',
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setMessaging(false);
    }
  };

  if (isLoading) return <PageLoader />;
  if (!candidate) return <div>Candidate not found</div>;

  const fullName = candidate.user
    ? `${candidate.user.firstName} ${candidate.user.lastName}`
    : 'Unknown';

  return (
    <div className="mx-auto max-w-3xl">
      <Button variant="ghost" size="sm" className="mb-4" asChild>
        <Link href={ROUTES.candidateSearch}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Search
        </Link>
      </Button>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle>{fullName}</CardTitle>
              {candidate.headline && (
                <p className="mt-1 text-sm text-muted-foreground">{candidate.headline}</p>
              )}
            </div>
            <Button variant="outline" onClick={handleMessage} disabled={messaging}>
              <MessageSquare className="mr-2 h-4 w-4" />
              {messaging ? 'Opening...' : 'Message Candidate'}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
            {candidate.locationCity && (
              <span className="flex items-center gap-1">
                <MapPin className="h-4 w-4" />
                {candidate.locationCity}
              </span>
            )}
            {candidate.currentRole && (
              <span className="flex items-center gap-1">
                <Briefcase className="h-4 w-4" />
                {candidate.currentRole}
                {candidate.currentCompany && ` at ${candidate.currentCompany}`}
              </span>
            )}
            {candidate.yearsExperience != null && (
              <span>{candidate.yearsExperience} years experience</span>
            )}
            {candidate.remotePreference && (
              <Badge variant="outline">{candidate.remotePreference}</Badge>
            )}
          </div>

          {candidate.bio && (
            <div>
              <h3 className="mb-2 font-medium">About</h3>
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">{candidate.bio}</p>
            </div>
          )}

          {(candidate.linkedinUrl || candidate.githubUrl || candidate.portfolioUrl) && (
            <div className="flex flex-wrap gap-3">
              {candidate.linkedinUrl && (
                <Button variant="outline" size="sm" asChild>
                  <a href={candidate.linkedinUrl} target="_blank" rel="noopener noreferrer">
                    <Globe className="mr-1 h-4 w-4" />
                    LinkedIn
                    <ExternalLink className="ml-1 h-3 w-3" />
                  </a>
                </Button>
              )}
              {candidate.githubUrl && (
                <Button variant="outline" size="sm" asChild>
                  <a href={candidate.githubUrl} target="_blank" rel="noopener noreferrer">
                    <Globe className="mr-1 h-4 w-4" />
                    GitHub
                    <ExternalLink className="ml-1 h-3 w-3" />
                  </a>
                </Button>
              )}
              {candidate.portfolioUrl && (
                <Button variant="outline" size="sm" asChild>
                  <a href={candidate.portfolioUrl} target="_blank" rel="noopener noreferrer">
                    <Globe className="mr-1 h-4 w-4" />
                    Portfolio
                    <ExternalLink className="ml-1 h-3 w-3" />
                  </a>
                </Button>
              )}
            </div>
          )}

          {candidate.skills && candidate.skills.length > 0 && (
            <>
              <Separator />
              <div>
                <h3 className="mb-2 font-medium">Skills</h3>
                <div className="flex flex-wrap gap-2">
                  {candidate.skills.map(s => (
                    <Badge key={s.skillId} variant="secondary">
                      {s.skill?.name || s.skillId}
                      {s.verifiedLevel && (
                        <span className="ml-1 text-xs opacity-70">{s.verifiedLevel}</span>
                      )}
                    </Badge>
                  ))}
                </div>
              </div>
            </>
          )}

          {domainScoresData?.domains && Object.keys(domainScoresData.domains).length > 0 && (
            <>
              <Separator />
              <div>
                <h3 className="mb-2 flex items-center gap-2 font-medium">
                  <BarChart3 className="h-4 w-4" />
                  Verified Domain Scores
                </h3>
                <div className="space-y-3">
                  {Object.entries(domainScoresData.domains)
                    .sort(([, a], [, b]) => (b as DomainScore).score - (a as DomainScore).score)
                    .map(([name, domain]) => {
                      const d = domain as DomainScore;
                      return (
                        <div key={name} className="rounded-lg border p-3">
                          <div className="mb-1 flex items-center justify-between">
                            <span className="text-sm font-medium">{name}</span>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-xs">
                                {DIFFICULTY_LABELS[d.level] || d.level}
                              </Badge>
                              <span className="text-sm font-semibold">{Math.round(d.score)}%</span>
                            </div>
                          </div>
                          <Progress value={d.score} className="h-2" />
                          <p className="mt-1 text-xs text-muted-foreground">
                            {d.count} challenge{d.count !== 1 ? 's' : ''} completed
                          </p>
                        </div>
                      );
                    })}
                </div>
              </div>
            </>
          )}

          {candidate.certificates && candidate.certificates.length > 0 && (
            <>
              <Separator />
              <div>
                <h3 className="mb-2 font-medium">Certificates</h3>
                <div className="space-y-2">
                  {candidate.certificates.map(cert => (
                    <div
                      key={cert.id}
                      className="flex items-center justify-between rounded-lg border p-3"
                    >
                      <div className="flex items-center gap-2">
                        <Award className="h-4 w-4 text-primary" />
                        <div>
                          <p className="text-sm font-medium">
                            {cert.metadata?.title ??
                              cert.skill?.name ??
                              cert.challenge?.title ??
                              'Certificate'}
                          </p>
                          <p className="text-xs text-muted-foreground">#{cert.certificateNumber}</p>
                        </div>
                      </div>
                      <Badge>{cert.score}%</Badge>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
