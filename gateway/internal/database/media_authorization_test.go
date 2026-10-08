package database

import (
	"github.com/google/uuid"
	"testing"
)

func TestIntegrationDurableMediaGatePreventsFreeCancellation(t *testing.T) {
	db, ctx, ids := isolatedDB(t)
	id := uuid.NewString()
	if err := db.CreateCallSession(ctx, id, id, ids[0], ids[1]); err != nil {
		t.Fatal(err)
	}
	if allowed, err := db.RegisterReadyParticipant(ctx, id, "outsider"); err != nil || allowed {
		t.Fatal("outsider opened media gate")
	}
	if allowed, err := db.RegisterReadyParticipant(ctx, id, ids[0]); err != nil || allowed {
		t.Fatal("one participant opened media gate")
	}
	if allowed, err := db.RegisterReadyParticipant(ctx, id, ids[1]); err != nil || !allowed {
		t.Fatal("both participants did not open gate")
	}
	session, err := db.GetCallSessionByRoomName(ctx, id)
	if err != nil || session.MediaAuthorizedAt == nil {
		t.Fatal("authorization was not durable")
	}
	if cancelled, err := db.CancelCallSession(ctx, id); err != nil || cancelled {
		t.Fatal("authorized media was erased by free cancellation")
	}
	if _, err := db.Pool.Exec(ctx, `UPDATE "CallSession" SET "mediaAuthorizedAt"=NOW()-INTERVAL '60 seconds' WHERE id=$1`, id); err != nil {
		t.Fatal(err)
	}
	if completed, err := db.CompleteCallSession(ctx, id, 60, nil, nil, nil); err != nil || !completed {
		t.Fatal("authorized departed call was not charged")
	}
	var used int
	if err := db.Pool.QueryRow(ctx, `SELECT "dailyCallsUsed" FROM "User" WHERE id=$1`, ids[0]).Scan(&used); err != nil || used != 1 {
		t.Fatalf("usage: %d %v", used, err)
	}
	pending := uuid.NewString()
	if err := db.CreateCallSession(ctx, pending, pending, ids[0], ids[1]); err != nil {
		t.Fatal(err)
	}
	if cancelled, err := db.CancelCallSession(ctx, pending); err != nil || !cancelled {
		t.Fatal("genuine never-authorized call stopped being free")
	}
	if allowed, err := db.RegisterReadyParticipant(ctx, pending, ids[0]); err != nil || allowed {
		t.Fatal("terminal call reopened gate")
	}
}
