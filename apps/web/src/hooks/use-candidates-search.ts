import useSWR from 'swr';

interface CandidateSearchFilters {
  skillIds?: string[];
  minExperience?: number;
  maxExperience?: number;
  locations?: string[];
  remotePreference?: string;
  jobSearchStatus?: string;
  verifiedOnly?: boolean;
  limit?: number;
  offset?: number;
}

function buildQuery(filters: CandidateSearchFilters) {
  const params = new URLSearchParams();
  if (filters.skillIds?.length) params.set('skillIds', filters.skillIds.join(','));
  if (filters.minExperience !== undefined)
    params.set('minExperience', String(filters.minExperience));
  if (filters.maxExperience !== undefined)
    params.set('maxExperience', String(filters.maxExperience));
  if (filters.locations?.length) params.set('locations', filters.locations.join(','));
  if (filters.remotePreference) params.set('remotePreference', filters.remotePreference);
  if (filters.jobSearchStatus) params.set('jobSearchStatus', filters.jobSearchStatus);
  if (filters.verifiedOnly) params.set('verifiedOnly', 'true');
  if (filters.limit) params.set('limit', String(filters.limit));
  if (filters.offset) params.set('offset', String(filters.offset));
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export function useCandidateSearch(filters: CandidateSearchFilters = {}) {
  const query = buildQuery(filters);
  return useSWR(`/candidates/search${query}`);
}
