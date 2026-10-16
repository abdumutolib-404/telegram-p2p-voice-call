-- Refund units are held outside the wallet until the transfer is confirmed.
-- Keep their recording stock reserved in case a manual refund is rejected.
CREATE OR REPLACE FUNCTION pairtalk_recording_capacity_remaining() RETURNS INTEGER LANGUAGE plpgsql AS $$
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
 SELECT COALESCE(SUM(recordings),0)*16 INTO pending FROM "CreditOrder" WHERE recordings>0 AND
 (status='REFUND_PENDING' OR (status='PENDING' AND ("expiresAt">NOW() OR "authorizedAt" IS NOT NULL)));
 RETURN GREATEST(-2147483647,LEAST(2147483647,allowance::bigint-external_used-captured-legacy-outstanding-pending))::integer;
END $$;
