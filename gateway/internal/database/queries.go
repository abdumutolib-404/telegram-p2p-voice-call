package database

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"math"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

type User struct {
	ID                       string
	TelegramID               int64
	Alias                    string
	Band                     float64
	SubFC                    float64
	SubLR                    float64
	SubGRA                   float64
	SubP                     float64
	Plan                     string
	WarningCount             int
	IsBanned                 bool
	IsPermanentlyBanned      bool
	BannedUntil              *time.Time
	DailyCallsUsed           int
	LastCallDate             *string
	DailyLimit               *int
	MaxDuration              *int
	RecordingLimit           *int
	RetentionOverride        *int
	CustomPlanName           *string
	SubscriptionStatus       *string
	SubscriptionExpiresAt    *time.Time
	SubscriptionDurationDays *int
}

type CallSession struct {
	ID                 string
	RoomName           string
	Status             string
	UserAID            string
	UserBID            string
	CreatedAt          time.Time
	EndedAt            *time.Time
	Duration           *int
	EgressID           *string
	RecordingURL       *string
	RecordedByUserID   *string
	RecordingExpiresAt *time.Time
	UserA              *User
	UserB              *User
}

type PlanConfig struct {
	Name                     string
	MaxDuration              int
	DailyLimit               int
	RecordingLimit           int
	RetentionDays            int
	SubscriptionDurationDays int
}

var DefaultPlans = map[string]PlanConfig{
	"FREE": {Name: "Free", MaxDuration: 15, DailyLimit: 3, RecordingLimit: 1, RetentionDays: 1, SubscriptionDurationDays: 0},
	"PLUS": {Name: "Plus", MaxDuration: 30, DailyLimit: 10, RecordingLimit: 3, RetentionDays: 7, SubscriptionDurationDays: 30},
	"PRO":  {Name: "Pro", MaxDuration: 60, DailyLimit: 25, RecordingLimit: 7, RetentionDays: 30, SubscriptionDurationDays: 30},
	"BOSS": {Name: "Boss", MaxDuration: 90, DailyLimit: 50, RecordingLimit: 15, RetentionDays: 90, SubscriptionDurationDays: 30},
}

type Entitlement struct {
	Plan               string
	CallLimit          int
	MaxDurationMinutes int
	RecordingLimit     int
	RetentionDays      int
	IsAdmin            bool
	Source             string // "PLAN_DEFAULT" or "ADMIN_OVERRIDE" or "CUSTOM_PLAN"
	OverrideSource     string // Retains restriction semantics when a custom name is present.
}

