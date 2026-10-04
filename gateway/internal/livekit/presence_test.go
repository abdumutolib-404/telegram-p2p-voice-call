package livekit

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/livekit/protocol/livekit"
	"google.golang.org/protobuf/encoding/protojson"
	"google.golang.org/protobuf/proto"
)

func TestSharedRoomPresenceRequiresAuthoritativeEvidence(t *testing.T) {
	for _, value := range []struct {
		name    string
		status  int
		body    string
		present bool
		failed  bool
		count   int
	}{
		{"participant on another gateway", 200, `{"participants":[{"identity":"user-A"}]}`, true, false, 1},
		{"completed remote handshake", 200, `{"participants":[{"identity":"user-A"},{"identity":"user-B"},{"identity":"user-A"}]}`, true, false, 2},
		{"egress only", 200, `{"participants":[{"identity":"egress-recorder"}]}`, false, false, 0},
		{"empty room", 200, `{"participants":[]}`, false, false, 0},
		{"missing room", 404, `{"code":"not_found","msg":"Room not found"}`, false, false, 0},
		{"provider failure", 503, `{"code":"unavailable","msg":"Unavailable"}`, false, true, 0},
	} {
		t.Run(value.name, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.URL.Path != "/twirp/livekit.RoomService/ListParticipants" {
					t.Errorf("unexpected API path: %s", r.URL.Path)
				}
				if value.status == 200 {
					message := &livekit.ListParticipantsResponse{}
					if err := protojson.Unmarshal([]byte(value.body), message); err != nil {
						t.Error(err)
						return
					}
					body, err := proto.Marshal(message)
					if err != nil {
						t.Error(err)
						return
					}
					w.Header().Set("Content-Type", "application/protobuf")
					_, _ = w.Write(body)
				} else {
					w.Header().Set("Content-Type", "application/json")
					w.WriteHeader(value.status)
					_, _ = w.Write([]byte(value.body))
				}
			}))
			defer server.Close()
			client := NewClient(server.URL, "synthetic-key", "synthetic-secret", "", "", "", "", "", false, "")
			present, err := client.ParticipantsPresent(context.Background(), "synthetic-room", "user-A", "user-B")
			if present != value.present || (err != nil) != value.failed {
				t.Fatalf("presence=%v, error=%v", present, err)
			}
			count, err := client.ConnectedParticipants(context.Background(), "synthetic-room", "user-A", "user-B")
			if count != value.count || (err != nil) != value.failed {
				t.Fatalf("participant count=%d, error=%v", count, err)
			}
		})
	}
	var absent *Client
	if _, err := absent.ParticipantsPresent(context.Background(), "synthetic-room", "user-A"); err == nil {
		t.Fatal("unconfigured provider was treated as an empty room")
	}
}
