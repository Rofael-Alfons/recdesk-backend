-- CreateEnum
CREATE TYPE "InterviewStatus" AS ENUM ('DRAFT', 'AWAITING_MANAGER', 'AWAITING_CANDIDATE', 'SCHEDULED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "SlotSource" AS ENUM ('MANAGER', 'RECRUITER');

-- CreateEnum
CREATE TYPE "InterviewLocationType" AS ENUM ('ONLINE', 'PHONE', 'ONSITE');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'INTERVIEW_AVAILABILITY_REQUEST';
ALTER TYPE "NotificationType" ADD VALUE 'INTERVIEW_SCHEDULED';

-- CreateTable
CREATE TABLE "interviews" (
    "id" TEXT NOT NULL,
    "status" "InterviewStatus" NOT NULL DEFAULT 'DRAFT',
    "slotSource" "SlotSource" NOT NULL DEFAULT 'MANAGER',
    "durationMinutes" INTEGER NOT NULL DEFAULT 45,
    "timezone" TEXT NOT NULL DEFAULT 'Africa/Cairo',
    "locationType" "InterviewLocationType" NOT NULL DEFAULT 'ONLINE',
    "locationDetails" TEXT,
    "message" TEXT,
    "additionalAttendees" TEXT[],
    "bookingToken" TEXT NOT NULL,
    "managerRespondedAt" TIMESTAMP(3),
    "lastNudgedAt" TIMESTAMP(3),
    "scheduledSlotId" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "companyId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "jobId" TEXT,
    "createdById" TEXT NOT NULL,
    "interviewerUserId" TEXT,

    CONSTRAINT "interviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interview_slots" (
    "id" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "interviewId" TEXT NOT NULL,

    CONSTRAINT "interview_slots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "interviews_bookingToken_key" ON "interviews"("bookingToken");

-- CreateIndex
CREATE UNIQUE INDEX "interviews_scheduledSlotId_key" ON "interviews"("scheduledSlotId");

-- CreateIndex
CREATE INDEX "interviews_companyId_status_idx" ON "interviews"("companyId", "status");

-- CreateIndex
CREATE INDEX "interviews_candidateId_idx" ON "interviews"("candidateId");

-- CreateIndex
CREATE INDEX "interviews_interviewerUserId_status_idx" ON "interviews"("interviewerUserId", "status");

-- CreateIndex
CREATE INDEX "interview_slots_interviewId_idx" ON "interview_slots"("interviewId");

-- AddForeignKey
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_interviewerUserId_fkey" FOREIGN KEY ("interviewerUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_slots" ADD CONSTRAINT "interview_slots_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "interviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;