func GetEffectiveEntitlement(user *User, adminTelegramIDs []string) Entitlement {
	plans := currentPlans()
	isAdmin := false
	if user != nil {
		tgStr := fmt.Sprintf("%d", user.TelegramID)
		for _, a := range adminTelegramIDs {
			if a == tgStr {
				isAdmin = true
				break
			}
		}
	}

	planKey := "FREE"
	if user != nil && user.Plan != "" {
		upper := strings.ToUpper(user.Plan)
		if _, ok := plans[upper]; ok {
			planKey = upper
		}
	}

	expired := false
	if planKey != "FREE" && !isAdmin && user != nil {
		isExpiredStatus := user.SubscriptionStatus != nil && (*user.SubscriptionStatus == "EXPIRED" || *user.SubscriptionStatus == "CANCELLED")
		isPastDate := user.SubscriptionExpiresAt != nil && user.SubscriptionExpiresAt.Before(time.Now())
		if isExpiredStatus || isPastDate {
			expired = true
			planKey = "FREE"
		}
	}

	defaultTier := plans[planKey]
	dailyLimit := defaultTier.DailyLimit
	isCustomLimit := false
	if !expired && user != nil && user.DailyLimit != nil && *user.DailyLimit != defaultTier.DailyLimit {
		dailyLimit = *user.DailyLimit
		isCustomLimit = true
	}
	if isAdmin {
		dailyLimit = 999
	}

	maxDurationMinutes := defaultTier.MaxDuration
	isCustomDuration := false
	if !expired && user != nil && user.MaxDuration != nil && *user.MaxDuration != defaultTier.MaxDuration {
		maxDurationMinutes = *user.MaxDuration
		isCustomDuration = true
	}

	recordingLimit := defaultTier.RecordingLimit
	isCustomRecordingLimit := false
	if !expired && user != nil && user.RecordingLimit != nil && *user.RecordingLimit >= 0 {
		recordingLimit = *user.RecordingLimit
		isCustomRecordingLimit = true
	}

	retentionDays := defaultTier.RetentionDays
	retentionSource := "PLAN_DEFAULT"
	if !expired && user != nil && user.RetentionOverride != nil && *user.RetentionOverride > 0 {
		retentionDays = *user.RetentionOverride
		retentionSource = "ADMIN_OVERRIDE"
	}

	source := "PLAN_DEFAULT"
	if isCustomLimit || isCustomDuration || isCustomRecordingLimit || retentionSource == "ADMIN_OVERRIDE" {
		source = "ADMIN_OVERRIDE"
	}
	overrideSource := source
	if !expired && user != nil && user.CustomPlanName != nil && *user.CustomPlanName != "" {
		source = "CUSTOM_PLAN"
	}

	return Entitlement{
		Plan:               planKey,
		CallLimit:          dailyLimit,
		MaxDurationMinutes: maxDurationMinutes,
		RecordingLimit:     recordingLimit,
		RetentionDays:      retentionDays,
		IsAdmin:            isAdmin,
		Source:             source,
		OverrideSource:     overrideSource,
	}
}

func CalculateEffectiveCallDuration(userA, userB *User, adminTelegramIDs []string) int {
	entA := GetEffectiveEntitlement(userA, adminTelegramIDs)
	entB := GetEffectiveEntitlement(userB, adminTelegramIDs)

	if entA.OverrideSource == "ADMIN_OVERRIDE" || entB.OverrideSource == "ADMIN_OVERRIDE" {
		if entA.MaxDurationMinutes < entB.MaxDurationMinutes {
			return entA.MaxDurationMinutes
		}
		return entB.MaxDurationMinutes
	}

	if entA.MaxDurationMinutes > entB.MaxDurationMinutes {
		return entA.MaxDurationMinutes
	}
	return entB.MaxDurationMinutes
}

func CalculateMixedPlanDuration(planA, planB string) int {
	plans := currentPlans()
	cfgA, okA := plans[strings.ToUpper(planA)]
	if !okA {
		cfgA = plans["FREE"]
	}
	cfgB, okB := plans[strings.ToUpper(planB)]
	if !okB {
		cfgB = plans["FREE"]
	}

	if cfgA.MaxDuration > cfgB.MaxDuration {
		return cfgA.MaxDuration
	}
	return cfgB.MaxDuration
}

const userSelectColumns = `
	id, "telegramId", alias, band, "subFC", "subLR", "subGRA", "subP",
	plan, "warningCount", "isBanned", "isPermanentlyBanned", "bannedUntil",
	"dailyCallsUsed", "lastCallDate", "dailyLimit", "maxDuration",
	"recordingLimitOverride", "retentionOverride", "customPlanName",
	"subscriptionStatus", "subscriptionExpiresAt"
`

