-- CreateTable
CREATE TABLE "CareReminder" (
    "id" UUID NOT NULL,
    "plantId" UUID NOT NULL,
    "type" "CareType" NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CareReminder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CareReminder_plantId_scheduledAt_idx" ON "CareReminder"("plantId", "scheduledAt");

-- CreateIndex
CREATE INDEX "CareReminder_enabled_scheduledAt_idx" ON "CareReminder"("enabled", "scheduledAt");

-- AddForeignKey
ALTER TABLE "CareReminder" ADD CONSTRAINT "CareReminder_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "GardenPlant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
