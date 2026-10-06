package signaling

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/pairtalk/gateway/internal/database"
	"github.com/pairtalk/gateway/internal/livekit"
	"github.com/pairtalk/gateway/internal/matchmaking"
)

func (h *Hub) Dispatch(socket *ClientSocket, event string, payload []byte) {
	switch event {
	case "join_queue", "cancel_queue", "toggle_record", "finish_call", "peer_ready", "get_recording_status", "offer", "answer", "candidate", "leave":
	default:
		return
	}
	socket.enqueueEvent(func() { h.dispatchEvent(socket, event, payload) })
}

func (h *Hub) dispatchEvent(socket *ClientSocket, event string, payload []byte) {
	switch event {
	case "join_queue":
		h.handleJoinQueue(socket)
	case "cancel_queue":
		h.handleCancelQueue(socket)
	case "toggle_record":
		h.handleToggleRecord(socket, payload)
	case "finish_call":
		h.handleFinishCall(socket, payload)
	case "peer_ready":
		h.handlePeerReady(socket, payload)
	case "get_recording_status":
		h.handleRecordingStatus(socket, payload)
	case "offer", "answer", "candidate", "leave":
		h.handleWebRTCSignal(socket, event, payload)
	}
}

func (h *Hub) handleJoinQueue(socket *ClientSocket) {
	if socket.UserID == "" {
		socket.Emit("error", SocketErrorEvent{Message: "Unauthenticated socket session."})
		return
	}

	// 800ms debounce
	nowMs := time.Now().UnixMilli()
	h.mu.Lock()
	lastAction := h.userLastActionTime[socket.UserID]
	if nowMs-lastAction < 800 {
		h.mu.Unlock()
		socket.Emit("queue_joined", QueueJoinedEvent{Status: "searching"})
		return
	}
	h.userLastActionTime[socket.UserID] = nowMs
	h.mu.Unlock()

	userLock := h.getUserMutex(socket.UserID)
	userLock.Lock()
	defer userLock.Unlock()

	ctx, cancel := context.WithTimeout(h.Context(), 10*time.Second)
	defer cancel()

	user, err := h.DB.GetUserByID(ctx, socket.UserID)
	if err != nil || user == nil {
		socket.Emit("error", SocketErrorEvent{Code: "USER_NOT_FOUND", Message: "User profile not found."})
		return
	}

	// Check suspension / ban status
	isSuspended := user.IsPermanentlyBanned || (user.IsBanned && (user.BannedUntil == nil || user.BannedUntil.After(time.Now())))
	if isSuspended {
		socket.Emit("error", SocketErrorEvent{
			Code:    "MATCHMAKING_SUSPENDED",
			Message: "Your account is suspended from matchmaking. Please contact support via the Telegram Bot.",
		})
		return
	}

	// Check active call session
	activeCall, err := h.DB.GetActiveCallForUser(ctx, user.ID)
	if err != nil {
		socket.Emit("error", SocketErrorEvent{Message: "Unable to check your current call. Please try again."})
		return
	}
	if activeCall != nil {
		// Socket presence is local; a shared active call may be on another gateway.
		socket.Emit("error", SocketErrorEvent{Code: "CALL_ALREADY_ACTIVE", Message: "Another session is currently in an active call from this account. Please try again later."})
		return
	}

	// Check monthly quota
	if err := h.DB.RefreshPlanConfiguration(ctx); err != nil {
		socket.Emit("error", SocketErrorEvent{Message: "Unable to load current call limits. Please try again."})
		return
	}
	ent := database.GetEffectiveEntitlement(user, h.AdminTelegramIDs)
	callsUsed, err := h.DB.GetUserCallsUsedThisPeriod(ctx, user.ID, user)
	if err != nil {
		socket.Emit("error", SocketErrorEvent{Message: "Unable to check your call allowance. Please try again."})
		return
	}
	bonusCalls, err := h.DB.GetActiveBonusCallsCount(ctx, user.ID)
	if err != nil {
		socket.Emit("error", SocketErrorEvent{Message: "Unable to check your bonus calls. Please try again."})
		return
	}

	if !ent.IsAdmin && ent.CallLimit < 999 && callsUsed >= ent.CallLimit && bonusCalls <= 0 {
		socket.Emit("error", SocketErrorEvent{
			Code:    "MATCHMAKING_QUOTA_EXCEEDED",
			Message: fmt.Sprintf("You have reached your monthly limit of %d calls. Invite friends with '👥 Invite Friends' to earn bonus calls or upgrade your plan!", ent.CallLimit),
		})
		return
	}

	// Server-side authoritative skill querying (strictly discards client payload)
	matchResult, err := h.Matchmaking.JoinQueue(
		ctx,
		user.ID,
		user.Band,
		matchmaking.UserSkills{
			SubFC:  user.SubFC,
			SubLR:  user.SubLR,
			SubGRA: user.SubGRA,
			SubP:   user.SubP,
		},
		matchmaking.MatchOptions{
			Plan:         ent.Plan,
			WarningCount: user.WarningCount,
		},
	)
	if err != nil {
		socket.Emit("error", SocketErrorEvent{Message: "Failed to join matchmaking queue."})
		return
	}

	if !matchResult.Matched || matchResult.PartnerID == "" || matchResult.RoomName == "" {
		socket.Emit("queue_joined", QueueJoinedEvent{Status: "searching"})
		return
	}

	// Partner matched
	partner, err := h.DB.GetUserByID(ctx, matchResult.PartnerID)
	partnerSockets := h.GetUserSockets(matchResult.PartnerID)

	weakSkill, strongSkill, _ := matchmaking.DetermineWeakAndStrongSkills(matchmaking.UserSkills{
		SubFC: user.SubFC, SubLR: user.SubLR, SubGRA: user.SubGRA, SubP: user.SubP,
	})
	ownBucket, _ := h.Matchmaking.GetBucketKey(user.Band, weakSkill, strongSkill)

	if partner == nil || len(partnerSockets) == 0 {
		if partner != nil {
			_, _ = h.Matchmaking.CancelQueue(ctx, partner.ID)
		}
		_ = h.Matchmaking.RestoreQueue(ctx, user.ID, ownBucket, &user.Band, &user.Plan)
		socket.Emit("queue_joined", QueueJoinedEvent{Status: "searching"})
		return
	}

	sessionID := uuid.NewString()
	roomName := matchResult.RoomName
	user, partner, err = h.DB.AdmitCallSession(ctx, sessionID, roomName, user.ID, partner.ID)
	if err != nil {
		socket.Emit("error", SocketErrorEvent{Code: "ALREADY_IN_PROGRESS", Message: "The match could not be admitted. Please search again."})
		for _, ps := range partnerSockets {
			ps.Emit("error", SocketErrorEvent{Code: "ALREADY_IN_PROGRESS", Message: "The match could not be admitted. Please search again."})
		}
		return
	}
	durationLimitMinutes := database.CalculateEffectiveCallDuration(user, partner, h.AdminTelegramIDs)
	durationLimitSeconds := durationLimitMinutes * 60
	tokenTTL := durationLimitSeconds + 300
	if tokenTTL < 60 {
		tokenTTL = 60
	} else if tokenTTL > 7200 {
		tokenTTL = 7200
	}

	tokenUser, err1 := livekit.GenerateLiveKitToken(h.LiveKitAPIKey, h.LiveKitAPISecret, roomName, user.ID, user.Alias, tokenTTL)
	tokenPartner, err2 := livekit.GenerateLiveKitToken(h.LiveKitAPIKey, h.LiveKitAPISecret, roomName, partner.ID, partner.Alias, tokenTTL)
	if err1 != nil || err2 != nil {
		_, _ = h.DB.CancelCallSession(ctx, sessionID)
		_ = h.Matchmaking.RestoreQueue(ctx, user.ID, ownBucket, &user.Band, &user.Plan)
		socket.Emit("error", SocketErrorEvent{Message: "Failed to generate voice tokens."})
		return
	}

	// Join both participants to the room
	userSockets := h.GetUserSockets(user.ID)
	for _, s := range userSockets {
		s.Join(roomName)
	}
	for _, ps := range partnerSockets {
		ps.Join(roomName)
	}

	// Defer authoritative session duration teardown until both peers send peer_ready;
	// schedule a 90s connection handshake timer to cancel cleanly if a peer fails to join.
	h.SetRoomDurationLimit(roomName, durationLimitSeconds)
	h.ScheduleConnectionHandshakeTimer(roomName, 90)

	// Emit match_found to both participants
	for _, s := range userSockets {
		s.Emit("match_found", MatchFoundEvent{
			RoomName:           roomName,
			PartnerID:          partner.ID,
			PartnerAlias:       partner.Alias,
			PartnerBand:        partner.Band,
			Token:              tokenUser,
			LivekitToken:       tokenUser,
			LivekitURL:         h.LiveKitHost,
			CallDurationLimit:  durationLimitSeconds,
			MaxDurationSeconds: durationLimitSeconds,
		})
	}

	for _, ps := range partnerSockets {
		ps.Emit("match_found", MatchFoundEvent{
			RoomName:           roomName,
			PartnerID:          user.ID,
			PartnerAlias:       user.Alias,
			PartnerBand:        user.Band,
			Token:              tokenPartner,
			LivekitToken:       tokenPartner,
			LivekitURL:         h.LiveKitHost,
			CallDurationLimit:  durationLimitSeconds,
			MaxDurationSeconds: durationLimitSeconds,
		})
	}
}