func scanUser(row pgx.Row) (*User, error) {
	u := &User{}
	var (
		bannedUntil            sql.NullTime
		lastCallDate           sql.NullString
		dailyLimit             sql.NullInt64
		maxDuration            sql.NullInt64
		recordingLimitOverride sql.NullInt64
		retentionOverride      sql.NullInt64
		customPlanName         sql.NullString
		subscriptionStatus     sql.NullString
		subscriptionExpiresAt  sql.NullTime
	)

	err := row.Scan(
		&u.ID,
		&u.TelegramID,
		&u.Alias,
		&u.Band,
		&u.SubFC,
		&u.SubLR,
		&u.SubGRA,
		&u.SubP,
		&u.Plan,
		&u.WarningCount,
		&u.IsBanned,
		&u.IsPermanentlyBanned,
		&bannedUntil,
		&u.DailyCallsUsed,
		&lastCallDate,
		&dailyLimit,
		&maxDuration,
		&recordingLimitOverride,
		&retentionOverride,
		&customPlanName,
		&subscriptionStatus,
		&subscriptionExpiresAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}

	if bannedUntil.Valid {
		u.BannedUntil = &bannedUntil.Time
	}
	if lastCallDate.Valid {
		u.LastCallDate = &lastCallDate.String
	}
	if dailyLimit.Valid {
		v := int(dailyLimit.Int64)
		u.DailyLimit = &v
	}
	if maxDuration.Valid {
		v := int(maxDuration.Int64)
		u.MaxDuration = &v
	}
	if recordingLimitOverride.Valid {
		v := int(recordingLimitOverride.Int64)
		u.RecordingLimit = &v
	}
	if retentionOverride.Valid {
		v := int(retentionOverride.Int64)
		u.RetentionOverride = &v
	}
	if customPlanName.Valid {
		u.CustomPlanName = &customPlanName.String
	}
	if subscriptionStatus.Valid {
		u.SubscriptionStatus = &subscriptionStatus.String
	}
	if subscriptionExpiresAt.Valid {
		u.SubscriptionExpiresAt = &subscriptionExpiresAt.Time
	}

	return u, nil
}

func (db *DB) GetUserByID(ctx context.Context, id string) (*User, error) {
	query := `SELECT ` + userSelectColumns + ` FROM "User" WHERE id = $1`
	return scanUser(db.Pool.QueryRow(ctx, query, id))
}

func (db *DB) GetUserByTelegramID(ctx context.Context, telegramID int64) (*User, error) {
	query := `SELECT ` + userSelectColumns + ` FROM "User" WHERE "telegramId" = $1`
	return scanUser(db.Pool.QueryRow(ctx, query, telegramID))
}

func (db *DB) GetActiveCallForUser(ctx context.Context, userID string) (*CallSession, error) {
	query := `
		SELECT
			cs.id, cs."roomName", cs.status, cs."userAId", cs."userBId", cs."createdAt",
			cs."endedAt", cs.duration, cs."egressId", cs."recordingUrl", cs."recordedByUserId", cs."recordingExpiresAt"
		FROM "CallSession" cs
		WHERE cs.status = 'ACTIVE' AND (cs."userAId" = $1 OR cs."userBId" = $1)
		ORDER BY cs."createdAt" DESC
		LIMIT 1
	`
	row := db.Pool.QueryRow(ctx, query, userID)
	s := &CallSession{}
	var (
		endedAt            sql.NullTime
		duration           sql.NullInt64
		egressID           sql.NullString
		recordingURL       sql.NullString
		recordedByUserID   sql.NullString
		recordingExpiresAt sql.NullTime
	)

	err := row.Scan(
		&s.ID,
		&s.RoomName,
		&s.Status,
		&s.UserAID,
		&s.UserBID,
		&s.CreatedAt,
		&endedAt,
		&duration,
		&egressID,
		&recordingURL,
		&recordedByUserID,
		&recordingExpiresAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}

	if endedAt.Valid {
		s.EndedAt = &endedAt.Time
	}
	if duration.Valid {
		d := int(duration.Int64)
		s.Duration = &d
	}
	if egressID.Valid {
		s.EgressID = &egressID.String
	}
	if recordingURL.Valid {
		s.RecordingURL = &recordingURL.String
	}
	if recordedByUserID.Valid {
		s.RecordedByUserID = &recordedByUserID.String
	}
	if recordingExpiresAt.Valid {
		s.RecordingExpiresAt = &recordingExpiresAt.Time
	}

	// Fetch both users
	uA, errA := db.GetUserByID(ctx, s.UserAID)
	if errA != nil {
		return nil, errA
	}
	s.UserA = uA
	uB, errB := db.GetUserByID(ctx, s.UserBID)
	if errB != nil {
		return nil, errB
	}
	s.UserB = uB

	return s, nil
}

