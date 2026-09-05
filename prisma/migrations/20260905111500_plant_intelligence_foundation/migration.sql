-- Extend the existing memory and garden models without deleting historical data.
ALTER TYPE "AiMemoryType" ADD VALUE IF NOT EXISTS 'PLANT_OBSERVATION';
ALTER TYPE "AiMemoryType" ADD VALUE IF NOT EXISTS 'USER_PATTERN';
ALTER TYPE "AiMemoryType" ADD VALUE IF NOT EXISTS 'USER_CORRECTION';
ALTER TYPE "AiMemoryType" ADD VALUE IF NOT EXISTS 'PLANT_OUTCOME';
ALTER TYPE "AiMemoryType" ADD VALUE IF NOT EXISTS 'SUCCESSFUL_CARE_PATTERN';

CREATE TYPE "PlantLifecycleStatus" AS ENUM ('ACTIVE', 'MOVED', 'GIFTED', 'SOLD', 'DIED', 'REMOVED', 'ARCHIVED');
CREATE TYPE "PlantEventType" AS ENUM ('CREATED', 'IDENTIFIED', 'WATERED', 'WATERING_SKIPPED', 'FERTILIZED', 'REPOTTED', 'MOVED', 'PHOTO_UPLOADED', 'HEALTH_ISSUE', 'SYMPTOM_REPORTED', 'TREATMENT_APPLIED', 'USER_NOTE', 'RECOMMENDATION_GENERATED', 'RECOMMENDATION_SHOWN', 'RECOMMENDATION_ACCEPTED', 'RECOMMENDATION_REJECTED', 'RECOMMENDATION_SKIPPED', 'RECOMMENDATION_DISMISSED', 'RECOMMENDATION_COMPLETED', 'OUTCOME_RECORDED');
CREATE TYPE "PlantOutcomeType" AS ENUM ('HEALTHY', 'IMPROVED', 'DECLINED', 'DIED', 'GIFTED', 'REMOVED', 'UNKNOWN');
CREATE TYPE "EvidenceSource" AS ENUM ('USER_STATEMENT', 'USER_CORRECTION', 'USER_ACTION', 'SYSTEM_EVENT', 'PLANT_ANALYSIS', 'AI_INFERENCE');
CREATE TYPE "MemoryStatus" AS ENUM ('ACTIVE', 'SUPERSEDED', 'ARCHIVED');
CREATE TYPE "RecommendationAction" AS ENUM ('WATER', 'SKIP_WATERING', 'INSPECT', 'MOVE_TO_LIGHT', 'MOVE_TO_SHADE', 'FERTILIZE', 'REPOT', 'TREAT', 'MONITOR', 'NO_ACTION');
CREATE TYPE "RecommendationPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');
CREATE TYPE "RecommendationStatus" AS ENUM ('GENERATED', 'SHOWN', 'ACCEPTED', 'REJECTED', 'SKIPPED', 'DISMISSED', 'COMPLETED');
CREATE TYPE "RecommendationOutcome" AS ENUM ('POSITIVE', 'NEUTRAL', 'NEGATIVE', 'UNKNOWN');
CREATE TYPE "PlantRelationshipType" AS ENUM ('SAME_SPECIES', 'SIMILAR_SPECIES', 'SAME_PROBLEM_HISTORY', 'SIMILAR_ENVIRONMENT', 'USER_PATTERN');
CREATE TYPE "AiFeedbackReason" AS ENUM ('WRONG_PLANT', 'WRONG_ADVICE', 'OUTDATED_INFORMATION', 'NOT_RELEVANT', 'ALREADY_FIXED', 'OTHER');

ALTER TABLE "GardenPlant"
  ADD COLUMN "category" TEXT,
  ADD COLUMN "source" TEXT,
  ADD COLUMN "acquiredAt" TIMESTAMP(3),
  ADD COLUMN "lifecycleStatus" "PlantLifecycleStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "statusUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "ai_messages"
  ADD COLUMN "plant_id" UUID,
  ADD COLUMN "intent" TEXT,
  ADD COLUMN "sources_used" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "ai_user_memories"
  ADD COLUMN "plant_id" UUID,
  ADD COLUMN "scope_key" TEXT NOT NULL DEFAULT 'USER',
  ADD COLUMN "status" "MemoryStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "evidence" JSONB,
  ADD COLUMN "reinforcement_count" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "superseded_at" TIMESTAMP(3);

ALTER TABLE "ai_user_memories" ALTER COLUMN "source" DROP DEFAULT;
ALTER TABLE "ai_user_memories"
  ALTER COLUMN "source" TYPE "EvidenceSource"
  USING (
    CASE
      WHEN lower("source") = 'user_correction' THEN 'USER_CORRECTION'
      WHEN lower("source") = 'user_action' THEN 'USER_ACTION'
      WHEN lower("source") = 'plant_analysis' THEN 'PLANT_ANALYSIS'
      WHEN lower("source") = 'ai_inference' THEN 'AI_INFERENCE'
      WHEN lower("source") = 'system_event' THEN 'SYSTEM_EVENT'
      ELSE 'USER_STATEMENT'
    END
  )::"EvidenceSource";
ALTER TABLE "ai_user_memories" ALTER COLUMN "source" SET DEFAULT 'USER_STATEMENT';

