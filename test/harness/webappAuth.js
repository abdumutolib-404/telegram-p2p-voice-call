/**
 * test/harness/webappAuth.js
 * Telegram WebApp initData HMAC generator and validation helper.
 */

const crypto = require('crypto');

/**
 * Computes Telegram WebApp HMAC-SHA256 signature for a data check string.
 * @param {string} dataCheckString - Sorted key=value lines joined by \n
 * @param {string} botToken - Telegram Bot Token
 * @returns {string} Hex encoded HMAC signature
 */
function computeInitDataHmac(dataCheckString, botToken) {
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  return crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
}

/**
 * Generates a valid Telegram initData string with authentic HMAC signature.
 * @param {object|string} userData - User object or JSON string
 * @param {string} botToken - Telegram Bot token
 * @param {object} [options] - Optional params: authDate, queryId, extraFields
 * @returns {string} Formatted X-Telegram-Init-Data string
 */
function generateInitData(userData, botToken, options = {}) {
  const authDate = options.authDate || Math.floor(Date.now() / 1000);
  const queryId = options.queryId || 'AAE_test_query_id_12345';
  
  const userJson = typeof userData === 'string' ? userData : JSON.stringify(userData);

  const params = {
    auth_date: String(authDate),
    query_id: queryId,
    user: userJson,
    ...(options.extraFields || {})
  };

  // Sort keys alphabetically
  const sortedKeys = Object.keys(params).sort();
  const dataCheckArr = sortedKeys.map(key => `${key}=${params[key]}`);
  const dataCheckString = dataCheckArr.join('\n');

  const hash = computeInitDataHmac(dataCheckString, botToken);

  // Construct URL query string
  const queryParts = sortedKeys.map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`);
  queryParts.push(`hash=${hash}`);

  return queryParts.join('&');
}

/**
 * Generates invalid X-Telegram-Init-Data string based on scenario type.
 * @param {object|string} userData - User object or string
 * @param {string} botToken - Telegram Bot token
 * @param {string} type - Invalidity mode: 'tampered_data' | 'invalid_hash' | 'expired' | 'missing_hash' | 'wrong_token'
 * @param {object} [options] - Extra options
 * @returns {string} Invalid initData string
 */
function generateInvalidInitData(userData, botToken, type = 'invalid_hash', options = {}) {
  if (type === 'missing_hash') {
    const validData = generateInitData(userData, botToken, options);
    return validData.replace(/&hash=[a-f0-9]+/, '');
  }

  if (type === 'invalid_hash') {
    const validData = generateInitData(userData, botToken, options);
    return validData.replace(/hash=[a-f0-9]+/, 'hash=0000000000000000000000000000000000000000000000000000000000000000');
  }

  if (type === 'expired') {
    const oldAuthDate = Math.floor(Date.now() / 1000) - 86400 * 2; // 2 days ago
    return generateInitData(userData, botToken, { ...options, authDate: oldAuthDate });
  }

  if (type === 'wrong_token') {
    return generateInitData(userData, 'invalid_bot_token_12345:ABCDEF', options);
  }

  if (type === 'tampered_data') {
    const validInitData = generateInitData(userData, botToken, options);
    // Alter user id or name in query string after computing hash
    return validInitData.replace(/%22id%22%3A\d+/, '%22id%22%3A999999999');
  }

  return 'invalid_init_data_string';
}

/**
 * Parses initData query string into params object and user object.
 * @param {string} initDataString
 * @returns {object} { hash, params, user }
 */
function parseInitData(initDataString) {
  if (!initDataString || typeof initDataString !== 'string') {
    return { hash: null, params: {}, user: null };
  }

  const urlParams = new URLSearchParams(initDataString);
  const params = {};
  let hash = null;

  for (const [key, value] of urlParams.entries()) {
    if (key === 'hash') {
      hash = value;
    } else {
      params[key] = value;
    }
  }

  let user = null;
  if (params.user) {
    try {
      user = JSON.parse(params.user);
    } catch (_) {
      user = params.user;
    }
  }

  return { hash, params, user };
}

/**
 * Verifies an X-Telegram-Init-Data string.
 * @param {string} initDataString
 * @param {string} botToken
 * @param {number} [maxAgeSeconds=86400]
 * @returns {object} { valid: boolean, user?: object, authDate?: number, reason?: string }
 */
function verifyInitData(initDataString, botToken, maxAgeSeconds = 86400) {
  const { hash, params, user } = parseInitData(initDataString);

  if (!hash) {
    return { valid: false, reason: 'Missing hash parameter' };
  }

  if (!params.auth_date) {
    return { valid: false, reason: 'Missing auth_date parameter' };
  }

  const authDate = parseInt(params.auth_date, 10);
  const now = Math.floor(Date.now() / 1000);
  if (maxAgeSeconds > 0 && now - authDate > maxAgeSeconds) {
    return { valid: false, reason: 'InitData expired' };
  }

  const sortedKeys = Object.keys(params).sort();
  const dataCheckString = sortedKeys.map(key => `${key}=${params[key]}`).join('\n');
  const expectedHash = computeInitDataHmac(dataCheckString, botToken);

  if (crypto.timingSafeEqual ? 
      Buffer.from(hash, 'hex').length === Buffer.from(expectedHash, 'hex').length && 
      crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(expectedHash, 'hex')) : 
      hash === expectedHash) {
    return { valid: true, user, authDate };
  }

  return { valid: false, reason: 'HMAC signature mismatch' };
}

module.exports = {
  computeInitDataHmac,
  generateInitData,
  generateInvalidInitData,
  parseInitData,
  verifyInitData
};
