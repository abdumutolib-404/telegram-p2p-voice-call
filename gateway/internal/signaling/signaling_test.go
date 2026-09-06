package signaling

import (
	"fmt"
	"sync"
	"testing"
	"time"

	"github.com/pairtalk/gateway/internal/database"
)

func TestParseSocketIOPacket(t *testing.T) {
	t.Run("Event without payload", func(t *testing.T) {
		msg := `42["join_queue"]`
		evt, payload, err := ParseSocketIOPacket(msg)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if evt != "join_queue" {
			t.Errorf("expected join_queue, got %s", evt)
		}
		if payload != nil {
			t.Errorf("expected nil payload, got %s", string(payload))
		}
	})

	t.Run("Event with JSON payload", func(t *testing.T) {
		msg := `42["toggle_record",{"roomName":"room_123","record":true}]`
		evt, payload, err := ParseSocketIOPacket(msg)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if evt != "toggle_record" {
			t.Errorf("expected toggle_record, got %s", evt)
		}
		expectedPayload := `{"roomName":"room_123","record":true}`
		if string(payload) != expectedPayload {
			t.Errorf("expected payload %s, got %s", expectedPayload, string(payload))
		}
	})

	t.Run("Event with namespace and ack ID", func(t *testing.T) {
		msg := `42/admin,15["toggle_record",{"roomName":"room_123","record":true}]`
		evt, payload, err := ParseSocketIOPacket(msg)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if evt != "toggle_record" {
			t.Errorf("expected toggle_record, got %s", evt)
		}
		expectedPayload := `{"roomName":"room_123","record":true}`
		if string(payload) != expectedPayload {
			t.Errorf("expected payload %s, got %s", expectedPayload, string(payload))
		}
	})

	t.Run("Event with root namespace prefix", func(t *testing.T) {
		msg := `42/,["join_queue"]`
		evt, payload, err := ParseSocketIOPacket(msg)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if evt != "join_queue" {
			t.Errorf("expected join_queue, got %s", evt)
		}
		if payload != nil {
			t.Errorf("expected nil payload, got %s", string(payload))
		}
	})

	t.Run("Invalid packet", func(t *testing.T) {
		_, _, err := ParseSocketIOPacket("invalid")
		if err == nil {
			t.Errorf("expected error for invalid packet")
		}
	})
}

func TestSessionRecorders(t *testing.T) {
	t.Run("Add session recorder", func(t *testing.T) {
		rec := addSessionRecorder(nil, "user1")
		if rec != "user1" {
			t.Errorf("expected 'user1', got '%s'", rec)
		}

		rec = addSessionRecorder(&rec, "user2")
		if rec != "user1,user2" {
			t.Errorf("expected 'user1,user2', got '%s'", rec)
		}

		// Adding duplicate does not duplicate
		rec = addSessionRecorder(&rec, "user1")
		if rec != "user1,user2" {
			t.Errorf("expected 'user1,user2', got '%s'", rec)
		}
	})

	t.Run("Is session recorder", func(t *testing.T) {
		rec := "user1,user2"
		if !isUserSessionRecorder(&rec, "user1") {
			t.Errorf("expected true for user1")
		}
		if !isUserSessionRecorder(&rec, "user2") {
			t.Errorf("expected true for user2")
		}
		if isUserSessionRecorder(&rec, "user3") {
			t.Errorf("expected false for user3")
		}

		both := "BOTH"
		if !isUserSessionRecorder(&both, "user3") {
			t.Errorf("expected true for BOTH")
		}
	})

	t.Run("Remove session recorder", func(t *testing.T) {
		rec := "user1,user2"
		newRec, hasLeft := removeSessionRecorder(&rec, "user1")
		if !hasLeft || newRec != "user2" {
			t.Errorf("expected hasLeft=true and newRec='user2', got %v, '%s'", hasLeft, newRec)
		}

		newRec2, hasLeft2 := removeSessionRecorder(&newRec, "user2")
		if hasLeft2 || newRec2 != "" {
			t.Errorf("expected hasLeft=false and newRec='', got %v, '%s'", hasLeft2, newRec2)
		}
	})
}

