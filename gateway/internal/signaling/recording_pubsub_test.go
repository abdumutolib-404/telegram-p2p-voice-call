package signaling

import (
	"context"
	"encoding/json"
	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
	"os"
	"strings"
	"testing"
	"time"
)

func TestIntegrationRecordingStatusCrossReplicaWireContract(t *testing.T) {
	if os.Getenv("PAIRTALK_GATEWAY_TEST_DATABASE_URL") == "" {
		t.Skip("isolated service bindings not supplied")
	}
	if os.Getenv("NODE_ENV") != "test" {
		t.Fatal("requires isolated test mode")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	rdb := redis.NewClient(&redis.Options{Addr: "127.0.0.1:56379"})
	defer rdb.Close()
	if err := rdb.Ping(ctx).Err(); err != nil {
		t.Fatal(err)
	}
	firstPub, secondPub := NewPubSubClient(rdb), NewPubSubClient(rdb)
	first, second := NewHub(nil, nil, nil, firstPub, "", "", "", "", nil), NewHub(nil, nil, nil, secondPub, "", "", "", "", nil)
	defer first.Close()
	defer second.Close()
	room := uuid.NewString()
	socket := func(h *Hub) *ClientSocket {
		s := &ClientSocket{ID: uuid.NewString(), UserID: uuid.NewString(), Hub: h, Rooms: map[string]bool{}, PollingQueue: make(chan string, 8)}
		h.JoinRoom(s, room)
		return s
	}
	own, peer := socket(first), socket(second)
	firstPub.StartCommandSubscriber(ctx, first)
	secondPub.StartCommandSubscriber(ctx, second)
	for {
		counts, err := rdb.PubSubNumSub(ctx, RecordingStateChannel).Result()
		if err != nil {
			t.Fatal(err)
		}
		if counts[RecordingStateChannel] >= 2 {
			break
		}
		select {
		case <-ctx.Done():
			t.Fatal("subscribers not ready")
		case <-time.After(10 * time.Millisecond):
		}
	}
	first.publishRoomRecordingState(ctx, room, "on")
	receive := func(s *ClientSocket, want string) {
		t.Helper()
		select {
		case packet := <-s.PollingQueue:
			if !strings.Contains(packet, `"room_recording_status"`) || !strings.Contains(packet, `"state":"`+want+`"`) {
				t.Fatal(packet)
			}
		case <-ctx.Done():
			t.Fatal("cross-replica notification missing")
		}
	}
	receive(own, "on")
	receive(peer, "on")
	// The Node publisher uses this same channel and JSON shape.
	payload, _ := json.Marshal(RoomRecordingStatus{RoomName: room, State: "unknown", UpdatedAt: time.Now().UnixMilli(), Source: "synthetic-node-publisher"})
	if err := rdb.Publish(ctx, RecordingStateChannel, string(payload)).Err(); err != nil {
		t.Fatal(err)
	}
	receive(own, "unknown")
	receive(peer, "unknown")
	select {
	case packet := <-own.PollingQueue:
		t.Fatal("self-publication was duplicated: " + packet)
	case <-time.After(30 * time.Millisecond):
	}
}
