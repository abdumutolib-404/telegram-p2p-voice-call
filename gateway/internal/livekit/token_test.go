package livekit

import (
	"testing"

	"github.com/livekit/protocol/auth"
)

func TestGenerateLiveKitToken(t *testing.T) {
	apiKey := "devkey"
	apiSecret := "secret123456789012345678901234567890"
	roomName := "room_test_123"
	identity := "user_456"
	name := "Alice"
	ttl := 1200

	t.Run("Valid token generation and claims", func(t *testing.T) {
		token, err := GenerateLiveKitToken(apiKey, apiSecret, roomName, identity, name, ttl)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if token == "" {
			t.Fatalf("expected non-empty token")
		}

		// Verify token claims using protocol/auth.ParseAPIToken
		verifier, err := auth.ParseAPIToken(token)
		if err != nil {
			t.Fatalf("failed to parse token: %v", err)
		}
		regClaims, grants, err := verifier.Verify(apiSecret)
		if err != nil {
			t.Fatalf("failed to verify token signature: %v", err)
		}

		if regClaims.Subject != identity {
			t.Errorf("expected identity %s, got %s", identity, regClaims.Subject)
		}
		if grants.Name != name {
			t.Errorf("expected name %s, got %s", name, grants.Name)
		}
		if grants.Video == nil {
			t.Fatalf("expected Video grant to be present")
		}
		if !grants.Video.RoomJoin || grants.Video.Room != roomName {
			t.Errorf("expected room %s with join permission, got %v", roomName, grants.Video)
		}
		if grants.Video.CanPublish == nil || !*grants.Video.CanPublish {
			t.Errorf("expected canPublish true")
		}
		if grants.Video.CanSubscribe == nil || !*grants.Video.CanSubscribe {
			t.Errorf("expected canSubscribe true")
		}
	})

	t.Run("Invalid inputs", func(t *testing.T) {
		_, err := GenerateLiveKitToken(apiKey, apiSecret, "", identity, name, ttl)
		if err == nil {
			t.Errorf("expected error for empty roomName")
		}

		_, err = GenerateLiveKitToken(apiKey, apiSecret, roomName, "", name, ttl)
		if err == nil {
			t.Errorf("expected error for empty identity")
		}

		_, err = GenerateLiveKitToken(apiKey, apiSecret, roomName, identity, "", ttl)
		if err == nil {
			t.Errorf("expected error for empty name")
		}

		_, err = GenerateLiveKitToken(apiKey, apiSecret, roomName, identity, name, 30)
		if err == nil {
			t.Errorf("expected error for ttl < 60")
		}

		_, err = GenerateLiveKitToken(apiKey, apiSecret, roomName, identity, name, 10000)
		if err == nil {
			t.Errorf("expected error for ttl > 7200")
		}
	})
}
