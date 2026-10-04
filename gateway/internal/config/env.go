package config

import (
	"log"
	"net/url"
	"os"
	"strconv"
	"strings"

	"github.com/joho/godotenv"
)

type Config struct {
	Port              string
	NodeURL           string
	DatabaseURL       string
	RedisURL          string
	BotToken          string
	LiveKitHost       string
	LiveKitAPIKey     string
	LiveKitAPISecret  string
	S3Key             string
	S3Secret          string
	S3Bucket          string
	S3Region          string
	S3Endpoint        string
	S3ForcePathStyle  bool
	AdminTelegramIDs  []string
	RecordingsDir     string
	NodeEnv           string
	AllowedOrigins    []string
	TrustedProxyCIDRs []string
}

func getEnv(key, defaultVal string) string {
	if val, ok := os.LookupEnv(key); ok && val != "" {
		return val
	}
	return defaultVal
}

func getBoolEnv(key string, defaultVal bool) bool {
	if val, ok := os.LookupEnv(key); ok && val != "" {
		lower := strings.ToLower(val)
		return lower == "true" || lower == "1" || lower == "yes"
	}
	return defaultVal
}

func parseStringSliceEnv(key string) []string {
	val, ok := os.LookupEnv(key)
	if !ok || strings.TrimSpace(val) == "" {
		return []string{}
	}
	raw := strings.ReplaceAll(val, " ", ",")
	parts := strings.Split(raw, ",")
	var result []string
	for _, p := range parts {
		trimmed := strings.TrimSpace(p)
		if trimmed != "" {
			result = append(result, trimmed)
		}
	}
	return result
}

func LoadConfig() *Config {
	// Try loading from .env in current dir, then from ../server/.env
	_ = godotenv.Load(".env")
	_ = godotenv.Load("../server/.env")

	port := getEnv("PORT", "3001")
	nodeURL := getEnv("NODE_URL", "http://127.0.0.1:3000")
	dbURL := getEnv("DATABASE_URL", "postgresql://postgres:postgres@127.0.0.1:5432/pairtalk?sslmode=disable")
	redisURL := getEnv("REDIS_URL", "redis://127.0.0.1:6379")
	botToken := getEnv("BOT_TOKEN", "")
	lkHost := getEnv("LIVEKIT_HOST", getEnv("LIVEKIT_URL", ""))
	lkKey := getEnv("LIVEKIT_API_KEY", "")
	lkSecret := getEnv("LIVEKIT_API_SECRET", "")
	s3Key := getEnv("S3_KEY", "")
	s3Secret := getEnv("S3_SECRET", "")
	s3Bucket := getEnv("S3_BUCKET", "")
	s3Region := getEnv("S3_REGION", "eu-north-1")
	s3Endpoint := getEnv("S3_ENDPOINT", "")
	s3ForcePathStyle := getBoolEnv("S3_FORCE_PATH_STYLE", false)
	adminTelegramIDs := parseStringSliceEnv("ADMIN_TELEGRAM_IDS")
	recordingsDir := getEnv("RECORDINGS_DIR", "recordings")
	nodeEnv := getEnv("NODE_ENV", "development")

	// Ensure port is properly formatted (e.g. without leading colon if provided as numeric)
	port = strings.TrimPrefix(port, ":")
	portNumber, portError := strconv.Atoi(port)
	if portError != nil || portNumber < 1 || portNumber > 65535 {
		if nodeEnv == "production" {
			log.Fatal("[Gateway] Production error: PORT must be between 1 and 65535")
		}
		port = "3001"
	}

	if nodeEnv == "production" {
		if os.Getenv("DATABASE_URL") == "" || os.Getenv("REDIS_URL") == "" {
			log.Fatal("[Gateway] Production error: DATABASE_URL and REDIS_URL are required")
		}
		if botToken == "" {
			log.Fatal("[Gateway] Production error: BOT_TOKEN is required in production")
		}
		if lkHost == "" {
			log.Fatal("[Gateway] Production error: LIVEKIT_HOST is required")
		}
		if lkKey == "" || lkSecret == "" || lkKey == "devkey" || lkSecret == "secret" {
			log.Fatal("[Gateway] Production error: LIVEKIT_API_KEY and LIVEKIT_API_SECRET are required in production")
		}
	}

	origins := append(parseStringSliceEnv("ALLOWED_ORIGINS"),
		getEnv("MINI_APP_URL", ""), getEnv("ADMIN_PANEL_URL", ""),
		"https://pairtalk.online", "https://app.pairtalk.online", "https://admin.pairtalk.online",
		"https://web.telegram.org", "https://webk.telegram.org", "https://webz.telegram.org")
	trusted := parseStringSliceEnv("TRUSTED_PROXY_CIDRS")
	if len(trusted) == 0 {
		trusted = []string{"127.0.0.0/8", "::1/128"}
	}
	return &Config{
		Port:              port,
		NodeURL:           nodeURL,
		DatabaseURL:       dbURL,
		RedisURL:          redisURL,
		BotToken:          botToken,
		LiveKitHost:       lkHost,
		LiveKitAPIKey:     lkKey,
		LiveKitAPISecret:  lkSecret,
		S3Key:             s3Key,
		S3Secret:          s3Secret,
		S3Bucket:          s3Bucket,
		S3Region:          s3Region,
		S3Endpoint:        s3Endpoint,
		S3ForcePathStyle:  s3ForcePathStyle,
		AdminTelegramIDs:  adminTelegramIDs,
		RecordingsDir:     recordingsDir,
		NodeEnv:           nodeEnv,
		AllowedOrigins:    origins,
		TrustedProxyCIDRs: trusted,
	}
}

// Browsers send an origin, not an arbitrary URL. Normalize configured app URLs
// but reject malformed incoming origins and allow development loopback only.
func (c *Config) OriginAllowed(origin string) bool {
	if origin == "" {
		return true
	}
	u, err := url.Parse(origin)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" || u.User != nil || u.RawQuery != "" || u.Fragment != "" || u.Path != "" {
		return false
	}
	for _, configured := range c.AllowedOrigins {
		v, err := url.Parse(configured)
		if err == nil && v.User == nil && v.Scheme == u.Scheme && strings.EqualFold(v.Host, u.Host) {
			return true
		}
	}
	return c.NodeEnv != "production" && (u.Hostname() == "localhost" || u.Hostname() == "127.0.0.1" || u.Hostname() == "::1")
}
