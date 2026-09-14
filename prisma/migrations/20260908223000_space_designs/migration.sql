CREATE TABLE "SpaceDesign" (
  "id" UUID NOT NULL,
  "spaceId" UUID NOT NULL,
  "requestId" UUID NOT NULL,
  "requestHash" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "style" "SpaceDesignStyle" NOT NULL,
  "carePreference" "SpaceCarePreference" NOT NULL,
  "scene" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SpaceDesign_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SpaceDesign_spaceId_requestId_key" ON "SpaceDesign"("spaceId", "requestId");
CREATE INDEX "SpaceDesign_spaceId_createdAt_idx" ON "SpaceDesign"("spaceId", "createdAt");
ALTER TABLE "SpaceDesign" ADD CONSTRAINT "SpaceDesign_spaceId_fkey"
  FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;
