package matchmaking

import (
	"context"
	"strconv"
	"sync/atomic"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
)

// Execute the production Lua over a real Redis-compatible protocol/server.
// Each test owns a fresh loopback server; no external bindings are used.
func queueTestClient(t *testing.T) (*redis.Client, *miniredis.Miniredis) {
	t.Helper()
	server := miniredis.RunT(t)
	client := redis.NewClient(&redis.Options{Addr: server.Addr(), MaxRetries: -1})
	t.Cleanup(func() { _ = client.Close() })
	return client, server
}

// Hold both completed claim commands before the Go callers can proceed. The
// old implementation then registers two unmatched users; the atomic script
// must have registered the first before the second claim executes.
type claimBarrier struct {
	arrived atomic.Int32
	ready   chan struct{}
}

func (b *claimBarrier) DialHook(next redis.DialHook) redis.DialHook { return next }
func (b *claimBarrier) ProcessPipelineHook(next redis.ProcessPipelineHook) redis.ProcessPipelineHook {
	return next
}
func (b *claimBarrier) ProcessHook(next redis.ProcessHook) redis.ProcessHook {
	return func(ctx context.Context, cmd redis.Cmder) error {
		err := next(ctx, cmd)
		args := cmd.Args()
		if cmd.Name() == "eval" && len(args) > 1 && args[1] == MatchQueueMultiClaimScript {
			if b.arrived.Add(1) == 2 {
				close(b.ready)
			}
			select {
			case <-b.ready:
			case <-ctx.Done():
				return ctx.Err()
			}
		}
		return err
	}
}

func TestConcurrentJoinCannotStrandCompatibleUsers(t *testing.T) {
	for _, bands := range [][2]float64{{6.5, 6.5}, {9, 8.5}, {8.5, 9}} {
		t.Run(fmtBands(bands), func(t *testing.T) {
			client, _ := queueTestClient(t)
			client.AddHook(&claimBarrier{ready: make(chan struct{})})
			engine := NewEngine(client)
			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()
			ids := [2]string{uuid.NewString(), uuid.NewString()}
			type outcome struct {
				user   int
				result *MatchResult
				err    error
			}
			results := make(chan outcome, 2)
			for i := range ids {
				go func(i int) {
					result, err := engine.JoinQueue(ctx, ids[i], bands[i], UserSkills{6, 6, 6, 6}, MatchOptions{Plan: "FREE"})
					results <- outcome{i, result, err}
				}(i)
			}
			matches := 0
			for range ids {
				select {
				case outcome := <-results:
					if outcome.err != nil {
						t.Fatal(outcome.err)
					}
					if outcome.result.Matched {
						matches++
						if outcome.result.PartnerID != ids[1-outcome.user] || outcome.result.RoomName == "" {
							t.Fatal("incorrect partner or missing room")
						}
					}
				case <-ctx.Done():
					t.Fatal("concurrent joins did not complete")
				}
			}
			if matches != 1 {
				t.Fatalf("expected exactly one match; got %d (both compatible users can remain searching)", matches)
			}
			if count, err := client.Exists(ctx, UserQueuePrefix+ids[0], UserQueuePrefix+ids[1]).Result(); err != nil || count != 0 {
				t.Fatalf("matched users retained queue pointers: count=%d err=%v", count, err)
			}
			keys, err := client.Keys(ctx, MatchQueuePrefix+"*").Result()
			if err != nil || len(keys) != 0 {
				t.Fatalf("matched users retained pool entries: count=%d err=%v", len(keys), err)
			}
		})
	}
}

func fmtBands(bands [2]float64) string {
	return strconv.FormatFloat(bands[0], 'f', 1, 64) + "_and_" + strconv.FormatFloat(bands[1], 'f', 1, 64)
}

