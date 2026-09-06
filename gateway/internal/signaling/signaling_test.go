package signaling

import (
	"testing"
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
