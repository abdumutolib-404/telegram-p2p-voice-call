package signaling

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestAuthenticationAdmissionBoundsAndReleasesAllPaths(t *testing.T) {
	server, _ := boundaryServer(t)
	releases := []func(){}
	for i := 0; i < 16; i++ {
		release, ok := server.reserveIngress(fmt.Sprintf("fixture-ip-%d", i/4), true)
		if !ok {
			t.Fatal("legitimate authentication reservation rejected")
		}
		releases = append(releases, release)
	}
	if _, ok := server.reserveIngress("another-ip", true); ok {
		t.Fatal("global authentication bound bypassed")
	}
	if _, ok := server.reserveIngress("fixture-ip-0", true); ok {
		t.Fatal("per-address bound bypassed")
	}
	for _, release := range releases {
		release()
		release()
	}
	if len(server.authIPs) != 0 || len(server.authSlots) != 0 {
		t.Fatal("authentication permits leaked")
	}
	release, ok := server.reserveIngress("fixture-ip-0", true)
	if !ok {
		t.Fatal("capacity was not reusable")
	}
	release()
}

func TestWebsocketHandshakeRejectedBeforeUpgradeWhenIngressIsFull(t *testing.T) {
	server, router := boundaryServer(t)
	for i := 0; i < 64; i++ {
		release, ok := server.reserveIngress(fmt.Sprintf("fixture-ip-%d", i/8), false)
		if !ok {
			t.Fatal("fixture could not reserve handshake capacity")
		}
		defer release()
	}
	response := httptest.NewRecorder()
	request := httptest.NewRequest("GET", "/socket.io?transport=websocket", nil)
	router.ServeHTTP(response, request)
	if response.Code != http.StatusTooManyRequests {
		t.Fatalf("unbounded handshake admission: %d", response.Code)
	}
	if len(server.sessions) != 0 {
		t.Fatal("rejected upgrade created retained state")
	}
}

func TestTerminalRoomRetiresBothMembershipIndexes(t *testing.T) {
	hub := NewHub(nil, nil, nil, nil, "", "", "", "", nil)
	defer hub.Close()
	first := &ClientSocket{ID: "first", UserID: "A", Hub: hub, Rooms: map[string]bool{}, PollingQueue: make(chan string, 4)}
	second := &ClientSocket{ID: "second", UserID: "B", Hub: hub, Rooms: map[string]bool{}, PollingQueue: make(chan string, 4)}
	first.Join("finished-room")
	second.Join("finished-room")
	hub.FinishRoom("finished-room", CallFinishedEvent{Duration: 10})
	if len(first.Rooms) != 0 || len(second.Rooms) != 0 || len(hub.roomSockets) != 0 {
		t.Fatal("terminal room retained membership")
	}
	if len(first.PollingQueue) != 1 || len(second.PollingQueue) != 1 {
		t.Fatal("completion notification was lost")
	}
	first.Closed = true
	first.Join("another-room")
	if len(first.Rooms) != 0 {
		t.Fatal("closed socket joined a room")
	}
}
