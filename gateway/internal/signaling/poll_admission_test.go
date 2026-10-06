package signaling

import (
	"context"
	"io"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestPollingAdmissionRejectsOverlapAndReleasesOnCancellation(t *testing.T) {
	server, router := boundaryServer(t)
	socket := &ClientSocket{ID: "poll-admission", Hub: server.Hub, Rooms: map[string]bool{}, PollingQueue: make(chan string, 4)}
	if !server.addSession(socket, "127.0.0.1") {
		t.Fatal("fixture admission failed")
	}
	ctx, cancel := context.WithCancel(context.Background())
	req := httptest.NewRequest("GET", "/socket.io?transport=polling&sid="+socket.ID, nil).WithContext(ctx)
	done := make(chan struct{})
	go func() { router.ServeHTTP(httptest.NewRecorder(), req); close(done) }()
	deadline := time.Now().Add(time.Second)
	for {
		socket.mu.Lock()
		active := socket.pollActive
		socket.mu.Unlock()
		if active {
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("poll never entered wait")
		}
		time.Sleep(time.Millisecond)
	}
	for i := 0; i < 20; i++ {
		response := httptest.NewRecorder()
		router.ServeHTTP(response, httptest.NewRequest("GET", "/socket.io?transport=polling&sid="+socket.ID, nil))
		if response.Code != 429 {
			t.Fatalf("overlap accepted: %d", response.Code)
		}
	}
	if len(server.pollSlots) != 1 {
		t.Fatal("duplicate polls consumed capacity")
	}
	cancel()
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("cancelled poll retained a slot")
	}
	if len(server.pollSlots) != 0 {
		t.Fatal("cancellation leaked global capacity")
	}
	socket.PollingQueue <- "6"
	response := httptest.NewRecorder()
	router.ServeHTTP(response, httptest.NewRequest("GET", "/socket.io?transport=polling&sid="+socket.ID, nil))
	if response.Code != 200 || response.Body.String() != "6" || len(server.pollSlots) != 0 {
		t.Fatal("legitimate next poll did not recover")
	}
}

func TestPollingPostAdmissionBoundsSlowBodiesAndPreservesDuplex(t *testing.T) {
	server, router := boundaryServer(t)
	socket := &ClientSocket{ID: "post-admission", Hub: server.Hub, Rooms: map[string]bool{}, PollingQueue: make(chan string, 4)}
	if !server.addSession(socket, "127.0.0.1") {
		t.Fatal("fixture admission failed")
	}
	reader, writer := io.Pipe()
	defer writer.Close()
	done := make(chan struct{})
	go func() {
		router.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest("POST", "/socket.io?transport=polling&sid="+socket.ID, reader))
		close(done)
	}()
	deadline := time.Now().Add(time.Second)
	for {
		socket.mu.Lock()
		active := socket.postActive
		socket.mu.Unlock()
		if active {
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("POST did not enter bounded read")
		}
		time.Sleep(time.Millisecond)
	}
	for i := 0; i < 20; i++ {
		response := httptest.NewRecorder()
		router.ServeHTTP(response, httptest.NewRequest("POST", "/socket.io?transport=polling&sid="+socket.ID, strings.NewReader("3")))
		if response.Code != 429 {
			t.Fatalf("overlapping POST accepted: %d", response.Code)
		}
	}
	socket.PollingQueue <- "6"
	response := httptest.NewRecorder()
	router.ServeHTTP(response, httptest.NewRequest("GET", "/socket.io?transport=polling&sid="+socket.ID, nil))
	if response.Code != 200 || len(server.pollSlots) != 1 {
		t.Fatal("normal GET/POST duplex failed")
	}
	writer.CloseWithError(context.Canceled)
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("failed body retained POST capacity")
	}
	if len(server.pollSlots) != 0 {
		t.Fatal("POST failure leaked capacity")
	}
	response = httptest.NewRecorder()
	router.ServeHTTP(response, httptest.NewRequest("POST", "/socket.io?transport=polling&sid="+socket.ID, strings.NewReader("3")))
	if response.Code != 200 || len(server.pollSlots) != 0 {
		t.Fatal("legitimate POST did not recover")
	}
	for i := 0; i < maxActivePolls; i++ {
		server.pollSlots <- struct{}{}
	}
	response = httptest.NewRecorder()
	router.ServeHTTP(response, httptest.NewRequest("POST", "/socket.io?transport=polling&sid="+socket.ID, strings.NewReader("3")))
	if response.Code != 429 || socket.postActive {
		t.Fatal("global POST saturation was not rejected before body admission")
	}
}

func TestPollingAdmissionBoundsGlobalWaitsBeforeRefreshingActivity(t *testing.T) {
	server, router := boundaryServer(t)
	socket := &ClientSocket{ID: "global-poll", Hub: server.Hub, Rooms: map[string]bool{}, PollingQueue: make(chan string, 4)}
	if !server.addSession(socket, "127.0.0.1") {
		t.Fatal("fixture admission failed")
	}
	before := socket.LastActive
	for i := 0; i < maxActivePolls; i++ {
		server.pollSlots <- struct{}{}
	}
	response := httptest.NewRecorder()
	router.ServeHTTP(response, httptest.NewRequest("GET", "/socket.io?transport=polling&sid="+socket.ID, nil))
	if response.Code != 429 || socket.pollActive || !socket.LastActive.Equal(before) {
		t.Fatal("global saturation was not rejected before session mutation")
	}
}
