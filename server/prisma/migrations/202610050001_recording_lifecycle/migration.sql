ALTER TABLE "CallSession"
  ADD COLUMN "activeRecorderIds" TEXT,
  ADD COLUMN "recordingKeys" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "StarsTransaction" ADD COLUMN "entitlementApplied" BOOLEAN NOT NULL DEFAULT TRUE;

UPDATE "CallSession"
SET "recordingKeys" = ARRAY["recordingUrl"]
WHERE "recordingUrl" IS NOT NULL;

UPDATE "CallSession"
SET "activeRecorderIds" = CASE
  WHEN "recordedByUserId" IS NULL OR "recordedByUserId" IN ('BOTH', 'ALL')
    THEN "userAId" || ',' || "userBId"
  ELSE "recordedByUserId" END
WHERE status = 'ACTIVE' AND "egressId" IS NOT NULL;
