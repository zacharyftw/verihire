// =============================================================================
// USER TYPES
// =============================================================================

export type UserStatus = 'ACTIVE' | 'SUSPENDED' | 'DELETED';
export type UserType = 'CANDIDATE' | 'RECRUITER' | 'ADMIN';
export type OAuthProvider = 'GOOGLE' | 'GITHUB' | 'LINKEDIN';

export interface User {
  id: string;
  email: string;
  emailVerified: boolean;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
  status: UserStatus;
  userType: UserType;
  mfaEnabled: boolean;
  oauthProvider: OAuthProvider | null;
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt: Date | null;
}

export interface UserPublic {
  id: string;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
  userType: UserType;
}

// =============================================================================
// CANDIDATE TYPES
// =============================================================================

export type RemotePreference = 'REMOTE' | 'HYBRID' | 'ONSITE' | 'FLEXIBLE';
export type JobSearchStatus = 'ACTIVE' | 'OPEN' | 'NOT_LOOKING';
export type SkillLevel = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED' | 'EXPERT';

export interface CandidateProfile {
  id: string;
  userId: string;
  headline: string | null;
  bio: string | null;
  yearsExperience: number;
  currentRole: string | null;
  currentCompany: string | null;
  locationCity: string | null;
  locationCountry: string | null;
  remotePreference: RemotePreference | null;
  linkedinUrl: string | null;
  githubUrl: string | null;
  portfolioUrl: string | null;
  resumeUrl: string | null;
  jobSearchStatus: JobSearchStatus | null;
  preferredSalaryMin: number | null;
  preferredSalaryMax: number | null;
  preferredSalaryCurrency: string;
  portfolioPublic: boolean;
  portfolioSlug: string | null;
  totalChallengesCompleted: number;
  averageScore: number;
  certificatesCount: number;
  reputationScore: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CandidateSkill {
  id: string;
  candidateId: string;
  skillId: string;
  verified: boolean;
  verificationDate: Date | null;
  score: number | null;
  percentile: number | null;
  level: SkillLevel | null;
  expiresAt: Date | null;
}

// =============================================================================
// SKILL TYPES
// =============================================================================

export interface SkillCategory {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  parentId: string | null;
  icon: string | null;
  displayOrder: number;
}

export interface Skill {
  id: string;
  categoryId: string | null;
  name: string;
  slug: string;
  description: string | null;
  certificationEnabled: boolean;
  certificationValidityMonths: number;
  passThreshold: number;
  totalCertifications: number;
  averageScore: number | null;
  isActive: boolean;
}

// =============================================================================
// CHALLENGE TYPES
// =============================================================================

export type ChallengeDifficulty = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED' | 'EXPERT';
export type ChallengeType = 'CODING' | 'DESIGN' | 'WRITTEN' | 'MIXED';
export type SubmissionStatus = 'IN_PROGRESS' | 'SUBMITTED' | 'EVALUATING' | 'EVALUATED' | 'FAILED';

export type ChallengeCategory = 'GENERAL_SWE' | 'DOMAIN_SPECIFIC';

export interface Challenge {
  id: string;
  templateId: string | null;
  skillId: string | null;
  title: string;
  description: string;
  requirements: Record<string, unknown> | null;
  testCases: Record<string, unknown> | null;
  starterCode: string | null;
  difficulty: ChallengeDifficulty | null;
  type: ChallengeType | null;
  category: ChallengeCategory;
  supportedLanguages: string[] | null;
  timeLimitMinutes: number | null;
  evaluationCriteria: Record<string, unknown> | null;
  timesAttempted: number;
  averageScore: number | null;
}

export interface Submission {
  id: string;
  challengeId: string;
  candidateId: string;
  content: string | null;
  language: string | null;
  files: Record<string, unknown> | null;
  startedAt: Date | null;
  submittedAt: Date | null;
  timeSpentSeconds: number | null;
  status: SubmissionStatus;
  aiScore: number | null;
  peerScore: number | null;
  finalScore: number | null;
  percentile: number | null;
}

// =============================================================================
// CERTIFICATE TYPES
// =============================================================================

export interface Certificate {
  id: string;
  certificateNumber: string;
  version: string;
  candidateId: string;
  skillId: string;
  challengeId: string;
  submissionId: string;
  finalScore: number;
  percentile: number | null;
  grade: string;
  aiScore: number | null;
  peerScore: number | null;
  confidence: number | null;
  hash: string;
  blockchainTxId: string | null;
  blockchainNetwork: string | null;
  verificationUrl: string;
  issuedAt: Date;
  expiresAt: Date | null;
  revokedAt: Date | null;
}

// =============================================================================
// COMPANY & JOB TYPES
// =============================================================================

export type CompanyStatus = 'ACTIVE' | 'SUSPENDED' | 'INACTIVE';
export type RecruiterRole = 'RECRUITER' | 'HIRING_MANAGER' | 'ADMIN';
export type RemotePolicy = 'REMOTE' | 'HYBRID' | 'ONSITE';
export type EmploymentType = 'FULL_TIME' | 'PART_TIME' | 'CONTRACT' | 'INTERNSHIP';
export type JobStatus = 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'CLOSED' | 'FILLED';
export type ShortlistStage =
  | 'SHORTLISTED'
  | 'SCREENING'
  | 'INTERVIEW'
  | 'ASSESSMENT'
  | 'OFFER'
  | 'HIRED'
  | 'REJECTED';

export interface Company {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  industry: string | null;
  companySize: string | null;
  logoUrl: string | null;
  websiteUrl: string | null;
  headquartersCity: string | null;
  headquartersCountry: string | null;
  verified: boolean;
  plan: string;
  status: CompanyStatus;
}

export interface RecruiterProfile {
  id: string;
  userId: string;
  companyId: string | null;
  title: string | null;
  department: string | null;
  role: RecruiterRole;
  totalHires: number;
  activeJobs: number;
}

export interface Job {
  id: string;
  companyId: string | null;
  recruiterId: string | null;
  title: string;
  description: string | null;
  requirements: string | null;
  responsibilities: string | null;
  locationCity: string | null;
  locationCountry: string | null;
  remotePolicy: RemotePolicy | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string;
  salaryPeriod: string;
  employmentType: EmploymentType | null;
  experienceLevel: string | null;
  experienceYearsMin: number | null;
  experienceYearsMax: number | null;
  status: JobStatus;
  publishedAt: Date | null;
  closesAt: Date | null;
  viewsCount: number;
  applicationsCount: number;
}

export interface JobSkill {
  id: string;
  jobId: string;
  skillId: string;
  minScore: number;
  minLevel: SkillLevel | null;
  required: boolean;
  weight: number;
}

export interface Shortlist {
  id: string;
  recruiterId: string;
  jobId: string;
  candidateId: string;
  stage: ShortlistStage;
  stageUpdatedAt: Date;
  notes: string | null;
  rating: number | null;
}
