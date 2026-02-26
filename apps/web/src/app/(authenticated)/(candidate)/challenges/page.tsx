'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Code2, Clock, Users } from 'lucide-react';
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
import { useChallenges } from '@/hooks/use-challenges';
import { useDebounce } from '@/hooks/use-debounce';
import { ROUTES, DIFFICULTY_LABELS, DIFFICULTY_COLORS } from '@/lib/constants';

export default function ChallengesPage() {
  const [search, setSearch] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [type, setType] = useState('');
  const debouncedSearch = useDebounce(search);

  const { data, isLoading } = useChallenges({
    difficulty: difficulty || undefined,
    type: type || undefined,
    limit: 20,
  });

  const challenges = data?.items || [];
  const filtered = debouncedSearch
    ? challenges.filter(c => c.title.toLowerCase().includes(debouncedSearch.toLowerCase()))
    : challenges;

  return (
    <div>
      <PageHeader title="Challenges" description="Browse and start skill challenges" />

      <div className="mb-6 flex flex-col gap-4 sm:flex-row">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search challenges..."
          className="sm:w-72"
        />
        <Select value={difficulty} onValueChange={setDifficulty}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Difficulty" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Levels</SelectItem>
            <SelectItem value="BEGINNER">Beginner</SelectItem>
            <SelectItem value="INTERMEDIATE">Intermediate</SelectItem>
            <SelectItem value="ADVANCED">Advanced</SelectItem>
            <SelectItem value="EXPERT">Expert</SelectItem>
          </SelectContent>
        </Select>
        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="CODING">Coding</SelectItem>
            <SelectItem value="DESIGN">Design</SelectItem>
            <SelectItem value="WRITTEN">Written</SelectItem>
            <SelectItem value="MIXED">Mixed</SelectItem>
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
              </CardContent>
            </Card>
          ))}
        </div>
      ) : !filtered.length ? (
        <EmptyState
          icon={Code2}
          title="No challenges found"
          description="Try adjusting your filters"
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(challenge => (
            <Card key={challenge.id} className="transition-shadow hover:shadow-md">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <CardTitle className="text-base">{challenge.title}</CardTitle>
                  {challenge.difficulty && (
                    <Badge variant="secondary" className={DIFFICULTY_COLORS[challenge.difficulty]}>
                      {DIFFICULTY_LABELS[challenge.difficulty]}
                    </Badge>
                  )}
                </div>
                <CardDescription>{challenge.skill?.name || 'General'}</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="mb-4 line-clamp-2 text-sm text-muted-foreground">
                  {challenge.description}
                </p>
                <div className="flex items-center justify-between">
                  <div className="flex gap-3 text-xs text-muted-foreground">
                    {challenge.timeLimitMinutes && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {challenge.timeLimitMinutes}min
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      {challenge.timesAttempted || 0} attempts
                    </span>
                  </div>
                  <Button size="sm" asChild>
                    <Link href={ROUTES.challengeDetail(challenge.id)}>View</Link>
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
