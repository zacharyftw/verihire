# Database Design

## Overview

VeriHire uses PostgreSQL as the primary relational database, with Redis for caching and Elasticsearch for search. This document outlines the complete database schema.

---

## Entity Relationship Diagram

```
┌─────────────┐       ┌─────────────┐       ┌─────────────┐
│    users    │───────│  companies  │───────│    jobs     │
└─────────────┘       └─────────────┘       └─────────────┘
       │                     │                     │
       │                     │                     │
       ▼                     ▼                     ▼
┌─────────────┐       ┌─────────────┐       ┌─────────────┐
│   profiles  │       │  recruiters │       │ job_skills  │
└─────────────┘       └─────────────┘       └─────────────┘
       │                                           │
       │                                           │
       ▼                     ┌─────────────────────┘
┌─────────────┐              │
│candidate_   │       ┌──────▼──────┐       ┌─────────────┐
│   skills    │───────│   skills    │───────│skill_       │
└─────────────┘       └─────────────┘       │categories   │
       │                     │              └─────────────┘
       │                     │
       ▼                     ▼
┌─────────────┐       ┌─────────────┐       ┌─────────────┐
│ submissions │───────│ challenges  │───────│challenge_   │
└─────────────┘       └─────────────┘       │templates    │
       │                                    └─────────────┘
       │
       ▼
┌─────────────┐       ┌─────────────┐       ┌─────────────┐
│ evaluations │       │   reviews   │       │certificates │
└─────────────┘       └─────────────┘       └─────────────┘
```

---

## Core Tables

### Users & Authentication

```sql
-- Users table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    email_verified BOOLEAN DEFAULT FALSE,
    password_hash VARCHAR(255),
    
    -- Profile basics
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    avatar_url TEXT,
    
    -- Account status
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'deleted')),
    user_type VARCHAR(20) NOT NULL CHECK (user_type IN ('candidate', 'recruiter', 'admin')),
    
    -- MFA
    mfa_enabled BOOLEAN DEFAULT FALSE,
    mfa_secret_encrypted TEXT,
    
    -- OAuth
    oauth_provider VARCHAR(50),
    oauth_provider_id VARCHAR(255),
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_login_at TIMESTAMP WITH TIME ZONE,
    
    -- Indexes
    CONSTRAINT users_email_lower_idx UNIQUE (LOWER(email))
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_status ON users(status);
CREATE INDEX idx_users_type ON users(user_type);
CREATE INDEX idx_users_oauth ON users(oauth_provider, oauth_provider_id);

-- User roles (many-to-many)
CREATE TABLE user_roles (
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL,
    granted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    granted_by UUID REFERENCES users(id),
    PRIMARY KEY (user_id, role)
);

-- Sessions
CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(64) NOT NULL,
    ip_address INET,
    user_agent TEXT,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    revoked_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);

-- MFA backup codes
CREATE TABLE mfa_backup_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    code_hash VARCHAR(64) NOT NULL,
    used_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### Candidate Profiles

```sql
-- Candidate profiles
CREATE TABLE candidate_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    
    -- Professional info
    headline VARCHAR(255),
    bio TEXT,
    years_experience INTEGER DEFAULT 0,
    current_role VARCHAR(100),
    current_company VARCHAR(100),
    
    -- Location
    location_city VARCHAR(100),
    location_country VARCHAR(100),
    location_coordinates POINT,
    remote_preference VARCHAR(20) CHECK (remote_preference IN ('remote', 'hybrid', 'onsite', 'flexible')),
    
    -- Links
    linkedin_url TEXT,
    github_url TEXT,
    portfolio_url TEXT,
    resume_url TEXT,
    
    -- Preferences
    job_search_status VARCHAR(20) CHECK (job_search_status IN ('active', 'open', 'not_looking')),
    preferred_salary_min INTEGER,
    preferred_salary_max INTEGER,
    preferred_salary_currency VARCHAR(3) DEFAULT 'USD',
    
    -- Portfolio settings
    portfolio_public BOOLEAN DEFAULT TRUE,
    portfolio_slug VARCHAR(100) UNIQUE,
    
    -- Stats (denormalized for performance)
    total_challenges_completed INTEGER DEFAULT 0,
    average_score DECIMAL(5,2) DEFAULT 0,
    certificates_count INTEGER DEFAULT 0,
    reputation_score DECIMAL(5,2) DEFAULT 50,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_candidate_profiles_user ON candidate_profiles(user_id);
