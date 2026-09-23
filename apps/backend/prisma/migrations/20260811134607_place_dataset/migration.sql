-- AlterTable
ALTER TABLE "POI" ADD COLUMN     "names" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "prominence" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "wikiTitles" JSONB NOT NULL DEFAULT '{}',
ALTER COLUMN "summary" DROP NOT NULL,
ALTER COLUMN "facts" SET DEFAULT '[]',
ALTER COLUMN "photos" SET DEFAULT '[]';

-- CreateIndex
CREATE INDEX "POI_prominence_idx" ON "POI"("prominence");

-- CreateIndex
CREATE INDEX "POI_category_idx" ON "POI"("category");
