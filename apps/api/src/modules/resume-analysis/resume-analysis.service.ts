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
  currentRole?: string;
  currentCompany?: string;
  location?: string;
  headline?: string;
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
      currentRole: extraction.currentRole,
      currentCompany: extraction.currentCompany,
      location: extraction.location,
      headline: extraction.headline,
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
    currentRole?: string;
    currentCompany?: string;
    location?: string;
    headline?: string;
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
  "seniorityGuess": "entry|junior|mid|senior|staff",
  "currentRole": "Most recent job title or null",
  "currentCompany": "Most recent company name or null",
  "location": "City or location mentioned or null",
  "headline": "Short professional headline, e.g. Full-Stack Developer or null"
}

RULES:
- workHistory: list ALL work experience, most recent first
- Use "present" for current roles (today is ${today})
- If only year is given, use YYYY-01 as approximation
- domains: technologies, frameworks, languages, tools the person has USED
- seniorityGuess: your assessment based on role titles and scope
- currentRole: the person's most recent job title from workHistory (null if not found)
- currentCompany: the company of the most recent role (null if not found)
- location: the person's city or location if mentioned anywhere in the resume (null if not found)
- headline: a concise professional headline summarizing the person (null if not determinable)
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
    const year = parseInt(match[1]);
    const month = parseInt(match[2]);
    if (month < 1 || month > 12) return null;
    return new Date(year, month - 1, 1);
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
      type: string;
      category: string;
      referenceSolution: string;
      solutionLanguage: string;
      domainTag: string;
    }>
  > {
    if (!this.apiKey) return [];

    const { seniorityLevel, domains, totalYearsExp } = resumeContext;
    const isMidOrAbove = ['mid', 'senior', 'staff'].includes(seniorityLevel);
    const topDomains = domains.slice(0, 15);

    // Batch generation: 3 calls, 2 challenges each — avoids Groq token limit truncation
    const batches = [
      {
        type: 'CODING',
        count: 2,
        instruction: `Generate exactly 2 CODING challenges. One GENERAL_SWE (algorithmic) and one DOMAIN_SPECIFIC (tests concepts from the candidate's tech stack as a pure algorithm).`,
      },
      {
        type: 'TEXT',
        count: 2,
        instruction: `Generate exactly 2 challenges: 1 DESIGN challenge (system design problem, type "DESIGN", solutionLanguage "plaintext") and 1 WRITTEN challenge (conceptual/theoretical question, type "WRITTEN", solutionLanguage "plaintext").`,
      },
      {
        type: 'CODING2',
        count: 2,
        instruction: `Generate exactly 2 more CODING challenges. Both DOMAIN_SPECIFIC — test different domains from the candidate's stack. Use different languages for each.`,
      },
    ];

    const difficulty =
      seniorityLevel === 'entry'
        ? 'BEGINNER'
        : seniorityLevel === 'junior'
          ? 'INTERMEDIATE'
          : seniorityLevel === 'mid'
            ? 'ADVANCED'
            : 'EXPERT';

    const codingRules = `CODING RULES:
- Solution MUST read from STDIN and write to STDOUT.
- Importing frameworks and libraries IS allowed. The sandbox has these pre-installed:
  * JavaScript/Node.js: express, fastify, hono, react, next, prisma, mongoose, pg, axios, lodash, zod, jest, graphql, vue, svelte
  * Python: fastapi, flask, django, requests, numpy, pandas, sqlalchemy, pymongo, redis, pydantic, pytest, beautifulsoup4, scikit-learn
  * Also available: Go, Rust, Java, C/C++, Ruby, PHP, Kotlin, Scala, Bash, Haskell, Elixir, R, Perl, Lua with standard libraries
- For DOMAIN_SPECIFIC challenges: USE the actual framework as a library. Examples:
  * Express: "Use express Router to parse route patterns. Read routes from stdin, output matched params as JSON."
  * React: "Use React.createElement to build a virtual DOM tree from JSON input. Output the rendered HTML string."
  * NumPy: "Read a matrix from stdin, use numpy to compute eigenvalues. Output them sorted."
  * Prisma: "Given a schema definition on stdin, output the SQL CREATE TABLE statements."
  * Flask: "Use Flask's URL routing to match patterns. Read URL and routes from stdin, output the match."
- Despite using frameworks, the program MUST still read from STDIN and write to STDOUT for testing.
- Description MUST specify EXACT input format, output format, with 2 complete examples.
- Specify behavior unambiguously: insert = append or prepend, sort = asc or desc, empty input output, separators.
- Reference solution MUST be COMPLETE runnable code (no "..." placeholders).
- For JS: use readline pattern for stdin. For Python: use sys.stdin.
- Keep reference solution under 50 lines. If longer, simplify the problem.`;

    const allChallenges: Array<{
      title: string;
      description: string;
      difficulty: string;
      type: string;
      category: string;
      referenceSolution: string;
      solutionLanguage: string;
      domainTag: string;
    }> = [];

    for (const batch of batches) {
      try {
        const systemPrompt = `You are a challenge designer. Generate EXACTLY ${batch.count} challenges as JSON.

RESPONSE FORMAT (JSON only, no markdown):
{"challenges": [{"title": "...", "description": "...", "difficulty": "BEGINNER|INTERMEDIATE|ADVANCED|EXPERT", "type": "CODING|DESIGN|WRITTEN", "category": "GENERAL_SWE|DOMAIN_SPECIFIC", "referenceSolution": "...", "solutionLanguage": "python|javascript|typescript|plaintext|etc", "domainTag": "React|Python|etc"}]}

${batch.type !== 'TEXT' ? codingRules : 'DESIGN/WRITTEN: referenceSolution should be a detailed model answer in plain English. solutionLanguage = "plaintext".'}

CRITICAL: Every function in referenceSolution must be FULLY implemented. No placeholders. Output ONLY valid JSON.`;

        const userPrompt = `CANDIDATE: ${seniorityLevel} (${totalYearsExp}yr), stack: ${topDomains.join(', ')}
DIFFICULTY: mix around ${difficulty} level
${isMidOrAbove ? 'Test production-level thinking.' : 'Keep approachable but meaningful.'}

${batch.instruction}`;

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
            temperature: 0.6,
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

        const validLanguages = [
          'python',
          'javascript',
          'typescript',
          'java',
          'cpp',
          'csharp',
          'go',
          'rust',
          'ruby',
          'php',
          'kotlin',
          'swift',
          'scala',
          'bash',
        ];
        const validTypes = ['CODING', 'DESIGN', 'WRITTEN', 'MIXED'];

        const challenges = (parsed.challenges || []).map(
          (c: {
            title: string;
            description: string;
            difficulty?: string;
            type?: string;
            category?: string;
            referenceSolution: string;
            solutionLanguage?: string;
            domainTag?: string;
          }) => ({
            title: c.title,
            description: c.description,
            difficulty: ['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT'].includes(
              c.difficulty || ''
            )
              ? c.difficulty
              : difficulty,
            type: validTypes.includes(c.type || '') ? c.type! : 'CODING',
            category: c.category || 'DOMAIN_SPECIFIC',
            referenceSolution: c.referenceSolution,
            solutionLanguage:
              c.solutionLanguage === 'plaintext'
                ? 'plaintext'
                : validLanguages.includes(c.solutionLanguage || '')
                  ? c.solutionLanguage!
                  : 'python',
            domainTag: c.domainTag || 'General',
          })
        );

        allChallenges.push(...challenges);
        this.logger.log(`Batch "${batch.type}": generated ${challenges.length} challenges`);
      } catch (error) {
        this.logger.error(`Batch "${batch.type}" failed: ${error}`);
      }
    }

    this.logger.log(`Total challenges generated: ${allChallenges.length}`);
    return allChallenges;
  }
}
