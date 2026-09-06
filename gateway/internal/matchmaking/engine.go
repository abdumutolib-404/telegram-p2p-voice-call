package matchmaking

import (
	"context"
	"errors"
	"fmt"
	"math"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
)

type SkillCode string

const (
	SkillFC  SkillCode = "FC"
	SkillLR  SkillCode = "LR"
	SkillGRA SkillCode = "GRA"
	SkillP   SkillCode = "P"
)

type UserSkills struct {
	SubFC  float64 `json:"subFC"`
	SubLR  float64 `json:"subLR"`
	SubGRA float64 `json:"subGRA"`
	SubP   float64 `json:"subP"`
}

type MatchOptions struct {
	Plan         string `json:"plan,omitempty"`
	WarningCount int    `json:"warningCount,omitempty"`
}

type MatchResult struct {
	Matched          bool   `json:"matched"`
	PartnerID        string `json:"partnerId,omitempty"`
	RoomName         string `json:"roomName,omitempty"`
	BucketKey        string `json:"bucketKey,omitempty"`
	PartnerBucketKey string `json:"partnerBucketKey,omitempty"`
}

const (
	UserQueuePrefix  = "user_queue:"
	MatchQueuePrefix = "match_queue:"
	QueueTTLSeconds  = 15 * 60 // 900 seconds
	UserLockPrefix   = "match_lock:"
	UserLockTTL      = 5000 * time.Millisecond
)

type rankedSkill struct {
	code  SkillCode
	score float64
	order int
}

func DetermineWeakAndStrongSkills(skills UserSkills) (SkillCode, SkillCode, error) {
	ranked := []rankedSkill{
		{code: SkillFC, score: skills.SubFC, order: 0},
		{code: SkillLR, score: skills.SubLR, order: 1},
		{code: SkillGRA, score: skills.SubGRA, order: 2},
		{code: SkillP, score: skills.SubP, order: 3},
	}

	for _, s := range ranked {
		if math.IsNaN(s.score) || math.IsInf(s.score, 0) || s.score < 0 || s.score > 9 {
			return "", "", errors.New("skill scores must be finite values between 0 and 9")
		}
	}

	// Stable sort matching JS Array.prototype.sort
	sort.SliceStable(ranked, func(i, j int) bool {
		if ranked[i].score != ranked[j].score {
			return ranked[i].score < ranked[j].score
		}
		return ranked[i].order < ranked[j].order
	})

	return ranked[0].code, ranked[len(ranked)-1].code, nil
}

type Engine struct {
	rdb *redis.Client
}

func NewEngine(rdb *redis.Client) *Engine {
	return &Engine{rdb: rdb}
}

func (e *Engine) GetBandKey(band float64) (string, error) {
	if math.IsNaN(band) || math.IsInf(band, 0) || band < 0 || band > 9 {
		return "", errors.New("band must be a finite number between 0 and 9")
	}
	rounded := math.Round(band*2) / 2
	return fmt.Sprintf("%.1f", rounded), nil
}

func (e *Engine) GetBucketKey(band float64, weakSkill, strongSkill SkillCode) (string, error) {
	bandKey, err := e.GetBandKey(band)
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("%s%s:%s:%s", MatchQueuePrefix, bandKey, weakSkill, strongSkill), nil
}

func (e *Engine) GetBandPoolKey(band float64) (string, error) {
	bandKey, err := e.GetBandKey(band)
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("%sband:%s", MatchQueuePrefix, bandKey), nil
}

func (e *Engine) GetPriorityPoolKey(tier string) string {
	return fmt.Sprintf("%spriority:%s", MatchQueuePrefix, strings.ToUpper(tier))
}

func (e *Engine) GetGlobalPoolKey() string {
	return fmt.Sprintf("%sglobal", MatchQueuePrefix)
}