func (db *DB) GetCallSessionByRoomName(ctx context.Context, roomName string) (*CallSession, error) {
	query := `
		SELECT
			cs.id, cs."roomName", cs.status, cs."userAId", cs."userBId", cs."createdAt",
			cs."endedAt", cs.duration, cs."egressId", cs."recordingUrl", cs."recordedByUserId", cs."recordingExpiresAt"
		FROM "CallSession" cs
		WHERE cs."roomName" = $1
		LIMIT 1
	`
	row := db.Pool.QueryRow(ctx, query, roomName)
	s := &CallSession{}
	var (
		endedAt            sql.NullTime
		duration           sql.NullInt64
		egressID           sql.NullString
		recordingURL       sql.NullString
		recordedByUserID   sql.NullString
		recordingExpiresAt sql.NullTime
	)

	err := row.Scan(
		&s.ID,
		&s.RoomName,
		&s.Status,
		&s.UserAID,
		&s.UserBID,
		&s.CreatedAt,
		&endedAt,
		&duration,
		&egressID,
		&recordingURL,
		&recordedByUserID,
		&recordingExpiresAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}

	if endedAt.Valid {
		s.EndedAt = &endedAt.Time
	}
	if duration.Valid {
		d := int(duration.Int64)
		s.Duration = &d
	}
	if egressID.Valid {
		s.EgressID = &egressID.String
	}
	if recordingURL.Valid {
		s.RecordingURL = &recordingURL.String
	}
	if recordedByUserID.Valid {
		s.RecordedByUserID = &recordedByUserID.String
	}
	if recordingExpiresAt.Valid {
		s.RecordingExpiresAt = &recordingExpiresAt.Time
	}

	uA, errA := db.GetUserByID(ctx, s.UserAID)
	if errA != nil {
		return nil, errA
	}
	s.UserA = uA
	uB, errB := db.GetUserByID(ctx, s.UserBID)
	if errB != nil {
		return nil, errB
	}
	s.UserB = uB

	return s, nil
}

func (db *DB) CancelCallSession(ctx context.Context, id string) (bool, error) {
	tx, err := db.Pool.Begin(ctx)
	if err != nil {
		return false, err
	}
	defer tx.Rollback(ctx)
	query := `
		UPDATE "CallSession"
		SET status = 'CANCELLED', "endedAt" = NOW(), duration = 0
		WHERE id = $1 AND (status = 'ACTIVE' OR status = 'PENDING')
	`
	tag, err := tx.Exec(ctx, query, id)
	if err != nil {
		return false, err
	}
	if tag.RowsAffected() != 1 {
		return false, nil
	}
	if _, err := tx.Exec(ctx, `INSERT INTO "PostCallJob" ("callId",reason,"updatedAt") VALUES ($1,'call_cancelled',NOW())`, id); err != nil {
		return false, err
	}
	if err := tx.Commit(ctx); err != nil {
		return false, err
	}
	return true, nil
}

func (db *DB) UpdateSessionRecorders(ctx context.Context, id string, recorders *string) error {
	query := `
		UPDATE "CallSession"
		SET "recordedByUserId" = $1
		WHERE id = $2 AND status = 'ACTIVE'
	`
	_, err := db.Pool.Exec(ctx, query, recorders, id)
	return err
}

// UpdateSessionEgressAtomic implements optimistic concurrency control on toggle_record
// WHERE id = $1 AND status = 'ACTIVE' AND "egressId" IS NULL
func (db *DB) UpdateSessionEgressAtomic(ctx context.Context, id, egressID, recordingURL, recorders string) (bool, error) {
	query := `
		UPDATE "CallSession"
		SET "egressId" = $1, "recordingUrl" = $2, "recordedByUserId" = $3
		WHERE id = $4 AND status = 'ACTIVE' AND "egressId" IS NULL
	`
	tag, err := db.Pool.Exec(ctx, query, egressID, recordingURL, recorders, id)
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() == 1, nil
}