func (h *Hub) handleCancelQueue(socket *ClientSocket) {
	if socket.UserID == "" {
		return
	}

	ctx, cancel := context.WithTimeout(h.Context(), 5*time.Second)
	defer cancel()

	if h.Matchmaking != nil {
		_, _ = h.Matchmaking.CancelQueue(ctx, socket.UserID)
	}

	socket.Emit("queue_cancelled", QueueCancelledEvent{Success: true})
}

func (h *Hub) handlePeerReady(socket *ClientSocket, payload []byte) {
	if socket.UserID == "" {
		return
	}
	var req PeerReadyPayload
	if err := json.Unmarshal(payload, &req); err != nil || req.RoomName == "" || len(req.RoomName) > 128 {
		return
	}

	if h.DB == nil {
		return
	}
	ctx, cancel := context.WithTimeout(h.Context(), 10*time.Second)
	defer cancel()
	session, err := h.DB.GetCallSessionByRoomName(ctx, req.RoomName)
	if err != nil || session == nil || session.Status != "ACTIVE" || (session.UserAID != socket.UserID && session.UserBID != socket.UserID) {
		return
	}
	roomLock := h.getRoomMutex(req.RoomName)
	roomLock.Lock()
	defer roomLock.Unlock()
	authorized, err := h.DB.RegisterReadyParticipant(ctx, session.ID, socket.UserID)
	if err != nil || !authorized {
		return
	}
	h.mu.Lock()
	peers := h.roomPeers[req.RoomName]
	if peers == nil {
		peers = make(map[string]bool)
		h.roomPeers[req.RoomName] = peers
	}
	peers[socket.UserID] = true
	startedAt := session.CreatedAt.UnixMilli()
	h.roomStartedAt[req.RoomName] = startedAt
	h.mu.Unlock()
	h.ClearConnectionHandshakeTimer(req.RoomName)
	durationLimit := h.GetRoomDurationLimit(req.RoomName)
	if durationLimit <= 0 {
		durationLimit = database.CalculateEffectiveCallDuration(session.UserA, session.UserB, h.AdminTelegramIDs) * 60
		h.SetRoomDurationLimit(req.RoomName, durationLimit)
	}
	remaining := durationLimit - int(time.Since(session.CreatedAt).Seconds())
	if remaining < 1 {
		remaining = 1
	}
	h.ScheduleAuthoritativeSessionTeardown(req.RoomName, remaining)
	// Keep the durable gate even after a partial provider failure; retry on readiness.
	if err := h.LiveKit.EnableCallSubscriptions(ctx, req.RoomName, session.UserAID, session.UserBID); err != nil {
		return
	}
	h.EmitToRoom(req.RoomName, "call_started", CallStartedEvent{StartedAt: startedAt, DurationSeconds: durationLimit, ExpiresAt: startedAt + int64(durationLimit*1000)})
}

