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

    // Use MORE domains — up to 15 to cover the candidate's actual breadth
    const topDomains = domains.slice(0, 15);

    // Difficulty spread based on seniority
    let difficultySpread: string;
    if (seniorityLevel === 'entry') {
      difficultySpread = '5 BEGINNER + 2 INTERMEDIATE + 1 ADVANCED';
    } else if (seniorityLevel === 'junior') {
      difficultySpread = '3 BEGINNER + 3 INTERMEDIATE + 2 ADVANCED';
    } else if (seniorityLevel === 'mid') {
      difficultySpread = '1 BEGINNER + 3 INTERMEDIATE + 3 ADVANCED + 1 EXPERT';
    } else {
      difficultySpread = '1 INTERMEDIATE + 3 ADVANCED + 4 EXPERT';
    }

    const systemPrompt = `You are a senior technical challenge designer creating personalized coding challenges based on a candidate's resume.

RESPONSE FORMAT (JSON only, no markdown):
{
  "challenges": [
    {
      "title": "Unique, specific challenge title",
      "description": "Detailed problem description with clear expectations",
      "difficulty": "BEGINNER" | "INTERMEDIATE" | "ADVANCED" | "EXPERT",
      "type": "CODING" | "DESIGN" | "WRITTEN" | "MIXED",
      "category": "GENERAL_SWE" | "DOMAIN_SPECIFIC",
      "referenceSolution": "Complete solution (code for CODING/MIXED, detailed text for DESIGN/WRITTEN)",
      "solutionLanguage": "python" | "javascript" | "typescript" | "plaintext" | etc.,
      "domainTag": "The primary technology/domain this challenge assesses (e.g. 'React', 'Python', 'Node.js', 'System Design', 'SQL')"
    }
  ]
}

CRITICAL RULES:
- Generate exactly 6 challenges with this type breakdown:
  * 3 CODING challenges (type: "CODING") — 1 GENERAL_SWE + 2 DOMAIN_SPECIFIC
  * 1 DESIGN challenge (type: "DESIGN") — system design / architecture problem. DOMAIN_SPECIFIC.
  * 1 WRITTEN challenge (type: "WRITTEN") — conceptual/theoretical question. DOMAIN_SPECIFIC.
  * 1 MIXED challenge (type: "MIXED") — combine coding with explanation. DOMAIN_SPECIFIC.
- Difficulty spread: ${difficultySpread} (distribute across all types)
- Each challenge MUST have a UNIQUE title — no duplicates, no generic names
- CODING challenges: MUST be stdin/stdout programs that run in a sandbox with ZERO external dependencies. This is the most important rule:
  * NEVER use imports/requires for frameworks or libraries (no express, react, next, fastapi, prisma, mongoose, axios, etc.)
  * ONLY use the language's standard library
  * Every solution MUST read input from STDIN and write output to STDOUT. This is how the sandbox tests code.
  * The description MUST specify the EXACT input format, output format, and behavior for EVERY operation. Leave ZERO ambiguity. Example:
    "Input: First line contains N (number of intervals). Next N lines each contain two space-separated integers (start end).
     Output: Print the merged intervals, one per line as 'start end', sorted by start time.
     Example Input:
     3
     1 3
     2 6
     8 10
     Example Output:
     1 6
     8 10"
  * AMBIGUITY RULES — the description must explicitly define:
    - For data structures: specify if insert means "append to end" or "prepend to front"
    - For sorting: specify ascending or descending
    - For edge cases: specify what to output for empty input (empty line? nothing? "empty"?)
    - For multiple outputs: specify separator (space, newline, comma)
    - For boolean results: specify exact output format ("true"/"false", "yes"/"no", "1"/"0")
    - For floating point: specify decimal precision (e.g. "print to 2 decimal places")
  * Provide AT LEAST 2 complete input/output examples that cover normal AND edge cases
  * The reference solution's output for the given examples MUST match exactly
  * The reference solution MUST include a main function that reads from stdin and prints to stdout
  * For domain-specific CODING: test the CONCEPTS from the domain as algorithmic problems. Examples:
    - React domain → "Given a JSON representation of two component trees, compute the minimum edit operations to transform tree A into tree B. Input: two JSON objects on separate lines. Output: list of operations."
    - Express domain → "Given a list of route patterns and a URL, output which route matches. Input: N routes on separate lines, then the URL. Output: the matching route or 'no match'."
    - Database domain → "Given a nested filter object as JSON, generate the equivalent SQL WHERE clause. Input: JSON string. Output: SQL WHERE clause string."
    - Rust domain → "Implement a linked list that supports insert, remove, and print operations. Input: commands one per line (insert X, remove X, print). Output: space-separated values on each print command."
  * Use substantial problems (hash maps, graphs, trees, DP, sliding window, etc.) — NOT trivial one-liners
  * Every example in the description must show the EXACT stdin input and EXACT stdout output so candidates know the format
- DESIGN challenges: real-world system design relevant to the candidate's stack. Examples:
  * "Design a rate-limited API gateway for a microservices architecture"
  * "Design the database schema and API for a real-time chat system"
  * "Architect a CI/CD pipeline for a monorepo with multiple services"
- WRITTEN challenges: deep technical knowledge questions. Examples:
  * "Explain the tradeoffs between SSR, SSG, and ISR in Next.js"
  * "Compare event-driven vs request-response architectures for a notification system"
  * "Describe how you would debug a memory leak in a Node.js production service"
- MIXED challenges: code + explanation combined. The coding part MUST follow the same stdin/stdout rules as CODING (no imports, exact I/O format, concrete examples). The candidate should write code FIRST, then add their explanation below a "---" separator. Examples:
  * "Write a program that implements an LRU cache. Input: commands (put key value, get key). Output: value on get or -1 if not found. After the code, explain your eviction strategy and time complexity below a --- separator."
  * "Write a program that merges two sorted arrays. Input: two lines of space-separated integers. Output: single line of merged sorted integers. Then explain your approach and time complexity below ---."
- DOMAIN_SPECIFIC challenges must use the candidate's ACTUAL tech stack — not generic
- For CODING/MIXED: solutionLanguage MUST be one of: "python", "javascript", "typescript", "java", "cpp", "csharp", "go", "rust", "ruby", "php", "kotlin", "swift", "scala", "bash"
- For DESIGN/WRITTEN: solutionLanguage should be "plaintext" and referenceSolution should be a detailed model answer in plain English
- CODING/MIXED reference solutions are THE MOST CRITICAL PART. They MUST be:
  * COMPLETE — every function implemented, no "..." or "TODO" or placeholders
  * RUNNABLE — copy-paste into a terminal and it works with zero edits
  * SELF-CONTAINED — zero imports except the language's built-in I/O (e.g. readline for JS, sys.stdin for Python, std::io for Rust)
  * STDIN/STDOUT — reads input with the language's standard I/O, prints output with print/console.log/println
  * FORMAT-MATCHING — the output format of the reference solution MUST exactly match what the description says. If description says "one operation per line", the reference solution must use "\n". If "comma-separated", use ","
  * For JavaScript: use the readline module pattern: const readline = require('readline'); const rl = readline.createInterface({input: process.stdin}); let lines=[]; rl.on('line', l => lines.push(l)); rl.on('close', () => { /* solve here */ });
  * For Python: use the sys.stdin pattern: import sys; lines = sys.stdin.read().strip().split('\\n')
  * NEVER write incomplete functions with "..." or placeholder dots — write the FULL implementation with all logic
- Each description must clearly state what is expected from the candidate
- Output ONLY valid JSON`;

    const userPrompt = `CANDIDATE PROFILE:
- Seniority: ${seniorityLevel} (${totalYearsExp} years experience)
- Full tech stack: ${topDomains.join(', ')}
${isMidOrAbove ? '- This is a mid/senior+ candidate — challenges should test production-level thinking, edge cases, and system design awareness' : '- Junior candidate — challenges should be meaningful but approachable, testing real understanding not just syntax'}

Generate 6 unique, personalized challenges across CODING, DESIGN, WRITTEN, and MIXED types. Make every challenge specific to their stack.`;

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
          temperature: 0.6,
          max_tokens: 16384,
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

      return (parsed.challenges || []).map(
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
            : 'INTERMEDIATE',
          type: validTypes.includes(c.type || '') ? c.type! : 'CODING',
          category: c.category || 'GENERAL_SWE',
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
    } catch (error) {
      this.logger.error(`Challenge generation from resume failed: ${error}`);
      return [];
    }
  }
}
