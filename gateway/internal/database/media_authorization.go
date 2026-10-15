package database

import (
	"context"
	"errors"
	"github.com/jackc/pgx/v5"
	"sort"
	"time"
)

// RegisterReadyParticipant persists the gate before the provider enables reception.
func (db *DB) RegisterReadyParticipant(ctx context.Context, id, userID string) (bool, error) {
	tx, err := db.Pool.Begin(ctx)
	if err != nil {
		return false, err
	}
	defer tx.Rollback(ctx)
	// Participant locks precede the call lock, matching admission and completion.
	var initialA, initialB string
	err = tx.QueryRow(ctx, `SELECT "userAId","userBId" FROM "CallSession" WHERE id=$1`, id).Scan(&initialA, &initialB)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	if userID != initialA && userID != initialB {
		return false, nil
	}
	participants := []string{initialA, initialB}
	sort.Strings(participants)
	for _, participant := range participants {
		user, err := scanUser(tx.QueryRow(ctx, `SELECT `+userSelectColumns+` FROM "User" WHERE id=$1 FOR UPDATE`, participant))
		if err != nil {
			return false, err
		}
		if user.Restricted(time.Now()) {
			return false, nil
		}
	}
	var status, a, b string
	var ready []string
	var authorizedAt *time.Time
	err = tx.QueryRow(ctx, `SELECT status,"userAId","userBId","readyParticipantIds","mediaAuthorizedAt" FROM "CallSession" WHERE id=$1 FOR UPDATE`, id).Scan(&status, &a, &b, &ready, &authorizedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	if status != "ACTIVE" || (userID != a && userID != b) {
		return false, nil
	}
	seen := map[string]bool{}
	for _, participant := range ready {
		seen[participant] = true
	}
	seen[userID] = true
	ready = []string{}
	for participant := range seen {
		ready = append(ready, participant)
	}
	sort.Strings(ready)
	authorized := authorizedAt != nil || (seen[a] && seen[b])
	_, err = tx.Exec(ctx, `UPDATE "CallSession" SET "readyParticipantIds"=$1,"mediaAuthorizedAt"=CASE WHEN $2 THEN COALESCE("mediaAuthorizedAt",NOW()) ELSE "mediaAuthorizedAt" END WHERE id=$3`, ready, authorized, id)
	if err != nil {
		return false, err
	}
	if err := tx.Commit(ctx); err != nil {
		return false, err
	}
	return authorized, nil
}
