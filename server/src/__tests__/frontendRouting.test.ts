import { afterAll, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createFrontendRouter } from '../services/frontendRouting';

const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'pairtalk-frontend-'));
const directories = Object.fromEntries(['landing', 'client', 'admin'].map(name => {
  const directory = path.join(fixture, name);
  fs.mkdirSync(path.join(directory, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(directory, 'index.html'), `<html lang="en"><title>${name} fixture</title><body>${name} shell</body></html>`);
  fs.writeFileSync(path.join(directory, 'assets', `${name}-fixture.js`), `console.log('${name}');`);
  return [name, directory];
}));
fs.writeFileSync(path.join(directories.landing, 'guide.html'), 'public guide fixture');
fs.writeFileSync(path.join(directories.landing, '404.html'), 'public not-found fixture');
afterAll(() => {
  // Only the known files created above are removed; no recursive computed-path deletion.
  for (const name of ['landing', 'client', 'admin']) {
    fs.unlinkSync(path.join(directories[name], 'index.html'));
    fs.unlinkSync(path.join(directories[name], 'assets', `${name}-fixture.js`));
    fs.rmdirSync(path.join(directories[name], 'assets'));
  }
  for (const name of ['guide.html', '404.html']) fs.unlinkSync(path.join(directories.landing, name));
  for (const directory of Object.values(directories)) fs.rmdirSync(directory);
  fs.rmdirSync(fixture);
});

function application(overrides = {}) {
  const app = express();
  app.use(createFrontendRouter({ landingDir: directories.landing, clientDir: directories.client, adminDir: directories.admin,
    miniAppUrl: 'http://localhost/client', adminPanelUrl: 'http://localhost/admin', publicFallback: () => 'public fallback', ...overrides }));
  return app;
}

describe('frontend deployment routing with all three built applications', () => {
  it('serves distinct landing, Mini App, and admin roots without relying on launch headers', async () => {
    const app = application();
    for (const [host, kind] of [['pairtalk.online', 'landing'], ['app.pairtalk.online', 'client'], ['admin.pairtalk.online', 'admin']]) {
      const response = await request(app).get('/').set('Host', host);
      expect(response.status).toBe(200); expect(response.text).toContain(`${kind} shell`);
      expect(response.text).not.toContain(kind === 'landing' ? 'client shell' : 'landing shell');
      if (kind !== 'landing') expect(response.headers['x-robots-tag']).toBe('noindex, nofollow');
    }
  });

  it('serves configured and legacy path launches with their absolute Vite asset URLs', async () => {
    const app = application();
    for (const [prefix, kind] of [['/client', 'client'], ['/admin', 'admin']]) {
      for (const suffix of ['', '/', '?active_call=synthetic']) {
        const response = await request(app).get(prefix + suffix).set('Host', 'localhost');
        expect(response.status).toBe(200); expect(response.text).toContain(`${kind} shell`);
      }
      const asset = await request(app).get(`/assets/${kind}-fixture.js`).set('Host', 'localhost');
      expect(asset.status).toBe(200); expect(asset.text).toBe(`console.log('${kind}');`);
    }
  });

  it('supports custom deployment hosts and prefixes', async () => {
    const app = application({ miniAppUrl: 'https://practice.example.test/voice', adminPanelUrl: 'https://ops.example.test/control' });
    for (const [host, pathname, kind] of [['practice.example.test', '/voice', 'client'], ['ops.example.test', '/control', 'admin']]) {
      const response = await request(app).get(pathname).set('Host', host);
      expect(response.status).toBe(200); expect(response.text).toContain(`${kind} shell`);
    }
  });

  it('keeps public routes and both private mounts distinct on a shared staging host', async () => {
    const host = 'pairtalk-staging-fixture.fly.dev';
    const app = application({ miniAppUrl: `https://${host}/client`, adminPanelUrl: `https://${host}/admin` });
    for (const [pathname, kind] of [['/', 'landing'], ['/client', 'client'], ['/client/settings', 'client'], ['/admin', 'admin'], ['/admin/settings', 'admin']]) {
      const response = await request(app).get(pathname).set('Host', host);
      expect(response.status).toBe(200);
      expect(response.text).toContain(`${kind} shell`);
      if (kind !== 'landing') expect(response.headers['x-robots-tag']).toBe('noindex, nofollow');
    }
    expect((await request(app).get('/guide').set('Host', host)).text).toBe('public guide fixture');
    expect((await request(app).get('/missing').set('Host', host)).status).toBe(404);
    for (const kind of ['landing', 'client', 'admin']) {
      const response = await request(app).get(`/assets/${kind}-fixture.js`).set('Host', host);
      expect(response.status).toBe(200);
      expect(response.text).toBe(`console.log('${kind}');`);
    }
  });

  it('delivers public prerendered routes and real public 404s while retaining private SPA navigation', async () => {
    const app = application();
    expect((await request(app).get('/guide').set('Host', 'pairtalk.online')).text).toBe('public guide fixture');
    const missing = await request(app).get('/missing').set('Host', 'pairtalk.online');
    expect(missing.status).toBe(404); expect(missing.text).toBe('public not-found fixture');
    for (const [host, kind] of [['app.pairtalk.online', 'client'], ['admin.pairtalk.online', 'admin']]) {
      expect((await request(app).get('/settings').set('Host', host)).text).toContain(`${kind} shell`);
    }
  });

  it('never turns missing API, socket, asset, or mutation routes into successful HTML', async () => {
    const app = application();
    for (const host of ['pairtalk.online', 'app.pairtalk.online', 'admin.pairtalk.online']) {
      for (const pathname of ['/api/not-found', '/socket.io/missing', '/assets/missing.js']) {
        expect((await request(app).get(pathname).set('Host', host)).status).toBe(404);
      }
      expect((await request(app).post('/settings').set('Host', host)).status).toBe(404);
    }
  });

  it('reports a missing private build as unavailable instead of silently serving the landing', async () => {
    const app = application({ clientDir: null, adminDir: null });
    for (const host of ['app.pairtalk.online', 'admin.pairtalk.online']) {
      const response = await request(app).get('/').set('Host', host);
      expect(response.status).toBe(503); expect(response.text).toContain('temporarily unavailable');
      expect(response.text).not.toContain('landing shell'); expect(response.headers['x-robots-tag']).toBe('noindex, nofollow');
    }
  });
});
