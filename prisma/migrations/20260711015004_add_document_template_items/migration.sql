-- CreateTable
CREATE TABLE "document_template_items" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "includeByDefault" BOOLEAN NOT NULL DEFAULT true,
    "orderIndex" INTEGER NOT NULL,
    "companyId" TEXT NOT NULL,

    CONSTRAINT "document_template_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "document_template_items_companyId_orderIndex_idx" ON "document_template_items"("companyId", "orderIndex");

-- AddForeignKey
ALTER TABLE "document_template_items" ADD CONSTRAINT "document_template_items_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
