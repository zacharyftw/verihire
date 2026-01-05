import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Request/Response types for ML Service integration
 */

// Code Evaluation
export interface MLCodeEvaluationRequest {
  code: string;
  language: string;
  challenge_description?: string;
  expected_output?: string;
  test_cases?: Array<{ input: string; expected_output: string }>;
}

export interface MLCodeMetrics {
  complexity_score: number;
  readability_score: number;
  maintainability_score: number;
  security_score: number;
  best_practices_score: number;
}

export interface MLCodeIssue {
  severity: 'error' | 'warning' | 'info';
  category: string;
  message: string;
  line?: number;
  suggestion?: string;
}

export interface MLCodeEvaluationResponse {
  overall_score: number;
  metrics: MLCodeMetrics;
  issues: MLCodeIssue[];
  strengths: string[];
  suggestions: string[];
  embedding?: number[];
  processing_time_ms: number;
}

// Text Evaluation
export interface MLTextEvaluationRequest {
  text: string;
  evaluation_type: 'written_response' | 'peer_review' | 'design_explanation';
  question?: string;
  expected_topics?: string[];
  min_word_count?: number;
}

export interface MLTextMetrics {
  relevance_score: number;
  coherence_score: number;
  depth_score: number;
  clarity_score: number;
  originality_score: number;
}

export interface MLTextEvaluationResponse {
  overall_score: number;
  metrics: MLTextMetrics;
  topics_covered: string[];
  key_points: string[];
  suggestions: string[];
  word_count: number;
  embedding?: number[];
  processing_time_ms: number;
}

// Candidate Matching
export interface MLSkillRequirement {
  skill_id: string;
  skill_name: string;
  required_level: number;
  weight: number;
  is_required: boolean;
}

export interface MLCandidateSkill {
  skill_id: string;
  skill_name: string;
  proficiency_level: number;
  verified: boolean;
  certification_score?: number;
}

export interface MLCandidateProfile {
  candidate_id: string;
  skills: MLCandidateSkill[];
  experience_years?: number;
  preferences?: Record<string, any>;
}

export interface MLJobProfile {
  job_id: string;
  required_skills: MLSkillRequirement[];
  experience_min?: number;
  experience_max?: number;
  attributes?: Record<string, any>;
}

export interface MLMatchScore {
  candidate_id: string;
  job_id: string;
  overall_score: number;
  skill_match_score: number;
  experience_match_score: number;
  ncf_score: number;
  skill_gaps: string[];
  skill_strengths: string[];
}

export interface MLCandidateMatchRequest {
  job: MLJobProfile;
  candidates: MLCandidateProfile[];
  top_k: number;
  min_score: number;
}

export interface MLCandidateMatchResponse {
  job_id: string;
  matches: MLMatchScore[];
  total_candidates: number;
  processing_time_ms: number;
}

export interface MLJobMatchRequest {
  candidate: MLCandidateProfile;
  jobs: MLJobProfile[];
  top_k: number;
  min_score: number;
}

export interface MLJobMatchResponse {
  candidate_id: string;
  matches: MLMatchScore[];
  total_jobs: number;
  processing_time_ms: number;
}

// Health Check
export interface MLModelStatus {
  name: string;
  loaded: boolean;
  device: string;
  load_time_ms?: number;
}

export interface MLHealthResponse {
  status: string;
  version: string;
  timestamp: string;
  models?: MLModelStatus[];
}

@Injectable()
export class MlServiceClient {
  private readonly logger = new Logger(MlServiceClient.name);
  private readonly baseUrl: string;
  private readonly timeout: number;
  private readonly enabled: boolean;

  constructor(private configService: ConfigService) {
    this.baseUrl = this.configService.get<string>('mlService.baseUrl') || 'http://localhost:4200';
    this.timeout = this.configService.get<number>('mlService.timeout') || 30000;
    this.enabled = this.configService.get<boolean>('mlService.enabled') ?? true;
  }

  /**
   * Check if ML service is enabled and available
   */
  async isAvailable(): Promise<boolean> {
    if (!this.enabled) {
      return false;
    }

    try {
      const response = await this.fetchWithTimeout('/health', {
        method: 'GET',
      });
      return response.ok;
    } catch (error) {
      this.logger.warn(`ML service not available: ${error}`);
      return false;
    }
  }

