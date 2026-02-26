import type {
  Challenge as BaseChallenge,
  Submission as BaseSubmission,
  Certificate as BaseCertificate,
  Skill,
} from '@verihire/types';

// Extended types that include API relations (when fetched with includes)
export interface Challenge extends BaseChallenge {
  skill?: Skill | null;
  timeLimit?: number | null; // alias for timeLimitMinutes
  totalAttempts?: number; // alias for timesAttempted
}

export interface Submission extends BaseSubmission {
  challenge?: Challenge | null;
  createdAt: string;
}

export interface Certificate extends BaseCertificate {
  skill?: Skill | null;
  challenge?: Challenge | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ApiData = any;
