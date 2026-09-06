package livekit

import (
	"errors"
	"time"

	"github.com/livekit/protocol/auth"
)

func GenerateLiveKitToken(
	apiKey, apiSecret, roomName, participantIdentity, participantName string,
	ttlSeconds int,
) (string, error) {
	if roomName == "" || len(roomName) > 128 {
		return "", errors.New("invalid roomName")
	}
	if participantIdentity == "" || len(participantIdentity) > 128 {
		return "", errors.New("invalid participantIdentity")
	}
	if participantName == "" || len(participantName) > 128 {
		return "", errors.New("invalid participantName")
	}
	if ttlSeconds < 60 || ttlSeconds > 7200 {
		return "", errors.New("invalid token TTL")
	}

	at := auth.NewAccessToken(apiKey, apiSecret)
	at.SetIdentity(participantIdentity)
	at.SetName(participantName)
	at.SetValidFor(time.Duration(ttlSeconds) * time.Second)

	grant := &auth.VideoGrant{
		RoomJoin:     true,
		Room:         roomName,
		CanPublish:   boolPtr(true),
		CanSubscribe: boolPtr(true),
	}
	at.AddGrant(grant)

	return at.ToJWT()
}

func boolPtr(b bool) *bool {
	return &b
}
