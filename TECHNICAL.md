# VeriHire — Technical Overview for Project Report

---

## 1. Introduction

VeriHire is an AI-powered developer assessment and hiring platform developed as a final year project. The platform addresses a common problem in technical recruitment: the difficulty of objectively verifying a developer's skills. Traditional hiring processes rely heavily on self-reported CVs and subjective interviews, which are poor predictors of actual job performance.

VeriHire provides a structured, automated pipeline where candidates complete real coding challenges that are executed in a sandboxed environment and evaluated by a large language model. Candidates who meet the passing threshold receive a cryptographically signed, blockchain-anchored certificate that recruiters can independently verify. The platform also uses AI to analyse candidates' uploaded resumes, automatically determining their seniority level, years of experience, and technical domains — giving recruiters a richer, more reliable picture of each candidate.

---

## 2. System Architecture

VeriHire is built as a full-stack web application following a client-server architecture. The system is composed of two main applications — a frontend web application and a backend API — along with several external services.

```
┌─────────────────────────────────┐
│         Web Application         │
│     (Next.js — Candidate &      │
│       Recruiter Interfaces)     │
└────────────────┬────────────────┘
                 │ HTTP REST API
┌────────────────▼────────────────┐
│          Backend API            │
│    (NestJS — Business Logic,    │
│    Authentication, Evaluation)  │
└──────┬─────────────┬────────────┘
       │             │
┌──────▼──────┐  ┌───▼──────────────────────────┐
│  Database   │  │      External Services        │
│ (Supabase   │  │  • Groq API (LLM)            │
│ PostgreSQL) │  │  • Judge0 CE (Code Execution) │
│             │  │  • Supabase Storage (Files)   │
└─────────────┘  │  • Polygon Blockchain (Certs) │
                 └──────────────────────────────┘
```

### Architectural Decisions

**Separation of concerns:** The frontend and backend are completely decoupled. The frontend communicates with the backend exclusively through a REST API using JSON Web Tokens (JWT) for authentication. This allows either layer to be modified or scaled independently.

**Monorepo structure:** The entire project is managed as a monorepo using Turborepo and pnpm workspaces. This means the frontend, backend, and shared packages all live in one repository, sharing common type definitions and utility code. This approach reduces duplication and ensures the frontend and backend always use consistent data models.

**External services over self-built:** Rather than building custom solutions for AI inference, code execution, or file storage, the system integrates with well-established external services. This reduces complexity and allows the project to focus on core platform logic.

---

## 3. Technology Stack

### Backend

| Technology                    | Purpose                     | Justification                                                                                                                                                                                       |
| ----------------------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **NestJS** (Node.js)          | Backend API framework       | Provides a structured, modular architecture with built-in support for dependency injection, guards, and middleware — well-suited for a platform with multiple user roles and complex business logic |
| **Prisma ORM**                | Database access layer       | Type-safe database queries with automatic TypeScript type generation from the schema, reducing the risk of runtime errors                                                                           |
| **PostgreSQL** (via Supabase) | Primary relational database | Mature, reliable relational database suitable for the structured, relational nature of the platform's data                                                                                          |
| **JWT**                       | Authentication              | Stateless token-based authentication allowing the API to remain scalable without server-side session storage                                                                                        |
| **passport.js**               | OAuth integration           | Industry-standard library for handling Google and GitHub OAuth flows                                                                                                                                |

### Frontend

| Technology                   | Purpose                   | Justification                                                                                                                          |
| ---------------------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **Next.js 14**               | Frontend framework        | React-based framework with App Router for file-based routing, server-side capabilities, and optimised performance                      |
| **shadcn/ui + Tailwind CSS** | UI components and styling | Component library built on accessible Radix UI primitives with utility-first CSS for rapid, consistent interface development           |
| **SWR**                      | Data fetching             | Lightweight library for client-side data fetching with automatic caching, revalidation, and loading states                             |
| **Monaco Editor**            | Code editor               | The same editor engine used in VS Code — provides syntax highlighting, auto-completion, and a familiar interface for coding challenges |
| **React Hook Form + Zod**    | Form management           | Efficient form state management with schema-based validation, reducing boilerplate code                                                |

### External Services

