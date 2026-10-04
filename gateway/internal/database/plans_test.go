package database

import (
	"encoding/json"
	"testing"

	"github.com/google/uuid"
)

func planFixture(t *testing.T) string {
	t.Helper()
	values := map[string]any{}
	for tier, plan := range DefaultPlans {
		values[tier] = map[string]any{"name": plan.Name, "dailyLimit": plan.DailyLimit, "callsLimit": plan.DailyLimit, "maxDuration": plan.MaxDuration, "recordingLimit": plan.RecordingLimit, "retentionDays": plan.RetentionDays, "subscriptionDurationDays": plan.SubscriptionDurationDays}
	}
	data, err := json.Marshal(values)
	if err != nil {
		t.Fatal(err)
	}
	return string(data)
}

func TestPersistedPlansRequireCompleteValidLimits(t *testing.T) {
	plans, err := parsePlanConfiguration(planFixture(t))
	if err != nil || plans["BOSS"].MaxDuration != 90 {
		t.Fatalf("valid configuration rejected: %v", err)
	}
	for _, data := range []string{`null`, `{}`, `{"FREE":{"dailyLimit":0}}`, `invalid`} {
		if _, err := parsePlanConfiguration(data); err == nil {
			t.Fatalf("invalid configuration accepted: %s", data)
		}
	}
	var values map[string]map[string]any
	if err := json.Unmarshal([]byte(planFixture(t)), &values); err != nil {
		t.Fatal(err)
	}
	values["PLUS"]["callsLimit"] = 11
	data, _ := json.Marshal(values)
	if _, err := parsePlanConfiguration(string(data)); err == nil {
		t.Fatal("divergent quota fields accepted")
	}
}

func TestIntegrationSharedPlanConfiguration(t *testing.T) {
	db, ctx, ids := isolatedDB(t)
	before := configuredPlans.Load()
	t.Cleanup(func() { configuredPlans.Store(before) })
	var values map[string]map[string]any
	if err := json.Unmarshal([]byte(planFixture(t)), &values); err != nil {
		t.Fatal(err)
	}
	values["FREE"]["dailyLimit"] = 0
	values["FREE"]["callsLimit"] = 0
	values["FREE"]["recordingLimit"] = 0
	data, _ := json.Marshal(values)
	logID := uuid.NewString()
	_, err := db.Pool.Exec(ctx, `INSERT INTO "AuditLog" (id, action, "targetId", "adminId", "afterState") VALUES ($1,'GLOBAL_PLANS_UPDATE','plans_config','gateway-verification',$2)`, logID, string(data))
	if err != nil {
		t.Fatal(err)
	}
	defer func() {
		if _, err := db.Pool.Exec(ctx, `DELETE FROM "AuditLog" WHERE id=$1`, logID); err != nil {
			t.Error(err)
		}
	}()
	if err := db.RefreshPlanConfiguration(ctx); err != nil {
		t.Fatal(err)
	}
	u, err := db.GetUserByID(ctx, ids[0])
	if err != nil {
		t.Fatal(err)
	}
	// Remove an explicit per-user allowance to verify the shared tier snapshot.
	u.DailyLimit = nil
	ent := GetEffectiveEntitlement(u, nil)
	if ent.CallLimit != 0 || ent.RecordingLimit != 0 {
		t.Fatalf("persisted configuration ignored: %+v", ent)
	}
}