func (db *DB) ClearSessionEgress(ctx context.Context, id string) error {
	query := `
		UPDATE "CallSession"
		SET "egressId" = NULL, "recordedByUserId" = NULL
		WHERE id = $1 AND status = 'ACTIVE'
	`
	_, err := db.Pool.Exec(ctx, query, id)
	return err
}

func (db *DB) GetActiveBonusCallsCount(ctx context.Context, userID string) (int, error) {
	query := `SELECT COUNT(*) FROM "ReferralReward" WHERE "userId" = $1 AND status = 'AVAILABLE'`
	var count int
	err := db.Pool.QueryRow(ctx, query, userID).Scan(&count)
	return count, err
}

func (db *DB) ConsumeOldestBonusCall(ctx context.Context, userID string) (bool, error) {
	return consumeOldestBonusCall(ctx, db.Pool, userID)
}

type queryRunner interface {
	QueryRow(context.Context, string, ...any) pgx.Row
	Exec(context.Context, string, ...any) (pgconn.CommandTag, error)
}

func consumeOldestBonusCall(ctx context.Context, runner queryRunner, userID string) (bool, error) {
	query := `
		UPDATE "ReferralReward"
		SET status = 'USED', "usedAt" = NOW()
		WHERE status = 'AVAILABLE' AND id = (
			SELECT id FROM "ReferralReward"
			WHERE "userId" = $1 AND status = 'AVAILABLE'
			ORDER BY "createdAt" ASC
			LIMIT 1
			FOR UPDATE SKIP LOCKED
		)
	`
	tag, err := runner.Exec(ctx, query, userID)
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() == 1, nil
}

func (db *DB) GetUserCallsUsedThisPeriod(ctx context.Context, userID string, user *User) (int, error) {
	targetUser := user
	var err error
	if targetUser == nil {
		targetUser, err = db.GetUserByID(ctx, userID)
		if err != nil || targetUser == nil {
			return 0, err
		}
	}
	return callsUsedThisPeriod(ctx, db.Pool, userID, targetUser)
}

func callsUsedThisPeriod(ctx context.Context, runner queryRunner, userID string, targetUser *User) (int, error) {
	currentMonth := time.Now().UTC().Format("2006-01")

	if targetUser.LastCallDate != nil && strings.HasPrefix(*targetUser.LastCallDate, currentMonth) {
		return int(math.Max(0, float64(targetUser.DailyCallsUsed))), nil
	}

	now := time.Now().UTC()
	periodStart := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC)
	if targetUser.SubscriptionExpiresAt != nil && targetUser.SubscriptionExpiresAt.After(time.Now()) {
		durationDays := 30
		if targetUser.SubscriptionDurationDays != nil && *targetUser.SubscriptionDurationDays > 0 {
			durationDays = *targetUser.SubscriptionDurationDays
		}
		periodStart = targetUser.SubscriptionExpiresAt.Add(-time.Duration(durationDays) * 24 * time.Hour)
	}

	query := `
		SELECT COUNT(*)
		FROM "CallSession"
		WHERE ("userAId" = $1 OR "userBId" = $1)
		  AND status = 'COMPLETED'
		  AND duration >= 5
		  AND "createdAt" >= $2
	`
	var count int
	err := runner.QueryRow(ctx, query, userID, periodStart).Scan(&count)
	return count, err
}

