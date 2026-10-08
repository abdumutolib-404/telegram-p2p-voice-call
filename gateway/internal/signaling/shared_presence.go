package signaling

import (
	"context"
	"strconv"
	"time"
)

func (p *PubSubClient) recordPresence(ctx context.Context, userID string, online bool) error {
	if p == nil || p.rdb == nil {
		return nil
	}
	key := "pairtalk:presence:" + userID
	if !online {
		return p.rdb.HDel(ctx, key, p.recordingSource).Err()
	}
	pipe := p.rdb.TxPipeline()
	pipe.HSet(ctx, key, p.recordingSource, time.Now().Add(45*time.Second).UnixMilli())
	pipe.Expire(ctx, key, 90*time.Second)
	_, err := pipe.Exec(ctx)
	return err
}

func (p *PubSubClient) userOnline(ctx context.Context, userID string) (bool, error) {
	if p == nil || p.rdb == nil {
		return false, nil
	}
	entries, err := p.rdb.HGetAll(ctx, "pairtalk:presence:"+userID).Result()
	if err != nil {
		return false, err
	}
	now := time.Now().UnixMilli()
	for _, raw := range entries {
		if until, err := strconv.ParseInt(raw, 10, 64); err == nil && until > now {
			return true, nil
		}
	}
	return false, nil
}

func (h *Hub) refreshSharedPresence() {
	ticker := time.NewTicker(15 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-h.Context().Done():
			return
		case <-ticker.C:
			h.mu.RLock()
			ids := make([]string, 0, len(h.userSockets))
			for id := range h.userSockets {
				ids = append(ids, id)
			}
			h.mu.RUnlock()
			for _, id := range ids {
				lock := h.getUserMutex(id)
				lock.Lock()
				ctx, cancel := context.WithTimeout(h.Context(), 2*time.Second)
				_ = h.PubSub.recordPresence(ctx, id, len(h.GetUserSockets(id)) > 0)
				cancel()
				lock.Unlock()
			}
		}
	}
}