| Service                      | Purpose                            | Justification                                                                                                                                                        |
| ---------------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Groq API (Llama 3.3 70B)** | Large language model               | Used for test case generation, code evaluation feedback, and resume analysis. Groq provides fast inference for the Llama 3.3 70B model at no cost during development |
| **Judge0 CE**                | Sandboxed code execution           | Open-source code execution engine that safely runs untrusted code in isolated containers. Supports 60+ programming languages                                         |
| **Supabase**                 | PostgreSQL database + file storage | Provides managed PostgreSQL database and S3-compatible file storage in a single platform, simplifying infrastructure                                                 |
| **Polygon Blockchain**       | Certificate anchoring              | Anchors certificate hashes on the Polygon Amoy testnet, providing an immutable public record of issued certificates that cannot be tampered with                     |

---

## 4. System Modules

The backend is organised into 17 independent modules, each responsible for a specific domain of the application. This modular design follows the Single Responsibility Principle and makes the codebase maintainable and testable.

| Module              | Responsibility                                                                                       |
| ------------------- | ---------------------------------------------------------------------------------------------------- |
| **Authentication**  | User registration, login, OAuth (Google, GitHub), JWT token issuance and refresh, session management |
| **Users**           | Core user account management                                                                         |
| **Candidates**      | Candidate profile management, skill tracking, file uploads, resume AI analysis                       |
| **Recruiters**      | Recruiter profile management                                                                         |
| **Companies**       | Company profile creation and management                                                              |
| **Challenges**      | Coding challenge management — creation, templates, AI-assisted generation                            |
| **Submissions**     | Complete submission lifecycle from starting a challenge to final submission                          |
| **Evaluations**     | Orchestrates the full automated evaluation pipeline (see §6)                                         |
| **Code Execution**  | Wraps the Judge0 CE API to execute candidate code in isolation                                       |
| **Certificates**    | Certificate generation, cryptographic signing, PDF creation, and verification                        |
| **Skills**          | Skill taxonomy and categorisation system                                                             |
| **Jobs**            | Job posting management and candidate-job pipeline tracking                                           |
| **Reviews**         | Peer review system for human-in-the-loop evaluation quality                                          |
| **Storage**         | File upload and retrieval via Supabase S3-compatible storage                                         |
| **Blockchain**      | Certificate hash anchoring on Polygon blockchain                                                     |
| **Analytics**       | Platform usage metrics and recruiter hiring analytics                                                |
| **Resume Analysis** | PDF text extraction and AI-powered resume parsing                                                    |

---

## 5. Database Design

The database uses PostgreSQL and is designed around two primary user roles — candidates and recruiters — with supporting entities for the assessment and hiring workflows.

### Core Entities

**User** — The central entity representing any person on the platform. Contains authentication credentials, OAuth provider information, and links to either a candidate or recruiter profile depending on the user's role.

**CandidateProfile** — Extended profile for candidates. Stores professional information (headline, bio, location, experience), links (LinkedIn, GitHub, portfolio, resume), and AI-generated analysis fields from the resume parsing pipeline (seniority level, domains, years of experience).

**RecruiterProfile** — Profile for recruiters, linked to a Company.

**Company** — Represents an organisation on the platform. Recruiters belong to companies and post jobs on behalf of them.

**Skill / SkillCategory** — A hierarchical taxonomy of technical skills (e.g., Programming Languages → Python). Challenges, jobs, and candidate profiles all reference skills.

**Challenge** — A coding problem with a title, description, difficulty level, time limit, and optionally a reference solution and pre-validated test cases.

**Submission** — Records a candidate's attempt at a challenge. Tracks the submitted code, programming language chosen, time taken, and progresses through a status lifecycle: `IN_PROGRESS → SUBMITTED → EVALUATING → EVALUATED`.

**Evaluation** — Stores the results of automated evaluation: individual test case results, overall score, code quality score, LLM-generated feedback, and improvement suggestions.

**Certificate** — Issued when a candidate's submission meets the passing threshold. Contains a unique certificate number, SHA-256 content hash, ECDSA digital signature, and optional blockchain transaction ID.

**Job** — A job posting created by a recruiter. Has requirements, salary range, required skills, and a status lifecycle (Draft → Active → Closed).

