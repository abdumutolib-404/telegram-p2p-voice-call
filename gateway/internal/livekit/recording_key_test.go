package livekit

import (
	"path/filepath"
	"strings"
	"testing"
)

func TestRecordingKeysAreRoomScopedAndDistinctPerAttempt(t *testing.T) {
	first := GenerateRecordingFileName("room-a")
	second := GenerateRecordingFileName("room-a")
	other := GenerateRecordingFileName("room-b")
	if first == second || first == other {
		t.Fatal("recordings reused an identifier")
	}
	pieces := strings.Split(strings.TrimSuffix(first, ".mp3"), "_")
	otherPieces := strings.Split(strings.TrimSuffix(other, ".mp3"), "_")
	if len(pieces) != 4 || pieces[2] == otherPieces[2] || len(pieces[3]) != 36 {
		t.Fatal("missing room namespace or full UUID")
	}
	malicious := GenerateRecordingFileName("../../other\\unsafe")
	if filepath.Base(malicious) != malicious || strings.ContainsAny(malicious, "/\\") {
		t.Fatal("room name escaped the flat storage namespace")
	}
}
