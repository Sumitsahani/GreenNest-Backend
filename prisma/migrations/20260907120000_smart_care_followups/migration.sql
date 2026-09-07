ALTER TABLE "CareReminder" ADD COLUMN "snoozedUntil" TIMESTAMP(3), ADD COLUMN "responseReason" TEXT, ADD COLUMN "notificationCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "UserSettings" ADD COLUMN "careTimezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata', ADD COLUMN "preferredCareHour" INTEGER NOT NULL DEFAULT 9;
ALTER TABLE "Notification" ADD COLUMN "plantId" UUID;
