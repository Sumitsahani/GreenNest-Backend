CREATE TYPE "PlantEnvironment" AS ENUM ('INDOOR', 'OUTDOOR');

ALTER TABLE "GardenPlant"
ADD COLUMN "environment" "PlantEnvironment" NOT NULL DEFAULT 'INDOOR',
ADD COLUMN "recommendedEnvironment" "PlantEnvironment",
ADD COLUMN "environmentReason" TEXT,
ADD COLUMN "indoorRisks" TEXT,
ADD COLUMN "indoorAdaptationAdvice" TEXT;

ALTER TABLE "PushDevice"
ADD COLUMN "locationLabel" TEXT,
ADD COLUMN "latitude" DOUBLE PRECISION,
ADD COLUMN "longitude" DOUBLE PRECISION,
ADD COLUMN "locationUpdatedAt" TIMESTAMP(3);

CREATE INDEX "PushDevice_active_latitude_longitude_idx"
ON "PushDevice"("active", "latitude", "longitude");
