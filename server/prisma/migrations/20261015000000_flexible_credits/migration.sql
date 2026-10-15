ALTER TABLE "User" ADD COLUMN "creditBilling" BOOLEAN NOT NULL DEFAULT false,
 ADD COLUMN "callCredits" INTEGER NOT NULL DEFAULT 0,
 ADD COLUMN "recordingCredits" INTEGER NOT NULL DEFAULT 0,
 ADD COLUMN "storageCredits" INTEGER NOT NULL DEFAULT 0,
 ADD COLUMN "creditCallActive" BOOLEAN NOT NULL DEFAULT false;
-- Existing accounts keep their allowances. New accounts receive one starter grant,
-- atomically with their unique Telegram profile; re-registration cannot grant it again.
ALTER TABLE "User" ALTER COLUMN "creditBilling" SET DEFAULT true,
 ALTER COLUMN "callCredits" SET DEFAULT 3;
ALTER TABLE "User" ADD CONSTRAINT "credit_balances_nonnegative"
 CHECK ("callCredits">=0 AND "recordingCredits">=0 AND "storageCredits">=0);
CREATE TABLE "CreditOrder" (
 id TEXT PRIMARY KEY, "requestId" TEXT NOT NULL UNIQUE, "userId" TEXT NOT NULL REFERENCES "User"(id),
 calls INTEGER NOT NULL CHECK(calls BETWEEN 0 AND 1000), recordings INTEGER NOT NULL CHECK(recordings BETWEEN 0 AND 1000),
 storage INTEGER NOT NULL CHECK(storage=0 OR storage=recordings), "starsAmount" INTEGER NOT NULL CHECK("starsAmount">0),
 "uzsAmount" INTEGER NOT NULL CHECK("uzsAmount">0), "catalogRevision" TEXT NOT NULL, "catalogSnapshot" TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','PAID','REFUND_PENDING','REFUNDED')),
 "telegramPaymentId" TEXT UNIQUE, "preCheckoutId" TEXT UNIQUE, "authorizedAt" TIMESTAMP(3),
 "expiresAt" TIMESTAMP(3) NOT NULL, "paidAt" TIMESTAMP(3), "refundedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK(calls+recordings>0)
);
CREATE INDEX "CreditOrder_userId_createdAt_idx" ON "CreditOrder"("userId","createdAt");
CREATE TABLE "CreditUsage" (
 "callId" TEXT NOT NULL REFERENCES "CallSession"(id) ON DELETE CASCADE,
 "userId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
 kind TEXT NOT NULL CHECK(kind IN ('CALL','RECORDING','STORAGE')),
 status TEXT NOT NULL DEFAULT 'RESERVED' CHECK(status IN ('RESERVED','CONSUMED','RELEASED')),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY("callId","userId",kind)
);
CREATE INDEX "CreditUsage_userId_kind_status_idx" ON "CreditUsage"("userId",kind,status);
ALTER TABLE "RecordingSegment" ADD COLUMN "creditOwnerIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
 ADD COLUMN "storedOwnerIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- The two backends share these transactional wallet operations. Their callers
-- take participant/User locks first, then the CallSession lock.
CREATE FUNCTION pairtalk_reserve_credit(call_id TEXT, user_id TEXT, credit_kind TEXT) RETURNS BOOLEAN LANGUAGE plpgsql AS $$
DECLARE remaining INTEGER; previous TEXT;
BEGIN
 PERFORM 1 FROM "User" WHERE id=user_id FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM "CallSession" WHERE id=call_id AND status IN ('ACTIVE','PENDING') AND ("userAId"=user_id OR "userBId"=user_id)) THEN RAISE EXCEPTION 'Credit reservation requires an active participant'; END IF;
 SELECT status INTO previous FROM "CreditUsage" WHERE "callId"=call_id AND "userId"=user_id AND kind=credit_kind;
 IF previous IN ('RESERVED','CONSUMED') THEN RETURN true; END IF;
 IF previous='RELEASED' THEN RETURN false; END IF;
 IF credit_kind='CALL' THEN
   UPDATE "User" SET "updatedAt"=NOW(),"callCredits"="callCredits"-1,"creditCallActive"=true WHERE id=user_id AND "callCredits">0 RETURNING "callCredits" INTO remaining;
 ELSIF credit_kind='RECORDING' THEN
   UPDATE "User" SET "updatedAt"=NOW(),"recordingCredits"="recordingCredits"-1 WHERE id=user_id AND "recordingCredits">0 RETURNING "recordingCredits" INTO remaining;
 ELSIF credit_kind='STORAGE' THEN
   UPDATE "User" SET "updatedAt"=NOW(),"storageCredits"="storageCredits"-1 WHERE id=user_id AND "storageCredits">0 RETURNING "storageCredits" INTO remaining;
 ELSE RAISE EXCEPTION 'Unsupported credit kind'; END IF;
 IF remaining IS NULL THEN RETURN false; END IF;
 INSERT INTO "CreditUsage"("callId","userId",kind) VALUES(call_id,user_id,credit_kind);
 RETURN true;
