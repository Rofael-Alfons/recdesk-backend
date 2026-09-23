-- AlterTable
ALTER TABLE "candidates" ADD COLUMN     "photoFileName" TEXT,
ADD COLUMN     "photoUrl" TEXT;

-- AlterTable
ALTER TABLE "document_checklist_items" ADD COLUMN     "isPersonalPhoto" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "document_template_items" ADD COLUMN     "isPersonalPhoto" BOOLEAN NOT NULL DEFAULT false;
