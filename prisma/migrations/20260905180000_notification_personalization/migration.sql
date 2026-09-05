CREATE TYPE "NotificationAgeGroup" AS ENUM (
    'UNSPECIFIED',
    'UNDER_18',
    'AGE_18_35',
    'AGE_36_PLUS'
);

CREATE TYPE "NotificationTone" AS ENUM (
    'AUTO',
    'PLAYFUL',
    'CALM',
    'MINIMAL'
);

ALTER TABLE "UserSettings"
ADD COLUMN "notificationAgeGroup" "NotificationAgeGroup" NOT NULL DEFAULT 'UNSPECIFIED',
ADD COLUMN "notificationTone" "NotificationTone" NOT NULL DEFAULT 'AUTO';
