'use client';

import { useParams } from 'next/navigation';
import { CheckCircle2, XCircle, Shield } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PageLoader } from '@/components/loading-spinner';
import { useVerifyCertificate } from '@/hooks/use-certificates';
import { formatDate } from '@/lib/utils';

export default function VerifyCertificatePage() {
  const params = useParams();
  const certNumber = params.certNumber as string;
  const { data, isLoading, error } = useVerifyCertificate(certNumber);

  if (isLoading) return <PageLoader />;

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Shield className="h-6 w-6 text-primary" />
          </div>
          <CardTitle>Certificate Verification</CardTitle>
        </CardHeader>
        <CardContent>
          {error || !data ? (
            <div className="space-y-3 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
                <XCircle className="h-8 w-8 text-red-600" />
              </div>
              <h3 className="text-lg font-medium">Certificate Not Found</h3>
              <p className="text-sm text-muted-foreground">
                No valid certificate found for number: {certNumber}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2 text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
                  <CheckCircle2 className="h-8 w-8 text-green-600" />
                </div>
                <h3 className="text-lg font-medium text-green-800">Valid Certificate</h3>
              </div>

              <div className="space-y-3 rounded-lg border p-4">
                <InfoRow label="Certificate #" value={data.certificateNumber} />
                <InfoRow label="Skill" value={data.skill?.name || data.skillId || '—'} />
                {data.grade && <InfoRow label="Grade" value={data.grade} />}
                <InfoRow
                  label="Score"
                  value={data.finalScore != null ? `${Math.round(data.finalScore)}%` : '—'}
                />
                <InfoRow label="Issued" value={data.issuedAt ? formatDate(data.issuedAt) : '—'} />
                {data.expiresAt && <InfoRow label="Expires" value={formatDate(data.expiresAt)} />}
                {data.blockchainHash && (
                  <InfoRow
                    label="Blockchain"
                    value={
                      <Badge variant="secondary" className="font-mono text-xs">
                        {data.blockchainHash.slice(0, 16)}...
                      </Badge>
                    }
                  />
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
