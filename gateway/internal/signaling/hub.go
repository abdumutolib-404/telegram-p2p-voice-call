package signaling

import (
	"context"
	"os"
	"sync"
	"time"

	"github.com/pairtalk/gateway/internal/auth"
	"github.com/pairtalk/gateway/internal/database"
	"github.com/pairtalk/gateway/internal/livekit"
	"github.com/pairtalk/gateway/internal/matchmaking"
)

type ActiveEgress struct {
	EgressID    string
	RelativeURL string
}

type Hub struct {
	recordingObservations map[string]*recordingObservation
	DB                    *database.DB
	Matchmaking           *matchmaking.Engine
	LiveKit               *livekit.Client
	PubSub                *PubSubClient
	BotToken              string
	LiveKitHost           string
	LiveKitAPIKey         string
	LiveKitAPISecret      string
	AdminTelegramIDs      []string

	userSockets           map[string]map[string]*ClientSocket // userId -> socketId -> socket
	roomSockets           map[string]map[string]*ClientSocket // roomName -> socketId -> socket
	activeEgresses        map[string]*ActiveEgress            // roomName -> egress
	serverSessionTimers   map[string]*time.Timer              // roomName -> timer
	disconnectGraceTimers map[string]*time.Timer              // userId -> timer
	userLastActionTime    map[string]int64                    // userId -> timestampMs
	roomPeers             map[string]map[string]bool          // roomName -> userId -> true
	roomStartedAt         map[string]int64                    // roomName -> startedAtMs
	roomDurationLimits    map[string]int                      // roomName -> durationSeconds
	handshakeTimers       map[string]*time.Timer              // roomName -> timer

	roomMutexes      sync.Map // roomName -> *sync.Mutex
	userMutexes      sync.Map // userId -> *sync.Mutex
	mu               sync.RWMutex
	eventSlots       chan struct{}
	queuedEventSlots chan struct{}
	ctx              context.Context
	cancel           context.CancelFunc
	closing          bool
}

func NewHub(
	db *database.DB,
	matchmaking *matchmaking.Engine,
	livekit *livekit.Client,
	pubsub *PubSubClient,
	botToken, lkHost, lkKey, lkSecret string,
	adminTelegramIDs []string,
) *Hub {
	ctx, cancel := context.WithCancel(context.Background())
	return &Hub{
		DB:                    db,
		Matchmaking:           matchmaking,
		LiveKit:               livekit,
		PubSub:                pubsub,
		BotToken:              botToken,
		LiveKitHost:           lkHost,
		LiveKitAPIKey:         lkKey,
		LiveKitAPISecret:      lkSecret,
		AdminTelegramIDs:      adminTelegramIDs,
		userSockets:           make(map[string]map[string]*ClientSocket),
		roomSockets:           make(map[string]map[string]*ClientSocket),
		activeEgresses:        make(map[string]*ActiveEgress),
		serverSessionTimers:   make(map[string]*time.Timer),
		disconnectGraceTimers: make(map[string]*time.Timer),
		userLastActionTime:    make(map[string]int64),
		roomPeers:             make(map[string]map[string]bool),
		roomStartedAt:         make(map[string]int64),
		roomDurationLimits:    make(map[string]int),
		handshakeTimers:       make(map[string]*time.Timer),
		eventSlots:            make(chan struct{}, 256),
		queuedEventSlots:      make(chan struct{}, 1024),
		ctx:                   ctx,
		cancel:                cancel,
	}
}

func (h *Hub) Context() context.Context {
	if h.ctx != nil {
		return h.ctx
	}
	return context.Background()
}

