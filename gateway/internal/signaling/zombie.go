package signaling

import (
	"context"
	"fmt"
	"time"

	"github.com/pairtalk/gateway/internal/database"
)

func (h *Hub) SweepZombieSessions(ctx context.Context) (int, error) {
	sweptCount := 0

	// 1. Sweep stale PENDING direct calls older than 2 minutes
	stalePending, err := h.DB.GetStalePendingSessions(ctx, time.Now().Add(-2*time.Minute))
	if err == nil {
		for _, s := range stalePending {
			cancelled, _ := h.DB.CancelCallSession(ctx, s.ID)
			if cancelled {
				sweptCount++
			}
		}
	}

	// 2. Sweep ACTIVE zombie sessions
	activeSessions, err := h.DB.GetActiveSessionsForReconciliation(ctx)
	if err != nil {
		return sweptCount, err
	}

	now := time.Now()
	for _, session := range activeSessions {
		if session.UserA == nil || session.UserB == nil {
			continue
		}

		maxDurationMinutes := database.CalculateEffectiveCallDuration(session.UserA, session.UserB, h.AdminTelegramIDs)
		maxDurationSeconds := maxDurationMinutes * 60
		elapsedSeconds := int(now.Sub(session.CreatedAt).Seconds())

		// Condition 1: createdAt < now - maxDuration - 5 minutes
		isPastMaxDurationWithMargin := elapsedSeconds > (maxDurationSeconds + 5*60)

		// Condition 2: both participants disconnected and not in 15s grace
		bothDisconnected := false
		if elapsedSeconds >= 90 {
			liveSockets := h.GetSocketsInRoom(session.RoomName)
			h.mu.RLock()
			_, graceA := h.disconnectGraceTimers[session.UserAID]
			_, graceB := h.disconnectGraceTimers[session.UserBID]
			h.mu.RUnlock()

			bothDisconnected = len(liveSockets) == 0 && !graceA && !graceB
			if bothDisconnected && !isPastMaxDurationWithMargin {
				present, err := h.LiveKit.ParticipantsPresent(ctx, session.RoomName, session.UserAID, session.UserBID)
				// Preserve a call on another gateway or whenever presence is uncertain.
				bothDisconnected = err == nil && !present
			}
		}

		if !isPastMaxDurationWithMargin && !bothDisconnected {
			continue
		}

		roomLock := h.getRoomMutex(session.RoomName)
		roomLock.Lock()

		current, err := h.DB.GetCallSessionByRoomName(ctx, session.RoomName)
		if err != nil || current == nil || current.Status != "ACTIVE" {
			roomLock.Unlock()
			continue
		}

		h.ClearSessionTimer(session.RoomName)

		targetStatus := "CANCELLED"
		finalDuration := 0
		reason := "all_participants_disconnected"
		if isPastMaxDurationWithMargin {
			targetStatus = "COMPLETED"
			finalDuration = maxDurationSeconds
			if elapsedSeconds < maxDurationSeconds {
				finalDuration = elapsedSeconds
			}
			reason = "call_duration_limit_reached"
		}

		egress := h.GetActiveEgress(session.RoomName)
		var egressID *string
		var recordingURL *string
		if egress != nil {
			egressID = &egress.EgressID
			recordingURL = &egress.RelativeURL
		} else if current.EgressID != nil {
			egressID = current.EgressID
			recordingURL = current.RecordingURL
		}

		if egressID != nil && *egressID != "" {
			_ = h.LiveKit.StopAudioEgress(ctx, *egressID)
		}
		h.SetActiveEgress(session.RoomName, nil)

		var isRecA, isRecB bool
		var retA, retB int

		if targetStatus == "COMPLETED" {
			var expiresAt *time.Time
			isRecA = recordingURL != nil && isUserSessionRecorder(current.RecordedByUserID, current.UserAID)
			isRecB = recordingURL != nil && isUserSessionRecorder(current.RecordedByUserID, current.UserBID)
			if isRecA && current.UserA != nil {
				retA = database.GetEffectiveEntitlement(current.UserA, h.AdminTelegramIDs).RetentionDays
			}
			if isRecB && current.UserB != nil {
				retB = database.GetEffectiveEntitlement(current.UserB, h.AdminTelegramIDs).RetentionDays
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

			claimed, err := h.DB.CompleteCallSession(ctx, current.ID, finalDuration, egressID, recordingURL, expiresAt)
			if err != nil || !claimed {
				roomLock.Unlock()
				continue
			}
			sweptCount++
		} else {
			cancelled, err := h.DB.CancelCallSession(ctx, current.ID)
			if err != nil || !cancelled {
				roomLock.Unlock()
				continue
			}
			sweptCount++
		}
		_ = h.LiveKit.DeleteRoom(ctx, session.RoomName)

		h.EmitToRoom(session.RoomName, "call_finished", CallFinishedEvent{
			Duration: finalDuration,
			Reason:   reason,
		})

		if h.PubSub != nil && targetStatus == "COMPLETED" && finalDuration >= 5 {
			userATG := ""
			userBTG := ""
			userAAlias := ""
			userBAlias := ""
			if current.UserA != nil {
				userATG = fmt.Sprintf("%d", current.UserA.TelegramID)
				userAAlias = current.UserA.Alias
			}
			if current.UserB != nil {
				userBTG = fmt.Sprintf("%d", current.UserB.TelegramID)
				userBAlias = current.UserB.Alias
			}

			var rA *int
			var rB *int
			if isRecA {
				rA = &retA
			}
			if isRecB {
				rB = &retB
			}

			_ = h.PubSub.PublishCallFinished(ctx, CallFinishedPubSubMessage{
				Type:            "CALL_FINISHED",
				SessionID:       current.ID,
				RoomName:        current.RoomName,
				UserAID:         current.UserAID,
				UserBID:         current.UserBID,
				UserATelegramID: userATG,
				UserBTelegramID: userBTG,
				UserAAlias:      userAAlias,
				UserBAlias:      userBAlias,
				DurationSeconds: finalDuration,
				RecordingURL:    recordingURL,
				RetentionDaysA:  rA,
				RetentionDaysB:  rB,
				Reason:          reason,
			})
		}

		roomLock.Unlock()
		h.DeleteRoomMutex(session.RoomName)
	}

	return sweptCount, nil
}

func (h *Hub) StartZombieSessionCleaner(ctx context.Context) {
	ticker := time.NewTicker(5 * time.Minute)
	go func() {
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				sweepCtx, cancel := context.WithTimeout(h.Context(), 30*time.Second)
				_, _ = h.SweepZombieSessions(sweepCtx)
				cancel()
			}
		}
	}()
}
