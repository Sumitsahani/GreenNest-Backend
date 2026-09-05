ALTER TABLE "GardenPlant"
ADD COLUMN "lastWateredAt" TIMESTAMP(3),
ADD COLUMN "idealSunlight" TEXT,
ADD COLUMN "placementAdvice" TEXT,
ADD COLUMN "carePlan" TEXT;
