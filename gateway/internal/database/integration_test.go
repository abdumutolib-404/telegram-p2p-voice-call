package database

import (
	"context"
	"fmt"
	"net/url"
	"os"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/google/uuid"
)

func TestIntegrationPostCallOutboxIsAtomic(t *testing.T) {
	db, ctx, ids := isolatedDB(t)
	call := uuid.NewString()
	if err := db.CreateCallSession(ctx, call, call, ids[0], ids[1]); err != nil {
		t.Fatal(err)
	}
	// Fault injection: duplicate work must roll back completion and both charges.
	if _, err := db.Pool.Exec(ctx, `INSERT INTO "PostCallJob" ("callId","updatedAt") VALUES ($1,NOW())`, call); err != nil {
		t.Fatal(err)
	}
	claimed, err := db.CompleteCallSession(ctx, call, 35, nil, nil, nil)
	if err == nil || claimed {
		t.Fatal("outbox failure did not reject completion")
	}
	session, err := db.GetCallSessionByRoomName(ctx, call)
	if err != nil || session.Status != "ACTIVE" {
		t.Fatal("outbox failure did not roll back completion")
	}
	for _, id := range ids[:2] {
		user, err := db.GetUserByID(ctx, id)
		if err != nil || user.DailyCallsUsed != 0 {
			t.Fatal("outbox failure charged a participant")
		}
	}
	if _, err := db.Pool.Exec(ctx, `DELETE FROM "PostCallJob" WHERE "callId"=$1`, call); err != nil {
		t.Fatal(err)
	}
	claimed, err = db.CompleteUnchargedCallSession(ctx, call, 2, nil, nil, nil, CompletionEffects{Reason: "microphone_permission_denied", DeniedUserID: ids[1]})
	if err != nil || !claimed {
		t.Fatalf("completion with durable effects: %v", err)
	}
	var reason, denied, status string
	if err := db.Pool.QueryRow(ctx, `SELECT reason,"deniedUserId",status FROM "PostCallJob" WHERE "callId"=$1`, call).Scan(&reason, &denied, &status); err != nil {
		t.Fatal(err)
	}
	if reason != "microphone_permission_denied" || denied != ids[1] || status != "QUEUED" {
		t.Fatal("completion lost durable metadata")
	}
	claimed, err = db.CompleteCallSession(ctx, call, 100, nil, nil, nil)
	if err != nil || claimed {
		t.Fatal("replay changed a completed call")
	}
	var count int
	if err := db.Pool.QueryRow(ctx, `SELECT COUNT(*) FROM "PostCallJob" WHERE "callId"=$1`, call).Scan(&count); err != nil || count != 1 {
		t.Fatal("replay created duplicate work")
	}
	cancelled := uuid.NewString()
	if err := db.CreateCallSession(ctx, cancelled, cancelled, ids[0], ids[1]); err != nil {
		t.Fatal(err)
	}
	if claimed, err := db.CancelCallSession(ctx, cancelled); err != nil || !claimed {
		t.Fatalf("cancel with durable cleanup: %v", err)
	}
	if err := db.Pool.QueryRow(ctx, `SELECT COUNT(*) FROM "PostCallJob" WHERE "callId"=$1 AND reason='call_cancelled'`, cancelled).Scan(&count); err != nil || count != 1 {
		t.Fatal("cancel lost cleanup job")
	}
}

func isolatedDB(t *testing.T) (*DB, context.Context, []string) {
	t.Helper()
	connection := os.Getenv("PAIRTALK_GATEWAY_TEST_DATABASE_URL")
	if connection == "" {
		t.Skip("isolated PostgreSQL bindings were not supplied")
	}
	u, err := url.Parse(connection)
	if err != nil || u.Hostname() != "127.0.0.1" || u.Port() != "55432" || u.Path != "/pairtalk_check" || os.Getenv("NODE_ENV") != "test" {
		t.Fatal("integration tests require the dedicated loopback database and test environment")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	db, err := NewPool(ctx, connection)
	if err != nil {
		cancel()
		t.Fatal("isolated PostgreSQL connection failed")
	}
	ids := []string{uuid.NewString(), uuid.NewString(), uuid.NewString(), uuid.NewString()}
	t.Cleanup(func() {
		cleanup, stop := context.WithTimeout(context.Background(), 5*time.Second)
		defer stop()
		for _, query := range []string{
			`DELETE FROM "CallSession" WHERE "userAId" = ANY($1) OR "userBId" = ANY($1)`,
			`DELETE FROM "ReferralReward" WHERE "userId" = ANY($1) OR "referredUserId" = ANY($1)`,
			`DELETE FROM "User" WHERE id = ANY($1)`,
		} {
			if _, err := db.Pool.Exec(cleanup, query, ids); err != nil {
				t.Errorf("fixture cleanup failed: %v", err)
			}
		}
		db.Close()
		cancel()
	})
	for i, id := range ids {
		_, err := db.Pool.Exec(ctx, `INSERT INTO "User" (id, "telegramId", alias, "updatedAt") VALUES ($1, $2, $3, NOW())`, id, time.Now().UnixMicro()+int64(i), "gateway-check-"+id)
		if err != nil {
			t.Fatalf("create user fixture: %v", err)
		}
	}
	return db, ctx, ids
}

func TestIntegrationRecordingOwnership(t *testing.T) {
	db, ctx, ids := isolatedDB(t)
	for _, marker := range []string{"BOTH", "ALL", ids[0], ids[0] + "," + ids[1]} {
		id := uuid.NewString()
		_, err := db.Pool.Exec(ctx, `INSERT INTO "CallSession" (id, "roomName", "userAId", "userBId", status, "recordedByUserId", "recordingUrl") VALUES ($1,$1,$2,$3,'COMPLETED',$4,'synthetic.wav')`, id, ids[0], ids[1], marker)
		if err != nil {
			t.Fatal(err)
		}
	}
	for i, id := range []string{ids[0], ids[2]} {
		count, err := db.GetUserRecordingsUsedThisPeriod(ctx, id, nil)
		want := 4
		if i == 1 {
			want = 0
		}
		if err != nil || count != want {
			t.Fatalf("recording ownership: count=%d, want=%d, error=%v", count, want, err)
		}
	}
}

func TestIntegrationConcurrentAdmission(t *testing.T) {
	db, ctx, ids := isolatedDB(t)
	var admitted atomic.Int32
	var wg sync.WaitGroup
	for i := 0; i < 12; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			id := uuid.NewString()
			if err := db.CreateCallSession(ctx, id, id, ids[0], ids[1+i%3]); err == nil {
				admitted.Add(1)
			}
		}(i)
	}
	wg.Wait()
	if admitted.Load() != 1 {
		t.Fatalf("concurrent admission allowed %d calls for one participant", admitted.Load())
	}
}

