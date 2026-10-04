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

		limitMinutes := database.CalculateEffectiveCallDuration(session.UserA, session.UserB, h.AdminTelegramIDs)
		limitSeconds := limitMinutes * 60
		elapsedSeconds := int(time.Since(session.CreatedAt).Seconds())
		remainingSeconds := limitSeconds - elapsedSeconds

		if elapsedSeconds >= limitSeconds {
			completedDuration := limitSeconds
			if completedDuration < 1 {
				completedDuration = 1
			}

			egress := h.GetActiveEgress(session.RoomName)
			var egressID *string
			var recordingURL *string
			if egress != nil {
				egressID = &egress.EgressID
				recordingURL = &egress.RelativeURL
			} else if session.EgressID != nil {
				egressID = session.EgressID
				recordingURL = session.RecordingURL
			}

			if egressID != nil && *egressID != "" {
				_ = h.LiveKit.StopAudioEgress(ctx, *egressID)
			}
			h.SetActiveEgress(session.RoomName, nil)

			var expiresAt *time.Time
			isRecA := recordingURL != nil && isUserSessionRecorder(session.RecordedByUserID, session.UserAID)
			isRecB := recordingURL != nil && isUserSessionRecorder(session.RecordedByUserID, session.UserBID)
			retA := 0
			retB := 0
			if isRecA && session.UserA != nil {
				retA = database.GetEffectiveEntitlement(session.UserA, h.AdminTelegramIDs).RetentionDays
			}
			if isRecB && session.UserB != nil {
				retB = database.GetEffectiveEntitlement(session.UserB, h.AdminTelegramIDs).RetentionDays
			}
			maxRetention := retA
			if retB > maxRetention {
				maxRetention = retB
			}
			if maxRetention < 1 {
				maxRetention = 1
			}
			if recordingURL != nil && (isRecA || isRecB) {
				t := time.Now().Add(time.Duration(maxRetention) * 24 * time.Hour)
				expiresAt = &t
			}

			claimed, err := h.DB.CompleteCallSession(ctx, session.ID, completedDuration, egressID, recordingURL, expiresAt)
			if err != nil {
				return reconciledCount, err
			}
			if !claimed {
				continue
			}
			_ = h.LiveKit.DeleteRoom(ctx, session.RoomName)
			h.DeleteRoomMutex(session.RoomName)
			reconciledCount++
		} else {
			h.ScheduleAuthoritativeSessionTeardown(session.RoomName, remainingSeconds)
			reconciledCount++
		}
	}

	return reconciledCount, nil
}
