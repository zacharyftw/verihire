# VeriHire — Project Progress Report

**Date:** March 13, 2026
**Project:** VeriHire — Skill Verification Platform for Technical Hiring

---

## What Is VeriHire?

VeriHire is a web platform that helps companies verify whether a job candidate actually has the programming skills they claim. Instead of relying on resumes or manual interviews alone, candidates complete real coding challenges on the platform. Their code is automatically evaluated, and if they pass, they receive a tamper-proof digital certificate that recruiters can verify.

---

## Overall Progress

The project is **feature-complete at the core level**. Both the backend (server) and frontend (website) have been built and connected. The main flows a user would go through — registering, taking a challenge, getting evaluated, receiving a certificate — are all implemented.

---

## What Has Been Built

### 1. User Authentication

- Candidates and recruiters can register and log in with email/password
- Sign-in with **Google** and **GitHub** is also supported (OAuth)
- Password reset and email verification flows are in place
- Sessions are secured with JWT tokens

### 2. Candidate Side (the person being evaluated)

- **Dashboard** — overview of challenges taken, scores, and certificates earned
- **Challenges** — browse and attempt coding challenges across multiple difficulty levels
- **Code Editor** — an in-browser code editor (Monaco, the same editor used in VS Code) supporting 15+ programming languages
- **Submissions** — view past submissions and their detailed results
- **Certificates** — view and share earned certificates; each has a public verification page so recruiters can confirm it's real
- **Peer Reviews** — candidates can also review each other's submissions as part of skill verification

### 3. Recruiter Side (the company looking to hire)

- **Dashboard** — overview of active job postings and candidates in the pipeline
- **Jobs** — create and manage job postings with required skills and filters
- **Candidate Search** — browse candidates filtered by verified skills and scores
- **Shortlist / Kanban Board** — move candidates through hiring stages (Shortlisted → Screening → Interview → Offer → Hired)
- **AI Candidate Matching** — suggests which candidates best match a given job based on their verified scores
- **Company Profile** — set up and manage the company's page

### 4. The Evaluation Pipeline (core feature)

This is the most technically significant part of the project. When a candidate submits code:

1. An AI model (Llama 3.3, running via Groq's API) reads the challenge description and automatically **generates test cases** — different inputs to check if the code works correctly
2. If the challenge has a reference (model) solution, that solution is run first to produce the correct expected outputs, so the test cases are accurate
3. The candidate's code is then sent to **Judge0** — an open-source sandboxed code execution engine — which runs the code safely in isolation against all test cases
4. Results are collected: how many tests passed, execution time, memory used
5. The AI model then generates **written feedback** explaining what the candidate did well and what could be improved
6. A final score is calculated: 60% based on test accuracy, 40% based on code quality

### 5. Certificates & Blockchain

- Candidates who score ≥ 70 receive a digitally signed certificate
- Each certificate has a unique verification URL that anyone can check
- Certificate hashes are optionally recorded on the **Polygon blockchain** (a public, low-cost Ethereum-compatible network), making them permanently verifiable and tamper-proof even if VeriHire's own servers went down

### 6. Supporting Infrastructure

- Background job queues handle slow tasks (sending emails, generating certificate PDFs) without slowing down the website
- File storage (MinIO, an S3-compatible system) stores uploaded files and certificate PDFs
- Email notifications are sent for key events (welcome, review assignments, results)
- All services run locally via Docker Compose for development

---

## Tech Stack Summary

| Layer          | Technology                                     |
| -------------- | ---------------------------------------------- |
| Backend API    | NestJS (Node.js / TypeScript)                  |
| Frontend       | Next.js 14 with React                          |
| Database       | PostgreSQL (via Prisma ORM)                    |
| Code Execution | Judge0 CE (self-hosted sandbox)                |
| AI / LLM       | Groq API — Llama 3.3 70B                       |
| Blockchain     | Polygon Amoy testnet (Solidity smart contract) |
| Auth           | JWT + Passport (Google & GitHub OAuth)         |
| Queue / Cache  | Redis + Bull                                   |
| File Storage   | MinIO (S3-compatible)                          |

---

## What Is Still Pending

The code is written and the system is assembled. What remains is **testing and verification** — the platform has not yet been run end-to-end in a live environment.

| Item                                                  | Status                                |
| ----------------------------------------------------- | ------------------------------------- |
| End-to-end evaluation test (submit code → get score)  | Not yet verified live                 |
| OAuth login test (Google/GitHub buttons)              | Implemented, not tested live          |
| Full candidate flow test (login → challenge → result) | Not yet verified live                 |
| Production deployment configuration                   | Not started                           |
| CI/CD pipeline                                        | Skeleton exists, not fully configured |

---

## Summary

The project has gone from initial setup to a fully structured, feature-rich application with a working backend, a complete frontend, and a novel automated evaluation pipeline powered by an LLM and a sandboxed code execution engine. The remaining work is primarily integration testing and deployment preparation — the hardest and most interesting parts of the build are done.
