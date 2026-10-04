// Executed through stdin inside the disposable production verification container.
const assert = require('node:assert/strict');
const http = require('node:http');
if (process.env.NODE_ENV !== 'production' || process.env.BOT_TOKEN !== '123456789:synthetic-container-verification-token') {
  throw new Error('Use the isolated production verification container.');
}
async function page(host, pathname, protocol = 'https') {
  // Node's fetch can ignore an overridden Host header. Use the wire-level HTTP API
  // to exercise host routing through the gateway without following redirects.
  return new Promise((resolve, reject) => {
    const request = http.get('http://127.0.0.1:3001' + pathname, {
      headers: { Host: host, 'X-Forwarded-Proto': protocol, 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(8000),
    }, response => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { body += chunk; });
      response.on('error', reject);
      response.on('end', () => resolve({ response: {
        status: response.statusCode,
        headers: { get: name => response.headers[name.toLowerCase()] || null },
      }, body }));
    });
    request.on('error', reject);
  });
}
function moduleScript(html) {
  const source = html.match(/<script\b[^>]*\bsrc="(\/assets\/[^"?]+\.js)"[^>]*>/)?.[1];
  assert(source, 'Frontend module script is missing.');
  return source;
}
async function main() {
  const publicPage = await page('pairtalk.online', '/');
  assert.equal(publicPage.response.status, 200);
  assert(publicPage.body.includes('IELTS Speaking Practice Partners on Telegram'));
  assert(publicPage.body.includes('rel="canonical"'));
  const publicScript = moduleScript(publicPage.body);
  console.log('PASS public host serves the prerendered landing');

  for (const [host, pathname, title] of [
    ['app.pairtalk.online', '/', 'PairTalk — Speaking Practice'],
    ['admin.pairtalk.online', '/', 'Operations Console'],
    ['127.0.0.1', '/client?active_call=synthetic-routing-check', 'PairTalk — Speaking Practice'],
    ['127.0.0.1', '/admin', 'Operations Console'],
  ]) {
    const { response, body } = await page(host, pathname);
    assert.equal(response.status, 200);
    assert(body.includes(title), 'Wrong frontend shell delivered.');
    assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow');
    const script = moduleScript(body);
    assert.notEqual(script, publicScript);
    const asset = await page(host, script);
    assert.equal(asset.response.status, 200);
    assert.match(asset.response.headers.get('content-type') || '', /javascript/);
    assert(!asset.body.startsWith('<!doctype'));
    console.log(`PASS ${host}${pathname.split('?')[0]} serves its own non-indexable shell and JavaScript`);
  }

  for (const [host, pathname] of [['pairtalk.online', '/missing-public-page'], ['app.pairtalk.online', '/assets/missing.js'], ['admin.pairtalk.online', '/api/not-found']]) {
    assert.equal((await page(host, pathname)).response.status, 404);
  }
  assert.equal((await page('app.pairtalk.online', '/api/admin/stats')).response.status, 401);
  console.log('PASS frontend routing preserves missing-route statuses and protected API authentication');
  for (const host of ['pairtalk.online', 'app.pairtalk.online', 'admin.pairtalk.online', 'api.pairtalk.online', 'untrusted.example']) {
    const { response } = await page(host, '/client?resume=example', 'http');
    assert.equal(response.status, 301);
    assert.equal(response.headers.get('location'), `https://${host === 'untrusted.example' ? 'pairtalk.online' : host}/client?resume=example`);
  }
  console.log('PASS HTTP upgrades preserve approved application hosts and reject untrusted redirect authorities');
}
main().catch(error => { console.error('Frontend verification failed:', error.message); process.exitCode = 1; });
