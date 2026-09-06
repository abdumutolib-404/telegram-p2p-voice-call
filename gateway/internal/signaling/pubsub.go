package signaling

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/redis/go-redis/v9"
)

const (
	EventsChannel   = "pairtalk:events"
	CommandsChannel = "pairtalk:commands"
)

type PubSubClient struct {
	rdb *redis.Client
}

func NewPubSubClient(rdb *redis.Client) *PubSubClient {
	return &PubSubClient{rdb: rdb}
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

	pubsub := p.rdb.Subscribe(ctx, CommandsChannel)
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
				var cmd CommandPubSubMessage
				if err := json.Unmarshal([]byte(msg.Payload), &cmd); err != nil {
					continue
				}

				if cmd.Command == "SCHEDULE_CALL_TEARDOWN" && cmd.RoomName != "" && cmd.DurationSeconds > 0 {
					hub.ScheduleAuthoritativeSessionTeardown(cmd.RoomName, cmd.DurationSeconds)
					fmt.Printf("[PubSub] Scheduled authoritative teardown for room %s (%ds)\n", cmd.RoomName, cmd.DurationSeconds)
				}
			}
		}
	}()
}
