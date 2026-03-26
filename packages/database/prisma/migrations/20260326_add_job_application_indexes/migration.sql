-- CreateIndex
CREATE INDEX "job_applications_job_id_idx" ON "job_applications"("job_id");

-- CreateIndex
CREATE INDEX "job_applications_candidate_id_idx" ON "job_applications"("candidate_id");

-- CreateIndex
CREATE INDEX "job_applications_status_idx" ON "job_applications"("status");
