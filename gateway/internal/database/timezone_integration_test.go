package database

import (
	"testing"
	"time"

	"github.com/google/uuid"
)

func TestIntegrationSessionsPreserveUTCWallTimes(t *testing.T) {
	db, ctx, _ := isolatedDB(t)
	before := time.Now().UTC()
	var timezone string
	var stored time.Time
	if err := db.Pool.QueryRow(ctx, `SELECT current_setting('TimeZone'), CURRENT_TIMESTAMP::timestamp`).Scan(&timezone, &stored); err != nil {
		t.Fatal(err)
	}
	if timezone != "UTC" {
		t.Fatalf("connection timezone=%q; accounting requires UTC", timezone)
	}
	if stored.Before(before.Add(-time.Second)) || stored.After(time.Now().UTC().Add(time.Second)) {
		t.Fatalf("database-generated wall time differs from UTC: %s", stored)
	}
}

func TestIntegrationStaleCutoffUsesTheInstantAcrossTimezones(t *testing.T) {
	db, ctx, ids := isolatedDB(t)
	old, recent := uuid.NewString(), uuid.NewString()
	now := time.Now().UTC()
	for _, fixture := range []struct {
		id      string
		created time.Time
	}{{old, now.Add(-2 * time.Minute)}, {recent, now.Add(-20 * time.Second)}} {
		if _, err := db.Pool.Exec(ctx, `INSERT INTO "CallSession" (id,"roomName","userAId","userBId",status,"createdAt") VALUES ($1,$1,$2,$3,'PENDING',$4)`, fixture.id, ids[0], ids[1], fixture.created); err != nil {
			t.Fatal(err)
		}
	}
	cutoff := now.Add(-time.Minute).In(time.FixedZone("fixture-plus-five", 5*60*60))
	sessions, err := db.GetStalePendingSessions(ctx, cutoff)
	if err != nil {
		t.Fatal(err)
	}
	foundOld, foundRecent := false, false
	for _, session := range sessions {
		foundOld = foundOld || session.ID == old
		foundRecent = foundRecent || session.ID == recent
	}
	if !foundOld || foundRecent {
		t.Fatalf("local timezone changed stale admission cutoff: old=%v recent=%v", foundOld, foundRecent)
	}
}
