package database

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"sync/atomic"
	"time"

	"github.com/jackc/pgx/v5"
)

type planSnapshot map[string]PlanConfig

var configuredPlans atomic.Pointer[planSnapshot]

func currentPlans() map[string]PlanConfig {
	if snapshot := configuredPlans.Load(); snapshot != nil {
		return *snapshot
	}
	return DefaultPlans
}

func parsePlanConfiguration(data string) (planSnapshot, error) {
	var values map[string]struct {
		Name                     string `json:"name"`
		MaxDuration              *int   `json:"maxDuration"`
		DailyLimit               *int   `json:"dailyLimit"`
		CallsLimit               *int   `json:"callsLimit"`
		RecordingLimit           *int   `json:"recordingLimit"`
		RetentionDays            *int   `json:"retentionDays"`
		SubscriptionDurationDays *int   `json:"subscriptionDurationDays"`
	}
	if err := json.Unmarshal([]byte(data), &values); err != nil {
		return nil, errors.New("invalid persisted plan configuration")
	}
	result := make(planSnapshot, len(DefaultPlans))
	for key := range DefaultPlans {
		v, ok := values[key]
		if !ok || strings.TrimSpace(v.Name) == "" || len(v.Name) > 80 || v.MaxDuration == nil || v.DailyLimit == nil || v.CallsLimit == nil || v.RecordingLimit == nil || v.RetentionDays == nil || v.SubscriptionDurationDays == nil {
			return nil, fmt.Errorf("incomplete persisted %s plan", key)
		}
		if *v.MaxDuration < 1 || *v.MaxDuration > 1440 || *v.DailyLimit < 0 || *v.DailyLimit > 2147483647 || *v.CallsLimit != *v.DailyLimit || *v.RecordingLimit < 0 || *v.RecordingLimit > 2147483647 || *v.RetentionDays < 1 || *v.RetentionDays > 3650 || *v.SubscriptionDurationDays < 0 || *v.SubscriptionDurationDays > 3650 || (key != "FREE" && *v.SubscriptionDurationDays == 0) {
			return nil, fmt.Errorf("invalid persisted %s plan limits", key)
		}
		result[key] = PlanConfig{Name: v.Name, MaxDuration: *v.MaxDuration, DailyLimit: *v.DailyLimit, RecordingLimit: *v.RecordingLimit, RetentionDays: *v.RetentionDays, SubscriptionDurationDays: *v.SubscriptionDurationDays}
	}
	return result, nil
}

// Node persists audited updates in AuditLog. Authorization refreshes fail closed
// when the cache expires and storage cannot be read; snapshots are immutable.
func (db *DB) RefreshPlanConfiguration(ctx context.Context) error {
	db.plansMu.Lock()
	defer db.plansMu.Unlock()
	if !db.plansCheckedAt.IsZero() && time.Since(db.plansCheckedAt) < 5*time.Second {
		return nil
	}
	var data *string
	err := db.Pool.QueryRow(ctx, `SELECT "afterState" FROM "AuditLog" WHERE action='GLOBAL_PLANS_UPDATE' AND "targetId"='plans_config' ORDER BY "createdAt" DESC LIMIT 1`).Scan(&data)
	if errors.Is(err, pgx.ErrNoRows) {
		configuredPlans.Store(nil)
	} else if err != nil {
		return errors.New("plan configuration storage is unavailable")
	} else {
		if data == nil {
			return errors.New("persisted plan configuration is empty")
		}
		plans, err := parsePlanConfiguration(*data)
		if err != nil {
			return err
		}
		configuredPlans.Store(&plans)
	}
	db.plansCheckedAt = time.Now()
	return nil
}