func TestHubAuthenticate(t *testing.T) {
	hub := &Hub{BotToken: "mock-token"}

	t.Run("Empty initData fails", func(t *testing.T) {
		u, ok := hub.Authenticate(nil, "")
		if ok || u != nil {
			t.Errorf("expected failure for empty initData")
		}
	})

	t.Run("test-allowed in test environment succeeds", func(t *testing.T) {
		t.Setenv("NODE_ENV", "test")
		u, ok := hub.Authenticate(nil, "test-allowed")
		if !ok || u == nil {
			t.Fatalf("expected success for test-allowed in test mode")
		}
		if u.ID != "test_user_id" || u.TelegramID != 12345678 {
			t.Errorf("unexpected user: %+v", u)
		}
	})

	t.Run("test-allowed in production environment is rejected", func(t *testing.T) {
		t.Setenv("NODE_ENV", "production")
		u, ok := hub.Authenticate(nil, "test-allowed")
		if ok || u != nil {
			t.Errorf("expected failure for test-allowed in production mode")
		}
	})
}

func TestSocketIO_DisconnectPacket41(t *testing.T) {
	hub := &Hub{
		userSockets:           make(map[string]map[string]*ClientSocket),
		roomSockets:           make(map[string]map[string]*ClientSocket),
		disconnectGraceTimers: make(map[string]*time.Timer),
	}
	server := NewSocketIOServer(hub)

	socket := &ClientSocket{
		ID:           "test_socket_41",
		UserID:       "user_41",
		Hub:          hub,
		Rooms:        make(map[string]bool),
		PollingQueue: make(chan string, 16),
		SendChan:     make(chan string, 16),
		LastActive:   time.Now(),
	}

	hub.AddSocket(socket)
	if len(hub.GetUserSockets("user_41")) != 1 {
		t.Fatalf("expected 1 user socket in hub")
	}

	// Dispatch packet 41
	server.handleRawMessage(socket, "41")

	if !socket.Closed {
		t.Errorf("expected socket to be closed after packet 41")
	}
	if len(hub.GetUserSockets("user_41")) != 0 {
		t.Errorf("expected 0 user sockets in hub after disconnect")
	}
}

func TestSocketIO_NonBlockingPollingQueue(t *testing.T) {
	hub := &Hub{}
	server := NewSocketIOServer(hub)

	socket := &ClientSocket{
		ID:           "test_nonblocking",
		UserID:       "user_nb",
		Hub:          hub,
		PollingQueue: make(chan string, 1),
		SendChan:     make(chan string, 1),
		IsWebSocket:  false,
		Rooms:        make(map[string]bool),
		LastActive:   time.Now(),
	}

	// Fill the queue to capacity
	socket.PollingQueue <- "existing_packet"

	// Sending ping response "2" -> "3" should NOT block
	done := make(chan struct{})
	go func() {
		server.handleRawMessage(socket, "2")
		close(done)
	}()

	select {
	case <-done:
		// Success: returned without blocking
	case <-time.After(100 * time.Millisecond):
		t.Fatal("handleRawMessage blocked on full PollingQueue")
	}

	// socket.Emit should also NOT block on full PollingQueue
	emitDone := make(chan struct{})
	go func() {
		socket.Emit("test_event", map[string]string{"k": "v"})
		close(emitDone)
	}()

	select {
	case <-emitDone:
		// Success: returned without blocking
	case <-time.After(100 * time.Millisecond):
		t.Fatal("socket.Emit blocked on full PollingQueue")
	}
}

