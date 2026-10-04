package signaling

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

func TestAuthenticatedSessionCapPreservesExistingConnections(t *testing.T) {
	t.Setenv("NODE_ENV", "test")
	server, _ := boundaryServer(t)
	for i := 0; i <= maxAuthenticatedSocketsPerUser; i++ {
		socket := &ClientSocket{ID: fmt.Sprintf("synthetic-%d", i), Hub: server.Hub, Rooms: make(map[string]bool), PollingQueue: make(chan string, 4)}
		if !server.addSession(socket, "127.0.0.1") {
			t.Fatal("could not create bounded fixture")
		}
		server.handleRawMessage(socket, `40{"token":"test-allowed"}`)
		if i < maxAuthenticatedSocketsPerUser && socket.Closed {
			t.Fatal("legitimate connection was rejected")
		}
		if i == maxAuthenticatedSocketsPerUser && !socket.Closed {
			t.Fatal("authenticated account exceeded its connection bound")
		}
	}
	server.mu.RLock()
	count := len(server.sessions)
	server.mu.RUnlock()
	if count != maxAuthenticatedSocketsPerUser || len(server.Hub.GetUserSockets("test_user_id")) != maxAuthenticatedSocketsPerUser {
		t.Fatal("rejected authentication leaked capacity or removed an existing connection")
	}
}

func TestClosedPollingSessionReleasesCapacityAndWakesPendingPoll(t *testing.T) {
	server, router := boundaryServer(t)
	socket := &ClientSocket{ID: "synthetic-poll", Hub: server.Hub, Rooms: make(map[string]bool), PollingQueue: make(chan string, 4)}
	if !server.addSession(socket, "127.0.0.1") {
		t.Fatal("could not create fixture")
	}
	response := httptest.NewRecorder()
	finished := make(chan struct{})
	go func() {
		router.ServeHTTP(response, httptest.NewRequest("GET", "/socket.io?transport=polling&sid="+socket.ID, nil))
		close(finished)
	}()
	deadline := time.Now().Add(time.Second)
	for {
		socket.mu.Lock()
		started := !socket.LastActive.IsZero()
		socket.mu.Unlock()
		if started {
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("poll did not start")
		}
		time.Sleep(time.Millisecond)
	}
	socket.Disconnect()
	select {
	case <-finished:
		if response.Code != 200 || response.Body.String() != "1" {
			t.Fatal("pending poll did not receive an Engine.IO close")
		}
	case <-time.After(time.Second):
		t.Fatal("closed session left a long poll running")
	}
	for _, method := range []string{"GET", "POST"} {
		response := httptest.NewRecorder()
		router.ServeHTTP(response, httptest.NewRequest(method, "/socket.io?transport=polling&sid="+socket.ID, strings.NewReader("42[]")))
		if response.Code != 400 {
			t.Fatal("closed session accepted traffic")
		}
	}
	server.mu.RLock()
	count := len(server.sessions)
	server.mu.RUnlock()
	if count != 0 {
		t.Fatal("closed session retained global capacity")
	}
}

func boundaryServer(t *testing.T) (*SocketIOServer, *gin.Engine) {
	t.Helper()
	gin.SetMode(gin.TestMode)
	hub := NewHub(nil, nil, nil, nil, "", "", "", "", nil)
	server := NewSocketIOServer(hub, func(origin string) bool { return origin == "" || origin == "https://app.pairtalk.online" })
	t.Cleanup(func() { hub.Close(); server.Close() })
	router := gin.New()
	if err := router.SetTrustedProxies(nil); err != nil {
		t.Fatal(err)
	}
	router.Any("/socket.io", server.HandleRequest)
	return server, router
}

