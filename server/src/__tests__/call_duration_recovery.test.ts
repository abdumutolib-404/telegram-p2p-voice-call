import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../index';
import { calculateMixedPlanDuration } from '../services/plan';
import { purgeExpiredRecordings } from '../services/storage';

describe('Extended Call Duration & Resilience Test Suite', () => {
  describe('1. Plan Duration Entitlements', () => {
    it('1.1 FREE plan duration boundary is 15 minutes (900 seconds)', () => {
      const minutes = calculateMixedPlanDuration('FREE', 'FREE');
      expect(minutes).toBe(15);
    });

    it('1.2 PLUS plan duration boundary is 30 minutes (1800 seconds)', () => {
      const minutes = calculateMixedPlanDuration('PLUS', 'FREE');
      expect(minutes).toBe(30);
    });

    it('1.3 PRO plan duration boundary is 60 minutes (3600 seconds)', () => {
      const minutes = calculateMixedPlanDuration('PRO', 'PLUS');
      expect(minutes).toBe(60);
    });
  });

  describe('2. Storage Purge Path Resolution', () => {
    it('2.1 Purges expired recordings without throwing path resolution errors', async () => {
      const result = await purgeExpiredRecordings();
      expect(result).toBeDefined();
      expect(typeof result.purgedCount).toBe('number');
      expect(typeof result.freedSpaceBytes).toBe('number');
    });
  });

  describe('3. Call Route Authorization Security', () => {
    it('3.1 Rejects access to non-existent recording URL with 403 or 404', async () => {
      const res = await request(app)
        .get('/api/calls/non-existent-session-id/recording')
        .set('x-telegram-init-data', 'test-allowed');

      expect([403, 404]).toContain(res.status);
    });
  });
});
