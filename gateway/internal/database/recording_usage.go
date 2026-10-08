package database

import (
	"context"
	"errors"
	"github.com/jackc/pgx/v5"
	"time"
)

func recordingPeriodStart(user *User) time.Time {
	now := time.Now().UTC()
	if user.SubscriptionExpiresAt != nil && user.SubscriptionExpiresAt.After(now) {
		if user.SubscriptionStartsAt != nil {
			return *user.SubscriptionStartsAt
		}
		days := 30
		if user.SubscriptionDurationDays != nil && *user.SubscriptionDurationDays > 0 {
			days = *user.SubscriptionDurationDays
		}
		return user.SubscriptionExpiresAt.Add(-time.Duration(days) * 24 * time.Hour)
	}
	return time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC)
}

func (db *DB) HasConsumedRecording(ctx context.Context, callID, userID string) (bool, error) {
	var exists bool
	err := db.Pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM "RecordingUsage" WHERE "callId"=$1 AND "userId"=$2)`, callID, userID).Scan(&exists)
	return exists, err
}

// Locks the owner before the call, matching admission/completion lock order.
// A failed caller transaction also rolls back this enrollment.
func (db *DB) consumeRecording(ctx context.Context, tx pgx.Tx, callID, userID string) error {
	user, err := scanUser(tx.QueryRow(ctx, `SELECT `+userSelectColumns+` FROM "User" WHERE id=$1 FOR UPDATE`, userID))
	if err != nil {
		return err
	}
	if user == nil {
		return errors.New("recording owner is missing")
	}
	var participant bool
	if err := tx.QueryRow(ctx, `SELECT status='ACTIVE' AND ($2="userAId" OR $2="userBId") FROM "CallSession" WHERE id=$1`, callID, userID).Scan(&participant); err != nil {
		return err
	}
	if !participant {
		return errors.New("recording owner is not an active participant")
	}
	var consumed bool
	if err := tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM "RecordingUsage" WHERE "callId"=$1 AND "userId"=$2)`, callID, userID).Scan(&consumed); err != nil {
		return err
	}
	if consumed {
		return nil
	}
	var used int
	if err := tx.QueryRow(ctx, `SELECT COUNT(*) FROM "RecordingUsage" WHERE "userId"=$1 AND "consumedAt">=$2`, userID, recordingPeriodStart(user)).Scan(&used); err != nil {
		return err
	}
	ent := GetEffectiveEntitlement(user, db.AdminTelegramIDs)
	if !ent.IsAdmin && used >= ent.RecordingLimit {
		return errors.New("recording allowance reached")
	}
	_, err = tx.Exec(ctx, `INSERT INTO "RecordingUsage" ("callId","userId","consumedAt") VALUES ($1,$2,NOW()) ON CONFLICT DO NOTHING`, callID, userID)
	return err
}
