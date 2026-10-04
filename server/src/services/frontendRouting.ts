import express from 'express';
import fs from 'node:fs';
import path from 'node:path';

interface FrontendOptions {
  landingDir: string | null;
  clientDir: string | null;
  adminDir: string | null;
  miniAppUrl: string;
  adminPanelUrl: string;
  publicFallback: () => string;
}

function location(value: string): { host: string; prefix: string } | null {
  try {
    const url = new URL(value);
    return { host: url.hostname.toLowerCase(), prefix: url.pathname.replace(/\/+$/, '') };
  } catch { return null; }
}

function under(pathname: string, prefix: string): boolean {
  return Boolean(prefix) && (pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/** Preserve known application authorities while preventing redirects to arbitrary Host values. */
export function httpsAuthority(host: string, configuredUrls: readonly string[]): string {
  const known = new Map(['pairtalk.online', 'app.pairtalk.online', 'admin.pairtalk.online', 'api.pairtalk.online'].map(value => [value, value]));
  for (const value of configuredUrls) {
    try {
      const url = new URL(value);
      if (url.protocol === 'https:' || url.protocol === 'http:') known.set(url.hostname.toLowerCase(), url.host);
    } catch { /* Invalid optional URL configuration cannot authorize a redirect host. */ }
  }
  return known.get(host) ?? 'pairtalk.online';
}

/** Frontend selection is routing only; protected APIs and sockets authenticate separately. */
export function createFrontendRouter(options: FrontendOptions): express.Router {
  const router = express.Router();
  const mini = location(options.miniAppUrl);
  const admin = location(options.adminPanelUrl);
  const staticFiles = Object.fromEntries(['landing', 'client', 'admin'].map(name => {
    const directory = options[`${name}Dir` as 'landingDir' | 'clientDir' | 'adminDir'];
    return [name, directory ? express.static(directory, { index: false, redirect: false, extensions: name === 'landing' ? ['html'] : [] }) : null];
  }));

  router.use((req, res, next) => {
    if (req.path.startsWith('/api/') || req.path === '/health' || req.path.startsWith('/socket.io/')) return next();
    const host = req.hostname.toLowerCase();
    let kind: 'landing' | 'client' | 'admin' = 'landing';
    let prefix = '';
    const local = ['localhost', '127.0.0.1', '::1'].includes(host);
    if (host.startsWith('admin.') || (admin && host === admin.host && !local && host !== 'pairtalk.online' && host !== mini?.host)) {
      kind = 'admin';
      if (admin && under(req.path, admin.prefix)) prefix = admin.prefix;
      else if (under(req.path, '/admin')) prefix = '/admin';
    } else if (under(req.path, '/admin') || (admin && host === admin.host && under(req.path, admin.prefix))) {
      kind = 'admin'; prefix = under(req.path, '/admin') ? '/admin' : admin!.prefix;
    } else if (host === 'app.pairtalk.online' || (mini && (!mini.prefix || mini.host !== admin?.host) && host === mini.host && !local && host !== 'pairtalk.online')) {
      kind = 'client';
      if (mini && under(req.path, mini.prefix)) prefix = mini.prefix;
      else if (under(req.path, '/client')) prefix = '/client';
    } else if (under(req.path, '/client') || (mini && host === mini.host && under(req.path, mini.prefix))) {
      kind = 'client'; prefix = under(req.path, '/client') ? '/client' : mini!.prefix;
    }

    if (kind !== 'landing') res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    const originalUrl = req.url;
    if (prefix) {
      req.url = req.url.slice(prefix.length);
      if (!req.url || req.url.startsWith('?')) req.url = `/${req.url}`;
    }
    const restore = () => { req.url = originalUrl; };
    const directory = options[`${kind}Dir`];
    const assetRequest = req.path.startsWith('/assets/');
    const fallback = () => {
      restore();
      if (req.method !== 'GET' && req.method !== 'HEAD') return next();
      if (assetRequest) return next();
      if (!req.accepts('html')) return next();
      if (kind !== 'landing') {
        const index = directory && path.join(directory, 'index.html');
        if (index && fs.existsSync(index)) return res.sendFile(index);
        return res.status(503).type('html').send('<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>PairTalk temporarily unavailable</title></head><body><h1>PairTalk temporarily unavailable</h1><p>Please try again shortly.</p></body></html>');
      }
      if (req.path === '/') {
        if (directory) return res.sendFile(path.join(directory, 'index.html'));
        return res.type('html').send(options.publicFallback());
      }
      res.setHeader('X-Robots-Tag', 'noindex');
      if (directory && fs.existsSync(path.join(directory, '404.html'))) return res.status(404).sendFile(path.join(directory, '404.html'));
      return res.status(404).type('html').send('<!doctype html><html lang="en"><head><title>Page not found | PairTalk</title></head><body><h1>Page not found</h1><a href="/">Back to PairTalk</a></body></html>');
    };
    // Vite uses absolute asset URLs even when the shell is launched at /client or /admin.
    // Hash-named assets may therefore arrive on the public host without the mount prefix.
    const candidates = [staticFiles[kind], ...(assetRequest ? Object.entries(staticFiles).filter(([name]) => name !== kind).map(([, serve]) => serve) : [])];
    const serveNext = (index: number): void => {
      if (index >= candidates.length) { fallback(); return; }
      const serve = candidates[index];
      if (!serve) { serveNext(index + 1); return; }
      serve(req, res, error => { if (error) { restore(); next(error); return; } serveNext(index + 1); });
    };
    serveNext(0);
  });
  return router;
}