**Shortlist** — Tracks a candidate's progression through a recruiter's hiring pipeline for a specific job, with stages from `SHORTLISTED` through `SCREENING`, `INTERVIEW`, `ASSESSMENT`, `OFFER`, to `HIRED` or `REJECTED`.

### Entity Relationships

```
User ──────── CandidateProfile ─── Submission ─── Evaluation
         │                     │
         │                     └── Certificate
         │
         └── RecruiterProfile ─── Company
                              └── Job ─── Shortlist ─── CandidateProfile

Challenge ─── Skill ─── CandidateSkill ─── CandidateProfile
```

---

## 6. Key Feature: Automated Evaluation Pipeline

The automated evaluation pipeline is the core technical contribution of the platform. When a candidate submits code for a challenge, the following process is executed automatically:

**Step 1 — Test Case Generation**
If the challenge does not have pre-defined test cases, the system sends the challenge title and description to the Groq LLM (Llama 3.3 70B). The model generates a set of test cases, each specifying an input and an expected output. These are cached on the challenge for future submissions.

**Step 2 — Reference Validation (if applicable)**
If the challenge has a reference solution (a correct implementation provided by the challenge creator), it is executed first through Judge0 to obtain ground-truth expected outputs. This overrides the LLM-generated expected outputs, improving accuracy.

**Step 3 — Sandboxed Code Execution**
The candidate's code is submitted to Judge0 CE, which executes it in an isolated container with strict resource limits (CPU time, memory). The code is run against each test case, and actual outputs are collected.

**Step 4 — Scoring**
The system calculates a test accuracy score (percentage of test cases passed) and uses the LLM to estimate a code quality score based on readability, structure, and best practices. The final score is computed as:

> **Final Score = (Test Accuracy × 60%) + (Code Quality × 40%)**

**Step 5 — Feedback Generation**
The LLM generates human-readable feedback explaining the results, identifying specific failures, and providing improvement suggestions.

**Step 6 — Certificate Issuance**
If the final score meets or exceeds the skill's passing threshold, a certificate is automatically generated (see §7).

---

## 7. Key Feature: Certificate System

Certificates serve as verifiable proof of a candidate's demonstrated skill. Each certificate is:

- Assigned a unique certificate number in the format `VH-{YEAR}-{SKILLCODE}-{SEQUENCE}` (e.g., `VH-2026-PYTH-00042`)
- Hashed using SHA-256 to produce a tamper-evident content fingerprint
- Digitally signed using ECDSA with a secp256k1 private key, the same cryptographic standard used in blockchain systems
- Stored as a downloadable PDF with an embedded QR code linking to a public verification page
- Anchored on the Polygon Amoy blockchain — the certificate hash is written to a smart contract, creating an immutable public record

Anyone can verify a certificate at `/verify/{certificateNumber}` without needing an account, providing transparent and independent verification for recruiters and employers.

---

## 8. Key Feature: AI Resume Analysis

When a candidate uploads their resume as a PDF, the system automatically analyses it using AI:

1. **Text Extraction** — The PDF is parsed to extract raw text content
2. **Structured Extraction** — The text is sent to Groq/Llama 3.3, which extracts: the full work history with job titles, companies, and dates; the technical domains and technologies the candidate has worked with; and an initial seniority assessment
3. **Experience Calculation** — The system calculates total years of professional experience in code, correctly handling overlapping jobs (e.g., freelance work concurrent with full-time employment)
4. **Seniority Classification** — Seniority is determined primarily from calculated years of experience, with the LLM's assessment used as a secondary signal to account for factors like scope of responsibility

| Years of Experience | Seniority Level   |
| ------------------- | ----------------- |
| Less than 1 year    | Entry             |
| 1 – 3 years         | Junior            |
| 3 – 6 years         | Mid               |
| 6 – 10 years        | Senior            |
| 10+ years           | Staff / Principal |

The results (seniority level, detected domains, years of experience) are stored on the candidate's profile and visible to recruiters, giving them an AI-derived baseline before reviewing a candidate.

For mid-level candidates and above, the system can also generate tailored interview questions and a take-home assignment based on the candidate's background and the specific challenge domain.

---

## 9. User Roles and Access Control

The platform supports three user roles, each with a different set of permissions and interface:

**Candidate**

