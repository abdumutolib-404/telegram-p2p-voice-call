package database

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"time"

	"github.com/jackc/pgx/v5"
)

// Node invitation/admission transactions use the same ordered participant locks.
// This makes the database, rather than one gateway's socket map, authoritative.
func lockParticipants(ctx context.Context, tx pgx.Tx, userAID, userBID string) (map[string]*User, error) {
	if userAID == userBID || userAID == "" || userBID == "" {
		return nil, errors.New("a call requires two different participants")
	}
	ids := []string{userAID, userBID}
	sort.Strings(ids)
	users := make(map[string]*User, 2)
	for _, id := range ids {
		u, err := scanUser(tx.QueryRow(ctx, `SELECT `+userSelectColumns+` FROM "User" WHERE id=$1 FOR UPDATE`, id))
		if err != nil {
			return nil, err
		}
		if u == nil {
			return nil, errors.New("participant no longer exists")
		}
		users[id] = u
	}
	return users, nil
}

func (db *DB) CreateCallSession(ctx context.Context, id, roomName, userAID, userBID string) error {
	_, _, err := db.AdmitCallSession(ctx, id, roomName, userAID, userBID)
	return err
}

// Returns the profiles checked under lock so token duration uses fresh limits.
func (db *DB) AdmitCallSession(ctx context.Context, id, roomName, userAID, userBID string) (*User, *User, error) {
	if err := db.RefreshPlanConfiguration(ctx); err != nil {
		return nil, nil, err
	}
	tx, err := db.Pool.Begin(ctx)
	if err != nil {
		return nil, nil, err
	}
	defer tx.Rollback(ctx)
	users, err := lockParticipants(ctx, tx, userAID, userBID)
	if err != nil {
		return nil, nil, err
	}
	for _, userID := range []string{userAID, userBID} {
		u := users[userID]
		if u.IsPermanentlyBanned || (u.BannedUntil != nil && u.BannedUntil.After(time.Now())) || (u.IsBanned && u.BannedUntil == nil) {
			return nil, nil, errors.New("participant is suspended")
		}
		var busy bool
		if err := tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM "CallSession" WHERE status IN ('ACTIVE','PENDING') AND ("userAId"=$1 OR "userBId"=$1))`, userID).Scan(&busy); err != nil {
			return nil, nil, err
		}
		if busy {
			return nil, nil, errors.New("participant already has an active or pending call")
		}
		ent := GetEffectiveEntitlement(u, db.AdminTelegramIDs)
		used, err := callsUsedThisPeriod(ctx, tx, userID, u)
		if err != nil {
			return nil, nil, err
		}
		if !ent.IsAdmin && ent.CallLimit < 999 && used >= ent.CallLimit {
			var bonus int
			if err := tx.QueryRow(ctx, `SELECT COUNT(*) FROM "ReferralReward" WHERE "userId"=$1 AND status='AVAILABLE'`, userID).Scan(&bonus); err != nil {
				return nil, nil, err
			}
			if bonus == 0 {
				return nil, nil, errors.New("participant call allowance has been reached")
			}
		}
	}
	if _, err := tx.Exec(ctx, `INSERT INTO "CallSession" (id,"roomName","userAId","userBId",status,"createdAt") VALUES ($1,$2,$3,$4,'ACTIVE',NOW())`, id, roomName, userAID, userBID); err != nil {
		return nil, nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, nil, err
	}
	return users[userAID], users[userBID], nil
}

type CompletionEffects struct {
	Reason       string
	DeniedUserID string
}

func (db *DB) CompleteCallSession(ctx context.Context, id string, duration int, egressID, recordingURL *string, recordingExpiresAt *time.Time, effects ...CompletionEffects) (bool, error) {
	return db.completeCallSession(ctx, id, duration, egressID, recordingURL, recordingExpiresAt, true, effects...)
}

// Permission-denied calls retain the existing policy of not charging allowance.
func (db *DB) CompleteUnchargedCallSession(ctx context.Context, id string, duration int, egressID, recordingURL *string, recordingExpiresAt *time.Time, effects ...CompletionEffects) (bool, error) {
	return db.completeCallSession(ctx, id, duration, egressID, recordingURL, recordingExpiresAt, false, effects...)
}

func (db *DB) completeCallSession(ctx context.Context, id string, duration int, egressID, recordingURL *string, recordingExpiresAt *time.Time, charge bool, effects ...CompletionEffects) (bool, error) {
	if duration < 0 {
		return false, errors.New("call duration cannot be negative")
	}
	tx, err := db.Pool.Begin(ctx)
	if err != nil {
		return false, err
	}
	defer tx.Rollback(ctx)
	var userAID, userBID string
	err = tx.QueryRow(ctx, `SELECT "userAId","userBId" FROM "CallSession" WHERE id=$1`, id).Scan(&userAID, &userBID)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	users, err := lockParticipants(ctx, tx, userAID, userBID)
	if err != nil {
		return false, err
	}
	var status string
	if err := tx.QueryRow(ctx, `SELECT status FROM "CallSession" WHERE id=$1 FOR UPDATE`, id).Scan(&status); err != nil {
		return false, err
	}
	if status != "ACTIVE" {
		return false, nil
	}
	usage := make(map[string]int, 2)
	if charge && duration >= 5 {
		for _, userID := range []string{userAID, userBID} {
			usage[userID], err = callsUsedThisPeriod(ctx, tx, userID, users[userID])
			if err != nil {
				return false, err
			}
		}
	}
	tag, err := tx.Exec(ctx, `UPDATE "CallSession" SET status='COMPLETED',"endedAt"=NOW(),duration=$1,"egressId"=$2,"recordingUrl"=$3,"recordingExpiresAt"=$4 WHERE id=$5 AND status='ACTIVE'`, duration, egressID, recordingURL, recordingExpiresAt, id)
	if err != nil || tag.RowsAffected() != 1 {
		return false, err
	}
	if charge && duration >= 5 {
		for _, userID := range []string{userAID, userBID} {
			ent := GetEffectiveEntitlement(users[userID], db.AdminTelegramIDs)
			if !ent.IsAdmin && ent.CallLimit < 999 && usage[userID] >= ent.CallLimit {
				consumed, err := consumeOldestBonusCall(ctx, tx, userID)
				if err != nil {
					return false, err
				}
				if consumed {
					continue
				}
			}
			if _, err := tx.Exec(ctx, `UPDATE "User" SET "dailyCallsUsed"=$1,"lastCallDate"=$2,"updatedAt"=NOW() WHERE id=$3`, int64(usage[userID])+1, time.Now().UTC().Format("2006-01"), userID); err != nil {
				return false, fmt.Errorf("persist call allowance: %w", err)
			}
		}
	}
	metadata := CompletionEffects{}
	if len(effects) > 0 {
		metadata = effects[0]
	}
	if metadata.DeniedUserID != "" && metadata.DeniedUserID != userAID && metadata.DeniedUserID != userBID {
		return false, errors.New("invalid denied participant")
	}
	if _, err := tx.Exec(ctx, `INSERT INTO "PostCallJob" ("callId",reason,"deniedUserId","retentionA","retentionB","nextAttemptAt","updatedAt") VALUES ($1,$2,$3,$4,$5,NOW()+INTERVAL '2 seconds',NOW())`,
		id, metadata.Reason, metadata.DeniedUserID, GetEffectiveEntitlement(users[userAID], db.AdminTelegramIDs).RetentionDays, GetEffectiveEntitlement(users[userBID], db.AdminTelegramIDs).RetentionDays); err != nil {
		return false, fmt.Errorf("persist post-call work: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return false, err
	}
	return true, nil
}
