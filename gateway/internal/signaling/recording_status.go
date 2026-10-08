package signaling

import (
	"context"
	"encoding/json"
	lk "github.com/livekit/protocol/livekit"
	"github.com/pairtalk/gateway/internal/database"
	"strings"
	"time"
)

const RecordingStateChannel = "pairtalk:recording-state"

type RoomRecordingStatus struct {
	RoomName  string `json:"roomName"`
	State     string `json:"state"`
	UpdatedAt int64  `json:"updatedAt"`
	Source    string `json:"source,omitempty"`
}

func (h *Hub) publishRoomRecordingState(ctx context.Context, roomName, state string) {
	h.publishRoomRecordingStateAt(ctx, roomName, state, time.Now().UnixMilli())
}

func (h *Hub) publishRoomRecordingStateAt(ctx context.Context, roomName, state string, observedAt int64) {
	msg := RoomRecordingStatus{RoomName: roomName, State: state, UpdatedAt: observedAt}
	h.EmitToRoom(roomName, "room_recording_status", msg)
	if h.PubSub != nil && h.PubSub.rdb != nil {
		msg.Source = h.PubSub.recordingSource
		data, err := json.Marshal(msg)
		if err == nil {
			_ = h.PubSub.rdb.Publish(ctx, RecordingStateChannel, string(data)).Err()
		}
	}
}

func (h *Hub) publishRoomRecordingSnapshot(ctx context.Context, session *database.CallSession) {
	observedAt := time.Now().UnixMilli()
	state := h.roomRecordingState(ctx, session)
	current, err := h.DB.GetCallSessionByRoomName(ctx, session.RoomName)
	if err != nil || current == nil || current.Status != "ACTIVE" {
		return
	}
	if (session.EgressID == nil) != (current.EgressID == nil) || (session.EgressID != nil && current.EgressID != nil && *session.EgressID != *current.EgressID) {
		state = "unknown"
	}
	h.publishRoomRecordingStateAt(ctx, session.RoomName, state, observedAt)
}

func (h *Hub) observeRecordingState(ctx context.Context, session *database.CallSession) string {
	if session.EgressID == nil || *session.EgressID == "" {
		return "off"
	}
	if h.LiveKit == nil {
		return "unknown"
	}
	info, err := h.LiveKit.GetAudioEgressInfo(ctx, *session.EgressID)
	if err != nil || info == nil {
		return "unknown"
	}
	switch info.Status {
	case lk.EgressStatus_EGRESS_COMPLETE, lk.EgressStatus_EGRESS_FAILED, lk.EgressStatus_EGRESS_ABORTED, lk.EgressStatus_EGRESS_LIMIT_REACHED:
		return "off"
	default:
		return "on"
	}
}

func (h *Hub) handleRecordingStatus(socket *ClientSocket, payload []byte) {
	socket.mu.Lock()
	if time.Since(socket.lastSnapshotAt) < time.Second {
		socket.mu.Unlock()
		return
	}
	socket.lastSnapshotAt = time.Now()
	socket.mu.Unlock()
	var req PeerReadyPayload
	if socket.UserID == "" || json.Unmarshal(payload, &req) != nil || req.RoomName == "" || len(req.RoomName) > 128 || h.DB == nil {
		return
	}
	ctx, cancel := context.WithTimeout(h.Context(), 6*time.Second)
	defer cancel()
	observedAt := time.Now().UnixMilli()
	session, err := h.DB.GetCallSessionByRoomName(ctx, req.RoomName)
	if err != nil || session == nil || session.Status != "ACTIVE" || (session.UserAID != socket.UserID && session.UserBID != socket.UserID) {
		return
	}
	state := h.roomRecordingState(ctx, session)
	current, err := h.DB.GetCallSessionByRoomName(ctx, req.RoomName)
	if err != nil || current == nil || current.Status != "ACTIVE" || (current.UserAID != socket.UserID && current.UserBID != socket.UserID) {
		return
	}
	if (session.EgressID == nil) != (current.EgressID == nil) || (session.EgressID != nil && current.EgressID != nil && *session.EgressID != *current.EgressID) {
		state = "unknown"
	}
	personal := false
	if current.ActiveRecorderIDs != nil {
		for _, id := range strings.Split(*current.ActiveRecorderIDs, ",") {
			if id == socket.UserID {
				personal = true
			}
		}
	}
	socket.Emit("record_status", RecordStatusEvent{Record: personal, RoomName: req.RoomName})
	socket.Emit("room_recording_status", RoomRecordingStatus{RoomName: req.RoomName, State: state, UpdatedAt: observedAt})
}
