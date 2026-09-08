CREATE TYPE "SpaceAnalysisStatus" AS ENUM ('ANALYZING', 'COMPLETED', 'FAILED');
CREATE TYPE "SpaceType" AS ENUM ('LIVING_ROOM', 'BEDROOM', 'BALCONY', 'OFFICE', 'TERRACE', 'KITCHEN', 'CAFE', 'RESTAURANT', 'RECEPTION', 'SHOP', 'STUDIO', 'OTHER', 'UNKNOWN');
CREATE TYPE "SpaceEnvironment" AS ENUM ('INDOOR', 'OUTDOOR', 'UNKNOWN');

CREATE TABLE "Space" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "photoPath" TEXT NOT NULL,
    "declaredType" "SpaceType",
    "detectedType" "SpaceType",
    "environment" "SpaceEnvironment",
    "analysisStatus" "SpaceAnalysisStatus" NOT NULL DEFAULT 'ANALYZING',
    "analysisError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Space_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SpaceScene" (
    "id" UUID NOT NULL,
    "spaceId" UUID NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "proportions" JSONB NOT NULL,
    "objects" JSONB NOT NULL,
    "surfaces" JSONB NOT NULL,
    "environment" JSONB NOT NULL,
    "placementZones" JSONB NOT NULL,
    "confidence" DECIMAL(3,2) NOT NULL,
    "warnings" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "analysisModel" TEXT NOT NULL,
    "analyzedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpaceScene_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Space_userId_updatedAt_idx" ON "Space"("userId", "updatedAt");
CREATE INDEX "Space_userId_analysisStatus_idx" ON "Space"("userId", "analysisStatus");
CREATE UNIQUE INDEX "SpaceScene_spaceId_key" ON "SpaceScene"("spaceId");
CREATE INDEX "SpaceScene_analyzedAt_idx" ON "SpaceScene"("analyzedAt");

ALTER TABLE "SpaceScene" ADD CONSTRAINT "SpaceScene_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;
