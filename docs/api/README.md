# API Specifications

## Overview

VeriHire provides a RESTful API with OpenAPI 3.0 specification. All endpoints use JSON for request/response bodies and JWT for authentication.

---

## Base Configuration

```yaml
openapi: 3.0.3
info:
  title: VeriHire API
  version: 1.0.0
  description: AI-Powered Skill Certification and Hiring Platform

servers:
  - url: https://api.verihire.com/v1
    description: Production
  - url: https://api.staging.verihire.com/v1
    description: Staging
  - url: http://localhost:3000/v1
    description: Development

security:
  - bearerAuth: []

components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
```

---

## Authentication Endpoints

### Register User

```yaml
POST /auth/register
tags: [Authentication]
security: []

requestBody:
  content:
    application/json:
      schema:
        type: object
        required: [email, password, userType]
        properties:
          email:
            type: string
            format: email
          password:
            type: string
            minLength: 8
          userType:
            type: string
            enum: [candidate, recruiter]
          firstName:
            type: string
          lastName:
            type: string

responses:
  201:
    description: User registered successfully
    content:
      application/json:
        schema:
          type: object
          properties:
            userId:
              type: string
              format: uuid
            message:
              type: string
  400:
    description: Validation error
  409:
    description: Email already exists
```

### Login

```yaml
POST /auth/login
tags: [Authentication]
security: []

requestBody:
  content:
    application/json:
      schema:
        type: object
        required: [email, password]
        properties:
          email:
            type: string
            format: email
          password:
            type: string
          mfaCode:
            type: string
          rememberMe:
            type: boolean
            default: false

responses:
  200:
    description: Login successful
    content:
      application/json:
        schema:
          type: object
          properties:
            accessToken:
              type: string
            refreshToken:
              type: string
            expiresIn:
              type: integer
            user:
              $ref: '#/components/schemas/User'
  202:
    description: MFA required
    content:
      application/json:
        schema:
          type: object
          properties:
            requiresMfa:
              type: boolean
            mfaToken:
              type: string
            mfaMethods:
              type: array
              items:
                type: string
  401:
    description: Invalid credentials
```

### Refresh Token

```yaml
POST /auth/refresh
tags: [Authentication]
security: []

requestBody:
  content:
    application/json:
      schema:
        type: object
        required: [refreshToken]
        properties:
          refreshToken:
            type: string

responses:
  200:
    description: Tokens refreshed
    content:
      application/json:
        schema:
          type: object
          properties:
            accessToken:
              type: string
            refreshToken:
              type: string
            expiresIn:
              type: integer
  401:
    description: Invalid or expired refresh token
```

---

## Candidate Endpoints

### Get Profile

```yaml
GET /candidates/me
tags: [Candidates]

responses:
  200:
    description: Candidate profile
    content:
      application/json:
        schema:
          $ref: '#/components/schemas/CandidateProfile'
```

### Update Profile

```yaml
PATCH /candidates/me
tags: [Candidates]

requestBody:
  content:
    application/json:
      schema:
        type: object
        properties:
          headline:
            type: string
            maxLength: 255
          bio:
            type: string
          yearsExperience:
            type: integer
          currentRole:
            type: string
          linkedinUrl:
            type: string
            format: uri
          githubUrl:
            type: string
            format: uri
          portfolioUrl:
            type: string
            format: uri
          jobSearchStatus:
            type: string
            enum: [active, open, not_looking]

responses:
  200:
    description: Profile updated
    content:
      application/json:
        schema:
          $ref: '#/components/schemas/CandidateProfile'
```

### Get Verified Skills

```yaml
GET /candidates/me/skills
tags: [Candidates]

responses:
  200:
    description: List of verified skills
    content:
      application/json:
        schema:
          type: object
          properties:
            skills:
              type: array
              items:
                $ref: '#/components/schemas/VerifiedSkill'
            total:
              type: integer
```

### Get Public Portfolio

```yaml
GET /portfolio/{slug}
tags: [Candidates]
security: []

parameters:
  - name: slug
    in: path
    required: true
    schema:
      type: string

responses:
  200:
    description: Public portfolio
    content:
      application/json:
        schema:
          $ref: '#/components/schemas/PublicPortfolio'
  404:
    description: Portfolio not found
```

---

## Challenge Endpoints

### List Challenges

```yaml
GET /challenges
tags: [Challenges]

parameters:
  - name: skillId
    in: query
    schema:
      type: string
      format: uuid
  - name: difficulty
    in: query
    schema:
      type: string
      enum: [beginner, intermediate, advanced, expert]
  - name: type
    in: query
    schema:
      type: string
      enum: [coding, design, written]
  - name: page
    in: query
    schema:
      type: integer
      default: 1
  - name: limit
    in: query
    schema:
      type: integer
      default: 20

responses:
  200:
    description: List of available challenges
    content:
      application/json:
        schema:
          type: object
          properties:
            challenges:
              type: array
              items:
                $ref: '#/components/schemas/ChallengeSummary'
            total:
              type: integer
            page:
              type: integer
            limit:
              type: integer
```

