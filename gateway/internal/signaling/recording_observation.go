package signaling

import (
	"context"
	"github.com/pairtalk/gateway/internal/database"
	"time"
)

type recordingObservation struct {
	done  chan struct{}
	state string
}

func (h *Hub) roomRecordingState(ctx context.Context, session *database.CallSession) string {
	if session.EgressID == nil || *session.EgressID == "" {
		return "off"
	}
	key := *session.EgressID
	h.mu.Lock()
	if h.recordingObservations == nil {
		h.recordingObservations = make(map[string]*recordingObservation)
	}
	if existing := h.recordingObservations[key]; existing != nil {
		h.mu.Unlock()
		select {
		case <-ctx.Done():
			return "unknown"
		case <-existing.done:
			return existing.state
		}
	}
	if len(h.recordingObservations) >= 256 {
		h.mu.Unlock()
		return "unknown"
	}
	value := &recordingObservation{done: make(chan struct{})}
	h.recordingObservations[key] = value
	h.mu.Unlock()
	value.state = h.observeRecordingState(ctx, session)
	close(value.done)
	time.AfterFunc(time.Second, func() {
		h.mu.Lock()
		if h.recordingObservations[key] == value {
			delete(h.recordingObservations, key)
		}
		h.mu.Unlock()
	})
	return value.state
}
