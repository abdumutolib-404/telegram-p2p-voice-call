ALTER TABLE "User" ADD COLUMN "subscriptionStartsAt" TIMESTAMP(3), ADD COLUMN "subscriptionDurationDays" INTEGER;
-- Normalize the legacy Windows-newline default to the published schema.
ALTER TABLE "Contest" ALTER COLUMN prizes SET DEFAULT E'🥇 1st: 60-Day VIP Plan\n🥈 2nd: 30-Day BOSS Plan\n🥉 3rd: 14-Day PRO Plan';
UPDATE "User" SET "subscriptionDurationDays"=30,"subscriptionStartsAt"="subscriptionExpiresAt"-INTERVAL '30 days' WHERE "subscriptionExpiresAt" IS NOT NULL;

CREATE TABLE "RecordingUsage" (
 "callId" TEXT NOT NULL REFERENCES "CallSession"(id) ON DELETE CASCADE ON UPDATE CASCADE,
 "userId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE ON UPDATE CASCADE,
 "consumedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY ("callId","userId")
);
CREATE INDEX "RecordingUsage_userId_consumedAt_idx" ON "RecordingUsage"("userId","consumedAt");
CREATE TABLE "RecordingSegment" (
 id TEXT PRIMARY KEY,
 "callId" TEXT NOT NULL REFERENCES "CallSession"(id) ON DELETE CASCADE ON UPDATE CASCADE,
 "objectKey" TEXT NOT NULL UNIQUE,
 "egressId" TEXT NOT NULL UNIQUE,
 "ownerIds" TEXT[] NOT NULL,
 status TEXT NOT NULL DEFAULT 'RECORDING',
 "expiresAt" TIMESTAMP(3),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "RecordingSegment_callId_createdAt_idx" ON "RecordingSegment"("callId","createdAt");
CREATE INDEX "RecordingSegment_expiresAt_idx" ON "RecordingSegment"("expiresAt");
CREATE TABLE "RecordingDelivery" (
 "segmentId" TEXT NOT NULL REFERENCES "RecordingSegment"(id) ON DELETE CASCADE ON UPDATE CASCADE,
 "userId" TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'QUEUED',
 attempts INTEGER NOT NULL DEFAULT 0,
 "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "leaseUntil" TIMESTAMP(3), owner TEXT, "telegramMessageId" INTEGER, failure TEXT,
 PRIMARY KEY("segmentId","userId")
);
CREATE INDEX "RecordingDelivery_status_nextAttemptAt_idx" ON "RecordingDelivery"(status,"nextAttemptAt");

-- Existing successful ownership is the available historical evidence. Failed
-- provider starts can leave recordingKeys, so those keys alone are not usage.
INSERT INTO "RecordingUsage"("callId","userId","consumedAt")
 SELECT c.id,u.id,c."createdAt" FROM "CallSession" c
 JOIN "User" u ON u.id IN (c."userAId",c."userBId")
 WHERE (c."recordingUrl" IS NOT NULL OR c."recordedByUserId" IS NOT NULL)
 AND (c."recordedByUserId" IS NULL OR c."recordedByUserId" IN ('BOTH','ALL') OR u.id=ANY(string_to_array(c."recordedByUserId",',')))
 ON CONFLICT DO NOTHING;
INSERT INTO "RecordingSegment"(id,"callId","objectKey","egressId","ownerIds",status,"expiresAt","createdAt")
 SELECT c.id,c.id,c."recordingUrl",c."egressId",ARRAY(SELECT r."userId" FROM "RecordingUsage" r WHERE r."callId"=c.id),
 CASE WHEN c.status='ACTIVE' THEN 'RECORDING' ELSE 'PENDING' END,c."recordingExpiresAt",c."createdAt"
 FROM "CallSession" c WHERE c."recordingUrl" IS NOT NULL AND c."egressId" IS NOT NULL;
