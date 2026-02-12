-- AlterTable
ALTER TABLE "email_connections" ADD COLUMN "watchExpiration" TIMESTAMP(3),
ADD COLUMN "watchHistoryId" TEXT;
