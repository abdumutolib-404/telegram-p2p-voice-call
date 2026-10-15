package signaling

import "time"

// Install/replace under one lock. Replays can shorten a deadline, never extend it.
func (h *Hub) installSessionDeadline(room string, deadline time.Time, callback func()) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.closing {
		return
	}
	if h.serverSessionTimers == nil {
		h.serverSessionTimers = make(map[string]*time.Timer)
	}
	if h.serverSessionDeadlines == nil {
		h.serverSessionDeadlines = make(map[string]time.Time)
	}
	if previous := h.serverSessionTimers[room]; previous != nil {
		if old, known := h.serverSessionDeadlines[room]; known && !deadline.Before(old) {
			return
		}
		previous.Stop()
	}
	var timer *time.Timer
	timer = time.AfterFunc(time.Until(deadline), func() {
		h.mu.Lock()
		if h.closing || h.serverSessionTimers[room] != timer {
			h.mu.Unlock()
			return
		}
		delete(h.serverSessionTimers, room)
		delete(h.serverSessionDeadlines, room)
		h.mu.Unlock()
		callback()
	})
	h.serverSessionTimers[room] = timer
	h.serverSessionDeadlines[room] = deadline
}
