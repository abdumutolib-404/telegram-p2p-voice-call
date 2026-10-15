ALTER TABLE "StarsTransaction"
  ADD COLUMN "entitlementStartsAt" TIMESTAMP(3),
  ADD COLUMN "entitlementExpiresAt" TIMESTAMP(3),
  ADD COLUMN "refundCallLimit" INTEGER;
ALTER TABLE "ManualPaymentRequest"
  ADD COLUMN "entitlementStartsAt" TIMESTAMP(3),
  ADD COLUMN "entitlementExpiresAt" TIMESTAMP(3),
  ADD COLUMN "refundCallLimit" INTEGER;
ALTER TABLE "CallSession" ADD COLUMN "restrictionCleanupPending" BOOLEAN NOT NULL DEFAULT false;
