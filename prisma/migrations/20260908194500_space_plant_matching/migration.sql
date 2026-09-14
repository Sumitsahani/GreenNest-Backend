CREATE TYPE "SpaceDesignStyle" AS ENUM ('MINIMAL', 'JUNGLE', 'PREMIUM', 'LOW_MAINTENANCE');
CREATE TYPE "SpaceCarePreference" AS ENUM ('EASY', 'MODERATE', 'FLEXIBLE');
CREATE TYPE "MatchConfidence" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

CREATE TABLE "SpacePlantRecommendation" (
    "id" UUID NOT NULL,
    "spaceId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "zoneId" TEXT NOT NULL,
    "style" "SpaceDesignStyle" NOT NULL,
    "carePreference" "SpaceCarePreference" NOT NULL,
    "rank" INTEGER NOT NULL,
    "designScore" INTEGER NOT NULL,
    "environmentScore" INTEGER NOT NULL,
    "lightScore" INTEGER NOT NULL,
    "spaceScore" INTEGER NOT NULL,
    "careScore" INTEGER NOT NULL,
    "preferenceScore" INTEGER NOT NULL,
    "overallScore" INTEGER NOT NULL,
    "confidence" "MatchConfidence" NOT NULL,
    "reasonEnglish" TEXT NOT NULL,
    "reasonHindi" TEXT NOT NULL,
    "cautionEnglish" TEXT,
    "cautionHindi" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpacePlantRecommendation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SpacePlantRecommendation_spaceId_productId_style_carePreference_key"
ON "SpacePlantRecommendation"("spaceId", "productId", "style", "carePreference");
CREATE INDEX "SpacePlantRecommendation_spaceId_style_carePreference_rank_idx"
ON "SpacePlantRecommendation"("spaceId", "style", "carePreference", "rank");
CREATE INDEX "SpacePlantRecommendation_productId_idx"
ON "SpacePlantRecommendation"("productId");

ALTER TABLE "SpacePlantRecommendation"
ADD CONSTRAINT "SpacePlantRecommendation_spaceId_fkey"
FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SpacePlantRecommendation"
ADD CONSTRAINT "SpacePlantRecommendation_productId_fkey"
FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
