-- CreateTable
CREATE TABLE "NotificationJob" (
    "id" TEXT NOT NULL,
    "namespace" TEXT NOT NULL,
    "telegramId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "optionsJson" TEXT,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "urgent" BOOLEAN NOT NULL DEFAULT false,
    "retries" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leasedAt" TIMESTAMP(3),
    "failure" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NotificationJob_namespace_status_nextAttemptAt_idx" ON "NotificationJob"("namespace", "status", "nextAttemptAt");
