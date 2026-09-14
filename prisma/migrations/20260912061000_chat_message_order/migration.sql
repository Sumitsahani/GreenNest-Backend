ALTER TABLE "ai_messages" ADD COLUMN "request_id" UUID;
ALTER TABLE "ai_messages" ADD COLUMN "batch_index" INTEGER NOT NULL DEFAULT 0;
CREATE SEQUENCE "ai_messages_sequence_seq";
ALTER TABLE "ai_messages" ADD COLUMN "sequence" INTEGER;
WITH ordered AS (SELECT id, row_number() OVER (ORDER BY created_at, id) AS n FROM ai_messages)
UPDATE ai_messages SET sequence = ordered.n FROM ordered WHERE ordered.id = ai_messages.id;
SELECT setval('ai_messages_sequence_seq', COALESCE((SELECT MAX(sequence) FROM ai_messages), 0) + 1, false);
ALTER TABLE "ai_messages" ALTER COLUMN "sequence" SET DEFAULT nextval('ai_messages_sequence_seq');
ALTER TABLE "ai_messages" ALTER COLUMN "sequence" SET NOT NULL;
ALTER SEQUENCE "ai_messages_sequence_seq" OWNED BY "ai_messages"."sequence";
CREATE UNIQUE INDEX "ai_messages_sequence_key" ON "ai_messages"("sequence");
CREATE UNIQUE INDEX "ai_messages_conversation_id_request_id_role_batch_index_key" ON "ai_messages"("conversation_id", "request_id", "role", "batch_index");