func (h *Hub) Close() {
	if h.cancel != nil {
		h.cancel()
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	h.closing = true
	for _, timers := range []map[string]*time.Timer{h.serverSessionTimers, h.handshakeTimers, h.disconnectGraceTimers} {
		for key, timer := range timers {
			timer.Stop()
			delete(timers, key)
		}
	}
}

func (h *Hub) getRoomMutex(roomName string) *sync.Mutex {
	v, _ := h.roomMutexes.LoadOrStore(roomName, &sync.Mutex{})
	return v.(*sync.Mutex)
}

func (h *Hub) DeleteRoomMutex(roomName string) {
	h.roomMutexes.Delete(roomName)
}

func (h *Hub) getUserMutex(userID string) *sync.Mutex {
	v, _ := h.userMutexes.LoadOrStore(userID, &sync.Mutex{})
	return v.(*sync.Mutex)
}

func (h *Hub) Authenticate(ctx context.Context, initData string) (*database.User, bool) {
	if ctx == nil {
		ctx = h.Context()
	}
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	if initData == "" {
		return nil, false
	}

	if os.Getenv("NODE_ENV") == "test" && initData == "test-allowed" {
		return &database.User{
			ID:         "test_user_id",
			TelegramID: 12345678,
			Alias:      "TestUser",
			Band:       6.5,
			Plan:       "FREE",
		}, true
	}

	tgUser, valid := auth.ValidateTelegramInitData(initData, h.BotToken)
	if !valid || tgUser == nil {
		return nil, false
	}

	user, err := h.DB.GetRegisteredUserByTelegramID(ctx, tgUser.ID, auth.TermsVersion, auth.TermsDocumentSHA256)
	if err != nil || user == nil {
		return nil, false
	}

	return user, true
}

const maxAuthenticatedSocketsPerUser = 8

func (h *Hub) AddSocket(socket *ClientSocket) bool {
	h.mu.Lock()
	socket.mu.Lock()
	if h.closing || socket.Closed || socket.UserID == "" || (h.userSockets[socket.UserID][socket.ID] == nil && len(h.userSockets[socket.UserID]) >= maxAuthenticatedSocketsPerUser) {
		socket.mu.Unlock()
		h.mu.Unlock()
		return false
	}
	sockets, ok := h.userSockets[socket.UserID]
	if !ok {
		sockets = make(map[string]*ClientSocket)
		h.userSockets[socket.UserID] = sockets
	}
	sockets[socket.ID] = socket
	socket.mu.Unlock()

	// Cancel disconnect grace timer if user reconnected
	graceTimer, hasGrace := h.disconnectGraceTimers[socket.UserID]
	if hasGrace && graceTimer != nil {
		graceTimer.Stop()
		delete(h.disconnectGraceTimers, socket.UserID)
	}
	h.mu.Unlock()

	if hasGrace && h.DB != nil {
		// Notify active call sessions of reconnection
		go func() {
			ctx, cancel := context.WithTimeout(h.Context(), 5*time.Second)
			defer cancel()
			activeCall, err := h.DB.GetActiveCallForUser(ctx, socket.UserID)
			if err == nil && activeCall != nil {
				h.EmitToRoom(activeCall.RoomName, "partner_reconnected", PartnerReconnectedEvent{
					UserID:        socket.UserID,
					ReconnectedAt: time.Now().UTC().Format(time.RFC3339),
				})
			}
		}()
	}

	// Auto-reconnect active call on socket connect
	if h.DB != nil {
		go h.checkAutoReconnect(socket)
	}
	return true
}

func (h *Hub) checkAutoReconnect(socket *ClientSocket) {
	if h.DB == nil {
		return
	}
	ctx, cancel := context.WithTimeout(h.Context(), 5*time.Second)
	defer cancel()

	activeCall, err := h.DB.GetActiveCallForUser(ctx, socket.UserID)
	if err != nil || activeCall == nil {
		return
	}

	isUserA := activeCall.UserAID == socket.UserID
	selfUser := activeCall.UserA
	partnerUser := activeCall.UserB
	if !isUserA {
		selfUser = activeCall.UserB
		partnerUser = activeCall.UserA
	}

	if selfUser == nil || partnerUser == nil {
		return
	}

	durationLimitMinutes := database.CalculateEffectiveCallDuration(selfUser, partnerUser, h.AdminTelegramIDs)
	durationLimitSeconds := durationLimitMinutes * 60
	elapsedSeconds := int(time.Since(activeCall.DurationAnchor()).Seconds())
	remainingSeconds := durationLimitSeconds - elapsedSeconds
	if remainingSeconds < 1 {
		remainingSeconds = 1
	}

	if elapsedSeconds < durationLimitSeconds {
		tokenTTL := remainingSeconds + 300
		if tokenTTL < 60 {
			tokenTTL = 60
		} else if tokenTTL > 7200 {
			tokenTTL = 7200
		}

		token, err := livekit.GenerateLiveKitToken(
			h.LiveKitAPIKey, h.LiveKitAPISecret,
			activeCall.RoomName, selfUser.ID, selfUser.Alias,
			tokenTTL,
		)
		if err == nil {
			socket.Join(activeCall.RoomName)
			socket.Emit("match_found", MatchFoundEvent{
				RoomName:           activeCall.RoomName,
				PartnerID:          partnerUser.ID,
				PartnerAlias:       partnerUser.Alias,
				PartnerBand:        partnerUser.Band,
				Token:              token,
				LivekitToken:       token,
				LivekitURL:         h.LiveKitHost,
				CallDurationLimit:  remainingSeconds,
				MaxDurationSeconds: durationLimitSeconds,
			})
		}
	}
}

func (h *Hub) RemoveSocket(socket *ClientSocket) {
	socket.mu.Lock()
	roomNames := make([]string, 0, len(socket.Rooms))
	for roomName := range socket.Rooms {
		roomNames = append(roomNames, roomName)
	}
	socket.mu.Unlock()

	h.mu.Lock()
	registered := false
	if sockets, ok := h.userSockets[socket.UserID]; ok {
		registered = sockets[socket.ID] == socket
		delete(sockets, socket.ID)
		if len(sockets) == 0 {
			delete(h.userSockets, socket.UserID)
		}
	}

	for _, roomName := range roomNames {
		if rSockets, ok := h.roomSockets[roomName]; ok {
			delete(rSockets, socket.ID)
			if len(rSockets) == 0 {
				delete(h.roomSockets, roomName)
			}
		}
	}
	h.mu.Unlock()

	// Trigger disconnect cleanup
	if registered {
		h.handleDisconnect(socket)
	}
}

func (h *Hub) JoinRoom(socket *ClientSocket, roomName string) {
	if socket == nil {
		return
	}
	roomLock := h.getRoomMutex(roomName)
	roomLock.Lock()
	defer roomLock.Unlock()
	if h.DB != nil {
		ctx, cancel := context.WithTimeout(h.Context(), 5*time.Second)
		defer cancel()
		call, err := h.DB.GetCallSessionByRoomName(ctx, roomName)
		if err != nil || call == nil || call.Status != "ACTIVE" || (socket.UserID != call.UserAID && socket.UserID != call.UserBID) {
			return
		}
	}
	h.mu.Lock()
	socket.mu.Lock()
	if socket.Closed {
		socket.mu.Unlock()
		h.mu.Unlock()
		return
	}
	if socket.Rooms == nil {
		socket.Rooms = make(map[string]bool)
	}
	socket.Rooms[roomName] = true

	sockets, ok := h.roomSockets[roomName]
	if !ok {
		sockets = make(map[string]*ClientSocket)
		h.roomSockets[roomName] = sockets
	}
	sockets[socket.ID] = socket
	socket.mu.Unlock()
	h.mu.Unlock()
	// A remote completion can race the first ACTIVE read. Check after insertion,
	// while the local room lock also serializes completion notifications.
	if h.DB != nil {
		ctx, cancel := context.WithTimeout(h.Context(), 5*time.Second)
		defer cancel()
		h.cleanupTerminalRoom(ctx, roomName)
	}
}

func (h *Hub) finishKnownTerminal(call *database.CallSession) bool {
	if call == nil || (call.Status != "COMPLETED" && call.Status != "CANCELLED" && call.Status != "DECLINED") {
		return false
	}
	duration := 0
	if call.Duration != nil {
		duration = *call.Duration
	}
	h.finishRoomState(call.RoomName, CallFinishedEvent{Duration: duration, Reason: "call_finished"})
	return true
}

// Caller owns the local room lock; persistence is the terminal authority.
func (h *Hub) cleanupTerminalRoom(ctx context.Context, roomName string) {
	if h.DB == nil {
		return
	}
	call, err := h.DB.GetCallSessionByRoomName(ctx, roomName)
	if err == nil {
		h.finishKnownTerminal(call)
	}
}

// Terminal persistence must succeed before this idempotent teardown is called.
func (h *Hub) FinishRoom(roomName string, payload CallFinishedEvent) {
	h.finishRoomState(roomName, payload)
	if h.PubSub != nil && h.DB != nil {
		ctx, cancel := context.WithTimeout(h.Context(), 3*time.Second)
		defer cancel()
		call, err := h.DB.GetCallSessionByRoomName(ctx, roomName)
		if err == nil && call != nil && call.Status != "ACTIVE" && call.Status != "PENDING" {
			_ = h.PubSub.PublishCallFinished(ctx, CallFinishedPubSubMessage{Type: "CALL_FINISHED", SessionID: call.ID, RoomName: roomName, Reason: payload.Reason})
		}
	}
}

func (h *Hub) finishRoomState(roomName string, payload CallFinishedEvent) {
	h.mu.Lock()
	sockets := make([]*ClientSocket, 0, len(h.roomSockets[roomName]))
	for _, socket := range h.roomSockets[roomName] {
		socket.mu.Lock()
		delete(socket.Rooms, roomName)
		socket.mu.Unlock()
		sockets = append(sockets, socket)
	}
	delete(h.roomSockets, roomName)
	delete(h.roomPeers, roomName)
	delete(h.roomStartedAt, roomName)
	delete(h.roomDurationLimits, roomName)
	delete(h.activeEgresses, roomName)
	for _, timers := range []map[string]*time.Timer{h.serverSessionTimers, h.handshakeTimers} {
		if timer := timers[roomName]; timer != nil {
			timer.Stop()
			delete(timers, roomName)
		}
	}
	h.mu.Unlock()
	for _, socket := range sockets {
		socket.Emit("call_finished", payload)
	}
	h.DeleteRoomMutex(roomName)
}

func (h *Hub) LeaveRoom(socket *ClientSocket, roomName string) {
	if socket != nil {
		socket.mu.Lock()
		if socket.Rooms != nil {
			delete(socket.Rooms, roomName)
		}
		socket.mu.Unlock()
	}

	h.mu.Lock()
	defer h.mu.Unlock()

	if sockets, ok := h.roomSockets[roomName]; ok {
		delete(sockets, socket.ID)
		if len(sockets) == 0 {
			delete(h.roomSockets, roomName)
		}
	}
}

func (h *Hub) EmitToRoom(roomName, event string, payload interface{}) {
	h.mu.RLock()
	sockets := make([]*ClientSocket, 0)
	if rSockets, ok := h.roomSockets[roomName]; ok {
		for _, s := range rSockets {
			sockets = append(sockets, s)
		}
	}
	h.mu.RUnlock()

	for _, s := range sockets {
		s.Emit(event, payload)
	}
}

func (h *Hub) EmitToRoomExcept(roomName, exceptSocketID, event string, payload interface{}) {
	h.mu.RLock()
	sockets := make([]*ClientSocket, 0)
	if rSockets, ok := h.roomSockets[roomName]; ok {
		for _, s := range rSockets {
			if s.ID != exceptSocketID {
				sockets = append(sockets, s)
			}
		}
	}
	h.mu.RUnlock()

	for _, s := range sockets {
		s.Emit(event, payload)
	}
}

func (h *Hub) GetSocketsInRoom(roomName string) []*ClientSocket {
	h.mu.RLock()
	defer h.mu.RUnlock()

	var result []*ClientSocket
	if rSockets, ok := h.roomSockets[roomName]; ok {
		for _, s := range rSockets {
			result = append(result, s)
		}
	}
	return result
}

func (h *Hub) GetUserSockets(userID string) []*ClientSocket {
	h.mu.RLock()
	defer h.mu.RUnlock()

	var result []*ClientSocket
	if uSockets, ok := h.userSockets[userID]; ok {
		for _, s := range uSockets {
			result = append(result, s)
		}
	}
	return result
}

func (h *Hub) ClearSessionTimer(roomName string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if timer, ok := h.serverSessionTimers[roomName]; ok {
		timer.Stop()
		delete(h.serverSessionTimers, roomName)
	}
}

func (h *Hub) SetSessionTimer(roomName string, timer *time.Timer) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.closing {
		timer.Stop()
		return
	}
	if existing, ok := h.serverSessionTimers[roomName]; ok {
		existing.Stop()
	}
	h.serverSessionTimers[roomName] = timer
}