CREATE INDEX idx_candidate_profiles_location ON candidate_profiles USING GIST(location_coordinates);
CREATE INDEX idx_candidate_profiles_status ON candidate_profiles(job_search_status);
CREATE INDEX idx_candidate_profiles_slug ON candidate_profiles(portfolio_slug);
```

### Skills & Taxonomy

```sql
-- Skill categories
CREATE TABLE skill_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    parent_id UUID REFERENCES skill_categories(id),
    icon VARCHAR(50),
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Skills
CREATE TABLE skills (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id UUID REFERENCES skill_categories(id),
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    
    -- Metadata
    difficulty_levels JSONB DEFAULT '["beginner", "intermediate", "advanced", "expert"]',
    challenge_types JSONB DEFAULT '["coding", "written"]',
    
    -- Certification settings
    certification_enabled BOOLEAN DEFAULT TRUE,
    certification_validity_months INTEGER DEFAULT 24,
    pass_threshold INTEGER DEFAULT 60,
    
    -- Stats
    total_certifications INTEGER DEFAULT 0,
    average_score DECIMAL(5,2),
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_skills_category ON skills(category_id);
CREATE INDEX idx_skills_slug ON skills(slug);
CREATE INDEX idx_skills_active ON skills(is_active);

-- Candidate verified skills
CREATE TABLE candidate_skills (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    candidate_id UUID REFERENCES candidate_profiles(id) ON DELETE CASCADE,
    skill_id UUID REFERENCES skills(id),
    
    -- Verification status
    verified BOOLEAN DEFAULT FALSE,
    verification_date TIMESTAMP WITH TIME ZONE,
    
    -- Scores
    score DECIMAL(5,2),
    percentile DECIMAL(5,2),
    level VARCHAR(20) CHECK (level IN ('beginner', 'intermediate', 'advanced', 'expert')),
    
    -- References
    certificate_id UUID,  -- References certificates table
    challenge_id UUID,    -- References challenges table
    
    -- Validity
    expires_at TIMESTAMP WITH TIME ZONE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(candidate_id, skill_id)
);

CREATE INDEX idx_candidate_skills_candidate ON candidate_skills(candidate_id);
CREATE INDEX idx_candidate_skills_skill ON candidate_skills(skill_id);
CREATE INDEX idx_candidate_skills_verified ON candidate_skills(verified);
CREATE INDEX idx_candidate_skills_score ON candidate_skills(score DESC);
```

### Challenges & Submissions

```sql
-- Challenge templates
CREATE TABLE challenge_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    skill_id UUID REFERENCES skills(id),
    
    -- Template info
    name VARCHAR(255) NOT NULL,
    description TEXT,
    difficulty VARCHAR(20) CHECK (difficulty IN ('beginner', 'intermediate', 'advanced', 'expert')),
    type VARCHAR(20) CHECK (type IN ('coding', 'design', 'written', 'mixed')),
    
    -- Configuration
    time_limit_minutes INTEGER DEFAULT 60,
    prompt_template TEXT NOT NULL,
    evaluation_criteria JSONB NOT NULL,
    rubric JSONB NOT NULL,
    
    -- For coding challenges
    supported_languages JSONB,
    starter_code JSONB,
    test_case_template JSONB,
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Challenges (generated instances)
CREATE TABLE challenges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID REFERENCES challenge_templates(id),
    skill_id UUID REFERENCES skills(id),
    
    -- Generated content
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    requirements JSONB,
    
    -- For coding
    test_cases JSONB,
    starter_code TEXT,
    
    -- Configuration
    difficulty VARCHAR(20),
    type VARCHAR(20),
    time_limit_minutes INTEGER,
    evaluation_criteria JSONB,
    
    -- Metadata
    generated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    generation_model VARCHAR(50),
    
    -- Stats
    times_attempted INTEGER DEFAULT 0,
    average_score DECIMAL(5,2),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_challenges_skill ON challenges(skill_id);
CREATE INDEX idx_challenges_difficulty ON challenges(difficulty);
CREATE INDEX idx_challenges_type ON challenges(type);

-- Submissions
CREATE TABLE submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    challenge_id UUID REFERENCES challenges(id),
    candidate_id UUID REFERENCES candidate_profiles(id),
    
    -- Submission content
    content TEXT,  -- Code, text, or design metadata
    language VARCHAR(50),  -- For coding submissions
    files JSONB,  -- References to S3/storage
    
    -- Timing
    started_at TIMESTAMP WITH TIME ZONE,
    submitted_at TIMESTAMP WITH TIME ZONE,
    time_spent_seconds INTEGER,
    
    -- Status
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN (
        'in_progress', 'submitted', 'evaluating', 'evaluated', 'failed'
    )),
    
    -- Scores (denormalized for quick access)
    ai_score DECIMAL(5,2),
    peer_score DECIMAL(5,2),
    final_score DECIMAL(5,2),
    percentile DECIMAL(5,2),
    
    -- Metadata
    ip_address INET,
    user_agent TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_submissions_challenge ON submissions(challenge_id);
