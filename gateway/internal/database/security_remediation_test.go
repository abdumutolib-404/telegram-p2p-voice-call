package database

import (
	"github.com/google/uuid"
	"testing"
	"time"
)

func TestIntegrationRecordingIntentPreservesOwnershipAndHistory(t *testing.T) {
	db, ctx, ids := isolatedDB(t)
	id := uuid.NewString()
	if err := db.CreateCallSession(ctx, id, id, ids[0], ids[1]); err != nil {
		t.Fatal(err)
	}
	if ok, err := db.UpdateSessionEgressAtomic(ctx, id, "first", "recordings/first.mp3", ids[0]); err != nil || !ok {
		t.Fatalf("start: %v", err)
	}
	if ok, err := db.UpdateSessionEgressAtomic(ctx, id, "losing", "recordings/losing.mp3", ids[1]); err != nil || ok {
		t.Fatalf("competing start: %v", err)
	}
	if stopped, err := db.ChangeRecordingIntent(ctx, id, ids[1], "first", false); err != nil || stopped {
		t.Fatalf("outsider intent stopped owner: %v", err)
	}
	if stopped, err := db.ChangeRecordingIntent(ctx, id, ids[0], "first", false); err != nil || !stopped {
		t.Fatalf("stop: %v", err)
	}
	session, err := db.GetCallSessionByRoomName(ctx, id)
	if err != nil || session.ActiveRecorderIDs != nil || session.RecordedByUserID == nil || *session.RecordedByUserID != ids[0] || session.EgressID == nil || *session.EgressID != "first" {
		t.Fatalf("stop lost private ownership: %+v, %v", session, err)
	}
	if ok, err := db.UpdateSessionEgressAtomic(ctx, id, "second", "recordings/second.mp3", ids[1], session.EgressID); err != nil || !ok {
		t.Fatalf("restart: %v", err)
	}
	var keys []string
	if err := db.Pool.QueryRow(ctx, `SELECT "recordingKeys" FROM "CallSession" WHERE id=$1`, id).Scan(&keys); err != nil || len(keys) != 3 {
		t.Fatalf("history: %v, %v", keys, err)
	}
	session, err = db.GetCallSessionByRoomName(ctx, id)
	if err != nil || *session.RecordedByUserID != ids[1] {
		t.Fatalf("restart ownership: %+v, %v", session, err)
	}
	if _, err = db.GetActiveCallForUser(ctx, ids[0]); err != nil {
		t.Fatal(err)
	}
	if _, err = db.GetActiveSessionsForReconciliation(ctx); err != nil {
		t.Fatal(err)
	}
	if stopped, err := db.ChangeRecordingIntent(ctx, id, ids[1], "second", false); err != nil || !stopped {
		t.Fatal("restart stop failed", err)
	}
	previous := "first"
	if ok, err := db.UpdateSessionEgressAtomic(ctx, id, "late-first-start", "recordings/late.mp3", ids[0], &previous); err != nil || ok {
		t.Fatal("a stale start replaced the newer recording", err)
	}
	oldURL := "recordings/first.mp3"
	if ok, err := db.CompleteCallSession(ctx, id, 2, &previous, &oldURL, nil); err != nil || !ok {
		t.Fatal("completion failed", err)
	}
	session, err = db.GetCallSessionByRoomName(ctx, id)
	if err != nil || *session.EgressID != "second" || *session.RecordingURL != "recordings/second.mp3" || *session.RecordedByUserID != ids[1] || session.RecordingExpiresAt == nil {
		t.Fatalf("stale completion replaced current recording: %+v, %v", session, err)
	}
}

func TestIntegrationForgedPermissionFailureCannotExemptLongCall(t *testing.T) {
	db, ctx, ids := isolatedDB(t)
	id := uuid.NewString()
	if _, err := db.Pool.Exec(ctx, `UPDATE "User" SET "dailyCallsUsed"=1,"lastCallDate"=$1 WHERE id=ANY($2)`, time.Now().UTC().Format("2006-01"), ids); err != nil {
		t.Fatal(err)
	}
	if err := db.CreateCallSession(ctx, id, id, ids[0], ids[1]); err != nil {
		t.Fatal(err)
	}
	effects := CompletionEffects{Reason: "microphone_permission_denied", DeniedUserID: ids[0]}
	if ok, err := db.CompleteUnchargedCallSession(ctx, id, 35, nil, nil, nil, effects); err != nil || !ok {
		t.Fatalf("completion: %v", err)
	}
	if ok, err := db.CompleteUnchargedCallSession(ctx, id, 35, nil, nil, nil, effects); err != nil || ok {
		t.Fatalf("replay: %v", err)
	}
	for _, userID := range ids[:2] {
		user, err := db.GetUserByID(ctx, userID)
		if err != nil || user.DailyCallsUsed != 2 {
			t.Fatalf("charge: %+v, %v", user, err)
		}
	}
	var reason, denied string
	if err := db.Pool.QueryRow(ctx, `SELECT reason,"deniedUserId" FROM "PostCallJob" WHERE "callId"=$1`, id).Scan(&reason, &denied); err != nil || reason != "call_finished" || denied != "" {
		t.Fatalf("effects: %s, %s, %v", reason, denied, err)
	}
}
