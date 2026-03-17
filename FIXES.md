# VeriHire — Fixes & Roadmap

Prioritized list of fixes to align the platform with the domain-level certification vision.

The core vision: candidates prove domain expertise (Python, React, Infra, etc.) across multiple challenges and earn a single domain certificate — not individual challenge certificates.

---

## 0. LLM Evaluator for DESIGN/WRITTEN/MIXED Challenges

**Status:** Not implemented
**Priority:** Critical — without this, half the generated challenges score 0

**Problem:** Judge0 only runs code. DESIGN, WRITTEN, and MIXED challenges have `solutionLanguage: "plaintext"` and no evaluation pipeline. Candidates submit text answers that get auto-scored to 0.

**Fix:** Branch evaluation logic on challenge type:

- `CODING` → Judge0 execution + LLM quality review (existing)
- `DESIGN / WRITTEN` → LLM-only evaluation (send candidate answer + reference solution + rubric to Groq)
- `MIXED` → Judge0 for code portion + LLM for explanation portion

LLM scoring criteria for text-based answers:

1. Completeness (0-20)
2. Technical accuracy (0-20)
3. Depth of analysis (0-20)
4. Practicality (0-20)
5. Communication clarity (0-20)

Total: 0-100, same scale as coding challenges.

---

## 1. Link Generated Challenges to Candidate + Domain

**Status:** Not implemented
**Priority:** Critical — foundation for domain scoring

**Problem:** Resume-generated challenges are dumped into the global challenge pool. No tracking of "these challenges were generated FOR this candidate" or "these challenges assess Python specifically".

**Fix:**

- Add `generatedForCandidateId` column on `Challenge` model
- Add `domainTag` column on `Challenge` (e.g., "Python", "React", "Infrastructure")
- When generating from resume, set both fields
- Challenges remain visible to all candidates but are tagged for tracking
- Dashboard shows "Personalized for You" section
- Prevents duplicate generation on re-upload (check existing challenges for this candidate)

---

## 2. Domain Score Aggregation

**Status:** Not implemented
**Priority:** Critical — this is the core value proposition

**Problem:** No concept of "your Python score is 78%". Each challenge has its own isolated score. Nothing rolls up into a domain-level metric.

**Fix:** After every evaluation, recalculate the candidate's domain score:

```
domainScore = Σ(challengeScore × difficultyWeight) / Σ(difficultyWeight)
```

Store on `CandidateSkill.domainScore` (new field).

Recalculate on every new evaluation in that domain. This is the single number that represents domain expertise.

---

## 3. Difficulty Weighting in Domain Score

**Status:** Not implemented
**Priority:** Critical — without this, BEGINNER and EXPERT carry equal weight

**Problem:** Getting 90% on a BEGINNER challenge is treated the same as 90% on an EXPERT challenge. This makes the domain score meaningless.

**Fix:** Apply difficulty multipliers in domain score aggregation:

| Difficulty   | Weight |
| ------------ | ------ |
| BEGINNER     | 1      |
| INTERMEDIATE | 2      |
| ADVANCED     | 3      |
| EXPERT       | 4      |

Example: 80% on BEGINNER + 70% on ADVANCED = (80×1 + 70×3) / (1+3) = 72.5

The ADVANCED challenge dominates — which is correct. Harder challenges prove more.

---

## 4. Replace Per-Challenge Certificates with Domain Certificates

**Status:** Current system is per-challenge (wrong for vision)
**Priority:** Critical — this is the visible output

**Problem:** Currently: pass 1 challenge → get 1 certificate. Nobody cares you passed "FizzBuzz". They care you're a verified Advanced Python developer.

**Fix:** New domain certificate system:

**Issuance criteria:**

- Completed ≥ 3 challenges in the domain
- Domain score ≥ 70%
- Attempted at least 1 INTERMEDIATE or above challenge

**Certificate contains:**

- Domain name (e.g., "Python", "Frontend Development")
- Level (Entry / Junior / Mid / Senior / Expert)
- Aggregate domain score
- Number of challenges completed
- ECDSA signature + blockchain anchor (existing infra)

**Format:** "Certified Python Developer — Advanced (Score: 82%, 6 challenges)"

Per-challenge results become data points, not certificates. Scrap the current per-challenge certificate issuance.

---

## 5. Fix Skill Level Mapping

**Status:** Broken — ignores difficulty
**Priority:** High

**Problem:** Getting A- on a BEGINNER challenge → "ADVANCED" skill level. Getting A- on an EXPERT challenge → same "ADVANCED". Makes no sense.

**Fix:** Derive level from domain score + max difficulty attempted:

```
if domainScore ≥ 85 AND maxDifficulty ≥ ADVANCED  → EXPERT
if domainScore ≥ 70 AND maxDifficulty ≥ INTERMEDIATE → ADVANCED
if domainScore ≥ 60 AND maxDifficulty ≥ BEGINNER → INTERMEDIATE
else → BEGINNER
```

