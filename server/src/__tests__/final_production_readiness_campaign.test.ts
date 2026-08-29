import { describe, it, expect, beforeEach } from 'vitest';
import {
  getEffectiveEntitlement,
  getPaidUserProfile,
  getUserCallsUsedThisPeriod,
  getUserRecordingsUsedThisPeriod,
  plansConfig,
} from '../services/plan';
import { prisma } from '../config/database';

import { env } from '../config/env';

describe('Final Production Readiness Campaign Test Suite', () => {
  const testAdminId = '7200560574';

  beforeEach(async () => {
    if (!env.ADMIN_TELEGRAM_IDS.includes(testAdminId)) {
      (env.ADMIN_TELEGRAM_IDS as string[]).push(testAdminId);
    }
  });

  describe('1. Server-Authoritative Plan & Entitlement Resolver', () => {
    it('1.1 FREE plan has finite 3 calls/month and is never marked isUnlimited', () => {
      const ent = getEffectiveEntitlement({ plan: 'FREE' });
      expect(ent.plan).toBe('FREE');
      expect(ent.callLimit).toBe(3);
      expect(ent.dailyLimit).toBe(3);
      expect(ent.maxCallDuration).toBe(15);
      expect(ent.recordingLimit).toBe(1);
      expect(ent.retentionDays).toBe(1);
      expect(ent.isUnlimited).toBe(false);
      expect(ent.starsPrice).toBe(0);
      expect(ent.uzsPrice).toBe(0);
    });

    it('1.2 PLUS plan has finite 10 calls/month and is never marked isUnlimited', () => {
      const ent = getEffectiveEntitlement({ plan: 'PLUS' });
      expect(ent.plan).toBe('PLUS');
      expect(ent.callLimit).toBe(10);
      expect(ent.dailyLimit).toBe(10);
      expect(ent.maxCallDuration).toBe(30);
      expect(ent.recordingLimit).toBe(3);
      expect(ent.retentionDays).toBe(7);
      expect(ent.isUnlimited).toBe(false);
      expect(ent.starsPrice).toBe(79);
      expect(ent.uzsPrice).toBe(15000);
    });

    it('1.3 PRO plan has finite 25 calls/month and is never marked isUnlimited', () => {
      const ent = getEffectiveEntitlement({ plan: 'PRO' });
      expect(ent.plan).toBe('PRO');
      expect(ent.callLimit).toBe(25);
      expect(ent.dailyLimit).toBe(25);
      expect(ent.maxCallDuration).toBe(60);
      expect(ent.recordingLimit).toBe(7);
      expect(ent.retentionDays).toBe(30);
      expect(ent.isUnlimited).toBe(false);
      expect(ent.starsPrice).toBe(255);
      expect(ent.uzsPrice).toBe(55000);
    });

    it('1.4 BOSS plan has finite 50 calls/month and is never marked isUnlimited', () => {
      const ent = getEffectiveEntitlement({ plan: 'BOSS' });
      expect(ent.plan).toBe('BOSS');
      expect(ent.callLimit).toBe(50);
      expect(ent.dailyLimit).toBe(50);
      expect(ent.maxCallDuration).toBe(90);
      expect(ent.recordingLimit).toBe(15);
      expect(ent.retentionDays).toBe(90);
      expect(ent.isUnlimited).toBe(false);
      expect(ent.starsPrice).toBe(679);
      expect(ent.uzsPrice).toBe(149000);
    });

    it('1.5 Whitelisted admin is marked isUnlimited with 999 limit', () => {
      const ent = getEffectiveEntitlement({
        plan: 'FREE',
        telegramId: '7200560574',
      });
      expect(ent.isAdmin).toBe(true);
      expect(ent.isUnlimited).toBe(true);
      expect(ent.callLimit).toBe(999);
    });
  });

  describe('2. User Profile Entitlement & Credit Counting Formatting', () => {
    it('2.1 Profile formats calls remaining as CURRENT_REMAINING / PLAN_MONTHLY_LIMIT for PLUS', () => {
      const profile = getPaidUserProfile({
        plan: 'PLUS',
        dailyCallsUsed: 7,
        recordingsUsed: 1,
      });

      expect(profile.callsRemaining).toBe('3 / 10');
      expect(profile.recordingsRemaining).toBe('2 / 3');
      expect(profile.maxCallDuration).toBe(30);
      expect(profile.recordingRetention).toBe(7);
    });

    it('2.2 Profile formats calls remaining as CURRENT_REMAINING / PLAN_MONTHLY_LIMIT for PRO', () => {
      const profile = getPaidUserProfile({
        plan: 'PRO',
        dailyCallsUsed: 8,
        recordingsUsed: 0,
      });

      expect(profile.callsRemaining).toBe('17 / 25');
      expect(profile.recordingsRemaining).toBe('7 / 7');
      expect(profile.maxCallDuration).toBe(60);
      expect(profile.recordingRetention).toBe(30);
    });

    it('2.3 Profile formats calls remaining as CURRENT_REMAINING / PLAN_MONTHLY_LIMIT for BOSS', () => {
      const profile = getPaidUserProfile({
        plan: 'BOSS',
        dailyCallsUsed: 9,
        recordingsUsed: 4,
      });

      expect(profile.callsRemaining).toBe('41 / 50');
      expect(profile.recordingsRemaining).toBe('11 / 15');
      expect(profile.maxCallDuration).toBe(90);
      expect(profile.recordingRetention).toBe(90);
    });

    it('2.4 Profile formats calls remaining as CURRENT_REMAINING / PLAN_MONTHLY_LIMIT for FREE', () => {
      const profile = getPaidUserProfile({
        plan: 'FREE',
        dailyCallsUsed: 1,
        recordingsUsed: 0,
      });

      expect(profile.callsRemaining).toBe('2 / 3');
      expect(profile.recordingsRemaining).toBe('1 / 1');
      expect(profile.maxCallDuration).toBe(15);
      expect(profile.recordingRetention).toBe(1);
    });

    it('2.5 Admin user shows Unlimited calls and recordings', () => {
      const profile = getPaidUserProfile({
        plan: 'FREE',
        telegramId: '7200560574',
      });

      expect(profile.callsRemaining).toBe('Unlimited');
      expect(profile.recordingsRemaining).toBe('Unlimited');
    });

    it('2.6 Clamps calls remaining to 0 when usage exceeds limit', () => {
      const profile = getPaidUserProfile({
        plan: 'FREE',
        dailyCallsUsed: 5,
        recordingsUsed: 2,
      });

      expect(profile.callsRemaining).toBe('0 / 3');
      expect(profile.recordingsRemaining).toBe('0 / 1');
    });
  });

  describe('3. Authoritative Period Usage Calculators', () => {
    it('3.1 getUserCallsUsedThisPeriod returns 0 when no calls in period', async () => {
      const count = await getUserCallsUsedThisPeriod('non-existent-user-id');
      expect(count).toBe(0);
    });

    it('3.2 getUserRecordingsUsedThisPeriod returns 0 when no recordings in period', async () => {
      const count = await getUserRecordingsUsedThisPeriod('non-existent-user-id');
      expect(count).toBe(0);
    });
  });
});
