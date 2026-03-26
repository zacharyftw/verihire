import useSWR, { mutate } from 'swr';
import { api } from '@/lib/api';

interface ApplicationJob {
  id: string;
  title: string;
  company: { name: string };
  locationCity?: string;
  remotePolicy: string;
}

interface Application {
  id: string;
  jobId: string;
  status: 'APPLIED' | 'TESTING' | 'COMPLETED' | 'REVIEWED' | 'SHORTLISTED' | 'REJECTED' | 'HIRED';
  appliedAt: string;
  completedAt?: string;
  averageScore?: number;
  job: ApplicationJob;
  _count?: { challenges: number };
  completedChallenges?: number;
}

interface ApplyResponse {
  id: string;
  jobId: string;
  status: 'TESTING';
  challenges: Array<{ id: string; title: string; skillName: string }>;
}

export function useMyApplications() {
  const result = useSWR<{ items: Application[]; meta: unknown } | Application[]>(
    '/jobs/candidate/my-applications',
    { refreshInterval: 15000 }
  );
  const raw = result.data;
  const items = Array.isArray(raw) ? raw : (raw?.items ?? []);
  return { ...result, data: items };
}

export async function applyToJob(jobId: string, coverLetter?: string) {
  const result = await api.post<ApplyResponse>(`/jobs/${jobId}/apply`, {
    ...(coverLetter ? { coverLetter } : {}),
  });
  // Revalidate applications list
  await mutate('/jobs/candidate/my-applications');
  return result;
}