CREATE INDEX idx_submissions_candidate ON submissions(candidate_id);
CREATE INDEX idx_submissions_status ON submissions(status);
CREATE INDEX idx_submissions_date ON submissions(submitted_at);
```

### Evaluations & Reviews

```sql
-- AI Evaluations
CREATE TABLE evaluations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id UUID REFERENCES submissions(id) ON DELETE CASCADE,
    
    -- Scores
    overall_score DECIMAL(5,2) NOT NULL,
    criteria_scores JSONB NOT NULL,
    
    -- Analysis
    static_analysis JSONB,
    test_results JSONB,
    semantic_analysis JSONB,
    
    -- Feedback
    feedback TEXT,
    suggestions JSONB,
    
    -- Metadata
    model_versions JSONB,  -- Which models were used
    processing_time_ms INTEGER,
    confidence DECIMAL(5,4),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_evaluations_submission ON evaluations(submission_id);

-- Peer Reviews
CREATE TABLE reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id UUID REFERENCES submissions(id) ON DELETE CASCADE,
    reviewer_id UUID REFERENCES candidate_profiles(id),
    
    -- Assignment
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deadline TIMESTAMP WITH TIME ZONE,
    
    -- Review content
    criteria_scores JSONB,
    overall_score DECIMAL(5,2),
    strengths TEXT,
    areas_for_improvement TEXT,
    suggestions TEXT,
    confidence_level VARCHAR(20) CHECK (confidence_level IN ('low', 'medium', 'high')),
    
    -- Metadata
    time_spent_seconds INTEGER,
    submitted_at TIMESTAMP WITH TIME ZONE,
    
    -- Quality metrics
    quality_score DECIMAL(5,2),
    effort_score DECIMAL(5,2),
    specificity_score DECIMAL(5,2),
    bias_detected BOOLEAN DEFAULT FALSE,
    bias_type VARCHAR(50),
    
    -- Status
    status VARCHAR(20) DEFAULT 'assigned' CHECK (status IN (
        'assigned', 'in_progress', 'submitted', 'validated', 'rejected'
    )),
    
    -- Reviewer reputation impact
    reputation_delta DECIMAL(5,2),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_reviews_submission ON reviews(submission_id);
