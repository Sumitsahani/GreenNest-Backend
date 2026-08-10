CREATE TABLE "RewardTransaction" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "points" INTEGER NOT NULL,
  "type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "referenceId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RewardTransaction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RewardRedemption" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "rewardId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "pointsCost" INTEGER NOT NULL,
  "code" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RewardRedemption_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RewardTransaction_type_referenceId_key"
ON "RewardTransaction"("type", "referenceId");
CREATE INDEX "RewardTransaction_userId_createdAt_idx"
ON "RewardTransaction"("userId", "createdAt");
CREATE UNIQUE INDEX "RewardRedemption_code_key" ON "RewardRedemption"("code");
CREATE INDEX "RewardRedemption_userId_createdAt_idx"
ON "RewardRedemption"("userId", "createdAt");
