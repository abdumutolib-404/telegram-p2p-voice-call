import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import { validateTelegramInitData } from '../middleware/initDataLockdown';

describe('Telegram WebApp initData HMAC Lockdown', () => {
  const botToken = '123456789:ABCdefGHIjklMNOpqrsTUVwxyz';

  it('validates authentic initData signed with BOT_TOKEN', () => {
    const userJson = JSON.stringify({ id: 987654321, first_name: 'John', username: 'john_doe' });
    const authDate = Math.floor(Date.now() / 1000).toString();

    // Sort parameters alphabetically
    const dataCheckString = `auth_date=${authDate}\nuser=${userJson}`;

    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
    const hash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

    const validInitData = `auth_date=${authDate}&user=${encodeURIComponent(userJson)}&hash=${hash}`;

    const result = validateTelegramInitData(validInitData, botToken);

    expect(result.valid).toBe(true);
    expect(result.user?.id).toBe(BigInt(987654321));
  });

  it('rejects tampered initData hash with HTTP 403 equivalent', () => {
    const tamperedInitData = 'auth_date=1600000000&user=%7B%22id%22%3A1%7D&hash=fake_hash_value';
    const result = validateTelegramInitData(tamperedInitData, botToken);

    expect(result.valid).toBe(false);
  });

  it('rejects empty or missing initData', () => {
    expect(validateTelegramInitData('', botToken).valid).toBe(false);
  });
});
