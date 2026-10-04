package config

import (
	"reflect"
	"testing"
)

func TestLoadConfig_Defaults(t *testing.T) {
	// Clear relevant env vars to test defaults
	keys := []string{
		"PORT", "NODE_URL", "DATABASE_URL", "REDIS_URL", "BOT_TOKEN",
		"LIVEKIT_HOST", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET", "S3_KEY",
		"S3_SECRET", "S3_BUCKET", "S3_REGION", "S3_ENDPOINT",
		"S3_FORCE_PATH_STYLE", "ADMIN_TELEGRAM_IDS", "RECORDINGS_DIR", "NODE_ENV",
	}
	for _, k := range keys {
		t.Setenv(k, "")
	}

	cfg := LoadConfig()
	if cfg.Port != "3001" {
		t.Errorf("expected default Port 3001, got %s", cfg.Port)
	}
	if cfg.NodeURL != "http://127.0.0.1:3000" {
		t.Errorf("expected default NodeURL http://127.0.0.1:3000, got %s", cfg.NodeURL)
	}
	if cfg.RedisURL != "redis://127.0.0.1:6379" {
		t.Errorf("expected default RedisURL redis://127.0.0.1:6379, got %s", cfg.RedisURL)
	}
	if cfg.S3Region != "eu-north-1" {
		t.Errorf("expected default S3Region eu-north-1, got %s", cfg.S3Region)
	}
	if cfg.RecordingsDir != "recordings" {
		t.Errorf("expected default RecordingsDir recordings, got %s", cfg.RecordingsDir)
	}
	if cfg.NodeEnv != "development" {
		t.Errorf("expected default NodeEnv development, got %s", cfg.NodeEnv)
	}
}

func TestLoadConfig_PortSanitization(t *testing.T) {
	t.Run("Port with leading colon", func(t *testing.T) {
		t.Setenv("PORT", ":4000")
		cfg := LoadConfig()
		if cfg.Port != "4000" {
			t.Errorf("expected Port 4000, got %s", cfg.Port)
		}
	})

	t.Run("Invalid numeric port falls back to 3001", func(t *testing.T) {
		t.Setenv("PORT", "invalid_port")
		cfg := LoadConfig()
		if cfg.Port != "3001" {
			t.Errorf("expected Port fallback 3001, got %s", cfg.Port)
		}
	})
}

func TestGetBoolEnv(t *testing.T) {
	tests := []struct {
		val      string
		def      bool
		expected bool
	}{
		{"true", false, true},
		{"TRUE", false, true},
		{"1", false, true},
		{"yes", false, true},
		{"YES", false, true},
		{"false", true, false},
		{"0", true, false},
		{"no", true, false},
		{"random", false, false},
		{"random", true, false},
		{"", false, false},
		{"", true, true},
	}

	for _, tc := range tests {
		t.Setenv("TEST_BOOL_KEY", tc.val)
		res := getBoolEnv("TEST_BOOL_KEY", tc.def)
		if res != tc.expected {
			t.Errorf("getBoolEnv for %q (default %v): expected %v, got %v", tc.val, tc.def, tc.expected, res)
		}
	}
}

func TestParseStringSliceEnv(t *testing.T) {
	tests := []struct {
		val      string
		expected []string
	}{
		{"", []string{}},
		{"   ", []string{}},
		{"123,456,789", []string{"123", "456", "789"}},
		{"123 456 789", []string{"123", "456", "789"}},
		{" 123,  456 , 789 ", []string{"123", "456", "789"}},
		{"123,,456", []string{"123", "456"}},
	}

	for _, tc := range tests {
		t.Setenv("TEST_SLICE_KEY", tc.val)
		res := parseStringSliceEnv("TEST_SLICE_KEY")
		if len(res) == 0 && len(tc.expected) == 0 {
			continue
		}
		if !reflect.DeepEqual(res, tc.expected) {
			t.Errorf("parseStringSliceEnv for %q: expected %#v, got %#v", tc.val, tc.expected, res)
		}
	}
}

func TestOriginPolicy(t *testing.T) {
	cfg := &Config{NodeEnv: "production", AllowedOrigins: []string{"https://app.pairtalk.online/path", "https://web.telegram.org"}}
	for _, value := range []struct {
		origin  string
		allowed bool
	}{
		{"", true}, {"https://app.pairtalk.online", true}, {"https://web.telegram.org", true},
		{"https://app.pairtalk.online.evil.example", false}, {"https://app.pairtalk.online@evil.example", false},
		{"https://app.pairtalk.online/path", false}, {"null", false}, {"http://127.0.0.1:4173", false},
	} {
		if cfg.OriginAllowed(value.origin) != value.allowed {
			t.Errorf("origin policy mismatch for %q", value.origin)
		}
	}
	cfg.NodeEnv = "development"
	if !cfg.OriginAllowed("http://127.0.0.1:4173") || cfg.OriginAllowed("http://127.0.0.1.evil.example:4173") {
		t.Fatal("development loopback policy failed")
	}
}
