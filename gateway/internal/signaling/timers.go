package signaling

import (
	"context"
	"fmt"
	"time"

	"github.com/pairtalk/gateway/internal/database"
)

func (h *Hub) ScheduleAuthoritativeSessionTeardown(roomName string, durationSeconds int) {
	h.ClearSessionTimer(roomName)
	h.ClearConnectionHandshakeTimer(roomName)

	timer := time.AfterFunc(time.Duration(durationSeconds)*time.Second, func() {
		roomLock := h.getRoomMutex(roomName)
		roomLock.Lock()
		defer roomLock.Unlock()

		ctx, cancel := context.WithTimeout(h.Context(), 15*time.Second)
		defer cancel()

		session, err := h.DB.GetCallSessionByRoomName(ctx, roomName)
		if err != nil || session == nil || session.Status != "ACTIVE" {
			return
		}

		startedAtMs := h.GetRoomStartedAt(roomName)
		var actualDuration int
		if startedAtMs > 0 {
			actualDuration = int((time.Now().UnixMilli() - startedAtMs) / 1000)
		} else {
			actualDuration = int(time.Since(session.CreatedAt).Seconds())
		}
		if actualDuration < 1 {
			actualDuration = 1
		}
		if session.UserA != nil && session.UserB != nil {
			limitMinutes := database.CalculateEffectiveCallDuration(session.UserA, session.UserB, h.AdminTelegramIDs)
			limitSeconds := limitMinutes * 60
			if actualDuration > limitSeconds {
				actualDuration = limitSeconds
			}
		}

		egressID := session.EgressID
		recordingURL := session.RecordingURL

		if egressID != nil && *egressID != "" {
			_ = h.LiveKit.StopAudioEgress(ctx, *egressID)
		}
		h.SetActiveEgress(roomName, nil)

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

		claimed, err := h.DB.CompleteCallSession(ctx, session.ID, actualDuration, egressID, recordingURL, expiresAt)
		if err != nil || !claimed {
			return
		}

		_ = h.LiveKit.DeleteRoom(ctx, roomName)
		h.mu.Lock()
		delete(h.roomPeers, roomName)
		delete(h.roomStartedAt, roomName)
		delete(h.roomDurationLimits, roomName)
		h.mu.Unlock()
		h.DeleteRoomMutex(roomName)

		h.EmitToRoom(roomName, "call_finished", CallFinishedEvent{
			Duration: actualDuration,
			Reason:   "call_duration_limit_reached",
		})

		if h.PubSub != nil && actualDuration >= 5 {
			userATG := ""
			userBTG := ""
			userAAlias := ""
			userBAlias := ""
			if session.UserA != nil {
				userATG = fmt.Sprintf("%d", session.UserA.TelegramID)
				userAAlias = session.UserA.Alias
			}
			if session.UserB != nil {
				userBTG = fmt.Sprintf("%d", session.UserB.TelegramID)
				userBAlias = session.UserB.Alias
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
				SessionID:       session.ID,
				RoomName:        roomName,
				UserAID:         session.UserAID,
				UserBID:         session.UserBID,
				UserATelegramID: userATG,
				UserBTelegramID: userBTG,
				UserAAlias:      userAAlias,
				UserBAlias:      userBAlias,
				DurationSeconds: actualDuration,
				RecordingURL:    recordingURL,
				RetentionDaysA:  rA,
				RetentionDaysB:  rB,
				Reason:          "call_duration_limit_reached",
			})
		}
	})

	h.SetSessionTimer(roomName, timer)
}

func (h *Hub) ScheduleConnectionHandshakeTimer(roomName string, timeoutSeconds int) {
	h.ClearConnectionHandshakeTimer(roomName)

	timer := time.AfterFunc(time.Duration(timeoutSeconds)*time.Second, func() {
		roomLock := h.getRoomMutex(roomName)
		roomLock.Lock()
		defer roomLock.Unlock()

		ctx, cancel := context.WithTimeout(h.Context(), 15*time.Second)
		defer cancel()

		session, err := h.DB.GetCallSessionByRoomName(ctx, roomName)
		if err != nil || session == nil || session.Status != "ACTIVE" {
			return
		}

		connected, presenceErr := h.LiveKit.ConnectedParticipants(ctx, roomName, session.UserAID, session.UserBID)
		if presenceErr != nil {
			h.ScheduleConnectionHandshakeTimer(roomName, 30)
			return
		}
		if connected == 2 {
			if session.UserA == nil || session.UserB == nil {
				h.ScheduleConnectionHandshakeTimer(roomName, 30)
				return
			}
			if _, err := h.DB.RegisterReadyParticipant(ctx, session.ID, session.UserAID); err != nil {
				h.ScheduleConnectionHandshakeTimer(roomName, 30)
				return
			}
			authorized, err := h.DB.RegisterReadyParticipant(ctx, session.ID, session.UserBID)
			if err != nil || !authorized {
				h.ScheduleConnectionHandshakeTimer(roomName, 30)
				return
			}
			limit := database.CalculateEffectiveCallDuration(session.UserA, session.UserB, h.AdminTelegramIDs) * 60
			remaining := limit - int(time.Since(session.CreatedAt).Seconds())
			if remaining < 1 {
				remaining = 1
			}
			h.ScheduleAuthoritativeSessionTeardown(roomName, remaining)
			_ = h.LiveKit.EnableCallSubscriptions(ctx, roomName, session.UserAID, session.UserBID)
			return
		}
		// An authorized conversation remains billable even after participants leave.
		if session.MediaAuthorizedAt != nil {
			h.ScheduleAuthoritativeSessionTeardown(roomName, 1)
			return
		}
		claimed, err := h.DB.CancelCallSession(ctx, session.ID)
		if err != nil || !claimed {
			return
		}
		_ = h.LiveKit.DeleteRoom(ctx, roomName)

		h.mu.Lock()
		delete(h.roomPeers, roomName)
		delete(h.roomStartedAt, roomName)
		delete(h.roomDurationLimits, roomName)
		delete(h.handshakeTimers, roomName)
		h.mu.Unlock()
		h.DeleteRoomMutex(roomName)

		h.EmitToRoom(roomName, "call_finished", CallFinishedEvent{
			Duration: 0,
			Reason:   "partner_failed_to_join",
		})

		if h.PubSub != nil {
			_ = h.PubSub.PublishCallFinished(ctx, CallFinishedPubSubMessage{
				Type:            "CALL_FINISHED",
				SessionID:       session.ID,
				RoomName:        roomName,
				UserAID:         session.UserAID,
				UserBID:         session.UserBID,
				DurationSeconds: 0,
				Reason:          "partner_failed_to_join",
			})
		}
	})

	h.SetConnectionHandshakeTimer(roomName, timer)
}
