package signaling

import (
	"context"
	"encoding/json"
	"github.com/google/uuid"
	"github.com/pairtalk/gateway/internal/auth"
	"github.com/pairtalk/gateway/internal/database"
	"github.com/pairtalk/gateway/internal/matchmaking"
	"github.com/redis/go-redis/v9"
	"net/url"
	"os"
	"strings"
	"testing"
	"time"
)

func TestIntegrationRemoteMatchAndTerminalRoomCleanup(t *testing.T) {
	connection := os.Getenv("PAIRTALK_GATEWAY_TEST_DATABASE_URL")
	if connection == "" {
		t.Skip("isolated bindings not supplied")
	}
	parsed, err := url.Parse(connection)
	if err != nil || parsed.Hostname() != "127.0.0.1" || parsed.Port() != "55432" || parsed.Path != "/pairtalk_check" || os.Getenv("NODE_ENV") != "test" {
		t.Fatal("requires isolated database")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	db, err := database.NewPool(ctx, connection)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	rdb := redis.NewClient(&redis.Options{Addr: "127.0.0.1:56379"})
	defer rdb.Close()
	if err = rdb.Ping(ctx).Err(); err != nil {
		t.Fatal(err)
	}
	ids := []string{uuid.NewString(), uuid.NewString()}
	defer func() {
		db.Pool.Exec(context.Background(), `DELETE FROM "CallSession" WHERE "userAId"=ANY($1) OR "userBId"=ANY($1)`, ids)
		db.Pool.Exec(context.Background(), `DELETE FROM "User" WHERE id=ANY($1)`, ids)
		for _, id := range ids {
			rdb.Del(context.Background(), "pairtalk:presence:"+id)
			matchmaking.NewEngine(rdb).CancelQueue(context.Background(), id)
		}
	}()
	for i, id := range ids {
		_, err = db.Pool.Exec(ctx, `INSERT INTO "User" (id,"telegramId",alias,"updatedAt",onboarded,"termsAcceptedVersion","termsAcceptedAt","termsDocumentSha256",band) VALUES ($1,$2,$1,NOW(),TRUE,$3,NOW(),$4,6.5)`, id, time.Now().UnixMicro()+int64(i), auth.TermsVersion, auth.TermsDocumentSHA256)
		if err != nil {
			t.Fatal(err)
		}
	}
	hubs := []*Hub{}
	sockets := []*ClientSocket{}
	for _, id := range ids {
		pub := NewPubSubClient(rdb)
		hub := NewHub(db, matchmaking.NewEngine(rdb), nil, pub, "", "", "synthetic-key", "synthetic-secret", nil)
		defer hub.Close()
		socket := &ClientSocket{ID: uuid.NewString(), UserID: id, Hub: hub, Rooms: map[string]bool{}, PollingQueue: make(chan string, 32)}
		hub.userSockets[id] = map[string]*ClientSocket{socket.ID: socket}
		pub.StartCommandSubscriber(ctx, hub)
		hubs = append(hubs, hub)
		sockets = append(sockets, socket)
	}
	for {
		counts, err := rdb.PubSubNumSub(ctx, CommandsChannel).Result()
		if err != nil {
			t.Fatal(err)
		}
		if counts[CommandsChannel] >= 2 {
			break
		}
		select {
		case <-ctx.Done():
			t.Fatal("subscribers unavailable")
		case <-time.After(10 * time.Millisecond):
		}
	}
	hubs[0].handleJoinQueue(sockets[0])
	hubs[1].handleJoinQueue(sockets[1])
	call, err := db.GetActiveCallForUser(ctx, ids[0])
	if err != nil || call == nil {
		t.Fatalf("users on separate gateways did not match: %v", err)
	}
	for _, socket := range sockets {
		found := false
		for !found {
			select {
			case packet := <-socket.PollingQueue:
				found = strings.Contains(packet, `"match_found"`)
			case <-ctx.Done():
				t.Fatal("remote participant did not receive voice credentials")
			}
		}
		socket.mu.Lock()
		joined := socket.Rooms[call.RoomName]
		socket.mu.Unlock()
		if !joined {
			t.Fatal("matched remote participant did not join its local room index")
		}
	}
	// Remove one replica's presence without removing the other replica's field.
	if err = hubs[0].PubSub.recordPresence(ctx, ids[0], true); err != nil {
		t.Fatal(err)
	}
	if err = hubs[1].PubSub.recordPresence(ctx, ids[0], true); err != nil {
		t.Fatal(err)
	}
	hubs[0].PubSub.recordPresence(ctx, ids[0], false)
	if online, err := hubs[0].PubSub.userOnline(ctx, ids[0]); err != nil || !online {
		t.Fatal("one replica erased a remote reconnect")
	}
	if _, err = db.CancelCallSession(ctx, call.ID); err != nil {
		t.Fatal(err)
	}
	hubs[1].FinishRoom(call.RoomName, CallFinishedEvent{Reason: "call_cancelled"})
	for _, hub := range hubs {
		for {
			hub.mu.RLock()
			remaining := len(hub.roomSockets[call.RoomName])
			hub.mu.RUnlock()
			if remaining == 0 {
				break
			}
			select {
			case <-ctx.Done():
				t.Fatal("remote completion retained room routing")
			case <-time.After(10 * time.Millisecond):
			}
		}
	}
	for _, socket := range sockets {
		socket.mu.Lock()
		remaining := socket.Rooms[call.RoomName]
		socket.mu.Unlock()
		if remaining {
			t.Fatal("remote completion retained per-socket room membership")
		}
	}
	// A terminal retry must also clean a lost-notification local copy.
	hubs[0].mu.Lock()
	hubs[0].roomSockets[call.RoomName] = map[string]*ClientSocket{sockets[0].ID: sockets[0]}
	hubs[0].mu.Unlock()
	sockets[0].mu.Lock()
	sockets[0].Rooms[call.RoomName] = true
	sockets[0].mu.Unlock()
	payload, _ := json.Marshal(map[string]string{"roomName": call.RoomName})
	hubs[0].handleWebRTCSignal(sockets[0], "offer", payload)
	sockets[0].mu.Lock()
	staleRelay := sockets[0].Rooms[call.RoomName]
	sockets[0].mu.Unlock()
	if staleRelay {
		t.Fatal("legacy relay trusted stale room membership after terminal completion")
	}
	hubs[0].handleFinishCall(sockets[0], payload)
	hubs[0].mu.RLock()
	remaining := len(hubs[0].roomSockets[call.RoomName])
	hubs[0].mu.RUnlock()
	if remaining != 0 {
		t.Fatal("losing terminal retry retained room")
	}
	hubs[0].JoinRoom(sockets[0], call.RoomName)
	sockets[0].mu.Lock()
	resurrected := sockets[0].Rooms[call.RoomName]
	sockets[0].mu.Unlock()
	if resurrected {
		t.Fatal("late reconnect resurrected terminal room")
	}
}
