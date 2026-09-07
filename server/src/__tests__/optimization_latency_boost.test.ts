import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { app } from '../index';
import { prisma } from '../config/database';
import { getRedis } from '../config/redis';
import { isModalAlertCallback, isStandardNavigationCallback } from '../bot/bot';
import {
  getUserCallsUsedThisPeriod,
  getUserRecordingsUsedThisPeriod,
} from '../services/plan';
import { invalidateIeltsQuestionCache } from '../routes/ielts';

describe('Optimization, Latency Boost & Media Caching Test Suite', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    await invalidateIeltsQuestionCache();
  });

  describe('1. Fast-ACK Callback Query Classification', () => {
    it('1.1 Accurately classifies standard navigation callbacks for early Fast-ACK', () => {
      const navigationCallbacks = [
        'set_sub_fc:7.5',
        'set_sub_lr:6.0',
        'set_sub_gra:7.0',
        'set_sub_p:8.0',
        'confirm_subscores',
        're_evaluate_subscores',
        'toggle_dnd',
        'submit_appeal',
        'view_hall_of_fame',
        'get_my_invite_link',
      ];

      for (const cb of navigationCallbacks) {
        expect(isStandardNavigationCallback(cb)).toBe(true);
        expect(isModalAlertCallback(cb)).toBe(false);
      }
    });

    it('1.2 Preserves modal popups and alerts for sensitive or error actions', () => {
      const alertCallbacks = [
        'mute_surge_alerts',
        'direct_call:partner_123',
        'call_favorite:fav_456',
        'accept_direct:sess_789',
        'decline_direct:sess_789',
        'cancel_direct:sess_789',
        'favorite_partner:12345',
        'remove_favorite:67890',
        'rate_call:sess_1:5',
        'report_partner:sess_2',
        'request_refund',
        'exec_stars_refund:tx_123',
        'submit_uzs_refund:req_456',
        'cancel_refund',
        'play_rec:sess_111',
        'play_recording:sess_222',
        'plan:PRO',
        'pay_stars:PLUS',
        'pay_card:PRO',
        'pay_click:BOSS',
        'pay_payme:PLUS',
        'pay_uzcard:PRO',
        'cancel_pay:order_333',
        'cancel_manual_pay:req_123',
      ];

      for (const cb of alertCallbacks) {
        expect(isModalAlertCallback(cb)).toBe(true);
        expect(isStandardNavigationCallback(cb)).toBe(false);
      }
    });
  });

  describe('2. Database Query & Cached Columns Optimization', () => {
    it('2.1 getUserCallsUsedThisPeriod leverages cached dailyCallsUsed when lastCallDate matches current month', async () => {
      const currentMonth = new Date().toISOString().slice(0, 7);
      const user = await prisma.user.create({
        data: {
          telegramId: BigInt(99887711),
          alias: 'CachedCallsUser',
          plan: 'PLUS',
          lastCallDate: `${currentMonth}-15`,
          dailyCallsUsed: 4,
        },
      });

      const used = await getUserCallsUsedThisPeriod(user.id, user);
      expect(used).toBe(4);
    });

    it('2.2 getUserRecordingsUsedThisPeriod accurately counts single, BOTH and legacy recordings using indexed exact matching', async () => {
      const userA = await prisma.user.create({
        data: {
          telegramId: BigInt(99887722),
          alias: 'RecUserA',
          plan: 'PRO',
        },
      });

      const userB = await prisma.user.create({
        data: {
          telegramId: BigInt(99887733),
          alias: 'RecUserB',
          plan: 'BOSS',
        },
      });

      // 1. Single recorder session for userA
      await prisma.callSession.create({
        data: {
          roomName: `single_rec_a_${Date.now()}`,
          userAId: userA.id,
          userBId: userB.id,
          recordedByUserId: userA.id,
          status: 'COMPLETED',
          recordingUrl: 'recordings/rec_single.mp3',
          duration: 300,
        },
      });

      // 2. Explicit 'BOTH' session
      await prisma.callSession.create({
        data: {
          roomName: `both_rec_${Date.now()}`,
          userAId: userA.id,
          userBId: userB.id,
          recordedByUserId: 'BOTH',
          status: 'COMPLETED',
          recordingUrl: 'recordings/rec_both.mp3',
          duration: 500,
        },
      });

      // 3. Legacy session where recordedByUserId is null
      await prisma.callSession.create({
        data: {
          roomName: `legacy_rec_${Date.now()}`,
          userAId: userA.id,
          userBId: userB.id,
          recordedByUserId: null,
          status: 'COMPLETED',
          recordingUrl: 'recordings/rec_legacy.mp3',
          duration: 200,
        },
      });

      // 4. Single recorder session for userB
      await prisma.callSession.create({
        data: {
          roomName: `single_rec_b_${Date.now()}`,
          userAId: userA.id,
          userBId: userB.id,
          recordedByUserId: userB.id,
          status: 'COMPLETED',
          recordingUrl: 'recordings/rec_single_b.mp3',
          duration: 350,
        },
      });

      const countA = await getUserRecordingsUsedThisPeriod(userA.id);
      const countB = await getUserRecordingsUsedThisPeriod(userB.id);

      // User A was part of: 1 single + 1 BOTH + 1 legacy = 3
      expect(countA).toBe(3);
      // User B was part of: 1 single + 1 BOTH + 1 legacy = 3
      expect(countB).toBe(3);
    });
  });

  describe('3. Telegram File ID Media Caching', () => {
    it('3.1 Redis stores and retrieves plans_pricing file_id', async () => {
      const redis = getRedis();
      const testFileId = 'BAACAgIAAxkBAAIJ123456789_test_file_id';

      await redis.set('bot:file_id:plans_pricing', testFileId, 'EX', 3600);
      const retrieved = await redis.get('bot:file_id:plans_pricing');

      expect(retrieved).toBe(testFileId);

      await redis.del('bot:file_id:plans_pricing');
      const afterDel = await redis.get('bot:file_id:plans_pricing');
      expect(afterDel).toBeNull();
    });
  });

  describe('4. Outside-Telegram UI Questions Drawer Redis Caching', () => {
    it('4.1 Caches GET /api/ielts/questions responses in Redis with 5-minute TTL', async () => {
      const redis = getRedis();

      // First request (cache miss -> database query -> cache write)
      const res1 = await request(app).get('/api/ielts/questions?part=PART_1&topicId=all&limit=10&page=1');
      expect(res1.status).toBe(200);
      expect(res1.body.success).toBe(true);

      const cacheKey = 'cache:ielts:questions:all:PART_1:1:10';
      const cached = await redis.get(cacheKey);
      expect(cached).not.toBeNull();

      const parsed = JSON.parse(cached!);
      expect(parsed.success).toBe(true);
      expect(parsed.pagination.limit).toBe(10);

      // Second request (served from Redis cache)
      const res2 = await request(app).get('/api/ielts/questions?part=PART_1&topicId=all&limit=10&page=1');
      expect(res2.status).toBe(200);
      expect(res2.body).toEqual(res1.body);

      // Request with fresh=true bypasses cache
      const resFresh = await request(app).get('/api/ielts/questions?part=PART_1&topicId=all&limit=10&page=1&fresh=true');
      expect(resFresh.status).toBe(200);
      expect(resFresh.body.success).toBe(true);

      // Invalidate cache
      await invalidateIeltsQuestionCache();
      const afterInvalidate = await redis.get(cacheKey);
      expect(afterInvalidate).toBeNull();
    });
  });
});
