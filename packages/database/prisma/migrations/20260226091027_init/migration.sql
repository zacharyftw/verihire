-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DELETED');

-- CreateEnum
CREATE TYPE "UserType" AS ENUM ('CANDIDATE', 'RECRUITER', 'ADMIN');

-- CreateEnum
CREATE TYPE "OAuthProvider" AS ENUM ('GOOGLE', 'GITHUB', 'LINKEDIN');

-- CreateEnum
CREATE TYPE "RemotePreference" AS ENUM ('REMOTE', 'HYBRID', 'ONSITE', 'FLEXIBLE');

-- CreateEnum
CREATE TYPE "JobSearchStatus" AS ENUM ('ACTIVE', 'OPEN', 'NOT_LOOKING');

-- CreateEnum
CREATE TYPE "SkillLevel" AS ENUM ('BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT');

-- CreateEnum
CREATE TYPE "ChallengeDifficulty" AS ENUM ('BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT');

-- CreateEnum
CREATE TYPE "ChallengeType" AS ENUM ('CODING', 'DESIGN', 'WRITTEN', 'MIXED');

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('IN_PROGRESS', 'SUBMITTED', 'EVALUATING', 'EVALUATED', 'FAILED');

-- CreateEnum
CREATE TYPE "ConfidenceLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('ASSIGNED', 'IN_PROGRESS', 'SUBMITTED', 'VALIDATED', 'REJECTED');

-- CreateEnum
CREATE TYPE "CompanyStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'INACTIVE');

-- CreateEnum
CREATE TYPE "RecruiterRole" AS ENUM ('RECRUITER', 'HIRING_MANAGER', 'ADMIN');

-- CreateEnum
CREATE TYPE "RemotePolicy" AS ENUM ('REMOTE', 'HYBRID', 'ONSITE');

-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERNSHIP');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'CLOSED', 'FILLED');

-- CreateEnum
CREATE TYPE "ShortlistStage" AS ENUM ('SHORTLISTED', 'SCREENING', 'INTERVIEW', 'ASSESSMENT', 'OFFER', 'HIRED', 'REJECTED');

