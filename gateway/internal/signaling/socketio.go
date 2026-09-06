package signaling

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024 * 32,
	WriteBufferSize: 1024 * 32,
	CheckOrigin: func(r *http.Request) bool {
		return true // Origin filtering is handled upstream or in CORS
	},
}

type ClientSocket struct {
	ID           string
	UserID       string
	TelegramID   string
	TraceID      string
	Hub          *Hub
	Conn         *websocket.Conn
	Rooms        map[string]bool
	PollingQueue chan string
	SendChan     chan string
	IsWebSocket  bool
	Closed       bool
	LastActive   time.Time
	mu           sync.Mutex
}

func (s *ClientSocket) Emit(event string, payload interface{}) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.Closed {
		return
	}

	data, err := json.Marshal(payload)
	if err != nil {
		return
	}

	packet := fmt.Sprintf("42[\"%s\",%s]", event, string(data))

	if s.IsWebSocket {
		select {
		case s.SendChan <- packet:
		default:
		}
	} else {
		select {
		case s.PollingQueue <- packet:
		default:
		}
	}
}

func (s *ClientSocket) Join(roomName string) {
	s.mu.Lock()
	s.Rooms[roomName] = true
	s.mu.Unlock()

	s.Hub.JoinRoom(s, roomName)
}

func (s *ClientSocket) Leave(roomName string) {
	s.mu.Lock()
	delete(s.Rooms, roomName)
	s.mu.Unlock()

	s.Hub.LeaveRoom(s, roomName)
}

func (s *ClientSocket) Disconnect() {
	s.mu.Lock()
	if s.Closed {
		s.mu.Unlock()
		return
	}
	s.Closed = true
	if s.Conn != nil {
		_ = s.Conn.Close()
	}
	s.mu.Unlock()

	s.Hub.RemoveSocket(s)
}

// ParseSocketIOPacket parses Socket.IO v4 packets:
// "42["event", payload]"
func ParseSocketIOPacket(msg string) (event string, payload []byte, err error) {
	if strings.HasPrefix(msg, "42") {
		content := msg[2:]
		var rawList []json.RawMessage
		if err := json.Unmarshal([]byte(content), &rawList); err != nil {
			return "", nil, err
		}
		if len(rawList) < 1 {
			return "", nil, errors.New("empty socket.io payload")
		}

		var evtName string
		if err := json.Unmarshal(rawList[0], &evtName); err != nil {
			return "", nil, err
		}

		if len(rawList) >= 2 {
			return evtName, []byte(rawList[1]), nil
		}
		return evtName, nil, nil
	}
	return "", nil, fmt.Errorf("unsupported packet format: %s", msg)
}

// EngineIOSession holds state for long-polling fallback
type EngineIOSession struct {
	Socket    *ClientSocket
	CreatedAt time.Time
}

type SocketIOServer struct {
	Hub      *Hub
	sessions map[string]*EngineIOSession
	mu       sync.RWMutex
}

func NewSocketIOServer(hub *Hub) *SocketIOServer {
	s := &SocketIOServer{
		Hub:      hub,
		sessions: make(map[string]*EngineIOSession),
	}

	// Periodic session cleaner for abandoned polling sessions
	go func() {
		ticker := time.NewTicker(1 * time.Minute)
		defer ticker.Stop()
		for range ticker.C {
			s.mu.Lock()
			now := time.Now()
			for sid, sess := range s.sessions {
				if now.Sub(sess.Socket.LastActive) > 2*time.Minute && !sess.Socket.IsWebSocket {
					sess.Socket.Disconnect()
					delete(s.sessions, sid)
				}
			}
			s.mu.Unlock()
		}
	}()

	return s
}

func (s *SocketIOServer) HandleRequest(c *gin.Context) {
	transport := c.Query("transport")
	sid := c.Query("sid")

	if transport == "websocket" {
		s.handleWebSocket(c, sid)
		return
	}

	// Polling fallback
	if c.Request.Method == http.MethodGet {
		s.handlePollingGet(c, sid)
	} else if c.Request.Method == http.MethodPost {
		s.handlePollingPost(c, sid)
	} else {
		c.Status(http.StatusMethodNotAllowed)
	}
}