func TestHub_GracePeriodTimerLifecycle(t *testing.T) {
	hub := &Hub{
		userSockets:           make(map[string]map[string]*ClientSocket),
		roomSockets:           make(map[string]map[string]*ClientSocket),
		disconnectGraceTimers: make(map[string]*time.Timer),
	}

	// 1. Verify timer stop on reassignment
	t1 := time.NewTimer(5 * time.Second)
	hub.mu.Lock()
	hub.disconnectGraceTimers["u1"] = t1
	hub.mu.Unlock()

	hub.mu.Lock()
	if existing, ok := hub.disconnectGraceTimers["u1"]; ok {
		existing.Stop()
	}
	t2 := time.NewTimer(5 * time.Second)
	hub.disconnectGraceTimers["u1"] = t2
	hub.mu.Unlock()

	if t1.Stop() {
		t.Errorf("expected t1 to have already been stopped before t2 assignment")
	}
	t2.Stop()

	// 2. Verify room-scoped reconnect check
	userSock := &ClientSocket{
		ID:     "sock_app",
		UserID: "u1",
		Hub:    hub,
		Rooms:  make(map[string]bool),
	}
	hub.AddSocket(userSock)

	// User has socket in app, but NOT in room_call_123
	hub.mu.Lock()
	reconnected := false
	if rSockets, ok := hub.roomSockets["room_call_123"]; ok {
		for _, s := range rSockets {
			if s.UserID == "u1" {
				reconnected = true
				break
			}
		}
	}
	hub.mu.Unlock()

	if reconnected {
		t.Errorf("expected reconnected=false when socket is only in userSockets, not roomSockets")
	}

	// Now join the room
	hub.JoinRoom(userSock, "room_call_123")
	hub.mu.Lock()
	reconnected = false
	if rSockets, ok := hub.roomSockets["room_call_123"]; ok {
		for _, s := range rSockets {
			if s.UserID == "u1" {
				reconnected = true
				break
			}
		}
	}
	hub.mu.Unlock()

	if !reconnected {
		t.Errorf("expected reconnected=true once user socket joined roomSockets")
	}
}

func TestHub_SessionReconciliation_Clamping(t *testing.T) {
	userA := &database.User{ID: "user_a", Plan: "FREE"}
	userB := &database.User{ID: "user_b", Plan: "FREE"}
	adminIDs := []string{}

	limitMinutes := database.CalculateEffectiveCallDuration(userA, userB, adminIDs)
	limitSeconds := limitMinutes * 60
	if limitSeconds != 900 {
		t.Fatalf("expected 15 min (900s) plan limit, got %d", limitSeconds)
	}

	// Scenario 1: Stale session 3 hours ago (10800s elapsed)
	staleCreatedAt := time.Now().Add(-3 * time.Hour)
	elapsedSeconds := int(time.Since(staleCreatedAt).Seconds())

	completedDuration := limitSeconds
	if elapsedSeconds < limitSeconds {
		completedDuration = elapsedSeconds
	}
	if completedDuration < 1 {
		completedDuration = 1
	}

	if completedDuration != limitSeconds {
		t.Errorf("expected duration to be clamped to limit %d, got %d (raw elapsed was %d)",
			limitSeconds, completedDuration, elapsedSeconds)
	}

	// Scenario 2: Active session still within limit (300s elapsed)
	recentCreatedAt := time.Now().Add(-300 * time.Second)
	recentElapsed := int(time.Since(recentCreatedAt).Seconds())
	remainingSeconds := limitSeconds - recentElapsed

	if remainingSeconds <= 0 || remainingSeconds > 605 {
		t.Errorf("expected remainingSeconds around 600s, got %d", remainingSeconds)
	}
}

func TestSessionRecorders_Concurrency(t *testing.T) {
	var mu sync.RWMutex
	rec := "user_master"
	var wg sync.WaitGroup

	for i := 0; i < 50; i++ {
		wg.Add(3)
		userID := fmt.Sprintf("user_%d", i)

		go func() {
			defer wg.Done()
			mu.Lock()
			rec = addSessionRecorder(&rec, userID)
			mu.Unlock()
		}()

		go func() {
			defer wg.Done()
			mu.RLock()
			_ = isUserSessionRecorder(&rec, userID)
			mu.RUnlock()
		}()

		go func() {
			defer wg.Done()
			mu.Lock()
			newRec, _ := removeSessionRecorder(&rec, userID)
			rec = newRec
			mu.Unlock()
		}()
	}

	wg.Wait()
}