func TestSocketOriginAndPollingPayloadLimits(t *testing.T) {
	_, router := boundaryServer(t)
	for _, transport := range []string{"polling", "websocket"} {
		req := httptest.NewRequest("GET", "/socket.io?transport="+transport, nil)
		req.Header.Set("Origin", "https://attacker.example")
		response := httptest.NewRecorder()
		router.ServeHTTP(response, req)
		if response.Code != http.StatusForbidden || response.Header().Get("Access-Control-Allow-Origin") != "" {
			t.Fatal("untrusted origin accepted")
		}
	}
	request := httptest.NewRequest("GET", "/socket.io?transport=polling", nil)
	request.Header.Set("Origin", "https://app.pairtalk.online")
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)
	if response.Code != 200 || response.Header().Get("Access-Control-Allow-Origin") != "https://app.pairtalk.online" {
		t.Fatal("allowed origin rejected")
	}
	var handshake struct {
		SID        string `json:"sid"`
		MaxPayload int    `json:"maxPayload"`
	}
	if err := json.Unmarshal(response.Body.Bytes()[1:], &handshake); err != nil {
		t.Fatal(err)
	}
	if handshake.MaxPayload != maxSocketPayload {
		t.Fatal("advertised payload limit differs from enforced limit")
	}
	oversized := httptest.NewRequest("POST", "/socket.io?transport=polling&sid="+handshake.SID, strings.NewReader(strings.Repeat("x", maxSocketPayload+1)))
	response = httptest.NewRecorder()
	router.ServeHTTP(response, oversized)
	if response.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("oversized polling body accepted: %d", response.Code)
	}
}

func TestUnauthenticatedSessionsAreBoundedAndClosed(t *testing.T) {
	server, router := boundaryServer(t)
	for i := 0; i <= maxUnauthenticatedSessionsPerIP; i++ {
		response := httptest.NewRecorder()
		router.ServeHTTP(response, httptest.NewRequest("GET", "/socket.io?transport=polling", nil))
		want := 200
		if i == maxUnauthenticatedSessionsPerIP {
			want = http.StatusTooManyRequests
		}
		if response.Code != want {
			t.Fatalf("session limit mismatch: request %d, status %d", i, response.Code)
		}
	}
	server.Close()
	server.mu.RLock()
	count := len(server.sessions)
	server.mu.RUnlock()
	if count != 0 {
		t.Fatal("shutdown retained sessions")
	}
	response := httptest.NewRecorder()
	router.ServeHTTP(response, httptest.NewRequest("GET", "/socket.io?transport=polling", nil))
	if response.Code != http.StatusTooManyRequests {
		t.Fatal("closed server accepted a new session")
	}
}

func TestWebsocketRejectsOversizedMessage(t *testing.T) {
	_, router := boundaryServer(t)
	server := httptest.NewServer(router)
	defer server.Close()
	conn, _, err := websocket.DefaultDialer.Dial("ws"+strings.TrimPrefix(server.URL, "http")+"/socket.io?transport=websocket", nil)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	_ = conn.SetReadDeadline(time.Now().Add(2 * time.Second))
	if _, _, err := conn.ReadMessage(); err != nil {
		t.Fatal(err)
	}
	if err := conn.WriteMessage(websocket.TextMessage, []byte(strings.Repeat("x", maxSocketPayload+1))); err != nil {
		t.Fatal(err)
	}
	if _, _, err := conn.ReadMessage(); !websocket.IsCloseError(err, websocket.CloseMessageTooBig) {
		t.Fatalf("oversized WebSocket was not rejected: %v", err)
	}
}

func TestEventWorkerPreservesOrderAndReleasesCapacity(t *testing.T) {
	hub := NewHub(nil, nil, nil, nil, "", "", "", "", nil)
	socket := &ClientSocket{Hub: hub, Rooms: map[string]bool{}}
	defer hub.Close()
	defer socket.Disconnect()
	started, release := make(chan struct{}), make(chan struct{})
	result := make(chan int, 3)
	socket.enqueueEvent(func() { close(started); <-release; result <- 1 })
	<-started
	socket.enqueueEvent(func() { result <- 2 })
	socket.enqueueEvent(func() { result <- 3 })
	select {
	case <-result:
		t.Fatal("event executed out of order")
	case <-time.After(10 * time.Millisecond):
	}
	close(release)
	for want := 1; want <= 3; want++ {
		select {
		case got := <-result:
			if got != want {
				t.Fatalf("event order: got=%d want=%d", got, want)
			}
		case <-time.After(time.Second):
			t.Fatal("event worker did not drain")
		}
	}
	socket.Disconnect()
	deadline := time.Now().Add(time.Second)
	for len(hub.queuedEventSlots) != 0 && time.Now().Before(deadline) {
		time.Sleep(time.Millisecond)
	}
	if len(hub.queuedEventSlots) != 0 || len(hub.eventSlots) != 0 {
		t.Fatal("event worker leaked shared capacity")
	}
}