func (s *SocketIOServer) handleWebSocket(c *gin.Context, sid string) {
	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		return
	}

	var socket *ClientSocket

	if sid != "" {
		s.mu.Lock()
		sess, ok := s.sessions[sid]
		if ok {
			socket = sess.Socket
			socket.Conn = conn
			socket.IsWebSocket = true
		}
		s.mu.Unlock()
	}

	if socket == nil {
		// New direct websocket connection
		traceID := c.GetHeader("x-trace-id")
		if traceID == "" {
			traceID = c.GetHeader("x-request-id")
		}
		if traceID == "" {
			traceID = uuid.NewString()
		}

		initData := c.GetHeader("x-telegram-init-data")
		token := c.Query("token")
		if initData == "" && token != "" {
			initData = token
		}

		user, valid := s.Hub.Authenticate(c.Request.Context(), initData)
		if !valid || user == nil {
			_ = conn.WriteMessage(websocket.TextMessage, []byte(`0{"sid":"`+uuid.NewString()+`","upgrades":[],"pingInterval":25000,"pingTimeout":20000}`))
			_ = conn.WriteMessage(websocket.TextMessage, []byte(`44{"message":"Authentication failed: Invalid initData signature."}`))
			_ = conn.Close()
			return
		}

		newSID := uuid.NewString()
		socket = &ClientSocket{
			ID:           newSID,
			UserID:       user.ID,
			TelegramID:   fmt.Sprintf("%d", user.TelegramID),
			TraceID:      traceID,
			Hub:          s.Hub,
			Conn:         conn,
			Rooms:        make(map[string]bool),
			SendChan:     make(chan string, 128),
			PollingQueue: make(chan string, 128),
			IsWebSocket:  true,
			LastActive:   time.Now(),
		}

		s.mu.Lock()
		s.sessions[newSID] = &EngineIOSession{Socket: socket, CreatedAt: time.Now()}
		s.mu.Unlock()

		s.Hub.AddSocket(socket)

		// Send Engine.IO Open + Socket.IO Connect
		openPacket := fmt.Sprintf(`0{"sid":"%s","upgrades":[],"pingInterval":25000,"pingTimeout":20000,"maxPayload":1000000}`, newSID)
		_ = conn.WriteMessage(websocket.TextMessage, []byte(openPacket))
		connectPacket := fmt.Sprintf(`40{"sid":"%s"}`, newSID)
		_ = conn.WriteMessage(websocket.TextMessage, []byte(connectPacket))
	} else {
		// Existing polling upgraded to websocket
		// Send 40 if needed
		connectPacket := fmt.Sprintf(`40{"sid":"%s"}`, socket.ID)
		_ = conn.WriteMessage(websocket.TextMessage, []byte(connectPacket))
	}

	// Reader and writer goroutines
	done := make(chan struct{})

	go func() {
		defer close(done)
		for {
			_, msg, err := conn.ReadMessage()
			if err != nil {
				return
			}
			socket.mu.Lock()
			socket.LastActive = time.Now()
			socket.mu.Unlock()

			s.handleRawMessage(socket, string(msg))
		}
	}()

	go func() {
		ticker := time.NewTicker(20 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-done:
				socket.Disconnect()
				return
			case pkt := <-socket.SendChan:
				_ = conn.WriteMessage(websocket.TextMessage, []byte(pkt))
			case <-ticker.C:
				_ = conn.WriteMessage(websocket.TextMessage, []byte("2")) // Engine.IO ping
			}
		}
	}()
}