func (e *Engine) JoinQueue(ctx context.Context, userID string, band float64, skills UserSkills, options MatchOptions) (*MatchResult, error) {
	if userID == "" || len(userID) > 128 {
		return nil, errors.New("invalid userId")
	}

	var result *MatchResult
	err := e.WithUserLock(ctx, userID, func(lockCtx context.Context) error {
		weakSkill, strongSkill, err := DetermineWeakAndStrongSkills(skills)
		if err != nil {
			return err
		}

		ownBucketKey, err := e.GetBucketKey(band, weakSkill, strongSkill)
		if err != nil {
			return err
		}
		compBucketKey, err := e.GetBucketKey(band, strongSkill, weakSkill)
		if err != nil {
			return err
		}
		bandPoolKey, err := e.GetBandPoolKey(band)
		if err != nil {
			return err
		}

		userPlan := strings.ToUpper(options.Plan)
		if userPlan == "" {
			userPlan = "FREE"
		}
		isPriorityUser := userPlan == "BOSS" || userPlan == "PRO" || userPlan == "PLUS"

		// Progressive search candidate buckets:
		// 1. Priority pools
		// 2. Exact complementary skill match at same band
		// 3. Same skill match at same band (ownBucketKey)
		// 4. Same band general pool
		// 5. Adjacent ±0.5 and ±1.0 band general pools
		candidateBuckets := []string{
			e.GetPriorityPoolKey("BOSS"),
			e.GetPriorityPoolKey("PRO"),
			e.GetPriorityPoolKey("PLUS"),
			compBucketKey,
			ownBucketKey,
			bandPoolKey,
		}

		deltas := []float64{0.5, -0.5, 1.0, -1.0}
		for _, delta := range deltas {
			targetBand := band + delta
			if targetBand >= 4.0 && targetBand <= 9.0 {
				if poolKey, err := e.GetBandPoolKey(targetBand); err == nil {
					candidateBuckets = append(candidateBuckets, poolKey)
				}
			}
		}

		// Cancel any existing unlocked queue registration
		if err := e.cancelQueueUnlocked(lockCtx, userID); err != nil {
			return err
		}

		// Deduplicate candidate buckets keeping order
		seen := make(map[string]bool)
		var uniqueCandidateBuckets []string
		for _, b := range candidateBuckets {
			if !seen[b] {
				seen[b] = true
				uniqueCandidateBuckets = append(uniqueCandidateBuckets, b)
			}
		}

		// Run atomic claim script
		claimArgs := []interface{}{UserQueuePrefix, userID}
		claimRes, err := e.rdb.Eval(
			lockCtx,
			MatchQueueMultiClaimScript,
			uniqueCandidateBuckets,
			claimArgs...,
		).Result()

		if err != nil && !errors.Is(err, redis.Nil) {
			return err
		}

		var claimedPartner string
		var partnerBucketKey string

		if sliceRes, ok := claimRes.([]interface{}); ok && len(sliceRes) >= 2 {
			if p, ok := sliceRes[0].(string); ok {
				claimedPartner = p
			}
			if b, ok := sliceRes[1].(string); ok {
				partnerBucketKey = b
			}
		}

		if claimedPartner != "" && partnerBucketKey != "" && claimedPartner != userID {
			result = &MatchResult{
				Matched:          true,
				PartnerID:        claimedPartner,
				RoomName:         fmt.Sprintf("room_%s", uuid.NewString()),
				PartnerBucketKey: partnerBucketKey,
			}
			return nil
		}

		// No partner matched yet: register user into pools
		poolsToRegister := []string{ownBucketKey, bandPoolKey}
		if isPriorityUser {
			poolsToRegister = append(poolsToRegister, e.GetPriorityPoolKey(userPlan))
		}

		pipe := e.rdb.Pipeline()
		for _, k := range poolsToRegister {
			pipe.SAdd(lockCtx, k, userID)
			pipe.Expire(lockCtx, k, QueueTTLSeconds*2*time.Second)
		}
		pipe.Set(lockCtx, fmt.Sprintf("%s%s", UserQueuePrefix, userID), ownBucketKey, QueueTTLSeconds*time.Second)

		if _, err := pipe.Exec(lockCtx); err != nil {
			// Rollback registered pools
			remPipe := e.rdb.Pipeline()
			for _, k := range poolsToRegister {
				remPipe.SRem(lockCtx, k, userID)
			}
			_, _ = remPipe.Exec(lockCtx)
			return err
		}

		result = &MatchResult{
			Matched:   false,
			BucketKey: ownBucketKey,
		}
		return nil
	})

	return result, err
}

var bandRegex = regexp.MustCompile(`match_queue:([0-9.]+)`)

