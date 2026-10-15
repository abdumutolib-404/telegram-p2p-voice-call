package database

import (
	"testing"
	"time"
)

func TestRestrictionStates(t *testing.T) {
	now := time.Now()
	future := now.Add(time.Hour)
	past := now.Add(-time.Hour)
	cases := []struct {
		user *User
		want bool
	}{
		{nil, true}, {&User{}, false}, {&User{IsPermanentlyBanned: true}, true},
		{&User{IsBanned: true}, true}, {&User{BannedUntil: &future}, true},
		{&User{IsBanned: true, BannedUntil: &past}, false},
	}
	for _, c := range cases {
		if c.user.Restricted(now) != c.want {
			t.Fatalf("restriction mismatch: %+v", c.user)
		}
	}
}

func TestIntegrationRestrictedReadiness(t *testing.T) {
	db, ctx, ids := isolatedDB(t)
	id := "restricted-readiness-call"
	if err := db.CreateCallSession(ctx, id, id, ids[0], ids[1]); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Pool.Exec(ctx, `UPDATE "User" SET "isBanned"=true WHERE id=$1`, ids[1]); err != nil {
		t.Fatal(err)
	}
	if allowed, err := db.RegisterReadyParticipant(ctx, id, ids[0]); err != nil || allowed {
		t.Fatalf("restricted participant authorized: %v %v", allowed, err)
	}
	if _, err := db.Pool.Exec(ctx, `UPDATE "User" SET "bannedUntil"=NOW()-INTERVAL '1 hour' WHERE id=$1`, ids[1]); err != nil {
		t.Fatal(err)
	}
	if allowed, err := db.RegisterReadyParticipant(ctx, id, ids[0]); err != nil || allowed {
		t.Fatalf("first readiness: %v %v", allowed, err)
	}
	if allowed, err := db.RegisterReadyParticipant(ctx, id, ids[1]); err != nil || !allowed {
		t.Fatalf("expired suspension blocked: %v %v", allowed, err)
	}
}
