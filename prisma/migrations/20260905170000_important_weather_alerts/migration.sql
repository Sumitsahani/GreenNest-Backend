CREATE TABLE "WeatherAlertDelivery" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "locationKey" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "forecastStartsAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WeatherAlertDelivery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WeatherAlertDelivery_eventKey_key"
ON "WeatherAlertDelivery"("eventKey");

CREATE INDEX "WeatherAlertDelivery_userId_locationKey_sentAt_idx"
ON "WeatherAlertDelivery"("userId", "locationKey", "sentAt");