func (h *Hub) handleToggleRecord(socket *ClientSocket, payload []byte) {
	var req ToggleRecordPayload
	if err := json.Unmarshal(payload, &req); err != nil || req.RoomName == "" || len(req.RoomName) > 128 {
		socket.Emit("error", SocketErrorEvent{Message: "Invalid recording request."})
		return
	}

	requesterID := socket.UserID
	if requesterID == "" {
		socket.Emit("error", SocketErrorEvent{Message: "Unauthenticated socket session."})
		return
	}

	ctx, cancel := context.WithTimeout(h.Context(), 15*time.Second)
	defer cancel()
	if h.DB == nil {
		return
	}
	initial, authErr := h.DB.GetCallSessionByRoomName(ctx, req.RoomName)
	if authErr != nil || initial == nil || initial.Status != "ACTIVE" || (initial.UserAID != requesterID && initial.UserBID != requesterID) {
		return
	}
	roomLock := h.getRoomMutex(req.RoomName)
	roomLock.Lock()
	defer roomLock.Unlock()

	session, err := h.DB.GetCallSessionByRoomName(ctx, req.RoomName)
	if err != nil || session == nil || session.Status != "ACTIVE" || (session.UserAID != requesterID && session.UserBID != requesterID) {
		socket.Emit("error", SocketErrorEvent{Message: "Unauthorized or inactive call."})
		return
	}

	if req.Record {
		if session.MediaAuthorizedAt == nil {
			socket.Emit("recording_error", RecordingErrorEvent{Code: "CALL_NOT_READY", Message: "Wait for both participants to connect before recording."})
			return
		}
		// Verify recording limits
		if err := h.DB.RefreshPlanConfiguration(ctx); err != nil {
			socket.Emit("recording_error", RecordingErrorEvent{Code: "RECORDING_UNAVAILABLE", Message: "Unable to check recording limits. Please try again."})
			return
		}
		user, err := h.DB.GetUserByID(ctx, requesterID)
		if err != nil || user == nil {
			socket.Emit("recording_error", RecordingErrorEvent{Code: "RECORDING_UNAVAILABLE", Message: "Unable to check recording limits. Please try again."})
			return
		}
		ent := database.GetEffectiveEntitlement(user, h.AdminTelegramIDs)
		recUsed, err := h.DB.GetUserRecordingsUsedThisPeriod(ctx, requesterID, user)
		if err != nil {
			socket.Emit("recording_error", RecordingErrorEvent{Code: "RECORDING_UNAVAILABLE", Message: "Unable to check recording limits. Please try again."})
			return
		}

		if !ent.IsAdmin && recUsed >= ent.RecordingLimit {
			socket.Emit("record_status", RecordStatusEvent{Record: false, RoomName: req.RoomName})
			socket.Emit("recording_error", RecordingErrorEvent{
				Code:    "RECORDING_LIMIT_REACHED",
				Message: "Your recording limit for this period has been reached.",
			})
			return
		}

		if session.EgressID != nil && *session.EgressID != "" && session.ActiveRecorderIDs != nil {
			h.SetActiveEgress(req.RoomName, &ActiveEgress{
				EgressID:    *session.EgressID,
				RelativeURL: safeString(session.RecordingURL),
			})
			if _, err := h.DB.ChangeRecordingIntent(ctx, session.ID, requesterID, *session.EgressID, true); err != nil {
				return
			}
			socket.Emit("record_status", RecordStatusEvent{Record: true, RoomName: req.RoomName})
			h.publishRoomRecordingSnapshot(ctx, session)
			return
		}

		h.publishRoomRecordingState(ctx, req.RoomName, "unknown")
		egress, err := h.LiveKit.StartAudioEgress(ctx, req.RoomName, func(key string) error { return h.DB.TrackRecordingKey(ctx, session.ID, key) })
		if err != nil {
			socket.Emit("record_status", RecordStatusEvent{Record: false, RoomName: req.RoomName})
			socket.Emit("recording_error", RecordingErrorEvent{
				Code:    "RECORDING_UNAVAILABLE",
				Message: "Audio recording is temporarily unavailable. Your voice call can proceed normally.",
			})
			return
		}

		newRecorders := requesterID
		updated, err := h.DB.UpdateSessionEgressAtomic(ctx, session.ID, egress.EgressID, egress.RelativeURL, newRecorders, session.EgressID)
		if err != nil || !updated {
			// Optimistic concurrency lost: another participant started egress concurrently. Stop ours!
			_ = h.LiveKit.StopAudioEgress(ctx, egress.EgressID)
			socket.Emit("record_status", RecordStatusEvent{Record: false, RoomName: req.RoomName})
			return
		}

		h.SetActiveEgress(req.RoomName, &ActiveEgress{
			EgressID:    egress.EgressID,
			RelativeURL: egress.RelativeURL,
		})
		socket.Emit("record_status", RecordStatusEvent{Record: true, RoomName: req.RoomName})
		h.publishRoomRecordingState(ctx, req.RoomName, "on")
		return
	}

	if session.EgressID != nil {
		stopped, err := h.DB.ChangeRecordingIntent(ctx, session.ID, requesterID, *session.EgressID, false)
		if err != nil {
			return
		}
		if stopped {
			h.publishRoomRecordingState(ctx, req.RoomName, "unknown")
			_ = h.LiveKit.StopAudioEgress(ctx, *session.EgressID)
			h.SetActiveEgress(req.RoomName, nil)
		}
	}
	socket.Emit("record_status", RecordStatusEvent{Record: false, RoomName: req.RoomName})
	h.publishRoomRecordingSnapshot(ctx, session)
}

