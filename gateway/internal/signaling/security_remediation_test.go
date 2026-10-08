package signaling

import (
	"context"
	"encoding/json"
	"github.com/google/uuid"
	lk "github.com/livekit/protocol/livekit"
	"github.com/pairtalk/gateway/internal/auth"
	"github.com/pairtalk/gateway/internal/database"
	media "github.com/pairtalk/gateway/internal/livekit"
	"google.golang.org/protobuf/proto"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"strings"
	"testing"
	"time"
)

func TestIntegrationRoomStateRequiresActiveParticipants(t *testing.T) {
	connection := os.Getenv("PAIRTALK_GATEWAY_TEST_DATABASE_URL")
	if connection == "" {
		t.Skip("isolated PostgreSQL bindings were not supplied")
	}
	parsed, err := url.Parse(connection)
	if err != nil || parsed.Hostname() != "127.0.0.1" || parsed.Port() != "55432" || parsed.Path != "/pairtalk_check" || os.Getenv("NODE_ENV") != "test" {
		t.Fatal("requires isolated test database")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	db, err := database.NewPool(ctx, connection)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	a, b, outsider, room := uuid.NewString(), uuid.NewString(), uuid.NewString(), uuid.NewString()
	for i, id := range []string{a, b} {
		if _, err = db.Pool.Exec(ctx, `INSERT INTO "User" (id,"telegramId",alias,"updatedAt",onboarded,"termsAcceptedVersion","termsAcceptedAt","termsDocumentSha256") VALUES ($1,$2,$1,NOW(),TRUE,$3,NOW(),$4)`, id, time.Now().UnixMicro()+int64(i), auth.TermsVersion, auth.TermsDocumentSHA256); err != nil {
			t.Fatal(err)
		}
	}
	defer func() {
		db.Pool.Exec(context.Background(), `DELETE FROM "CallSession" WHERE id=$1`, room)
		db.Pool.Exec(context.Background(), `DELETE FROM "User" WHERE id=ANY($1)`, []string{a, b})
	}()
	if err = db.CreateCallSession(ctx, room, room, a, b); err != nil {
		t.Fatal(err)
	}
	if _, err = db.Pool.Exec(ctx, `UPDATE "CallSession" SET "createdAt"=NOW()-INTERVAL '30 seconds' WHERE id=$1`, room); err != nil {
		t.Fatal(err)
	}
	hub := NewHub(db, nil, nil, nil, "", "", "", "", nil)
	defer hub.Close()
	socket := func(id string) *ClientSocket {
		return &ClientSocket{ID: uuid.NewString(), UserID: id, Hub: hub, Rooms: make(map[string]bool), PollingQueue: make(chan string, 64)}
	}
	first, second, stranger := socket(a), socket(b), socket(outsider)
	for _, name := range []string{"missing-room", room} {
		payload, _ := json.Marshal(map[string]any{"roomName": name, "record": true})
		hub.handlePeerReady(stranger, payload)
		hub.handleToggleRecord(stranger, payload)
		hub.handleFinishCall(stranger, payload)
	}
	mutexes := 0
	hub.roomMutexes.Range(func(_, _ any) bool { mutexes++; return true })
	if mutexes != 0 || len(hub.roomPeers) != 0 || len(hub.roomStartedAt) != 0 || len(hub.serverSessionTimers) != 0 {
		t.Fatal("unauthorized room request retained state")
	}
	payload, _ := json.Marshal(map[string]string{"roomName": room})
	hub.handlePeerReady(first, payload)
	if len(hub.roomStartedAt) != 0 {
		t.Fatal("started with only one participant")
	}
	hub.handlePeerReady(second, payload)
	started := hub.roomStartedAt[room]
	hub.handlePeerReady(second, payload)
	if started == 0 || hub.roomStartedAt[room] != started || len(hub.serverSessionTimers) != 1 {
		t.Fatal("legitimate readiness did not start once")
	}
	authorizedSession, err := db.GetCallSessionByRoomName(ctx, room)
	if err != nil || authorizedSession.MediaAuthorizedAt == nil || started != authorizedSession.MediaAuthorizedAt.UnixMilli() {
		t.Fatal("speaking clock did not use durable media authorization")
	}
	if _, err = db.Pool.Exec(ctx, `UPDATE "CallSession" SET "egressId"='old-stopped-egress' WHERE id=$1`, room); err != nil {
		t.Fatal(err)
	}
	lookupStarted, release := make(chan struct{}), make(chan struct{})
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		close(lookupStarted)
		select {
		case <-release:
		case <-r.Context().Done():
			return
		}
		body, _ := proto.Marshal(&lk.ListEgressResponse{Items: []*lk.EgressInfo{{EgressId: "old-stopped-egress", Status: lk.EgressStatus_EGRESS_COMPLETE}}})
		w.Header().Set("Content-Type", "application/protobuf")
		w.Write(body)
	}))
	defer provider.Close()
	hub.LiveKit = media.NewClient(provider.URL, "synthetic-key", "synthetic-secret", "", "", "", "", "", false, "")
	lookupDone := make(chan struct{})
	go func() { hub.handleRecordingStatus(first, payload); close(lookupDone) }()
	select {
	case <-lookupStarted:
	case <-ctx.Done():
		t.Fatal("snapshot did not query provider")
	}
	if _, err = db.Pool.Exec(ctx, `UPDATE "CallSession" SET "egressId"='new-active-egress',"activeRecorderIds"=$2 WHERE id=$1`, room, a); err != nil {
		close(release)
		t.Fatal(err)
	}
	close(release)
	select {
	case <-lookupDone:
	case <-ctx.Done():
		t.Fatal("snapshot did not finish")
	}
	found := false
	for len(first.PollingQueue) > 0 {
		packet := <-first.PollingQueue
		if strings.Contains(packet, `"room_recording_status"`) {
			found = true
			if !strings.Contains(packet, `"state":"unknown"`) {
				t.Fatal("old provider reply misrepresented restarted capture: " + packet)
			}
		}
	}
	if !found {
		t.Fatal("recording snapshot was not emitted")
	}
}
