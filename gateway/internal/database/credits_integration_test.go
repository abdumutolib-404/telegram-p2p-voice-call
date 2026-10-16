package database

import (
	"github.com/google/uuid"
	"testing"
	"time"
)

func TestIntegrationCreditCallsReserveAndSettleOnce(t *testing.T) {
	db, ctx, ids := isolatedDB(t)
	if _, err := db.Pool.Exec(ctx, `UPDATE "User" SET "creditBilling"=true,"callCredits"=3 WHERE id=ANY($1)`, ids[:2]); err != nil {
		t.Fatal(err)
	}
	call := uuid.NewString()
	a, b, err := db.AdmitCallSession(ctx, call, call, ids[0], ids[1])
	if err != nil {
		t.Fatal(err)
	}
	if a.CallCredits != 2 || b.CallCredits != 2 || !a.CreditCallActive || CalculateEffectiveCallDuration(a, b, nil) != 15 {
		t.Fatal("admission did not reserve a fifteen-minute call")
	}
	if _, err := db.Pool.Exec(ctx, `UPDATE "CallSession" SET "mediaAuthorizedAt"=NOW()-INTERVAL '20 seconds' WHERE id=$1`, call); err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 2; i++ {
		claimed, err := db.CompleteCallSession(ctx, call, 20, nil, nil, nil)
		if err != nil || claimed != (i == 0) {
			t.Fatalf("completion replay: %v %v", claimed, err)
		}
	}
	for _, id := range ids[:2] {
		u, err := db.GetUserByID(ctx, id)
		if err != nil || u.CallCredits != 2 || u.CreditCallActive || u.DailyCallsUsed != 0 {
			t.Fatalf("wallet settlement: %+v %v", u, err)
		}
	}
	failed := uuid.NewString()
	if err := db.CreateCallSession(ctx, failed, failed, ids[0], ids[1]); err != nil {
		t.Fatal(err)
	}
	if _, err := db.CancelCallSession(ctx, failed); err != nil {
		t.Fatal(err)
	}
	for _, id := range ids[:2] {
		u, err := db.GetUserByID(ctx, id)
		if err != nil || u.CallCredits != 2 || u.CreditCallActive {
			t.Fatal("cancelled setup did not restore its reservation")
		}
	}
}

func TestIntegrationCreditRecordingKeepsSeparateStorage(t *testing.T) {
	db, ctx, ids := isolatedDB(t)
	if _, err := db.Pool.Exec(ctx, `UPDATE "User" SET "creditBilling"=true,"callCredits"=3,"recordingCredits"=1,"storageCredits"=1 WHERE id=ANY($1)`, ids[:2]); err != nil {
		t.Fatal(err)
	}
	call := uuid.NewString()
	if err := db.CreateCallSession(ctx, call, call, ids[0], ids[1]); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Pool.Exec(ctx, `UPDATE "CallSession" SET "mediaAuthorizedAt"=NOW() WHERE id=$1`, call); err != nil {
		t.Fatal(err)
	}
	ok, err := db.UpdateSessionEgressAtomic(ctx, call, "credit-egress-"+call, "recordings/"+call+".mp3", ids[0])
	if err != nil || !ok {
		t.Fatalf("recording start: %v %v", ok, err)
	}
	u, err := db.GetUserByID(ctx, ids[0])
	if err != nil || u.RecordingCredits != 0 || u.StorageCredits != 0 {
		t.Fatal("recording and storage were not reserved independently")
	}
	var created, expires time.Time
	if err := db.Pool.QueryRow(ctx, `SELECT "createdAt","expiresAt" FROM "RecordingSegment" WHERE "callId"=$1`, call).Scan(&created, &expires); err != nil {
		t.Fatal(err)
	}
	if expires.Sub(created) != 30*24*time.Hour {
		t.Fatal("storage did not start at file creation")
	}
}

func TestIntegrationThirtyMinuteUnitsAndFrozenLimit(t *testing.T) {
	db, ctx, ids := isolatedDB(t)
	if _, err := db.Pool.Exec(ctx, `UPDATE "User" SET "creditBilling"=true,"callCredits"=4,"preferredCallMinutes"=30 WHERE id=ANY($1)`, ids[:2]); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Pool.Exec(ctx, `UPDATE "User" SET "recordingCredits"=2,"storageCredits"=1 WHERE id=$1`, ids[0]); err != nil {
		t.Fatal(err)
	}
	call := uuid.NewString()
	a, b, err := db.AdmitCallSession(ctx, call, call, ids[0], ids[1])
	if err != nil {
		t.Fatal(err)
	}
	if a.CallCredits != 2 || b.CallCredits != 2 || a.ActiveCallCreditUnits != 2 {
		t.Fatal("30-minute admission must reserve two units")
	}
	if _, err := db.Pool.Exec(ctx, `UPDATE "User" SET "preferredCallMinutes"=15,"maxDuration"=5 WHERE id=ANY($1)`, ids[:2]); err != nil {
		t.Fatal(err)
	}
	session, err := db.GetCallSessionByRoomName(ctx, call)
	if err != nil || session.LimitMinutes(nil) != 30 {
		t.Fatalf("session duration changed after admission: %v", err)
	}
	if _, err := db.Pool.Exec(ctx, `UPDATE "CallSession" SET "mediaAuthorizedAt"=NOW() WHERE id=$1`, call); err != nil {
		t.Fatal(err)
	}
	ok, err := db.UpdateSessionEgressAtomic(ctx, call, "duration-egress-"+call, "recordings/"+call+".mp3", ids[0])
	if err != nil || !ok {
		t.Fatalf("30-minute recording start: %v", err)
	}
	u, err := db.GetUserByID(ctx, ids[0])
	if err != nil || u.RecordingCredits != 0 || u.StorageCredits != 1 {
		t.Fatal("recording must reserve two units and preserve insufficient storage")
	}
	var quantity, stored int
	if err := db.Pool.QueryRow(ctx, `SELECT quantity FROM "CreditUsage" WHERE "callId"=$1 AND "userId"=$2 AND kind='RECORDING'`, call, ids[0]).Scan(&quantity); err != nil || quantity != 2 {
		t.Fatal("recording quantity was not stored")
	}
	if err := db.Pool.QueryRow(ctx, `SELECT cardinality("storedOwnerIds") FROM "RecordingSegment" WHERE "callId"=$1`, call).Scan(&stored); err != nil || stored != 0 {
		t.Fatal("one storage unit must not buy 30-minute retention")
	}
	anchor := time.Now().UTC()
	if _, err := db.Pool.Exec(ctx, `UPDATE "CallSession" SET "mediaAuthorizedAt"=$2 WHERE id=$1`, call, anchor); err != nil {
		t.Fatal(err)
	}
	if _, err := db.CompleteUnchargedCallSession(ctx, call, 0, nil, nil, nil, CompletionEffects{EndedAt: &anchor}); err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 2; i++ {
		if _, err := db.Pool.Exec(ctx, `SELECT pairtalk_release_credit($1,$2,'RECORDING')`, call, ids[0]); err != nil {
			t.Fatal(err)
		}
	}
	u, err = db.GetUserByID(ctx, ids[0])
	if err != nil || u.CallCredits != 4 || u.RecordingCredits != 2 || u.ActiveCallCreditUnits != 0 {
		t.Fatal("failed setup did not restore the exact quantities once")
	}
}
