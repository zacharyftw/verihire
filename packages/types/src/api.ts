// =============================================================================
// API RESPONSE TYPES
// =============================================================================

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: ApiError;
  meta?: ApiMeta;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  stack?: string;
}

export interface ApiMeta {
  timestamp: string;
  requestId: string;
  version: string;
}

// =============================================================================
// PAGINATION
// =============================================================================

export interface PaginationParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
  items: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

// =============================================================================
// FILTER TYPES
// =============================================================================

export interface CandidateSearchFilters {
  skills?: string[];
  minScore?: number;
  location?: string;
  remotePreference?: string;
  yearsExperienceMin?: number;
  yearsExperienceMax?: number;
  jobSearchStatus?: string;
  verified?: boolean;
}

export interface JobSearchFilters {
  skills?: string[];
  location?: string;
  remotePolicy?: string;
  employmentType?: string;
  salaryMin?: number;
  salaryMax?: number;
  experienceLevel?: string;
  companyId?: string;
}

export interface ChallengeSearchFilters {
  skillId?: string;
  difficulty?: string;
  type?: string;
}

// =============================================================================
// REQUEST/RESPONSE DTOs
// =============================================================================

// User DTOs
export interface CreateUserDto {
  email: string;
  password?: string;
  firstName?: string;
  lastName?: string;
  userType: 'CANDIDATE' | 'RECRUITER';
  oauthProvider?: string;
  oauthProviderId?: string;
}

export interface UpdateUserDto {
  firstName?: string;
  lastName?: string;
  avatarUrl?: string;
}

// Candidate DTOs
export interface UpdateCandidateProfileDto {
  headline?: string;
  bio?: string;
  yearsExperience?: number;
  currentRole?: string;
  currentCompany?: string;
  locationCity?: string;
  locationCountry?: string;
  remotePreference?: string;
  linkedinUrl?: string;
  githubUrl?: string;
  portfolioUrl?: string;
  resumeUrl?: string;
  jobSearchStatus?: string;
  preferredSalaryMin?: number;
  preferredSalaryMax?: number;
  preferredSalaryCurrency?: string;
  portfolioPublic?: boolean;
  portfolioSlug?: string;
}

// Job DTOs
export interface CreateJobDto {
  title: string;
  description?: string;
  requirements?: string;
  responsibilities?: string;
  locationCity?: string;
  locationCountry?: string;
  remotePolicy?: string;
  salaryMin?: number;
  salaryMax?: number;
  salaryCurrency?: string;
  salaryPeriod?: string;
  employmentType?: string;
  experienceLevel?: string;
  experienceYearsMin?: number;
  experienceYearsMax?: number;
  skills?: { skillId: string; minScore?: number; minLevel?: string; required?: boolean; weight?: number }[];
}

export interface UpdateJobDto extends Partial<CreateJobDto> {
  status?: string;
}

// Submission DTOs
export interface CreateSubmissionDto {
  challengeId: string;
}

export interface SubmitSolutionDto {
  content: string;
  language?: string;
  files?: { name: string; content: string; type: string }[];
}

// Review DTOs
export interface SubmitReviewDto {
  criteriaScores: Record<string, number>;
  overallScore: number;
  strengths: string;
  areasForImprovement: string;
  suggestions?: string;
  confidenceLevel: 'LOW' | 'MEDIUM' | 'HIGH';
}

// Shortlist DTOs
export interface AddToShortlistDto {
  jobId: string;
  candidateId: string;
  notes?: string;
}

export interface UpdateShortlistDto {
  stage?: string;
  notes?: string;
  rating?: number;
}