func (h *Hub) handleFinishCall(socket *ClientSocket, payload []byte) {
	var req FinishCallPayload
	if err := json.Unmarshal(payload, &req); err != nil || req.RoomName == "" || len(req.RoomName) > 128 {
		socket.Emit("error", SocketErrorEvent{Message: "Invalid call completion request."})
		return
	}

	requesterID := socket.UserID
	if requesterID == "" {
		socket.Emit("error", SocketErrorEvent{Message: "Unauthenticated socket session."})
		return
	}

	ctx, cancel := context.WithTimeout(h.Context(), 15*time.Second)
	defer cancel()
	if h.DB == nil {
		return
	}
	initial, authErr := h.DB.GetCallSessionByRoomName(ctx, req.RoomName)
	if authErr != nil || initial == nil || (initial.UserAID != requesterID && initial.UserBID != requesterID) {
		return
	}
	if initial.Status != "ACTIVE" {
		duration := 0
		if initial.Duration != nil {
			duration = *initial.Duration
		}
		socket.Emit("call_finished", CallFinishedEvent{Duration: duration})
		return
	}

	roomLock := h.getRoomMutex(req.RoomName)
	roomLock.Lock()
	defer roomLock.Unlock()

	session, err := h.DB.GetCallSessionByRoomName(ctx, req.RoomName)
	if err != nil || session == nil {
		return
	}
	if session.UserAID != requesterID && session.UserBID != requesterID {
		socket.Emit("error", SocketErrorEvent{Message: "Unauthorized: You are not a participant in this call."})
		return
	}

	h.ClearSessionTimer(req.RoomName)
	h.ClearConnectionHandshakeTimer(req.RoomName)

	if session.Status != "ACTIVE" {
		dur := 0
		if session.Duration != nil {
			dur = *session.Duration
		}
		socket.Emit("call_finished", CallFinishedEvent{Duration: dur})
		return
	}

	startedAtMs := h.GetRoomStartedAt(req.RoomName)
	var durationSeconds int
	if startedAtMs > 0 {
		durationSeconds = int((time.Now().UnixMilli() - startedAtMs) / 1000)
	} else {
		durationSeconds = int(time.Since(session.CreatedAt).Seconds())
	}
	if durationSeconds < 1 {
		durationSeconds = 1
	}
	if session.UserA != nil && session.UserB != nil {
		limitMinutes := database.CalculateEffectiveCallDuration(session.UserA, session.UserB, h.AdminTelegramIDs)
		limitSeconds := limitMinutes * 60
		if durationSeconds > limitSeconds {
			durationSeconds = limitSeconds
		}
	}

	egressID := session.EgressID
	recordingURL := session.RecordingURL

	if egressID != nil && *egressID != "" {
		_ = h.LiveKit.StopAudioEgress(ctx, *egressID)
	}
	h.SetActiveEgress(req.RoomName, nil)

	// Calculate recording retention
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

	isMicDenied := req.Reason == "microphone_permission_denied" && durationSeconds < 5
	if req.Reason == "microphone_permission_denied" && !isMicDenied {
		req.Reason = "call_finished"
	}
	complete := h.DB.CompleteCallSession
	if isMicDenied {
		complete = h.DB.CompleteUnchargedCallSession
	}
	effects := database.CompletionEffects{Reason: req.Reason}
	if isMicDenied {
		effects.DeniedUserID = requesterID
	}
	claimed, err := complete(ctx, session.ID, durationSeconds, egressID, recordingURL, expiresAt, effects)
	if err != nil || !claimed {
		return
	}

	_ = h.LiveKit.DeleteRoom(ctx, req.RoomName)
	h.mu.Lock()
	delete(h.roomPeers, req.RoomName)
	delete(h.roomStartedAt, req.RoomName)
	delete(h.roomDurationLimits, req.RoomName)
	h.mu.Unlock()
	h.DeleteRoomMutex(req.RoomName)

	h.EmitToRoom(req.RoomName, "call_finished", CallFinishedEvent{Duration: durationSeconds})

	// Publish CALL_FINISHED to Redis pairtalk:events
	if h.PubSub != nil && (durationSeconds >= 5 || isMicDenied) {
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

		deniedUserID := ""
		if isMicDenied {
			deniedUserID = requesterID
		}

		_ = h.PubSub.PublishCallFinished(ctx, CallFinishedPubSubMessage{
			Type:            "CALL_FINISHED",
			SessionID:       session.ID,
			RoomName:        req.RoomName,
			UserAID:         session.UserAID,
			UserBID:         session.UserBID,
			UserATelegramID: userATG,
			UserBTelegramID: userBTG,
			UserAAlias:      userAAlias,
			UserBAlias:      userBAlias,
			DurationSeconds: durationSeconds,
			RecordingURL:    recordingURL,
			RetentionDaysA:  rA,
			RetentionDaysB:  rB,
			Reason:          req.Reason,
			RequesterID:     requesterID,
			DeniedUserID:    deniedUserID,
		})
	}
}

