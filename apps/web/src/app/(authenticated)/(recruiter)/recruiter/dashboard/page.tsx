'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Briefcase,
  Users,
  Eye,
  TrendingUp,
  Search,
  MapPin,
  CheckCircle,
  Award,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/empty-state';
import { useRecruiterDashboard } from '@/hooks/use-recruiter';
import { useCandidateSearch } from '@/hooks/use-candidates-search';
import { useDebounce } from '@/hooks/use-debounce';
import { ROUTES } from '@/lib/constants';

type CandidateRow = {
  id: string;
  user?: { firstName: string; lastName: string };
  headline?: string;
  locationCity?: string;
  yearsExperience?: number;
  remotePreference?: string;
  candidateSkills?: Array<{ skillId: string; skill?: { name: string } }>;
  _count?: { certificates: number };
};

export default function RecruiterDashboardPage() {
  const { data, isLoading } = useRecruiterDashboard();

  const [search, setSearch] = useState('');
  const [remotePreference, setRemotePreference] = useState('');
  const [minExperience, setMinExperience] = useState('');
  const [verifiedOnly, setVerifiedOnly] = useState(false);

  const debouncedSearch = useDebounce(search, 300);

  const { data: candidateData, isLoading: candidatesLoading } = useCandidateSearch({
    locations: debouncedSearch ? [debouncedSearch] : undefined,
    remotePreference: remotePreference && remotePreference !== 'all' ? remotePreference : undefined,
    minExperience: minExperience && minExperience !== 'all' ? parseInt(minExperience) : undefined,
    verifiedOnly: verifiedOnly || undefined,
    limit: 20,
  });

  const candidates: CandidateRow[] = (candidateData?.items ?? []) as CandidateRow[];

  const stats = [
    { label: 'Active Jobs', value: data?.activeJobs ?? 0, icon: Briefcase },
    { label: 'Total Candidates', value: data?.totalCandidates ?? 0, icon: Users },
    { label: 'Total Views', value: data?.totalViews ?? 0, icon: Eye },
    {
      label: 'Hire Rate',
      value: data?.hireRate ? `${Math.round(data.hireRate)}%` : '—',
      icon: TrendingUp,
    },
  ];

  return (
    <div>
      <PageHeader title="Recruiter Dashboard" description="Overview of your hiring activity" />

      {/* Stat Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map(stat => (
          <Card key={stat.label}>
            <CardContent className="flex items-center gap-4 p-6">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <stat.icon className="h-5 w-5 text-primary" />
              </div>
              <div>
                {isLoading ? (
                  <Skeleton className="h-7 w-16" />
                ) : (
                  <p className="text-2xl font-bold">{stat.value}</p>
                )}
                <p className="text-xs text-muted-foreground">{stat.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Candidate Table */}
      <Card className="mt-8">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">All Candidates</CardTitle>
          <Button variant="ghost" size="sm" asChild>
            <Link href={ROUTES.candidateSearch}>Advanced search</Link>
          </Button>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="mb-5 flex flex-wrap gap-3">
            <div className="relative min-w-48 flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Filter by location..."
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
              Verified only
            </Button>
          </div>

          {/* Table */}
          {candidatesLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : !candidates.length ? (
            <EmptyState
              icon={Users}
              title="No candidates found"
              description="Try adjusting your filters"
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">Candidate</th>
                    <th className="pb-2 pr-4 font-medium">Location</th>
                    <th className="pb-2 pr-4 font-medium">Experience</th>
                    <th className="pb-2 pr-4 font-medium">Skills</th>
                    <th className="pb-2 font-medium">Certs</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {candidates.map(c => (
                    <tr key={c.id} className="group transition-colors hover:bg-accent/50">
                      <td className="py-3 pr-4">
                        <Link href={ROUTES.candidateProfile(c.id)} className="block">
                          <p className="font-medium group-hover:underline">
                            {c.user ? `${c.user.firstName} ${c.user.lastName}` : 'Unknown'}
                          </p>
                          {c.headline && (
                            <p className="max-w-48 truncate text-xs text-muted-foreground">
                              {c.headline}
                            </p>
                          )}
                        </Link>
                      </td>
                      <td className="py-3 pr-4 text-muted-foreground">
                        {c.locationCity ? (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3 shrink-0" />
                            {c.locationCity}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="py-3 pr-4 text-muted-foreground">
                        {c.yearsExperience != null ? `${c.yearsExperience}y` : '—'}
                      </td>
                      <td className="py-3 pr-4">
                        <div className="flex flex-wrap gap-1">
                          {c.candidateSkills?.slice(0, 3).map(s => (
                            <Badge key={s.skillId} variant="secondary" className="text-xs">
                              {s.skill?.name || s.skillId}
                            </Badge>
                          ))}
                          {(c.candidateSkills?.length ?? 0) > 3 && (
                            <Badge variant="outline" className="text-xs">
                              +{c.candidateSkills!.length - 3}
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="py-3">
                        {(c._count?.certificates ?? 0) > 0 ? (
                          <span className="flex items-center gap-1 text-green-600">
                            <Award className="h-3 w-3" />
                            {c._count!.certificates}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
