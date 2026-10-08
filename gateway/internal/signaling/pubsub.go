package signaling

import (
	"context"
	"encoding/json"
	"fmt"
	"github.com/google/uuid"
	"time"

	"github.com/redis/go-redis/v9"
)

const (
	EventsChannel   = "pairtalk:events"
	CommandsChannel = "pairtalk:commands"
)

type PubSubClient struct {
	rdb             *redis.Client
	recordingSource string
}

func NewPubSubClient(rdb *redis.Client) *PubSubClient {
	return &PubSubClient{rdb: rdb, recordingSource: uuid.NewString()}
}

func (p *PubSubClient) PublishCallFinished(ctx context.Context, msg CallFinishedPubSubMessage) error {
	if p == nil || p.rdb == nil {
		return nil
	}
	data, err := json.Marshal(msg)
	if err != nil {
		return err
	}
	return p.rdb.Publish(ctx, EventsChannel, string(data)).Err()
}

func (p *PubSubClient) StartCommandSubscriber(ctx context.Context, hub *Hub) {
	if p == nil || p.rdb == nil {
		return
	}

	pubsub := p.rdb.Subscribe(ctx, CommandsChannel, RecordingStateChannel, EventsChannel)
	go hub.refreshSharedPresence()
	go func() {
		defer pubsub.Close()
		ch := pubsub.Channel()
		for {
			select {
			case <-ctx.Done():
				return
			case msg, ok := <-ch:
				if !ok {
					return
				}
				if msg.Channel == EventsChannel {
					if hub.DB == nil {
						continue
					}
					var event CallFinishedPubSubMessage
					if json.Unmarshal([]byte(msg.Payload), &event) == nil && event.Type == "CALL_FINISHED" && event.RoomName != "" && len(event.RoomName) <= 128 {
						lookup, cancel := context.WithTimeout(ctx, 5*time.Second)
						call, err := hub.DB.GetCallSessionByRoomName(lookup, event.RoomName)
						if err == nil && call != nil && call.ID == event.SessionID && call.Status != "ACTIVE" && call.Status != "PENDING" {
							lock := hub.getRoomMutex(event.RoomName)
							lock.Lock()
							hub.finishKnownTerminal(call)
							lock.Unlock()
						}
						cancel()
					}
					continue
				}
				var cmd CommandPubSubMessage
				if msg.Channel == RecordingStateChannel {
					var state RoomRecordingStatus
					if json.Unmarshal([]byte(msg.Payload), &state) == nil && state.Source != p.recordingSource && state.RoomName != "" && len(state.RoomName) <= 128 && (state.State == "on" || state.State == "off" || state.State == "unknown") {
						hub.EmitToRoom(state.RoomName, "room_recording_status", state)
					}
					continue
				}
				if err := json.Unmarshal([]byte(msg.Payload), &cmd); err != nil {
					continue
				}
				if cmd.Command == "MATCH_READY" && cmd.Source != p.recordingSource && cmd.RoomName != "" && len(cmd.RoomName) <= 128 {
					lookup, cancel := context.WithTimeout(ctx, 5*time.Second)
					call, err := hub.DB.GetCallSessionByRoomName(lookup, cmd.RoomName)
					cancel()
					if err == nil && call != nil && call.Status == "ACTIVE" {
						for _, id := range []string{call.UserAID, call.UserBID} {
							for _, socket := range hub.GetUserSockets(id) {
								hub.checkAutoReconnect(socket)
							}
						}
					}
					continue
				}

				if cmd.Command == "SCHEDULE_CALL_TEARDOWN" && cmd.RoomName != "" && cmd.DurationSeconds > 0 {
					hub.ScheduleAuthoritativeSessionTeardown(cmd.RoomName, cmd.DurationSeconds)
					fmt.Printf("[PubSub] Scheduled authoritative teardown for room %s (%ds)\n", cmd.RoomName, cmd.DurationSeconds)
				} else if cmd.Command == "SCHEDULE_HANDSHAKE_TIMER" && cmd.RoomName != "" {
					if cmd.DurationSeconds > 0 {
						hub.SetRoomDurationLimit(cmd.RoomName, cmd.DurationSeconds)
					}
					hub.ScheduleConnectionHandshakeTimer(cmd.RoomName, 90)
					fmt.Printf("[PubSub] Scheduled connection handshake timer for room %s\n", cmd.RoomName)
				}
			}
		}
	}()
}
