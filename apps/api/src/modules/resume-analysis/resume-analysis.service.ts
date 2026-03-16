import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface WorkEntry {
  company: string;
  role: string;
  start: string; // "YYYY-MM"
  end: string; // "YYYY-MM" or "present"
}

export interface ResumeAnalysis {
  resumeText: string;
  workHistory: WorkEntry[];
  totalYearsExp: number;
  seniorityLevel: 'entry' | 'junior' | 'mid' | 'senior' | 'staff';
  domains: string[];
}

export interface CandidateQuestions {
  questions: string[];
  takeHomeAssignment?: string;
}

@Injectable()
export class ResumeAnalysisService {
  private readonly logger = new Logger(ResumeAnalysisService.name);
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('openai.apiKey') || '';
    this.model = this.configService.get<string>('openai.model') || 'llama-3.3-70b-versatile';
    this.baseUrl = this.configService.get<string>('openai.baseUrl', 'https://api.openai.com/v1');
  }

  async analyzeResume(buffer: Buffer, mimetype: string): Promise<ResumeAnalysis> {
    const resumeText = await this.extractText(buffer, mimetype);

    if (!resumeText || resumeText.trim().length < 50) {
      throw new Error('Could not extract meaningful text from resume');
    }

    const extraction = await this.extractWithLLM(resumeText);
    const totalYearsExp = this.calculateYearsExperience(extraction.workHistory);
    const seniorityLevel = this.determineSeniority(totalYearsExp, extraction.seniorityGuess);

    return {
      resumeText,
      workHistory: extraction.workHistory,
      totalYearsExp,
      seniorityLevel,
      domains: extraction.domains,
    };
  }

  private async extractText(buffer: Buffer, mimetype: string): Promise<string> {
    if (mimetype !== 'application/pdf') {
      return '';
    }
    try {
      const { PDFParse } = await import('pdf-parse');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const parser = new (PDFParse as any)({ data: buffer, verbosity: 0 });
      const result = await parser.getText();
      const text = result?.text ?? (typeof result === 'string' ? result : String(result));
      await parser.destroy();
      return text || '';
    } catch (error) {
      this.logger.warn(`PDF text extraction failed: ${error}`);
      return '';
    }
  }

  private async extractWithLLM(resumeText: string): Promise<{
    workHistory: WorkEntry[];
    domains: string[];
    seniorityGuess: string;
  }> {
    if (!this.apiKey) {
      this.logger.warn('No API key configured, skipping LLM resume extraction');
      return { workHistory: [], domains: [], seniorityGuess: 'mid' };
    }

    const today = new Date().toISOString().slice(0, 7);

    const systemPrompt = `You are a resume parser. Extract structured information from resume text.

RESPONSE FORMAT (JSON only, no markdown):
{
  "workHistory": [
    { "company": "Company Name", "role": "Job Title", "start": "YYYY-MM", "end": "YYYY-MM or present" }
  ],
  "domains": ["React", "Node.js", "Python"],
  "seniorityGuess": "entry|junior|mid|senior|staff"
}

RULES:
- workHistory: list ALL work experience, most recent first
- Use "present" for current roles (today is ${today})
- If only year is given, use YYYY-01 as approximation
- domains: technologies, frameworks, languages, tools the person has USED
- seniorityGuess: your assessment based on role titles and scope
- Output ONLY valid JSON, no explanation`;

    const userPrompt = `Parse this resume:\n\n${resumeText.slice(0, 6000)}`;

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.1,
          max_tokens: 2048,
        }),
      });

      if (!response.ok) {
        throw new Error(`LLM API error: ${response.status}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';
      const jsonStr = content
        .replace(/```json?\n?/g, '')
        .replace(/```/g, '')
        .trim();
      return JSON.parse(jsonStr);
    } catch (error) {
      this.logger.error(`LLM extraction failed: ${error}`);
      return { workHistory: [], domains: [], seniorityGuess: 'mid' };
    }
  }

  private calculateYearsExperience(workHistory: WorkEntry[]): number {
    if (!workHistory || workHistory.length === 0) return 0;

    const today = new Date();

    const ranges = workHistory
      .map(entry => {
        const start = this.parseYearMonth(entry.start);
        const end = entry.end === 'present' ? today : this.parseYearMonth(entry.end);
        if (!start || !end || end < start) return null;
        return { start, end };
      })
      .filter((r): r is { start: Date; end: Date } => r !== null)
      .sort((a, b) => a.start.getTime() - b.start.getTime());

    if (ranges.length === 0) return 0;

    // Merge overlapping ranges to avoid double-counting concurrent jobs
    const merged: { start: Date; end: Date }[] = [];
    for (const range of ranges) {
      if (merged.length === 0) {
        merged.push({ ...range });
        continue;
      }
      const last = merged[merged.length - 1];
      if (range.start <= last.end) {
        if (range.end > last.end) last.end = range.end;
      } else {
        merged.push({ ...range });
      }
    }

    const totalMs = merged.reduce((sum, r) => sum + (r.end.getTime() - r.start.getTime()), 0);
    const totalYears = totalMs / (1000 * 60 * 60 * 24 * 365.25);
    return Math.round(totalYears * 10) / 10;
  }

  private parseYearMonth(str: string): Date | null {
    if (!str) return null;
    const match = str.match(/^(\d{4})-(\d{2})$/);
    if (!match) return null;
    return new Date(parseInt(match[1]), parseInt(match[2]) - 1, 1);
  }

  private determineSeniority(
    yearsExp: number,
    llmGuess: string
  ): 'entry' | 'junior' | 'mid' | 'senior' | 'staff' {
    const levels = ['entry', 'junior', 'mid', 'senior', 'staff'] as const;

    let yearsLevel: (typeof levels)[number];
    if (yearsExp < 1) yearsLevel = 'entry';
    else if (yearsExp < 3) yearsLevel = 'junior';
    else if (yearsExp < 6) yearsLevel = 'mid';
    else if (yearsExp < 10) yearsLevel = 'senior';
    else yearsLevel = 'staff';

    if (!levels.includes(llmGuess as (typeof levels)[number])) return yearsLevel;

    const yearsIdx = levels.indexOf(yearsLevel);
    const llmIdx = levels.indexOf(llmGuess as (typeof levels)[number]);

    // Allow LLM to bump up by 1 (high-impact short career), but trust years if LLM says lower
    if (Math.abs(yearsIdx - llmIdx) <= 1 && llmIdx >= yearsIdx) {
      return llmGuess as (typeof levels)[number];
    }

    return yearsLevel;
  }

  async generateCandidateQuestions(params: {
    challengeTitle: string;
    challengeDescription: string;
    resumeContext: {
      seniorityLevel: string;
      domains: string[];
      totalYearsExp: number;
    };
  }): Promise<CandidateQuestions> {
    if (!this.apiKey) {
      return { questions: [] };
    }

    const { seniorityLevel, domains, totalYearsExp } = params.resumeContext;
    const isMidOrAbove = ['mid', 'senior', 'staff'].includes(seniorityLevel);

    const systemPrompt = `You are a technical interviewer generating personalized questions for a coding challenge.

RESPONSE FORMAT (JSON only, no markdown):
{
  "questions": [
    "Technical question 1?",
    "Technical question 2?",
    "Technical question 3?",
    "Technical question 4?",
    "Technical question 5?"
  ]${isMidOrAbove ? ',\n  "takeHomeAssignment": "Detailed real-world task description (2-3 hours of work)"' : ''}
}

RULES:
- Generate exactly 5 questions
- Questions must be specific to the candidate's domain AND the challenge topic
- Difficulty must match the seniority level
- For mid/senior/staff: include a take-home assignment (substantial, real-world, 2-3 hours)
- Output ONLY valid JSON`;

    const userPrompt = `CANDIDATE:
- Seniority: ${seniorityLevel} (${totalYearsExp} years experience)
- Domains: ${domains.slice(0, 8).join(', ')}

CHALLENGE: ${params.challengeTitle}
${params.challengeDescription}

Generate questions${isMidOrAbove ? ' and a take-home assignment' : ''} for this candidate.`;

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.4,
          max_tokens: 2048,
        }),
      });

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';
      const jsonStr = content
        .replace(/```json?\n?/g, '')
        .replace(/```/g, '')
        .trim();
      const parsed = JSON.parse(jsonStr);

      return {
        questions: Array.isArray(parsed.questions) ? parsed.questions : [],
        takeHomeAssignment: isMidOrAbove ? parsed.takeHomeAssignment : undefined,
      };
    } catch (error) {
      this.logger.error(`Question generation failed: ${error}`);
      return { questions: [] };
    }
  }

  async generateChallengesFromResume(resumeContext: {
    seniorityLevel: string;
    domains: string[];
    totalYearsExp: number;
  }): Promise<
    Array<{
      title: string;
      description: string;
      difficulty: string;
      category: string;
      referenceSolution: string;
      solutionLanguage: string;
    }>
  > {
    if (!this.apiKey) return [];

    const { seniorityLevel, domains, totalYearsExp } = resumeContext;
    const isMidOrAbove = ['mid', 'senior', 'staff'].includes(seniorityLevel);
    const topDomains = domains.slice(0, 6);

    const difficulty =
      seniorityLevel === 'entry' || seniorityLevel === 'junior'
        ? 'BEGINNER'
        : seniorityLevel === 'mid'
          ? 'INTERMEDIATE'
          : 'ADVANCED';

    const systemPrompt = `You are a technical challenge designer creating personalized coding challenges based on a candidate's resume.

RESPONSE FORMAT (JSON only, no markdown):
{
  "challenges": [
    {
      "title": "Challenge title",
      "description": "Detailed problem description with input/output examples",
      "category": "GENERAL_SWE" or "DOMAIN_SPECIFIC",
      "referenceSolution": "Complete working solution code",
      "solutionLanguage": "python" or "javascript"
    }
  ]
}

RULES:
- Generate exactly 4 challenges
- First 2 should be GENERAL_SWE (algorithmic/data structure problems relevant to the candidate's domain)
- Last 2 should be DOMAIN_SPECIFIC (practical problems using the candidate's actual tech stack)
- Difficulty should match: ${difficulty} level (${seniorityLevel}, ${totalYearsExp} years)
- Each description must include 2-3 example inputs and expected outputs
- Reference solutions must be complete, runnable code
- DOMAIN_SPECIFIC challenges should test real-world skills (e.g. "Build a REST endpoint", "Write a React hook", "Create a SQL query")
- Output ONLY valid JSON`;

    const userPrompt = `CANDIDATE PROFILE:
- Seniority: ${seniorityLevel} (${totalYearsExp} years)
- Tech domains: ${topDomains.join(', ')}
${isMidOrAbove ? '- Include more complex, production-level scenarios' : '- Keep challenges approachable but meaningful'}

Generate 4 personalized coding challenges for this candidate.`;

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.5,
          max_tokens: 4096,
        }),
      });

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';
      const jsonStr = content
        .replace(/```json?\n?/g, '')
        .replace(/```/g, '')
        .trim();
      const parsed = JSON.parse(jsonStr);

      return (parsed.challenges || []).map(
        (c: {
          title: string;
          description: string;
          category?: string;
          referenceSolution: string;
          solutionLanguage?: string;
        }) => ({
          title: c.title,
          description: c.description,
          difficulty,
          category: c.category || 'GENERAL_SWE',
          referenceSolution: c.referenceSolution,
          solutionLanguage: c.solutionLanguage || 'python',
        })
      );
    } catch (error) {
      this.logger.error(`Challenge generation from resume failed: ${error}`);
      return [];
    }
  }
}
