ALTER TABLE "User" ADD COLUMN "preferredCallMinutes" INTEGER NOT NULL DEFAULT 15 CHECK("preferredCallMinutes" IN (15,30)),
 ADD COLUMN "activeCallCreditUnits" INTEGER NOT NULL DEFAULT 0 CHECK("activeCallCreditUnits" BETWEEN 0 AND 2);
UPDATE "User" SET "activeCallCreditUnits"=1 WHERE "creditCallActive";
ALTER TABLE "CallSession" ADD COLUMN "allowedMinutes" INTEGER CHECK("allowedMinutes" BETWEEN 1 AND 1440);
ALTER TABLE "CreditUsage" ADD COLUMN quantity INTEGER NOT NULL DEFAULT 1 CHECK(quantity IN (1,2));

-- All callers, including the previous three-argument API, reserve the quantity
-- derived from the frozen session duration. A client cannot choose the charge.
CREATE OR REPLACE FUNCTION pairtalk_reserve_credit(call_id TEXT, user_id TEXT, credit_kind TEXT) RETURNS BOOLEAN LANGUAGE plpgsql AS $$
DECLARE remaining INTEGER; previous TEXT; previous_quantity INTEGER; units INTEGER;
BEGIN
 PERFORM 1 FROM "User" WHERE id=user_id FOR UPDATE;
 SELECT CEIL(COALESCE("allowedMinutes",15)/15.0)::integer INTO units FROM "CallSession"
 WHERE id=call_id AND status IN ('ACTIVE','PENDING') AND ("userAId"=user_id OR "userBId"=user_id);
 IF NOT FOUND THEN RAISE EXCEPTION 'Credit reservation requires an active participant'; END IF;
 IF units NOT IN (1,2) THEN RAISE EXCEPTION 'Purchased units cover sessions up to 30 minutes'; END IF;
 SELECT status,quantity INTO previous,previous_quantity FROM "CreditUsage" WHERE "callId"=call_id AND "userId"=user_id AND kind=credit_kind;
 IF previous IN ('RESERVED','CONSUMED') THEN RETURN previous_quantity=units; END IF;
 IF previous='RELEASED' THEN RETURN false; END IF;
 IF credit_kind='CALL' THEN
   UPDATE "User" SET "updatedAt"=NOW(),"callCredits"="callCredits"-units,"creditCallActive"=true,"activeCallCreditUnits"=units WHERE id=user_id AND "callCredits">=units RETURNING "callCredits" INTO remaining;
 ELSIF credit_kind='RECORDING' THEN
   UPDATE "User" SET "updatedAt"=NOW(),"recordingCredits"="recordingCredits"-units WHERE id=user_id AND "recordingCredits">=units RETURNING "recordingCredits" INTO remaining;
 ELSIF credit_kind='STORAGE' THEN
   UPDATE "User" SET "updatedAt"=NOW(),"storageCredits"="storageCredits"-units WHERE id=user_id AND "storageCredits">=units RETURNING "storageCredits" INTO remaining;
 ELSE RAISE EXCEPTION 'Unsupported credit kind'; END IF;
 IF remaining IS NULL THEN RETURN false; END IF;
 INSERT INTO "CreditUsage"("callId","userId",kind,quantity) VALUES(call_id,user_id,credit_kind,units);
 RETURN true;
END $$;

CREATE OR REPLACE FUNCTION pairtalk_release_credit(call_id TEXT, user_id TEXT, credit_kind TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE units INTEGER;
BEGIN
 PERFORM 1 FROM "User" WHERE id=user_id FOR UPDATE;
 UPDATE "CreditUsage" SET status='RELEASED' WHERE "callId"=call_id AND "userId"=user_id AND kind=credit_kind AND status='RESERVED' RETURNING quantity INTO units;
 IF units IS NOT NULL THEN
   UPDATE "User" SET "updatedAt"=NOW(),"callCredits"="callCredits"+CASE WHEN credit_kind='CALL' THEN units ELSE 0 END,
    "recordingCredits"="recordingCredits"+CASE WHEN credit_kind='RECORDING' THEN units ELSE 0 END,
    "storageCredits"="storageCredits"+CASE WHEN credit_kind='STORAGE' THEN units ELSE 0 END WHERE id=user_id;
 END IF;
END $$;

CREATE OR REPLACE FUNCTION pairtalk_settle_call_credits() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE participant TEXT;
BEGIN
 IF NEW.status NOT IN ('ACTIVE','PENDING') AND OLD.status IN ('ACTIVE','PENDING') THEN
   FOR participant IN SELECT unnest(ARRAY[NEW."userAId",NEW."userBId"]) ORDER BY 1 LOOP
     PERFORM 1 FROM "User" WHERE id=participant FOR UPDATE;
     IF NEW.status='COMPLETED' AND NEW.duration>=5 THEN
       UPDATE "CreditUsage" SET status='CONSUMED' WHERE "callId"=NEW.id AND "userId"=participant AND kind='CALL' AND status='RESERVED';
     ELSE PERFORM pairtalk_release_credit(NEW.id,participant,'CALL'); END IF;
     UPDATE "User" SET "updatedAt"=NOW(),"creditCallActive"=false,"activeCallCreditUnits"=0 WHERE id=participant;
   END LOOP;
 END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION pairtalk_prepare_recording_capacity(call_id TEXT, user_id TEXT, duration_minutes INTEGER, credit_backed BOOLEAN) RETURNS BOOLEAN LANGUAGE plpgsql AS $$
DECLARE month_key TEXT; wallet INTEGER; borrowed INTEGER := 0; units INTEGER;
BEGIN
 SELECT "recordingCredits" INTO wallet FROM "User" WHERE id=user_id FOR UPDATE;
 PERFORM 1 FROM "CallSession" WHERE id=call_id AND status='ACTIVE' AND "mediaAuthorizedAt" IS NOT NULL
 AND ("userAId"=user_id OR "userBId"=user_id) FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 PERFORM pg_advisory_xact_lock(736251011);
 month_key=to_char(NOW() AT TIME ZONE 'UTC','YYYY-MM');
 IF EXISTS(SELECT 1 FROM "RecordingCapacity" WHERE "callId"=call_id AND month=month_key) THEN RETURN true; END IF;
 IF duration_minutes<1 OR duration_minutes>1440 THEN RAISE EXCEPTION 'Invalid recording duration'; END IF;
 units=CEIL(duration_minutes/15.0)::integer;
 IF credit_backed AND duration_minutes<=30 AND wallet>=units THEN borrowed=units*16; END IF;
 IF pairtalk_recording_capacity_remaining()+borrowed<duration_minutes+1 THEN RETURN false; END IF;
 INSERT INTO "RecordingCapacity"("callId",month,minutes) VALUES(call_id,month_key,duration_minutes+1);
 RETURN true;
END $$;