DROP INDEX IF EXISTS "ai_user_memories_user_id_memory_key_key";
DROP INDEX IF EXISTS "ai_user_memories_user_id_memory_type_updated_at_idx";
CREATE UNIQUE INDEX "ai_user_memories_user_id_scope_key_memory_key_key" ON "ai_user_memories"("user_id", "scope_key", "memory_key");
CREATE INDEX "ai_user_memories_user_id_status_memory_type_updated_at_idx" ON "ai_user_memories"("user_id", "status", "memory_type", "updated_at");
CREATE INDEX "ai_user_memories_plant_id_status_updated_at_idx" ON "ai_user_memories"("plant_id", "status", "updated_at");

CREATE TABLE "PlantEvent" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "plantId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "type" "PlantEventType" NOT NULL,
  "eventKey" TEXT,
  "value" JSONB,
  "note" TEXT,
  "source" "EvidenceSource" NOT NULL DEFAULT 'SYSTEM_EVENT',
  "confidence" DECIMAL(3,2) NOT NULL DEFAULT 1,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlantEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PlantPhoto" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "plantId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "url" TEXT NOT NULL,
  "analysis" JSONB,
  "source" "EvidenceSource" NOT NULL DEFAULT 'USER_ACTION',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlantPhoto_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PlantOutcomeRecord" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "plantId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "outcome" "PlantOutcomeType" NOT NULL,
  "reason" TEXT,
  "confidence" DECIMAL(3,2) NOT NULL DEFAULT 1,
  "source" "EvidenceSource" NOT NULL,
  "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlantOutcomeRecord_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PlantRecommendation" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "plantId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "action" "RecommendationAction" NOT NULL,
  "priority" "RecommendationPriority" NOT NULL,
  "confidence" DECIMAL(3,2) NOT NULL,
  "reason" TEXT NOT NULL,
  "signals" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "status" "RecommendationStatus" NOT NULL DEFAULT 'GENERATED',
  "shownAt" TIMESTAMP(3),
  "respondedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "userResponseReason" TEXT,
  "outcome" "RecommendationOutcome",
  "outcomeNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlantRecommendation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PlantRelationship" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  "newPlantId" UUID NOT NULL,
  "previousPlantId" UUID NOT NULL,
  "type" "PlantRelationshipType" NOT NULL,
  "reason" TEXT NOT NULL,
  "confidence" DECIMAL(3,2) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlantRelationship_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ai_feedback" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "message_id" UUID,
  "helpful" BOOLEAN NOT NULL,
  "reason" "AiFeedbackReason",
  "note" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_feedback_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "GardenPlant_userId_lifecycleStatus_updatedAt_idx" ON "GardenPlant"("userId", "lifecycleStatus", "updatedAt");
CREATE INDEX "GardenPlant_userId_species_lifecycleStatus_idx" ON "GardenPlant"("userId", "species", "lifecycleStatus");
CREATE INDEX "PlantEvent_userId_occurredAt_idx" ON "PlantEvent"("userId", "occurredAt");
CREATE INDEX "PlantEvent_plantId_occurredAt_idx" ON "PlantEvent"("plantId", "occurredAt");
CREATE INDEX "PlantEvent_plantId_type_occurredAt_idx" ON "PlantEvent"("plantId", "type", "occurredAt");
CREATE INDEX "PlantPhoto_userId_createdAt_idx" ON "PlantPhoto"("userId", "createdAt");
CREATE INDEX "PlantPhoto_plantId_createdAt_idx" ON "PlantPhoto"("plantId", "createdAt");
CREATE INDEX "PlantOutcomeRecord_userId_outcome_recordedAt_idx" ON "PlantOutcomeRecord"("userId", "outcome", "recordedAt");
CREATE INDEX "PlantOutcomeRecord_plantId_recordedAt_idx" ON "PlantOutcomeRecord"("plantId", "recordedAt");
CREATE INDEX "PlantRecommendation_userId_status_createdAt_idx" ON "PlantRecommendation"("userId", "status", "createdAt");
CREATE INDEX "PlantRecommendation_plantId_status_createdAt_idx" ON "PlantRecommendation"("plantId", "status", "createdAt");
CREATE UNIQUE INDEX "PlantRelationship_newPlantId_previousPlantId_type_key" ON "PlantRelationship"("newPlantId", "previousPlantId", "type");
CREATE INDEX "PlantRelationship_userId_newPlantId_idx" ON "PlantRelationship"("userId", "newPlantId");
CREATE INDEX "PlantRelationship_userId_previousPlantId_idx" ON "PlantRelationship"("userId", "previousPlantId");
CREATE INDEX "ai_feedback_user_id_created_at_idx" ON "ai_feedback"("user_id", "created_at");
CREATE INDEX "ai_feedback_message_id_idx" ON "ai_feedback"("message_id");

ALTER TABLE "PlantEvent" ADD CONSTRAINT "PlantEvent_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "GardenPlant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlantPhoto" ADD CONSTRAINT "PlantPhoto_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "GardenPlant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlantOutcomeRecord" ADD CONSTRAINT "PlantOutcomeRecord_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "GardenPlant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlantRecommendation" ADD CONSTRAINT "PlantRecommendation_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "GardenPlant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlantRelationship" ADD CONSTRAINT "PlantRelationship_newPlantId_fkey" FOREIGN KEY ("newPlantId") REFERENCES "GardenPlant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlantRelationship" ADD CONSTRAINT "PlantRelationship_previousPlantId_fkey" FOREIGN KEY ("previousPlantId") REFERENCES "GardenPlant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_plant_id_fkey" FOREIGN KEY ("plant_id") REFERENCES "GardenPlant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ai_user_memories" ADD CONSTRAINT "ai_user_memories_plant_id_fkey" FOREIGN KEY ("plant_id") REFERENCES "GardenPlant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_feedback" ADD CONSTRAINT "ai_feedback_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "ai_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
