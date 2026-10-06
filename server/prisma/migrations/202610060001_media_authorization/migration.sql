ALTER TABLE "CallSession"
  ADD COLUMN "readyParticipantIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "mediaAuthorizedAt" TIMESTAMP(3);

-- Previously issued ACTIVE tokens already permitted media. Preserve that history.
-- Deploy with the old call-serving processes stopped/drained before this migration.
UPDATE "CallSession"
SET "mediaAuthorizedAt" = "createdAt", "readyParticipantIds" = ARRAY["userAId", "userBId"]
WHERE status = 'ACTIVE';
