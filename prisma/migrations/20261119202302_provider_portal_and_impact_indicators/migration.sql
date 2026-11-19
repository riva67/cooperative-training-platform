-- CreateEnum
CREATE TYPE "OrganizationType" AS ENUM ('PRIVATE', 'EDUCATIONAL', 'GOVERNMENT');

-- CreateEnum
CREATE TYPE "OpportunityType" AS ENUM ('COOP', 'SUMMER');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ReportType" ADD VALUE 'ABSENCE_WARNING';
ALTER TYPE "ReportType" ADD VALUE 'VISIT';

-- AlterTable
ALTER TABLE "Evaluation" ADD COLUMN     "evaluatorTitle" TEXT,
ADD COLUMN     "satisfaction" INTEGER,
ADD COLUMN     "signature" TEXT;

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "type" "OrganizationType" NOT NULL DEFAULT 'PRIVATE';

-- AlterTable
ALTER TABLE "Report" ADD COLUMN     "attachmentId" INTEGER,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "weekNumber" INTEGER;

-- AlterTable
ALTER TABLE "TrainingAssignment" ADD COLUMN     "commencementDate" DATE,
ADD COLUMN     "employedAfterTraining" BOOLEAN,
ADD COLUMN     "employerName" TEXT,
ADD COLUMN     "employmentRecordedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "TrainingOpportunity" ADD COLUMN     "deadline" TIMESTAMP(3),
ADD COLUMN     "location" TEXT,
ADD COLUMN     "requirements" TEXT,
ADD COLUMN     "target" TEXT,
ADD COLUMN     "type" "OpportunityType" NOT NULL DEFAULT 'COOP';

-- CreateIndex
CREATE INDEX "Application_opportunityId_status_idx" ON "Application"("opportunityId", "status");

-- CreateIndex
CREATE INDEX "Report_assignmentId_type_idx" ON "Report"("assignmentId", "type");

-- CreateIndex
CREATE INDEX "TrainingAssignment_studentId_status_idx" ON "TrainingAssignment"("studentId", "status");

-- CreateIndex
CREATE INDEX "TrainingAssignment_academicSupervisorId_idx" ON "TrainingAssignment"("academicSupervisorId");

-- CreateIndex
CREATE INDEX "TrainingAssignment_orgSupervisorId_idx" ON "TrainingAssignment"("orgSupervisorId");

-- CreateIndex
CREATE INDEX "TrainingOpportunity_organizationId_status_idx" ON "TrainingOpportunity"("organizationId", "status");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "Attachment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Data fix: accounts that were registered while waiting for approval were stored as status ACTIVE with isActive = false.
-- Training providers never reviewed by an admin -> PENDING; any other disabled account -> SUSPENDED.
UPDATE "User" SET "status" = 'PENDING'
WHERE "isActive" = false AND "status" = 'ACTIVE' AND "reviewedAt" IS NULL AND "role" = 'ORG_SUPERVISOR';
UPDATE "User" SET "status" = 'SUSPENDED'
WHERE "isActive" = false AND "status" = 'ACTIVE';