- Registers, completes a profile, and uploads a resume
- Browses and takes coding challenges
- Views their evaluation results and feedback
- Downloads and shares earned certificates
- Participates in peer reviews of other submissions

**Recruiter**

- Registers, creates a company profile, and posts job openings
- Searches for candidates using filters (skills, experience, location)
- Views candidate profiles including AI resume analysis and verified certificates
- Manages candidates through a hiring pipeline (shortlisting, interview, offer, etc.)
- Views analytics on their job postings and hiring activity

**Admin**

- Has access to all platform data
- Can trigger or re-run evaluations
- Can revoke or reinstate certificates
- Monitors platform-wide statistics

Access control is enforced at the API level using role-based guards. Every protected endpoint verifies both a valid JWT token and the required role before processing the request.

---

## 10. Authentication

The platform supports two authentication methods:

**Email and Password** — Standard registration and login with passwords hashed using bcrypt before storage. No plain-text passwords are ever stored.

**OAuth (Social Login)** — Candidates and recruiters can sign in with Google or GitHub. On first login, an account is automatically created. On subsequent logins, the existing account is retrieved and a new session is created.

Both methods issue a pair of tokens upon successful authentication:

- An **access token** (valid for 15 minutes) sent with every API request
- A **refresh token** (valid for 7 days) used to obtain a new access token without re-login

Token rotation is implemented — when a refresh token is used, it is immediately revoked and a new pair is issued, preventing replay attacks.

---

## 11. Security Considerations

| Concern               | Approach                                                                           |
| --------------------- | ---------------------------------------------------------------------------------- |
| Password storage      | bcrypt hashing with a cost factor of 12                                            |
| Authentication        | JWT with short-lived access tokens and rotating refresh tokens                     |
| Code execution        | All candidate code runs in Judge0's isolated containers with CPU and memory limits |
| Certificate integrity | SHA-256 hashing + ECDSA digital signatures + blockchain anchoring                  |
| API input validation  | All incoming data is validated and sanitised before processing                     |
| Rate limiting         | Three-tier rate limiting applied globally to prevent abuse                         |
| Role enforcement      | Every protected endpoint checks both authentication and role                       |
| Secrets management    | All sensitive keys stored in environment variables, never in source code           |

---

## 12. System Interfaces

### Candidate Interface

| Page                 | Functionality                                                             |
| -------------------- | ------------------------------------------------------------------------- |
| Dashboard            | Overview of statistics, active challenges, and recent certificates        |
| Challenges           | Browse and filter available coding challenges by skill and difficulty     |
| Challenge Submission | Monaco code editor with syntax highlighting, timer, and language selector |
| Results              | Detailed breakdown of score, test case results, and AI feedback           |
| Certificates         | List of earned certificates with download and sharing options             |
| Profile              | Edit professional information, upload resume, manage skills               |
| Reviews              | Queue of pending peer reviews to complete                                 |

### Recruiter Interface

| Page                 | Functionality                                                            |
| -------------------- | ------------------------------------------------------------------------ |
| Dashboard            | Analytics on hiring activity, shortlists, and job performance            |
| Candidate Search     | Filter candidates by skill, experience level, location, and availability |
| Candidate Profile    | View verified skills, certificates, AI resume analysis, and portfolio    |
| Jobs                 | Create, edit, and manage job postings with required skill specifications |
| Shortlist / Pipeline | Kanban-style board for managing candidates through hiring stages         |
| Matched Candidates   | AI-suggested candidates ranked by skill overlap with job requirements    |

---

## 13. Summary

VeriHire demonstrates the integration of multiple modern technologies to solve a real-world problem in technical recruitment. The platform's key technical contributions are:

1. An **automated evaluation pipeline** combining LLM-based test case generation with sandboxed code execution, providing objective and consistent skill assessment
2. A **cryptographically secured certificate system** with ECDSA signing and blockchain anchoring, enabling independently verifiable credentials
3. An **AI resume analysis pipeline** that extracts structured insights from unstructured resume documents, classifying candidates by seniority and technical domain
4. A **role-based hiring platform** connecting the candidate assessment workflow to a full recruiter-facing hiring pipeline

The system is built on a modern, production-ready technology stack and follows established software engineering principles including separation of concerns, modular design, and layered security.
