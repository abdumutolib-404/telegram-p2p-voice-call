package database

import (
	"testing"
	"time"
)

func TestEntitlementCalculations(t *testing.T) {
	t.Run("Default Free Plan Entitlement", func(t *testing.T) {
		user := &User{
			ID:         "user-1",
			TelegramID: 1001,
			Plan:       "FREE",
		}
		ent := GetEffectiveEntitlement(user, nil)
		if ent.Plan != "FREE" {
			t.Errorf("expected plan FREE, got %s", ent.Plan)
		}
		if ent.CallLimit != 3 {
			t.Errorf("expected callLimit 3, got %d", ent.CallLimit)
		}
		if ent.MaxDurationMinutes != 15 {
			t.Errorf("expected maxDuration 15, got %d", ent.MaxDurationMinutes)
		}
		if ent.RecordingLimit != 1 {
			t.Errorf("expected recordingLimit 1, got %d", ent.RecordingLimit)
		}
		if ent.RetentionDays != 1 {
			t.Errorf("expected retentionDays 1, got %d", ent.RetentionDays)
		}
		if ent.IsAdmin {
			t.Errorf("expected non-admin")
		}
	})

	t.Run("Active Pro Plan Entitlement", func(t *testing.T) {
		future := time.Now().Add(10 * 24 * time.Hour)
		active := "ACTIVE"
		user := &User{
			ID:                    "user-2",
			TelegramID:            1002,
			Plan:                  "PRO",
			SubscriptionStatus:    &active,
			SubscriptionExpiresAt: &future,
		}
		ent := GetEffectiveEntitlement(user, nil)
		if ent.Plan != "PRO" {
			t.Errorf("expected plan PRO, got %s", ent.Plan)
		}
		if ent.CallLimit != 25 {
			t.Errorf("expected callLimit 25, got %d", ent.CallLimit)
		}
		if ent.MaxDurationMinutes != 60 {
			t.Errorf("expected maxDuration 60, got %d", ent.MaxDurationMinutes)
		}
		if ent.RecordingLimit != 7 {
			t.Errorf("expected recordingLimit 7, got %d", ent.RecordingLimit)
		}
		if ent.RetentionDays != 30 {
			t.Errorf("expected retentionDays 30, got %d", ent.RetentionDays)
		}
	})

	t.Run("Expired Pro Plan Downgrades to Free", func(t *testing.T) {
		past := time.Now().Add(-10 * 24 * time.Hour)
		expired := "EXPIRED"
		user := &User{
			ID:                    "user-3",
			TelegramID:            1003,
			Plan:                  "PRO",
			SubscriptionStatus:    &expired,
			SubscriptionExpiresAt: &past,
		}
		ent := GetEffectiveEntitlement(user, nil)
		if ent.Plan != "FREE" {
			t.Errorf("expected plan to downgrade to FREE, got %s", ent.Plan)
		}
		if ent.CallLimit != 3 {
			t.Errorf("expected callLimit 3, got %d", ent.CallLimit)
		}
	})

	t.Run("Admin Override Takes Precedence", func(t *testing.T) {
		customDuration := 5
		user := &User{
			ID:          "user-4",
			TelegramID:  1004,
			Plan:        "BOSS",
			MaxDuration: &customDuration,
		}
		ent := GetEffectiveEntitlement(user, nil)
		if ent.MaxDurationMinutes != 5 {
			t.Errorf("expected maxDuration 5, got %d", ent.MaxDurationMinutes)
		}
		if ent.Source != "ADMIN_OVERRIDE" {
			t.Errorf("expected source ADMIN_OVERRIDE, got %s", ent.Source)
		}
	})

	t.Run("Admin Telegram ID Granted Unlimited", func(t *testing.T) {
		user := &User{
			ID:         "admin-1",
			TelegramID: 999999,
			Plan:       "FREE",
		}
		ent := GetEffectiveEntitlement(user, []string{"999999"})
		if !ent.IsAdmin {
			t.Errorf("expected isAdmin true")
		}
		if ent.CallLimit != 999 {
			t.Errorf("expected callLimit 999 for admin, got %d", ent.CallLimit)
		}
	})
}

func TestCalculateEffectiveCallDuration(t *testing.T) {
	t.Run("Standard generous maximum between plans", func(t *testing.T) {
		userA := &User{ID: "A", Plan: "FREE"} // 15m
		userB := &User{ID: "B", Plan: "PRO"}  // 60m
		dur := CalculateEffectiveCallDuration(userA, userB, nil)
		if dur != 60 {
			t.Errorf("expected max(15, 60) = 60, got %d", dur)
		}
	})

	t.Run("Admin override enforces restrictive minimum", func(t *testing.T) {
		override5 := 5
		userA := &User{ID: "A", Plan: "FREE", MaxDuration: &override5} // 5m override
		userB := &User{ID: "B", Plan: "BOSS"}                         // 90m
		dur := CalculateEffectiveCallDuration(userA, userB, nil)
		if dur != 5 {
			t.Errorf("expected min(5, 90) = 5 due to admin override, got %d", dur)
		}
	})
}

func TestCalculateMixedPlanDuration(t *testing.T) {
	if dur := CalculateMixedPlanDuration("FREE", "BOSS"); dur != 90 {
		t.Errorf("expected 90, got %d", dur)
	}
	if dur := CalculateMixedPlanDuration("PLUS", "PRO"); dur != 60 {
		t.Errorf("expected 60, got %d", dur)
	}
}
