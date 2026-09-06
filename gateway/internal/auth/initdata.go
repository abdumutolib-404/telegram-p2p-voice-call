package auth

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/url"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"
)

type TelegramUser struct {
	ID               int64   `json:"id"`
	FirstName        *string `json:"first_name,omitempty"`
	LastName         *string `json:"last_name,omitempty"`
	Username         *string `json:"username,omitempty"`
	LanguageCode     *string `json:"language_code,omitempty"`
	IsPremium        *bool   `json:"is_premium,omitempty"`
	AllowsWriteToPm  *bool   `json:"allows_write_to_pm,omitempty"`
}

const (
	maxAgeSeconds    = 24 * 60 * 60 // 86400s
	maxFutureSeconds = 60           // 60s
)

var (
	hexHashPattern = regexp.MustCompile(`^[a-fA-F0-9]{64}$`)
	digitsPattern  = regexp.MustCompile(`^\d+$`)
	idMatchPattern = regexp.MustCompile(`"id"\s*:\s*"?(\d+)"?`)
)

func parseTelegramUser(raw string) *TelegramUser {
	if raw == "" {
		return nil
	}

	idMatch := idMatchPattern.FindStringSubmatch(raw)
	if len(idMatch) < 2 {
		return nil
	}
	idText := idMatch[1]
	if idText == "0" {
		return nil
	}

	idVal, err := strconv.ParseInt(idText, 10, 64)
	if err != nil {
		return nil
	}

	var rawMap map[string]interface{}
	if err := json.Unmarshal([]byte(raw), &rawMap); err != nil {
		return nil
	}

	user := &TelegramUser{ID: idVal}

	if fn, ok := rawMap["first_name"].(string); ok {
		user.FirstName = &fn
	}
	if ln, ok := rawMap["last_name"].(string); ok {
		user.LastName = &ln
	}
	if un, ok := rawMap["username"].(string); ok {
		user.Username = &un
	}
	if lc, ok := rawMap["language_code"].(string); ok {
		user.LanguageCode = &lc
	}
	if ip, ok := rawMap["is_premium"].(bool); ok {
		user.IsPremium = &ip
	}
	if aw, ok := rawMap["allows_write_to_pm"].(bool); ok {
		user.AllowsWriteToPm = &aw
	}

	return user
}

// ValidateTelegramInitData validates Telegram WebApp initData using Telegram's documented HMAC-SHA256 scheme.
// Matches server/src/middleware/initDataLockdown.ts 1-to-1.
func ValidateTelegramInitData(initData, botToken string) (*TelegramUser, bool) {
	if initData == "" || botToken == "" {
		return nil, false
	}

	values, err := url.ParseQuery(initData)
	if err != nil {
		return nil, false
	}

	hash := values.Get("hash")
	authDateRaw := values.Get("auth_date")

	if hash == "" || !hexHashPattern.MatchString(hash) || authDateRaw == "" || !digitsPattern.MatchString(authDateRaw) {
		return nil, false
	}

	authDate, err := strconv.ParseInt(authDateRaw, 10, 64)
	if err != nil {
		return nil, false
	}

	now := time.Now().Unix()
	if now-authDate > maxAgeSeconds || authDate-now > maxFutureSeconds {
		return nil, false
	}

	// Delete hash and sort remaining keys alphabetically
	values.Del("hash")
	keys := make([]string, 0, len(values))
	for k := range values {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	var dataCheckPairs []string
	for _, k := range keys {
		// Use values.Get(k) which returns first value matching URLSearchParams behavior
		dataCheckPairs = append(dataCheckPairs, k+"="+values.Get(k))
	}
	dataCheckString := strings.Join(dataCheckPairs, "\n")

	// secretKey = HMAC-SHA256("WebAppData", botToken)
	macSecret := hmac.New(sha256.New, []byte("WebAppData"))
	macSecret.Write([]byte(botToken))
	secretKey := macSecret.Sum(nil)

	// expectedHash = HMAC-SHA256(secretKey, dataCheckString)
	macExpected := hmac.New(sha256.New, secretKey)
	macExpected.Write([]byte(dataCheckString))
	expectedHash := macExpected.Sum(nil)

	providedHash, err := hex.DecodeString(hash)
	if err != nil || len(expectedHash) != len(providedHash) {
		return nil, false
	}

	if !hmac.Equal(expectedHash, providedHash) {
		return nil, false
	}

	userRaw := values.Get("user")
	user := parseTelegramUser(userRaw)
	if user == nil {
		return nil, false
	}

	return user, true
}