func TestQueueRegistrationExpiryAndCancellation(t *testing.T) {
	client, server := queueTestClient(t)
	engine := NewEngine(client)
	ctx := context.Background()
	id := uuid.NewString()
	result, err := engine.JoinQueue(ctx, id, 8.5, UserSkills{6, 6, 6, 6}, MatchOptions{Plan: "PRO"})
	if err != nil || result.Matched {
		t.Fatalf("first join: result=%v err=%v", result, err)
	}
	if client.TTL(ctx, UserQueuePrefix+id).Val() != QueueTTLSeconds*time.Second {
		t.Fatal("user queue TTL changed")
	}
	for _, pool := range []string{result.BucketKey, "match_queue:band:8.5", engine.GetPriorityPoolKey("PRO")} {
		if member, err := client.SIsMember(ctx, pool, id).Result(); err != nil || !member {
			t.Fatalf("missing pool registration: %s err=%v", pool, err)
		}
		if client.TTL(ctx, pool).Val() != QueueTTLSeconds*2*time.Second {
			t.Fatal("pool TTL changed")
		}
	}
	if cancelled, err := engine.CancelQueue(ctx, id); err != nil || !cancelled {
		t.Fatalf("cancel: result=%v err=%v", cancelled, err)
	}
	if keys := server.Keys(); len(keys) != 0 {
		t.Fatalf("cancelled user retained queue entries: %d", len(keys))
	}
}

func TestQueueBandAndPriorityPolicy(t *testing.T) {
	t.Run("free users outside adjacent bands remain queued", func(t *testing.T) {
		client, _ := queueTestClient(t)
		engine := NewEngine(client)
		ctx := context.Background()
		first, distant, adjacent := uuid.NewString(), uuid.NewString(), uuid.NewString()
		for i, id := range []string{first, distant} {
			result, err := engine.JoinQueue(ctx, id, []float64{4, 9}[i], UserSkills{6, 6, 6, 6}, MatchOptions{Plan: "FREE"})
			if err != nil || result.Matched {
				t.Fatalf("ineligible bands matched: result=%v err=%v", result, err)
			}
		}
		result, err := engine.JoinQueue(ctx, adjacent, 4.5, UserSkills{6, 6, 6, 6}, MatchOptions{Plan: "FREE"})
		if err != nil || !result.Matched || result.PartnerID != first {
			t.Fatalf("adjacent band did not match eligible user: result=%v err=%v", result, err)
		}
		if count, err := client.Exists(ctx, UserQueuePrefix+distant).Result(); err != nil || count != 1 {
			t.Fatal("ineligible waiting user was removed")
		}
	})
	t.Run("existing priority order precedes exact skill matches", func(t *testing.T) {
		client, _ := queueTestClient(t)
		engine := NewEngine(client)
		ctx := context.Background()
		boss, plus, exact := uuid.NewString(), uuid.NewString(), uuid.NewString()
		for i, id := range []string{boss, plus, exact} {
			band, plan := 8.5, []string{"BOSS", "PLUS", "FREE"}[i]
			if err := engine.RestoreQueue(ctx, id, "match_queue:8.5:P:FC", &band, &plan); err != nil {
				t.Fatal(err)
			}
		}
		result, err := engine.JoinQueue(ctx, uuid.NewString(), 8.5, UserSkills{5, 6, 6, 7}, MatchOptions{Plan: "FREE"})
		if err != nil || !result.Matched || result.PartnerID != boss {
			t.Fatalf("priority order changed: result=%v err=%v", result, err)
		}
		if count, err := client.Exists(ctx, UserQueuePrefix+boss).Result(); err != nil || count != 0 {
			t.Fatal("claimed priority user retained pointer")
		}
	})
}

