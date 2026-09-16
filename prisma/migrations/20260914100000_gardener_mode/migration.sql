-- AlterEnum
ALTER TYPE "EvidenceSource" ADD VALUE 'GARDENER_OBSERVATION';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "BookingStatus" ADD VALUE 'REQUESTED';
ALTER TYPE "BookingStatus" ADD VALUE 'ACCEPTED';
ALTER TYPE "BookingStatus" ADD VALUE 'ARRIVED';
ALTER TYPE "BookingStatus" ADD VALUE 'INSPECTION';
ALTER TYPE "BookingStatus" ADD VALUE 'CUSTOMER_CONFIRMED';
ALTER TYPE "BookingStatus" ADD VALUE 'OUTCOME_RECORDED';
ALTER TYPE "BookingStatus" ADD VALUE 'REJECTED';
ALTER TYPE "BookingStatus" ADD VALUE 'NO_SHOW';

-- AlterTable
ALTER TABLE "GardeningService" ADD COLUMN     "commissionBps" INTEGER;

-- AlterTable
ALTER TABLE "Gardener" ADD COLUMN     "about" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "available" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "avatarUrl" TEXT,
ADD COLUMN     "city" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "endTime" TEXT NOT NULL DEFAULT '18:00',
ADD COLUMN     "experienceYears" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "languages" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "plantTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "postalCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "profileComplete" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "serviceAreas" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "serviceIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "serviceRadiusKm" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN     "skills" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "startTime" TEXT NOT NULL DEFAULT '08:00',
ADD COLUMN     "userId" UUID,
ADD COLUMN     "workingDays" INTEGER[] DEFAULT ARRAY[1, 2, 3, 4, 5, 6]::INTEGER[],
ALTER COLUMN "verified" SET DEFAULT false;

-- AlterTable
ALTER TABLE "ServiceBooking" ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "completionNotes" TEXT,
ADD COLUMN     "confirmedAt" TIMESTAMP(3),
ADD COLUMN     "customerName" TEXT,
ADD COLUMN     "issue" TEXT,
ADD COLUMN     "plantIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "rating" INTEGER,
ADD COLUMN     "visitStartedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "BookingActivity" (
    "id" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "requestId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "plantId" UUID,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookingActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GardenerPayout" (
    "id" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "gardenerId" UUID NOT NULL,
    "gross" DECIMAL(10,2) NOT NULL,
    "platformFee" DECIMAL(10,2),
    "net" DECIMAL(10,2),
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reference" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GardenerPayout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BookingActivity_bookingId_createdAt_idx" ON "BookingActivity"("bookingId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BookingActivity_bookingId_actorId_requestId_key" ON "BookingActivity"("bookingId", "actorId", "requestId");

-- CreateIndex
CREATE UNIQUE INDEX "GardenerPayout_bookingId_key" ON "GardenerPayout"("bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "GardenerPayout_reference_key" ON "GardenerPayout"("reference");

-- CreateIndex
CREATE INDEX "GardenerPayout_gardenerId_createdAt_idx" ON "GardenerPayout"("gardenerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Gardener_userId_key" ON "Gardener"("userId");

-- AddForeignKey
ALTER TABLE "BookingActivity" ADD CONSTRAINT "BookingActivity_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "ServiceBooking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GardenerPayout" ADD CONSTRAINT "GardenerPayout_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "ServiceBooking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GardenerPayout" ADD CONSTRAINT "GardenerPayout_gardenerId_fkey" FOREIGN KEY ("gardenerId") REFERENCES "Gardener"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "GardeningService" ADD CONSTRAINT "service_commission_range" CHECK ("commissionBps" BETWEEN 0 AND 10000);
ALTER TABLE "ServiceBooking" ADD CONSTRAINT "booking_rating_range" CHECK ("rating" BETWEEN 1 AND 5);
ALTER TABLE "GardenerPayout" ADD CONSTRAINT "payout_nonnegative" CHECK ("gross" >= 0 AND "net" >= 0 AND "platformFee" >= 0);