### Generate Challenge

```yaml
POST /challenges/generate
tags: [Challenges]

requestBody:
  content:
    application/json:
      schema:
        type: object
        required: [skillId, difficulty]
        properties:
          skillId:
            type: string
            format: uuid
          difficulty:
            type: string
            enum: [beginner, intermediate, advanced, expert]
          jobContextId:
            type: string
            format: uuid
            description: Optional job context for tailored challenges

responses:
  201:
    description: Challenge generated
    content:
      application/json:
        schema:
          $ref: '#/components/schemas/Challenge'
```

### Start Challenge

```yaml
POST /challenges/{challengeId}/start
tags: [Challenges]

parameters:
  - name: challengeId
    in: path
    required: true
    schema:
      type: string
      format: uuid

responses:
  200:
    description: Challenge started
    content:
      application/json:
        schema:
          type: object
          properties:
            submissionId:
              type: string
              format: uuid
            challenge:
              $ref: '#/components/schemas/Challenge'
            startedAt:
              type: string
              format: date-time
            expiresAt:
              type: string
              format: date-time
  409:
    description: Challenge already in progress
```

### Submit Solution

```yaml
POST /submissions/{submissionId}/submit
tags: [Submissions]

parameters:
  - name: submissionId
    in: path
    required: true
    schema:
      type: string
      format: uuid

requestBody:
  content:
    application/json:
      schema:
        type: object
        required: [content]
        properties:
          content:
            type: string
            description: Code, text, or design submission
          language:
            type: string
            description: Programming language (for coding)

responses:
  200:
    description: Submission received
    content:
      application/json:
        schema:
          type: object
          properties:
            submissionId:
              type: string
              format: uuid
            status:
              type: string
              enum: [submitted, evaluating]
            submittedAt:
              type: string
              format: date-time
  400:
    description: Invalid submission
  408:
    description: Challenge time expired
```

### Get Evaluation Status

```yaml
GET /submissions/{submissionId}/evaluation
tags: [Submissions]

parameters:
  - name: submissionId
    in: path
    required: true
    schema:
      type: string
      format: uuid

responses:
  200:
    description: Evaluation result
    content:
      application/json:
        schema:
          type: object
          properties:
            status:
              type: string
              enum: [pending, processing, completed, failed]
            progress:
              type: number
              minimum: 0
              maximum: 100
            result:
              $ref: '#/components/schemas/EvaluationResult'
```

---

## Review Endpoints

### Get Pending Reviews

```yaml
GET /reviews/pending
tags: [Reviews]

responses:
  200:
    description: List of pending review assignments
    content:
      application/json:
        schema:
          type: object
          properties:
            reviews:
              type: array
              items:
                $ref: '#/components/schemas/ReviewAssignment'
            total:
              type: integer
```

### Submit Review

```yaml
POST /reviews/{reviewId}/submit
tags: [Reviews]

parameters:
  - name: reviewId
    in: path
    required: true
    schema:
      type: string
      format: uuid

requestBody:
  content:
    application/json:
      schema:
        type: object
        required: [criteriaScores, overallScore, strengths, areasForImprovement]
        properties:
          criteriaScores:
            type: array
            items:
              type: object
              properties:
                criterionId:
                  type: string
                score:
                  type: number
                  minimum: 0
                  maximum: 100
                justification:
                  type: string
                  minLength: 20
          overallScore:
            type: number
            minimum: 0
            maximum: 100
          strengths:
            type: string
            minLength: 50
          areasForImprovement:
            type: string
            minLength: 50
          suggestions:
            type: string
          confidenceLevel:
            type: string
            enum: [low, medium, high]

responses:
  200:
    description: Review submitted
    content:
      application/json:
        schema:
          type: object
          properties:
            reviewId:
              type: string
              format: uuid
            qualityScore:
              type: number
            reputationDelta:
              type: number
```

---

## Certificate Endpoints

### Get My Certificates

```yaml
GET /certificates
tags: [Certificates]

responses:
  200:
    description: List of certificates
    content:
      application/json:
        schema:
          type: object
          properties:
            certificates:
              type: array
              items:
                $ref: '#/components/schemas/Certificate'
            total:
              type: integer
```

### Get Certificate

```yaml
GET /certificates/{certificateNumber}
tags: [Certificates]
security: []

parameters:
  - name: certificateNumber
    in: path
    required: true
    schema:
      type: string

responses:
  200:
    description: Certificate details
    content:
      application/json:
        schema:
          $ref: '#/components/schemas/Certificate'
  404:
    description: Certificate not found
```