func (s *SocketIOServer) handlePollingGet(c *gin.Context, sid string) {
	if sid == "" {
		// New session handshake
		traceID := c.GetHeader("x-trace-id")
		if traceID == "" {
			traceID = uuid.NewString()
		}
		newSID := uuid.NewString()

		socket := &ClientSocket{
			ID:           newSID,
			TraceID:      traceID,
			Hub:          s.Hub,
			Rooms:        make(map[string]bool),
			SendChan:     make(chan string, 128),
			PollingQueue: make(chan string, 128),
			IsWebSocket:  false,
			LastActive:   time.Now(),
		}

		s.mu.Lock()
		s.sessions[newSID] = &EngineIOSession{Socket: socket, CreatedAt: time.Now()}
		s.mu.Unlock()

		openPkt := fmt.Sprintf(`0{"sid":"%s","upgrades":["websocket"],"pingInterval":25000,"pingTimeout":20000,"maxPayload":1000000}`, newSID)
		c.Data(http.StatusOK, "text/plain; charset=UTF-8", []byte(openPkt))
		return
	}

	s.mu.RLock()
	sess, ok := s.sessions[sid]
	s.mu.RUnlock()

	if !ok {
		c.Status(http.StatusBadRequest)
		return
	}

	socket := sess.Socket
	socket.mu.Lock()
	socket.LastActive = time.Now()
	socket.mu.Unlock()

	// Wait for packets or timeout after 20s
	select {
	case pkt := <-socket.PollingQueue:
		c.Data(http.StatusOK, "text/plain; charset=UTF-8", []byte(pkt))
	case <-time.After(20 * time.Second):
		c.Data(http.StatusOK, "text/plain; charset=UTF-8", []byte("6")) // noop
	case <-c.Request.Context().Done():
	}
}

func (s *SocketIOServer) handlePollingPost(c *gin.Context, sid string) {
	s.mu.RLock()
	sess, ok := s.sessions[sid]
	s.mu.RUnlock()

	if !ok {
		c.Status(http.StatusBadRequest)
		return
	}

	socket := sess.Socket
	body, err := io.ReadAll(c.Request.Body)
	if err != nil {
		c.Status(http.StatusBadRequest)
		return
	}

	socket.mu.Lock()
	socket.LastActive = time.Now()
	socket.mu.Unlock()

	s.handleRawMessage(socket, string(body))
	c.Data(http.StatusOK, "text/plain; charset=UTF-8", []byte("ok"))
}

func (s *SocketIOServer) handleRawMessage(socket *ClientSocket, msg string) {
	// Engine.IO ping -> pong
	if msg == "2" {
		if socket.IsWebSocket && socket.Conn != nil {
			_ = socket.Conn.WriteMessage(websocket.TextMessage, []byte("3"))
		} else {
			socket.PollingQueue <- "3"
		}
		return
	}

	// WebSocket probe handshake: "2probe" -> "3probe"
	if msg == "2probe" {
		if socket.IsWebSocket && socket.Conn != nil {
			_ = socket.Conn.WriteMessage(websocket.TextMessage, []byte("3probe"))
		}
		return
	}

	// Upgrade confirmation: "5"
	if msg == "5" {
		return
	}

	// Socket.IO Connect packet: "40" or "40{...}"
	if strings.HasPrefix(msg, "40") {
		// Authenticate socket if not already authenticated
		if socket.UserID == "" {
			initData := ""
			authPayload := msg[2:]
			if strings.HasPrefix(authPayload, "{") {
				var authMap map[string]interface{}
				if err := json.Unmarshal([]byte(authPayload), &authMap); err == nil {
					if t, ok := authMap["token"].(string); ok {
						initData = t
					}
				}
			}
			user, valid := s.Hub.Authenticate(context.Background(), initData)
			if !valid || user == nil {
				socket.Emit("error", SocketErrorEvent{
					Message: "Authentication failed: Invalid initData signature.",
				})
				return
			}
			socket.UserID = user.ID
			socket.TelegramID = fmt.Sprintf("%d", user.TelegramID)
			s.Hub.AddSocket(socket)
		}

		connPkt := fmt.Sprintf(`40{"sid":"%s"}`, socket.ID)
		if socket.IsWebSocket && socket.Conn != nil {
			_ = socket.Conn.WriteMessage(websocket.TextMessage, []byte(connPkt))
		} else {
			socket.PollingQueue <- connPkt
		}
		return
	}

	// Socket.IO Event packet: "42[...]"
	if strings.HasPrefix(msg, "42") {
		evt, payload, err := ParseSocketIOPacket(msg)
		if err != nil {
			return
		}
		s.Hub.Dispatch(socket, evt, bytes.TrimSpace(payload))
	}
}