-- CreateEnum
CREATE TYPE "AuditOutcome" AS ENUM ('SUCCESS', 'FAILURE', 'ERROR');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "email_verified" BOOLEAN NOT NULL DEFAULT false,
    "password_hash" VARCHAR(255),
    "first_name" VARCHAR(100),
    "last_name" VARCHAR(100),
    "avatar_url" TEXT,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "user_type" "UserType" NOT NULL,
    "mfa_enabled" BOOLEAN NOT NULL DEFAULT false,
    "mfa_secret_encrypted" TEXT,
    "oauth_provider" "OAuthProvider",
    "oauth_provider_id" VARCHAR(255),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "last_login_at" TIMESTAMPTZ,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "user_id" UUID NOT NULL,
    "role" VARCHAR(50) NOT NULL,
    "granted_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "granted_by" UUID,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("user_id","role")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "ip_address" INET,
    "user_agent" TEXT,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mfa_backup_codes" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "code_hash" VARCHAR(64) NOT NULL,
    "used_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mfa_backup_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "used_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_verification_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "used_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_verification_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidate_profiles" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "headline" VARCHAR(255),
    "bio" TEXT,
    "years_experience" INTEGER NOT NULL DEFAULT 0,
    "current_role" VARCHAR(100),
    "current_company" VARCHAR(100),
    "location_city" VARCHAR(100),
    "location_country" VARCHAR(100),
    "remote_preference" "RemotePreference",
    "linkedin_url" TEXT,
    "github_url" TEXT,
    "portfolio_url" TEXT,
    "resume_url" TEXT,
    "job_search_status" "JobSearchStatus",
    "preferred_salary_min" INTEGER,
    "preferred_salary_max" INTEGER,
    "preferred_salary_currency" VARCHAR(3) NOT NULL DEFAULT 'USD',
    "portfolio_public" BOOLEAN NOT NULL DEFAULT true,
    "portfolio_slug" VARCHAR(100),
    "total_challenges_completed" INTEGER NOT NULL DEFAULT 0,
    "average_score" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "certificates_count" INTEGER NOT NULL DEFAULT 0,
    "reputation_score" DECIMAL(5,2) NOT NULL DEFAULT 50,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "candidate_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skill_categories" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "parent_id" UUID,
    "icon" VARCHAR(50),
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "skill_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skills" (
    "id" UUID NOT NULL,
    "category_id" UUID,
    "name" VARCHAR(100) NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "difficulty_levels" JSONB NOT NULL DEFAULT '["beginner", "intermediate", "advanced", "expert"]',
    "challenge_types" JSONB NOT NULL DEFAULT '["coding", "written"]',
    "certification_enabled" BOOLEAN NOT NULL DEFAULT true,
    "certification_validity_months" INTEGER NOT NULL DEFAULT 24,
    "pass_threshold" INTEGER NOT NULL DEFAULT 60,
    "total_certifications" INTEGER NOT NULL DEFAULT 0,
    "average_score" DECIMAL(5,2),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "skills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidate_skills" (
    "id" UUID NOT NULL,
    "candidate_id" UUID NOT NULL,
    "skill_id" UUID NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "verification_date" TIMESTAMPTZ,
    "score" DECIMAL(5,2),
    "percentile" DECIMAL(5,2),
    "level" "SkillLevel",
    "certificate_id" UUID,
    "challenge_id" UUID,
    "expires_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "candidate_skills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "challenge_templates" (
    "id" UUID NOT NULL,
    "skill_id" UUID,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "difficulty" "ChallengeDifficulty",
    "type" "ChallengeType",
    "time_limit_minutes" INTEGER NOT NULL DEFAULT 60,
    "prompt_template" TEXT NOT NULL,
    "evaluation_criteria" JSONB NOT NULL,
    "rubric" JSONB NOT NULL,
    "supported_languages" JSONB,
    "starter_code" JSONB,
    "test_case_template" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "challenge_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "challenges" (
    "id" UUID NOT NULL,
    "template_id" UUID,
    "skill_id" UUID,
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT NOT NULL,
    "requirements" JSONB,
    "test_cases" JSONB,
    "starter_code" TEXT,
    "difficulty" "ChallengeDifficulty",
    "type" "ChallengeType",
    "time_limit_minutes" INTEGER,
    "evaluation_criteria" JSONB,
    "generated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "generation_model" VARCHAR(50),
    "times_attempted" INTEGER NOT NULL DEFAULT 0,
    "average_score" DECIMAL(5,2),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "challenges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "submissions" (
    "id" UUID NOT NULL,
    "challenge_id" UUID NOT NULL,
    "candidate_id" UUID NOT NULL,
    "content" TEXT,
    "language" VARCHAR(50),
    "files" JSONB,
    "started_at" TIMESTAMPTZ,
    "submitted_at" TIMESTAMPTZ,
    "time_spent_seconds" INTEGER,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "ai_score" DECIMAL(5,2),
    "peer_score" DECIMAL(5,2),
    "final_score" DECIMAL(5,2),
    "percentile" DECIMAL(5,2),
    "ip_address" INET,
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evaluations" (
    "id" UUID NOT NULL,
    "submission_id" UUID NOT NULL,
    "overall_score" DECIMAL(5,2) NOT NULL,
    "criteria_scores" JSONB NOT NULL,
    "static_analysis" JSONB,
    "test_results" JSONB,
    "semantic_analysis" JSONB,
    "feedback" TEXT,
    "suggestions" JSONB,
    "model_versions" JSONB,
    "processing_time_ms" INTEGER,
    "confidence" DECIMAL(5,4),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reviews" (
    "id" UUID NOT NULL,
    "submission_id" UUID NOT NULL,
    "reviewer_id" UUID NOT NULL,
    "assigned_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deadline" TIMESTAMPTZ,
    "criteriaScores" JSONB,
    "overall_score" DECIMAL(5,2),
    "strengths" TEXT,
    "areas_for_improvement" TEXT,
    "suggestions" TEXT,
    "confidence_level" "ConfidenceLevel",
    "time_spent_seconds" INTEGER,
    "submitted_at" TIMESTAMPTZ,
    "quality_score" DECIMAL(5,2),
    "effort_score" DECIMAL(5,2),
    "specificity_score" DECIMAL(5,2),
    "bias_detected" BOOLEAN NOT NULL DEFAULT false,
    "bias_type" VARCHAR(50),
    "status" "ReviewStatus" NOT NULL DEFAULT 'ASSIGNED',
    "reputation_delta" DECIMAL(5,2),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "certificates" (
    "id" UUID NOT NULL,
    "certificate_number" VARCHAR(50) NOT NULL,
    "version" VARCHAR(10) NOT NULL DEFAULT '1.0',
    "candidate_id" UUID NOT NULL,
    "skill_id" UUID NOT NULL,
    "challenge_id" UUID NOT NULL,
    "submission_id" UUID NOT NULL,
    "final_score" DECIMAL(5,2) NOT NULL,
    "percentile" DECIMAL(5,2),
    "grade" VARCHAR(5) NOT NULL,
    "ai_score" DECIMAL(5,2),
    "peer_score" DECIMAL(5,2),
    "confidence" DECIMAL(5,4),
    "criteria_scores" JSONB,
    "hash" VARCHAR(64) NOT NULL,
    "signature" TEXT NOT NULL,
    "public_key" TEXT NOT NULL,
    "blockchain_tx_id" VARCHAR(66),
    "blockchain_network" VARCHAR(50),
    "block_number" BIGINT,
    "ipfs_hash" VARCHAR(100),
    "pdf_url" TEXT,
    "image_url" TEXT,
    "verification_url" TEXT NOT NULL,
    "issued_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ,
    "revoked_at" TIMESTAMPTZ,
    "revocation_reason" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "certificates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "companies" (
    "id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "industry" VARCHAR(100),
    "company_size" VARCHAR(50),
    "logo_url" TEXT,
    "website_url" TEXT,
    "headquarters_city" VARCHAR(100),
    "headquarters_country" VARCHAR(100),
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "verified_at" TIMESTAMPTZ,
    "verification_documents" JSONB,
    "plan" VARCHAR(50) NOT NULL DEFAULT 'free',
    "plan_expires_at" TIMESTAMPTZ,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "status" "CompanyStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recruiter_profiles" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "company_id" UUID,
    "title" VARCHAR(100),
    "department" VARCHAR(100),
    "role" "RecruiterRole" NOT NULL DEFAULT 'RECRUITER',
    "total_hires" INTEGER NOT NULL DEFAULT 0,
    "active_jobs" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "recruiter_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jobs" (
    "id" UUID NOT NULL,
    "company_id" UUID,
    "recruiter_id" UUID,
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "requirements" TEXT,
    "responsibilities" TEXT,
    "location_city" VARCHAR(100),
    "location_country" VARCHAR(100),
    "remote_policy" "RemotePolicy",
    "salary_min" INTEGER,
    "salary_max" INTEGER,
    "salary_currency" VARCHAR(3) NOT NULL DEFAULT 'USD',
    "salary_period" VARCHAR(20) NOT NULL DEFAULT 'yearly',
    "employment_type" "EmploymentType",
    "experience_level" VARCHAR(50),
    "experience_years_min" INTEGER,
    "experience_years_max" INTEGER,
    "status" "JobStatus" NOT NULL DEFAULT 'DRAFT',
    "published_at" TIMESTAMPTZ,
    "closes_at" TIMESTAMPTZ,
    "views_count" INTEGER NOT NULL DEFAULT 0,
    "applications_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_skills" (
    "id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "skill_id" UUID NOT NULL,
    "min_score" INTEGER NOT NULL DEFAULT 60,
    "min_level" "SkillLevel",
    "required" BOOLEAN NOT NULL DEFAULT true,
    "weight" DECIMAL(3,2) NOT NULL DEFAULT 1.0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_skills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shortlists" (
    "id" UUID NOT NULL,
    "recruiter_id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "candidate_id" UUID NOT NULL,
    "stage" "ShortlistStage" NOT NULL DEFAULT 'SHORTLISTED',
    "stage_updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "rating" INTEGER,
    "stage_history" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "shortlists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "event_type" VARCHAR(50) NOT NULL,
    "action" VARCHAR(50) NOT NULL,
    "outcome" "AuditOutcome" NOT NULL DEFAULT 'SUCCESS',
    "actor_id" UUID,
    "actor_type" VARCHAR(20),
    "resource_type" VARCHAR(50),
    "resource_id" UUID,
    "details" JSONB NOT NULL DEFAULT '{}',
    "ip_address" INET,
    "user_agent" TEXT,
    "session_id" UUID,
    "request_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics_events" (
    "id" UUID NOT NULL,
    "event_name" VARCHAR(100) NOT NULL,
    "event_category" VARCHAR(50),
    "user_id" UUID,
    "session_id" UUID,
    "properties" JSONB NOT NULL DEFAULT '{}',
    "device_type" VARCHAR(20),
    "browser" VARCHAR(50),
    "os" VARCHAR(50),
    "country" VARCHAR(2),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analytics_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_status_idx" ON "users"("status");

-- CreateIndex
CREATE INDEX "users_user_type_idx" ON "users"("user_type");

-- CreateIndex
CREATE INDEX "users_oauth_provider_oauth_provider_id_idx" ON "users"("oauth_provider", "oauth_provider_id");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_token_hash_key" ON "password_reset_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "password_reset_tokens_user_id_idx" ON "password_reset_tokens"("user_id");

-- CreateIndex
CREATE INDEX "password_reset_tokens_expires_at_idx" ON "password_reset_tokens"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "email_verification_tokens_token_hash_key" ON "email_verification_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "email_verification_tokens_user_id_idx" ON "email_verification_tokens"("user_id");

-- CreateIndex
CREATE INDEX "email_verification_tokens_expires_at_idx" ON "email_verification_tokens"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "candidate_profiles_user_id_key" ON "candidate_profiles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "candidate_profiles_portfolio_slug_key" ON "candidate_profiles"("portfolio_slug");

-- CreateIndex
CREATE INDEX "candidate_profiles_user_id_idx" ON "candidate_profiles"("user_id");

-- CreateIndex
CREATE INDEX "candidate_profiles_job_search_status_idx" ON "candidate_profiles"("job_search_status");

-- CreateIndex
CREATE INDEX "candidate_profiles_portfolio_slug_idx" ON "candidate_profiles"("portfolio_slug");

-- CreateIndex
CREATE UNIQUE INDEX "skill_categories_slug_key" ON "skill_categories"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "skills_slug_key" ON "skills"("slug");

-- CreateIndex
CREATE INDEX "skills_category_id_idx" ON "skills"("category_id");

-- CreateIndex
CREATE INDEX "skills_slug_idx" ON "skills"("slug");

-- CreateIndex
CREATE INDEX "skills_is_active_idx" ON "skills"("is_active");

-- CreateIndex
CREATE INDEX "candidate_skills_candidate_id_idx" ON "candidate_skills"("candidate_id");

-- CreateIndex
CREATE INDEX "candidate_skills_skill_id_idx" ON "candidate_skills"("skill_id");

-- CreateIndex
CREATE INDEX "candidate_skills_verified_idx" ON "candidate_skills"("verified");

-- CreateIndex
CREATE INDEX "candidate_skills_score_idx" ON "candidate_skills"("score" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "candidate_skills_candidate_id_skill_id_key" ON "candidate_skills"("candidate_id", "skill_id");

-- CreateIndex
CREATE INDEX "challenges_skill_id_idx" ON "challenges"("skill_id");

-- CreateIndex
CREATE INDEX "challenges_difficulty_idx" ON "challenges"("difficulty");

-- CreateIndex
CREATE INDEX "challenges_type_idx" ON "challenges"("type");

-- CreateIndex
CREATE INDEX "submissions_challenge_id_idx" ON "submissions"("challenge_id");

-- CreateIndex
CREATE INDEX "submissions_candidate_id_idx" ON "submissions"("candidate_id");

-- CreateIndex
CREATE INDEX "submissions_status_idx" ON "submissions"("status");

-- CreateIndex
CREATE INDEX "submissions_submitted_at_idx" ON "submissions"("submitted_at");

-- CreateIndex
CREATE INDEX "evaluations_submission_id_idx" ON "evaluations"("submission_id");

-- CreateIndex
CREATE INDEX "reviews_submission_id_idx" ON "reviews"("submission_id");

-- CreateIndex
CREATE INDEX "reviews_reviewer_id_idx" ON "reviews"("reviewer_id");

-- CreateIndex
CREATE INDEX "reviews_status_idx" ON "reviews"("status");

-- CreateIndex
CREATE UNIQUE INDEX "certificates_certificate_number_key" ON "certificates"("certificate_number");

-- CreateIndex
CREATE INDEX "certificates_candidate_id_idx" ON "certificates"("candidate_id");

-- CreateIndex
CREATE INDEX "certificates_skill_id_idx" ON "certificates"("skill_id");

-- CreateIndex
CREATE INDEX "certificates_certificate_number_idx" ON "certificates"("certificate_number");

-- CreateIndex
CREATE INDEX "certificates_hash_idx" ON "certificates"("hash");

-- CreateIndex
CREATE INDEX "certificates_issued_at_idx" ON "certificates"("issued_at");

-- CreateIndex
CREATE UNIQUE INDEX "companies_slug_key" ON "companies"("slug");

-- CreateIndex
CREATE INDEX "companies_slug_idx" ON "companies"("slug");

-- CreateIndex
CREATE INDEX "companies_status_idx" ON "companies"("status");

-- CreateIndex
CREATE UNIQUE INDEX "recruiter_profiles_user_id_key" ON "recruiter_profiles"("user_id");

-- CreateIndex
CREATE INDEX "recruiter_profiles_user_id_idx" ON "recruiter_profiles"("user_id");

-- CreateIndex
CREATE INDEX "recruiter_profiles_company_id_idx" ON "recruiter_profiles"("company_id");

-- CreateIndex
CREATE INDEX "jobs_company_id_idx" ON "jobs"("company_id");

-- CreateIndex
CREATE INDEX "jobs_recruiter_id_idx" ON "jobs"("recruiter_id");

-- CreateIndex
CREATE INDEX "jobs_status_idx" ON "jobs"("status");

-- CreateIndex
CREATE INDEX "jobs_location_country_location_city_idx" ON "jobs"("location_country", "location_city");

-- CreateIndex
CREATE INDEX "job_skills_job_id_idx" ON "job_skills"("job_id");

-- CreateIndex
CREATE INDEX "job_skills_skill_id_idx" ON "job_skills"("skill_id");

-- CreateIndex
CREATE INDEX "shortlists_recruiter_id_idx" ON "shortlists"("recruiter_id");

-- CreateIndex
CREATE INDEX "shortlists_job_id_idx" ON "shortlists"("job_id");

-- CreateIndex
CREATE INDEX "shortlists_candidate_id_idx" ON "shortlists"("candidate_id");

-- CreateIndex
CREATE INDEX "shortlists_stage_idx" ON "shortlists"("stage");

-- CreateIndex
CREATE UNIQUE INDEX "shortlists_job_id_candidate_id_key" ON "shortlists"("job_id", "candidate_id");

-- CreateIndex
CREATE INDEX "audit_logs_actor_id_idx" ON "audit_logs"("actor_id");

-- CreateIndex
CREATE INDEX "audit_logs_resource_type_resource_id_idx" ON "audit_logs"("resource_type", "resource_id");

-- CreateIndex
CREATE INDEX "audit_logs_event_type_idx" ON "audit_logs"("event_type");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "analytics_events_event_name_idx" ON "analytics_events"("event_name");

-- CreateIndex
CREATE INDEX "analytics_events_user_id_idx" ON "analytics_events"("user_id");

-- CreateIndex
CREATE INDEX "analytics_events_created_at_idx" ON "analytics_events"("created_at");

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_granted_by_fkey" FOREIGN KEY ("granted_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mfa_backup_codes" ADD CONSTRAINT "mfa_backup_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_verification_tokens" ADD CONSTRAINT "email_verification_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_profiles" ADD CONSTRAINT "candidate_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skill_categories" ADD CONSTRAINT "skill_categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "skill_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skills" ADD CONSTRAINT "skills_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "skill_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_skills" ADD CONSTRAINT "candidate_skills_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "candidate_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_skills" ADD CONSTRAINT "candidate_skills_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challenge_templates" ADD CONSTRAINT "challenge_templates_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skills"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challenge_templates" ADD CONSTRAINT "challenge_templates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challenges" ADD CONSTRAINT "challenges_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "challenge_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challenges" ADD CONSTRAINT "challenges_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skills"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_challenge_id_fkey" FOREIGN KEY ("challenge_id") REFERENCES "challenges"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "candidate_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "candidate_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "candidate_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_challenge_id_fkey" FOREIGN KEY ("challenge_id") REFERENCES "challenges"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "submissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recruiter_profiles" ADD CONSTRAINT "recruiter_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recruiter_profiles" ADD CONSTRAINT "recruiter_profiles_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_recruiter_id_fkey" FOREIGN KEY ("recruiter_id") REFERENCES "recruiter_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_skills" ADD CONSTRAINT "job_skills_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_skills" ADD CONSTRAINT "job_skills_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shortlists" ADD CONSTRAINT "shortlists_recruiter_id_fkey" FOREIGN KEY ("recruiter_id") REFERENCES "recruiter_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shortlists" ADD CONSTRAINT "shortlists_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shortlists" ADD CONSTRAINT "shortlists_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "candidate_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
