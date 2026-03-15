# VeriHire — Technical Analysis

> End-to-end technical reference for the entire codebase. Intended for teammates joining the project.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Monorepo Structure](#2-monorepo-structure)
3. [Backend — NestJS API](#3-backend--nestjs-api)
4. [Database Schema](#4-database-schema)
5. [Frontend — Next.js Web App](#5-frontend--nextjs-web-app)
6. [Core Pipelines](#6-core-pipelines)
7. [All API Endpoints](#7-all-api-endpoints)
8. [Authentication & Authorization](#8-authentication--authorization)
9. [File Storage](#9-file-storage)
10. [Environment Variables](#10-environment-variables)
11. [Infrastructure & Deployment](#11-infrastructure--deployment)
12. [Data Flow: Candidate Journey](#12-data-flow-candidate-journey)
13. [Data Flow: Recruiter Journey](#13-data-flow-recruiter-journey)

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser                              │
│                  Next.js 14 (port 3100)                     │
│         App Router · shadcn/ui · SWR · Monaco Editor        │
└───────────────────────┬─────────────────────────────────────┘
                        │ REST (Bearer JWT)
┌───────────────────────▼─────────────────────────────────────┐
│                  NestJS API (port 4100)                      │
│        17 modules · Prisma ORM · JWT Auth · Swagger          │
└──────┬──────────────────┬────────────────────┬──────────────┘
       │                  │                    │
┌──────▼──────┐   ┌───────▼───────┐   ┌───────▼────────┐
│  Supabase   │   │   Groq API    │   │   Judge0 CE    │
│  Postgres   │   │  Llama 3.3    │   │ Code Execution │
│  + Storage  │   │  70B (LLM)    │   │  (sandboxed)   │
└─────────────┘   └───────────────┘   └────────────────┘
                                              │
                                    ┌─────────▼──────────┐
                                    │  Polygon Blockchain │
                                    │  (cert anchoring)   │
                                    └────────────────────┘
```

**Request flow summary:**

- Frontend talks exclusively to the NestJS API via REST with Bearer JWT tokens
- API persists data to Supabase PostgreSQL via Prisma
- Files (resumes, certificates, portfolio) go to Supabase S3-compatible storage
- LLM calls (test case generation, evaluation feedback, resume analysis) go to Groq
- Code execution goes to Judge0 CE running in Docker (locally) or via ngrok tunnel
- Certificate hashes are anchored to Polygon Amoy testnet via ethers.js

---

## 2. Monorepo Structure

**Tooling:** Turborepo + pnpm workspaces

```
verihire/
├── apps/
│   ├── api/                        # NestJS backend
│   │   ├── src/
│   │   │   ├── app.module.ts       # Root module — imports all feature modules
│   │   │   ├── main.ts             # Bootstrap: Swagger, pipes, guards, CORS
│   │   │   ├── config/
│   │   │   │   └── configuration.ts  # Typed config (loads from .env)
│   │   │   └── modules/            # 17 feature modules (see §3)
│   │   ├── railway.toml            # Railway deployment config
│   │   └── package.json
│   └── web/                        # Next.js frontend
│       ├── src/
│       │   ├── app/                # App Router pages (see §5)
│       │   ├── components/         # Shared UI components
│       │   ├── hooks/              # SWR data-fetching hooks
│       │   └── lib/                # API client, auth context, utils
│       ├── railway.toml
│       └── package.json
├── packages/
│   ├── database/                   # Prisma schema + client singleton
│   │   └── prisma/schema.prisma
│   ├── types/                      # Shared TypeScript interfaces
│   ├── utils/                      # generateUUID, shared helpers
│   └── config/                     # Shared ESLint, Prettier, tsconfig
├── docker-compose.yml              # Judge0 CE (server + worker + postgres + redis)
├── .env                            # Root env (loaded by both apps)
└── README.md
```

---

## 3. Backend — NestJS API

**Base path:** `/api` · **Swagger:** `http://localhost:4100/docs`

### Module Map

| Module            | Responsibility                                                      |
| ----------------- | ------------------------------------------------------------------- |
| `auth`            | Register, login, OAuth (Google/GitHub), JWT, session management     |
| `users`           | Raw user CRUD, password hashing via bcrypt                          |
| `candidates`      | Candidate profile, skills, file uploads, resume AI analysis trigger |
| `recruiters`      | Recruiter profile management                                        |
| `companies`       | Company CRUD                                                        |
| `challenges`      | Challenge/template CRUD, AI-assisted generation                     |
| `submissions`     | Submission lifecycle: start → auto-save → submit → evaluate         |
| `evaluations`     | Full LLM + Judge0 evaluation pipeline orchestrator                  |
| `code-execution`  | Judge0 CE wrapper — batch submit, poll, compare outputs             |
| `certificates`    | Generate, ECDSA-sign, store, and verify certificates                |
| `skills`          | Skill taxonomy and category tree                                    |
| `jobs`            | Job postings, pipeline shortlisting, candidate matching             |
| `reviews`         | Peer review assignment, scoring, reputation                         |
| `storage`         | S3-compatible file upload/download (Supabase)                       |
| `blockchain`      | Polygon cert anchoring via ethers.js                                |
| `analytics`       | Dashboard metrics for recruiters and platform                       |
| `resume-analysis` | PDF parse → Groq extraction → seniority/domain/years calc           |
| `health`          | Health/readiness/liveness probes                                    |

### NestJS Conventions

- **Guards:** `JwtAuthGuard` (validates Bearer), `RolesGuard` (checks `@Roles()`), `LocalAuthGuard`, `GoogleAuthGuard`, `GitHubAuthGuard`
- **Pipes:** Global `ValidationPipe` with `whitelist: true`, `forbidNonWhitelisted: true`, `transform: true`
- **Rate Limiting:** Three-tier Throttler — short (3 req/s), medium (20/10s), long (100/min)
- **Prisma:** Singleton client imported from `@verihire/database` — services call `prisma.*` directly, no repository pattern
- **Config:** Global `ConfigModule` — all services use `ConfigService.get('key.nested')`

---

## 4. Database Schema

**Provider:** PostgreSQL on Supabase · **ORM:** Prisma 5

### All Models

```
User                    — account, email, password hash, OAuth info
  └─ UserRole           — CANDIDATE / RECRUITER / ADMIN (many per user)
  └─ Session            — refresh token sessions with revocation support
  └─ CandidateProfile   — 1:1
  └─ RecruiterProfile   — 1:1
  └─ ChallengeTemplate  — templates created by this user

CandidateProfile        — bio, headline, location, resume URL, AI analysis fields
  └─ CandidateSkill     — verified skill + score + level (many)
  └─ Submission         — code submissions (many)
  └─ Certificate        — earned certs (many)
  └─ Review             — peer reviews given (many)
  └─ Shortlist          — recruiter shortlist entries (many)

SkillCategory           — hierarchical (parent/children self-relation)
  └─ Skill              — name, slug, pass threshold, certification settings
      └─ CandidateSkill
      └─ Challenge
      └─ Certificate
      └─ JobSkill

ChallengeTemplate       — reusable templates with rubrics and prompt templates
  └─ Challenge          — generated instance (title, description, test cases)
      └─ Submission
      └─ Certificate

Submission              — code content, language, timing, status, scores
  └─ Evaluation         — LLM + Judge0 results, feedback, criteria scores
  └─ Review             — peer review entries
  └─ Certificate

Certificate             — number, hash, ECDSA signature, blockchain tx, PDF/image URLs

Company                 — name, slug, industry, branding
  └─ RecruiterProfile
  └─ Job

Job                     — title, description, salary range, employment type, status
  └─ JobSkill           — required skills with min scores and weights
  └─ Shortlist          — candidates in pipeline

Shortlist               — stages: SHORTLISTED → SCREENING → INTERVIEW → ASSESSMENT → OFFER → HIRED / REJECTED

AuditLog                — event tracking for significant actions
AnalyticsEvent          — product analytics events
```

### Key Enums

| Enum                  | Values                                                                              |
| --------------------- | ----------------------------------------------------------------------------------- |
| `UserType`            | `CANDIDATE`, `RECRUITER`, `ADMIN`                                                   |
| `SubmissionStatus`    | `IN_PROGRESS`, `SUBMITTED`, `EVALUATING`, `EVALUATED`, `FAILED`                     |
| `ChallengeDifficulty` | `BEGINNER`, `INTERMEDIATE`, `ADVANCED`, `EXPERT`                                    |
| `ChallengeCategory`   | `GENERAL_SWE`, `DOMAIN_SPECIFIC`                                                    |
| `ShortlistStage`      | `SHORTLISTED`, `SCREENING`, `INTERVIEW`, `ASSESSMENT`, `OFFER`, `HIRED`, `REJECTED` |
| `SkillLevel`          | `BEGINNER`, `INTERMEDIATE`, `ADVANCED`, `EXPERT`                                    |
| `JobStatus`           | `DRAFT`, `ACTIVE`, `PAUSED`, `CLOSED`, `FILLED`                                     |

### Resume Analysis Fields (on CandidateProfile)

These are populated automatically after resume upload via the AI pipeline:

```sql
resume_text              TEXT           -- raw extracted PDF text
resume_seniority_level   VARCHAR(20)    -- entry / junior / mid / senior / staff
resume_domains           TEXT[]         -- e.g. ["React", "Node.js", "PostgreSQL"]
resume_years_exp         FLOAT          -- calculated from work history (e.g. 4.5)
resume_analyzed_at       TIMESTAMPTZ    -- timestamp of last analysis run
```

---

## 5. Frontend — Next.js Web App

**Framework:** Next.js 14 App Router · **Port:** 3100 · **Path alias:** `@/*` → `./src/*`

### Route Structure

```
app/
├── page.tsx                                          # Landing page
├── layout.tsx                                        # Root layout (fonts, providers)
├── auth/callback/page.tsx                            # OAuth token exchange

├── (public)/                                         # No auth required
│   ├── login/page.tsx                                # Email/password + Google/GitHub OAuth buttons
│   ├── register/page.tsx                             # Role selection + signup form
│   └── verify/[certNumber]/page.tsx                  # Public certificate verification

├── (authenticated)/                                  # Requires valid JWT
│   ├── layout.tsx                                    # Auth guard → /login if no token
│   │
│   ├── (candidate)/                                  # Requires role: CANDIDATE
│   │   ├── layout.tsx                                # Sidebar + header for candidate
│   │   ├── dashboard/page.tsx                        # Stats, active challenges, recent certs
│   │   ├── profile/page.tsx                          # Edit bio, skills, resume/portfolio upload
│   │   ├── challenges/page.tsx                       # Browse + filter by skill/difficulty
│   │   ├── challenges/[id]/page.tsx                  # Challenge detail + start button
│   │   ├── challenges/[id]/submit/page.tsx           # Monaco editor + timer + submit
│   │   ├── submissions/page.tsx                      # Submission history
│   │   ├── submissions/[id]/results/page.tsx         # Score, test results, LLM feedback
│   │   ├── certificates/page.tsx                     # Earned certs + download + share
│   │   ├── reviews/page.tsx                          # Pending peer review queue
│   │   └── reviews/[id]/page.tsx                     # Review submission form
│   │
│   └── (recruiter)/                                  # Requires role: RECRUITER
│       ├── layout.tsx                                # Sidebar + header for recruiter
│       ├── recruiter/dashboard/page.tsx              # Hiring analytics overview
│       ├── recruiter/company/page.tsx                # Company profile create/edit
│       ├── recruiter/candidates/page.tsx             # Search + filter candidates
│       ├── recruiter/candidates/[id]/page.tsx        # Candidate profile + resume analysis
│       ├── recruiter/jobs/page.tsx                   # My job postings list
│       ├── recruiter/jobs/new/page.tsx               # Create job form
│       ├── recruiter/jobs/[id]/page.tsx              # Edit job details
│       ├── recruiter/jobs/[id]/shortlist/page.tsx    # Kanban pipeline board
│       └── recruiter/jobs/[id]/matches/page.tsx      # AI-matched candidates
```

### Frontend Library (`src/lib/`)

| File               | Purpose                                                                                             |
| ------------------ | --------------------------------------------------------------------------------------------------- |
| `api.ts`           | Fetch wrapper — injects Bearer token, handles 401 → refresh, typed `get/post/patch/delete` helpers  |
| `auth-context.tsx` | `AuthProvider` — user state, `login()`, `logout()`, `refreshToken()`, stores tokens in localStorage |
| `swr-provider.tsx` | Global SWR config — base fetcher, error handling                                                    |
| `validations.ts`   | Zod schemas for all forms (register, login, profile, job, challenge)                                |
| `constants.ts`     | Route paths, enum display labels, status badge colors                                               |
| `types.ts`         | Frontend-specific type extensions                                                                   |
| `utils.ts`         | `cn()` (clsx + tailwind-merge)                                                                      |

### Custom Hooks (`src/hooks/`)

Each hook wraps SWR + the API client for one domain. Used in page components to fetch and mutate data.

| Hook                    | What it fetches / manages                               |
| ----------------------- | ------------------------------------------------------- |
| `use-candidate`         | Candidate profile, skills, stats                        |
| `use-candidates-search` | Paginated recruiter candidate search with filters       |
| `use-challenges`        | Challenge list, single challenge, recommended           |
| `use-submissions`       | Submission list, single submission + evaluation results |
| `use-certificates`      | Candidate's certificates                                |
| `use-skills`            | Skill taxonomy, categories                              |
| `use-jobs`              | Job postings, recruiter's jobs, shortlist               |
| `use-recruiter`         | Recruiter profile                                       |
| `use-companies`         | Company data                                            |
| `use-reviews`           | Pending reviews queue                                   |
| `use-debounce`          | Input debounce for search fields                        |
| `use-toast`             | Toast notification state                                |

### Key Frontend Dependencies

| Package                                           | Use                                                           |
| ------------------------------------------------- | ------------------------------------------------------------- |
| `@monaco-editor/react`                            | Code editor on the challenge submission page                  |
| `swr`                                             | Server state, caching, automatic revalidation                 |
| `react-hook-form` + `@hookform/resolvers` + `zod` | All forms with validation                                     |
| `@hello-pangea/dnd`                               | Drag-and-drop kanban on recruiter shortlist page              |
| `jose`                                            | Decode JWT on client to read user claims without a round-trip |
| `@radix-ui/*` (17 packages)                       | Headless UI primitives powering shadcn/ui components          |
| `lucide-react`                                    | Icon library                                                  |

---

## 6. Core Pipelines

### 6.1 Code Evaluation Pipeline

```
POST /submissions/:id/submit
         │
         ▼
SubmissionsService.submit()
  → validates ownership, status = IN_PROGRESS
  → sets status = SUBMITTED
         │
         ▼
EvaluationsService.evaluateSubmission()
  1. Atomic status claim (status → EVALUATING) — prevents race conditions
  2. Check challenge.cachedTestCases
  3. If no cached test cases:
       TestCaseGeneratorService.generateTestCases()
       → Groq/Llama 3.3: challenge description → JSON [{input, expectedOutput}]
  4. If challenge.referenceSolution exists:
       → Run reference solution in Judge0 to get ground-truth expected outputs
       → Override LLM-generated expected outputs with actual reference outputs
  5. CodeExecutionService.executeCode()
       → POST /submissions (batch) to Judge0 CE
       → Poll until all results returned
       → Compare actual vs expected output (trimmed exact string match)
  6. accuracy = passed_tests / total_tests
  7. TestCaseGeneratorService.generateFeedback()
       → Groq: code + test results → { feedback, suggestions, codeQualityScore }
  8. finalScore = (accuracy × 0.60) + (codeQualityScore × 0.40)
  9. Store Evaluation record (all test results, scores, feedback)
  10. Update Submission (status = EVALUATED, finalScore)
  11. Update CandidateProfile stats
  12. If finalScore ≥ skill.passThreshold:
        CertificatesService.generateCertificate() — async, fire-and-forget
```

### 6.2 Certificate Generation Pipeline

```
CertificatesService.generateCertificate()
  1. Verify submission.status === EVALUATED and score ≥ threshold
  2. Check no duplicate cert exists for this submission
  3. Generate cert number: VH-{YEAR}-{SKILLCODE}-{SEQUENCE}  e.g. VH-2026-PYTH-00042
  4. Build canonical JSON of certificate data
  5. SHA-256 hash of canonical JSON → certificateHash
  6. ECDSA secp256k1 sign with CERTIFICATE_SIGNING_PRIVATE_KEY → signature
  7. INSERT Certificate record with hash, signature, publicKey, verificationUrl
  8. PdfGeneratorService.generateCertificatePdf()
       → generate QR code buffer from verificationUrl
       → pdfkit: draw certificate layout, embed candidate name/score/skill/dates
       → embed QR code image into PDF
       → return buffer
  9. StorageService.uploadFile() → save to Supabase storage → get pdfUrl
  10. UPDATE Certificate with pdfUrl, imageUrl
  11. BlockchainService.anchorCertificate() — fire-and-forget
        → ethers.js contract call on Polygon Amoy testnet
        → UPDATE Certificate with blockchainTxId, blockNumber, blockchainNetwork
```

### 6.3 Resume Analysis Pipeline

```
POST /candidates/me/resume  (multipart/form-data PDF)
         │
         ▼
CandidatesService.uploadResume()
  1. Validate: type (PDF/DOC/DOCX), size ≤ 10MB
  2. Delete old resume from storage if exists
  3. Upload file to Supabase Storage
  4. UPDATE candidateProfile SET resumeUrl = <new url>
  5. Return { url, key }  ← response sent to client immediately
         │
         ▼ fire-and-forget (only if PDF)
ResumeAnalysisService.analyzeResume(buffer, mimetype)
  1. pdf-parse: extract raw text from buffer
  2. Validate: text.length ≥ 50 chars
  3. Groq/Llama 3.3 call (temperature=0.1):
       prompt: resume text (first 6000 chars)
       output JSON: {
         workHistory: [{ company, role, start: "YYYY-MM", end: "YYYY-MM|present" }],
         domains: ["React", "Node.js", ...],
         seniorityGuess: "entry|junior|mid|senior|staff"
       }
  4. Calculate years in code:
       - Parse all YYYY-MM strings to Date objects
       - Sort ranges by start date
       - Merge overlapping ranges (handles concurrent jobs)
       - Sum total duration in ms → convert to years (1 decimal)
  5. Validate seniority (years = ground truth):
       - < 1yr   → entry
       - 1–3yr   → junior
       - 3–6yr   → mid
       - 6–10yr  → senior
       - 10yr+   → staff
       LLM can bump UP by 1 level; can never downgrade below years-based level
  6. UPDATE candidateProfile SET
       resumeText, resumeSeniorityLevel, resumeDomains,
       resumeYearsExp, yearsExperience (rounded int), resumeAnalyzedAt
```

**Bonus for mid+ candidates:** `generateCandidateQuestions()` produces 5 domain-specific interview questions **and** a take-home assignment (2–3 hour real-world task) tailored to their background.

---

## 7. All API Endpoints

All routes are prefixed `/api`. Protected routes require `Authorization: Bearer <accessToken>`.

### Auth — `/auth`

| Method | Path                    | Auth   | Description                         |
| ------ | ----------------------- | ------ | ----------------------------------- |
| POST   | `/auth/register`        | Public | Register (candidate or recruiter)   |
| POST   | `/auth/login`           | Public | Email/password → token pair         |
| POST   | `/auth/refresh`         | Public | Refresh access token                |
| POST   | `/auth/logout`          | JWT    | Revoke session                      |
| GET    | `/auth/me`              | JWT    | Current user profile                |
| GET    | `/auth/google`          | Public | Start Google OAuth                  |
| GET    | `/auth/google/callback` | Public | Google callback → frontend redirect |
| GET    | `/auth/github`          | Public | Start GitHub OAuth                  |
| GET    | `/auth/github/callback` | Public | GitHub callback → frontend redirect |

### Candidates — `/candidates`

| Method | Path                              | Auth   | Description                          |
| ------ | --------------------------------- | ------ | ------------------------------------ |
| GET    | `/candidates/me`                  | JWT    | My candidate profile                 |
| PATCH  | `/candidates/me`                  | JWT    | Update profile                       |
| GET    | `/candidates/me/skills`           | JWT    | My skills list                       |
| POST   | `/candidates/me/skills`           | JWT    | Add skill                            |
| PATCH  | `/candidates/me/skills/:skillId`  | JWT    | Update skill level                   |
| DELETE | `/candidates/me/skills/:skillId`  | JWT    | Remove skill                         |
| GET    | `/candidates/me/stats`            | JWT    | Submission/cert/score stats          |
| GET    | `/candidates/profile/:slug`       | Public | Public portfolio (by slug or ID)     |
| GET    | `/candidates/search`              | JWT    | Search candidates (recruiter only)   |
| POST   | `/candidates/me/resume`           | JWT    | Upload resume → triggers AI analysis |
| DELETE | `/candidates/me/resume`           | JWT    | Delete resume                        |
| POST   | `/candidates/me/portfolio`        | JWT    | Upload portfolio file                |
| GET    | `/candidates/me/portfolio`        | JWT    | List portfolio files                 |
| DELETE | `/candidates/me/portfolio/:key`   | JWT    | Delete portfolio file                |
| GET    | `/candidates/:id/resume-analysis` | JWT    | AI resume analysis results           |

### Challenges — `/challenges`

| Method | Path                        | Auth | Description                            |
| ------ | --------------------------- | ---- | -------------------------------------- |
| GET    | `/challenges`               | JWT  | List (filter: skill, difficulty, type) |
| GET    | `/challenges/templates`     | JWT  | All templates                          |
| GET    | `/challenges/templates/:id` | JWT  | Single template                        |
| GET    | `/challenges/recommended`   | JWT  | Personalized recommendations           |
| GET    | `/challenges/skill/:slug`   | JWT  | Challenges for a skill                 |
| GET    | `/challenges/:id`           | JWT  | Challenge detail                       |
| GET    | `/challenges/:id/start`     | JWT  | Get challenge for submission           |
| POST   | `/challenges/generate`      | JWT  | Generate challenge from template       |

### Submissions — `/submissions`

| Method | Path                               | Auth        | Description                     |
| ------ | ---------------------------------- | ----------- | ------------------------------- |
| POST   | `/submissions/start`               | JWT         | Start submission                |
| GET    | `/submissions/my`                  | JWT         | My submission history           |
| GET    | `/submissions/active/:challengeId` | JWT         | Active in-progress submission   |
| GET    | `/submissions/:id`                 | JWT         | Get submission                  |
| GET    | `/submissions/:id/results`         | JWT         | Submission + evaluation results |
| PATCH  | `/submissions/:id`                 | JWT         | Auto-save code progress         |
| POST   | `/submissions/:id/submit`          | JWT         | Final submit → evaluation       |
| GET    | `/submissions/admin/all`           | JWT + ADMIN | All submissions with filters    |

### Evaluations — `/evaluations`

| Method | Path                                           | Auth        | Description               |
| ------ | ---------------------------------------------- | ----------- | ------------------------- |
| POST   | `/evaluations/submissions/:id/evaluate`        | JWT + ADMIN | Trigger evaluation        |
| POST   | `/evaluations/submissions/:id/re-evaluate`     | JWT + ADMIN | Re-run evaluation         |
| GET    | `/evaluations/submissions/:id`                 | JWT         | Get evaluation            |
| GET    | `/evaluations`                                 | JWT + ADMIN | All evaluations           |
| GET    | `/evaluations/stats`                           | JWT + ADMIN | Statistics                |
| POST   | `/evaluations/process-pending`                 | JWT + ADMIN | Batch process all pending |
| GET    | `/evaluations/certificates/verify/:certNumber` | Public      | Verify certificate        |
| POST   | `/evaluations/certificates/:certNumber/revoke` | JWT + ADMIN | Revoke certificate        |

### Certificates — `/certificates`

| Method | Path                                     | Auth        | Description                         |
| ------ | ---------------------------------------- | ----------- | ----------------------------------- |
| POST   | `/certificates/generate`                 | JWT         | Generate certificate for submission |
| GET    | `/certificates`                          | JWT         | List (paginated, filterable)        |
| GET    | `/certificates/stats`                    | JWT         | Statistics                          |
| GET    | `/certificates/candidate/:candidateId`   | JWT         | Candidate's certs                   |
| GET    | `/certificates/:id`                      | JWT         | By ID                               |
| GET    | `/certificates/number/:certNumber`       | JWT         | By certificate number               |
| GET    | `/certificates/:id/download`             | JWT         | Download PDF / image / JSON         |
| GET    | `/certificates/verify/:certNumber`       | Public      | Verify by cert number               |
| POST   | `/certificates/verify`                   | Public      | Verify by number or hash            |
| GET    | `/certificates/verify/:certNumber/quick` | Public      | Quick verification                  |
| POST   | `/certificates/revoke`                   | JWT + ADMIN | Revoke                              |
| POST   | `/certificates/:id/reinstate`            | JWT + ADMIN | Reinstate                           |
| GET    | `/certificates/:id/revocation-history`   | JWT         | Revocation history                  |
| GET    | `/certificates/admin/revoked`            | JWT + ADMIN | All revoked                         |

### Skills — `/skills`

| Method | Path                       | Auth   | Description      |
| ------ | -------------------------- | ------ | ---------------- |
| GET    | `/skills`                  | Public | All skills       |
| GET    | `/skills/popular`          | Public | Most-used skills |
| GET    | `/skills/categories`       | Public | All categories   |
| GET    | `/skills/categories/:slug` | Public | Category by slug |
| GET    | `/skills/:slug`            | Public | Skill by slug    |
| GET    | `/skills/:id/stats`        | Public | Skill statistics |

### Jobs — `/jobs`

| Method | Path                               | Auth            | Description               |
| ------ | ---------------------------------- | --------------- | ------------------------- |
| GET    | `/jobs/search`                     | Public          | Search jobs               |
| GET    | `/jobs/:id`                        | Public          | Job detail                |
| POST   | `/jobs`                            | JWT (RECRUITER) | Create job                |
| GET    | `/jobs/recruiter/my-jobs`          | JWT (RECRUITER) | My postings               |
| PATCH  | `/jobs/:id`                        | JWT (RECRUITER) | Edit job                  |
| POST   | `/jobs/:id/publish`                | JWT (RECRUITER) | Publish                   |
| POST   | `/jobs/:id/close`                  | JWT (RECRUITER) | Close                     |
| DELETE | `/jobs/:id`                        | JWT (RECRUITER) | Delete                    |
| POST   | `/jobs/:id/skills`                 | JWT (RECRUITER) | Add required skill        |
| DELETE | `/jobs/:id/skills/:skillId`        | JWT (RECRUITER) | Remove skill              |
| POST   | `/jobs/:id/shortlist`              | JWT (RECRUITER) | Add candidate to pipeline |
| GET    | `/jobs/:id/shortlist`              | JWT (RECRUITER) | Get pipeline              |
| PATCH  | `/jobs/:id/shortlist/:candidateId` | JWT (RECRUITER) | Move stage / add notes    |
| DELETE | `/jobs/:id/shortlist/:candidateId` | JWT (RECRUITER) | Remove from pipeline      |
| GET    | `/jobs/:id/matching-candidates`    | JWT (RECRUITER) | Skill-matched candidates  |
| GET    | `/jobs/candidate/my-applications`  | JWT (CANDIDATE) | Jobs I'm shortlisted for  |

### Reviews — `/reviews`

| Method | Path                                       | Auth        | Description                    |
| ------ | ------------------------------------------ | ----------- | ------------------------------ |
| POST   | `/reviews/assign`                          | JWT         | Assign reviewers to submission |
| GET    | `/reviews/pending`                         | JWT         | My pending queue               |
| GET    | `/reviews/:reviewId`                       | JWT         | Get submission for reviewing   |
| POST   | `/reviews/:reviewId/submit`                | JWT         | Submit completed review        |
| GET    | `/reviews/submissions/:submissionId/score` | JWT         | Aggregated peer score          |
| GET    | `/reviews/reviewers/:reviewerId/stats`     | JWT         | Reviewer stats                 |
| GET    | `/reviews/me/stats`                        | JWT         | My stats                       |
| GET    | `/reviews/reputation/me`                   | JWT         | My reputation score            |
| GET    | `/reviews/reputation/leaderboard`          | JWT         | Top reviewers                  |
| GET    | `/reviews/admin/anomalies`                 | JWT + ADMIN | Anomaly detection              |
| POST   | `/reviews/admin/flag`                      | JWT + ADMIN | Flag review                    |
| POST   | `/reviews/admin/recalculate/:submissionId` | JWT + ADMIN | Recalculate scores             |

### Recruiters — `/recruiters`

| Method | Path                   | Auth | Description              |
| ------ | ---------------------- | ---- | ------------------------ |
| POST   | `/recruiters`          | JWT  | Create recruiter profile |
| GET    | `/recruiters/me`       | JWT  | My profile               |
| GET    | `/recruiters/me/stats` | JWT  | My stats                 |
| PATCH  | `/recruiters/me`       | JWT  | Update profile           |
| GET    | `/recruiters/:id`      | JWT  | Recruiter by ID          |

### Companies — `/companies`

| Method | Path                    | Auth   | Description    |
| ------ | ----------------------- | ------ | -------------- |
| GET    | `/companies`            | Public | List companies |
| GET    | `/companies/:id`        | Public | By ID          |
| GET    | `/companies/slug/:slug` | Public | By slug        |
| GET    | `/companies/:id/stats`  | Public | Statistics     |
| POST   | `/companies`            | JWT    | Create company |
| PATCH  | `/companies/:id`        | JWT    | Update         |
| DELETE | `/companies/:id`        | JWT    | Delete         |

### Other

| Method | Path                               | Auth   | Description         |
| ------ | ---------------------------------- | ------ | ------------------- |
| GET    | `/users/:id`                       | JWT    | User by ID          |
| GET    | `/analytics/recruiter/dashboard`   | JWT    | Recruiter analytics |
| GET    | `/analytics/recruiter/jobs/:jobId` | JWT    | Per-job metrics     |
| GET    | `/analytics/platform/stats`        | Public | Platform statistics |
| GET    | `/health`                          | Public | Health check        |
| GET    | `/health/ready`                    | Public | Readiness probe     |
| GET    | `/health/live`                     | Public | Liveness probe      |

---

## 8. Authentication & Authorization

### JWT Flow

```
Register / Login
  → { accessToken (15min), refreshToken (7d) }
  → Frontend stores both in localStorage

Every API request
  → Authorization: Bearer <accessToken>

Token expires (401)
  → POST /auth/refresh { refreshToken }
  → Old session revoked, new token pair issued (rotation)
  → Retry original request

Logout
  → POST /auth/logout
  → Session record revoked in DB
```

### Session Model

Each login creates a `Session` row with a hashed refresh token. Logout and refresh both revoke the session. This allows "log out everywhere" and prevents refresh token replay attacks.

### OAuth (Google / GitHub)

```
1. Frontend: window.location.href = /api/auth/google
2. Passport redirects to provider
3. Provider authenticates, redirects back to /api/auth/google/callback
4. NestJS: find or create User, generate token pair
5. Redirect to: /auth/callback?accessToken=...&refreshToken=...
6. Frontend page stores tokens, redirects to dashboard
```

### JWT Payload

```typescript
{
  sub: string,              // userId
  email: string,
  userType: UserType,
  roles: string[],
  candidateProfileId?: string,   // populated if CANDIDATE
  recruiterProfileId?: string,   // populated if RECRUITER
  sessionId: string              // for session revocation
}
```

### Role Guards

```typescript
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
// or just:
@UseGuards(JwtAuthGuard)
```

---

## 9. File Storage

**Provider:** Supabase Storage (S3-compatible, accessed via `@aws-sdk/client-s3`)

### Storage Paths

| Content            | Path Pattern                                    |
| ------------------ | ----------------------------------------------- |
| Resumes            | `candidates/{candidateId}/resume/{filename}`    |
| Portfolio files    | `candidates/{candidateId}/portfolio/{filename}` |
| Certificate PDFs   | `certificates/{certificateId}/certificate.pdf`  |
| Certificate images | `certificates/{certificateId}/certificate.png`  |

### StorageService Methods

- `uploadFile(bucket, key, buffer, contentType)` → `{ key, url, size }`
- `uploadResume(candidateId, buffer, filename)` → `{ key, url }`
- `uploadPortfolioFile(candidateId, buffer, filename)` → `{ key, url }`
- `deleteFile(key)` → void
- `listFiles(prefix)` → `[{ key, size, lastModified }]`
- `getFileUrl(key)` → public URL string

---

## 10. Environment Variables

```bash
# Server
PORT=4100
NODE_ENV=development
API_URL=http://localhost:4100
APP_URL=http://localhost:3100

# Database (Supabase PostgreSQL)
DATABASE_URL=postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres

# Supabase Storage (S3-compatible)
S3_ENDPOINT=https://<ref>.supabase.co/storage/v1/s3
S3_ACCESS_KEY=<access-key>
S3_SECRET_KEY=<secret-key>
S3_BUCKET=verihire

# JWT
JWT_SECRET=<secret>
JWT_ACCESS_SECRET=<secret>
JWT_REFRESH_SECRET=<secret>
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# OAuth
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...

# LLM — Groq API (test cases, evaluation feedback, resume analysis)
OPENAI_API_KEY=<groq-key>
OPENAI_BASE_URL=https://api.groq.com/openai/v1
OPENAI_MODEL=llama-3.3-70b-versatile

# Judge0 (code execution sandbox)
JUDGE0_URL=http://localhost:2358
JUDGE0_API_KEY=       # optional: RapidAPI-hosted Judge0
JUDGE0_API_HOST=      # optional: RapidAPI host header

# Certificate Signing (ECDSA secp256k1 — generate once, store permanently)
CERTIFICATE_SIGNING_PRIVATE_KEY=-----BEGIN EC PRIVATE KEY-----...
CERTIFICATE_SIGNING_PUBLIC_KEY=-----BEGIN PUBLIC KEY-----...

# Blockchain — Polygon Amoy testnet
POLYGON_RPC_URL=https://rpc-amoy.polygon.technology
POLYGON_PRIVATE_KEY=<wallet-private-key>
CERTIFICATE_CONTRACT_ADDRESS=<deployed-contract-address>

# CORS
CORS_ORIGINS=http://localhost:3100

# Frontend
NEXT_PUBLIC_API_URL=http://localhost:4100
```

---

## 11. Infrastructure & Deployment

### Local Development Stack

| Service     | How                               | Port |
| ----------- | --------------------------------- | ---- |
| NestJS API  | `pnpm --filter @verihire/api dev` | 4100 |
| Next.js Web | `pnpm --filter @verihire/web dev` | 3100 |
| PostgreSQL  | Supabase (remote)                 | —    |
| S3 Storage  | Supabase (remote)                 | —    |
| Judge0 CE   | `pnpm docker:up` (Docker)         | 2358 |
| Groq LLM    | Remote API                        | —    |

The `docker-compose.yml` runs only the **Judge0 stack** (server, worker, postgres, redis) — nothing else needs Docker locally since Postgres and storage are on Supabase.

### Why Judge0 Can't Run on Railway

Judge0 requires `privileged: true` Docker mode to create isolated namespaces for sandboxed code execution. Railway, Render, and Fly.io all block privileged containers.

**Production approach:** Run Judge0 locally on a dev machine, expose via ngrok:

```bash
pnpm docker:up
ngrok http 2358
# Set JUDGE0_URL=https://xxxx.ngrok-free.app on Railway env vars
```

### Railway Deployment

```
apps/api/railway.toml  → build: pnpm build, start: node dist/main
apps/web/railway.toml  → build: pnpm build, start: pnpm start
```

**Deploy order:**

1. Deploy API service → note the Railway-assigned URL
2. Set `NEXT_PUBLIC_API_URL=<api-railway-url>` on Web service
3. Deploy Web service
4. Update OAuth redirect URIs on Google Cloud Console and GitHub with production callback URLs

### Database

```bash
pnpm db:generate      # Regenerate Prisma client (run after schema.prisma changes)
pnpm db:push          # Push schema directly to Supabase (no migration history)
pnpm db:seed          # Seed with test users, skills, and challenges
pnpm db:studio        # Prisma Studio GUI at localhost:5555
```

---

## 12. Data Flow: Candidate Journey

```
1. REGISTER
   POST /auth/register { email, password, firstName, lastName, role: "CANDIDATE" }
   Creates: User + CandidateProfile + UserRole(CANDIDATE) + Session
   Returns: { accessToken, refreshToken, user, candidateProfile }

2. UPLOAD RESUME (optional, on /profile)
   POST /candidates/me/resume  (multipart PDF)
   → File stored in Supabase Storage
   → Async: Groq parses PDF → stores seniorityLevel, domains, yearsExp on profile

3. BROWSE CHALLENGES (/challenges)
   GET /challenges?skill=python&difficulty=INTERMEDIATE
   GET /challenges/recommended  ← personalized based on candidate skills

4. START A CHALLENGE (/challenges/:id)
   GET /challenges/:id/start
   POST /submissions/start { challengeId }
   → Submission created (status: IN_PROGRESS, startedAt = now)

5. WRITE CODE (/challenges/:id/submit)
   PATCH /submissions/:id { content, language }   ← auto-save every 30s
   POST /submissions/:id/submit                   ← final submit
   → status: SUBMITTED → EVALUATING

6. EVALUATION (async, ~5-15 seconds)
   LLM generates test cases → Judge0 executes code → LLM generates feedback
   → status: EVALUATED, finalScore stored

7. VIEW RESULTS (/submissions/:id/results)
   GET /submissions/:id/results
   Shows: overall score, per-test results, LLM feedback, improvement suggestions

8. CERTIFICATE (if score ≥ threshold)
   Auto-generated after evaluation
   /certificates → list of earned certs
   /verify/:certNumber → public verification page (no auth needed)
   Download PDF or share link
```

---

## 13. Data Flow: Recruiter Journey

```
1. REGISTER
   POST /auth/register { email, password, role: "RECRUITER" }
   Creates: User + RecruiterProfile + UserRole(RECRUITER)

2. SET UP COMPANY (/recruiter/company)
   POST /companies { name, industry, description, ... }
   POST /recruiters { companyId, title, department }

3. POST A JOB (/recruiter/jobs/new)
   POST /jobs { title, description, requirements, salaryMin, salaryMax, ... }
   POST /jobs/:id/skills { skillId, minScore: 70, required: true }
   POST /jobs/:id/publish  ← makes job visible in search

4. FIND CANDIDATES (/recruiter/candidates)
   GET /candidates/search?skillIds=uuid1,uuid2&minExperience=3&verifiedOnly=true
   Returns: paginated candidates with verified skills and cert count

5. VIEW CANDIDATE PROFILE (/recruiter/candidates/:id)
   GET /candidates/:id/resume-analysis
   → { seniorityLevel: "mid", domains: ["React","Node.js"], yearsExperience: 4.5 }
   Also see: verified skill scores, earned certificates, public portfolio

6. ADD TO PIPELINE (/recruiter/jobs/:id/shortlist)
   POST /jobs/:id/shortlist { candidateId }

7. MANAGE PIPELINE (/recruiter/jobs/:id/shortlist — kanban board)
   PATCH /jobs/:id/shortlist/:candidateId { stage: "INTERVIEW", notes: "Strong React skills" }
   Pipeline stages: SHORTLISTED → SCREENING → INTERVIEW → ASSESSMENT → OFFER → HIRED

8. VIEW MATCHED CANDIDATES (/recruiter/jobs/:id/matches)
   GET /jobs/:id/matching-candidates
   Returns: candidates ranked by overlap between their verified skills and job requirements
```

---

_Last updated: March 2026_