END $$;

CREATE FUNCTION pairtalk_release_credit(call_id TEXT, user_id TEXT, credit_kind TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE changed INTEGER;
BEGIN
 PERFORM 1 FROM "User" WHERE id=user_id FOR UPDATE;
 UPDATE "CreditUsage" SET status='RELEASED' WHERE "callId"=call_id AND "userId"=user_id AND kind=credit_kind AND status='RESERVED';
 GET DIAGNOSTICS changed=ROW_COUNT;
 IF changed=1 THEN
   UPDATE "User" SET "updatedAt"=NOW(),"callCredits"="callCredits"+CASE WHEN credit_kind='CALL' THEN 1 ELSE 0 END,
    "recordingCredits"="recordingCredits"+CASE WHEN credit_kind='RECORDING' THEN 1 ELSE 0 END,
    "storageCredits"="storageCredits"+CASE WHEN credit_kind='STORAGE' THEN 1 ELSE 0 END WHERE id=user_id;
 END IF;
END $$;

CREATE FUNCTION pairtalk_settle_call_credits() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE participant TEXT;
BEGIN
 IF NEW.status NOT IN ('ACTIVE','PENDING') AND OLD.status IN ('ACTIVE','PENDING') THEN
   FOR participant IN SELECT unnest(ARRAY[NEW."userAId",NEW."userBId"]) ORDER BY 1 LOOP
     PERFORM 1 FROM "User" WHERE id=participant FOR UPDATE;
     IF NEW.status='COMPLETED' AND NEW.duration>=5 THEN
       UPDATE "CreditUsage" SET status='CONSUMED' WHERE "callId"=NEW.id AND "userId"=participant AND kind='CALL' AND status='RESERVED';
     ELSE PERFORM pairtalk_release_credit(NEW.id,participant,'CALL'); END IF;
     UPDATE "User" SET "updatedAt"=NOW(),"creditCallActive"=false WHERE id=participant;
   END LOOP;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER settle_call_credits AFTER UPDATE OF status ON "CallSession" FOR EACH ROW EXECUTE FUNCTION pairtalk_settle_call_credits();

CREATE FUNCTION pairtalk_credit_recording_retention() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE deadline TIMESTAMP(3);
BEGIN
 SELECT COALESCE(array_agg("userId"),ARRAY[]::TEXT[]) INTO NEW."creditOwnerIds" FROM "CreditUsage"
 WHERE "callId"=NEW."callId" AND kind='RECORDING' AND status IN ('RESERVED','CONSUMED') AND "userId"=ANY(NEW."ownerIds");
 SELECT COALESCE(array_agg("userId"),ARRAY[]::TEXT[]) INTO NEW."storedOwnerIds" FROM "CreditUsage"
 WHERE "callId"=NEW."callId" AND kind='STORAGE' AND status IN ('RESERVED','CONSUMED') AND "userId"=ANY(NEW."ownerIds");
 IF cardinality(NEW."creditOwnerIds")>0 AND NEW."ownerIds" <@ NEW."creditOwnerIds" THEN
   deadline=NEW."createdAt"+CASE WHEN cardinality(NEW."storedOwnerIds")>0 THEN INTERVAL '30 days' ELSE INTERVAL '1 day' END;
   -- Cleanup may shorten expiry after acknowledged delivery, but cannot extend it.
   IF TG_OP='INSERT' OR NEW."ownerIds" IS DISTINCT FROM OLD."ownerIds" THEN NEW."expiresAt"=deadline;
   ELSE NEW."expiresAt"=LEAST(COALESCE(NEW."expiresAt",deadline),deadline); END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER credit_recording_retention BEFORE INSERT OR UPDATE OF "ownerIds","expiresAt" ON "RecordingSegment" FOR EACH ROW EXECUTE FUNCTION pairtalk_credit_recording_retention();

ALTER TABLE "CreditOrder" ADD COLUMN "termsVersion" TEXT NOT NULL DEFAULT 'credits-2026-10-15',
 ADD COLUMN "termsAcceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
