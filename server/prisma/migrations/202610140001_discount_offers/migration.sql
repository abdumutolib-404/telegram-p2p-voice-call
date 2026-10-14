ALTER TABLE "NotificationJob" ADD COLUMN "expiresAt" TIMESTAMP(3);
ALTER TABLE "StarsTransaction" ADD COLUMN "discountOfferId" TEXT;
ALTER TABLE "ManualPaymentRequest" ADD COLUMN "discountOfferId" TEXT;

CREATE TABLE "DiscountCampaign" (
  "id" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "adminId" TEXT NOT NULL,
  "plan" TEXT NOT NULL,
  "percent" DOUBLE PRECISION NOT NULL,
  "recipientCount" INTEGER NOT NULL,
  "validMinutes" INTEGER NOT NULL,
  "originalStars" INTEGER NOT NULL,
  "originalUzs" INTEGER NOT NULL,
  "starsPrice" INTEGER NOT NULL,
  "uzsPrice" INTEGER NOT NULL,
  "planSnapshot" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DiscountCampaign_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DiscountCampaign_values" CHECK (
    "plan" IN ('PLUS','PRO','BOSS') AND "percent">0 AND "percent"<=100 AND
    "recipientCount">0 AND "recipientCount"<=10000 AND "validMinutes">0 AND "validMinutes"<=525600 AND
    "originalStars">0 AND "originalUzs">0 AND "starsPrice">=0 AND "starsPrice"<="originalStars" AND "uzsPrice">=0 AND "uzsPrice"<="originalUzs"
  )
);
CREATE TABLE "DiscountOffer" (
  "id" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
  "noticeQueuedAt" TIMESTAMP(3),
  "checkoutCurrency" TEXT,
  "checkoutOrder" TEXT,
  "preCheckoutId" TEXT,
  "authorizedAt" TIMESTAMP(3),
  "claimedAt" TIMESTAMP(3),
  "claimedPaymentId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DiscountOffer_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DiscountCampaign_requestId_key" ON "DiscountCampaign"("requestId");
CREATE INDEX "DiscountCampaign_expiresAt_idx" ON "DiscountCampaign"("expiresAt");
CREATE UNIQUE INDEX "DiscountOffer_campaignId_userId_key" ON "DiscountOffer"("campaignId","userId");
CREATE UNIQUE INDEX "DiscountOffer_checkoutOrder_key" ON "DiscountOffer"("checkoutOrder");
CREATE UNIQUE INDEX "DiscountOffer_preCheckoutId_key" ON "DiscountOffer"("preCheckoutId");
CREATE INDEX "DiscountOffer_userId_status_idx" ON "DiscountOffer"("userId","status");
CREATE INDEX "DiscountOffer_noticeQueuedAt_createdAt_idx" ON "DiscountOffer"("noticeQueuedAt","createdAt");
ALTER TABLE "DiscountOffer" ADD CONSTRAINT "DiscountOffer_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "DiscountCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DiscountOffer" ADD CONSTRAINT "DiscountOffer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StarsTransaction" ADD CONSTRAINT "StarsTransaction_discountOfferId_fkey" FOREIGN KEY ("discountOfferId") REFERENCES "DiscountOffer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ManualPaymentRequest" ADD CONSTRAINT "ManualPaymentRequest_discountOfferId_fkey" FOREIGN KEY ("discountOfferId") REFERENCES "DiscountOffer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