func (h *Hub) SetActiveEgress(roomName string, egress *ActiveEgress) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if egress == nil {
		delete(h.activeEgresses, roomName)
	} else {
		h.activeEgresses[roomName] = egress
	}
}

func (h *Hub) GetActiveEgress(roomName string) *ActiveEgress {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return h.activeEgresses[roomName]
}

func (h *Hub) ClearConnectionHandshakeTimer(roomName string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if timer, ok := h.handshakeTimers[roomName]; ok {
		timer.Stop()
		delete(h.handshakeTimers, roomName)
	}
}

func (h *Hub) SetConnectionHandshakeTimer(roomName string, timer *time.Timer) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.closing {
		timer.Stop()
		return
	}
	if existing, ok := h.handshakeTimers[roomName]; ok {
		existing.Stop()
	}
	h.handshakeTimers[roomName] = timer
}

func (h *Hub) SetRoomDurationLimit(roomName string, limit int) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.roomDurationLimits[roomName] = limit
}

func (h *Hub) GetRoomDurationLimit(roomName string) int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return h.roomDurationLimits[roomName]
}

func (h *Hub) SetRoomStartedAt(roomName string, startedAt int64) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.roomStartedAt[roomName] = startedAt
}

func (h *Hub) GetRoomStartedAt(roomName string) int64 {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return h.roomStartedAt[roomName]
}
