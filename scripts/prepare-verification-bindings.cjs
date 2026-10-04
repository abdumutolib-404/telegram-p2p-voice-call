// Create private verification bindings outside the checkout. Never uses dotenv.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const databaseURL = process.env.VERIFICATION_DATABASE_URL;
const redisURL = process.env.VERIFICATION_REDIS_URL;
if (!/^postgresql:\/\/pairtalk_check:[^@]+@127\.0\.0\.1:55432\/pairtalk_check$/.test(databaseURL || '') || redisURL !== 'redis://127.0.0.1:56379') {
  throw new Error('Only dedicated loopback verification services are permitted.');
}
if (!process.argv[2]) throw new Error('Provide an absolute output path outside the checkout.');
const output = path.resolve(process.argv[2]);
const relative = path.relative(path.resolve(__dirname, '..'), output);
if (!path.isAbsolute(process.argv[2]) || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith('..' + path.sep))) {
  throw new Error('Verification credentials must stay outside the checkout.');
}
fs.writeFileSync(output, JSON.stringify({
  DATABASE_URL: databaseURL, REDIS_URL: redisURL,
  JWT_SECRET: crypto.randomBytes(32).toString('hex'),
  MASTER_PASSWORD: crypto.randomBytes(24).toString('hex'),
}), { mode: 0o600, flag: 'wx' });
console.log('Dedicated verification bindings prepared outside the checkout.');
