-- AlterEnum
ALTER TYPE "EmailTemplateType" ADD VALUE 'WELCOME';

-- DropForeignKey
ALTER TABLE "candidate_actions" DROP CONSTRAINT "candidate_actions_userId_fkey";

-- DropForeignKey
ALTER TABLE "emails_sent" DROP CONSTRAINT "emails_sent_sentById_fkey";

-- AlterTable
ALTER TABLE "candidate_actions" ALTER COLUMN "userId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "candidates" ADD COLUMN     "startDate" DATE,
ADD COLUMN     "welcomeEmailSentAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "emails_sent" ALTER COLUMN "sentById" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "candidate_actions" ADD CONSTRAINT "candidate_actions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emails_sent" ADD CONSTRAINT "emails_sent_sentById_fkey" FOREIGN KEY ("sentById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