### Verify Certificate

```yaml
GET /certificates/verify/{certificateNumber}
tags: [Certificates]
security: []

parameters:
  - name: certificateNumber
    in: path
    required: true
    schema:
      type: string

responses:
  200:
    description: Verification result
    content:
      application/json:
        schema:
          type: object
          properties:
            valid:
              type: boolean
            certificate:
              $ref: '#/components/schemas/CertificatePublic'
            verificationSteps:
              type: array
              items:
                type: object
                properties:
                  name:
                    type: string
                  passed:
                    type: boolean
                  details:
                    type: string
            verifiedAt:
              type: string
              format: date-time
```

### Download Certificate

```yaml
GET /certificates/{certificateId}/download
tags: [Certificates]

parameters:
  - name: certificateId
    in: path
    required: true
    schema:
      type: string
      format: uuid
  - name: format
    in: query
    schema:
      type: string
      enum: [pdf, json, image]
      default: pdf

responses:
  200:
    description: Certificate file
    content:
      application/pdf:
        schema:
          type: string
          format: binary
      application/json:
        schema:
          $ref: '#/components/schemas/Certificate'
      image/png:
        schema:
          type: string
          format: binary
```

---

## Recruiter Endpoints

### Search Candidates

```yaml
POST /recruiter/candidates/search
tags: [Recruiter]

requestBody:
  content:
    application/json:
      schema:
        type: object
        properties:
          skills:
            type: array
            items:
              type: object
              properties:
                name:
                  type: string
                minScore:
                  type: number
                required:
                  type: boolean
          keywords:
            type: string
          location:
            type: object
            properties:
              lat:
                type: number
              lon:
                type: number
              radiusKm:
                type: number
          minExperience:
            type: integer
          page:
            type: integer
            default: 1
          pageSize:
            type: integer
            default: 20
          sortBy:
            type: string
            enum: [relevance, score, experience]

responses:
  200:
    description: Search results
    content:
      application/json:
        schema:
          type: object
          properties:
            candidates:
              type: array
              items:
                $ref: '#/components/schemas/CandidateSearchResult'
            total:
              type: integer
            page:
              type: integer
            pageSize:
              type: integer
```

### Create Job

```yaml
POST /recruiter/jobs
tags: [Recruiter]

requestBody:
  content:
    application/json:
      schema:
        type: object
        required: [title, description, requiredSkills]
        properties:
          title:
            type: string
          description:
            type: string
          requirements:
            type: string
          requiredSkills:
            type: array
            items:
              type: object
              properties:
                skillId:
                  type: string
                  format: uuid
                minScore:
                  type: number
                  default: 60
                weight:
                  type: number
                  default: 1
          locationCity:
            type: string
          locationCountry:
            type: string
          remotePolicy:
            type: string
            enum: [remote, hybrid, onsite]
          salaryMin:
            type: integer
          salaryMax:
            type: integer
          employmentType:
            type: string
            enum: [full_time, part_time, contract, internship]

responses:
  201:
    description: Job created
    content:
      application/json:
        schema:
          $ref: '#/components/schemas/Job'
```

### Add to Shortlist

```yaml
POST /recruiter/shortlists
tags: [Recruiter]

requestBody:
  content:
    application/json:
      schema:
        type: object
        required: [jobId, candidateId]
        properties:
          jobId:
            type: string
            format: uuid
          candidateId:
            type: string
            format: uuid
          notes:
            type: string

responses:
  201:
    description: Added to shortlist
    content:
      application/json:
        schema:
          $ref: '#/components/schemas/ShortlistEntry'
```

### Get Dashboard

```yaml
GET /recruiter/dashboard
tags: [Recruiter]

parameters:
  - name: startDate
    in: query
    schema:
      type: string
      format: date
  - name: endDate
    in: query
    schema:
      type: string
      format: date

responses:
  200:
    description: Dashboard data
    content:
      application/json:
        schema:
          $ref: '#/components/schemas/RecruiterDashboard'
```

---

## Skills Endpoints

### List Skills

```yaml
GET /skills
tags: [Skills]
security: []

parameters:
  - name: categoryId
    in: query
    schema:
      type: string
      format: uuid
  - name: search
    in: query
    schema:
      type: string

responses:
  200:
    description: List of skills
    content:
      application/json:
        schema:
          type: object
          properties:
            skills:
              type: array
              items:
                $ref: '#/components/schemas/Skill'
            total:
              type: integer
```

### List Skill Categories

```yaml
GET /skills/categories
tags: [Skills]
security: []

responses:
  200:
    description: Skill category tree
    content:
      application/json:
        schema:
          type: object
          properties:
            categories:
              type: array
              items:
                $ref: '#/components/schemas/SkillCategory'
```