CREATE INDEX idx_reviews_reviewer ON reviews(reviewer_id);
CREATE INDEX idx_reviews_status ON reviews(status);
```

### Certificates

```sql
-- Certificates
CREATE TABLE certificates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    certificate_number VARCHAR(50) UNIQUE NOT NULL,
    version VARCHAR(10) DEFAULT '1.0',
    
    -- References
    candidate_id UUID REFERENCES candidate_profiles(id),
    skill_id UUID REFERENCES skills(id),
    challenge_id UUID REFERENCES challenges(id),
    submission_id UUID REFERENCES submissions(id),
    
    -- Scores
    final_score DECIMAL(5,2) NOT NULL,
    percentile DECIMAL(5,2),
    grade VARCHAR(5) NOT NULL,
    ai_score DECIMAL(5,2),
    peer_score DECIMAL(5,2),
    confidence DECIMAL(5,4),
    criteria_scores JSONB,
    
    -- Verification
    hash VARCHAR(64) NOT NULL,
    signature TEXT NOT NULL,
    public_key TEXT NOT NULL,
    blockchain_tx_id VARCHAR(66),
    blockchain_network VARCHAR(50),
    block_number BIGINT,
    
    -- Storage
    ipfs_hash VARCHAR(100),
    pdf_url TEXT,
    image_url TEXT,
    verification_url TEXT NOT NULL,
    
    -- Validity
    issued_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE,
    revoked_at TIMESTAMP WITH TIME ZONE,
    revocation_reason TEXT,
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_certificates_candidate ON certificates(candidate_id);
CREATE INDEX idx_certificates_skill ON certificates(skill_id);
CREATE INDEX idx_certificates_number ON certificates(certificate_number);
CREATE INDEX idx_certificates_hash ON certificates(hash);
CREATE INDEX idx_certificates_issued ON certificates(issued_at);
```

### Companies & Recruiters

```sql
-- Companies
CREATE TABLE companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Basic info
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    industry VARCHAR(100),
    company_size VARCHAR(50),
    
    -- Branding
    logo_url TEXT,
    website_url TEXT,
    
    -- Location
    headquarters_city VARCHAR(100),
    headquarters_country VARCHAR(100),
    
    -- Verification
    verified BOOLEAN DEFAULT FALSE,
    verified_at TIMESTAMP WITH TIME ZONE,
    verification_documents JSONB,
    
    -- Subscription
    plan VARCHAR(50) DEFAULT 'free',
    plan_expires_at TIMESTAMP WITH TIME ZONE,
    
    -- Settings
    settings JSONB DEFAULT '{}',
    
    -- Status
    status VARCHAR(20) DEFAULT 'active',
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_companies_slug ON companies(slug);
CREATE INDEX idx_companies_status ON companies(status);

-- Recruiter profiles
CREATE TABLE recruiter_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    company_id UUID REFERENCES companies(id),
    
    -- Profile
    title VARCHAR(100),
    department VARCHAR(100),
    
    -- Permissions within company
    role VARCHAR(50) DEFAULT 'recruiter' CHECK (role IN ('recruiter', 'hiring_manager', 'admin')),
    
    -- Stats
    total_hires INTEGER DEFAULT 0,
    active_jobs INTEGER DEFAULT 0,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_recruiter_profiles_user ON recruiter_profiles(user_id);
CREATE INDEX idx_recruiter_profiles_company ON recruiter_profiles(company_id);
```

### Jobs & Hiring

```sql
-- Jobs
CREATE TABLE jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id),
    recruiter_id UUID REFERENCES recruiter_profiles(id),
    
    -- Job details
    title VARCHAR(255) NOT NULL,
    description TEXT,
    requirements TEXT,
    responsibilities TEXT,
    
    -- Location
    location_city VARCHAR(100),
    location_country VARCHAR(100),
    remote_policy VARCHAR(20) CHECK (remote_policy IN ('remote', 'hybrid', 'onsite')),
    
    -- Compensation
    salary_min INTEGER,
    salary_max INTEGER,
    salary_currency VARCHAR(3) DEFAULT 'USD',
    salary_period VARCHAR(20) DEFAULT 'yearly',
    
    -- Employment
    employment_type VARCHAR(50) CHECK (employment_type IN ('full_time', 'part_time', 'contract', 'internship')),
    experience_level VARCHAR(50),
    experience_years_min INTEGER,
    experience_years_max INTEGER,
    
    -- Status
    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'closed', 'filled')),
    published_at TIMESTAMP WITH TIME ZONE,
    closes_at TIMESTAMP WITH TIME ZONE,
    
    -- Stats
    views_count INTEGER DEFAULT 0,
    applications_count INTEGER DEFAULT 0,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_jobs_company ON jobs(company_id);
