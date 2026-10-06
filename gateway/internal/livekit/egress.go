package livekit

import (
	"context"
	"crypto/sha256"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/livekit/protocol/livekit"
)

type EgressResult struct {
	EgressID    string
	RelativeURL string
}

func GenerateRecordingFileName(roomNames ...string) string {
	now := time.Now().UTC()
	roomName := ""
	if len(roomNames) > 0 {
		roomName = roomNames[0]
	}
	namespace := sha256.Sum256([]byte(roomName))
	return fmt.Sprintf("%s_%x_%s.mp3", now.Format("2006-01-02_15-04-05"), namespace[:16], uuid.NewString())
}

func (c *Client) StartAudioEgress(ctx context.Context, roomName string, prepare ...func(string) error) (*EgressResult, error) {
	if roomName == "" || len(roomName) > 128 {
		return nil, errors.New("invalid roomName")
	}
	if c.egressClient == nil {
		return nil, errors.New("livekit egress is disabled (no credentials configured)")
	}

	isLiveKitCloud := strings.Contains(c.host, ".livekit.cloud")
	hasS3 := c.s3Key != "" && c.s3Secret != "" && c.s3Bucket != ""
	if isLiveKitCloud && !hasS3 {
		return nil, errors.New("cloud recording storage is not configured (S3 credentials required for LiveKit Cloud Egress)")
	}

	fileName := GenerateRecordingFileName(roomName)
	relativeURL := fmt.Sprintf("recordings/%s", fileName)
	if len(prepare) > 0 {
		if err := prepare[0](relativeURL); err != nil {
			return nil, err
		}
	}

	var output *livekit.EncodedFileOutput
	if hasS3 {
		s3Upload := &livekit.S3Upload{
			AccessKey:      c.s3Key,
			Secret:         c.s3Secret,
			Bucket:         c.s3Bucket,
			Region:         c.s3Region,
			Endpoint:       c.s3Endpoint,
			ForcePathStyle: c.s3ForcePath,
		}
		output = &livekit.EncodedFileOutput{
			FileType:        livekit.EncodedFileType_MP3,
			Filepath:        relativeURL,
			DisableManifest: true,
			Output: &livekit.EncodedFileOutput_S3{
				S3: s3Upload,
			},
		}
	} else {
		recDir := c.recordingsDir
		if recDir == "" {
			recDir = "recordings"
		}
		_ = os.MkdirAll(recDir, 0755)
		localPath := filepath.Join(recDir, fileName)
		output = &livekit.EncodedFileOutput{
			FileType:        livekit.EncodedFileType_MP3,
			Filepath:        localPath,
			DisableManifest: true,
		}
	}

	timeoutCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	info, err := c.egressClient.StartRoomCompositeEgress(timeoutCtx, &livekit.RoomCompositeEgressRequest{
		RoomName:  roomName,
		AudioOnly: true,
		Output: &livekit.RoomCompositeEgressRequest_File{
			File: output,
		},
	})
	if err != nil {
		return nil, fmt.Errorf("start egress failed: %w", err)
	}

	return &EgressResult{
		EgressID:    info.EgressId,
		RelativeURL: relativeURL,
	}, nil
}

func (c *Client) StopAudioEgress(ctx context.Context, egressID string) error {
	if egressID == "" || c.egressClient == nil {
		return nil
	}

	timeoutCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	_, err := c.egressClient.StopEgress(timeoutCtx, &livekit.StopEgressRequest{
		EgressId: egressID,
	})
	return err
}

func (c *Client) GetAudioEgressInfo(ctx context.Context, egressID string) (*livekit.EgressInfo, error) {
	if egressID == "" || c.egressClient == nil {
		return nil, nil
	}

	timeoutCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	res, err := c.egressClient.ListEgress(timeoutCtx, &livekit.ListEgressRequest{
		EgressId: egressID,
	})
	if err != nil {
		return nil, err
	}
	if len(res.Items) > 0 {
		return res.Items[0], nil
	}
	return nil, nil
}
