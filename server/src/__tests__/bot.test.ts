import { describe, it, expect } from 'vitest';
import { calculateOverallBand, generateUniqueAlias } from '../bot/commands/start';
import { generateAdminToken, verifyAndConsumeAdminToken } from '../bot/commands/admin';

describe('Bot Utilities & Stealth Admin 2FA', () => {
  it('calculates standard IELTS overall band rounded to nearest 0.5', () => {
    // (6.0 + 6.0 + 6.0 + 6.0) / 4 = 6.0
    expect(calculateOverallBand(6.0, 6.0, 6.0, 6.0)).toBe(6.0);

    // (6.5 + 7.0 + 6.0 + 6.0) / 4 = 6.375 -> rounded to 6.5
    expect(calculateOverallBand(6.5, 7.0, 6.0, 6.0)).toBe(6.5);

    // (5.0 + 5.5 + 5.0 + 5.0) / 4 = 5.125 -> rounded to 5.0
    expect(calculateOverallBand(5.0, 5.5, 5.0, 5.0)).toBe(5.0);

    // (7.5 + 8.0 + 7.5 + 8.0) / 4 = 7.75 -> rounded to 8.0
    expect(calculateOverallBand(7.5, 8.0, 7.5, 8.0)).toBe(8.0);
  });

  it('generates unique locked partner aliases matching P2P-Partner-XXXX pattern', () => {
    const alias1 = generateUniqueAlias();
    const alias2 = generateUniqueAlias();

    expect(alias1).toMatch(/^P2P-Partner-\d{4}$/);
    expect(alias2).toMatch(/^P2P-Partner-\d{4}$/);
  });

  it('generates and consumes single-use stealth 2FA admin tokens', async () => {
    const adminTelegramId = 12345678;
    const token = await generateAdminToken(adminTelegramId);

    expect(token).toBeDefined();
    expect(token.length).toBe(32); // 16 bytes hex

    // 1st consumption succeeds
    const consumedId = await verifyAndConsumeAdminToken(token);
    expect(consumedId).toBe(adminTelegramId);

    // 2nd consumption fails (single-use)
    const reConsumedId = await verifyAndConsumeAdminToken(token);
    expect(reConsumedId).toBeNull();
  });
});