func TestQueueSkipsExpiredCandidatesAndNeverMatchesSelf(t *testing.T) {
	client, server := queueTestClient(t)
	engine := NewEngine(client)
	ctx := context.Background()
	stale, current, peer := uuid.NewString(), uuid.NewString(), uuid.NewString()
	if _, err := engine.JoinQueue(ctx, stale, 9, UserSkills{6, 6, 6, 6}, MatchOptions{}); err != nil {
		t.Fatal(err)
	}
	server.FastForward((QueueTTLSeconds + 1) * time.Second)
	for range 2 {
		result, err := engine.JoinQueue(ctx, current, 9, UserSkills{6, 6, 6, 6}, MatchOptions{})
		if err != nil || result.Matched {
			t.Fatalf("expired candidate or self was matched: result=%v err=%v", result, err)
		}
	}
	result, err := engine.JoinQueue(ctx, peer, 8.5, UserSkills{6, 6, 6, 6}, MatchOptions{})
	if err != nil || !result.Matched || result.PartnerID != current {
		t.Fatalf("healthy candidate did not match: result=%v err=%v", result, err)
	}
}

func TestConcurrentQueueClaimsEachUserAtMostOnce(t *testing.T) {
	client, _ := queueTestClient(t)
	engine := NewEngine(client)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	const count = 20
	ids := make([]string, count)
	for i := range ids {
		ids[i] = uuid.NewString()
	}
	type outcome struct {
		id     string
		result *MatchResult
		err    error
	}
	results, start := make(chan outcome, count), make(chan struct{})
	for _, id := range ids {
		go func(id string) {
			<-start
			result, err := engine.JoinQueue(ctx, id, 8.5, UserSkills{6, 6, 6, 6}, MatchOptions{})
			results <- outcome{id, result, err}
		}(id)
	}
	close(start)
	claimed := make(map[string]bool)
	for range ids {
		select {
		case outcome := <-results:
			if outcome.err != nil {
				t.Fatal(outcome.err)
			}
			if outcome.result.Matched {
				for _, id := range []string{outcome.id, outcome.result.PartnerID} {
					if claimed[id] {
						t.Fatal("a user was claimed in more than one pair")
					}
					claimed[id] = true
				}
			}
		case <-ctx.Done():
			t.Fatal("concurrent queue joins did not finish")
		}
	}
	if len(claimed) != count {
		t.Fatalf("matched %d of %d compatible concurrent users", len(claimed), count)
	}
}

func TestBoundedScanDoesNotRemoveTheFiftyFirstCandidate(t *testing.T) {
	client, _ := queueTestClient(t)
	ctx := context.Background()
	pool := "match_queue:scan-regression"
	for range 51 {
		if err := client.SAdd(ctx, pool, uuid.NewString()).Err(); err != nil {
			t.Fatal(err)
		}
	}
	_, err := client.Eval(ctx, MatchQueueMultiClaimScript, []string{pool, "match_queue:9.0:FC:LR", "user_queue:joining"}, UserQueuePrefix, "joining", 1, "match_queue:9.0:FC:LR", 900).Result()
	if err != nil && err != redis.Nil {
		t.Fatal(err)
	}
	if count := client.SCard(ctx, pool).Val(); count != 1 {
		t.Fatalf("scan removed %d candidates; budget is 50", 51-count)
	}
}

func TestDistantPriorityCannotOverrideBandFit(t *testing.T) {
	client, _ := queueTestClient(t)
	engine, ctx := NewEngine(client), context.Background()
	distant, near := uuid.NewString(), uuid.NewString()
	for i, id := range []string{distant, near} {
		band, plan := []float64{9, 4.5}[i], []string{"BOSS", "PLUS"}[i]
		if err := engine.RestoreQueue(ctx, id, "match_queue:"+strconv.FormatFloat(band, 'f', 1, 64)+":FC:LR", &band, &plan); err != nil {
			t.Fatal(err)
		}
	}
	result, err := engine.JoinQueue(ctx, uuid.NewString(), 4, UserSkills{6, 6, 6, 6}, MatchOptions{})
	if err != nil || !result.Matched || result.PartnerID != near {
		t.Fatalf("priority ignored eligible band: %+v, %v", result, err)
	}
	if !client.SIsMember(ctx, engine.GetPriorityPoolKey("BOSS"), distant).Val() || client.Get(ctx, UserQueuePrefix+distant).Val() == "" {
		t.Fatal("ineligible waiting user was lost")
	}
}