  /**
   * Get ML service health with model status
   */
  async getHealth(): Promise<MLHealthResponse | null> {
    try {
      const response = await this.fetchWithTimeout('/health/models', {
        method: 'GET',
      });

      if (!response.ok) {
        this.logger.error(`ML health check failed: ${response.status}`);
        return null;
      }

      return await response.json();
    } catch (error) {
      this.logger.error(`ML health check error: ${error}`);
      return null;
    }
  }

  /**
   * Evaluate code using CodeBERT model
   */
  async evaluateCode(request: MLCodeEvaluationRequest): Promise<MLCodeEvaluationResponse | null> {
    if (!this.enabled) {
      this.logger.debug('ML service disabled, skipping code evaluation');
      return null;
    }

    try {
      const response = await this.fetchWithTimeout('/api/v1/evaluate/code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const error = await response.text();
        this.logger.error(`Code evaluation failed: ${error}`);
        return null;
      }

      return await response.json();
    } catch (error) {
      this.logger.error(`Code evaluation error: ${error}`);
      return null;
    }
  }

  /**
   * Evaluate text using BERT model
   */
  async evaluateText(request: MLTextEvaluationRequest): Promise<MLTextEvaluationResponse | null> {
    if (!this.enabled) {
      this.logger.debug('ML service disabled, skipping text evaluation');
      return null;
    }

    try {
      const response = await this.fetchWithTimeout('/api/v1/evaluate/text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const error = await response.text();
        this.logger.error(`Text evaluation failed: ${error}`);
        return null;
      }

      return await response.json();
    } catch (error) {
      this.logger.error(`Text evaluation error: ${error}`);
      return null;
    }
  }

  /**
   * Batch evaluate multiple code submissions
   */
  async evaluateCodeBatch(
    requests: MLCodeEvaluationRequest[]
  ): Promise<MLCodeEvaluationResponse[] | null> {
    if (!this.enabled) {
      this.logger.debug('ML service disabled, skipping batch code evaluation');
      return null;
    }

    try {
      const response = await this.fetchWithTimeout('/api/v1/evaluate/code/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requests),
      });

      if (!response.ok) {
        const error = await response.text();
        this.logger.error(`Batch code evaluation failed: ${error}`);
        return null;
      }

      return await response.json();
    } catch (error) {
      this.logger.error(`Batch code evaluation error: ${error}`);
      return null;
    }
  }

  /**
   * Batch evaluate multiple text submissions
   */
  async evaluateTextBatch(
    requests: MLTextEvaluationRequest[]
  ): Promise<MLTextEvaluationResponse[] | null> {
    if (!this.enabled) {
      this.logger.debug('ML service disabled, skipping batch text evaluation');
      return null;
    }

    try {
      const response = await this.fetchWithTimeout('/api/v1/evaluate/text/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requests),
      });

      if (!response.ok) {
        const error = await response.text();
        this.logger.error(`Batch text evaluation failed: ${error}`);
        return null;
      }

      return await response.json();
    } catch (error) {
      this.logger.error(`Batch text evaluation error: ${error}`);
      return null;
    }
  }

  /**
   * Find matching candidates for a job using NCF model
   */
  async matchCandidates(
    request: MLCandidateMatchRequest
  ): Promise<MLCandidateMatchResponse | null> {
    if (!this.enabled) {
      this.logger.debug('ML service disabled, skipping candidate matching');
      return null;
    }

    try {
      const response = await this.fetchWithTimeout('/api/v1/match/candidates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const error = await response.text();
        this.logger.error(`Candidate matching failed: ${error}`);
        return null;
      }

      return await response.json();
    } catch (error) {
      this.logger.error(`Candidate matching error: ${error}`);
      return null;
    }
  }

  /**
   * Find matching jobs for a candidate using NCF model
   */
  async matchJobs(request: MLJobMatchRequest): Promise<MLJobMatchResponse | null> {
    if (!this.enabled) {
      this.logger.debug('ML service disabled, skipping job matching');
      return null;
    }

    try {
      const response = await this.fetchWithTimeout('/api/v1/match/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const error = await response.text();
        this.logger.error(`Job matching failed: ${error}`);
        return null;
      }

      return await response.json();
    } catch (error) {
      this.logger.error(`Job matching error: ${error}`);
      return null;
    }
  }

  /**
   * Fetch with timeout helper
   */
  private async fetchWithTimeout(path: string, options: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        ...options,
        signal: controller.signal,
      });
      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
