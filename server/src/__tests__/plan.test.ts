import { describe, it, expect } from 'vitest';
import { calculateMixedPlanDuration, getRetentionDaysForPlan, getPlansConfig, updatePlansConfig } from '../services/plan';

describe('Plan & Duration Service', () => {
  it('calculates mixed-plan duration granting max(limitA, limitB)', () => {
    // FREE (15m) vs FREE (15m) -> 15m
    expect(calculateMixedPlanDuration('FREE', 'FREE')).toBe(15);

    // FREE (15m) vs PLUS (30m) -> 30m
    expect(calculateMixedPlanDuration('FREE', 'PLUS')).toBe(30);

    // PLUS (30m) vs PRO (60m) -> 60m
    expect(calculateMixedPlanDuration('PLUS', 'PRO')).toBe(60);

    // FREE (15m) vs PRO (60m) -> 60m
    expect(calculateMixedPlanDuration('FREE', 'PRO')).toBe(60);
  });

  it('retrieves correct retention days per tier', () => {
    expect(getRetentionDaysForPlan('FREE')).toBe(1);
    expect(getRetentionDaysForPlan('PLUS')).toBe(7);
    expect(getRetentionDaysForPlan('PRO')).toBe(30);
  });

  it('allows dynamic updating of plan limits by admin', () => {
    updatePlansConfig({
      FREE: { maxDuration: 20, dailyLimit: 5, retentionDays: 2, starsPrice: 0 },
    });

    expect(getPlansConfig().FREE.maxDuration).toBe(20);
    expect(calculateMixedPlanDuration('FREE', 'FREE')).toBe(20);

    // Reset to defaults
    updatePlansConfig({
      FREE: { maxDuration: 15, dailyLimit: 3, retentionDays: 1, starsPrice: 0 },
    });
  });
});
