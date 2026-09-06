package matchmaking

import (
	"context"

	"github.com/redis/go-redis/v9"
)

// Service defines the matchmaking service contract matching Node's matchmakingService.
type Service interface {
	GetBandKey(band float64) (string, error)
	GetBucketKey(band float64, weakSkill, strongSkill SkillCode) (string, error)
	GetBandPoolKey(band float64) (string, error)
	GetPriorityPoolKey(tier string) string
	GetGlobalPoolKey() string
	JoinQueue(ctx context.Context, userID string, band float64, skills UserSkills, options MatchOptions) (*MatchResult, error)
	RestoreQueue(ctx context.Context, userID, bucketKey string, bandOpt *float64, planOpt *string) error
	CancelQueue(ctx context.Context, userID string) (bool, error)
	WithUserLock(ctx context.Context, userID string, fn func(ctx context.Context) error) error
}

// NewService creates a new Service instance backed by the Redis engine.
func NewService(rdb *redis.Client) Service {
	return NewEngine(rdb)
}