func TestIntegrationCompletionExactlyOnceAndBonusBoundary(t *testing.T) {
	db, ctx, ids := isolatedDB(t)
	month := time.Now().UTC().Format("2006-01")
	_, err := db.Pool.Exec(ctx, `UPDATE "User" SET "dailyCallsUsed"=2, "lastCallDate"=$1 WHERE id=ANY($2)`, month, ids[:2])
	if err != nil {
		t.Fatal(err)
	}
	reward := uuid.NewString()
	_, err = db.Pool.Exec(ctx, `INSERT INTO "ReferralReward" (id,"userId","referredUserId") VALUES ($1,$2,$3)`, reward, ids[0], ids[2])
	if err != nil {
		t.Fatal(err)
	}
	call := uuid.NewString()
	if err := db.CreateCallSession(ctx, call, call, ids[0], ids[1]); err != nil {
		t.Fatal(err)
	}
	var claims atomic.Int32
	var wg sync.WaitGroup
	errors := make(chan error, 12)
	for i := 0; i < 12; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			claimed, err := db.CompleteCallSession(ctx, call, 30, nil, nil, nil)
			if err != nil {
				errors <- err
			}
			if claimed {
				claims.Add(1)
			}
		}()
	}
	wg.Wait()
	close(errors)
	for err := range errors {
		t.Errorf("completion failed: %v", err)
	}
	if claims.Load() != 1 {
		t.Fatalf("completion claims=%d", claims.Load())
	}
	u, err := db.GetUserByID(ctx, ids[0])
	if err != nil || u.DailyCallsUsed != 3 {
		t.Fatalf("third included call charged incorrectly: %+v, %v", u, err)
	}
	bonus, err := db.GetActiveBonusCallsCount(ctx, ids[0])
	if err != nil || bonus != 1 {
		t.Fatalf("bonus consumed before allowance exhausted: %d, %v", bonus, err)
	}
	call = uuid.NewString()
	if err := db.CreateCallSession(ctx, call, call, ids[0], ids[2]); err != nil {
		t.Fatal(err)
	}
	if claimed, err := db.CompleteCallSession(ctx, call, 30, nil, nil, nil); err != nil || !claimed {
		t.Fatalf("bonus completion: %v", err)
	}
	u, _ = db.GetUserByID(ctx, ids[0])
	bonus, err = db.GetActiveBonusCallsCount(ctx, ids[0])
	if err != nil || bonus != 0 || u.DailyCallsUsed != 3 {
		t.Fatalf("bonus call incorrectly charged: bonus=%d, usage=%d, error=%v", bonus, u.DailyCallsUsed, err)
	}
}

func TestIntegrationCompletionRollsBackOnQuotaWriteFailure(t *testing.T) {
	db, ctx, ids := isolatedDB(t)
	u, _ := db.GetUserByID(ctx, ids[0])
	db.AdminTelegramIDs = []string{fmt.Sprint(u.TelegramID)}
	_, err := db.Pool.Exec(ctx, `UPDATE "User" SET "dailyCallsUsed"=2147483647, "lastCallDate"=$1 WHERE id=$2`, time.Now().UTC().Format("2006-01"), ids[0])
	if err != nil {
		t.Fatal(err)
	}
	call := uuid.NewString()
	if err := db.CreateCallSession(ctx, call, call, ids[0], ids[1]); err != nil {
		t.Fatal(err)
	}
	claimed, err := db.CompleteCallSession(ctx, call, 30, nil, nil, nil)
	if err == nil || claimed {
		t.Fatal("quota persistence failure did not reject completion")
	}
	session, err := db.GetCallSessionByRoomName(ctx, call)
	if err != nil || session.Status != "ACTIVE" {
		t.Fatal("failed quota transaction left a completed session")
	}
	partner, err := db.GetUserByID(ctx, ids[1])
	if err != nil || partner.DailyCallsUsed != 0 {
		t.Fatal("failed completion partially charged partner")
	}
}
