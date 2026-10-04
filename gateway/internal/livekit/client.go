package livekit

import (
	"context"
	"errors"
	"time"

	"github.com/livekit/protocol/livekit"
	lksdk "github.com/livekit/server-sdk-go/v2"
	"github.com/twitchtv/twirp"
)

type Client struct {
	roomClient    *lksdk.RoomServiceClient
	egressClient  *lksdk.EgressClient
	host          string
	s3Key         string
	s3Secret      string
	s3Bucket      string
	s3Region      string
	s3Endpoint    string
	s3ForcePath   bool
	recordingsDir string
}

// Local gateway sockets cannot prove a shared room is empty. Query LiveKit and
// distinguish a missing room from an unavailable provider before cleanup.
func (c *Client) ParticipantsPresent(ctx context.Context, roomName string, userIDs ...string) (bool, error) {
	count, err := c.ConnectedParticipants(ctx, roomName, userIDs...)
	return count > 0, err
}

func (c *Client) ConnectedParticipants(ctx context.Context, roomName string, userIDs ...string) (int, error) {
	if c == nil || c.roomClient == nil {
		return 0, errors.New("room presence is unavailable")
	}
	requestCtx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()
	response, err := c.roomClient.ListParticipants(requestCtx, &livekit.ListParticipantsRequest{Room: roomName})
	if err != nil {
		var rpcError twirp.Error
		if errors.As(err, &rpcError) && rpcError.Code() == twirp.NotFound {
			return 0, nil
		}
		return 0, errors.New("room presence could not be verified")
	}
	present := make(map[string]bool)
	for _, participant := range response.Participants {
		for _, id := range userIDs {
			if participant.Identity == id {
				present[id] = true
			}
		}
	}
	return len(present), nil
}

func NewClient(
	host, apiKey, apiSecret, s3Key, s3Secret, s3Bucket, s3Region, s3Endpoint string,
	s3ForcePath bool, recordingsDir string,
) *Client {
	var roomCli *lksdk.RoomServiceClient
	var egressCli *lksdk.EgressClient

	if host != "" && apiKey != "" && apiSecret != "" {
		roomCli = lksdk.NewRoomServiceClient(host, apiKey, apiSecret)
		egressCli = lksdk.NewEgressClient(host, apiKey, apiSecret)
	}

	return &Client{
		roomClient:    roomCli,
		egressClient:  egressCli,
		host:          host,
		s3Key:         s3Key,
		s3Secret:      s3Secret,
		s3Bucket:      s3Bucket,
		s3Region:      s3Region,
		s3Endpoint:    s3Endpoint,
		s3ForcePath:   s3ForcePath,
		recordingsDir: recordingsDir,
	}
}

func (c *Client) DeleteRoom(ctx context.Context, roomName string) error {
	if roomName == "" || c.roomClient == nil {
		return nil
	}

	timeoutCtx, cancel := context.WithTimeout(ctx, 1500*time.Millisecond)
	defer cancel()

	_, err := c.roomClient.DeleteRoom(timeoutCtx, &livekit.DeleteRoomRequest{
		Room: roomName,
	})
	if err != nil {
		// Room may already have ended or been closed
		return nil
	}
	return nil
}
