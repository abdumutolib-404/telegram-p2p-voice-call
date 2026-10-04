package signaling

import (
	"context"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"
	protocol "github.com/livekit/protocol/livekit"
	"github.com/pairtalk/gateway/internal/database"
	"github.com/pairtalk/gateway/internal/livekit"
	"google.golang.org/protobuf/proto"
)

func TestIntegrationCleanupPreservesRemoteOrUncertainCalls(t *testing.T) {
	connection := os.Getenv("PAIRTALK_GATEWAY_TEST_DATABASE_URL")
	if connection == "" {
		t.Skip("isolated PostgreSQL bindings were not supplied")
	}
	u, err := url.Parse(connection)
	if err != nil || u.Hostname() != "127.0.0.1" || u.Port() != "55432" || u.Path != "/pairtalk_check" || os.Getenv("NODE_ENV") != "test" {
		t.Fatal("cleanup verification requires the dedicated loopback database")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	db, err := database.NewPool(ctx, connection)
	if err != nil {
		t.Fatal("isolated PostgreSQL connection failed")
	}
	defer db.Close()
	ids := []string{uuid.NewString(), uuid.NewString()}
	defer func() {
		cleanup, stop := context.WithTimeout(context.Background(), 5*time.Second)
		defer stop()
		for _, query := range []string{`DELETE FROM "CallSession" WHERE "userAId"=ANY($1)`, `DELETE FROM "User" WHERE id=ANY($1)`} {
			if _, err := db.Pool.Exec(cleanup, query, ids); err != nil {
				t.Errorf("fixture cleanup: %v", err)
			}
		}
	}()
	for i, id := range ids {
		if _, err := db.Pool.Exec(ctx, `INSERT INTO "User" (id,"telegramId",alias,"updatedAt") VALUES ($1,$2,$3,NOW())`, id, time.Now().UnixMicro()+int64(i), "gateway-cleanup-"+id); err != nil {
			t.Fatal(err)
		}
	}
	for _, value := range []struct {
		name        string
		peers       int
		unavailable bool
		want        string
		handshake   bool
	}{
		{"remote participant", 1, false, "ACTIVE", false},
		{"provider unavailable", 0, true, "ACTIVE", false},
		{"authoritative empty room", 0, false, "CANCELLED", false},
		{"remote handshake completed", 2, false, "ACTIVE", true},
		{"handshake provider unavailable", 0, true, "ACTIVE", true},
		{"handshake partner absent", 1, false, "CANCELLED", true},
	} {
		t.Run(value.name, func(t *testing.T) {
			// Fixtures bypass admission only to recreate an existing shared session.
			id := uuid.NewString()
			if _, err := db.Pool.Exec(ctx, `INSERT INTO "CallSession" (id,"roomName","userAId","userBId",status,"createdAt") VALUES ($1,$1,$2,$3,'ACTIVE',NOW()-INTERVAL '120 seconds')`, id, ids[0], ids[1]); err != nil {
				t.Fatal(err)
			}
			defer func() {
				if _, err := db.Pool.Exec(ctx, `DELETE FROM "CallSession" WHERE id=$1`, id); err != nil {
					t.Error(err)
				}
			}()
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if value.unavailable {
					w.Header().Set("Content-Type", "application/json")
					w.WriteHeader(503)
					_, _ = w.Write([]byte(`{"code":"unavailable","msg":"Synthetic provider failure"}`))
					return
				}
				message := &protocol.ListParticipantsResponse{}
				for i := 0; i < value.peers; i++ {
					message.Participants = append(message.Participants, &protocol.ParticipantInfo{Identity: ids[i]})
				}
				body, err := proto.Marshal(message)
				if err != nil {
					t.Error(err)
					return
				}
				if r.URL.Path == "/twirp/livekit.RoomService/DeleteRoom" {
					body = []byte{}
				}
				w.Header().Set("Content-Type", "application/protobuf")
				_, _ = w.Write(body)
			}))
			defer server.Close()
			client := livekit.NewClient(server.URL, "synthetic-key", "synthetic-secret", "", "", "", "", "", false, "")
			hub := NewHub(db, nil, client, nil, "", server.URL, "synthetic-key", "synthetic-secret", nil)
			defer hub.Close()
			if value.handshake {
				hub.ScheduleConnectionHandshakeTimer(id, 1)
				hub.mu.RLock()
				original := hub.handshakeTimers[id]
				hub.mu.RUnlock()
				deadline := time.Now().Add(5 * time.Second)
				for {
					session, err := db.GetCallSessionByRoomName(ctx, id)
					if err != nil {
						t.Fatal(err)
					}
					hub.mu.RLock()
					rescheduled := hub.serverSessionTimers[id] != nil || (hub.handshakeTimers[id] != nil && hub.handshakeTimers[id] != original)
					hub.mu.RUnlock()
					if session.Status == "CANCELLED" || rescheduled {
						break
					}
					if time.Now().After(deadline) {
						t.Fatal("handshake callback did not finish")
					}
					time.Sleep(10 * time.Millisecond)
				}
			} else {
				if _, err := hub.SweepZombieSessions(ctx); err != nil {
					t.Fatal(err)
				}
			}
			session, err := db.GetCallSessionByRoomName(ctx, id)
			if err != nil || session == nil || session.Status != value.want {
				t.Fatalf("shared call incorrectly cleaned: session=%+v, error=%v", session, err)
			}
		})
	}
}
