ALTER TABLE "NotificationJob" ADD COLUMN "dedupeKey" TEXT;
CREATE UNIQUE INDEX "NotificationJob_namespace_dedupeKey_key" ON "NotificationJob"("namespace", "dedupeKey");

CREATE TABLE "PostCallJob" (
  "callId" TEXT NOT NULL,
  "reason" TEXT,
  "deniedUserId" TEXT,
  "retentionA" INTEGER NOT NULL DEFAULT 0,
  "retentionB" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'QUEUED',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leaseUntil" TIMESTAMP(3),
  "owner" TEXT,
  "failure" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PostCallJob_pkey" PRIMARY KEY ("callId"),
  CONSTRAINT "PostCallJob_callId_fkey" FOREIGN KEY ("callId") REFERENCES "CallSession"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "PostCallJob_status_nextAttemptAt_idx" ON "PostCallJob"("status", "nextAttemptAt");
CREATE INDEX "PostCallJob_status_leaseUntil_idx" ON "PostCallJob"("status", "leaseUntil");
