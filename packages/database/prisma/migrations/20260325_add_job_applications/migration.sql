-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('APPLIED', 'TESTING', 'COMPLETED', 'REVIEWED', 'SHORTLISTED', 'REJECTED', 'HIRED');

-- CreateTable
CREATE TABLE "job_applications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "job_id" UUID NOT NULL,
    "candidate_id" UUID NOT NULL,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'APPLIED',
    "cover_letter" TEXT,
    "applied_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "reviewed_at" TIMESTAMP(3),
    "reviewer_notes" TEXT,
    "average_score" DOUBLE PRECISION,
    CONSTRAINT "job_applications_pkey" PRIMARY KEY ("id")
);

-- AddColumn
ALTER TABLE "challenges" ADD COLUMN "job_application_id" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "job_applications_job_id_candidate_id_key" ON "job_applications"("job_id", "candidate_id");

-- CreateIndex
CREATE INDEX "challenges_job_application_id_idx" ON "challenges"("job_application_id");

-- AddForeignKey
ALTER TABLE "job_applications" ADD CONSTRAINT "job_applications_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "job_applications" ADD CONSTRAINT "job_applications_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "candidate_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "challenges" ADD CONSTRAINT "challenges_job_application_id_fkey" FOREIGN KEY ("job_application_id") REFERENCES "job_applications"("id") ON DELETE SET NULL ON UPDATE CASCADE;
