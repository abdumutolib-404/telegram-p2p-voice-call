const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
module.exports = function safeEnvironment(bindings = {}) {
  const environment = {...process.env};
  // Reserve every project dotenv key before loading application modules. No value is printed.
  for (const directory of ['server', 'admin', 'client', 'landing']) {
    for (const name of ['.env', '.env.local', '.env.production']) {
      const file = path.join(__dirname, '..', directory, name);
      if (fs.existsSync(file)) for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
        const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/);
        if (match) environment[match[1]] = '';
      }
    }
  }
  for (const key of Object.keys(environment)) if (/TOKEN|PASSWORD|SECRET|API_KEY|^S3_|^AWS_|DATABASE_URL|REDIS_URL/.test(key)) environment[key] = '';
  return {...environment, NODE_ENV:'test', PORT:'4182', BOT_TOKEN:'mock_bot_token', DISABLE_BOT_POLLING:'true', DISABLE_BACKGROUND_CRAWLER:'true',
    DATABASE_URL:'postgresql://synthetic:synthetic@127.0.0.1:55432/pairtalk_check', REDIS_URL:'redis://127.0.0.1:56379',
    ADMIN_TELEGRAM_IDS:'12345678', JWT_SECRET:crypto.randomBytes(32).toString('hex'), MASTER_PASSWORD:crypto.randomBytes(24).toString('hex'),
    LIVEKIT_HOST:'ws://127.0.0.1:59999', LIVEKIT_API_KEY:'synthetic-key', LIVEKIT_API_SECRET:crypto.randomBytes(32).toString('hex'),
    MINI_APP_URL:'http://127.0.0.1:4181', ADMIN_PANEL_URL:'http://127.0.0.1:4181', ALLOWED_ORIGINS:'http://127.0.0.1:4181',
    ...bindings};
};
