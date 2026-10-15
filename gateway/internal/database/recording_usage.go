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

func (db *DB) PrepareRecordingCapacity(ctx context.Context, callID, userID string, minutes int, creditBacked bool) (bool, error) {
	var reserved bool
	err := db.Pool.QueryRow(ctx, `SELECT pairtalk_prepare_recording_capacity($1,$2,$3,$4)`, callID, userID, minutes, creditBacked).Scan(&reserved)
	return reserved, err
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
	if user.Restricted(time.Now()) {
		return errors.New("recording is unavailable for this account")
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
	if err := tx.QueryRow(ctx, `SELECT COUNT(*) FROM "RecordingUsage" r WHERE "userId"=$1 AND "consumedAt">=$2 AND NOT EXISTS(SELECT 1 FROM "CreditUsage" c WHERE c."callId"=r."callId" AND c."userId"=r."userId" AND c.kind='RECORDING' AND c.status IN ('RESERVED','CONSUMED'))`, userID, recordingPeriodStart(user)).Scan(&used); err != nil {
		return err
	}
	ent := GetEffectiveEntitlement(user, db.AdminTelegramIDs)
	if !ent.IsAdmin && (user.CreditBilling && ent.BaseRecordingLimit == 0 || used >= ent.BaseRecordingLimit) {
		var a, b string
		if err := tx.QueryRow(ctx, `SELECT "userAId","userBId" FROM "CallSession" WHERE id=$1`, callID).Scan(&a, &b); err != nil {
			return err
		}
		ua, err := scanUser(tx.QueryRow(ctx, `SELECT `+userSelectColumns+` FROM "User" WHERE id=$1`, a))
		if err != nil {
			return err
		}
		ub, err := scanUser(tx.QueryRow(ctx, `SELECT `+userSelectColumns+` FROM "User" WHERE id=$1`, b))
		if err != nil {
			return err
		}
		if CalculateEffectiveCallDuration(ua, ub, db.AdminTelegramIDs) > 15 {
			return errors.New("recording credits cover calls up to 15 minutes")
		}
		var reserved bool
		if err := tx.QueryRow(ctx, `SELECT pairtalk_reserve_credit($1,$2,'RECORDING')`, callID, userID).Scan(&reserved); err != nil {
			return err
		}
		if !reserved {
			return errors.New("no recording credits remain")
		}
		if user.StorageCredits > 0 {
			if err := tx.QueryRow(ctx, `SELECT pairtalk_reserve_credit($1,$2,'STORAGE')`, callID, userID).Scan(&reserved); err != nil {
				return err
			}
			if !reserved {
				return errors.New("storage credit reservation failed")
			}
		}
	}
	var aID, bID string
	if err := tx.QueryRow(ctx, `SELECT "userAId","userBId" FROM "CallSession" WHERE id=$1`, callID).Scan(&aID, &bID); err != nil {
		return err
	}
	aUser, err := scanUser(tx.QueryRow(ctx, `SELECT `+userSelectColumns+` FROM "User" WHERE id=$1`, aID))
	if err != nil {
		return err
	}
	bUser, err := scanUser(tx.QueryRow(ctx, `SELECT `+userSelectColumns+` FROM "User" WHERE id=$1`, bID))
	if err != nil {
		return err
	}
	var capacity bool
	if err := tx.QueryRow(ctx, `SELECT pairtalk_reserve_recording_capacity($1,$2)`, callID, CalculateEffectiveCallDuration(aUser, bUser, db.AdminTelegramIDs)).Scan(&capacity); err != nil {
		return err
	}
	if !capacity {
		return errors.New("recording capacity is unavailable; your credit was not charged")
	}
	_, err = tx.Exec(ctx, `INSERT INTO "RecordingUsage" ("callId","userId","consumedAt") VALUES ($1,$2,NOW()) ON CONFLICT DO NOTHING`, callID, userID)
	return err
}
