export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4100/api/v1';

export const ROUTES = {
  home: '/',
  login: '/login',
  register: '/register',
  verify: (certNumber: string) => `/verify/${certNumber}`,

  // Candidate
  candidateDashboard: '/dashboard',
  challenges: '/challenges',
  challengeDetail: (id: string) => `/challenges/${id}`,
  challengeSubmit: (id: string) => `/challenges/${id}/submit`,
  submissions: '/submissions',
  submissionResults: (id: string) => `/submissions/${id}/results`,
  certificates: '/certificates',
  profile: '/profile',
  reviews: '/reviews',
  reviewDetail: (id: string) => `/reviews/${id}`,

  // Recruiter
  recruiterDashboard: '/recruiter/dashboard',
  company: '/recruiter/company',
  jobs: '/recruiter/jobs',
  jobNew: '/recruiter/jobs/new',
  jobDetail: (id: string) => `/recruiter/jobs/${id}`,
  jobShortlist: (id: string) => `/recruiter/jobs/${id}/shortlist`,
  jobMatches: (id: string) => `/recruiter/jobs/${id}/matches`,
  candidateSearch: '/recruiter/candidates',
  candidateProfile: (id: string) => `/recruiter/candidates/${id}`,
} as const;

export const DIFFICULTY_LABELS: Record<string, string> = {
  BEGINNER: 'Beginner',
  INTERMEDIATE: 'Intermediate',
  ADVANCED: 'Advanced',
  EXPERT: 'Expert',
};

export const DIFFICULTY_COLORS: Record<string, string> = {
  BEGINNER: 'bg-green-100 text-green-800',
  INTERMEDIATE: 'bg-blue-100 text-blue-800',
  ADVANCED: 'bg-orange-100 text-orange-800',
  EXPERT: 'bg-red-100 text-red-800',
};

export const SUBMISSION_STATUS_LABELS: Record<string, string> = {
  IN_PROGRESS: 'In Progress',
  SUBMITTED: 'Submitted',
  EVALUATING: 'Evaluating',
  EVALUATED: 'Evaluated',
  FAILED: 'Failed',
};

export const SUBMISSION_STATUS_COLORS: Record<string, string> = {
  IN_PROGRESS: 'bg-yellow-100 text-yellow-800',
  SUBMITTED: 'bg-blue-100 text-blue-800',
  EVALUATING: 'bg-purple-100 text-purple-800',
  EVALUATED: 'bg-green-100 text-green-800',
  FAILED: 'bg-red-100 text-red-800',
};

export const JOB_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  ACTIVE: 'Active',
  PAUSED: 'Paused',
  CLOSED: 'Closed',
  FILLED: 'Filled',
};

export const SHORTLIST_STAGE_LABELS: Record<string, string> = {
  SHORTLISTED: 'Shortlisted',
  SCREENING: 'Screening',
  INTERVIEW: 'Interview',
  ASSESSMENT: 'Assessment',
  OFFER: 'Offer',
  HIRED: 'Hired',
  REJECTED: 'Rejected',
};

export const SHORTLIST_STAGE_COLORS: Record<string, string> = {
  SHORTLISTED: 'bg-gray-100 text-gray-800',
  SCREENING: 'bg-blue-100 text-blue-800',
  INTERVIEW: 'bg-purple-100 text-purple-800',
  ASSESSMENT: 'bg-orange-100 text-orange-800',
  OFFER: 'bg-green-100 text-green-800',
  HIRED: 'bg-emerald-100 text-emerald-800',
  REJECTED: 'bg-red-100 text-red-800',
};
