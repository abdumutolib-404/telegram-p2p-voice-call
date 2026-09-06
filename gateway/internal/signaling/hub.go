package signaling

import (
	"context"
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
	DB                   *database.DB
	Matchmaking          *matchmaking.Engine
	LiveKit              *livekit.Client
	PubSub               *PubSubClient
	BotToken             string
	LiveKitHost          string
	LiveKitAPIKey        string
	LiveKitAPISecret     string
	AdminTelegramIDs     []string

	userSockets          map[string]map[string]*ClientSocket // userId -> socketId -> socket
	roomSockets          map[string]map[string]*ClientSocket // roomName -> socketId -> socket
	activeEgresses       map[string]*ActiveEgress            // roomName -> egress
	serverSessionTimers  map[string]*time.Timer              // roomName -> timer
	disconnectGraceTimers map[string]*time.Timer             // userId -> timer
	userLastActionTime   map[string]int64                    // userId -> timestampMs

	roomMutexes          sync.Map // roomName -> *sync.Mutex
	userMutexes          sync.Map // userId -> *sync.Mutex
	mu                   sync.RWMutex
}

func NewHub(
	db *database.DB,
	matchmaking *matchmaking.Engine,
	livekit *livekit.Client,
	pubsub *PubSubClient,
	botToken, lkHost, lkKey, lkSecret string,
	adminTelegramIDs []string,
) *Hub {
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
	}
}

func (h *Hub) getRoomMutex(roomName string) *sync.Mutex {
	v, _ := h.roomMutexes.LoadOrStore(roomName, &sync.Mutex{})
	return v.(*sync.Mutex)
}

func (h *Hub) getUserMutex(userID string) *sync.Mutex {
	v, _ := h.userMutexes.LoadOrStore(userID, &sync.Mutex{})
	return v.(*sync.Mutex)
}

func (h *Hub) Authenticate(ctx context.Context, initData string) (*database.User, bool) {
	if initData == "" {
		return nil, false
	}

	tgUser, valid := auth.ValidateTelegramInitData(initData, h.BotToken)
	if !valid || tgUser == nil {
		return nil, false
	}

	user, err := h.DB.GetUserByTelegramID(ctx, tgUser.ID)
	if err != nil || user == nil {
		return nil, false
	}

	return user, true
}

func (h *Hub) AddSocket(socket *ClientSocket) {
	if socket.UserID == "" {
		return
	}

	h.mu.Lock()
	sockets, ok := h.userSockets[socket.UserID]
	if !ok {
		sockets = make(map[string]*ClientSocket)
		h.userSockets[socket.UserID] = sockets
	}
	sockets[socket.ID] = socket

	// Cancel disconnect grace timer if user reconnected
	graceTimer, hasGrace := h.disconnectGraceTimers[socket.UserID]
	if hasGrace && graceTimer != nil {
		graceTimer.Stop()
		delete(h.disconnectGraceTimers, socket.UserID)
	}
	h.mu.Unlock()

	if hasGrace {
		// Notify active call sessions of reconnection
		go func() {
			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
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
	go h.checkAutoReconnect(socket)
}

func (h *Hub) checkAutoReconnect(socket *ClientSocket) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
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
	elapsedSeconds := int(time.Since(activeCall.CreatedAt).Seconds())
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
	h.mu.Lock()
	if sockets, ok := h.userSockets[socket.UserID]; ok {
		delete(sockets, socket.ID)
		if len(sockets) == 0 {
			delete(h.userSockets, socket.UserID)
		}
	}

	for roomName := range socket.Rooms {
		if rSockets, ok := h.roomSockets[roomName]; ok {
			delete(rSockets, socket.ID)
			if len(rSockets) == 0 {
				delete(h.roomSockets, roomName)
			}
		}
	}
	h.mu.Unlock()

	// Trigger disconnect cleanup
	h.handleDisconnect(socket)
}

func (h *Hub) JoinRoom(socket *ClientSocket, roomName string) {
	h.mu.Lock()
	defer h.mu.Unlock()

	sockets, ok := h.roomSockets[roomName]
	if !ok {
		sockets = make(map[string]*ClientSocket)
		h.roomSockets[roomName] = sockets
	}
	sockets[socket.ID] = socket
}

func (h *Hub) LeaveRoom(socket *ClientSocket, roomName string) {
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
