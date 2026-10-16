ALTER TABLE "NotificationJob" ADD COLUMN category TEXT NOT NULL DEFAULT 'TRANSACTIONAL', ADD COLUMN "contextJson" TEXT, ADD COLUMN owner TEXT;
UPDATE "NotificationJob" SET status='EXPIRED',failure='Replaced by opt-in notification preferences.'
 WHERE status='QUEUED' AND (text LIKE '🔥 <b>Peak Practice Surge:%' OR text LIKE '📢 <b>New IELTS Speaking Topics Added!%');
ALTER TABLE "User" ADD COLUMN "notifyInactivity" BOOLEAN NOT NULL DEFAULT false,
 ADD COLUMN "notifyCheckout" BOOLEAN NOT NULL DEFAULT false,
 ADD COLUMN "notifyPeak" BOOLEAN NOT NULL DEFAULT false,
 ADD COLUMN "notifyChannel" BOOLEAN NOT NULL DEFAULT false,
 ADD COLUMN "quietHours" BOOLEAN NOT NULL DEFAULT true,
 ADD COLUMN "quietStart" INTEGER NOT NULL DEFAULT 22 CHECK("quietStart" BETWEEN 0 AND 23),
 ADD COLUMN "quietEnd" INTEGER NOT NULL DEFAULT 8 CHECK("quietEnd" BETWEEN 0 AND 23),
 ADD COLUMN "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 ADD COLUMN "nextReminderAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 ADD COLUMN "lastReminderAttemptAt" TIMESTAMP(3), ADD COLUMN "lastReminderJobId" TEXT,
 ADD CONSTRAINT "notification_quiet_hours_valid" CHECK(NOT "quietHours" OR "quietStart"<>"quietEnd");
CREATE INDEX "User_inactivity_reminders_idx" ON "User"("nextReminderAt","lastActiveAt",id) WHERE "notifyInactivity";
CREATE INDEX "CreditOrder_abandoned_idx" ON "CreditOrder"("createdAt","expiresAt") WHERE status='PENDING' AND "authorizedAt" IS NULL;
CREATE TABLE "NotificationBroadcast" (
 id TEXT PRIMARY KEY,"requestId" TEXT NOT NULL UNIQUE,"adminId" TEXT NOT NULL,"messageId" INTEGER NOT NULL CHECK("messageId">0),
 cursor TEXT,completed BOOLEAN NOT NULL DEFAULT false,"expiresAt" TIMESTAMP(3) NOT NULL,
 "leaseUntil" TIMESTAMP(3),owner TEXT,"nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "NotificationBroadcast_completed_nextAttemptAt_idx" ON "NotificationBroadcast"(completed,"nextAttemptAt");