CREATE INDEX idx_jobs_recruiter ON jobs(recruiter_id);
CREATE INDEX idx_jobs_status ON jobs(status);
CREATE INDEX idx_jobs_location ON jobs(location_country, location_city);

-- Job required skills
CREATE TABLE job_skills (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
    skill_id UUID REFERENCES skills(id),
    
    min_score INTEGER DEFAULT 60,
    min_level VARCHAR(20),
    required BOOLEAN DEFAULT TRUE,
    weight DECIMAL(3,2) DEFAULT 1.0,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_job_skills_job ON job_skills(job_id);
CREATE INDEX idx_job_skills_skill ON job_skills(skill_id);

-- Shortlists
CREATE TABLE shortlists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recruiter_id UUID REFERENCES recruiter_profiles(id),
    job_id UUID REFERENCES jobs(id),
    candidate_id UUID REFERENCES candidate_profiles(id),
    
    -- Pipeline stage
    stage VARCHAR(50) DEFAULT 'shortlisted' CHECK (stage IN (
        'shortlisted', 'screening', 'interview', 'assessment', 'offer', 'hired', 'rejected'
    )),
    stage_updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Notes
    notes TEXT,
    rating INTEGER CHECK (rating BETWEEN 1 AND 5),
    
    -- History
    stage_history JSONB DEFAULT '[]',
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(job_id, candidate_id)
);

CREATE INDEX idx_shortlists_recruiter ON shortlists(recruiter_id);
CREATE INDEX idx_shortlists_job ON shortlists(job_id);
CREATE INDEX idx_shortlists_candidate ON shortlists(candidate_id);
CREATE INDEX idx_shortlists_stage ON shortlists(stage);
```

### Audit & Analytics

```sql
-- Audit logs
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Event info
    event_type VARCHAR(50) NOT NULL,
    action VARCHAR(50) NOT NULL,
    outcome VARCHAR(20) DEFAULT 'success',
    
    -- Actor
    actor_id UUID,
    actor_type VARCHAR(20),
    
    -- Resource
    resource_type VARCHAR(50),
    resource_id UUID,
    
    -- Details
    details JSONB DEFAULT '{}',
    
    -- Client info
    ip_address INET,
    user_agent TEXT,
    session_id UUID,
    request_id UUID,
    
    -- Timestamp
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Partition by month for performance
CREATE INDEX idx_audit_logs_actor ON audit_logs(actor_id);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX idx_audit_logs_event ON audit_logs(event_type);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at);

-- Analytics events
CREATE TABLE analytics_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Event
    event_name VARCHAR(100) NOT NULL,
    event_category VARCHAR(50),
    
    -- User
    user_id UUID,
    session_id UUID,
    
    -- Context
    properties JSONB DEFAULT '{}',
    
    -- Client
    device_type VARCHAR(20),
    browser VARCHAR(50),
    os VARCHAR(50),
    country VARCHAR(2),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_analytics_events_name ON analytics_events(event_name);
CREATE INDEX idx_analytics_events_user ON analytics_events(user_id);
CREATE INDEX idx_analytics_events_created ON analytics_events(created_at);
```

---

## Migrations

All migrations are managed using a migration tool (e.g., Flyway, Prisma Migrate, or Alembic).

```
migrations/
├── V001__create_users_table.sql
├── V002__create_profiles_tables.sql
├── V003__create_skills_tables.sql
├── V004__create_challenges_tables.sql
├── V005__create_submissions_tables.sql
├── V006__create_certificates_table.sql
├── V007__create_companies_tables.sql
├── V008__create_jobs_tables.sql
├── V009__create_audit_tables.sql
└── V010__add_indexes.sql
```

---

## Backup Strategy

```yaml
backup:
  schedule: "0 2 * * *"  # Daily at 2 AM
  retention:
    daily: 7
    weekly: 4
    monthly: 12
  
  method:
    type: pg_dump
    format: custom
    compression: true
  
  storage:
    primary: s3://verihire-backups/postgres/
    secondary: gs://verihire-backups-dr/postgres/
```

---

*Last Updated: January 2026*
