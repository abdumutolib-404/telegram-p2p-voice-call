package auth

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"net/url"
	"sort"
	"strings"
	"testing"
	"time"
)

func generateValidInitData(botToken, userJSON string, authDate int64) string {
	params := url.Values{}
	params.Set("auth_date", fmt.Sprintf("%d", authDate))
	params.Set("query_id", "AAG_test_query_id")
	params.Set("user", userJSON)

	// Sort keys
	var keys []string
	for k := range params {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	var pairs []string
	for _, k := range keys {
		pairs = append(pairs, k+"="+params.Get(k))
	}
	dataCheckString := strings.Join(pairs, "\n")

	macSecret := hmac.New(sha256.New, []byte("WebAppData"))
	macSecret.Write([]byte(botToken))
	secretKey := macSecret.Sum(nil)

	macExpected := hmac.New(sha256.New, secretKey)
	macExpected.Write([]byte(dataCheckString))
	hash := hex.EncodeToString(macExpected.Sum(nil))

	params.Set("hash", hash)
	return params.Encode()
}

func TestValidateTelegramInitData(t *testing.T) {
	botToken := "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
	userJSON := `{"id":987654321,"first_name":"Alice","username":"alice_tg","is_premium":true}`
	now := time.Now().Unix()

	t.Run("Valid initData signature", func(t *testing.T) {
		initData := generateValidInitData(botToken, userJSON, now)
		user, valid := ValidateTelegramInitData(initData, botToken)
		if !valid || user == nil {
			t.Fatalf("expected valid=true, got valid=%v, user=%v", valid, user)
		}
		if user.ID != 987654321 {
			t.Errorf("expected user ID 987654321, got %d", user.ID)
		}
		if user.FirstName == nil || *user.FirstName != "Alice" {
			t.Errorf("expected first_name 'Alice', got %v", user.FirstName)
		}
		if user.Username == nil || *user.Username != "alice_tg" {
			t.Errorf("expected username 'alice_tg', got %v", user.Username)
		}
		if user.IsPremium == nil || !*user.IsPremium {
			t.Errorf("expected is_premium true, got %v", user.IsPremium)
		}
	})

	t.Run("Tampered signature fails", func(t *testing.T) {
		initData := generateValidInitData(botToken, userJSON, now)
		tampered := initData + "extra=tampered"
		user, valid := ValidateTelegramInitData(tampered, botToken)
		if valid || user != nil {
			t.Fatalf("expected valid=false for tampered initData, got valid=%v", valid)
		}
	})

	t.Run("Expired initData (> 24 hours) fails", func(t *testing.T) {
		expiredDate := now - 86400 - 10
		initData := generateValidInitData(botToken, userJSON, expiredDate)
		_, valid := ValidateTelegramInitData(initData, botToken)
		if valid {
			t.Fatalf("expected valid=false for expired initData")
		}
	})

	t.Run("Future initData (> 60 seconds) fails", func(t *testing.T) {
		futureDate := now + 120
		initData := generateValidInitData(botToken, userJSON, futureDate)
		_, valid := ValidateTelegramInitData(initData, botToken)
		if valid {
			t.Fatalf("expected valid=false for future initData")
		}
	})

	t.Run("Missing hash fails", func(t *testing.T) {
		initData := "auth_date=1234567890&user=" + url.QueryEscape(userJSON)
		_, valid := ValidateTelegramInitData(initData, botToken)
		if valid {
			t.Fatalf("expected valid=false for missing hash")
		}
	})

	t.Run("Empty input fails", func(t *testing.T) {
		_, valid := ValidateTelegramInitData("", botToken)
		if valid {
			t.Fatalf("expected valid=false for empty initData")
		}
		_, valid = ValidateTelegramInitData("some_data", "")
		if valid {
			t.Fatalf("expected valid=false for empty botToken")
		}
	})

	t.Run("Invalid user ID 0 fails", func(t *testing.T) {
		badUserJSON := `{"id":0,"first_name":"Zero"}`
		initData := generateValidInitData(botToken, badUserJSON, now)
		_, valid := ValidateTelegramInitData(initData, botToken)
		if valid {
			t.Fatalf("expected valid=false for user ID 0")
		}
	})
}

func TestValidateTelegramInitData_UnicodeAndEmojis(t *testing.T) {
	botToken := "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
	userJSON := `{"id":987654321,"first_name":"Алексей 🚀","last_name":"Иванов ✨","username":"alex_tg"}`
	now := time.Now().Unix()

	initData := generateValidInitData(botToken, userJSON, now)
	user, valid := ValidateTelegramInitData(initData, botToken)
	if !valid || user == nil {
		t.Fatalf("expected valid=true for Unicode and emojis, got valid=%v", valid)
	}
	if user.FirstName == nil || *user.FirstName != "Алексей 🚀" {
		t.Errorf("expected first_name 'Алексей 🚀', got %v", user.FirstName)
	}
	if user.LastName == nil || *user.LastName != "Иванов ✨" {
		t.Errorf("expected last_name 'Иванов ✨', got %v", user.LastName)
	}
}

func TestValidateTelegramInitData_BigIntIDs(t *testing.T) {
	botToken := "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
	var bigIntID int64 = 5500000000
	userJSON := fmt.Sprintf(`{"id":%d,"first_name":"BigIntUser"}`, bigIntID)
	now := time.Now().Unix()

	initData := generateValidInitData(botToken, userJSON, now)
	user, valid := ValidateTelegramInitData(initData, botToken)
	if !valid || user == nil {
		t.Fatalf("expected valid=true for 64-bit Telegram ID, got valid=%v", valid)
	}
	if user.ID != bigIntID {
		t.Errorf("expected user ID %d, got %d", bigIntID, user.ID)
	}
}

func TestValidateTelegramInitData_UnorderedParams(t *testing.T) {
	botToken := "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
	userJSON := `{"id":123456789,"first_name":"OrderTest"}`
	now := time.Now().Unix()

	// Compute HMAC according to Telegram spec (keys sorted alphabetically: auth_date, query_id, user)
	dataCheckString := fmt.Sprintf("auth_date=%d\nquery_id=test_query\nuser=%s", now, userJSON)
	macSecret := hmac.New(sha256.New, []byte("WebAppData"))
	macSecret.Write([]byte(botToken))
	secretKey := macSecret.Sum(nil)

	macExpected := hmac.New(sha256.New, secretKey)
	macExpected.Write([]byte(dataCheckString))
	hash := hex.EncodeToString(macExpected.Sum(nil))

	// Construct raw query string in reverse / unordered sequence
	unorderedInitData := fmt.Sprintf("user=%s&hash=%s&query_id=test_query&auth_date=%d",
		url.QueryEscape(userJSON), hash, now)

	user, valid := ValidateTelegramInitData(unorderedInitData, botToken)
	if !valid || user == nil {
		t.Fatalf("expected valid=true for unordered URL parameters, got valid=%v", valid)
	}
	if user.ID != 123456789 {
		t.Errorf("expected user ID 123456789, got %d", user.ID)
	}
}
