package signaling

import (
	"context"
	"time"

	"github.com/pairtalk/gateway/internal/database"
)

func (h *Hub) ReconcileActiveSessions(ctx context.Context) (int, error) {
	sessions, err := h.DB.GetActiveSessionsForReconciliation(ctx)
	if err != nil {
		return 0, err
	}

	reconciledCount := 0
	for _, session := range sessions {
		if session.UserA == nil || session.UserB == nil {
			continue
		}

		limitMinutes := database.CalculateMixedPlanDuration(session.UserA.Plan, session.UserB.Plan)
		limitSeconds := limitMinutes * 60
		elapsedSeconds := int(time.Since(session.CreatedAt).Seconds())
		remainingSeconds := limitSeconds - elapsedSeconds

		if elapsedSeconds >= limitSeconds {
			_, _ = h.DB.CompleteCallSession(ctx, session.ID, elapsedSeconds, nil, nil, nil)
			_ = h.LiveKit.DeleteRoom(ctx, session.RoomName)
			reconciledCount++
		} else {
			h.ScheduleAuthoritativeSessionTeardown(session.RoomName, remainingSeconds)
			reconciledCount++
		}
	}

	return reconciledCount, nil
}
