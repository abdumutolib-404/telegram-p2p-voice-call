import crypto from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { prisma } from '../config/database';
import { saveCallQualityRating } from '../services/callFeedback';
import { moderationService } from '../services/moderation';

afterEach(async () => { await prisma.callRating.deleteMany(); await prisma.callSession.deleteMany(); await prisma.user.deleteMany(); });
async function fixture() {
  const users = await Promise.all([1, 2, 3].map(n => prisma.user.create({ data: { alias: 'Feedback ' + n, telegramId: BigInt(n) } })));
  const call = await prisma.callSession.create({ data: { roomName: crypto.randomUUID(), userAId: users[0].id, userBId: users[1].id, status: 'COMPLETED' } });
  return { users, call };
}
describe('call feedback authorization and concurrency', () => {
  it('rejects outsiders, missing calls and malformed ratings without saving feedback', async () => {
    const { users, call } = await fixture();
    expect(await saveCallQualityRating(call.id, users[2].id, 5)).toBe('UNAUTHORIZED');
    expect(await saveCallQualityRating('missing', users[0].id, 5)).toBe('MISSING_CALL');
    for (const value of [0, 6, 1.5, NaN]) await expect(saveCallQualityRating(call.id, users[0].id, value)).rejects.toThrow('Rating must');
    expect(await prisma.callRating.count()).toBe(0);
  });
  it('claims one rating and preserves the original score when callbacks repeat', async () => {
    const { users, call } = await fixture();
    const results = await Promise.all(Array.from({ length: 12 }, () => saveCallQualityRating(call.id, users[0].id, 4)));
    expect(results.filter(result => result === 'CREATED')).toHaveLength(1);
    expect(await saveCallQualityRating(call.id, users[0].id, 1)).toBe('DUPLICATE');
    expect(await saveCallQualityRating(call.id, users[1].id, 5)).toBe('CREATED');
    expect((await prisma.callRating.findFirst({ where: { callId: call.id, raterId: users[0].id } }))?.stars).toBe(4);
    expect(await prisma.callRating.count()).toBe(2);
  });
  it('preserves reporting policy: a rating can be followed by one report, and a report prevents later rating', async () => {
    const { users, call } = await fixture();
    expect(await saveCallQualityRating(call.id, users[0].id, 4)).toBe('CREATED');
    await moderationService.processReport(users[1].id, users[0].id, call.id, 'Synthetic report');
    await expect(moderationService.processReport(users[1].id, users[0].id, call.id, 'Synthetic duplicate')).rejects.toThrow('already reported');
    await moderationService.processReport(users[0].id, users[1].id, call.id, 'Synthetic report');
    expect(await saveCallQualityRating(call.id, users[1].id, 5)).toBe('DUPLICATE');
    expect((await prisma.user.findUnique({ where: { id: users[1].id } }))?.warningCount).toBe(1);
  });
});
