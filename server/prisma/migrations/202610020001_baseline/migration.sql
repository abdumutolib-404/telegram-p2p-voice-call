-- CreateEnum
CREATE TYPE "IeltsPart" AS ENUM ('PART_1', 'PART_2', 'PART_3');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "telegramId" BIGINT NOT NULL,
    "alias" TEXT NOT NULL,
    "subFC" DOUBLE PRECISION NOT NULL DEFAULT 6.0,
    "subLR" DOUBLE PRECISION NOT NULL DEFAULT 6.0,
    "subGRA" DOUBLE PRECISION NOT NULL DEFAULT 6.0,
    "subP" DOUBLE PRECISION NOT NULL DEFAULT 6.0,
    "band" DOUBLE PRECISION NOT NULL DEFAULT 6.0,
    "plan" TEXT NOT NULL DEFAULT 'FREE',
    "subscriptionStatus" TEXT NOT NULL DEFAULT 'NONE',
    "subscriptionExpiresAt" TIMESTAMP(3),
    "customPlanName" TEXT,
    "maxDuration" INTEGER NOT NULL DEFAULT 15,
    "dailyLimit" INTEGER NOT NULL DEFAULT 3,
    "dailyCallsUsed" INTEGER NOT NULL DEFAULT 0,
    "retentionOverride" INTEGER,
    "recordingLimitOverride" INTEGER,
    "referredByUserId" TEXT,
    "referredAt" TIMESTAMP(3),
    "lastCallDate" TEXT,
    "warningCount" INTEGER NOT NULL DEFAULT 0,
    "isBanned" BOOLEAN NOT NULL DEFAULT false,
    "bannedUntil" TIMESTAMP(3),
    "isPermanentlyBanned" BOOLEAN NOT NULL DEFAULT false,
    "dnd" BOOLEAN NOT NULL DEFAULT false,
    "onboarded" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CallSession" (
    "id" TEXT NOT NULL,
    "roomName" TEXT NOT NULL,
    "userAId" TEXT NOT NULL,
    "userBId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "egressId" TEXT,
    "recordingUrl" TEXT,
    "recordingExpiresAt" TIMESTAMP(3),
    "recordedByUserId" TEXT,
    "duration" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "CallSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CallRating" (
    "id" TEXT NOT NULL,
    "callId" TEXT NOT NULL,
    "raterId" TEXT NOT NULL,
    "ratedId" TEXT NOT NULL,
    "stars" INTEGER NOT NULL,
    "feedback" TEXT,
    "reported" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CallRating_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnblockAppeal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "telegramId" BIGINT NOT NULL,
    "alias" TEXT NOT NULL,
    "banReason" TEXT NOT NULL,
    "appealText" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "UnblockAppeal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StarsTransaction" (
    "id" TEXT NOT NULL,
    "orderNumber" TEXT,
    "userId" TEXT NOT NULL,
    "telegramPaymentId" TEXT NOT NULL,
    "starsAmount" INTEGER NOT NULL,
    "planTier" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PAID',
    "refundReason" TEXT,
    "refundedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StarsTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManualPaymentRequest" (
    "id" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL DEFAULT 'A0',
    "userId" TEXT NOT NULL,
    "telegramId" BIGINT NOT NULL,
    "alias" TEXT NOT NULL,
    "plan" TEXT NOT NULL,
    "uzsAmount" INTEGER NOT NULL,
    "paymentProof" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "refundCardNumber" TEXT,
    "refundProof" TEXT,
    "refundReason" TEXT,
    "adminNote" TEXT,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ManualPaymentRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetId" TEXT,
    "adminId" TEXT NOT NULL,
    "beforeState" TEXT,
    "afterState" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FavoritePartner" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FavoritePartner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferralReward" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "referredUserId" TEXT NOT NULL,
    "qualifyingCallId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "expiresAt" TIMESTAMP(3),
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReferralReward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contest" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'IELTS Speaking Referral Championship',
    "description" TEXT NOT NULL DEFAULT 'Invite your friends to practice IELTS speaking! Top referrers win exclusive custom plans and prizes.',
    "prizes" TEXT NOT NULL DEFAULT '🥇 1st: 60-Day VIP Plan
🥈 2nd: 30-Day BOSS Plan
🥉 3rd: 14-Day PRO Plan',
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IeltsTopic" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "relevance" INTEGER NOT NULL DEFAULT 5,
    "sourceMetadata" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IeltsTopic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IeltsQuestion" (
    "id" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "part" "IeltsPart" NOT NULL,
    "questionText" TEXT NOT NULL,
    "cueCardBullets" TEXT,
    "questionType" TEXT NOT NULL DEFAULT 'GENERAL',
    "source" TEXT NOT NULL DEFAULT 'OFFICIAL_RECALL',
    "sourceUrl" TEXT,
    "sourceHash" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IeltsQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrawlerSyncLog" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "sourcesProcessed" INTEGER NOT NULL DEFAULT 0,
    "questionsDiscovered" INTEGER NOT NULL DEFAULT 0,
    "questionsAccepted" INTEGER NOT NULL DEFAULT 0,
    "duplicatesSkipped" INTEGER NOT NULL DEFAULT 0,
    "topicsCreated" INTEGER NOT NULL DEFAULT 0,
    "errors" TEXT,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "CrawlerSyncLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_telegramId_key" ON "User"("telegramId");

-- CreateIndex
CREATE UNIQUE INDEX "User_alias_key" ON "User"("alias");

-- CreateIndex
CREATE INDEX "User_subscriptionExpiresAt_idx" ON "User"("subscriptionExpiresAt");

-- CreateIndex
CREATE INDEX "User_isBanned_idx" ON "User"("isBanned");

-- CreateIndex
CREATE UNIQUE INDEX "CallSession_roomName_key" ON "CallSession"("roomName");

-- CreateIndex
CREATE INDEX "CallSession_userAId_status_createdAt_idx" ON "CallSession"("userAId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "CallSession_userBId_status_createdAt_idx" ON "CallSession"("userBId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "CallSession_egressId_idx" ON "CallSession"("egressId");

-- CreateIndex
CREATE INDEX "CallSession_status_idx" ON "CallSession"("status");

-- CreateIndex
CREATE INDEX "CallSession_recordingExpiresAt_idx" ON "CallSession"("recordingExpiresAt");

-- CreateIndex
CREATE INDEX "CallSession_status_recordingUrl_createdAt_idx" ON "CallSession"("status", "recordingUrl", "createdAt");

-- CreateIndex
CREATE INDEX "CallRating_ratedId_idx" ON "CallRating"("ratedId");

-- CreateIndex
CREATE INDEX "CallRating_callId_idx" ON "CallRating"("callId");

-- CreateIndex
CREATE INDEX "UnblockAppeal_status_createdAt_idx" ON "UnblockAppeal"("status", "createdAt");

-- CreateIndex
CREATE INDEX "UnblockAppeal_userId_idx" ON "UnblockAppeal"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "StarsTransaction_orderNumber_key" ON "StarsTransaction"("orderNumber");

-- CreateIndex
CREATE UNIQUE INDEX "StarsTransaction_telegramPaymentId_key" ON "StarsTransaction"("telegramPaymentId");

-- CreateIndex
CREATE INDEX "StarsTransaction_userId_status_idx" ON "StarsTransaction"("userId", "status");

-- CreateIndex
CREATE INDEX "StarsTransaction_orderNumber_idx" ON "StarsTransaction"("orderNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ManualPaymentRequest_orderNumber_key" ON "ManualPaymentRequest"("orderNumber");

-- CreateIndex
CREATE INDEX "ManualPaymentRequest_userId_status_idx" ON "ManualPaymentRequest"("userId", "status");

-- CreateIndex
CREATE INDEX "ManualPaymentRequest_status_createdAt_idx" ON "ManualPaymentRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ManualPaymentRequest_orderNumber_idx" ON "ManualPaymentRequest"("orderNumber");

-- CreateIndex
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_targetId_idx" ON "AuditLog"("targetId");

-- CreateIndex
CREATE UNIQUE INDEX "FavoritePartner_userId_partnerId_key" ON "FavoritePartner"("userId", "partnerId");

-- CreateIndex
CREATE INDEX "ReferralReward_userId_status_idx" ON "ReferralReward"("userId", "status");

-- CreateIndex
CREATE INDEX "ReferralReward_createdAt_idx" ON "ReferralReward"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "IeltsTopic_name_key" ON "IeltsTopic"("name");

-- CreateIndex
CREATE UNIQUE INDEX "IeltsTopic_slug_key" ON "IeltsTopic"("slug");

-- CreateIndex
CREATE INDEX "IeltsTopic_slug_isActive_idx" ON "IeltsTopic"("slug", "isActive");

-- CreateIndex
CREATE INDEX "IeltsTopic_relevance_idx" ON "IeltsTopic"("relevance");

-- CreateIndex
CREATE UNIQUE INDEX "IeltsQuestion_sourceHash_key" ON "IeltsQuestion"("sourceHash");

-- CreateIndex
CREATE INDEX "IeltsQuestion_part_isActive_idx" ON "IeltsQuestion"("part", "isActive");

-- CreateIndex
CREATE INDEX "IeltsQuestion_topicId_part_isActive_idx" ON "IeltsQuestion"("topicId", "part", "isActive");

-- CreateIndex
CREATE INDEX "CrawlerSyncLog_startedAt_idx" ON "CrawlerSyncLog"("startedAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_referredByUserId_fkey" FOREIGN KEY ("referredByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallSession" ADD CONSTRAINT "CallSession_userAId_fkey" FOREIGN KEY ("userAId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallSession" ADD CONSTRAINT "CallSession_userBId_fkey" FOREIGN KEY ("userBId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallRating" ADD CONSTRAINT "CallRating_callId_fkey" FOREIGN KEY ("callId") REFERENCES "CallSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallRating" ADD CONSTRAINT "CallRating_raterId_fkey" FOREIGN KEY ("raterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallRating" ADD CONSTRAINT "CallRating_ratedId_fkey" FOREIGN KEY ("ratedId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnblockAppeal" ADD CONSTRAINT "UnblockAppeal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StarsTransaction" ADD CONSTRAINT "StarsTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManualPaymentRequest" ADD CONSTRAINT "ManualPaymentRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FavoritePartner" ADD CONSTRAINT "FavoritePartner_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FavoritePartner" ADD CONSTRAINT "FavoritePartner_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralReward" ADD CONSTRAINT "ReferralReward_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralReward" ADD CONSTRAINT "ReferralReward_referredUserId_fkey" FOREIGN KEY ("referredUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IeltsQuestion" ADD CONSTRAINT "IeltsQuestion_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "IeltsTopic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
