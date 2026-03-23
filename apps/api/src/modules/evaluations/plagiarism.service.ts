import { Injectable, Logger } from '@nestjs/common';
import { Prisma, prisma } from '@verihire/database';

export interface PlagiarismResult {
  flagged: boolean;
  maxSimilarity: number;
  similarSubmissionId: string | null;
  method: 'codebert' | 'ngram';
}

@Injectable()
export class PlagiarismService {
  private readonly logger = new Logger(PlagiarismService.name);

  /**
   * Generate a CodeBERT embedding via Hugging Face Inference API.
   * Returns a 768-dim vector (mean-pooled over token embeddings), or null if unavailable.
   */
  async generateEmbedding(code: string): Promise<number[] | null> {
    const token = process.env.HF_API_TOKEN || '';
    if (!token) {
      this.logger.debug('No HF_API_TOKEN configured, skipping CodeBERT embedding');
      return null;
    }

    try {
      const truncated = code.slice(0, 5000);
      const response = await fetch(
        'https://api-inference.huggingface.co/models/microsoft/codebert-base',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ inputs: truncated }),
        }
      );

      if (!response.ok) {
        const text = await response.text();
        this.logger.warn(`Hugging Face API returned ${response.status}: ${text}`);
        return null;
      }

      const data = await response.json();

      // Response is a 2D array: [[token1_embedding], [token2_embedding], ...]
      // Mean-pool across all token embeddings to get a single 768-dim vector
      if (Array.isArray(data) && Array.isArray(data[0])) {
        // Could be 3D: [[[768 floats], ...]] or 2D: [[768 floats], ...]
        let tokenEmbeddings: number[][];

        if (Array.isArray(data[0][0])) {
          // 3D: first element is the batch, take first batch
          tokenEmbeddings = data[0] as number[][];
        } else {
          // 2D: direct token embeddings
          tokenEmbeddings = data as number[][];
        }

        if (tokenEmbeddings.length === 0) {
          this.logger.warn('Empty token embeddings from Hugging Face API');
          return null;
        }

        const dim = tokenEmbeddings[0].length;
        const mean = new Array(dim).fill(0);
        for (const emb of tokenEmbeddings) {
          for (let i = 0; i < dim; i++) {
            mean[i] += emb[i];
          }
        }
        for (let i = 0; i < dim; i++) {
          mean[i] /= tokenEmbeddings.length;
        }

        return mean;
      }

      this.logger.warn('Unexpected response format from Hugging Face API');
      return null;
    } catch (error) {
      this.logger.warn(`CodeBERT embedding generation failed: ${error}`);
      return null;
    }
  }

  /**
   * Standard cosine similarity between two vectors.
   */
  cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length || a.length === 0) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    if (denominator === 0) return 0;

    return dotProduct / denominator;
  }

  /**
   * Check for plagiarism using CodeBERT embeddings (preferred) or n-gram fallback.
   */
  async checkPlagiarism(
    submissionId: string,
    challengeId: string,
    code: string
  ): Promise<PlagiarismResult> {
    // Try CodeBERT first
    const embedding = await this.generateEmbedding(code);

    if (embedding) {
      const result = await this.checkPlagiarismWithEmbedding(submissionId, challengeId, embedding);

      // Store embedding for future comparisons regardless of result
      await this.storeEmbedding(submissionId, embedding);

      return result;
    }

    // Fall back to n-gram approach
    this.logger.debug('Falling back to n-gram plagiarism check');
    const ngramResult = await this.checkPlagiarismNgram(submissionId, challengeId, code);

    return {
      ...ngramResult,
      method: 'ngram',
    };
  }

  /**
   * Store a CodeBERT embedding on the submission record.
   */
  async storeEmbedding(submissionId: string, embedding: number[]): Promise<void> {
    try {
      await prisma.submission.update({
        where: { id: submissionId },
        data: { codeEmbedding: embedding as any },
      });
    } catch (error) {
      this.logger.warn(`Failed to store embedding for submission ${submissionId}: ${error}`);
    }
  }

  /**
   * Compare embedding against all previous evaluated submissions for the same challenge.
   */
  private async checkPlagiarismWithEmbedding(
    submissionId: string,
    challengeId: string,
    embedding: number[]
  ): Promise<PlagiarismResult> {
    const others = await prisma.submission.findMany({
      where: {
        challengeId,
        id: { not: submissionId },
        status: 'EVALUATED',
        codeEmbedding: { not: Prisma.JsonNull },
      },
      select: { id: true, codeEmbedding: true },
      take: 500,
      orderBy: { submittedAt: 'desc' },
    });

    let maxSimilarity = 0;
    let similarSubmissionId: string | null = null;

    for (const other of others) {
      if (!other.codeEmbedding) continue;
      const otherEmbedding = other.codeEmbedding as unknown as number[];
      if (!Array.isArray(otherEmbedding) || otherEmbedding.length === 0) continue;

      const similarity = this.cosineSimilarity(embedding, otherEmbedding);
      if (similarity > maxSimilarity) {
        maxSimilarity = similarity;
        similarSubmissionId = other.id;
      }
    }

    const flagged = maxSimilarity >= 0.85;
    if (flagged) {
      this.logger.warn(
        `CodeBERT plagiarism flagged for ${submissionId}: ${Math.round(maxSimilarity * 100)}% similar to ${similarSubmissionId}`
      );
    }

    return {
      flagged,
      maxSimilarity: Math.round(maxSimilarity * 10000) / 100,
      similarSubmissionId,
      method: 'codebert',
    };
  }

  /**
   * N-gram based plagiarism check (fallback when CodeBERT is unavailable).
   */
  private async checkPlagiarismNgram(
    submissionId: string,
    challengeId: string,
    code: string
  ): Promise<Omit<PlagiarismResult, 'method'>> {
    const normalized = this.normalizeCodeForSimilarity(code);

    if (normalized.length < 50) {
      return { flagged: false, maxSimilarity: 0, similarSubmissionId: null };
    }

    const codeNgrams = this.getCharNgrams(normalized);

    const others = await prisma.submission.findMany({
      where: {
        challengeId,
        id: { not: submissionId },
        status: 'EVALUATED',
        content: { not: null },
      },
      select: { id: true, content: true },
      take: 500,
      orderBy: { submittedAt: 'desc' },
    });

    let maxSimilarity = 0;
    let similarSubmissionId: string | null = null;

    for (const other of others) {
      if (!other.content) continue;
      const otherNgrams = this.getCharNgrams(this.normalizeCodeForSimilarity(other.content));
      const similarity = this.jaccardSimilarity(codeNgrams, otherNgrams);
      if (similarity > maxSimilarity) {
        maxSimilarity = similarity;
        similarSubmissionId = other.id;
      }
    }

    const flagged = maxSimilarity >= 0.7;
    if (flagged) {
      this.logger.warn(
        `N-gram plagiarism flagged for ${submissionId}: ${Math.round(maxSimilarity * 100)}% similar to ${similarSubmissionId}`
      );
    }

    return {
      flagged,
      maxSimilarity: Math.round(maxSimilarity * 10000) / 100,
      similarSubmissionId,
    };
  }

  private normalizeCodeForSimilarity(code: string): string {
    return code
      .replace(/\/\/[^\n]*/g, '')
      .replace(/#[^\n]*/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/"""[\s\S]*?"""/g, '')
      .replace(/'''[\s\S]*?'''/g, '')
      .replace(/"(?:[^"\\]|\\.)*"/g, '')
      .replace(/'(?:[^'\\]|\\.)*'/g, '')
      .replace(/`(?:[^`\\]|\\.)*`/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  private getCharNgrams(text: string, n = 10): Set<string> {
    const ngrams = new Set<string>();
    for (let i = 0; i <= text.length - n; i++) {
      ngrams.add(text.slice(i, i + n));
    }
    return ngrams;
  }

  private jaccardSimilarity(a: Set<string>, b: Set<string>): number {
    if (a.size === 0 && b.size === 0) return 1;
    if (a.size === 0 || b.size === 0) return 0;
    let intersection = 0;
    for (const item of a) {
      if (b.has(item)) intersection++;
    }
    return intersection / (a.size + b.size - intersection);
  }
}
