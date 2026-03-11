# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
# Install dependencies
pnpm install

# Start all services (API :4100, Web :3100)
pnpm dev

# Run a single app
pnpm --filter @verihire/api dev
pnpm --filter @verihire/web dev

# Build
pnpm build

# Lint & format
pnpm lint
pnpm lint:fix
pnpm format
pnpm typecheck

# Tests (Jest)
pnpm test                              # all workspaces
pnpm --filter @verihire/api test       # API only
pnpm --filter @verihire/api test:watch # watch mode

# Database
pnpm db:generate     # regenerate Prisma client after schema changes
pnpm db:migrate      # create/apply migration (dev)
pnpm db:migrate:deploy # apply migrations (prod)
pnpm db:push         # push schema directly (quick dev iteration)
pnpm db:seed         # seed with test data
pnpm db:studio       # Prisma Studio GUI on :5555

# Infrastructure (PostgreSQL 16, Redis 7, Judge0 CE, MinIO, Mailhog)
pnpm docker:up
pnpm docker:down
```

## Architecture

**Turborepo monorepo** with pnpm workspaces. Two apps + four shared packages.

### Apps

- **`apps/api`** — NestJS 10 backend. Modular structure under `src/modules/` with 17 feature modules (auth, users, candidates, recruiters, challenges, submissions, evaluations, skills, certificates, reviews, jobs, companies, analytics, queue, storage, blockchain, health). Each module follows controller → service → Prisma pattern. JWT auth with Passport strategies, role-based guards, Bull/Redis queues for async jobs (email, certificate generation). API prefix: `/api`, URI versioning (`/api/v1/...`). Three-tier rate limiting via Throttler. Swagger at `/docs`.

- **`apps/web`** — Next.js 14 with App Router, shadcn/ui, Tailwind CSS, TypeScript. Full candidate + recruiter experience with SWR for data fetching, Monaco editor for code submissions, auth context with JWT tokens. Dev port 3100. Uses `@/*` path alias for `./src/*`. Imports `@verihire/types` and `@verihire/utils`.

### Shared Packages

- **`packages/database`** — Prisma 5 schema and client. Schema at `prisma/schema.prisma`. Exports singleton PrismaClient from `src/client.ts`. Key models: User, CandidateProfile, Skill, Challenge, Submission, Evaluation, Certificate, Job, Company, RecruiterProfile, Review.

- **`packages/types`** — Shared TypeScript interfaces: API response types (`ApiResponse<T>`, `PaginatedResponse<T>`), auth types (JWT payloads, OAuth), DTOs for all entities.

- **`packages/utils`** — Shared utilities: `generateUUID`.

- **`packages/config`** — Shared ESLint configs (base, react, next, nest), Prettier config, base tsconfig.

### Key Integration Flow

Candidate submits code → API receives submission → LLM (Groq/Llama 3.3) generates test cases → reference solution validates expected outputs → Judge0 CE executes code in sandbox → LLM generates feedback → scores stored via Prisma → certificate generated if passing → blockchain hash recorded.

### Evaluation Pipeline

- **Test case generation**: `TestCaseGeneratorService` calls Groq API (Llama 3.3 70B) to generate test cases from challenge descriptions
- **Reference validation**: If a challenge has a `referenceSolution`, it's run in Judge0 first to get ground-truth expected outputs
- **Code execution**: `CodeExecutionService` wraps Judge0 CE for sandboxed execution with batch submission + polling
- **Scoring**: 60% test accuracy + 40% code quality estimate
- **Challenge categories**: `GENERAL_SWE` (any language) and `DOMAIN_SPECIFIC` (locked to specific languages)

## Conventions

- **Commits**: Conventional Commits enforced by commitlint + husky. Format: `type(scope): description`. Types: feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert. Subject must be lowercase, max 100 chars.
- **Branch naming**: `feature/`, `fix/`, `refactor/`, `docs/`, `test/`, `chore/` prefixes.
- **Workspace commands**: Use `pnpm --filter @verihire/<name>` to target a specific workspace.
- **API modules**: Follow NestJS patterns — module/controller/service/dto structure with `@UseGuards(JwtAuthGuard, RolesGuard)` for protected routes and `@Roles()` decorator for RBAC.
- **Validation**: Global `ValidationPipe` with `whitelist: true`, `forbidNonWhitelisted: true`, `transform: true`. DTOs use class-validator decorators.
