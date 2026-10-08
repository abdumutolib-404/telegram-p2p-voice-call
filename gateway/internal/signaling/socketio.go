package signaling

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/pairtalk/gateway/internal/config"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024 * 32,
	WriteBufferSize: 1024 * 32,
}

const maxSocketPayload = 64 * 1024
const maxSocketSessions = 8192
const maxUnauthenticatedSessionsPerIP = 64
const maxActivePolls = 1024

type ClientSocket struct {
	lastSnapshotAt      time.Time
	PeerIP              string
	ID                  string
	UserID              string
	TelegramID          string
	TraceID             string
	Hub                 *Hub
	Conn                *websocket.Conn
	Rooms               map[string]bool
	PollingQueue        chan string
	SendChan            chan string
	IsWebSocket         bool
	Closed              bool
	LastActive          time.Time
	mu                  sync.Mutex
	writeMu             sync.Mutex
	messageMu           sync.Mutex
	eventQueue          chan func()
	eventsDone          chan struct{}
	disconnectScheduled bool
	done                chan struct{}
	onDisconnect        func()
	pollActive          bool
	postActive          bool
}

func (s *ClientSocket) writeTextMessage(msg string) error {
	s.writeMu.Lock()
	defer s.writeMu.Unlock()
	s.mu.Lock()
	conn := s.Conn
	closed := s.Closed
	s.mu.Unlock()
	if closed || conn == nil {
		return errors.New("socket closed or conn is nil")
	}
	_ = conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
	return conn.WriteMessage(websocket.TextMessage, []byte(msg))
}

func (s *ClientSocket) IsWS() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.IsWebSocket
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
			if !s.disconnectScheduled {
				s.disconnectScheduled = true
				go s.Disconnect()
			}
		}
	} else {
		select {
		case s.PollingQueue <- packet:
		default:
			if !s.disconnectScheduled {
				s.disconnectScheduled = true
				go s.Disconnect()
			}
		}
	}
}

func (s *ClientSocket) Join(roomName string) {
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
	if s.done != nil {
		close(s.done)
	}
	onDisconnect := s.onDisconnect
	if s.eventsDone != nil {
		close(s.eventsDone)
	}
	if s.Conn != nil {
		_ = s.Conn.Close()
	}
	s.mu.Unlock()
	if onDisconnect != nil {
		onDisconnect()
	}

	if s.Hub != nil {
		s.Hub.RemoveSocket(s)
	}
}

// One bounded worker per authenticated socket preserves mutation order. The
// hub additionally limits expensive work across all connections.
func (s *ClientSocket) enqueueEvent(event func()) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.Closed {
		return
	}
	select {
	case s.Hub.queuedEventSlots <- struct{}{}:
	default:
		if !s.disconnectScheduled {
			s.disconnectScheduled = true
			go s.Disconnect()
		}
		return
	}
	if s.eventQueue == nil {
		s.eventQueue = make(chan func(), 32)
		s.eventsDone = make(chan struct{})
		go s.runEvents()
	}
	select {
	case s.eventQueue <- event:
	default:
		// Closing a saturated client releases its queue instead of dropping a
		// mutation while allowing the client to believe it was accepted.
		<-s.Hub.queuedEventSlots
		if !s.disconnectScheduled {
			s.disconnectScheduled = true
			go s.Disconnect()
		}
	}
}

func (s *ClientSocket) runEvents() {
	defer func() {
		for {
			select {
			case <-s.eventQueue:
				<-s.Hub.queuedEventSlots
			default:
				return
			}
		}
	}()
	defer func() {
		if recover() != nil {
			log.Print("[Gateway] Socket event failed; closing session")
			s.Disconnect()
		}
	}()
	for {
		select {
		case <-s.eventsDone:
			return
		case event := <-s.eventQueue:
			select {
			case <-s.eventsDone:
				<-s.Hub.queuedEventSlots
				return
			case s.Hub.eventSlots <- struct{}{}:
			}
			func() { defer func() { <-s.Hub.eventSlots; <-s.Hub.queuedEventSlots }(); event() }()
		}
	}
}

