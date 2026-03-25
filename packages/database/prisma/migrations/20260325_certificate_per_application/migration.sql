-- Make challengeId and submissionId nullable
ALTER TABLE "certificates" ALTER COLUMN "challenge_id" DROP NOT NULL;
ALTER TABLE "certificates" ALTER COLUMN "submission_id" DROP NOT NULL;

-- Add unique constraint on submission_id
CREATE UNIQUE INDEX "certificates_submission_id_key" ON "certificates"("submission_id");

-- Add job_application_id to certificates
ALTER TABLE "certificates" ADD COLUMN "job_application_id" UUID;
CREATE UNIQUE INDEX "certificates_job_application_id_key" ON "certificates"("job_application_id");
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_job_application_id_fkey" FOREIGN KEY ("job_application_id") REFERENCES "job_applications"("id") ON DELETE SET NULL ON UPDATE CASCADE;
