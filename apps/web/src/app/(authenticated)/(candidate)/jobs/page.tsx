'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Briefcase, MapPin, Building2, DollarSign } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/page-header';
import { SearchInput } from '@/components/search-input';
import { EmptyState } from '@/components/empty-state';
import { useJobSearch } from '@/hooks/use-jobs';
import { useMyApplications } from '@/hooks/use-applications';
import { useDebounce } from '@/hooks/use-debounce';
import { ROUTES } from '@/lib/constants';

const APP_STATUS_COLORS: Record<string, string> = {
  APPLIED: 'bg-blue-500 text-white',
  TESTING: 'bg-yellow-500 text-white',
  COMPLETED: 'bg-green-500 text-white',
  SHORTLISTED: 'bg-emerald-500 text-white',
  REJECTED: 'bg-red-500 text-white',
  HIRED: 'bg-purple-500 text-white',
};

const REMOTE_LABELS: Record<string, string> = {
  REMOTE: 'Remote',
  HYBRID: 'Hybrid',
  ONSITE: 'On-site',
};

const REMOTE_COLORS: Record<string, string> = {
  REMOTE: 'bg-green-100 text-green-800',
  HYBRID: 'bg-blue-100 text-blue-800',
  ONSITE: 'bg-orange-100 text-orange-800',
};

const EMPLOYMENT_LABELS: Record<string, string> = {
  FULL_TIME: 'Full-time',
  PART_TIME: 'Part-time',
  CONTRACT: 'Contract',
  INTERNSHIP: 'Internship',
};

function formatSalary(min?: number | null, max?: number | null, currency?: string) {
  if (!min && !max) return null;
  const fmt = (n: number) => {
    if (n >= 1000) return `${Math.round(n / 1000)}k`;
    return String(n);
  };
  const cur = currency || 'USD';
  if (min && max) return `${cur} ${fmt(min)} - ${fmt(max)}`;
  if (min) return `${cur} ${fmt(min)}+`;
  return `Up to ${cur} ${fmt(max!)}`;
}

export default function JobsPage() {
  const [search, setSearch] = useState('');
  const [remotePolicy, setRemotePolicy] = useState('');
  const [employmentType, setEmploymentType] = useState('');
  const [offset, setOffset] = useState(0);
  const debouncedSearch = useDebounce(search);
  const limit = 20;

  const { data: applications } = useMyApplications();
  const appliedJobMap = new Map((applications ?? []).map(a => [a.jobId, a.status]));

  const { data, isLoading } = useJobSearch({
    status: 'ACTIVE',
    query: debouncedSearch || undefined,
    remotePolicy: remotePolicy && remotePolicy !== 'all' ? remotePolicy : undefined,
    employmentType: employmentType && employmentType !== 'all' ? employmentType : undefined,
    limit,
    offset,
  });

  const jobs = data?.items || [];
  const meta = data?.meta;
  const hasMore = meta?.hasMore ?? false;
  const total = meta?.total ?? 0;

  return (
    <div>
      <PageHeader title="Browse Jobs" description="Find your next opportunity" />

      <div className="mb-6 flex flex-col gap-4 sm:flex-row">
        <SearchInput
          value={search}
          onChange={v => {
            setSearch(v);
            setOffset(0);
          }}
          placeholder="Search jobs..."
          className="sm:w-72"
        />
        <Select
          value={remotePolicy}
          onValueChange={v => {
            setRemotePolicy(v);
            setOffset(0);
          }}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Remote Policy" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Policies</SelectItem>
            <SelectItem value="REMOTE">Remote</SelectItem>
            <SelectItem value="HYBRID">Hybrid</SelectItem>
            <SelectItem value="ONSITE">On-site</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={employmentType}
          onValueChange={v => {
            setEmploymentType(v);
            setOffset(0);
          }}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Employment Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="FULL_TIME">Full-time</SelectItem>
            <SelectItem value="PART_TIME">Part-time</SelectItem>
            <SelectItem value="CONTRACT">Contract</SelectItem>
            <SelectItem value="INTERNSHIP">Internship</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-4 w-full" />
                <Skeleton className="mt-2 h-4 w-2/3" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : !jobs.length ? (
        <EmptyState
          icon={Briefcase}
          title="No jobs found"
          description="Try adjusting your search or filters"
        />
      ) : (
        <>
          {total > 0 && (
            <p className="mb-4 text-sm text-muted-foreground">
              Showing {offset + 1}–{Math.min(offset + limit, total)} of {total} jobs
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {jobs.map(job => {
              const salary = formatSalary(job.salaryMin, job.salaryMax, job.salaryCurrency);
              const skills = job.jobSkills || [];
              const appStatus = appliedJobMap.get(job.id);

              return (
                <Link key={job.id} href={ROUTES.candidateJobDetail(job.id)}>
                  <Card
                    className={`h-full transition-shadow hover:shadow-md ${appStatus ? 'border-l-4 border-l-primary' : ''}`}
                  >
                    <CardHeader>
                      <div className="flex items-start justify-between gap-2">
                        <CardTitle className="text-base">{job.title}</CardTitle>
                        <div className="flex shrink-0 gap-1">
                          {appStatus && (
                            <Badge
                              className={APP_STATUS_COLORS[appStatus] || 'bg-gray-500 text-white'}
                            >
                              {appStatus === 'TESTING'
                                ? 'In Progress'
                                : appStatus.charAt(0) + appStatus.slice(1).toLowerCase()}
                            </Badge>
                          )}
                          {job.remotePolicy && (
                            <Badge
                              variant="secondary"
                              className={REMOTE_COLORS[job.remotePolicy] || ''}
                            >
                              {REMOTE_LABELS[job.remotePolicy] || job.remotePolicy}
                            </Badge>
                          )}
                        </div>
                      </div>
                      <CardDescription className="flex items-center gap-1">
                        <Building2 className="h-3 w-3" />
                        {job.company?.name || 'Unknown Company'}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          {(job.locationCity || job.locationCountry) && (
                            <span className="flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              {[job.locationCity, job.locationCountry].filter(Boolean).join(', ')}
                            </span>
                          )}
                          {salary && (
                            <span className="flex items-center gap-1">
                              <DollarSign className="h-3 w-3" />
                              {salary}
                            </span>
                          )}
                        </div>

                        {job.employmentType && (
                          <Badge variant="outline" className="text-xs">
                            {EMPLOYMENT_LABELS[job.employmentType] || job.employmentType}
                          </Badge>
                        )}

                        {skills.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {skills.slice(0, 4).map(js => (
                              <Badge key={js.skill.id} variant="secondary" className="text-xs">
                                {js.skill.name}
                              </Badge>
                            ))}
                            {skills.length > 4 && (
                              <Badge variant="secondary" className="text-xs">
                                +{skills.length - 4}
                              </Badge>
                            )}
                          </div>
                        )}

                        <p className="text-xs text-muted-foreground">
                          Posted {new Date(job.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>

          <div className="mt-6 flex items-center justify-center gap-4">
            {offset > 0 && (
              <Button variant="outline" onClick={() => setOffset(Math.max(0, offset - limit))}>
                Previous
              </Button>
            )}
            {hasMore && (
              <Button variant="outline" onClick={() => setOffset(offset + limit)}>
                Next
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
