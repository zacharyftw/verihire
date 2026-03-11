-- CreateEnum
CREATE TYPE "ChallengeCategory" AS ENUM ('GENERAL_SWE', 'DOMAIN_SPECIFIC');

-- AlterTable
ALTER TABLE "challenges" ADD COLUMN "category" "ChallengeCategory" NOT NULL DEFAULT 'GENERAL_SWE';
ALTER TABLE "challenges" ADD COLUMN "supported_languages" JSONB;
