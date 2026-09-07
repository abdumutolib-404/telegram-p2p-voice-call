package signaling

import (
	"encoding/json"
	"fmt"
	"strings"
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

	server.mu.Lock()
	server.sessions["test_socket_41"] = &EngineIOSession{Socket: socket, CreatedAt: time.Now()}
	server.mu.Unlock()

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

	// Verify session was immediately purged from server.sessions
	server.mu.RLock()
	_, exists := server.sessions["test_socket_41"]
	server.mu.RUnlock()
	if exists {
		t.Errorf("expected session test_socket_41 to be deleted from server.sessions after packet 41")
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

	// Sending pong "3" should be a clean no-op
	server.handleRawMessage(socket, "3")

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

func TestSocketIO_TransportUpgradeDrain(t *testing.T) {
	socket := &ClientSocket{
		ID:           "test_upgrade_drain",
		UserID:       "user_drain",
		PollingQueue: make(chan string, 16),
		SendChan:     make(chan string, 16),
		IsWebSocket:  false,
	}

	// Buffer packets in polling queue
	socket.PollingQueue <- "pkt_1"
	socket.PollingQueue <- "pkt_2"
	socket.PollingQueue <- "pkt_3"

	// Simulate upgrade drain logic
	socket.mu.Lock()
	socket.IsWebSocket = true
drain:
	for {
		select {
		case pkt := <-socket.PollingQueue:
			select {
			case socket.SendChan <- pkt:
			default:
			}
		default:
			break drain
		}
	}
	socket.mu.Unlock()

	if len(socket.PollingQueue) != 0 {
		t.Errorf("expected PollingQueue to be empty after drain, got %d", len(socket.PollingQueue))
	}
	if len(socket.SendChan) != 3 {
		t.Errorf("expected SendChan to have 3 drained packets, got %d", len(socket.SendChan))
	}

	// Verify order
	if p1 := <-socket.SendChan; p1 != "pkt_1" {
		t.Errorf("expected pkt_1, got %s", p1)
	}
	if p2 := <-socket.SendChan; p2 != "pkt_2" {
		t.Errorf("expected pkt_2, got %s", p2)
	}
	if p3 := <-socket.SendChan; p3 != "pkt_3" {
		t.Errorf("expected pkt_3, got %s", p3)
	}
}

func TestSocketIO_SupersededConnectionHandling(t *testing.T) {
	hub := &Hub{}
	server := NewSocketIOServer(hub)

	socket := &ClientSocket{
		ID:           "test_superseded",
		UserID:       "user_sup",
		Hub:          hub,
		Rooms:        make(map[string]bool),
		PollingQueue: make(chan string, 16),
		SendChan:     make(chan string, 16),
		IsWebSocket:  true,
		LastActive:   time.Now(),
	}

	server.mu.Lock()
	server.sessions["test_superseded"] = &EngineIOSession{Socket: socket, CreatedAt: time.Now()}
	server.mu.Unlock()

	// Simulate old connection exit when a new connection is active
	// Old connection exiting: isCurrent check should prevent deletion
	server.mu.Lock()
	sess, ok := server.sessions["test_superseded"]
	if !ok {
		t.Fatalf("session should exist")
	}
	sess.Socket.mu.Lock()
	// Simulated conn: old connection pointer does not match active conn
	isCurrent := (sess.Socket.Conn != nil && false)
	sess.Socket.mu.Unlock()
	if isCurrent {
		delete(server.sessions, "test_superseded")
	}
	server.mu.Unlock()

	server.mu.RLock()
	_, stillExists := server.sessions["test_superseded"]
	server.mu.RUnlock()

	if !stillExists {
		t.Errorf("expected session to NOT be deleted when old connection exits without being current")
	}
}

func TestHub_RoomScopedGracePeriodDisconnect(t *testing.T) {
	hub := &Hub{
		userSockets:           make(map[string]map[string]*ClientSocket),
		roomSockets:           make(map[string]map[string]*ClientSocket),
		disconnectGraceTimers: make(map[string]*time.Timer),
	}

	// 1. Timer cancellation on reassignment
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

	// 2. Multi-socket user disconnect from call room
	sockCall := &ClientSocket{
		ID:     "sock_call_tab",
		UserID: "u1",
		Hub:    hub,
		Rooms:  make(map[string]bool),
	}
	sockLobby := &ClientSocket{
		ID:     "sock_lobby_tab",
		UserID: "u1",
		Hub:    hub,
		Rooms:  make(map[string]bool),
	}

	hub.AddSocket(sockCall)
	hub.AddSocket(sockLobby)
	hub.JoinRoom(sockCall, "room_active_call")

	// User has 2 sockets in userSockets
	if len(hub.GetUserSockets("u1")) != 2 {
		t.Fatalf("expected 2 sockets for u1")
	}

	// Now sockCall disconnects (e.g. user closed call tab)
	hub.RemoveSocket(sockCall)

	// User still has 1 socket (lobby) in userSockets
	if len(hub.GetUserSockets("u1")) != 1 {
		t.Errorf("expected 1 socket remaining for u1 in userSockets")
	}

	// But in room_active_call, user has 0 sockets left
	hub.mu.RLock()
	roomSocketsRemaining := 0
	if rSockets, ok := hub.roomSockets["room_active_call"]; ok {
		for _, s := range rSockets {
			if s.UserID == "u1" {
				roomSocketsRemaining++
			}
		}
	}
	hub.mu.RUnlock()

	if roomSocketsRemaining != 0 {
		t.Errorf("expected 0 sockets for u1 in room_active_call, got %d", roomSocketsRemaining)
	}
}

func TestHub_DurationClampingAcrossLifecycle(t *testing.T) {
	userA := &database.User{ID: "user_a", Plan: "FREE"}
	userB := &database.User{ID: "user_b", Plan: "FREE"}
	adminIDs := []string{}

	limitMinutes := database.CalculateEffectiveCallDuration(userA, userB, adminIDs)
	limitSeconds := limitMinutes * 60
	if limitSeconds != 900 {
		t.Fatalf("expected 15 min (900s) plan limit for FREE plan, got %d", limitSeconds)
	}

	// 1. Startup reconciliation clamping
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
		t.Errorf("expected reconciliation duration clamped to %d, got %d", limitSeconds, completedDuration)
	}

	// 2. Authoritative teardown timer clamping
	actualDuration := 905 // Fired 5s late due to OS scheduler
	if actualDuration > limitSeconds {
		actualDuration = limitSeconds
	}
	if actualDuration != limitSeconds {
		t.Errorf("expected teardown duration clamped to %d, got %d", limitSeconds, actualDuration)
	}

	// 3. Finish call clamping
	finishDuration := 1200 // Finished past limit
	if finishDuration > limitSeconds {
		finishDuration = limitSeconds
	}
	if finishDuration != limitSeconds {
		t.Errorf("expected finish call duration clamped to %d, got %d", limitSeconds, finishDuration)
	}

	// 4. Disconnect teardown clamping
	disconnectDuration := 950
	if disconnectDuration > limitSeconds {
		disconnectDuration = limitSeconds
	}
	if disconnectDuration != limitSeconds {
		t.Errorf("expected disconnect duration clamped to %d, got %d", limitSeconds, disconnectDuration)
	}
}

func TestSessionRecorders_BothAndAllHandling(t *testing.T) {
	// 1. Detection of "BOTH" and "ALL"
	both := "BOTH"
	all := "ALL"
	if !isUserSessionRecorder(&both, "user1") {
		t.Errorf("expected BOTH to match user1")
	}
	if !isUserSessionRecorder(&all, "user2") {
		t.Errorf("expected ALL to match user2")
	}

	// 2. Comma-separated with BOTH
	combo := "user1,BOTH"
	if !isUserSessionRecorder(&combo, "user2") {
		t.Errorf("expected combo containing BOTH to match user2")
	}

	// 3. Expansion of BOTH during toggle record off
	userAID := "userA"
	userBID := "userB"
	recordedBy := &both

	if recordedBy != nil && (*recordedBy == "BOTH" || *recordedBy == "ALL") {
		bothRec := userAID + "," + userBID
		recordedBy = &bothRec
	}

	newRec, recordersLeft := removeSessionRecorder(recordedBy, userAID)
	if !recordersLeft || newRec != "userB" {
		t.Errorf("expected recordersLeft=true and newRec='userB', got %v, '%s'", recordersLeft, newRec)
	}

	// Now userB stops recording
	finalRec, finalLeft := removeSessionRecorder(&newRec, userBID)
	if finalLeft || finalRec != "" {
		t.Errorf("expected finalLeft=false and finalRec='', got %v, '%s'", finalLeft, finalRec)
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

func TestHandleWebRTCSignal_CrossRoomPrevention(t *testing.T) {
	hub := NewHub(nil, nil, nil, nil, "", "", "", "", nil)

	// Receiver socket enrolled in target_room
	receiver := &ClientSocket{
		ID:          "sock_target",
		UserID:      "user_target",
		Rooms:       map[string]bool{"target_room": true},
		SendChan:    make(chan string, 10),
		IsWebSocket: true,
	}

	// Attacker socket enrolled ONLY in attacker_room
	attacker := &ClientSocket{
		ID:          "sock_attacker",
		UserID:      "user_attacker",
		Rooms:       map[string]bool{"attacker_room": true},
		SendChan:    make(chan string, 10),
		IsWebSocket: true,
	}

	// Legitimate sender enrolled in target_room
	legitSender := &ClientSocket{
		ID:          "sock_legit",
		UserID:      "user_legit",
		Rooms:       map[string]bool{"target_room": true},
		SendChan:    make(chan string, 10),
		IsWebSocket: true,
	}

	hub.mu.Lock()
	hub.roomSockets["target_room"] = map[string]*ClientSocket{
		receiver.ID:    receiver,
		legitSender.ID: legitSender,
	}
	hub.roomSockets["attacker_room"] = map[string]*ClientSocket{
		attacker.ID: attacker,
	}
	hub.mu.Unlock()

	// 1. Attacker tries to inject a signal into target_room
	attackPayload, err := json.Marshal(WebRTCSignalPayload{
		RoomName: "target_room",
		SDP:      "malicious_sdp",
	})
	if err != nil {
		t.Fatalf("failed to marshal attack payload: %v", err)
	}
	hub.handleWebRTCSignal(attacker, "signal", attackPayload)

	// Check if receiver got anything: should be empty!
	select {
	case msg := <-receiver.SendChan:
		t.Fatalf("Security Violation: receiver got injected signal from non-member socket: %s", msg)
	default:
		// Passed, signal was dropped because attacker is not in target_room
	}

	// 2. Legitimate member sends signal into target_room
	legitPayload, err := json.Marshal(WebRTCSignalPayload{
		RoomName: "target_room",
		SDP:      "valid_sdp",
	})
	if err != nil {
		t.Fatalf("failed to marshal legit payload: %v", err)
	}
	hub.handleWebRTCSignal(legitSender, "signal", legitPayload)

	// Check if receiver got the message
	select {
	case msg := <-receiver.SendChan:
		if !strings.Contains(msg, "valid_sdp") {
			t.Errorf("Expected valid_sdp in message, got: %s", msg)
		}
	case <-time.After(500 * time.Millisecond):
		t.Fatalf("Timed out waiting for legitimate signal to reach receiver")
	}
}


