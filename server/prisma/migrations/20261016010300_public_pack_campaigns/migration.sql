CREATE TABLE "PackCampaign" (
 id TEXT PRIMARY KEY,"requestId" TEXT NOT NULL UNIQUE,"adminId" TEXT NOT NULL,
 "packSnapshot" TEXT NOT NULL,"catalogSnapshot" TEXT NOT NULL,
 percent DOUBLE PRECISION NOT NULL CHECK(percent>0 AND percent<=100),
 "maximumClaims" INTEGER NOT NULL CHECK("maximumClaims">0),
 "claimedCount" INTEGER NOT NULL DEFAULT 0 CHECK("claimedCount">=0 AND "claimedCount"<="maximumClaims"),
 "validMinutes" INTEGER NOT NULL CHECK("validMinutes" BETWEEN 1 AND 2820),
 status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','ACTIVE','SOLD_OUT','EXPIRED','DISABLED')),
 "expiresAt" TIMESTAMP(3) NOT NULL,"messageState" TEXT NOT NULL DEFAULT 'QUEUED',
 "telegramMessageId" INTEGER,"telegramMessageAt" TIMESTAMP(3),
 revision INTEGER NOT NULL DEFAULT 0,"syncedRevision" INTEGER NOT NULL DEFAULT -1,
 "leaseUntil" TIMESTAMP(3),owner TEXT,"nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 failure TEXT,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "PackCampaign_messageState_nextAttemptAt_idx" ON "PackCampaign"("messageState","nextAttemptAt");
CREATE INDEX "PackCampaign_status_expiresAt_idx" ON "PackCampaign"(status,"expiresAt");
CREATE TABLE "PackClaim" (
 id TEXT PRIMARY KEY,"campaignId" TEXT NOT NULL REFERENCES "PackCampaign"(id),
 "userId" TEXT NOT NULL REFERENCES "User"(id),status TEXT NOT NULL DEFAULT 'HELD' CHECK(status IN ('HELD','CLAIMED')),
 "activeOrderId" TEXT,"claimedAt" TIMESTAMP(3),"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE("campaignId","userId")
);
ALTER TABLE "CreditOrder" ADD COLUMN "packClaimId" TEXT REFERENCES "PackClaim"(id),
 DROP CONSTRAINT "CreditOrder_starsAmount_check",DROP CONSTRAINT "CreditOrder_uzsAmount_check";
ALTER TABLE "CreditOrder" ADD CONSTRAINT "CreditOrder_amounts_check"
 CHECK(("starsAmount">0 AND "uzsAmount">0) OR ("packClaimId" IS NOT NULL AND "starsAmount"=0 AND "uzsAmount"=0));
