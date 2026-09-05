CREATE TYPE "AiMessageRole" AS ENUM ('USER', 'ASSISTANT', 'SYSTEM');
CREATE TYPE "AiMemoryType" AS ENUM ('PREFERENCE', 'ENVIRONMENT', 'GOAL', 'EXPERIENCE', 'GARDEN_PREFERENCE', 'PLANT_PREFERENCE', 'SHOPPING_PREFERENCE', 'CARE_PREFERENCE');

CREATE TABLE "ai_conversations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "title" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ai_conversations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ai_messages" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "conversation_id" UUID NOT NULL,
  "role" "AiMessageRole" NOT NULL,
  "content" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_messages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ai_user_memories" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "memory_key" TEXT NOT NULL,
  "memory_value" TEXT NOT NULL,
  "memory_type" "AiMemoryType" NOT NULL,
  "confidence" DECIMAL(3,2) NOT NULL DEFAULT 0.9,
  "source" TEXT NOT NULL DEFAULT 'conversation',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "last_used_at" TIMESTAMP(3),
  CONSTRAINT "ai_user_memories_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ai_conversations_user_id_updated_at_idx" ON "ai_conversations"("user_id", "updated_at");
CREATE INDEX "ai_messages_conversation_id_created_at_idx" ON "ai_messages"("conversation_id", "created_at");
CREATE UNIQUE INDEX "ai_user_memories_user_id_memory_key_key" ON "ai_user_memories"("user_id", "memory_key");
CREATE INDEX "ai_user_memories_user_id_memory_type_updated_at_idx" ON "ai_user_memories"("user_id", "memory_type", "updated_at");
CREATE INDEX "ai_user_memories_user_id_last_used_at_idx" ON "ai_user_memories"("user_id", "last_used_at");
ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "ai_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