func (e *Engine) RestoreQueue(ctx context.Context, userID, bucketKey string, bandOpt *float64, planOpt *string) error {
	if userID == "" || len(userID) > 128 {
		return errors.New("invalid userId")
	}
	if !strings.HasPrefix(bucketKey, MatchQueuePrefix) {
		return errors.New("invalid queue bucket")
	}

	return e.WithUserLock(ctx, userID, func(lockCtx context.Context) error {
		poolsToRegister := []string{bucketKey}

		var band float64 = -1
		if bandOpt != nil {
			band = *bandOpt
		} else {
			m := bandRegex.FindStringSubmatch(bucketKey)
			if len(m) >= 2 {
				if parsed, err := strconv.ParseFloat(m[1], 64); err == nil {
					band = parsed
				}
			}
		}

		if band >= 0 && band <= 9 {
			if poolKey, err := e.GetBandPoolKey(band); err == nil {
				poolsToRegister = append(poolsToRegister, poolKey)
			}
		}

		if planOpt != nil {
			tier := strings.ToUpper(*planOpt)
			if tier == "PLUS" || tier == "PRO" || tier == "BOSS" {
				poolsToRegister = append(poolsToRegister, e.GetPriorityPoolKey(tier))
			}
		}

		pipe := e.rdb.Pipeline()
		for _, pool := range poolsToRegister {
			pipe.SAdd(lockCtx, pool, userID)
			pipe.Expire(lockCtx, pool, QueueTTLSeconds*2*time.Second)
		}
		pipe.Set(lockCtx, fmt.Sprintf("%s%s", UserQueuePrefix, userID), bucketKey, QueueTTLSeconds*time.Second)

		_, err := pipe.Exec(lockCtx)
		return err
	})
}

func (e *Engine) CancelQueue(ctx context.Context, userID string) (bool, error) {
	if userID == "" || len(userID) > 128 {
		return false, errors.New("invalid userId")
	}

	var cancelled bool
	err := e.WithUserLock(ctx, userID, func(lockCtx context.Context) error {
		pointerKey := fmt.Sprintf("%s%s", UserQueuePrefix, userID)
		res, err := e.rdb.Eval(lockCtx, CancelQueueScript, []string{pointerKey}, userID).Result()
		if err != nil && !errors.Is(err, redis.Nil) {
			return err
		}

		bands := []float64{4.0, 4.5, 5.0, 5.5, 6.0, 6.5, 7.0, 7.5, 8.0, 8.5, 9.0}
		pipe := e.rdb.Pipeline()
		for _, b := range bands {
			if k, err := e.GetBandPoolKey(b); err == nil {
				pipe.SRem(lockCtx, k, userID)
			}
		}
		pipe.SRem(lockCtx, e.GetGlobalPoolKey(), userID)
		pipe.SRem(lockCtx, e.GetPriorityPoolKey("BOSS"), userID)
		pipe.SRem(lockCtx, e.GetPriorityPoolKey("PRO"), userID)
		pipe.SRem(lockCtx, e.GetPriorityPoolKey("PLUS"), userID)

		_, _ = pipe.Exec(lockCtx)

		if intRes, ok := res.(int64); ok && intRes == 1 {
			cancelled = true
		}
		return nil
	})

	return cancelled, err
}

func (e *Engine) cancelQueueUnlocked(ctx context.Context, userID string) error {
	pointerKey := fmt.Sprintf("%s%s", UserQueuePrefix, userID)
	_, _ = e.rdb.Eval(ctx, CancelQueueScript, []string{pointerKey}, userID).Result()

	bands := []float64{4.0, 4.5, 5.0, 5.5, 6.0, 6.5, 7.0, 7.5, 8.0, 8.5, 9.0}
	pipe := e.rdb.Pipeline()
	for _, b := range bands {
		if k, err := e.GetBandPoolKey(b); err == nil {
			pipe.SRem(ctx, k, userID)
		}
	}
	pipe.SRem(ctx, e.GetGlobalPoolKey(), userID)
	pipe.SRem(ctx, e.GetPriorityPoolKey("BOSS"), userID)
	pipe.SRem(ctx, e.GetPriorityPoolKey("PRO"), userID)
	pipe.SRem(ctx, e.GetPriorityPoolKey("PLUS"), userID)

	_, err := pipe.Exec(ctx)
	return err
}

func (e *Engine) WithUserLock(ctx context.Context, userID string, fn func(ctx context.Context) error) error {
	lockKey := fmt.Sprintf("%s%s", UserLockPrefix, userID)
	token := uuid.NewString()
	deadline := time.Now().Add(UserLockTTL)

	for time.Now().Before(deadline) {
		ok, err := e.rdb.SetNX(ctx, lockKey, token, UserLockTTL).Result()
		if err == nil && ok {
			defer func() {
				_, _ = e.rdb.Eval(context.Background(), LockReleaseScript, []string{lockKey}, token).Result()
			}()
			return fn(ctx)
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(25 * time.Millisecond):
		}
	}

	return errors.New("unable to acquire matchmaking lock")
}
