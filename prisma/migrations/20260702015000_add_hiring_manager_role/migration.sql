-- AlterEnum
-- Replace INTERVIEWER with HIRING_MANAGER. Existing INTERVIEWER rows are
-- migrated to HIRING_MANAGER during the enum type conversion (CASE mapping).
BEGIN;
CREATE TYPE "UserRole_new" AS ENUM ('ADMIN', 'RECRUITER', 'HIRING_MANAGER', 'VIEWER');
ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "users" ALTER COLUMN "role" TYPE "UserRole_new" USING (
  CASE "role"::text
    WHEN 'INTERVIEWER' THEN 'HIRING_MANAGER'
    ELSE "role"::text
  END::"UserRole_new"
);
ALTER TYPE "UserRole" RENAME TO "UserRole_old";
ALTER TYPE "UserRole_new" RENAME TO "UserRole";
DROP TYPE "UserRole_old";
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'RECRUITER';
COMMIT;
