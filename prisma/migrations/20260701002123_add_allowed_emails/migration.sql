-- CreateEnum
CREATE TYPE "AllowlistEntryType" AS ENUM ('EMAIL', 'DOMAIN');

-- CreateTable
CREATE TABLE "allowed_emails" (
    "id" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "type" "AllowlistEntryType" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "allowed_emails_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "allowed_emails_value_key" ON "allowed_emails"("value");

-- CreateIndex
CREATE INDEX "allowed_emails_type_idx" ON "allowed_emails"("type");