---

## Common Schemas

```yaml
components:
  schemas:
    User:
      type: object
      properties:
        id:
          type: string
          format: uuid
        email:
          type: string
          format: email
        firstName:
          type: string
        lastName:
          type: string
        userType:
          type: string
          enum: [candidate, recruiter, admin]
        avatarUrl:
          type: string
        mfaEnabled:
          type: boolean
        createdAt:
          type: string
          format: date-time

    CandidateProfile:
      type: object
      properties:
        id:
          type: string
          format: uuid
        userId:
          type: string
          format: uuid
        headline:
          type: string
        bio:
          type: string
        yearsExperience:
          type: integer
        currentRole:
          type: string
        locationCity:
          type: string
        locationCountry:
          type: string
        linkedinUrl:
          type: string
        githubUrl:
          type: string
        portfolioUrl:
          type: string
        jobSearchStatus:
          type: string
        totalChallengesCompleted:
          type: integer
        averageScore:
          type: number
        certificatesCount:
          type: integer
        reputationScore:
          type: number
        verifiedSkills:
          type: array
          items:
            $ref: '#/components/schemas/VerifiedSkill'

    VerifiedSkill:
      type: object
      properties:
        id:
          type: string
          format: uuid
        skillId:
          type: string
          format: uuid
        skillName:
          type: string
        score:
          type: number
        percentile:
          type: number
        level:
          type: string
          enum: [beginner, intermediate, advanced, expert]
        verifiedAt:
          type: string
          format: date-time
        certificateId:
          type: string
          format: uuid

    Challenge:
      type: object
      properties:
        id:
          type: string
          format: uuid
        skillId:
          type: string
          format: uuid
        title:
          type: string
        description:
          type: string
        difficulty:
          type: string
        type:
          type: string
        timeLimitMinutes:
          type: integer
        requirements:
          type: array
          items:
            type: string
        evaluationCriteria:
          type: array
          items:
            type: object
        starterCode:
          type: string

    EvaluationResult:
      type: object
      properties:
        overallScore:
          type: number
        percentile:
          type: number
        grade:
          type: string
        criteriaScores:
          type: array
          items:
            type: object
            properties:
              criterion:
                type: string
              score:
                type: number
              weight:
                type: number
        feedback:
          type: array
          items:
            type: string
        suggestions:
          type: array
          items:
            type: string

    Certificate:
      type: object
      properties:
        id:
          type: string
          format: uuid
        certificateNumber:
          type: string
        candidateName:
          type: string
        skillName:
          type: string
        skillLevel:
          type: string
        score:
          type: number
        percentile:
          type: number
        grade:
          type: string
        issuedAt:
          type: string
          format: date-time
        expiresAt:
          type: string
          format: date-time
        verificationUrl:
          type: string
        pdfUrl:
          type: string
        blockchainTxId:
          type: string

    Skill:
      type: object
      properties:
        id:
          type: string
          format: uuid
        name:
          type: string
        slug:
          type: string
        description:
          type: string
        categoryId:
          type: string
          format: uuid
        categoryName:
          type: string
        difficultyLevels:
          type: array
          items:
            type: string
        totalCertifications:
          type: integer

    Job:
      type: object
      properties:
        id:
          type: string
          format: uuid
        title:
          type: string
        description:
          type: string
        companyName:
          type: string
        locationCity:
          type: string
        locationCountry:
          type: string
        remotePolicy:
          type: string
        salaryMin:
          type: integer
        salaryMax:
          type: integer
        employmentType:
          type: string
        requiredSkills:
          type: array
          items:
            type: object
        status:
          type: string
        createdAt:
          type: string
          format: date-time

    Error:
      type: object
      properties:
        code:
          type: string
        message:
          type: string
        details:
          type: object
```

---

## Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| AUTH_INVALID_CREDENTIALS | 401 | Invalid email or password |
| AUTH_TOKEN_EXPIRED | 401 | JWT token has expired |
| AUTH_MFA_REQUIRED | 401 | MFA verification required |
| AUTH_MFA_INVALID | 401 | Invalid MFA code |
| FORBIDDEN | 403 | Insufficient permissions |
| NOT_FOUND | 404 | Resource not found |
| VALIDATION_ERROR | 400 | Request validation failed |
| CONFLICT | 409 | Resource already exists |
| RATE_LIMITED | 429 | Too many requests |
| INTERNAL_ERROR | 500 | Internal server error |

---

## Rate Limits

| Endpoint Category | Rate Limit |
|-------------------|------------|
| Authentication | 10/minute |
| Search | 60/minute |
| Submissions | 10/minute |
| General | 100/minute |

---

*Last Updated: January 2026*
