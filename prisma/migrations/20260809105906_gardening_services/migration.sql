-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('CONFIRMED', 'GARDENER_ASSIGNED', 'ON_THE_WAY', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "GardeningService" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "icon" TEXT NOT NULL,
    "inclusions" TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GardeningService_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Gardener" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "identityNumber" TEXT NOT NULL,
    "phoneMasked" TEXT NOT NULL,
    "rating" DECIMAL(2,1) NOT NULL DEFAULT 5,
    "jobsCompleted" INTEGER NOT NULL DEFAULT 0,
    "verified" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Gardener_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceBooking" (
    "id" UUID NOT NULL,
    "bookingNumber" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "serviceId" UUID NOT NULL,
    "gardenerId" UUID,
    "addressId" UUID NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'CONFIRMED',
    "notes" TEXT,
    "price" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceBooking_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GardeningService_slug_key" ON "GardeningService"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Gardener_identityNumber_key" ON "Gardener"("identityNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceBooking_bookingNumber_key" ON "ServiceBooking"("bookingNumber");

-- CreateIndex
CREATE INDEX "ServiceBooking_userId_createdAt_idx" ON "ServiceBooking"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ServiceBooking_gardenerId_scheduledAt_idx" ON "ServiceBooking"("gardenerId", "scheduledAt");

-- CreateIndex
CREATE INDEX "ServiceBooking_scheduledAt_status_idx" ON "ServiceBooking"("scheduledAt", "status");

-- AddForeignKey
ALTER TABLE "ServiceBooking" ADD CONSTRAINT "ServiceBooking_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "GardeningService"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceBooking" ADD CONSTRAINT "ServiceBooking_gardenerId_fkey" FOREIGN KEY ("gardenerId") REFERENCES "Gardener"("id") ON DELETE SET NULL ON UPDATE CASCADE;
