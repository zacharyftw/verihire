'use client';

import { Award, Download, Share2, ExternalLink } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/empty-state';
import { useMyCertificates, getCertificateDownloadUrl } from '@/hooks/use-certificates';
import { formatDate } from '@/lib/utils';
import { ROUTES } from '@/lib/constants';

export default function CertificatesPage() {
  const { data, isLoading } = useMyCertificates();
  const certificates = data?.items || [];

  function handleShare(certNumber: string) {
    const url = `${window.location.origin}${ROUTES.verify(certNumber)}`;
    navigator.clipboard.writeText(url);
  }

  return (
    <div>
      <PageHeader title="My Certificates" description="Your earned skill certificates" />

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <Skeleton className="h-32 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : !certificates.length ? (
        <EmptyState
          icon={Award}
          title="No certificates yet"
          description="Complete challenges and earn passing scores to receive certificates"
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {certificates.map(cert => (
            <Card key={cert.id} className="overflow-hidden">
              <div className="bg-gradient-to-r from-primary-600 to-primary-800 p-4 text-white">
                <div className="flex items-center gap-2">
                  <Award className="h-5 w-5" />
                  <span className="text-sm font-medium">VeriHire Certificate</span>
                </div>
                <p className="mt-2 text-lg font-bold">{cert.skill?.name || 'Skill Certificate'}</p>
              </div>
              <CardContent className="space-y-3 p-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Certificate #</span>
                  <span className="font-mono text-xs">{cert.certificateNumber}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Score</span>
                  <span className="font-medium">
                    {(cert.finalScore ?? cert.aiScore) != null
                      ? `${Math.round(cert.finalScore ?? cert.aiScore!)}%`
                      : '—'}
                  </span>
                </div>
                {cert.grade && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Grade</span>
                    <Badge variant="secondary">{cert.grade}</Badge>
                  </div>
                )}
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Issued</span>
                  <span>{cert.issuedAt ? formatDate(cert.issuedAt) : '—'}</span>
                </div>
                {cert.expiresAt && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Expires</span>
                    <span>{formatDate(cert.expiresAt)}</span>
                  </div>
                )}
                <div className="flex gap-2 pt-2">
                  <Button size="sm" variant="outline" className="flex-1" asChild>
                    <a
                      href={getCertificateDownloadUrl(cert.id)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Download className="mr-1 h-3 w-3" />
                      Download
                    </a>
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleShare(cert.certificateNumber)}
                  >
                    <Share2 className="h-3 w-3" />
                  </Button>
                  <Button size="sm" variant="outline" asChild>
                    <a
                      href={ROUTES.verify(cert.certificateNumber)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
