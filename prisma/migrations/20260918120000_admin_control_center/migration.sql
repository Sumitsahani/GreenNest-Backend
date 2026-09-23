CREATE TABLE "AdminStaff" ("userId" UUID PRIMARY KEY, "email" TEXT NOT NULL UNIQUE, "role" TEXT NOT NULL CHECK ("role" IN ('SUPER_ADMIN','OPERATIONS_ADMIN','ORDER_ADMIN','FINANCE_ADMIN','GARDENER_ADMIN','SUPPORT_ADMIN','CONTENT_ADMIN')), "active" BOOLEAN NOT NULL DEFAULT true, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL);
CREATE TABLE "AdminAuditLog" ("id" UUID PRIMARY KEY, "actorId" UUID NOT NULL, "action" TEXT NOT NULL, "entity" TEXT NOT NULL, "entityId" TEXT NOT NULL, "before" JSONB, "after" JSONB, "reason" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX "AdminAuditLog_createdAt_idx" ON "AdminAuditLog"("createdAt");
CREATE INDEX "AdminAuditLog_entity_entityId_idx" ON "AdminAuditLog"("entity", "entityId");
CREATE TABLE "AdminNotificationDraft" ("id" UUID PRIMARY KEY, "title" TEXT NOT NULL, "message" TEXT NOT NULL, "userId" UUID NOT NULL, "status" TEXT NOT NULL DEFAULT 'DRAFT', "createdBy" UUID NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL);
ALTER TABLE "AdminStaff" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AdminAuditLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AdminNotificationDraft" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "AdminStaff", "AdminAuditLog", "AdminNotificationDraft" FROM anon, authenticated;
