'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Search, MapPin, Briefcase, CheckCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/empty-state';
import { useCandidateSearch } from '@/hooks/use-candidates-search';
import { useDebounce } from '@/hooks/use-debounce';
import { ROUTES } from '@/lib/constants';

export default function CandidateSearchPage() {
  const [search, setSearch] = useState('');
  const [remotePreference, setRemotePreference] = useState('');
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [minExperience, setMinExperience] = useState('');

  const debouncedSearch = useDebounce(search, 300);

  const { data, isLoading } = useCandidateSearch({
    locations: debouncedSearch ? [debouncedSearch] : undefined,
    remotePreference: remotePreference || undefined,
    verifiedOnly: verifiedOnly || undefined,
    minExperience: minExperience ? parseInt(minExperience) : undefined,
  });

  const candidates = data?.items || data || [];

  return (
    <div>
      <PageHeader title="Search Candidates" description="Find and evaluate candidates" />

      <div className="mb-6 flex flex-wrap gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by location..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={remotePreference} onValueChange={setRemotePreference}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Remote" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any</SelectItem>
            <SelectItem value="REMOTE">Remote</SelectItem>
            <SelectItem value="HYBRID">Hybrid</SelectItem>
            <SelectItem value="ONSITE">Onsite</SelectItem>
            <SelectItem value="FLEXIBLE">Flexible</SelectItem>
          </SelectContent>
        </Select>
        <Select value={minExperience} onValueChange={setMinExperience}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Experience" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any</SelectItem>
            <SelectItem value="1">1+ years</SelectItem>
            <SelectItem value="3">3+ years</SelectItem>
            <SelectItem value="5">5+ years</SelectItem>
            <SelectItem value="10">10+ years</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant={verifiedOnly ? 'default' : 'outline'}
          size="sm"
          onClick={() => setVerifiedOnly(!verifiedOnly)}
          className="h-10"
        >
          <CheckCircle className="mr-1 h-4 w-4" />
          Verified
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <Skeleton className="h-16 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : !candidates.length ? (
        <EmptyState
          icon={Search}
          title="No candidates found"
          description="Try adjusting your filters"
        />
      ) : (
        <div className="space-y-3">
          {candidates.map((candidate: Record<string, unknown>) => {
            const c = candidate as {
              id: string;
              user?: { firstName: string; lastName: string };
              headline?: string;
              currentRole?: string;
              currentCompany?: string;
              locationCity?: string;
              yearsExperience?: number;
              skills?: Array<{ skillId: string; skill?: { name: string } }>;
              certificateCount?: number;
            };
            return (
              <Link key={c.id} href={ROUTES.candidateProfile(c.id)}>
                <Card className="transition-shadow hover:shadow-md">
                  <CardContent className="flex items-center justify-between p-4">
                    <div>
                      <p className="font-medium">
                        {c.user ? `${c.user.firstName} ${c.user.lastName}` : 'Unknown'}
                      </p>
                      {c.headline && <p className="text-sm text-muted-foreground">{c.headline}</p>}
                      <div className="mt-1 flex flex-wrap gap-2">
                        {c.locationCity && (
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <MapPin className="h-3 w-3" />
                            {c.locationCity}
                          </span>
                        )}
                        {c.yearsExperience != null && (
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Briefcase className="h-3 w-3" />
                            {c.yearsExperience}y exp
                          </span>
                        )}
                        {c.skills?.slice(0, 4).map(s => (
                          <Badge key={s.skillId} variant="secondary" className="text-xs">
                            {s.skill?.name || s.skillId}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <div className="text-right">
                      {c.certificateCount != null && c.certificateCount > 0 && (
                        <Badge variant="outline" className="text-xs">
                          {c.certificateCount} cert{c.certificateCount !== 1 ? 's' : ''}
                        </Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
