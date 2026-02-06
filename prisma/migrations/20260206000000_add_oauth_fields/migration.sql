-- Add OAuth provider fields to users table
-- AlterTable
ALTER TABLE "users" ADD COLUMN "googleId" TEXT;
ALTER TABLE "users" ADD COLUMN "microsoftId" TEXT;
ALTER TABLE "users" ADD COLUMN "avatarUrl" TEXT;

-- Make passwordHash optional (already nullable in new users)
ALTER TABLE "users" ALTER COLUMN "passwordHash" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "users_googleId_key" ON "users"("googleId");

-- CreateIndex
CREATE UNIQUE INDEX "users_microsoftId_key" ON "users"("microsoftId");

-- CreateIndex
CREATE INDEX "users_googleId_idx" ON "users"("googleId");

-- CreateIndex
CREATE INDEX "users_microsoftId_idx" ON "users"("microsoftId");
