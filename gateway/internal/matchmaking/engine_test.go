package matchmaking

import (
	"math"
	"testing"
)

func TestDetermineWeakAndStrongSkills(t *testing.T) {
	t.Run("Distinct scores", func(t *testing.T) {
		skills := UserSkills{
			SubFC:  6.0,
			SubLR:  7.5,
			SubGRA: 5.5, // weakest
			SubP:   8.0, // strongest
		}
		weak, strong, err := DetermineWeakAndStrongSkills(skills)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if weak != SkillGRA {
			t.Errorf("expected weak skill GRA, got %s", weak)
		}
		if strong != SkillP {
			t.Errorf("expected strong skill P, got %s", strong)
		}
	})

	t.Run("Equal scores preserves stable order tie-breaker", func(t *testing.T) {
		skills := UserSkills{
			SubFC:  7.0,
			SubLR:  7.0,
			SubGRA: 7.0,
			SubP:   7.0,
		}
		weak, strong, err := DetermineWeakAndStrongSkills(skills)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		// In stable sort: FC is first (order 0), P is last (order 3)
		if weak != SkillFC {
			t.Errorf("expected weak skill FC on tie, got %s", weak)
		}
		if strong != SkillP {
			t.Errorf("expected strong skill P on tie, got %s", strong)
		}
	})

	t.Run("Invalid scores", func(t *testing.T) {
		_, _, err := DetermineWeakAndStrongSkills(UserSkills{SubFC: -1, SubLR: 7, SubGRA: 7, SubP: 7})
		if err == nil {
			t.Errorf("expected error for negative score")
		}

		_, _, err = DetermineWeakAndStrongSkills(UserSkills{SubFC: 10, SubLR: 7, SubGRA: 7, SubP: 7})
		if err == nil {
			t.Errorf("expected error for score > 9")
		}
	})
}

func TestBandAndBucketKeys(t *testing.T) {
	engine := NewEngine(nil)

	tests := []struct {
		band     float64
		expected string
	}{
		{6.0, "6.0"},
		{6.2, "6.0"},
		{6.3, "6.5"},
		{6.7, "6.5"},
		{6.8, "7.0"},
		{7.0, "7.0"},
		{7.24, "7.0"},
		{7.25, "7.5"},
		{8.5, "8.5"},
	}

	for _, tc := range tests {
		key, err := engine.GetBandKey(tc.band)
		if err != nil {
			t.Fatalf("unexpected error for band %f: %v", tc.band, err)
		}
		if key != tc.expected {
			t.Errorf("band %f: expected key %s, got %s", tc.band, tc.expected, key)
		}
	}

	bucketKey, err := engine.GetBucketKey(6.75, SkillFC, SkillP)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if bucketKey != "match_queue:7.0:FC:P" {
		t.Errorf("expected bucketKey 'match_queue:7.0:FC:P', got '%s'", bucketKey)
	}

	bandPoolKey, err := engine.GetBandPoolKey(6.5)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if bandPoolKey != "match_queue:band:6.5" {
		t.Errorf("expected bandPoolKey 'match_queue:band:6.5', got '%s'", bandPoolKey)
	}

	priorityKey := engine.GetPriorityPoolKey("boss")
	if priorityKey != "match_queue:priority:BOSS" {
		t.Errorf("expected priorityKey 'match_queue:priority:BOSS', got '%s'", priorityKey)
	}

	globalKey := engine.GetGlobalPoolKey()
	if globalKey != "match_queue:global" {
		t.Errorf("expected globalKey 'match_queue:global', got '%s'", globalKey)
	}
}

func TestNewService(t *testing.T) {
	svc := NewService(nil)
	if svc == nil {
		t.Fatal("expected non-nil Service")
	}
	key, err := svc.GetBandKey(6.5)
	if err != nil || key != "6.5" {
		t.Errorf("expected 6.5, got %s, err: %v", key, err)
	}
}

func TestMatchmaking_BandRounding(t *testing.T) {
	engine := NewEngine(nil)

	tests := []struct {
		input    float64
		expected string
	}{
		{5.24, "5.0"},
		{5.25, "5.5"},
		{5.74, "5.5"},
		{5.75, "6.0"},
		{0.0, "0.0"},
		{0.24, "0.0"},
		{0.25, "0.5"},
		{8.74, "8.5"},
		{8.75, "9.0"},
		{9.0, "9.0"},
	}

	for _, tc := range tests {
		got, err := engine.GetBandKey(tc.input)
		if err != nil {
			t.Errorf("unexpected error for band %f: %v", tc.input, err)
		}
		if got != tc.expected {
			t.Errorf("GetBandKey(%f): expected %s, got %s", tc.input, tc.expected, got)
		}
	}
}

func TestMatchmaking_InvalidBands(t *testing.T) {
	engine := NewEngine(nil)

	invalidInputs := []struct {
		name  string
		value float64
	}{
		{"negative band", -0.1},
		{"large negative band", -5.0},
		{"greater than 9.0", 9.1},
		{"band 10.0", 10.0},
		{"NaN", math.NaN()},
		{"+Inf", math.Inf(1)},
		{"-Inf", math.Inf(-1)},
	}

	for _, tc := range invalidInputs {
		t.Run(tc.name, func(t *testing.T) {
			got, err := engine.GetBandKey(tc.value)
			if err == nil {
				t.Errorf("expected error for invalid band %f (%s), got %s", tc.value, tc.name, got)
			}
		})
	}
}
