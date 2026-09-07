package signaling

type PeerReadyPayload struct {
	RoomName string `json:"roomName"`
}

type CallStartedEvent struct {
	StartedAt       int64 `json:"startedAt"`
	DurationSeconds int   `json:"durationSeconds"`
	ExpiresAt       int64 `json:"expiresAt"`
}

type ToggleRecordPayload struct {
	RoomName  string `json:"roomName"`
	Record    bool   `json:"record"`
	RequestID string `json:"requestId,omitempty"`
}

type FinishCallPayload struct {
	RoomName  string `json:"roomName"`
	Reason    string `json:"reason,omitempty"`
	UserID    string `json:"userId,omitempty"`
	RequestID string `json:"requestId,omitempty"`
}

type WebRTCSignalPayload struct {
	RoomName  string      `json:"roomName"`
	Candidate interface{} `json:"candidate,omitempty"`
	SDP       interface{} `json:"sdp,omitempty"`
	SenderID  string      `json:"senderId,omitempty"`
	TraceID   string      `json:"traceId,omitempty"`
	RequestID string      `json:"requestId,omitempty"`
}

type MatchFoundEvent struct {
	RoomName           string  `json:"roomName"`
	PartnerID          string  `json:"partnerId"`
	PartnerAlias       string  `json:"partnerAlias"`
	PartnerBand        float64 `json:"partnerBand"`
	Token              string  `json:"token"`
	LivekitToken       string  `json:"livekitToken"`
	LivekitURL         string  `json:"livekitUrl"`
	CallDurationLimit  int     `json:"callDurationLimit"`
	MaxDurationSeconds int     `json:"maxDurationSeconds"`
}

type CallFinishedEvent struct {
	Duration int    `json:"duration"`
	Reason   string `json:"reason,omitempty"`
}

type PartnerConnectionLostEvent struct {
	UserID         string `json:"userId,omitempty"`
	GracePeriodSec int    `json:"gracePeriodSec"`
}

type PartnerReconnectedEvent struct {
	UserID        string `json:"userId,omitempty"`
	ReconnectedAt string `json:"reconnectedAt"`
}

type SocketErrorEvent struct {
	Code              string `json:"code,omitempty"`
	Message           string `json:"message"`
	RetryAfterSeconds int    `json:"retryAfterSeconds,omitempty"`
}

type RecordStatusEvent struct {
	Record bool `json:"record"`
}

type RecordingErrorEvent struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

type QueueJoinedEvent struct {
	Status string `json:"status"`
}

type QueueCancelledEvent struct {
	Success bool `json:"success"`
}

type CallFinishedPubSubMessage struct {
	Type            string  `json:"type"` // "CALL_FINISHED"
	SessionID       string  `json:"sessionId"`
	RoomName        string  `json:"roomName"`
	UserAID         string  `json:"userAId"`
	UserBID         string  `json:"userBId"`
	UserATelegramID string  `json:"userATelegramId"`
	UserBTelegramID string  `json:"userBTelegramId"`
	UserAAlias      string  `json:"userAAlias"`
	UserBAlias      string  `json:"userBAlias"`
	DurationSeconds int     `json:"durationSeconds"`
	RecordingURL    *string `json:"recordingUrl,omitempty"`
	RetentionDaysA  *int    `json:"retentionDaysA,omitempty"`
	RetentionDaysB  *int    `json:"retentionDaysB,omitempty"`
	Reason          string  `json:"reason,omitempty"`
	RequesterID     string  `json:"requesterId,omitempty"`
	DeniedUserID    string  `json:"deniedUserId,omitempty"`
}

type CommandPubSubMessage struct {
	Command         string `json:"command"` // "SCHEDULE_CALL_TEARDOWN"
	RoomName        string `json:"roomName"`
	DurationSeconds int    `json:"durationSeconds"`
}