func (db *DB) GetUserRecordingsUsedThisPeriod(ctx context.Context, userID string, user *User) (int, error) {
	targetUser := user
	var err error
	if targetUser == nil {
		targetUser, err = db.GetUserByID(ctx, userID)
		if err != nil || targetUser == nil {
			return 0, err
		}
	}

	now := time.Now().UTC()
	periodStart := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC)
	if targetUser.SubscriptionExpiresAt != nil && targetUser.SubscriptionExpiresAt.After(time.Now()) {
		durationDays := 30
		if targetUser.SubscriptionDurationDays != nil && *targetUser.SubscriptionDurationDays > 0 {
			durationDays = *targetUser.SubscriptionDurationDays
		}
		periodStart = targetUser.SubscriptionExpiresAt.Add(-time.Duration(durationDays) * 24 * time.Hour)
	}

	query := `
		SELECT COUNT(*)
		FROM "CallSession"
		WHERE ("userAId" = $1 OR "userBId" = $1)
		  AND ("recordedByUserId" = $1
		   OR "recordedByUserId" = 'BOTH'
		   OR "recordedByUserId" = 'ALL'
		   OR ("recordedByUserId" IS NULL AND "userAId" = $1)
		   OR ("recordedByUserId" IS NULL AND "userBId" = $1)
		   OR ($1 = ANY(string_to_array("recordedByUserId", ','))))
		  AND "recordingUrl" IS NOT NULL
		  AND "createdAt" >= $2
	`
	var count int
	err = db.Pool.QueryRow(ctx, query, userID, periodStart).Scan(&count)
	return count, err
}

func (db *DB) GetActiveSessionsForReconciliation(ctx context.Context) ([]*CallSession, error) {
	query := `
		SELECT
			cs.id, cs."roomName", cs.status, cs."userAId", cs."userBId", cs."createdAt",
			cs."endedAt", cs.duration, cs."egressId", cs."recordingUrl", cs."recordedByUserId", cs."recordingExpiresAt"
		FROM "CallSession" cs
		WHERE cs.status = 'ACTIVE'
	`
	rows, err := db.Pool.Query(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var sessions []*CallSession
	for rows.Next() {
		s := &CallSession{}
		var (
			endedAt            sql.NullTime
			duration           sql.NullInt64
			egressID           sql.NullString
			recordingURL       sql.NullString
			recordedByUserID   sql.NullString
			recordingExpiresAt sql.NullTime
		)

		if err := rows.Scan(
			&s.ID,
			&s.RoomName,
			&s.Status,
			&s.UserAID,
			&s.UserBID,
			&s.CreatedAt,
			&endedAt,
			&duration,
			&egressID,
			&recordingURL,
			&recordedByUserID,
			&recordingExpiresAt,
		); err != nil {
			return nil, err
		}

		if endedAt.Valid {
			s.EndedAt = &endedAt.Time
		}
		if duration.Valid {
			d := int(duration.Int64)
			s.Duration = &d
		}
		if egressID.Valid {
			s.EgressID = &egressID.String
		}
		if recordingURL.Valid {
			s.RecordingURL = &recordingURL.String
		}
		if recordedByUserID.Valid {
			s.RecordedByUserID = &recordedByUserID.String
		}
		if recordingExpiresAt.Valid {
			s.RecordingExpiresAt = &recordingExpiresAt.Time
		}

		sessions = append(sessions, s)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	for _, s := range sessions {
		var err error
		s.UserA, err = db.GetUserByID(ctx, s.UserAID)
		if err != nil {
			return nil, err
		}
		s.UserB, err = db.GetUserByID(ctx, s.UserBID)
		if err != nil {
			return nil, err
		}
	}

	return sessions, nil
}

func (db *DB) GetStalePendingSessions(ctx context.Context, olderThan time.Time) ([]*CallSession, error) {
	query := `
		SELECT id, "roomName", status, "userAId", "userBId", "createdAt"
		FROM "CallSession"
		WHERE status = 'PENDING' AND "createdAt" < $1
	`
	rows, err := db.Pool.Query(ctx, query, olderThan)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var sessions []*CallSession
	for rows.Next() {
		s := &CallSession{}
		if err := rows.Scan(&s.ID, &s.RoomName, &s.Status, &s.UserAID, &s.UserBID, &s.CreatedAt); err != nil {
			return nil, err
		}
		sessions = append(sessions, s)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	return sessions, nil
}