func (h *Hub) handleWebRTCSignal(socket *ClientSocket, event string, payload []byte) {
	var sig WebRTCSignalPayload
	if err := json.Unmarshal(payload, &sig); err != nil || sig.RoomName == "" {
		return
	}

	// Strictly verify that socket is enrolled in the target room to prevent cross-room signal injection
	socket.mu.Lock()
	inRoom := socket.Rooms != nil && socket.Rooms[sig.RoomName]
	socket.mu.Unlock()

	if !inRoom {
		return
	}

	sig.SenderID = socket.UserID
	sig.TraceID = socket.TraceID

	h.EmitToRoomExcept(sig.RoomName, socket.ID, event, sig)
}

func (h *Hub) handleDisconnect(socket *ClientSocket) {
	h.mu.RLock()
	closing := h.closing
	h.mu.RUnlock()
	if closing {
		return
	}
	if socket.UserID == "" {
		return
	}

	ctx, cancel := context.WithTimeout(h.Context(), 5*time.Second)
	defer cancel()

	h.mu.RLock()
	remainingTotal := len(h.userSockets[socket.UserID])
	h.mu.RUnlock()

	// Cancel queue for this user if no sockets left at all
	if remainingTotal == 0 && h.Matchmaking != nil {
		_, _ = h.Matchmaking.CancelQueue(ctx, socket.UserID)
	}

	if h.DB == nil {
		return
	}

	activeCall, err := h.DB.GetActiveCallForUser(ctx, socket.UserID)
	if err != nil || activeCall == nil {
		return
	}

	// Check if user still has a socket in this specific call room
	h.mu.RLock()
	roomSocketsRemaining := 0
	if rSockets, ok := h.roomSockets[activeCall.RoomName]; ok {
		for _, s := range rSockets {
			if s.UserID == socket.UserID {
				roomSocketsRemaining++
			}
		}
	}
	h.mu.RUnlock()

	if roomSocketsRemaining > 0 {
		return
	}

	// Notify room of connection loss with 15s grace period
	h.EmitToRoom(activeCall.RoomName, "partner_connection_lost", PartnerConnectionLostEvent{
		UserID:         socket.UserID,
		GracePeriodSec: 15,
	})

	disconnectTimestamp := time.Now()

	// 15-second grace period timer
	graceTimer := time.AfterFunc(15*time.Second, func() {
		h.mu.Lock()
		delete(h.disconnectGraceTimers, socket.UserID)
		reconnected := false
		if rSockets, ok := h.roomSockets[activeCall.RoomName]; ok {
			for _, s := range rSockets {
				if s.UserID == socket.UserID {
					reconnected = true
					break
				}
			}
		}
		h.mu.Unlock()

		if reconnected {
			return
		}

		roomLock := h.getRoomMutex(activeCall.RoomName)
		roomLock.Lock()
		defer roomLock.Unlock()

		teardownCtx, tdCancel := context.WithTimeout(h.Context(), 10*time.Second)
		defer tdCancel()

		current, err := h.DB.GetCallSessionByRoomName(teardownCtx, activeCall.RoomName)
		if err != nil || current == nil || current.Status != "ACTIVE" {
			return
		}

		startedAtMs := h.GetRoomStartedAt(activeCall.RoomName)
		var durationSeconds int
		if startedAtMs > 0 {
			durationSeconds = int((disconnectTimestamp.UnixMilli() - startedAtMs) / 1000)
		} else {
			durationSeconds = int(disconnectTimestamp.Sub(current.CreatedAt).Seconds())
		}
		if durationSeconds < 0 {
			durationSeconds = 0
		}
		if current.UserA != nil && current.UserB != nil {
			limitMinutes := database.CalculateEffectiveCallDuration(current.UserA, current.UserB, h.AdminTelegramIDs)
			limitSeconds := limitMinutes * 60
			if durationSeconds > limitSeconds {
				durationSeconds = limitSeconds
			}
		}
		isCancelled := durationSeconds < 5

		h.ClearSessionTimer(current.RoomName)
		h.ClearConnectionHandshakeTimer(current.RoomName)

		egressID := current.EgressID
		recordingURL := current.RecordingURL

		if egressID != nil && *egressID != "" {
			_ = h.LiveKit.StopAudioEgress(teardownCtx, *egressID)
		}
		h.SetActiveEgress(current.RoomName, nil)

		_ = h.LiveKit.DeleteRoom(teardownCtx, current.RoomName)
		h.mu.Lock()
		delete(h.roomPeers, current.RoomName)
		delete(h.roomStartedAt, current.RoomName)
		delete(h.roomDurationLimits, current.RoomName)
		h.mu.Unlock()
		h.DeleteRoomMutex(current.RoomName)

		if isCancelled {
			_, _ = h.DB.CancelCallSession(teardownCtx, current.ID)
			h.EmitToRoom(current.RoomName, "call_finished", CallFinishedEvent{
				Duration: durationSeconds,
				Reason:   "call_cancelled",
			})
		} else {
			var expiresAt *time.Time
			isRecA := recordingURL != nil && isUserSessionRecorder(current.RecordedByUserID, current.UserAID)
			isRecB := recordingURL != nil && isUserSessionRecorder(current.RecordedByUserID, current.UserBID)
			retA := 0
			retB := 0
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

			claimed, err := h.DB.CompleteCallSession(teardownCtx, current.ID, durationSeconds, egressID, recordingURL, expiresAt)
			if err != nil || !claimed {
				return
			}
			h.EmitToRoom(current.RoomName, "call_finished", CallFinishedEvent{
				Duration: durationSeconds,
				Reason:   "partner_disconnected",
			})

			if h.PubSub != nil && durationSeconds >= 5 {
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

				_ = h.PubSub.PublishCallFinished(teardownCtx, CallFinishedPubSubMessage{
					Type:            "CALL_FINISHED",
					SessionID:       current.ID,
					RoomName:        current.RoomName,
					UserAID:         current.UserAID,
					UserBID:         current.UserBID,
					UserATelegramID: userATG,
					UserBTelegramID: userBTG,
					UserAAlias:      userAAlias,
					UserBAlias:      userBAlias,
					DurationSeconds: durationSeconds,
					RecordingURL:    recordingURL,
					RetentionDaysA:  rA,
					RetentionDaysB:  rB,
					Reason:          "partner_disconnected",
				})
			}
		}
	})

	h.mu.Lock()
	if h.closing {
		graceTimer.Stop()
		h.mu.Unlock()
		return
	}
	if existing, ok := h.disconnectGraceTimers[socket.UserID]; ok {
		existing.Stop()
	}
	h.disconnectGraceTimers[socket.UserID] = graceTimer
	h.mu.Unlock()
}