You cannot be EXPERT without having attempted ADVANCED+ challenges. Score alone is not enough — you need to prove it at the right difficulty level.

---

## 6. Fix Frontend `finalScore` NULL Issue

**Status:** Bug
**Priority:** High

**Problem:** Frontend submissions page shows `finalScore` which is NULL until peer review completes. Candidates see no score after evaluation.

**Fix:** Use `aiScore` as the display score immediately after evaluation. If peer review exists later, show updated `finalScore`. Never show blank/null.

---

## 7. Add LLM Evaluation Fallback When Judge0 is Down

**Status:** Not implemented
**Priority:** Medium

**Problem:** If Judge0 is unreachable (ngrok not running in production), the entire evaluation fails silently. Candidate submits code and nothing happens.

**Fix:** If Judge0 times out or returns error, fall back to LLM-only evaluation:

- Send code + test cases + reference solution to LLM
- LLM scores correctness by reading the code (not executing)
- Mark evaluation with `confidence: 0.5` (lower than execution-based `0.85`)
- Show candidate: "Evaluated via AI review (code execution unavailable)"

---

## 8. Fix Cached Test Cases — Add Invalidation

**Status:** Bug
**Priority:** Medium

**Problem:** When test cases are generated and validated against a reference solution, they're cached on the challenge forever. If the reference solution was wrong, every future candidate is graded against bad answers. No invalidation mechanism.

**Fix:**

- When `challenge.referenceSolution` is updated, set `cachedTestCases = null`
- Add a `testCasesCachedAt` timestamp
- Optionally: invalidate cache after 30 days (re-generate fresh test cases)

---

## 9. Domain Progress Tracking on Frontend

**Status:** Not implemented
**Priority:** Medium

**Problem:** No way for candidates to see their progress toward domain certification. No progress bar, no "next challenge" guidance.

**Fix:** Dashboard shows per-domain card:

```
Python
████████░░ 4/6 challenges completed
Domain Score: 72% → INTERMEDIATE
Next: "Implement a Graph Traversal" (ADVANCED)
```

Shows: progress bar, current domain score, current level, recommended next challenge.

---

## 10. Adaptive Challenge Recommendation

**Status:** Not implemented
**Priority:** Medium

**Problem:** Candidates have no guidance on which challenge to do next. No progression logic.

**Fix:** After each evaluation:

- Scored ≥ 80% → recommend same domain, +1 difficulty level
- Scored 60-79% → recommend same domain, same difficulty, different topic
- Scored < 60% → recommend same domain, -1 difficulty level or different domain

Show recommendation on dashboard and after results page.

---

## 11. Connect Domain Scores to Recruiter Job Matching

**Status:** Not implemented
**Priority:** Medium

**Problem:** Recruiter posts a job requiring "Advanced Python" but can't filter candidates by verified domain scores. The hiring pipeline is completely disconnected from the assessment pipeline.

**Fix:**

- Job model gets: `requiredSkills` with minimum level + minimum score
- Matching: check candidate's `CandidateSkill.domainScore` against job requirements
- `matchPercentage = (matched requirements / total requirements) × 100`
- Recruiter candidate search filters by verified domain scores
- Candidate profile shows: "Certified React Developer — Advanced (82%)" to recruiters

---

## 12. Wire Up or Remove Peer Review

**Status:** Built but disconnected
**Priority:** Low

**Problem:** Full peer review system exists (models, services, controllers) but certificates are issued instantly on AI score. Peer review comes later but can't revoke. It's built but does nothing useful.

**Fix (Option A — Simplify):** Keep peer review as optional. Don't gate certificates on it. Domain score uses AI score by default. If peer review exists, blend: `finalScore = aiScore × 0.7 + peerScore × 0.3`. Document peer review as "future enhancement" for the project report.

**Fix (Option B — Full integration):** Don't issue domain certificate immediately. Wait 48 hours for peer review OR issue immediately if no peer reviewers available. Use blended score for domain calculation.

Recommend Option A for now.

---

## 13. Remove or Repurpose `generateCandidateQuestions` Dead Code

**Status:** Dead code
**Priority:** Low

**Problem:** `ResumeAnalysisService.generateCandidateQuestions()` method exists but is never called anywhere in the codebase.

**Fix:** Either:

- **Repurpose:** Use it to generate WRITTEN challenge content (personalized interview questions from resume context)
- **Remove:** Delete the method. Dead code is worse than no code.

---

## 14. Improve Plagiarism Detection

**Status:** Weak implementation
**Priority:** Low

**Problem:** Current system uses 5-character n-grams on normalized code with Jaccard similarity ≥ 85% threshold. Trivially beatable by renaming variables or adding comments.

**Fix:**

- Increase n-gram size to 10+ characters
- Lower similarity threshold to 70%
- Or use AST-based comparison (parse code into abstract syntax tree, compare structure not text)
- Compare against ALL previous submissions, not just last 100
