# VeriHire — Comprehensive Technical Reference

> Generated from source analysis of all files in the repository.
> Last updated: 2026-03-15

---

## Table of Contents

1. [Project Overview & Architecture](#1-project-overview--architecture)
2. [Database Schema](#2-database-schema)
3. [API — Every Module](#3-api--every-module)
4. [Frontend — Every Page / Route](#4-frontend--every-page--route)
5. [Authentication Flow](#5-authentication-flow)
6. [Evaluation Pipeline](#6-evaluation-pipeline)
7. [Queue System](#7-queue-system)
8. [Storage Service](#8-storage-service)
9. [Blockchain](#9-blockchain)
10. [Shared Packages](#10-shared-packages)
11. [Configuration & Environment Variables](#11-configuration--environment-variables)
12. [Known Issues / Incomplete Features](#12-known-issues--incomplete-features)
13. [Frontend-Backend Integration](#13-frontend-backend-integration)

---

## 1. Project Overview & Architecture

### What VeriHire Does

VeriHire is a skill-verification and hiring platform. Candidates take AI-generated coding challenges, their solutions are executed in a sandboxed environment (Judge0), scored by an LLM, and—if they pass—a cryptographically signed certificate is issued and optionally anchored to the Polygon blockchain. Recruiters search the candidate pool, filter by verified skills, and manage a Kanban-style hiring pipeline.

### Monorepo Layout

```
verihire/
├── apps/
│   ├── api/          NestJS 10 backend
│   └── web/          Next.js 14 frontend
├── packages/
│   ├── database/     Prisma schema + singleton client
│   ├── types/        Shared TypeScript interfaces
│   ├── utils/        Shared utilities
│   └── config/       ESLint, Prettier, tsconfig bases
├── CLAUDE.md
├── TECHNICAL.md      (this file)
└── package.json      (Turborepo root)
```

Toolchain: **Turborepo** orchestrator, **pnpm** workspaces, **TypeScript** throughout.

### API (apps/api)

- **Framework**: NestJS 10
- **Entrypoint**: `src/main.ts` — bootstraps with Helmet, cookie-parser, CORS, URI versioning, global prefix `/api`, global `ValidationPipe`, Swagger (non-production only)
- **Port**: 4100 (dev), `PORT` env var (prod)
- **URL pattern**: `http://host:4100/api/v1/<resource>`
- **Swagger**: `/docs` — disabled when `NODE_ENV=production`
- **Versioning**: URI-based (`/v1/`)
- **Rate limiting**: Three-tier via `@nestjs/throttler`
  - Short: 3 requests / 1 second
  - Medium: 20 requests / 10 seconds
  - Long: 100 requests / 60 seconds
- **Validation**: Global `ValidationPipe` with `whitelist: true`, `forbidNonWhitelisted: true`, `transform: true`
- **Auth**: Passport.js with JWT and OAuth strategies; `JwtAuthGuard`, `RolesGuard`, `@Roles()` decorator
- **ORM**: Prisma 5 (`@verihire/database`)
- **Queue**: Bull + Redis for async jobs
- **17 feature modules**: auth, users, candidates, recruiters, challenges, submissions, evaluations, skills, certificates, reviews, jobs, companies, analytics, queue, storage, blockchain, health

### Web (apps/web)

- **Framework**: Next.js 14 with App Router
- **Port**: 3100 (dev)
- **Styling**: Tailwind CSS + shadcn/ui components
- **Data fetching**: SWR with a custom `api` client (localStorage tokens, auto-refresh)
- **Code editor**: Monaco Editor (dynamically imported, SSR disabled)
- **Auth context**: `AuthProvider` using `jose` to decode/validate JWT expiry client-side
- **Path alias**: `@/*` → `./src/*`

---

## 2. Database Schema

Database: PostgreSQL 16. ORM: Prisma 5. Schema file: `packages/database/prisma/schema.prisma`.

### Enums

| Enum                  | Values                                                                              |
| --------------------- | ----------------------------------------------------------------------------------- |
| `UserStatus`          | `ACTIVE`, `SUSPENDED`, `DELETED`                                                    |
| `UserType`            | `CANDIDATE`, `RECRUITER`, `ADMIN`                                                   |
| `OAuthProvider`       | `GOOGLE`, `GITHUB`, `LINKEDIN`                                                      |
| `RemotePreference`    | `REMOTE`, `HYBRID`, `ONSITE`, `FLEXIBLE`                                            |
| `JobSearchStatus`     | `ACTIVE`, `OPEN`, `NOT_LOOKING`                                                     |
| `SkillLevel`          | `BEGINNER`, `INTERMEDIATE`, `ADVANCED`, `EXPERT`                                    |
| `ChallengeDifficulty` | `BEGINNER`, `INTERMEDIATE`, `ADVANCED`, `EXPERT`                                    |
| `ChallengeType`       | `CODING`, `DESIGN`, `WRITTEN`, `MIXED`                                              |
| `ChallengeCategory`   | `GENERAL_SWE`, `DOMAIN_SPECIFIC`                                                    |
| `SubmissionStatus`    | `IN_PROGRESS`, `SUBMITTED`, `EVALUATING`, `EVALUATED`, `FAILED`                     |
| `ConfidenceLevel`     | `LOW`, `MEDIUM`, `HIGH`                                                             |
| `ReviewStatus`        | `ASSIGNED`, `IN_PROGRESS`, `SUBMITTED`, `VALIDATED`, `REJECTED`                     |
| `CompanyStatus`       | `ACTIVE`, `SUSPENDED`, `INACTIVE`                                                   |
| `RecruiterRole`       | `RECRUITER`, `HIRING_MANAGER`, `ADMIN`                                              |
| `RemotePolicy`        | `REMOTE`, `HYBRID`, `ONSITE`                                                        |
| `EmploymentType`      | `FULL_TIME`, `PART_TIME`, `CONTRACT`, `INTERNSHIP`                                  |
| `JobStatus`           | `DRAFT`, `ACTIVE`, `PAUSED`, `CLOSED`, `FILLED`                                     |
| `ShortlistStage`      | `SHORTLISTED`, `SCREENING`, `INTERVIEW`, `ASSESSMENT`, `OFFER`, `HIRED`, `REJECTED` |
| `AuditOutcome`        | `SUCCESS`, `FAILURE`, `ERROR`                                                       |

### Models

#### `users` — `User`

| Field                | Type                | Notes                         |
| -------------------- | ------------------- | ----------------------------- |
| `id`                 | UUID PK             |                               |
| `email`              | VarChar(255) UNIQUE |                               |
| `emailVerified`      | Boolean             | default false                 |
| `passwordHash`       | VarChar(255)?       | null for OAuth-only accounts  |
| `firstName`          | VarChar(100)?       |                               |
| `lastName`           | VarChar(100)?       |                               |
| `avatarUrl`          | Text?               |                               |
| `status`             | `UserStatus`        | default ACTIVE                |
| `userType`           | `UserType`          | CANDIDATE / RECRUITER / ADMIN |
| `mfaEnabled`         | Boolean             | default false                 |
| `mfaSecretEncrypted` | Text?               | encrypted TOTP secret         |
| `oauthProvider`      | `OAuthProvider`?    |                               |
| `oauthProviderId`    | VarChar(255)?       |                               |
| `createdAt`          | Timestamptz         |                               |
| `updatedAt`          | Timestamptz         | auto-updated                  |
| `lastLoginAt`        | Timestamptz?        |                               |

Relations: `userRoles[]`, `sessions[]`, `mfaBackupCodes[]`, `passwordResetTokens[]`, `emailVerificationTokens[]`, `candidateProfile?`, `recruiterProfile?`, `challengeTemplatesCreated[]`

Indexes: email, status, userType, (oauthProvider, oauthProviderId)

#### `user_roles` — `UserRole`

Composite PK on `(userId, role)`. Fields: `userId`, `role` VarChar(50), `grantedAt`, `grantedBy` (nullable FK to User).

#### `sessions` — `Session`

| Field       | Type         | Notes                          |
| ----------- | ------------ | ------------------------------ |
| `id`        | UUID PK      |                                |
| `userId`    | UUID FK      | cascade delete                 |
| `tokenHash` | VarChar(64)  | SHA256 of refresh token        |
| `ipAddress` | Inet?        |                                |
| `userAgent` | Text?        |                                |
| `expiresAt` | Timestamptz  | 7 days from creation           |
| `revokedAt` | Timestamptz? | set on logout / password reset |

Indexes: userId, expiresAt

#### `mfa_backup_codes` — `MfaBackupCode`

Fields: `id`, `userId`, `codeHash` VarChar(64), `usedAt?`, `createdAt`

#### `password_reset_tokens` — `PasswordResetToken`

Fields: `id`, `userId`, `tokenHash` VarChar(64) UNIQUE, `expiresAt` (1 hr), `usedAt?`, `createdAt`

Indexes: userId, expiresAt

#### `email_verification_tokens` — `EmailVerificationToken`

Fields: `id`, `userId`, `tokenHash` VarChar(64) UNIQUE, `expiresAt` (24 hr), `usedAt?`, `createdAt`

#### `candidate_profiles` — `CandidateProfile`

| Field                      | Type                 | Notes                                   |
| -------------------------- | -------------------- | --------------------------------------- |
| `id`                       | UUID PK              |                                         |
| `userId`                   | UUID FK UNIQUE       | cascade delete                          |
| `headline`                 | VarChar(255)?        |                                         |
| `bio`                      | Text?                |                                         |
| `yearsExperience`          | Int                  | default 0                               |
| `currentRole`              | VarChar(100)?        |                                         |
| `currentCompany`           | VarChar(100)?        |                                         |
| `locationCity`             | VarChar(100)?        |                                         |
| `locationCountry`          | VarChar(100)?        |                                         |
| `remotePreference`         | `RemotePreference`?  |                                         |
| `linkedinUrl`              | Text?                |                                         |
| `githubUrl`                | Text?                |                                         |
| `portfolioUrl`             | Text?                |                                         |
| `resumeUrl`                | Text?                |                                         |
| `jobSearchStatus`          | `JobSearchStatus`?   |                                         |
| `preferredSalaryMin`       | Int?                 |                                         |
| `preferredSalaryMax`       | Int?                 |                                         |
| `preferredSalaryCurrency`  | VarChar(3)           | default "USD"                           |
| `portfolioPublic`          | Boolean              | default true                            |
| `portfolioSlug`            | VarChar(100)? UNIQUE |                                         |
| `totalChallengesCompleted` | Int                  | denormalized                            |
| `averageScore`             | Decimal(5,2)         | denormalized                            |
| `certificatesCount`        | Int                  | denormalized                            |
| `reputationScore`          | Decimal(5,2)         | default 50, used for review eligibility |

Relations: `user`, `candidateSkills[]`, `submissions[]`, `certificates[]`, `reviewsGiven[]`, `shortlists[]`

#### `skill_categories` — `SkillCategory`

Hierarchical (self-referential via `parentId`). Fields: `id`, `name`, `slug` UNIQUE, `description?`, `parentId?`, `icon?`, `displayOrder` (default 0), `createdAt`.

#### `skills` — `Skill`

| Field                         | Type                | Notes                                                     |
| ----------------------------- | ------------------- | --------------------------------------------------------- |
| `id`                          | UUID PK             |                                                           |
| `categoryId`                  | UUID? FK            |                                                           |
| `name`                        | VarChar(100)        |                                                           |
| `slug`                        | VarChar(100) UNIQUE |                                                           |
| `description`                 | Text?               |                                                           |
| `difficultyLevels`            | Json                | default `["beginner","intermediate","advanced","expert"]` |
| `challengeTypes`              | Json                | default `["coding","written"]`                            |
| `certificationEnabled`        | Boolean             | default true                                              |
| `certificationValidityMonths` | Int                 | default 24                                                |
| `passThreshold`               | Int                 | default 60                                                |
| `totalCertifications`         | Int                 | denormalized                                              |
| `averageScore`                | Decimal(5,2)?       | denormalized                                              |
| `isActive`                    | Boolean             | default true                                              |

#### `candidate_skills` — `CandidateSkill`

Unique on `(candidateId, skillId)`. Fields: `verified`, `verificationDate?`, `score?`, `percentile?`, `level?` (SkillLevel), `certificateId?`, `challengeId?`, `expiresAt?`.

#### `challenge_templates` — `ChallengeTemplate`

Used to generate challenges. Key fields: `promptTemplate` (Text), `evaluationCriteria` (Json), `rubric` (Json), `supportedLanguages?` (Json), `starterCode?` (Json), `testCaseTemplate?` (Json), `timeLimitMinutes` (default 60).

#### `challenges` — `Challenge`

| Field                | Type                   | Notes                                |
| -------------------- | ---------------------- | ------------------------------------ |
| `id`                 | UUID PK                |                                      |
| `templateId`         | UUID? FK               |                                      |
| `skillId`            | UUID? FK               |                                      |
| `title`              | VarChar(255)           |                                      |
| `description`        | Text                   |                                      |
| `requirements`       | Json?                  |                                      |
| `testCases`          | Json?                  | manually authored test cases         |
| `starterCode`        | Text?                  |                                      |
| `referenceSolution`  | Text?                  | used to validate LLM test cases      |
| `solutionLanguage`   | VarChar(50)?           | language of reference solution       |
| `difficulty`         | `ChallengeDifficulty`? |                                      |
| `type`               | `ChallengeType`?       |                                      |
| `category`           | `ChallengeCategory`    | default GENERAL_SWE                  |
| `supportedLanguages` | Json?                  | list of allowed language strings     |
| `timeLimitMinutes`   | Int?                   |                                      |
| `evaluationCriteria` | Json?                  |                                      |
| `generatedAt`        | Timestamptz            |                                      |
| `generationModel`    | VarChar(50)?           |                                      |
| `cachedTestCases`    | Json?                  | populated after first evaluation run |
| `timesAttempted`     | Int                    |                                      |
| `averageScore`       | Decimal(5,2)?          |                                      |

#### `submissions` — `Submission`

| Field              | Type               | Notes                      |
| ------------------ | ------------------ | -------------------------- |
| `id`               | UUID PK            |                            |
| `challengeId`      | UUID FK            |                            |
| `candidateId`      | UUID FK            |                            |
| `content`          | Text?              | candidate's code           |
| `language`         | VarChar(50)?       |                            |
| `files`            | Json?              | for multi-file submissions |
| `startedAt`        | Timestamptz?       |                            |
| `submittedAt`      | Timestamptz?       |                            |
| `timeSpentSeconds` | Int?               |                            |
| `status`           | `SubmissionStatus` | default IN_PROGRESS        |
| `aiScore`          | Decimal(5,2)?      | set after evaluation       |
| `peerScore`        | Decimal(5,2)?      | set after peer review      |
| `finalScore`       | Decimal(5,2)?      | composite score            |
| `percentile`       | Decimal(5,2)?      |                            |
| `ipAddress`        | Inet?              |                            |
| `userAgent`        | Text?              |                            |

#### `evaluations` — `Evaluation`

| Field              | Type          | Notes                    |
| ------------------ | ------------- | ------------------------ |
| `id`               | UUID PK       |                          |
| `submissionId`     | UUID FK       | cascade delete           |
| `overallScore`     | Decimal(5,2)  |                          |
| `criteriaScores`   | Json          |                          |
| `staticAnalysis`   | Json?         |                          |
| `testResults`      | Json?         | Judge0 test case results |
| `semanticAnalysis` | Json?         |                          |
| `feedback`         | Text?         | LLM-generated            |
| `suggestions`      | Json?         |                          |
| `modelVersions`    | Json?         | which models were used   |
| `processingTimeMs` | Int?          |                          |
| `confidence`       | Decimal(5,4)? |                          |

#### `reviews` — `Review`

| Field                 | Type               | Notes                                        |
| --------------------- | ------------------ | -------------------------------------------- |
| `id`                  | UUID PK            |                                              |
| `submissionId`        | UUID FK            | cascade delete                               |
| `reviewerId`          | UUID FK            | CandidateProfile                             |
| `assignedAt`          | Timestamptz        |                                              |
| `deadline`            | Timestamptz?       | typically 3 days                             |
| `criteriaScores`      | Json?              |                                              |
| `overallScore`        | Decimal(5,2)?      |                                              |
| `strengths`           | Text?              |                                              |
| `areasForImprovement` | Text?              |                                              |
| `suggestions`         | Text?              |                                              |
| `confidenceLevel`     | `ConfidenceLevel`? |                                              |
| `timeSpentSeconds`    | Int?               |                                              |
| `submittedAt`         | Timestamptz?       |                                              |
| `qualityScore`        | Decimal(5,2)?      | automated quality assessment                 |
| `effortScore`         | Decimal(5,2)?      |                                              |
| `specificityScore`    | Decimal(5,2)?      |                                              |
| `biasDetected`        | Boolean            | default false                                |
| `biasType`            | VarChar(50)?       |                                              |
| `status`              | `ReviewStatus`     |                                              |
| `reputationDelta`     | Decimal(5,2)?      | how this review affected reviewer reputation |

#### `certificates` — `Certificate`

| Field               | Type               | Notes                         |
| ------------------- | ------------------ | ----------------------------- |
| `id`                | UUID PK            |                               |
| `certificateNumber` | VarChar(50) UNIQUE | format: `VH-YYYY-SKILL-XXXXX` |
| `version`           | VarChar(10)        | default "1.0"                 |
| `candidateId`       | UUID FK            |                               |
| `skillId`           | UUID FK            |                               |
| `challengeId`       | UUID FK            |                               |
| `submissionId`      | UUID FK            |                               |
| `finalScore`        | Decimal(5,2)       |                               |
| `percentile`        | Decimal(5,2)?      | vs other certs for same skill |
| `grade`             | VarChar(5)         | A+, A, B+, etc.               |
| `aiScore`           | Decimal(5,2)?      |                               |
| `peerScore`         | Decimal(5,2)?      |                               |
| `confidence`        | Decimal(5,4)?      |                               |
| `criteriaScores`    | Json?              |                               |
| `hash`              | VarChar(64)        | SHA256 of cert data           |
| `signature`         | Text               | placeholder bytes             |
| `publicKey`         | Text               | placeholder bytes             |
| `blockchainTxId`    | VarChar(66)?       | Polygon tx hash               |
| `blockchainNetwork` | VarChar(50)?       | "polygon-amoy"                |
| `blockNumber`       | BigInt?            |                               |
| `ipfsHash`          | VarChar(100)?      | unused / reserved             |
| `pdfUrl`            | Text?              | S3 URL                        |
| `imageUrl`          | Text?              | S3 URL                        |
| `verificationUrl`   | Text               | public verify URL             |
| `issuedAt`          | Timestamptz        |                               |
| `expiresAt`         | Timestamptz?       | 2 years from issuedAt         |
| `revokedAt`         | Timestamptz?       |                               |
| `revocationReason`  | Text?              |                               |
| `metadata`          | Json               | default {}                    |

#### `companies` — `Company`

Fields: `id`, `name`, `slug` UNIQUE, `description?`, `industry?`, `companySize?`, `logoUrl?`, `websiteUrl?`, `headquartersCity?`, `headquartersCountry?`, `verified` (bool, default false), `verifiedAt?`, `verificationDocuments?` (Json), `plan` (default "free"), `planExpiresAt?`, `settings` (Json), `status` (CompanyStatus).

#### `recruiter_profiles` — `RecruiterProfile`

Fields: `id`, `userId` UNIQUE FK, `companyId?` FK, `title?`, `department?`, `role` (RecruiterRole, default RECRUITER), `totalHires`, `activeJobs`.

#### `jobs` — `Job`

Full job posting model. Key fields: `title`, `description?`, `requirements?`, `responsibilities?`, `locationCity?`, `locationCountry?`, `remotePolicy?`, `salaryMin?`, `salaryMax?`, `salaryCurrency` (default "USD"), `salaryPeriod` (default "yearly"), `employmentType?`, `experienceLevel?`, `experienceYearsMin?`, `experienceYearsMax?`, `status` (JobStatus, default DRAFT), `publishedAt?`, `closesAt?`, `viewsCount`, `applicationsCount`.

#### `job_skills` — `JobSkill`

Links jobs to required skills. Fields: `jobId`, `skillId`, `minScore` (default 60), `minLevel?`, `required` (bool, default true), `weight` Decimal(3,2) (default 1.0).

#### `shortlists` — `Shortlist`

Unique on `(jobId, candidateId)`. Fields: `recruiterId`, `jobId`, `candidateId`, `stage` (ShortlistStage, default SHORTLISTED), `stageUpdatedAt`, `notes?`, `rating?`, `stageHistory` (Json, default []).

#### `audit_logs` — `AuditLog`

Append-only event log. Fields: `eventType`, `action`, `outcome`, `actorId?`, `actorType?`, `resourceType?`, `resourceId?`, `details` (Json), `ipAddress?`, `userAgent?`, `sessionId?`, `requestId?`.

#### `analytics_events` — `AnalyticsEvent`

Fields: `eventName`, `eventCategory?`, `userId?`, `sessionId?`, `properties` (Json), `deviceType?`, `browser?`, `os?`, `country?`.

---

## 3. API — Every Module

All routes are prefixed `/api/v1/`. Auth guards: `JwtAuthGuard` (validates JWT + session), `RolesGuard` (checks `UserType`).

### 3.1 Auth Module (`/auth`)

**Controller**: `apps/api/src/modules/auth/auth.controller.ts`
**Service**: `apps/api/src/modules/auth/auth.service.ts`

| Method | Path                        | Guard             | Notes                                                   |
| ------ | --------------------------- | ----------------- | ------------------------------------------------------- |
| POST   | `/auth/register`            | None              | Creates user + profile, returns tokens                  |
| POST   | `/auth/login`               | `LocalAuthGuard`  | Passport local strategy; returns tokens                 |
| POST   | `/auth/refresh`             | None              | Body: `{refreshToken}`, returns new pair                |
| POST   | `/auth/logout`              | `JwtAuthGuard`    | Revokes session                                         |
| GET    | `/auth/me`                  | `JwtAuthGuard`    | Returns current user                                    |
| POST   | `/auth/forgot-password`     | None              | Queues password-reset email                             |
| POST   | `/auth/reset-password`      | None              | Validates token, updates password, revokes all sessions |
| POST   | `/auth/verify-email`        | None              | Marks emailVerified=true                                |
| POST   | `/auth/resend-verification` | None              | Re-queues verification email                            |
| POST   | `/auth/send-verification`   | `JwtAuthGuard`    | Sends verification for logged-in user                   |
| GET    | `/auth/google`              | `GoogleAuthGuard` | Redirects to Google OAuth                               |
| GET    | `/auth/google/callback`     | `GoogleAuthGuard` | Receives code, redirects to frontend with tokens        |
| GET    | `/auth/github`              | `GithubAuthGuard` | Redirects to GitHub OAuth                               |
| GET    | `/auth/github/callback`     | `GithubAuthGuard` | Receives code, redirects to frontend with tokens        |

**Service behavior**:

- `register(dto)`: Checks email not taken. Creates `User` with bcrypt-hashed password (`userType` from dto). Creates `CandidateProfile` or `RecruiterProfile`. Calls `generateAuthResponse()`.
- `login(user)`: Updates `lastLoginAt`. Calls `generateAuthResponse()`.
- `validateOrCreateOAuthUser(profile)`: Searches by `(oauthProvider, oauthProviderId)`. If not found, searches by email and links provider. If neither, creates new CANDIDATE user. Always creates candidate profile.
- `refreshToken(dto)`: Hashes provided token, finds non-expired/non-revoked session. Issues new token pair (does not revoke old session immediately).
- `logout(userId, sessionId)`: Sets `session.revokedAt = now()`.
- `forgotPassword(email)`: Creates `PasswordResetToken` (SHA256 hash, 1 hr expiry). Queues `password-reset` email job.
- `resetPassword(token, newPassword)`: Validates token not expired/used. Sets `usedAt`. Updates `passwordHash`. Revokes all user sessions.
- `sendVerificationEmail(userId)`: Creates `EmailVerificationToken` (SHA256 hash, 24 hr expiry). Queues `verification` email job.
- `verifyEmail(token)`: Validates token. Sets `user.emailVerified = true`, token `usedAt`.
- `generateAuthResponse(user)`: Creates `Session` record (stores SHA256 of refresh token, 7-day expiry). Signs access JWT (15 min) with `{sub, email, userType, sessionId}`. Signs refresh JWT (7 days). Returns `{accessToken, refreshToken, user}`.

**OAuth callback redirect**: `${frontendUrl}/auth/callback?accessToken=...&refreshToken=...` (on error: `?error=...`)

### 3.2 Users Module (`/users`)

**Controller**: `apps/api/src/modules/users/users.controller.ts`

| Method | Path         | Guard                      | Notes              |
| ------ | ------------ | -------------------------- | ------------------ |
| GET    | `/users/:id` | None (no guard on handler) | Returns user by ID |

### 3.3 Candidates Module (`/candidates`)

**Controller**: `apps/api/src/modules/candidates/candidates.controller.ts`

| Method | Path                             | Guard          | Notes                                           |
| ------ | -------------------------------- | -------------- | ----------------------------------------------- |
| GET    | `/candidates/me`                 | `JwtAuthGuard` | Current candidate profile                       |
| PATCH  | `/candidates/me`                 | `JwtAuthGuard` | Update profile                                  |
| GET    | `/candidates/me/skills`          | `JwtAuthGuard` | List skills with verification status            |
| POST   | `/candidates/me/skills`          | `JwtAuthGuard` | Add skill to profile                            |
| PATCH  | `/candidates/me/skills/:skillId` | `JwtAuthGuard` | Update skill (level, etc.)                      |
| DELETE | `/candidates/me/skills/:skillId` | `JwtAuthGuard` | Remove skill                                    |
| GET    | `/candidates/me/stats`           | `JwtAuthGuard` | Stats (challenges, score, certs, submissions)   |
| GET    | `/candidates/profile/:slug`      | None           | Public profile by portfolioSlug                 |
| GET    | `/candidates/search`             | `JwtAuthGuard` | Search candidates (requires recruiterProfileId) |
| POST   | `/candidates/me/resume`          | `JwtAuthGuard` | Upload resume (multipart/form-data)             |
| DELETE | `/candidates/me/resume`          | `JwtAuthGuard` | Delete resume from storage                      |
| POST   | `/candidates/me/portfolio`       | `JwtAuthGuard` | Upload portfolio file (multipart)               |
| GET    | `/candidates/me/portfolio`       | `JwtAuthGuard` | List portfolio files                            |
| DELETE | `/candidates/me/portfolio/:key`  | `JwtAuthGuard` | Delete portfolio file                           |

### 3.4 Recruiters Module (`/recruiters`)

**Controller**: `apps/api/src/modules/recruiters/recruiters.controller.ts`

| Method | Path                   | Guard                           | Notes                    |
| ------ | ---------------------- | ------------------------------- | ------------------------ |
| POST   | `/recruiters`          | `JwtAuthGuard`                  | Create recruiter profile |
| GET    | `/recruiters/me`       | `JwtAuthGuard` + RECRUITER role | My profile               |
| GET    | `/recruiters/me/stats` | `JwtAuthGuard` + RECRUITER role | My stats                 |
| PATCH  | `/recruiters/me`       | `JwtAuthGuard` + RECRUITER role | Update profile           |
| GET    | `/recruiters/:id`      | `JwtAuthGuard`                  | Get by ID                |

### 3.5 Skills Module (`/skills`)

**Controller**: `apps/api/src/modules/skills/skills.controller.ts`

All endpoints public (no auth guard).

| Method | Path                       | Notes                                                        |
| ------ | -------------------------- | ------------------------------------------------------------ |
| GET    | `/skills`                  | List with filters: `categoryId`, `search`, `limit`, `offset` |
| GET    | `/skills/popular`          | Popular skills (by totalCertifications)                      |
| GET    | `/skills/categories`       | All categories                                               |
| GET    | `/skills/categories/:slug` | Category by slug                                             |
| GET    | `/skills/:slug`            | Skill by slug                                                |
| GET    | `/skills/:id/stats`        | Skill statistics                                             |

### 3.6 Challenges Module (`/challenges`)

**Controller**: `apps/api/src/modules/challenges/challenges.controller.ts`

| Method | Path                        | Guard          | Notes                                                                 |
| ------ | --------------------------- | -------------- | --------------------------------------------------------------------- |
| GET    | `/challenges`               | None           | List with filters: `skillId`, `difficulty`, `type`, `limit`, `offset` |
| GET    | `/challenges/templates`     | None           | List templates                                                        |
| GET    | `/challenges/templates/:id` | None           | Template by ID                                                        |
| GET    | `/challenges/recommended`   | `JwtAuthGuard` | Recommended for current candidate                                     |
| GET    | `/challenges/skill/:slug`   | None           | Challenges for a skill                                                |
| GET    | `/challenges/:id`           | None           | Challenge by ID                                                       |
| GET    | `/challenges/:id/start`     | `JwtAuthGuard` | Challenge without exposing test cases                                 |
| POST   | `/challenges/generate`      | `JwtAuthGuard` | Generate challenge from template                                      |

### 3.7 Submissions Module (`/submissions`)

**Controller**: `apps/api/src/modules/submissions/submissions.controller.ts`

All routes require `JwtAuthGuard`.

| Method | Path                               | Notes                                                                                      |
| ------ | ---------------------------------- | ------------------------------------------------------------------------------------------ |
| POST   | `/submissions/start`               | Start new submission; body: `{challengeId}`; requires `candidateProfileId` on request user |
| GET    | `/submissions/my`                  | Paginated list; filters: `status`, `skillId`, `limit`, `offset`                            |
| GET    | `/submissions/active/:challengeId` | Active IN_PROGRESS submission for challenge                                                |
| GET    | `/submissions/:id`                 | By ID (ownership check — must be candidate's own)                                          |
| GET    | `/submissions/:id/results`         | With evaluation, reviews, certificate                                                      |
| PATCH  | `/submissions/:id`                 | Save progress; body: `{content, language}`                                                 |
| POST   | `/submissions/:id/submit`          | Submit for evaluation; triggers async `evaluateSubmission()` fire-and-forget               |

**Admin controller**: `apps/api/src/modules/submissions/submissions-admin.controller.ts`

| Method | Path                     | Guard    | Notes                                                      |
| ------ | ------------------------ | -------- | ---------------------------------------------------------- |
| GET    | `/submissions/admin/all` | **NONE** | Lists all submissions — demo/testing endpoint with no auth |

### 3.8 Evaluations Module (`/evaluations`)

**Controller**: `apps/api/src/modules/evaluations/evaluations.controller.ts`

| Method | Path                                                  | Guard          | Notes                                      |
| ------ | ----------------------------------------------------- | -------------- | ------------------------------------------ |
| POST   | `/evaluations/submissions/:submissionId/evaluate`     | ADMIN          | Trigger evaluation                         |
| POST   | `/evaluations/submissions/:submissionId/re-evaluate`  | ADMIN          | Re-run evaluation                          |
| GET    | `/evaluations/submissions/:submissionId`              | `JwtAuthGuard` | Get evaluation for submission              |
| GET    | `/evaluations`                                        | ADMIN          | All evaluations (paginated, score filters) |
| GET    | `/evaluations/stats`                                  | ADMIN          | Aggregate statistics                       |
| POST   | `/evaluations/process-pending`                        | ADMIN          | Batch process all SUBMITTED submissions    |
| GET    | `/evaluations/certificates/verify/:certificateNumber` | None           | Verify certificate (PUBLIC)                |
| POST   | `/evaluations/certificates/:certificateNumber/revoke` | ADMIN          | Revoke certificate                         |

### 3.9 Reviews Module (`/reviews`)

**Controller**: `apps/api/src/modules/reviews/reviews.controller.ts`

All routes require `JwtAuthGuard` + `RolesGuard`.

| Method | Path                                       | Required Role    | Notes                                    |
| ------ | ------------------------------------------ | ---------------- | ---------------------------------------- |
| POST   | `/reviews/assign`                          | ADMIN / EMPLOYER | Assign reviewers to submission           |
| GET    | `/reviews/pending`                         | CANDIDATE        | Pending reviews assigned to current user |
| GET    | `/reviews/:reviewId`                       | CANDIDATE        | Submission details for reviewing         |
| POST   | `/reviews/:reviewId/submit`                | CANDIDATE        | Submit review                            |
| GET    | `/reviews/submissions/:submissionId/score` | (JWT)            | Aggregated score                         |
| GET    | `/reviews/reviewers/:reviewerId/stats`     | (JWT)            | Reviewer stats                           |
| GET    | `/reviews/me/stats`                        | CANDIDATE        | Current user's reviewer stats            |
| GET    | `/reviews/reputation/me`                   | CANDIDATE        | Current reputation + tier                |
| GET    | `/reviews/reputation/leaderboard`          | (JWT)            | Reputation leaderboard                   |
| GET    | `/reviews/admin/anomalies`                 | ADMIN            | Anomaly detection results                |
| POST   | `/reviews/admin/flag`                      | ADMIN            | Flag a review for investigation          |
| POST   | `/reviews/admin/recalculate/:submissionId` | ADMIN            | Recalculate aggregate score              |

**Service behavior** (`reviews.service.ts`):

- `assignReviewers(submissionId, count)`: Requires EVALUATED status. No existing reviews. Finds eligible reviewers (`reputationScore >= 30`), filters conflicts (cannot review own submission, submission author's mutual connections). Ranks by: skill match 40%, reputation 30%, quality history 20%, on-time rate 10%. Enforces workload cap (max 5 active reviews). Sets 3-day deadline. Queues `review-assigned` email.
- `submitReview(reviewId, dto)`: Analyzes quality metrics (effort, specificity, possible bias). Updates reviewer reputation. Sets status to SUBMITTED (qualityScore >= 60) or REJECTED.
- `getAggregatedScore(submissionId)`: Combines AI eval score with valid peer reviews (qualityScore >= 60 only).

**Anomaly detection** (`anomaly-detection.service.ts`):

- `detectRubberStamping()`: Flags reviewers with identical or near-identical scores (stddev < 3 for 5+ reviews), or minimal feedback (< 100 chars for 80%+ reviews).
- `detectTimingAnomalies()`: Flags reviews completed in < 60 seconds.
- `detectReciprocalScoring()`: Detects mutual high-scoring (>= 80) pairs.
- `detectCollusionRings()`: Clique detection for groups of 3-5 users with mutual favorable scoring.
- `flagReviewerForInvestigation()`: Decrements `reputationScore` by 10.

### 3.10 Certificates Module (`/certificates`)

**Controller**: `apps/api/src/modules/certificates/certificates.controller.ts`

| Method | Path                                            | Guard          | Notes                                                                 |
| ------ | ----------------------------------------------- | -------------- | --------------------------------------------------------------------- |
| POST   | `/certificates/generate`                        | `JwtAuthGuard` | Generate from submissionId                                            |
| GET    | `/certificates`                                 | `JwtAuthGuard` | List with filters (candidateId, skillId, includeRevoked, page, limit) |
| GET    | `/certificates/stats`                           | ADMIN          | Platform-wide stats                                                   |
| GET    | `/certificates/candidate/:candidateId`          | `JwtAuthGuard` | Candidate's certs                                                     |
| GET    | `/certificates/:id`                             | `JwtAuthGuard` | By UUID                                                               |
| GET    | `/certificates/number/:certificateNumber`       | `JwtAuthGuard` | By cert number                                                        |
| GET    | `/certificates/:id/download`                    | `JwtAuthGuard` | `?format=pdf\|image\|json`                                            |
| GET    | `/certificates/verify/:certificateNumber`       | None           | Verify by number (PUBLIC)                                             |
| POST   | `/certificates/verify`                          | None           | Verify by number or hash (PUBLIC)                                     |
| GET    | `/certificates/verify/:certificateNumber/quick` | None           | Quick verify (PUBLIC)                                                 |
| POST   | `/certificates/revoke`                          | ADMIN          | Revoke                                                                |
| POST   | `/certificates/:id/reinstate`                   | `JwtAuthGuard` | Reinstate revoked cert                                                |
| GET    | `/certificates/:id/revocation-history`          | `JwtAuthGuard` | History                                                               |
| GET    | `/certificates/admin/revoked`                   | ADMIN          | All revoked certs                                                     |

**Service** (`certificates.service.ts`) — certificate generation pipeline:

1. Validate submission is EVALUATED, score >= 70 (passing threshold), skillId present
2. Check no existing non-revoked certificate for same (candidateId, skillId)
3. Look up other certificates for skill to calculate percentile
4. Determine grade (A+ >= 97, A >= 93, A- >= 90, B+ >= 87, B >= 83, B- >= 80, C+ >= 77, C >= 73, C- >= 70, D >= 60, F < 60)
5. Build certificate number: `VH-${year}-${skillSlug_4chars_uppercase}-${5digit_sequence}`
6. Hash: SHA256 of `${certNum}:${candidateId}:${skillId}:${score}`
7. Generate signature and publicKey (placeholder random bytes — not real asymmetric crypto)
8. Set `expiresAt = now + 2 years`
9. Set `verificationUrl = ${appUrl}/verify/${certificateNumber}`
10. Persist `Certificate` record
11. Queue `generate-pdf` and `generate-image` jobs to CERTIFICATE queue
12. If `FEATURE_BLOCKCHAIN_ENABLED=true`, queue `anchor-blockchain` job to BLOCKCHAIN queue
13. Update `CandidateSkill` with `verified=true`, `score`, `percentile`, `level` (BEGINNER <70, INTERMEDIATE <80, ADVANCED <90, EXPERT >=90), `certificateId`, `expiresAt`
14. Increment `CandidateProfile.certificatesCount` and `Skill.totalCertifications`

### 3.11 Jobs Module (`/jobs`)

**Controller**: `apps/api/src/modules/jobs/jobs.controller.ts`

| Method | Path                               | Guard     | Notes                                          |
| ------ | ---------------------------------- | --------- | ---------------------------------------------- |
| GET    | `/jobs/search`                     | None      | Public job search                              |
| GET    | `/jobs/:id`                        | None      | Public job detail                              |
| POST   | `/jobs`                            | RECRUITER | Create job (DRAFT status)                      |
| GET    | `/jobs/recruiter/my-jobs`          | RECRUITER | Recruiter's own jobs                           |
| PATCH  | `/jobs/:id`                        | RECRUITER | Update job                                     |
| POST   | `/jobs/:id/publish`                | RECRUITER | Set status to ACTIVE                           |
| POST   | `/jobs/:id/close`                  | RECRUITER | Set status to CLOSED                           |
| DELETE | `/jobs/:id`                        | RECRUITER | Delete job                                     |
| POST   | `/jobs/:id/skills`                 | RECRUITER | Add skill requirement                          |
| DELETE | `/jobs/:id/skills/:skillId`        | RECRUITER | Remove skill requirement                       |
| POST   | `/jobs/:id/shortlist`              | RECRUITER | Add candidate to shortlist                     |
| GET    | `/jobs/:id/shortlist`              | RECRUITER | Get shortlist (filter by stage)                |
| PATCH  | `/jobs/:id/shortlist/:candidateId` | RECRUITER | Update shortlist entry (stage, notes, rating)  |
| DELETE | `/jobs/:id/shortlist/:candidateId` | RECRUITER | Remove from shortlist                          |
| GET    | `/jobs/:id/matching-candidates`    | RECRUITER | Find matching candidates by skill requirements |
| GET    | `/jobs/candidate/my-applications`  | CANDIDATE | Jobs where candidate is shortlisted            |

### 3.12 Companies Module (`/companies`)

**Controller**: `apps/api/src/modules/companies/companies.controller.ts`

| Method | Path                    | Guard     | Notes        |
| ------ | ----------------------- | --------- | ------------ |
| GET    | `/companies`            | None      | List all     |
| GET    | `/companies/:id`        | None      | By ID        |
| GET    | `/companies/slug/:slug` | None      | By slug      |
| GET    | `/companies/:id/stats`  | None      | Stats        |
| POST   | `/companies`            | RECRUITER | Create       |
| PATCH  | `/companies/:id`        | RECRUITER | Update       |
| DELETE | `/companies/:id`        | RECRUITER | Delete (204) |

### 3.13 Analytics Module (`/analytics`)

**Controller**: `apps/api/src/modules/analytics/analytics.controller.ts`

| Method | Path                               | Guard     | Notes                                                 |
| ------ | ---------------------------------- | --------- | ----------------------------------------------------- |
| GET    | `/analytics/recruiter/dashboard`   | RECRUITER | `{activeJobs, totalCandidates, totalViews, hireRate}` |
| GET    | `/analytics/recruiter/jobs/:jobId` | RECRUITER | Job-specific metrics                                  |
| GET    | `/analytics/platform/stats`        | None      | Platform-wide stats (PUBLIC)                          |

### 3.14 Health Module (`/health`)

**Controller**: `apps/api/src/modules/health/health.controller.ts`

| Method | Path            | Notes                                                       |
| ------ | --------------- | ----------------------------------------------------------- |
| GET    | `/health`       | `{status: 'ok', timestamp, version}`                        |
| GET    | `/health/ready` | DB `SELECT 1` latency check; returns latency or error       |
| GET    | `/health/live`  | `{uptime: process.uptime(), memory: process.memoryUsage()}` |

### 3.15 Storage Module (`/storage`)

No dedicated controller — storage is consumed internally by other services. See Section 8.

### 3.16 Blockchain Module

No dedicated controller — blockchain is invoked via the queue processor. See Section 9.

### 3.17 Queue Module

No controller — consumed internally. See Section 7.

---

## 4. Frontend — Every Page / Route

All pages in `apps/web/src/app/`. The Next.js App Router uses route group folders:

- `(public)` — no auth required
- `(authenticated)` — protected by layout guard
- `(authenticated)/(candidate)` — candidate-facing
- `(authenticated)/(recruiter)` — recruiter-facing

### Root

| File             | Route | Notes                                                                                                                                                                                     |
| ---------------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app/page.tsx`   | `/`   | Static marketing landing page with hero, feature cards ("Take AI Challenges", "Peer Review", "Earn Certificates"), placeholder stats (50K+, 200+, 500+, 98%), nav to /login and /register |
| `app/layout.tsx` | root  | Inter font; wraps all in `SWRProvider > AuthProvider > children + Toaster`                                                                                                                |

### Public Routes

| File                                    | Route                 | Notes                                                                                                                                                                                 |
| --------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `(public)/login/page.tsx`               | `/login`              | Email+password form (react-hook-form + zod validation). Google and GitHub OAuth buttons redirect to API OAuth endpoints. On success: redirects to `?redirect=` param or `/dashboard`. |
| `(public)/register/page.tsx`            | `/register`           | Registration form. `?type=candidate` or `?type=recruiter` pre-selects account type.                                                                                                   |
| `(public)/verify/[certNumber]/page.tsx` | `/verify/:certNumber` | Public certificate verification. Uses `useVerifyCertificate` → `GET /certificates/verify/:certNumber`. Shows valid/invalid state, certificate details.                                |
| `auth/callback/page.tsx`                | `/auth/callback`      | OAuth callback handler. Reads `?accessToken=` and `?refreshToken=` from query string, calls `setTokens()`, redirects to `/dashboard`. On error redirects to `/login?error=`.          |

### Authenticated Layout

`(authenticated)/layout.tsx` — Client component. Checks `isAuthenticated` from `useAuth()`; redirects to `/login` if not authenticated. Renders `Sidebar + MobileNav + Header + main content`.

### Candidate Routes

`(authenticated)/(candidate)/layout.tsx` — No additional logic beyond the authenticated layout.

| File                                | Route                      | Key Hooks / API Calls                                                                          | Notes                                                                                                                                                                                                                                       |
| ----------------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dashboard/page.tsx`                | `/dashboard`               | `useCandidateStats`, `useRecommendedChallenges`, `useMySubmissions`                            | Stats cards, recommended challenges (5), recent submissions (5)                                                                                                                                                                             |
| `challenges/page.tsx`               | `/challenges`              | `useChallenges`                                                                                | List with difficulty/type filter; links to challenge detail                                                                                                                                                                                 |
| `challenges/[id]/page.tsx`          | `/challenges/:id`          | `useChallenge`, `useActiveSubmission`                                                          | Shows description, requirements (JSON array or string), evaluation criteria. "Start Challenge" calls `startSubmission()` then navigates to submit page. "Continue Submission" shown if IN_PROGRESS exists.                                  |
| `challenges/[id]/submit/page.tsx`   | `/challenges/:id/submit`   | `useChallenge`, `useActiveSubmission`, `startSubmission`, `updateSubmission`, `submitSolution` | Monaco Editor (dynamic, SSR disabled). Language selector. Auto-save every 5 seconds. Countdown timer. `convertStarterCode()` transpiles JS starters to other languages. Submit: starts submission if none → submits → navigates to results. |
| `submissions/page.tsx`              | `/submissions`             | `useMySubmissions`                                                                             | Paginated list with status badges                                                                                                                                                                                                           |
| `submissions/[id]/results/page.tsx` | `/submissions/:id/results` | `useSubmissionResults`                                                                         | Shows score, AI/peer/percentile breakdown, feedback, strengths, improvements. Passing (>= 70) shows "View Certificates" button. Waiting state shows animated progress bar.                                                                  |
| `certificates/page.tsx`             | `/certificates`            | `useMyCertificates`                                                                            | Lists certificates with grade, issue date, expiry. Download links.                                                                                                                                                                          |
| `profile/page.tsx`                  | `/profile`                 | `useCandidateProfile`, `useCandidateSkills`, `updateCandidateProfile`, `addCandidateSkill`     | Edit headline, bio, location, links, job search status                                                                                                                                                                                      |
| `reviews/page.tsx`                  | `/reviews`                 | `usePendingReviews`                                                                            | Lists assigned peer reviews with deadline                                                                                                                                                                                                   |
| `reviews/[id]/page.tsx`             | `/reviews/:id`             | `useReview`, `submitReview`                                                                    | Shows submission to review; scoring form                                                                                                                                                                                                    |

### Recruiter Routes

`(authenticated)/(recruiter)/layout.tsx` — No additional logic.

| File                                     | Route                           | Key Hooks / API Calls                                                      | Notes                                                                                                                                                                          |
| ---------------------------------------- | ------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `recruiter/dashboard/page.tsx`           | `/recruiter/dashboard`          | `useRecruiterDashboard`                                                    | Shows: activeJobs, totalCandidates, totalViews, hireRate                                                                                                                       |
| `recruiter/jobs/page.tsx`                | `/recruiter/jobs`               | `useMyJobs`                                                                | Lists recruiter's jobs with status badges                                                                                                                                      |
| `recruiter/jobs/new/page.tsx`            | `/recruiter/jobs/new`           | `createJob`                                                                | Create job form                                                                                                                                                                |
| `recruiter/jobs/[id]/page.tsx`           | `/recruiter/jobs/:id`           | `useJob`, `publishJob`, `closeJob`                                         | Job detail, publish/close actions                                                                                                                                              |
| `recruiter/jobs/[id]/shortlist/page.tsx` | `/recruiter/jobs/:id/shortlist` | `useJob`, `useJobShortlist`, `updateShortlistEntry`, `removeFromShortlist` | Kanban board with drag-and-drop (`@hello-pangea/dnd`). Stages: SHORTLISTED → SCREENING → INTERVIEW → ASSESSMENT → OFFER → HIRED / REJECTED. Drag card to move stage via PATCH. |
| `recruiter/jobs/[id]/matches/page.tsx`   | `/recruiter/jobs/:id/matches`   | `useMatchingCandidates`, `addToShortlist`                                  | Shows matching candidates by skill score                                                                                                                                       |
| `recruiter/candidates/page.tsx`          | `/recruiter/candidates`         | `useCandidateSearch`                                                       | Search candidates by location, remote preference, experience, verified-only filter. Debounced 300ms.                                                                           |
| `recruiter/candidates/[id]/page.tsx`     | `/recruiter/candidates/:id`     | (candidate profile API)                                                    | Candidate detail view                                                                                                                                                          |
| `recruiter/company/page.tsx`             | `/recruiter/company`            | `useCompanies`, `createCompany`, `updateCompany`                           | Manage company profile                                                                                                                                                         |

---

## 5. Authentication Flow

### Passport Strategies

| Strategy | File                            | Details                                                                                                                                                                               |
| -------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `local`  | `strategies/local.strategy.ts`  | `usernameField: 'email'`. Validates email+password, checks user status is ACTIVE.                                                                                                     |
| `jwt`    | `strategies/jwt.strategy.ts`    | Extracts from `Authorization: Bearer <token>`. Validates `sessionId` in payload. On validate: queries DB for candidateProfileId or recruiterProfileId and attaches to `request.user`. |
| `google` | `strategies/google.strategy.ts` | Callback: `${callbackBaseUrl}/api/v1/auth/google/callback`. Scopes: email, profile. Returns `OAuthProfile{provider: 'GOOGLE', ...}`.                                                  |
| `github` | `strategies/github.strategy.ts` | Callback: `${callbackBaseUrl}/api/v1/auth/github/callback`. Scope: `user:email`. Finds primary email from array.                                                                      |

### Token Lifecycle

```
Login / Register / OAuth
  ↓
generateAuthResponse(user)
  ↓
Create Session record (tokenHash = SHA256(refreshToken), expiresAt = +7d)
  ↓
Sign access JWT (15m):   { sub, email, userType, sessionId }
Sign refresh JWT (7d):   { sub, email, sessionId }
  ↓
Return { accessToken, refreshToken, user }
```

**Token refresh flow**:

1. Client sends `POST /auth/refresh { refreshToken }`
2. Server hashes token, finds session where `tokenHash = hash AND expiresAt > now AND revokedAt IS NULL`
3. Issues new access + refresh tokens (new session record created)
4. Returns new pair

**Logout**: Sets `session.revokedAt = now()`

**Password reset**: Revokes ALL user sessions (`updateMany`)

### Frontend Auth Context (`src/lib/auth-context.tsx`)

On mount:

1. If valid access token (check expiry with 30s buffer using `jose.decodeJwt`): call `GET /auth/me` to get user
2. If expired but refresh token present: call `POST /auth/refresh`, store new tokens, get user
3. Otherwise: unauthenticated

The `api.ts` client auto-refreshes on 401 responses. A single shared refresh promise prevents duplicate refresh calls (deduplication via module-level variable). On refresh failure, clears tokens and redirects to `/login`.

### Guards

- `JwtAuthGuard`: Passport JWT guard; attaches user to request
- `RolesGuard`: Checks `request.user.userType` against `@Roles()` decorator
- `LocalAuthGuard`: Passport local guard (login only)
- `GoogleAuthGuard` / `GithubAuthGuard`: OAuth guards

---

## 6. Evaluation Pipeline

### Complete Flow

```
Candidate submits code (POST /submissions/:id/submit)
  ↓
SubmissionsService.submitSolution()
  → Update status to SUBMITTED, set submittedAt
  → Fire-and-forget: evaluationsService.evaluateSubmission(submissionId)
  ↓
EvaluationsService.evaluateSubmission()
  ↓
1. Fetch submission with challenge + skill
2. Atomic status claim:
   prisma.submission.updateMany({
     where: { id, status: 'SUBMITTED' },
     data: { status: 'EVALUATING' }
   })
   → If 0 rows updated: already claimed, abort
3. Parse manual test cases from challenge.testCases (JSON field)
4. Check challenge.cachedTestCases:
   → If present: use cached (skip LLM generation)
   → If absent: generate via LLM
5. LLM Test Case Generation (TestCaseGeneratorService):
   → For GENERAL_SWE + CODING: generateTestCases() → 10 cases
   → For DSA problem types: generateDSATestCases() → 12 cases
   → For DOMAIN_SPECIFIC: generateDomainTestCases() → 8 cases
   → Groq API (Llama 3.3 70B), temperature 0.3, max_tokens 4096
   → Retries once on JSON parse failure
   → Returns [] if no API key configured
6. Reference solution validation:
   → If challenge.referenceSolution exists:
     → Run each LLM test case through Judge0 using referenceSolution
     → Replace expectedOutput with actual Judge0 output
     → Filter out test cases where reference solution errors
   → This ensures expected outputs are always ground-truth
7. Cache validated test cases on challenge:
   prisma.challenge.update({ cachedTestCases: validatedCases })
8. Combine: [...manualTestCases, ...generatedTestCases]
9. Execute candidate code via Judge0 batch (runTestCases):
   → AND plagiarism check (Jaccard similarity) — run in parallel via Promise.all
10. Plagiarism detection:
    → Normalizes code (remove comments, collapse whitespace, lowercase)
    → Extract 5-char n-grams
    → Compare Jaccard similarity against all other EVALUATED submissions for same challenge
    → Flag if any similarity >= 0.85 (85%)
11. Generate feedback + code quality:
    → TestCaseGeneratorService.generateFeedback()
    → Returns { feedback, suggestions, codeQualityScore (0-100), codeQualityNotes }
    → Falls back to mock feedback if no API key
12. Calculate final score:
    → If test cases exist: score = accuracy * 0.6 + codeQualityScore * 0.4
    → If no test cases: score = codeQualityScore (100% weight)
13. Persist Evaluation record with testResults, feedback, criteriaScores
14. Update submission: status = EVALUATED, aiScore = finalScore, finalScore = finalScore
15. Update challenge stats (timesAttempted++, recalculate averageScore)
16. If score >= 70 AND skillId exists:
    → CertificateService.generateCertificate()
```

### Judge0 Integration (`code-execution.service.ts`)

**Language ID map**:

| Language         | Judge0 ID |
| ---------------- | --------- |
| javascript       | 63        |
| typescript       | 74        |
| python / python3 | 71        |
| java             | 62        |
| c                | 50        |
| cpp / c++        | 54        |
| go               | 60        |
| rust             | 73        |
| ruby             | 72        |
| csharp           | 51        |
| php              | 68        |
| swift            | 83        |
| kotlin           | 78        |

**Batch execution flow**:

1. `POST /submissions/batch` with all test cases
2. Receive array of `{token}` strings
3. Poll `GET /submissions/batch?tokens=...&fields=stdout,stderr,status,time,memory,compile_output`
4. Polling: 500ms initial delay, 1.5x exponential backoff, 3000ms max, 30s total timeout
5. Done when all `status.id >= 3`
6. Judge0 status 3 = Accepted. Also normalizes output for comparison (trim, lowercase, whitespace normalization).

**Output normalization** (`normalizeOutput()`):

- `.trim()` — remove leading/trailing whitespace
- normalize `\r\n` to `\n`
- remove trailing newlines
- remove trailing spaces per line
- `"1, 2, 3"` → `"1,2,3"` (normalize comma-space)
- `"[ 1"` → `"[1"` (normalize bracket spacing)
- `"key: val"` → `"key:val"` (normalize colon-space)
- `.toLowerCase()`

**RapidAPI support**: If `JUDGE0_API_KEY` is set, adds `X-RapidAPI-Key` and `X-RapidAPI-Host` headers.

### Scoring Formula

```
finalScore = (accuracy * 0.6) + (codeQualityScore * 0.4)

where:
  accuracy = (passedTestCases / totalTestCases) * 100
  codeQualityScore = 0-100 from LLM feedback evaluation

Passing threshold: >= 70
```

---

## 7. Queue System

### Architecture

Bull queues backed by Redis. Configuration in `apps/api/src/modules/queue/`.

**Default job options** (`queue.module.ts`):

- `removeOnComplete: 100` (keep last 100 completed)
- `removeOnFail: 500` (keep last 500 failed)
- `attempts: 3`
- `backoff: { type: 'exponential', delay: 1000 }`

Redis connection: parsed from `REDIS_URL` env var.

### Queues

#### EMAIL queue (`'email'`)

**Service method**: `queueService.addEmailJob(type, data, opts?)`

| Job Type             | Priority    | Data Fields                                                                    | Behavior                                                                               |
| -------------------- | ----------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| `password-reset`     | 1 (highest) | `{to, token, firstName}`                                                       | Reset link: `${appUrl}/auth/reset-password?token=${token}` (1hr expiry noted in email) |
| `verification`       | 2           | `{to, token, firstName}`                                                       | Verify link: `${appUrl}/auth/verify-email?token=${token}` (24hr expiry)                |
| `certificate-issued` | 3           | `{to, firstName, certificateNumber, skillName, score, grade, verificationUrl}` | Certificate issued notification                                                        |
| `review-assigned`    | 4           | `{to, firstName, submissionId, challengeTitle, deadline}`                      | Review assignment notification                                                         |
| `welcome`            | 5 (lowest)  | `{to, firstName, userType}`                                                    | Welcome email on registration                                                          |

**Processor** (`email.processor.ts`):

- Uses nodemailer with `MAIL_HOST`/`MAIL_PORT`/`MAIL_USER`/`MAIL_PASS`
- Generates full HTML email templates with inline CSS and gradient headers for all 5 types

#### CERTIFICATE queue (`'certificate'`)

**Service method**: `queueService.addCertificateJob(type, data)`

| Job Type            | Status   | Data Fields                                                                                                                            |
| ------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `generate-pdf`      | **STUB** | `{certificateId, candidateId, ...}` — simulates 500ms delay                                                                            |
| `generate-image`    | **STUB** | `{certificateId, ...}` — simulates 300ms delay                                                                                         |
| `upload-storage`    | **STUB** | `{certificateId, ...}` — simulates 200ms delay                                                                                         |
| `anchor-blockchain` | **REAL** | `{certificateId, certificateNumber, hash}` — calls `BlockchainService.anchorCertificate()`, updates DB with txHash/network/blockNumber |

#### BLOCKCHAIN queue (`'blockchain'`)

**Service method**: `queueService.addBlockchainJob(type, data)`

| Job Type             | Notes                                      |
| -------------------- | ------------------------------------------ |
| `anchor-certificate` | Called from certificate processor          |
| `verify-certificate` | Available but not used in certificate flow |
| `batch-anchor`       | Available but not used in current code     |

### Queue Constants (`queue/constants.ts`)

```
QUEUES.EMAIL = 'email'
QUEUES.CERTIFICATE = 'certificate'
QUEUES.BLOCKCHAIN = 'blockchain'
```

---

## 8. Storage Service

**File**: `apps/api/src/modules/storage/storage.service.ts`

Uses `@aws-sdk/client-s3` with `forcePathStyle: true` (MinIO compatible).

### Configuration

Reads from `storage.*` config:

- `endpoint`: from `S3_ENDPOINT`, or constructed from `MINIO_ENDPOINT`/`MINIO_PORT`/`MINIO_USE_SSL`
- `accessKey`: from `S3_ACCESS_KEY` or `MINIO_ROOT_USER`
- `secretKey`: from `S3_SECRET_KEY` or `MINIO_ROOT_PASSWORD`
- `bucket`: from `S3_BUCKET` or `MINIO_BUCKET`

On module init: auto-creates bucket if it doesn't exist.

### URL Format

- MinIO (detected by endpoint containing 'localhost' or 'minio'): `${endpoint}/${bucket}/${key}`
- AWS/Supabase: `https://${bucket}.s3.${region}.amazonaws.com/${key}` (or presigned)

### Methods

| Method                                                     | Description                                                |
| ---------------------------------------------------------- | ---------------------------------------------------------- |
| `uploadBuffer(key, buffer, contentType, metadata?)`        | Upload from Buffer                                         |
| `uploadStream(key, stream, contentType, metadata?)`        | Upload from Readable stream                                |
| `uploadCertificatePdf(certId, buffer)`                     | `certificates/${certId}/certificate.pdf`                   |
| `uploadCertificateImage(certId, buffer)`                   | `certificates/${certId}/certificate.png`                   |
| `uploadResume(candidateId, buffer, originalName)`          | `resumes/${candidateId}/${uuid}.${ext}`                    |
| `uploadPortfolioFile(candidateId, buffer, originalName)`   | `portfolio/${candidateId}/${uuid}.${ext}`                  |
| `uploadSubmissionFile(submissionId, buffer, originalName)` | `submissions/${submissionId}/${uuid}.${ext}`               |
| `getFile(key)`                                             | Returns `GetObjectCommandOutput`                           |
| `getFileStream(key)`                                       | Returns readable stream                                    |
| `getFileInfo(key)`                                         | Returns `{key, size, lastModified, contentType, metadata}` |
| `fileExists(key)`                                          | Boolean check via HeadObject                               |
| `deleteFile(key)`                                          | Delete object                                              |
| `listFiles(prefix?)`                                       | List objects with optional prefix filter                   |
| `getFileUrl(key)`                                          | Returns public URL                                         |

---

## 9. Blockchain

**File**: `apps/api/src/modules/blockchain/blockchain.service.ts`

### Overview

Certificates can be anchored to the Polygon Amoy testnet. The feature is gated by the `FEATURE_BLOCKCHAIN_ENABLED` environment variable (default `false`).

### Configuration

All values read via `configService.getOrThrow()` — service fails to initialize if missing:

- `POLYGON_RPC_URL` — JSON-RPC endpoint (e.g., Infura, Alchemy)
- `BLOCKCHAIN_PRIVATE_KEY` — wallet private key for signing transactions
- `CONTRACT_ADDRESS` — deployed smart contract address

### Contract

ABI loaded from `./contract.abi.json` (relative to the service file). Contract must expose:

- `anchor(certificateNumber: string, hash: bytes32)` — write, stores on-chain
- `verify(certificateNumber: string)` → `{exists: bool, onChainHash: bytes32, timestamp: uint256}` — read

### Methods

**`anchorCertificate(certificateNumber, hash)`**:

1. Connects `ethers.JsonRpcProvider` with configured URL
2. Creates `Wallet` from private key
3. Calls `contract.anchor(certificateNumber, \`0x${hash}\`)`
4. Awaits transaction receipt
5. Returns `{txHash, blockNumber, network: 'polygon-amoy'}`
6. Explorer URL: `https://amoy.polygonscan.com/tx/${txHash}`

**`verifyCertificate(certificateNumber)`**:

1. Calls `contract.verify(certificateNumber)` (read-only)
2. Returns `{exists, onChainHash, timestamp}` from contract

### Processor Integration

The `anchor-blockchain` job in the CERTIFICATE queue calls `BlockchainService.anchorCertificate()` and then updates the `Certificate` record with `blockchainTxId`, `blockchainNetwork`, and `blockNumber`.

### Hash Format

The hash anchored on-chain is a SHA256 of `${certificateNumber}:${candidateId}:${skillId}:${score}`, prefixed with `0x` when passed to the contract.

---

## 10. Shared Packages

### `@verihire/database` (`packages/database`)

**Schema**: `prisma/schema.prisma` (see Section 2)
**Client**: `src/client.ts` — singleton PrismaClient with global reuse in development to prevent too-many-connections during hot reload.

```typescript
// Exported singleton
export const prisma: PrismaClient;
export * from '@prisma/client'; // re-exports all generated types
```

### `@verihire/types` (`packages/types`)

**`src/api.ts`** — API response wrappers and request DTOs:

```typescript
ApiResponse<T>           { success, data: T, message?, error?, meta? }
ApiError                 { success: false, error, statusCode, details? }
ApiMeta                  { page, limit, total, totalPages }
PaginationParams         { page?, limit?, sortBy?, sortOrder? }
PaginatedResponse<T>     { items: T[], meta: ApiMeta }

// Search filter types
CandidateSearchFilters   { skillIds?, minExperience?, maxExperience?, locations?, remotePreference?, jobSearchStatus?, verifiedOnly?, limit?, offset? }
JobSearchFilters         { query?, locationCity?, remotePolicy?, employmentType?, salaryMin?, skillIds?, status? }
ChallengeSearchFilters   { skillId?, difficulty?, type?, category?, limit?, offset? }

// DTOs
CreateUserDto            { email, password, firstName, lastName, userType }
UpdateUserDto            { firstName?, lastName?, avatarUrl? }
UpdateCandidateProfileDto  { headline?, bio?, yearsExperience?, currentRole?, currentCompany?, locationCity?, locationCountry?, remotePreference?, linkedinUrl?, githubUrl?, portfolioUrl?, jobSearchStatus?, preferredSalaryMin?, preferredSalaryMax?, portfolioPublic?, portfolioSlug? }
CreateJobDto             { title, description?, requirements?, responsibilities?, locationCity?, locationCountry?, remotePolicy?, salaryMin?, salaryMax?, salaryCurrency?, employmentType?, experienceLevel?, experienceYearsMin?, experienceYearsMax? }
UpdateJobDto             Partial<CreateJobDto>
CreateSubmissionDto      { challengeId }
SubmitSolutionDto        { content, language }
SubmitReviewDto          { criteriaScores, overallScore, strengths?, areasForImprovement?, suggestions?, confidenceLevel?, timeSpentSeconds? }
AddToShortlistDto        { candidateId, notes? }
UpdateShortlistDto       { stage?, notes?, rating? }
```

**`src/auth.ts`** — Auth-specific types:

```typescript
LoginCredentials         { email, password }
RegisterCredentials      { email, password, firstName, lastName, userType }
OAuthCredentials         { provider, token }
TokenPair                { accessToken, refreshToken }
AccessTokenPayload       { sub, email, userType, sessionId, iat, exp }
RefreshTokenPayload      { sub, email, sessionId, iat, exp }
Session                  { id, userId, expiresAt, createdAt, revokedAt? }
SessionInfo              { id, ipAddress?, userAgent?, createdAt, expiresAt, current? }
AuthResponse             { user: AuthUser, accessToken, refreshToken }
AuthUser                 { id, email, firstName, lastName, userType, emailVerified, avatarUrl?, candidateProfileId?, recruiterProfileId? }
OAuthProfile             { provider, providerId, email, firstName?, lastName?, avatarUrl? }
```

### `@verihire/utils` (`packages/utils`)

**`src/index.ts`** — Single export:

```typescript
generateUUID(): string   // Uses Node.js crypto.randomUUID()
```

### `@verihire/config` (`packages/config`)

Shared ESLint configs (base, react, next, nest), Prettier config, base tsconfig. Consumed by `eslint.config.*` and `tsconfig.json` in each app/package.

---

## 11. Configuration & Environment Variables

All config centralized in `apps/api/src/config/configuration.ts`. Read by NestJS `ConfigModule.forRoot({ load: [configuration] })`.

### Complete Variable Reference

| Variable                 | Config Path                    | Default                                 | Used In                                    |
| ------------------------ | ------------------------------ | --------------------------------------- | ------------------------------------------ |
| `PORT`                   | `port`                         | `4000`                                  | `main.ts` — listen port                    |
| `NODE_ENV`               | `nodeEnv`                      | `'development'`                         | Swagger enable/disable, app behavior       |
| `DATABASE_URL`           | `database.url`                 | none                                    | Prisma connection string                   |
| `REDIS_URL`              | `redis.url`                    | `redis://localhost:6379`                | Bull queue, parsed for host/port/password  |
| `JWT_ACCESS_SECRET`      | `jwt.accessSecret`             | `'access-secret-change-in-production'`  | Sign/verify access JWTs                    |
| `JWT_REFRESH_SECRET`     | `jwt.refreshSecret`            | `'refresh-secret-change-in-production'` | Sign/verify refresh JWTs                   |
| `JWT_ACCESS_EXPIRES_IN`  | `jwt.accessExpiresIn`          | `'15m'`                                 | Access token TTL                           |
| `JWT_REFRESH_EXPIRES_IN` | `jwt.refreshExpiresIn`         | `'7d'`                                  | Refresh token TTL                          |
| `API_URL`                | `oauth.callbackBaseUrl`        | `http://localhost:4100`                 | OAuth callback base URL                    |
| `APP_URL`                | `oauth.frontendUrl`            | `http://localhost:3100`                 | Frontend redirect URL, email links         |
| `GOOGLE_CLIENT_ID`       | `oauth.google.clientId`        | none                                    | Google OAuth                               |
| `GOOGLE_CLIENT_SECRET`   | `oauth.google.clientSecret`    | none                                    | Google OAuth                               |
| `GITHUB_CLIENT_ID`       | `oauth.github.clientId`        | none                                    | GitHub OAuth                               |
| `GITHUB_CLIENT_SECRET`   | `oauth.github.clientSecret`    | none                                    | GitHub OAuth                               |
| `MAIL_HOST`              | `mail.host`                    | `'localhost'`                           | nodemailer SMTP host                       |
| `MAIL_PORT`              | `mail.port`                    | `1025`                                  | nodemailer SMTP port (Mailhog default)     |
| `MAIL_USER`              | `mail.user`                    | none                                    | SMTP auth username                         |
| `MAIL_PASS`              | `mail.pass`                    | none                                    | SMTP auth password                         |
| `MAIL_FROM`              | `mail.from`                    | `'noreply@verihire.local'`              | Email from address                         |
| `S3_ENDPOINT`            | `storage.endpoint`             | constructed from MINIO\_\*              | S3-compatible storage endpoint             |
| `MINIO_ENDPOINT`         | `storage.endpoint` (fallback)  | none                                    | MinIO hostname                             |
| `MINIO_PORT`             | `storage.endpoint` (fallback)  | `'9000'`                                | MinIO port                                 |
| `MINIO_USE_SSL`          | `storage.endpoint` (fallback)  | `'false'`                               | MinIO SSL toggle                           |
| `S3_ACCESS_KEY`          | `storage.accessKey`            | `'minioadmin'`                          | S3 access key                              |
| `MINIO_ROOT_USER`        | `storage.accessKey` (fallback) | `'minioadmin'`                          | MinIO root user                            |
| `S3_SECRET_KEY`          | `storage.secretKey`            | `'minioadmin'`                          | S3 secret key                              |
| `MINIO_ROOT_PASSWORD`    | `storage.secretKey` (fallback) | `'minioadmin'`                          | MinIO root password                        |
| `S3_BUCKET`              | `storage.bucket`               | `'verihire'`                            | S3 bucket name                             |
| `MINIO_BUCKET`           | `storage.bucket` (fallback)    | `'verihire'`                            | MinIO bucket name                          |
| `OPENAI_API_KEY`         | `openai.apiKey`                | `''`                                    | LLM API key (Groq or OpenAI)               |
| `OPENAI_MODEL`           | `openai.model`                 | `'gpt-4o'`                              | LLM model name                             |
| `OPENAI_BASE_URL`        | `openai.baseUrl`               | `'https://api.openai.com/v1'`           | LLM API base URL                           |
| `JUDGE0_URL`             | `judge0.url`                   | `'http://localhost:2358'`               | Judge0 CE base URL                         |
| `JUDGE0_API_KEY`         | `judge0.apiKey`                | `''`                                    | RapidAPI key (optional, for hosted Judge0) |
| `JUDGE0_API_HOST`        | `judge0.apiHost`               | `''`                                    | RapidAPI host header (optional)            |
| `CORS_ORIGINS`           | `cors.origins`                 | `['http://localhost:3000']`             | Comma-separated allowed CORS origins       |

**Additional env vars** (not in configuration.ts, read directly by blockchain service):

| Variable                 | Read By           | Notes                                                 |
| ------------------------ | ----------------- | ----------------------------------------------------- |
| `POLYGON_RPC_URL`        | BlockchainService | Required if blockchain enabled; read via `getOrThrow` |
| `BLOCKCHAIN_PRIVATE_KEY` | BlockchainService | Wallet private key; read via `getOrThrow`             |
| `CONTRACT_ADDRESS`       | BlockchainService | Smart contract address; read via `getOrThrow`         |

**Feature flags** (from `.env.example`, read via `process.env` directly in services):

| Variable                        | Default | Effect                                                 |
| ------------------------------- | ------- | ------------------------------------------------------ |
| `FEATURE_BLOCKCHAIN_ENABLED`    | `false` | Enables blockchain anchoring in certificate generation |
| `FEATURE_MFA_ENABLED`           | `true`  | MFA feature toggle (not fully implemented)             |
| `FEATURE_AI_EVALUATION_ENABLED` | `true`  | AI evaluation toggle                                   |

**Frontend env vars** (Next.js, `NEXT_PUBLIC_*`):

| Variable              | Default                        | Used In                                             |
| --------------------- | ------------------------------ | --------------------------------------------------- |
| `NEXT_PUBLIC_API_URL` | `http://localhost:4100/api/v1` | `src/lib/constants.ts` — base URL for all API calls |

### Recommended Production Values

```bash
NODE_ENV=production
DATABASE_URL=postgresql://user:pass@host:5432/verihire
REDIS_URL=redis://:password@host:6379
JWT_ACCESS_SECRET=<64+ char random string>
JWT_REFRESH_SECRET=<64+ char random string>
OPENAI_API_KEY=<groq or openai key>
OPENAI_MODEL=llama-3.3-70b-versatile
OPENAI_BASE_URL=https://api.groq.com/openai/v1
JUDGE0_URL=https://judge0-ce.p.rapidapi.com
JUDGE0_API_KEY=<rapidapi key>
JUDGE0_API_HOST=judge0-ce.p.rapidapi.com
S3_ENDPOINT=https://<project>.supabase.co/storage/v1/s3
S3_ACCESS_KEY=<supabase storage key>
S3_SECRET_KEY=<supabase storage secret>
S3_BUCKET=verihire
CORS_ORIGINS=https://yourdomain.com
NEXT_PUBLIC_API_URL=https://api.yourdomain.com/api/v1
```

---

## 12. Known Issues / Incomplete Features

### Security

1. **`GET /submissions/admin/all` has no authentication** (`submissions-admin.controller.ts`). The comment in the code says "demo/testing endpoint". In production this exposes all submissions to anyone.

2. **Certificate signature is a placeholder**. `certificates.service.ts` generates `signature` and `publicKey` from random bytes rather than real asymmetric cryptography (e.g., RSA or Ed25519). The `hash` field is real (SHA256), but the signature cannot actually be verified.

3. **`GET /users/:id` has no guard**. The users controller has no `JwtAuthGuard` on the handler, meaning any user ID can be looked up without authentication.

### Stubs / Unimplemented

4. **Certificate PDF generation is a stub**. `certificate.processor.ts` `generate-pdf` handler simulates a 500ms delay and returns `{status: 'generated'}` without actually producing a PDF. `pdfUrl` on the Certificate record will never be populated via this path.

5. **Certificate image generation is a stub**. Same as above — simulates 300ms delay, no real image output.

6. **Certificate storage upload is a stub**. The `upload-storage` job type simulates 200ms and does nothing.

7. **IPFS hash field is unused**. `Certificate.ipfsHash` column exists in schema but is never written.

8. **MFA is partially implemented**. `User` has `mfaEnabled`, `mfaSecretEncrypted`, and `MfaBackupCode` table, but there are no API endpoints in the auth controller to set up or verify TOTP. The `FEATURE_MFA_ENABLED` flag exists but has no enforcement.

9. **Blockchain queue has unused job types**. `verify-certificate` and `batch-anchor` are defined in `QueueService` constants but no processor handles them in the current CERTIFICATE processor — only `anchor-blockchain` is wired.

### Known Behavior Issues

10. **Test case generation falls back to empty array silently**. If `OPENAI_API_KEY` is not configured, `TestCaseGeneratorService` returns `[]` for all generation methods. In this case, if a challenge also has no manual `testCases`, the submission is scored 100% on code quality alone (since `accuracy` defaults to 0 and the formula becomes `0 * 0.6 + codeQualityScore * 0.4`, then falls back to `codeQualityScore` when `totalTestCases === 0`).

11. **Plagiarism check runs against all submissions in DB but never blocks evaluation**. The result of the plagiarism check is logged but does not affect the score or trigger any automated action. It's purely informational.

12. **`normalizeOutput` colon normalization is too aggressive**. The rule `.replace(/:\s+/g, ':')` will transform valid JSON keys like `"key": "value"` into `"key":"value"`, which could break expected output comparison for challenges that produce JSON.

13. **`challenge.cachedTestCases` is populated on first evaluation and never invalidated**. If the challenge description changes, the cached test cases will be stale.

14. **Shortlist stage history is tracked** (`stageHistory: Json`), but the service does not appear to append to it when stages change — it remains `[]` by default.

15. **`TestCaseGeneratorService` default base URL fallback differs from `configuration.ts`**. The service constructor falls back to `'https://api.groq.com/openai/v1'` but `configuration.ts` defaults `openai.baseUrl` to `'https://api.openai.com/v1'`. They will only match if `OPENAI_BASE_URL` is explicitly set to the Groq URL.

16. **The landing page (`/`) shows static marketing stats** (50K+ certified, 200+ skills, etc.) that are hard-coded, not fetched from the database.

17. **Refresh token is not rotated on use**. The `refreshToken()` method issues a new token pair but does not revoke the old session. This means a stolen refresh token can be used multiple times until it naturally expires.

---

## 13. Frontend-Backend Integration

### API Client (`src/lib/api.ts`)

Base URL: `process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4100/api/v1'`

Token storage: `localStorage` under keys `'accessToken'` and `'refreshToken'`.

```typescript
// Exported functions
setTokens(accessToken, refreshToken): void
clearTokens(): void

// Main client object
api.get<T>(path, options?)   → Promise<T>
api.post<T>(path, body?, options?)  → Promise<T>
api.patch<T>(path, body?, options?) → Promise<T>
api.delete<T>(path, options?) → Promise<T>
api.upload<T>(path, formData, options?) → Promise<T>  // multipart/form-data
```

**Auto-refresh on 401**: A module-level `refreshPromise` variable prevents concurrent refresh calls. On 401:

1. If no refresh already in progress: POST `/auth/refresh {refreshToken}`
2. Store new tokens
3. Retry original request with new access token
4. On refresh failure: `clearTokens()` + `window.location.href = '/login'`

**Response unwrapping**: Tries `response.data` first (ApiResponse wrapper), falls back to raw response.

### SWR Configuration (`src/lib/swr-provider.tsx`)

```typescript
{
  fetcher: api.get,           // All SWR keys are API paths
  revalidateOnFocus: false,
  errorRetryCount: 2,
  dedupingInterval: 5000      // 5 second dedup window
}
```

### Hooks Reference

All hooks in `apps/web/src/hooks/`:

#### `use-submissions.ts`

- `useMySubmissions(filters?)` — SWR: `GET /submissions/my?...`
- `useSubmission(id)` — SWR: `GET /submissions/:id`
- `useSubmissionResults(id)` — SWR: `GET /submissions/:id/results`
- `useActiveSubmission(challengeId)` — SWR: `GET /submissions/active/:challengeId`
- `startSubmission(challengeId)` — `POST /submissions/start`
- `updateSubmission(id, data)` — `PATCH /submissions/:id`
- `submitSolution(id, data)` — `POST /submissions/:id/submit`

#### `use-challenges.ts`

- `useChallenges(filters?)` — SWR: `GET /challenges?...`
- `useChallenge(id)` — SWR: `GET /challenges/:id`
- `useRecommendedChallenges()` — SWR: `GET /challenges/recommended`
- `startChallenge(challengeId)` — `GET /challenges/:id/start`

#### `use-certificates.ts`

- `useMyCertificates()` — SWR: `GET /certificates`
- `useCertificate(id)` — SWR: `GET /certificates/:id`
- `useCertificateByNumber(certNumber)` — SWR: `GET /certificates/number/:certNumber`
- `useVerifyCertificate(certNumber)` — SWR: `GET /certificates/verify/:certNumber`
- `getCertificateDownloadUrl(id, format)` — returns URL string: `/certificates/:id/download?format=...`

#### `use-candidate.ts`

- `useCandidateProfile()` — SWR: `GET /candidates/me`
- `useCandidateStats()` — SWR: `GET /candidates/me/stats`
- `useCandidateSkills()` — SWR: `GET /candidates/me/skills`
- `updateCandidateProfile(data)` — `PATCH /candidates/me`
- `addCandidateSkill(data)` — `POST /candidates/me/skills`
- `removeCandidateSkill(skillId)` — `DELETE /candidates/me/skills/:skillId`

#### `use-recruiter.ts`

- `useRecruiterProfile()` — SWR: `GET /recruiters/me`
- `useRecruiterStats()` — SWR: `GET /recruiters/me/stats`
- `useRecruiterDashboard()` — SWR: `GET /analytics/recruiter/dashboard`
- `createRecruiterProfile(data)` — `POST /recruiters`
- `updateRecruiterProfile(data)` — `PATCH /recruiters/me`

#### `use-jobs.ts`

- `useMyJobs(filters?)` — SWR: `GET /jobs/recruiter/my-jobs?...`
- `useJob(id)` — SWR: `GET /jobs/:id`
- `useJobShortlist(jobId, stage?)` — SWR: `GET /jobs/:id/shortlist?stage=...`
- `useMatchingCandidates(jobId)` — SWR: `GET /jobs/:id/matching-candidates`
- `createJob(data)` — `POST /jobs`
- `updateJob(id, data)` — `PATCH /jobs/:id`
- `publishJob(id)` — `POST /jobs/:id/publish`
- `closeJob(id)` — `POST /jobs/:id/close`
- `deleteJob(id)` — `DELETE /jobs/:id`
- `addToShortlist(jobId, candidateId, notes?)` — `POST /jobs/:id/shortlist`
- `updateShortlistEntry(jobId, candidateId, data)` — `PATCH /jobs/:id/shortlist/:candidateId`
- `removeFromShortlist(jobId, candidateId)` — `DELETE /jobs/:id/shortlist/:candidateId`

#### `use-reviews.ts`

- `usePendingReviews(filters?)` — SWR: `GET /reviews/pending?...`
- `useReview(reviewId)` — SWR: `GET /reviews/:reviewId`
- `useMyReviewStats()` — SWR: `GET /reviews/me/stats`
- `submitReview(reviewId, data)` — `POST /reviews/:reviewId/submit`

#### `use-skills.ts`

- `useSkills(search?)` — SWR: `GET /skills?search=...`
- `usePopularSkills(limit?)` — SWR: `GET /skills/popular?limit=...`
- `useSkillCategories()` — SWR: `GET /skills/categories`

#### `use-companies.ts`

- `useCompanies()` — SWR: `GET /companies`
- `useCompany(id)` — SWR: `GET /companies/:id`
- `createCompany(data)` — `POST /companies`
- `updateCompany(id, data)` — `PATCH /companies/:id`

#### `use-candidates-search.ts`

- `useCandidateSearch(filters)` — SWR: `GET /candidates/search?...` — only fires if query params are non-empty

#### `use-debounce.ts`

- `useDebounce<T>(value, delay)` — standard debounce hook, used in candidate search (300ms)

### Route Constants (`src/lib/constants.ts`)

```typescript
API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4100/api/v1';

ROUTES = {
  home: '/',
  login: '/login',
  register: '/register',
  candidateDashboard: '/dashboard',
  challenges: '/challenges',
  challengeDetail: id => `/challenges/${id}`,
  challengeSubmit: id => `/challenges/${id}/submit`,
  submissions: '/submissions',
  submissionResults: id => `/submissions/${id}/results`,
  certificates: '/certificates',
  profile: '/profile',
  reviews: '/reviews',
  reviewDetail: id => `/reviews/${id}`,
  verify: certNumber => `/verify/${certNumber}`,
  candidateProfile: id => `/recruiter/candidates/${id}`,
  candidateSearch: '/recruiter/candidates',
  recruiterDashboard: '/recruiter/dashboard',
  jobList: '/recruiter/jobs',
  jobDetail: id => `/recruiter/jobs/${id}`,
  jobNew: '/recruiter/jobs/new',
  shortlist: id => `/recruiter/jobs/${id}/shortlist`,
  jobMatches: id => `/recruiter/jobs/${id}/matches`,
  company: '/recruiter/company',
};
```

### Data Flow: Submission to Certificate

```
User clicks "Submit" on challenge editor
  ↓
submitSolution(submissionId, { content, language })
  → POST /api/v1/submissions/:id/submit
  ↓
API: SubmissionsService.submitSolution()
  → status = SUBMITTED, submittedAt = now
  → fire-and-forget: evaluateSubmission()
  ↓
API: EvaluationsService.evaluateSubmission() (async, no await)
  → status = EVALUATING
  → LLM generates test cases (or uses cached)
  → Judge0 runs tests
  → LLM generates feedback
  → Evaluation record created
  → status = EVALUATED, aiScore set
  → If score >= 70 → CertificateService.generateCertificate()
  ↓
Frontend: redirected to /submissions/:id/results
  → useSubmissionResults polls (SWR refetch)
  → Shows "Evaluating..." while status = EVALUATING
  → Shows score, feedback when EVALUATED
  → If passing, "View Certificates" button appears
```

---

_End of TECHNICAL.md_
