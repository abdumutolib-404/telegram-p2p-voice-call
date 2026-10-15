CREATE TABLE "RecordingCapacity" (
 "callId" TEXT NOT NULL REFERENCES "CallSession"(id) ON DELETE CASCADE,
 month TEXT NOT NULL,
 minutes INTEGER NOT NULL CHECK(minutes>0),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY("callId",month)
);
CREATE INDEX "RecordingCapacity_month_idx" ON "RecordingCapacity"(month);
CREATE INDEX "User_recording_credit_stock_idx" ON "User"("recordingCredits") WHERE "recordingCredits">0;
CREATE INDEX "CreditOrder_capacity_holds_idx" ON "CreditOrder"("expiresAt") WHERE status='PENDING' AND recordings>0;

-- A 15-minute credit holds 16 minutes: one minute is reserved for provider
-- startup/teardown. Legacy captures, paid wallets and unpaid authorized invoices
-- all reduce available sales inventory. Month boundaries use UTC explicitly.
CREATE FUNCTION pairtalk_recording_capacity_remaining() RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE config JSONB; allowance INTEGER; external_used INTEGER; captured BIGINT; legacy BIGINT; outstanding BIGINT; pending BIGINT;
 month_start TIMESTAMP; month_key TEXT;
BEGIN
 month_start=date_trunc('month',NOW() AT TIME ZONE 'UTC');month_key=to_char(month_start,'YYYY-MM');
 SELECT "afterState"::jsonb INTO config FROM "AuditLog" WHERE action='CREDIT_COSTS_UPDATE' AND "targetId"='credit_costs' ORDER BY "createdAt" DESC,id DESC LIMIT 1;
 allowance=COALESCE((config->>'recordingAllowanceMinutes')::integer,60);
 external_used=COALESCE((config->>'recordingExternalUsedMinutes')::integer,0);
 SELECT COALESCE(SUM(per_call.minutes),0) INTO captured FROM (
   SELECT MAX(r.minutes) AS minutes FROM "RecordingCapacity" r JOIN "CallSession" c ON c.id=r."callId"
   WHERE r.month=month_key OR c."endedAt">=month_start OR c.status='ACTIVE' GROUP BY r."callId"
 ) per_call;
 SELECT COALESCE(SUM(CASE WHEN c.status='ACTIVE' THEN GREATEST(a."maxDuration",b."maxDuration",15)+1 ELSE CEIL(c.duration/60.0)::integer+1 END),0) INTO legacy
 FROM "CallSession" c JOIN "User" a ON a.id=c."userAId" JOIN "User" b ON b.id=c."userBId"
 WHERE (c."createdAt">=month_start OR c."endedAt">=month_start OR c.status='ACTIVE')
 AND (c."egressId" IS NOT NULL OR c."recordingUrl" IS NOT NULL OR cardinality(c."recordingKeys")>0)
 AND NOT EXISTS(SELECT 1 FROM "RecordingCapacity" r WHERE r."callId"=c.id);
 SELECT COALESCE(SUM("recordingCredits"),0)*16 INTO outstanding FROM "User" WHERE "recordingCredits">0;
 SELECT COALESCE(SUM(recordings),0)*16 INTO pending FROM "CreditOrder" WHERE status='PENDING' AND recordings>0 AND ("expiresAt">NOW() OR "authorizedAt" IS NOT NULL);
 RETURN GREATEST(-2147483647,LEAST(2147483647,allowance::bigint-external_used-captured-legacy-outstanding-pending))::integer;
END $$;

-- Hold capacity before contacting LiveKit. A credit-backed start may borrow
-- its own wallet hold, which is replaced by the capture at commit. Until then
-- both holds remain visible, conservatively blocking new sales.
CREATE FUNCTION pairtalk_prepare_recording_capacity(call_id TEXT, user_id TEXT, duration_minutes INTEGER, credit_backed BOOLEAN) RETURNS BOOLEAN LANGUAGE plpgsql AS $$
DECLARE month_key TEXT; wallet INTEGER; borrowed INTEGER := 0;
BEGIN
 SELECT "recordingCredits" INTO wallet FROM "User" WHERE id=user_id FOR UPDATE;
 PERFORM 1 FROM "CallSession" WHERE id=call_id AND status='ACTIVE' AND "mediaAuthorizedAt" IS NOT NULL
 AND ("userAId"=user_id OR "userBId"=user_id) FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 PERFORM pg_advisory_xact_lock(736251011);
 month_key=to_char(NOW() AT TIME ZONE 'UTC','YYYY-MM');
 IF EXISTS(SELECT 1 FROM "RecordingCapacity" WHERE "callId"=call_id AND month=month_key) THEN RETURN true; END IF;
 IF duration_minutes<1 OR duration_minutes>1440 THEN RAISE EXCEPTION 'Invalid recording duration'; END IF;
 IF credit_backed AND wallet>0 AND duration_minutes<=15 THEN borrowed=16; END IF;
 IF pairtalk_recording_capacity_remaining()+borrowed<duration_minutes+1 THEN RETURN false; END IF;
 INSERT INTO "RecordingCapacity"("callId",month,minutes) VALUES(call_id,month_key,duration_minutes+1);
 RETURN true;
END $$;

CREATE FUNCTION pairtalk_reserve_recording_capacity(call_id TEXT, duration_minutes INTEGER) RETURNS BOOLEAN LANGUAGE plpgsql AS $$
DECLARE month_key TEXT;
BEGIN
 PERFORM pg_advisory_xact_lock(736251011);
 month_key=to_char(NOW() AT TIME ZONE 'UTC','YYYY-MM');
 IF EXISTS(SELECT 1 FROM "RecordingCapacity" WHERE "callId"=call_id AND month=month_key) THEN RETURN true; END IF;
 IF duration_minutes<1 OR duration_minutes>1440 THEN RAISE EXCEPTION 'Invalid recording duration'; END IF;
 IF NOT EXISTS(SELECT 1 FROM "CallSession" WHERE id=call_id AND status='ACTIVE') THEN RETURN false; END IF;
 IF pairtalk_recording_capacity_remaining()<duration_minutes+1 THEN RETURN false; END IF;
 INSERT INTO "RecordingCapacity"("callId",month,minutes) VALUES(call_id,month_key,duration_minutes+1);
 RETURN true;
END $$;
