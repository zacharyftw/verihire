# VeriHire

> AI-Powered Developer Assessment & Hiring Platform

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)](https://www.typescriptlang.org/)
[![Node](https://img.shields.io/badge/Node-20+-green)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-9.0-orange)](https://pnpm.io/)

VeriHire is a hiring platform that lets companies assess developers through real coding challenges. Candidates submit code, it gets executed in a sandbox, evaluated by an LLM, and if they pass — they earn a blockchain-anchored certificate. Recruiters get verified skill profiles instead of self-reported CVs.

---

## How It Works

1. **Candidate uploads resume** → AI parses it, extracts years of experience, tech domains, and seniority level (entry / junior / mid / senior / staff)
2. **Candidate takes a challenge** → writes code in a Monaco editor, submits
3. **Code runs in Judge0** → sandboxed execution against LLM-generated test cases
4. **Groq/Llama 3.3 evaluates** → test accuracy (60%) + code quality (40%) = final score
5. **If passing score** → PDF certificate generated, ECDSA-signed, blockchain hash recorded
6. **Recruiter searches** → verified skill profiles, candidate seniority, domain breakdown

---

## Tech Stack

| Layer          | Technology                                                |
| -------------- | --------------------------------------------------------- |
| Frontend       | Next.js 14 (App Router), shadcn/ui, Tailwind CSS, SWR     |
| Backend        | NestJS 10, Prisma 5, TypeScript                           |
| Database       | PostgreSQL via Supabase                                   |
| File Storage   | S3-compatible via Supabase Storage                        |
| AI / LLM       | Groq API (Llama 3.3 70B)                                  |
| Code Execution | Judge0 CE (self-hosted or ngrok tunnel)                   |
| Auth           | JWT (access + refresh tokens), Google OAuth, GitHub OAuth |
| Certificates   | PDFKit + ECDSA signing + blockchain anchoring             |
| Monorepo       | Turborepo + pnpm workspaces                               |

---

## Project Structure

```
verihire/
├── apps/
│   ├── api/                 # NestJS backend (port 4100)
│   └── web/                 # Next.js frontend (port 3100)
├── packages/
│   ├── database/            # Prisma schema + client
│   ├── types/               # Shared TypeScript interfaces
│   ├── utils/               # Shared utilities
│   └── config/              # Shared ESLint/TS config
└── docker-compose.yml       # Judge0 CE local setup
```

### API Modules (`apps/api/src/modules/`)

| Module            | Description                                             |
| ----------------- | ------------------------------------------------------- |
| `auth`            | Register, login, refresh, logout, Google/GitHub OAuth   |
| `users`           | User accounts and roles                                 |
| `candidates`      | Candidate profiles, skills, resume upload + AI analysis |
| `recruiters`      | Recruiter profiles                                      |
| `companies`       | Company management                                      |
| `challenges`      | Challenge CRUD, templates                               |
| `submissions`     | Code submission handling                                |
| `evaluations`     | LLM evaluation pipeline                                 |
| `code-execution`  | Judge0 CE integration                                   |
| `certificates`    | PDF generation, ECDSA signing, blockchain anchoring     |
| `skills`          | Skill taxonomy                                          |
| `jobs`            | Job postings                                            |
| `reviews`         | Peer review system                                      |
| `storage`         | S3 file upload/download                                 |
| `blockchain`      | Certificate hash anchoring                              |
| `analytics`       | Platform analytics                                      |
| `resume-analysis` | PDF parsing, seniority detection, domain extraction     |
| `health`          | Health check endpoint                                   |

---

## Quick Start

### Prerequisites

- Node.js >= 20
- pnpm >= 9
- Docker (for Judge0 local code execution)

### Setup

```bash
# Install dependencies
pnpm install

# Copy and fill in environment variables
cp .env.example .env

# Generate Prisma client
pnpm db:generate

# Seed the database
pnpm db:seed

# Start Judge0 (code execution sandbox)
pnpm docker:up

# Start dev servers (API :4100, Web :3100)
pnpm dev
```

### Access Points

| Service       | URL                                      |
| ------------- | ---------------------------------------- |
| Web App       | http://localhost:3100                    |
| API           | http://localhost:4100                    |
| Swagger Docs  | http://localhost:4100/docs               |
| Prisma Studio | http://localhost:5555 (`pnpm db:studio`) |

---

## Environment Variables

```bash
# App
PORT=4100
NODE_ENV=development
API_URL=http://localhost:4100
APP_URL=http://localhost:3100

# Database (Supabase PostgreSQL)
DATABASE_URL=postgresql://...

# Supabase Storage
S3_ENDPOINT=https://<project>.supabase.co/storage/v1/s3
S3_ACCESS_KEY=...
S3_SECRET_KEY=...
S3_BUCKET=verihire

# JWT
JWT_SECRET=...
JWT_ACCESS_SECRET=...
JWT_REFRESH_SECRET=...
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# OAuth
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...

# Groq (LLM - test case generation, evaluation, resume analysis)
OPENAI_API_KEY=...              # Your Groq API key
OPENAI_BASE_URL=https://api.groq.com/openai/v1
OPENAI_MODEL=llama-3.3-70b-versatile

# Judge0 (code execution)
JUDGE0_URL=http://localhost:2358

# Certificate signing (ECDSA secp256k1)
CERTIFICATE_SIGNING_PRIVATE_KEY=...
CERTIFICATE_SIGNING_PUBLIC_KEY=...

# Frontend
NEXT_PUBLIC_API_URL=http://localhost:4100
```

---

## Key Commands

```bash
# Dev
pnpm dev                           # all services
pnpm --filter @verihire/api dev    # API only
pnpm --filter @verihire/web dev    # Web only

# Build & check
pnpm build
pnpm typecheck
pnpm lint
pnpm lint:fix
pnpm format

# Tests
pnpm test
pnpm --filter @verihire/api test
pnpm --filter @verihire/api test:watch

# Database
pnpm db:generate     # regenerate Prisma client after schema changes
pnpm db:migrate      # create + apply migration (needs local DB)
pnpm db:push         # push schema directly (Supabase)
pnpm db:seed         # seed test data
pnpm db:studio       # Prisma Studio GUI

# Infrastructure
pnpm docker:up       # start Judge0 CE locally
pnpm docker:down     # stop containers
```

---

## Evaluation Pipeline

```
Candidate submits code
        ↓
LLM generates test cases from challenge description
        ↓
(If reference solution exists) → run in Judge0 to get ground-truth outputs
        ↓
Run candidate code in Judge0 against test cases
        ↓
LLM generates feedback + code quality score
        ↓
Final score = (test accuracy × 60%) + (code quality × 40%)
        ↓
Score ≥ pass threshold → generate PDF certificate → ECDSA sign → anchor on blockchain
```

---

## Resume Analysis Pipeline

```
Candidate uploads PDF resume
        ↓
pdf-parse extracts raw text
        ↓
Groq extracts structured JSON: work history (company, role, start, end), domains, seniority guess
        ↓
Code calculates years of experience (merging overlapping jobs)
        ↓
Seniority validated: years = ground truth, LLM can adjust ±1 level
        ↓
Stored on candidate profile: seniorityLevel, domains, yearsExp, resumeText
```

Seniority bands: `< 1yr → entry`, `1–3yr → junior`, `3–6yr → mid`, `6–10yr → senior`, `10yr+ → staff`

Mid-level and above also get a **take-home assignment** generated alongside domain-specific questions.

---

## Authentication

- Email + password (bcrypt, JWT)
- Google OAuth
- GitHub OAuth
- JWT access tokens (15min) + refresh tokens (7d) with rotation
- Role-based access control: `CANDIDATE`, `RECRUITER`, `ADMIN`

No email verification, no password reset, no MFA — auth is intentionally simple.

---

## Certificates

Each certificate gets:

- A unique certificate number
- ECDSA secp256k1 signature (stable keypair stored in env)
- SHA-256 content hash
- PDF with embedded QR code linking to public verification page
- Optional blockchain anchor (tx hash stored on certificate record)

Public verification: `GET /api/certificates/verify/:certNumber`

---

## Deployment

The project is configured for **Railway** deployment with `railway.toml` in each app directory.

For Judge0: Railway blocks privileged Docker containers, so run Judge0 locally and expose it via ngrok:

```bash
# Start Judge0 locally
pnpm docker:up

# Expose via ngrok
ngrok http 2358

# Set on Railway
JUDGE0_URL=https://xxxx.ngrok.io
```

---

## Commit Convention

Conventional Commits enforced by commitlint + husky:

```
feat(scope): description
fix(scope): description
chore(scope): description
refactor(scope): description
```

---

**Built for final year project — VeriHire**
