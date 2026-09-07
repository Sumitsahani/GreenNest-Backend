CREATE TYPE "CareSessionStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'UNDONE');
CREATE TYPE "CareSessionItemStatus" AS ENUM ('COMPLETED', 'SKIPPED', 'UNDONE');
CREATE TYPE "RecoveryCheckpointStatus" AS ENUM ('PENDING', 'COMPLETED', 'CANCELLED');

ALTER TABLE "UserSettings" ADD COLUMN "aiLanguage" TEXT NOT NULL DEFAULT 'AUTO';
ALTER TABLE "ai_conversations" ADD COLUMN "active_request_id" TEXT;

CREATE TABLE "CareSession" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "userId" UUID NOT NULL,
  "actionType" "CareType" NOT NULL, "source" "EvidenceSource" NOT NULL DEFAULT 'USER_REPORTED',
  "confidence" DECIMAL(3,2) NOT NULL DEFAULT 0.8, "status" "CareSessionStatus" NOT NULL DEFAULT 'ACTIVE',
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "completedAt" TIMESTAMP(3),
  "undoneAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "CareSession_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "CareSessionItem" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "sessionId" UUID NOT NULL, "plantId" UUID NOT NULL,
  "status" "CareSessionItemStatus" NOT NULL, "caredAt" TIMESTAMP(3), "eventId" UUID, "careEventId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CareSessionItem_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "GardenReview" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "userId" UUID NOT NULL, "periodStart" TIMESTAMP(3) NOT NULL,
  "periodEnd" TIMESTAMP(3) NOT NULL, "summary" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GardenReview_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "RecoveryCheckpoint" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "userId" UUID NOT NULL, "plantId" UUID NOT NULL,
  "treatmentEventId" UUID NOT NULL, "dayOffset" INTEGER NOT NULL, "dueAt" TIMESTAMP(3) NOT NULL,
  "status" "RecoveryCheckpointStatus" NOT NULL DEFAULT 'PENDING', "completedAt" TIMESTAMP(3),
  "outcome" "PlantOutcomeType", "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "RecoveryCheckpoint_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "EngagementEvent" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "userId" UUID NOT NULL, "name" TEXT NOT NULL,
  "properties" JSONB, "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EngagementEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CareSession_userId_createdAt_idx" ON "CareSession"("userId", "createdAt");
CREATE INDEX "CareSession_userId_status_idx" ON "CareSession"("userId", "status");
CREATE UNIQUE INDEX "CareSessionItem_sessionId_plantId_key" ON "CareSessionItem"("sessionId", "plantId");
CREATE INDEX "CareSessionItem_plantId_createdAt_idx" ON "CareSessionItem"("plantId", "createdAt");
CREATE UNIQUE INDEX "GardenReview_userId_periodStart_key" ON "GardenReview"("userId", "periodStart");
CREATE INDEX "GardenReview_userId_periodEnd_idx" ON "GardenReview"("userId", "periodEnd");
CREATE UNIQUE INDEX "RecoveryCheckpoint_treatmentEventId_dayOffset_key" ON "RecoveryCheckpoint"("treatmentEventId", "dayOffset");
CREATE INDEX "RecoveryCheckpoint_userId_status_dueAt_idx" ON "RecoveryCheckpoint"("userId", "status", "dueAt");
CREATE INDEX "RecoveryCheckpoint_plantId_status_idx" ON "RecoveryCheckpoint"("plantId", "status");
CREATE INDEX "EngagementEvent_userId_name_occurredAt_idx" ON "EngagementEvent"("userId", "name", "occurredAt");
CREATE INDEX "EngagementEvent_name_occurredAt_idx" ON "EngagementEvent"("name", "occurredAt");

ALTER TABLE "CareSessionItem" ADD CONSTRAINT "CareSessionItem_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "CareSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CareSessionItem" ADD CONSTRAINT "CareSessionItem_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "GardenPlant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RecoveryCheckpoint" ADD CONSTRAINT "RecoveryCheckpoint_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "GardenPlant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
