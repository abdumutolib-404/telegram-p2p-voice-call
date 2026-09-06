package livekit

import (
	"context"
	"time"

	"github.com/livekit/protocol/livekit"
	lksdk "github.com/livekit/server-sdk-go/v2"
)

type Client struct {
	roomClient   *lksdk.RoomServiceClient
	egressClient *lksdk.EgressClient
	host         string
	s3Key        string
	s3Secret     string
	s3Bucket     string
	s3Region     string
	s3Endpoint   string
	s3ForcePath  bool
	recordingsDir string
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
