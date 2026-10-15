ALTER TABLE "ManualPaymentRequest" ADD COLUMN "refundRequestedAt" TIMESTAMP(3);
CREATE INDEX "CallSession_restrictionCleanupPending_id_idx" ON "CallSession"("restrictionCleanupPending", "id");
