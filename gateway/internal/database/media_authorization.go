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