// ParseSocketIOPacket parses Socket.IO v4 packets:
// "42["event", payload]"
func ParseSocketIOPacket(msg string) (event string, payload []byte, err error) {
	if strings.HasPrefix(msg, "42") {
		bracketIdx := strings.Index(msg, "[")
		if bracketIdx == -1 {
			return "", nil, errors.New("malformed socket.io packet: missing '['")
		}
		content := msg[bracketIdx:]
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
	PeerIP    string
}

type SocketIOServer struct {
	authSlots      chan struct{}
	authIPs        map[string]int
	handshakeSlots chan struct{}
	handshakeIPs   map[string]int
	Hub            *Hub
	sessions       map[string]*EngineIOSession
	mu             sync.RWMutex
	originAllowed  func(string) bool
	done           chan struct{}
	closeOnce      sync.Once
	closed         bool
	pollSlots      chan struct{}
}

func NewSocketIOServer(hub *Hub, originAllowed ...func(string) bool) *SocketIOServer {
	defaultConfig := &config.Config{NodeEnv: "production", AllowedOrigins: []string{"https://pairtalk.online", "https://app.pairtalk.online", "https://web.telegram.org", "https://webk.telegram.org", "https://webz.telegram.org"}}
	allow := defaultConfig.OriginAllowed
	if len(originAllowed) > 0 {
		allow = originAllowed[0]
	}
	s := &SocketIOServer{
		Hub:            hub,
		sessions:       make(map[string]*EngineIOSession),
		originAllowed:  allow,
		done:           make(chan struct{}),
		pollSlots:      make(chan struct{}, maxActivePolls),
		authSlots:      make(chan struct{}, 16),
		authIPs:        make(map[string]int),
		handshakeSlots: make(chan struct{}, 64),
		handshakeIPs:   make(map[string]int),
	}

	// Periodic session cleaner for abandoned polling sessions
	go func() {
		ticker := time.NewTicker(1 * time.Minute)
		defer ticker.Stop()
		for {
			select {
			case <-s.done:
				return
			case <-ticker.C:
			}
			var expired []*ClientSocket
			s.mu.Lock()
			now := time.Now()
			for sid, sess := range s.sessions {
				sess.Socket.mu.Lock()
				lastActive := sess.Socket.LastActive
				isWS := sess.Socket.IsWebSocket
				sess.Socket.mu.Unlock()

				if now.Sub(lastActive) > 2*time.Minute && !isWS {
					expired = append(expired, sess.Socket)
					delete(s.sessions, sid)
				}
			}
			s.mu.Unlock()
			for _, socket := range expired {
				socket.Disconnect()
			}
		}
	}()

	return s
}

func (s *SocketIOServer) addSession(socket *ClientSocket, peerIP string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closed || len(s.sessions) >= maxSocketSessions {
		return false
	}
	pending := 0
	for _, sess := range s.sessions {
		if sess.PeerIP == peerIP {
			sess.Socket.mu.Lock()
			unauthenticated := sess.Socket.UserID == ""
			sess.Socket.mu.Unlock()
			if unauthenticated {
				pending++
			}
		}
	}
	if pending >= maxUnauthenticatedSessionsPerIP {
		return false
	}
	s.sessions[socket.ID] = &EngineIOSession{Socket: socket, CreatedAt: time.Now(), PeerIP: peerIP}
	socket.mu.Lock()
	socket.PeerIP = peerIP
	socket.done = make(chan struct{})
	socket.onDisconnect = func() {
		s.mu.Lock()
		if session := s.sessions[socket.ID]; session != nil && session.Socket == socket {
			delete(s.sessions, socket.ID)
		}
		s.mu.Unlock()
	}
	socket.mu.Unlock()
	return true
}

func (s *SocketIOServer) Close() {
	s.closeOnce.Do(func() {
		close(s.done)
		s.mu.Lock()
		s.closed = true
		sockets := make([]*ClientSocket, 0, len(s.sessions))
		for _, sess := range s.sessions {
			sockets = append(sockets, sess.Socket)
		}
		s.sessions = make(map[string]*EngineIOSession)
		s.mu.Unlock()
		for _, socket := range sockets {
			socket.Disconnect()
		}
	})
}

func (s *SocketIOServer) HandleRequest(c *gin.Context) {
	origin := c.GetHeader("Origin")
	c.Header("Vary", "Origin")
	if !s.originAllowed(origin) {
		c.AbortWithStatus(http.StatusForbidden)
		return
	}
	if origin != "" {
		c.Header("Access-Control-Allow-Origin", origin)
		c.Header("Access-Control-Allow-Credentials", "true")
	}
	c.Header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
	c.Header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Telegram-Init-Data, X-Trace-Id, X-Request-Id")

	if c.Request.Method == http.MethodOptions {
		c.Status(http.StatusNoContent)
		return
	}

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
	release := func() {}
	if sid == "" {
		var ok bool
		release, ok = s.reserveIngress(c.ClientIP(), false)
		if !ok {
			c.Status(http.StatusTooManyRequests)
			return
		}
		defer release()
	}
	if sid != "" {
		s.mu.RLock()
		_, exists := s.sessions[sid]
		s.mu.RUnlock()
		if !exists {
			c.Status(http.StatusBadRequest)
			return
		}
	}
	connectionUpgrader := upgrader
	connectionUpgrader.CheckOrigin = func(r *http.Request) bool { return s.originAllowed(r.Header.Get("Origin")) }
	conn, err := connectionUpgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		return
	}

	// Configure read deadline (45s Engine.IO heartbeat window) and pong handler
	conn.SetReadLimit(maxSocketPayload)
	_ = conn.SetReadDeadline(time.Now().Add(45 * time.Second))
	conn.SetPongHandler(func(string) error {
		_ = conn.SetReadDeadline(time.Now().Add(45 * time.Second))
		return nil
	})

	var socket *ClientSocket
	sessionID := sid

	if sid != "" {
		s.mu.Lock()
		sess, ok := s.sessions[sid]
		if ok {
			socket = sess.Socket
			socket.mu.Lock()
			oldConn := socket.Conn
			socket.Conn = conn
			socket.IsWebSocket = true
			// Drain PollingQueue into SendChan
		drain:
			for {
				select {
				case pkt := <-socket.PollingQueue:
					select {
					case socket.SendChan <- pkt:
					default:
					}
				default:
					break drain
				}
			}
			socket.mu.Unlock()
			if oldConn != nil && oldConn != conn {
				_ = oldConn.Close()
			}
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

		newSID := uuid.NewString()
		sessionID = newSID
		socket = &ClientSocket{
			ID:           newSID,
			TraceID:      traceID,
			Hub:          s.Hub,
			Conn:         conn,
			Rooms:        make(map[string]bool),
			SendChan:     make(chan string, 128),
			PollingQueue: make(chan string, 128),
			IsWebSocket:  true,
			LastActive:   time.Now(),
		}

		if initData != "" {
			if user, valid := s.authenticate(c.Request.Context(), c.ClientIP(), initData); valid && user != nil {
				socket.UserID = user.ID
				socket.TelegramID = fmt.Sprintf("%d", user.TelegramID)
			}
		}

		if !s.addSession(socket, c.ClientIP()) {
			_ = conn.WriteControl(websocket.CloseMessage, websocket.FormatCloseMessage(websocket.CloseTryAgainLater, "Session limit reached"), time.Now().Add(time.Second))
			_ = conn.Close()
			return
		}

		if socket.UserID != "" {
			if !s.Hub.AddSocket(socket) {
				socket.Disconnect()
				return
			}
		}
		release()

		// Send Engine.IO Open packet
		openPacket := fmt.Sprintf(`0{"sid":"%s","upgrades":[],"pingInterval":25000,"pingTimeout":20000,"maxPayload":%d}`, newSID, maxSocketPayload)
		_ = socket.writeTextMessage(openPacket)

		// If authenticated immediately via header/query, send Socket.IO connect ACK
		if socket.UserID != "" {
			connectPacket := fmt.Sprintf(`40{"sid":"%s"}`, newSID)
			_ = socket.writeTextMessage(connectPacket)
		}
	}

	// Defer cleanup of session when connection closes to eliminate memory leak
	defer func() {
		if sessionID != "" {
			s.mu.Lock()
			if sess, ok := s.sessions[sessionID]; ok {
				sess.Socket.mu.Lock()
				isCurrent := (sess.Socket.Conn == conn)
				sess.Socket.mu.Unlock()
				if isCurrent {
					delete(s.sessions, sessionID)
				}
			}
			s.mu.Unlock()
		}
	}()

	// Reader and writer goroutines
	done := make(chan struct{})

	go func() {
		defer close(done)
		for {
			_, msg, err := conn.ReadMessage()
			if err != nil {
				return
			}
			_ = conn.SetReadDeadline(time.Now().Add(45 * time.Second))
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
				socket.mu.Lock()
				isCurrent := (socket.Conn == conn)
				socket.mu.Unlock()
				if isCurrent {
					socket.Disconnect()
				}
				return
			case pkt := <-socket.SendChan:
				if err := socket.writeTextMessage(pkt); err != nil {
					socket.mu.Lock()
					isCurrent := (socket.Conn == conn)
					socket.mu.Unlock()
					if isCurrent {
						socket.Disconnect()
					}
					return
				}
			case <-ticker.C:
				if err := socket.writeTextMessage("2"); err != nil {
					socket.mu.Lock()
					isCurrent := (socket.Conn == conn)
					socket.mu.Unlock()
					if isCurrent {
						socket.Disconnect()
					}
					return
				}
			}
		}
	}()

	<-done
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

		if !s.addSession(socket, c.ClientIP()) {
			c.Status(http.StatusTooManyRequests)
			return
		}

		openPkt := fmt.Sprintf(`0{"sid":"%s","upgrades":["websocket"],"pingInterval":25000,"pingTimeout":20000,"maxPayload":%d}`, newSID, maxSocketPayload)
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
	if socket.Closed {
		socket.mu.Unlock()
		c.Status(http.StatusBadRequest)
		return
	}
	done := socket.done
	if socket.pollActive {
		socket.mu.Unlock()
		c.Status(http.StatusTooManyRequests)
		return
	}
	select {
	case s.pollSlots <- struct{}{}:
	default:
		socket.mu.Unlock()
		c.Status(http.StatusTooManyRequests)
		return
	}
	socket.pollActive = true
	socket.LastActive = time.Now()
	socket.mu.Unlock()
	defer func() {
		socket.mu.Lock()
		socket.pollActive = false
		socket.mu.Unlock()
		<-s.pollSlots
	}()
	timer := time.NewTimer(20 * time.Second)
	defer timer.Stop()

	// Wait for packets or timeout after 20s
	select {
	case pkt := <-socket.PollingQueue:
		allPkts := []string{pkt}
	drain:
		for {
			select {
			case nextPkt := <-socket.PollingQueue:
				allPkts = append(allPkts, nextPkt)
			default:
				break drain
			}
		}
		c.Data(http.StatusOK, "text/plain; charset=UTF-8", []byte(strings.Join(allPkts, "\x1e")))
	case <-timer.C:
		c.Data(http.StatusOK, "text/plain; charset=UTF-8", []byte("6")) // noop
	case <-c.Request.Context().Done():
	case <-done:
		c.Data(http.StatusOK, "text/plain; charset=UTF-8", []byte("1"))
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
	socket.mu.Lock()
	if socket.Closed {
		socket.mu.Unlock()
		c.Status(http.StatusBadRequest)
		return
	}
	if socket.postActive {
		socket.mu.Unlock()
		c.Status(http.StatusTooManyRequests)
		return
	}
	select {
	case s.pollSlots <- struct{}{}:
	default:
		socket.mu.Unlock()
		c.Status(http.StatusTooManyRequests)
		return
	}
	socket.postActive = true
	socket.mu.Unlock()
	defer func() {
		socket.mu.Lock()
		socket.postActive = false
		socket.mu.Unlock()
		<-s.pollSlots
	}()
	body, err := io.ReadAll(http.MaxBytesReader(c.Writer, c.Request.Body, maxSocketPayload))
	if err != nil {
		var tooLarge *http.MaxBytesError
		if errors.As(err, &tooLarge) {
			c.Status(http.StatusRequestEntityTooLarge)
		} else {
			c.Status(http.StatusBadRequest)
		}
		return
	}

	socket.mu.Lock()
	socket.LastActive = time.Now()
	socket.mu.Unlock()

	packets := strings.Split(string(body), "\x1e")
	for _, pkt := range packets {
		if pkt != "" {
			s.handleRawMessage(socket, pkt)
		}
	}
	c.Data(http.StatusOK, "text/plain; charset=UTF-8", []byte("ok"))
}

func (s *SocketIOServer) handleRawMessage(socket *ClientSocket, msg string) {
	socket.messageMu.Lock()
	defer socket.messageMu.Unlock()
	socket.mu.Lock()
	closed := socket.Closed
	socket.mu.Unlock()
	if closed {
		return
	}
	// Engine.IO ping -> pong
	if msg == "2" {
		if socket.IsWS() {
			_ = socket.writeTextMessage("3")
		} else {
			select {
			case socket.PollingQueue <- "3":
			default:
			}
		}
		return
	}

	// Engine.IO pong
	if msg == "3" {
		return
	}

	// WebSocket probe handshake: "2probe" -> "3probe"
	if msg == "2probe" {
		if socket.IsWS() {
			_ = socket.writeTextMessage("3probe")
		}
		return
	}

	// Upgrade confirmation: "5"
	if msg == "5" {
		return
	}

	// Socket.IO Disconnect packet: "41"
	if msg == "41" || strings.HasPrefix(msg, "41") {
		socket.Disconnect()
		s.mu.Lock()
		delete(s.sessions, socket.ID)
		s.mu.Unlock()
		return
	}

	// Socket.IO Connect packet: "40" or "40{...}" or "40,{"token":"..."}"
	if strings.HasPrefix(msg, "40") {
		// Authenticate socket if not already authenticated
		if socket.UserID == "" {
			initData := ""
			idx := strings.Index(msg, "{")
			if idx != -1 {
				authPayload := msg[idx:]
				var authMap map[string]interface{}
				if err := json.Unmarshal([]byte(authPayload), &authMap); err == nil {
					if t, ok := authMap["token"].(string); ok {
						initData = t
					}
				}
			}
			user, valid := s.authenticate(s.Hub.Context(), socket.PeerIP, initData)
			if !valid || user == nil {
				errMsg := `44{"message":"Authentication failed: Invalid initData signature."}`
				if socket.IsWS() {
					_ = socket.writeTextMessage(errMsg)
					socket.Disconnect()
				} else {
					select {
					case socket.PollingQueue <- errMsg:
					default:
					}
				}
				return
			}
			socket.mu.Lock()
			socket.UserID = user.ID
			socket.TelegramID = fmt.Sprintf("%d", user.TelegramID)
			socket.mu.Unlock()
			if !s.Hub.AddSocket(socket) {
				socket.Disconnect()
				return
			}
		}

		connPkt := fmt.Sprintf(`40{"sid":"%s"}`, socket.ID)
		if socket.IsWS() {
			_ = socket.writeTextMessage(connPkt)
		} else {
			select {
			case socket.PollingQueue <- connPkt:
			default:
			}
		}
		return
	}

	// Socket.IO Event packet: "42[...]"
	if strings.HasPrefix(msg, "42") {
		if socket.UserID == "" {
			socket.Emit("error", SocketErrorEvent{
				Message: "Unauthenticated socket session.",
			})
			return
		}

		evt, payload, err := ParseSocketIOPacket(msg)
		if err != nil {
			return
		}
		s.Hub.Dispatch(socket, evt, bytes.TrimSpace(payload))
	}
}
