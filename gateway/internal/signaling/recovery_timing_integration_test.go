package signaling

import (
	"context"
	"encoding/json"
	"net/url"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/pairtalk/gateway/internal/auth"
	"github.com/pairtalk/gateway/internal/database"
)

func TestIntegrationRecoveryUsesOriginalAuthorizedTiming(t *testing.T) {
	connection := os.Getenv("PAIRTALK_GATEWAY_TEST_DATABASE_URL")
	if connection == "" {
		t.Skip("isolated PostgreSQL bindings were not supplied")
	}
	parsed, err := url.Parse(connection)
	if err != nil || parsed.Hostname() != "127.0.0.1" || parsed.Port() != "55432" || parsed.Path != "/pairtalk_check" || os.Getenv("NODE_ENV") != "test" {
		t.Fatal("requires the dedicated loopback test database")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	db, err := database.NewPool(ctx, connection)
	if err != nil {
		t.Fatal("isolated database connection failed")
	}
	defer db.Close()
	ids := []string{uuid.NewString(), uuid.NewString(), uuid.NewString()}
	room := uuid.NewString()
	defer func() {
		cleanup, stop := context.WithTimeout(context.Background(), 5*time.Second)
		defer stop()
		if _, err := db.Pool.Exec(cleanup, `DELETE FROM "CallSession" WHERE id=$1`, room); err != nil {
			t.Errorf("session fixture cleanup: %v", err)
		}
		if _, err := db.Pool.Exec(cleanup, `DELETE FROM "User" WHERE id=ANY($1)`, ids); err != nil {
			t.Errorf("user fixture cleanup: %v", err)
		}
	}()
	for i, id := range ids {
		if _, err = db.Pool.Exec(ctx, `INSERT INTO "User" (id,"telegramId",alias,"updatedAt",onboarded,"termsAcceptedVersion","termsAcceptedAt","termsDocumentSha256","maxDuration") VALUES ($1,$2,$1,NOW(),TRUE,$3,NOW(),$4,15)`, id, time.Now().UnixMicro()+int64(i), auth.TermsVersion, auth.TermsDocumentSHA256); err != nil {
			t.Fatal(err)
		}
	}
	if err = db.CreateCallSession(ctx, room, room, ids[0], ids[1]); err != nil {
		t.Fatal(err)
	}
	started := time.Now().UTC().Add(-10 * time.Minute).Truncate(time.Millisecond)
	if _, err = db.Pool.Exec(ctx, `UPDATE "CallSession" SET "mediaAuthorizedAt"=$2 WHERE id=$1`, room, started); err != nil {
		t.Fatal(err)
	}
	hub := NewHub(db, nil, nil, nil, "", "", "synthetic-key", "synthetic-secret", nil)
	defer hub.Close()
	socket := func(id string) *ClientSocket {
		return &ClientSocket{ID: uuid.NewString(), UserID: id, Hub: hub, Rooms: map[string]bool{}, PollingQueue: make(chan string, 8)}
	}
	first, outsider := socket(ids[0]), socket(ids[2])
	hub.checkAutoReconnect(first)
	select {
	case packet := <-first.PollingQueue:
		// Socket.IO's event packet has a "42" prefix followed by a JSON array.
		var event []json.RawMessage
		if len(packet) < 3 || json.Unmarshal([]byte(packet[2:]), &event) != nil || len(event) != 2 {
			t.Fatalf("invalid recovery packet: %s", packet)
		}
		var name string
		var match MatchFoundEvent
		if json.Unmarshal(event[0], &name) != nil || name != "match_found" || json.Unmarshal(event[1], &match) != nil {
			t.Fatal("recovery did not emit match_found")
		}
		if match.CallDurationLimit != 900 || match.MaxDurationSeconds != 900 || match.StartedAt != started.UnixMilli() || match.ExpiresAt != started.Add(15*time.Minute).UnixMilli() {
			t.Fatalf("recovery changed timing: duration=%d max=%d startedAt=%d expiresAt=%d", match.CallDurationLimit, match.MaxDurationSeconds, match.StartedAt, match.ExpiresAt)
		}
	case <-ctx.Done():
		t.Fatal("recovery did not emit voice credentials")
	}
	hub.checkAutoReconnect(outsider)
	if len(outsider.PollingQueue) != 0 {
		t.Fatal("nonparticipant received recovery credentials")
	}
}
