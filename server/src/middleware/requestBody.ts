import express, { type RequestHandler } from 'express';
import { adminAuthMiddleware } from './adminAuth';
import { getClientIp } from './rateLimit';

/** Reserve memory before reading bodies; JWT-protected uploads have a separate budget. */
export function requestBodyMiddleware(): RequestHandler {
  const smallJson = express.json({ limit: '64kb', inflate: false });
  const smallForm = express.urlencoded({ limit: '64kb', extended: false, parameterLimit: 100, inflate: false });
  const uploadJson = express.json({ limit: '8mb', inflate: false });
  const webhookRaw = express.raw({ type: '*/*', limit: '2mb', inflate: false });
  const publicAdminPaths = new Set(['/api/admin/login', '/api/admin/auth/password', '/api/admin/auth/otp', '/api/admin/auth/otp/resend', '/api/admin/auth/logout']);
  let active = 0, uploads = 0;
  const peers = new Map<string, number>();
  return (req, res, next) => {
    const webhook = req.path.replace(/\/$/, '') === '/api/livekit/webhook';
    if (!webhook && !req.is('application/json') && !req.is('application/x-www-form-urlencoded')) return next();
    const upload = req.path.startsWith('/api/admin/') && !publicAdminPaths.has(req.path.replace(/\/$/, ''));
    const large = upload || webhook;
    const parse = () => {
      const peer = getClientIp(req), count = peers.get(peer) ?? 0;
      if (active >= 16 || count >= 4 || (large && uploads >= 2)) {
        res.setHeader('Retry-After', '2');
        res.status(429).json({ error: 'Request processing is busy. Please retry shortly.' });
        return;
      }
      active++; if (large) uploads++; peers.set(peer, count + 1);
      let released = false;
      const release = () => {
        if (released) return; released = true;
        active--; if (large) uploads--;
        const remaining = (peers.get(peer) ?? 1) - 1;
        if (remaining) peers.set(peer, remaining); else peers.delete(peer);
        req.off('aborted', release);
      };
      req.once('aborted', release);
      const parser = webhook ? webhookRaw : upload && req.is('application/json') ? uploadJson : req.is('application/json') ? smallJson : smallForm;
      parser(req, res, error => {
        release();
        if (error) {
          const status = (error as { status?: number }).status;
          res.status(status === 413 ? 413 : status === 415 ? 415 : 400).json({ error: status === 413 ? 'Request body is too large.' : 'Request body is invalid or unsupported.' });
          return;
        }
        next();
      });
    };
    if (upload) adminAuthMiddleware(req, res, parse); else parse();
  };
}