func isUserSessionRecorder(recordedBy *string, userID string) bool {
	if recordedBy == nil || *recordedBy == "" || userID == "" {
		return false
	}
	if *recordedBy == "BOTH" || *recordedBy == "ALL" {
		return true
	}
	for _, id := range strings.Split(*recordedBy, ",") {
		trimmed := strings.TrimSpace(id)
		if trimmed == userID || trimmed == "BOTH" || trimmed == "ALL" {
			return true
		}
	}
	return false
}

func addSessionRecorder(recordedBy *string, userID string) string {
	if recordedBy == nil || *recordedBy == "" {
		return userID
	}
	ids := strings.Split(*recordedBy, ",")
	var list []string
	found := false
	for _, id := range ids {
		trimmed := strings.TrimSpace(id)
		if trimmed != "" {
			list = append(list, trimmed)
			if trimmed == userID {
				found = true
			}
		}
	}
	if !found {
		list = append(list, userID)
	}
	return strings.Join(list, ",")
}

func removeSessionRecorder(recordedBy *string, userID string) (string, bool) {
	if recordedBy == nil || *recordedBy == "" {
		return "", false
	}
	ids := strings.Split(*recordedBy, ",")
	var list []string
	for _, id := range ids {
		trimmed := strings.TrimSpace(id)
		if trimmed != "" && trimmed != userID {
			list = append(list, trimmed)
		}
	}
	if len(list) == 0 {
		return "", false
	}
	return strings.Join(list, ","), true
}

func safeString(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}
