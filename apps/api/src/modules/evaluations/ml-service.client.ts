import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import Keyv from 'keyv';
import KeyvRedis from '@keyv/redis';
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

interface RetryOptions {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  retryableStatuses: number[];
}

const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
  retryableStatuses: [408, 429, 500, 502, 503, 504],
};

interface CacheOptions {
  enabled: boolean;
  ttlMs: number;
  useRedis: boolean;
}

const DEFAULT_CACHE_OPTIONS: CacheOptions = {
  enabled: true,
  ttlMs: 3600000, // 1 hour
  useRedis: false,
};

@Injectable()
export class MlServiceClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MlServiceClient.name);
  private readonly baseUrl: string;
  private readonly timeout: number;
  private readonly enabled: boolean;
  private readonly retryOptions: RetryOptions;
  private readonly cacheOptions: CacheOptions;
  private serviceAvailable: boolean | null = null;
  private lastHealthCheck: number = 0;
  private readonly healthCheckInterval = 60000; // 1 minute
  private cache: Keyv | null = null;

  constructor(private configService: ConfigService) {
    this.baseUrl = this.configService.get<string>('mlService.baseUrl') || 'http://localhost:4200';
    this.timeout = this.configService.get<number>('mlService.timeout') || 30000;
    this.enabled = this.configService.get<boolean>('mlService.enabled') ?? true;
    this.retryOptions = {
      maxRetries:
        this.configService.get<number>('mlService.maxRetries') || DEFAULT_RETRY_OPTIONS.maxRetries,
      baseDelayMs:
        this.configService.get<number>('mlService.retryDelayMs') ||
        DEFAULT_RETRY_OPTIONS.baseDelayMs,
      maxDelayMs: DEFAULT_RETRY_OPTIONS.maxDelayMs,
      retryableStatuses: DEFAULT_RETRY_OPTIONS.retryableStatuses,
    };
    this.cacheOptions = {
      enabled:
        this.configService.get<boolean>('mlService.cacheEnabled') ?? DEFAULT_CACHE_OPTIONS.enabled,
      ttlMs: this.configService.get<number>('mlService.cacheTtlMs') || DEFAULT_CACHE_OPTIONS.ttlMs,
      useRedis:
        this.configService.get<boolean>('mlService.cacheUseRedis') ??
        DEFAULT_CACHE_OPTIONS.useRedis,
    };
  }

  async onModuleInit() {
    if (this.cacheOptions.enabled) {
      await this.initializeCache();
    }
  }

  async onModuleDestroy() {
    if (this.cache) {
      await this.cache.disconnect();
    }
  }

  private async initializeCache() {
    try {
      if (this.cacheOptions.useRedis) {
        const redisUrl = this.configService.get<string>('redis.url') || 'redis://localhost:6379';
        const store = new KeyvRedis(redisUrl);
        this.cache = new Keyv({ store, namespace: 'ml-cache', ttl: this.cacheOptions.ttlMs });
        this.logger.log('ML cache initialized with Redis backend');
      } else {
        // Use in-memory cache
        this.cache = new Keyv({ namespace: 'ml-cache', ttl: this.cacheOptions.ttlMs });
        this.logger.log('ML cache initialized with in-memory backend');
      }

      this.cache.on('error', err => {
        this.logger.error(`ML cache error: ${err}`);
      });
    } catch (error) {
      this.logger.warn(`Failed to initialize ML cache, caching disabled: ${error}`);
      this.cache = null;
    }
  }

  /**
   * Generate a cache key from request data
   */
  private generateCacheKey(prefix: string, data: unknown): string {
    const hash = createHash('sha256').update(JSON.stringify(data)).digest('hex').substring(0, 16);
    return `${prefix}:${hash}`;
  }

  /**
   * Get from cache if available
   */
  private async getFromCache<T>(key: string): Promise<T | null> {
    if (!this.cache || !this.cacheOptions.enabled) {
      return null;
    }

    try {
      const cached = await this.cache.get(key);
      if (cached) {
        this.logger.debug(`ML cache hit for key: ${key}`);
        return cached as T;
      }
      return null;
    } catch (error) {
      this.logger.warn(`ML cache get error: ${error}`);
      return null;
    }
  }

  /**
   * Set value in cache
   */
  private async setInCache<T>(key: string, value: T, ttl?: number): Promise<void> {
    if (!this.cache || !this.cacheOptions.enabled) {
      return;
    }

    try {
      await this.cache.set(key, value, ttl || this.cacheOptions.ttlMs);
      this.logger.debug(`ML cache set for key: ${key}`);
    } catch (error) {
      this.logger.warn(`ML cache set error: ${error}`);
    }
  }

  /**
   * Clear a specific cache entry
   */
  async clearCache(key: string): Promise<void> {
    if (this.cache) {
      await this.cache.delete(key);
    }
  }

  /**
   * Clear all ML cache entries
   */
  async clearAllCache(): Promise<void> {
    if (this.cache) {
      await this.cache.clear();
      this.logger.log('ML cache cleared');
    }
  }

  /**
   * Check if ML service is enabled and available
   * Uses cached status with periodic health checks to avoid hammering the service
   */
  async isAvailable(): Promise<boolean> {
    if (!this.enabled) {
      return false;
    }

    const now = Date.now();
    if (this.serviceAvailable !== null && now - this.lastHealthCheck < this.healthCheckInterval) {
      return this.serviceAvailable;
    }

    try {
      const response = await this.fetchWithTimeout('/health', {
        method: 'GET',
      });
      this.serviceAvailable = response.ok;
      this.lastHealthCheck = now;
      return this.serviceAvailable;
    } catch (error) {
      this.logger.warn(`ML service not available: ${error}`);
      this.serviceAvailable = false;
      this.lastHealthCheck = now;
      return false;
    }
  }

  /**
   * Force a health check, bypassing the cache
   */
  async checkHealth(): Promise<boolean> {
    this.lastHealthCheck = 0;
    return this.isAvailable();
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
   * Evaluate code using CodeBERT model (with caching)
   */
  async evaluateCode(request: MLCodeEvaluationRequest): Promise<MLCodeEvaluationResponse | null> {
    if (!this.enabled) {
      this.logger.debug('ML service disabled, skipping code evaluation');
      return null;
    }

    // Check cache first
    const cacheKey = this.generateCacheKey('code-eval', request);
    const cached = await this.getFromCache<MLCodeEvaluationResponse>(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const response = await this.fetchWithRetry('/api/v1/evaluate/code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const error = await response.text();
        this.logger.error(`Code evaluation failed: ${error}`);
        return null;
      }

      const result = await response.json();

      // Cache the result
      await this.setInCache(cacheKey, result);

      return result;
    } catch (error) {
      this.logger.error(`Code evaluation error after retries: ${error}`);
      return null;
    }
  }

  /**
   * Evaluate text using BERT model (with caching)
   */
  async evaluateText(request: MLTextEvaluationRequest): Promise<MLTextEvaluationResponse | null> {
    if (!this.enabled) {
      this.logger.debug('ML service disabled, skipping text evaluation');
      return null;
    }

    // Check cache first
    const cacheKey = this.generateCacheKey('text-eval', request);
    const cached = await this.getFromCache<MLTextEvaluationResponse>(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const response = await this.fetchWithRetry('/api/v1/evaluate/text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const error = await response.text();
        this.logger.error(`Text evaluation failed: ${error}`);
        return null;
      }

      const result = await response.json();

      // Cache the result
      await this.setInCache(cacheKey, result);

      return result;
    } catch (error) {
      this.logger.error(`Text evaluation error after retries: ${error}`);
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
      const response = await this.fetchWithRetry('/api/v1/evaluate/code/batch', {
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
      this.logger.error(`Batch code evaluation error after retries: ${error}`);
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
      const response = await this.fetchWithRetry('/api/v1/evaluate/text/batch', {
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
      this.logger.error(`Batch text evaluation error after retries: ${error}`);
      return null;
    }
  }

  /**
   * Find matching candidates for a job using NCF model (with caching)
   */
  async matchCandidates(
    request: MLCandidateMatchRequest
  ): Promise<MLCandidateMatchResponse | null> {
    if (!this.enabled) {
      this.logger.debug('ML service disabled, skipping candidate matching');
      return null;
    }

    // Check cache first - use shorter TTL for matching since candidates change
    const cacheKey = this.generateCacheKey('match-candidates', request);
    const cached = await this.getFromCache<MLCandidateMatchResponse>(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const response = await this.fetchWithRetry('/api/v1/match/candidates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const error = await response.text();
        this.logger.error(`Candidate matching failed: ${error}`);
        return null;
      }

      const result = await response.json();

      // Cache with shorter TTL (5 minutes) for matching results
      await this.setInCache(cacheKey, result, 300000);

      return result;
    } catch (error) {
      this.logger.error(`Candidate matching error after retries: ${error}`);
      return null;
    }
  }

  /**
   * Find matching jobs for a candidate using NCF model (with caching)
   */
  async matchJobs(request: MLJobMatchRequest): Promise<MLJobMatchResponse | null> {
    if (!this.enabled) {
      this.logger.debug('ML service disabled, skipping job matching');
      return null;
    }

    // Check cache first
    const cacheKey = this.generateCacheKey('match-jobs', request);
    const cached = await this.getFromCache<MLJobMatchResponse>(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const response = await this.fetchWithRetry('/api/v1/match/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const error = await response.text();
        this.logger.error(`Job matching failed: ${error}`);
        return null;
      }

      const result = await response.json();

      // Cache with shorter TTL (5 minutes) for matching results
      await this.setInCache(cacheKey, result, 300000);

      return result;
    } catch (error) {
      this.logger.error(`Job matching error after retries: ${error}`);
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

  /**
   * Fetch with timeout and retry logic using exponential backoff
   */
  private async fetchWithRetry(
    path: string,
    options: RequestInit,
    customRetryOptions?: Partial<RetryOptions>
  ): Promise<Response> {
    const retryOpts = { ...this.retryOptions, ...customRetryOptions };
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= retryOpts.maxRetries; attempt++) {
      try {
        const response = await this.fetchWithTimeout(path, options);

        // Check if we should retry based on status code
        if (!response.ok && retryOpts.retryableStatuses.includes(response.status)) {
          if (attempt < retryOpts.maxRetries) {
            const delay = this.calculateBackoffDelay(attempt, retryOpts);
            this.logger.warn(
              `ML service returned ${response.status} on ${path}, retrying in ${delay}ms (attempt ${attempt + 1}/${retryOpts.maxRetries})`
            );
            await this.sleep(delay);
            continue;
          }
        }

        return response;
      } catch (error) {
        lastError = error as Error;

        // Don't retry on abort (timeout) if we've already tried multiple times
        const isAbortError = error instanceof Error && error.name === 'AbortError';
        const isNetworkError = error instanceof TypeError;

        if ((isAbortError || isNetworkError) && attempt < retryOpts.maxRetries) {
          const delay = this.calculateBackoffDelay(attempt, retryOpts);
          this.logger.warn(
            `ML service request to ${path} failed: ${error}, retrying in ${delay}ms (attempt ${attempt + 1}/${retryOpts.maxRetries})`
          );
          await this.sleep(delay);
          continue;
        }

        throw error;
      }
    }

    // This shouldn't happen, but just in case
    throw lastError || new Error('Max retries exceeded');
  }

  /**
   * Calculate exponential backoff delay with jitter
   */
  private calculateBackoffDelay(attempt: number, options: RetryOptions): number {
    // Exponential backoff: baseDelay * 2^attempt
    const exponentialDelay = options.baseDelayMs * Math.pow(2, attempt);
    // Add jitter (±25%) to prevent thundering herd
    const jitter = exponentialDelay * 0.25 * (Math.random() * 2 - 1);
    const delay = Math.round(exponentialDelay + jitter);
    // Cap at maxDelay
    return Math.min(delay, options.maxDelayMs);
  }

  /**
   * Sleep helper for retry delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
