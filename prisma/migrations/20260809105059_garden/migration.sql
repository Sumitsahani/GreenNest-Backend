-- CreateEnum
CREATE TYPE "CareType" AS ENUM ('WATER', 'FERTILIZE', 'PRUNE', 'REPOT', 'NOTE');

-- CreateTable
CREATE TABLE "GardenPlant" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "species" TEXT,
    "location" TEXT NOT NULL,
    "notes" TEXT,
    "imageUrl" TEXT,
    "health" INTEGER NOT NULL DEFAULT 100,
    "wateringDays" INTEGER NOT NULL DEFAULT 7,
    "nextWateringAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GardenPlant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CareEvent" (
    "id" UUID NOT NULL,
    "plantId" UUID NOT NULL,
    "type" "CareType" NOT NULL,
    "note" TEXT,
    "caredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CareEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GardenPlant_userId_createdAt_idx" ON "GardenPlant"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "GardenPlant_userId_nextWateringAt_idx" ON "GardenPlant"("userId", "nextWateringAt");

-- CreateIndex
CREATE INDEX "CareEvent_plantId_caredAt_idx" ON "CareEvent"("plantId", "caredAt");

-- AddForeignKey
ALTER TABLE "CareEvent" ADD CONSTRAINT "CareEvent_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "GardenPlant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
