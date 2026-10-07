import crypto from 'node:crypto';
import { Router } from 'express';
import { loadPlanConfiguration } from '../services/planConfiguration';
import { planIds, publicPlan, type PublicPricing, isPublicPricing } from '../contracts/pricing';
import { logger } from '../utils/logger';

let username = (process.env.BOT_USERNAME || 'PairTalkBot').replace(/^@/, '');
export function setPublicBotUsername(value: string) {
  if (!/^[a-zA-Z][a-zA-Z0-9_]{4,31}$/.test(value)) throw new Error('Invalid public bot username');
  username = value;
}
let pending: Promise<PublicPricing> | null = null;
export function readPublicPricing(): Promise<PublicPricing> {
  if (pending) return pending;
  pending = (async () => {
    const plans = await loadPlanConfiguration();
    const catalog: PublicPricing = { version: 1, revision: crypto.createHash('sha256').update(JSON.stringify(plans)).digest('hex'), checkedAt: new Date().toISOString(), botUsername: username, plans: planIds.filter(id => plans[id].active).map(id => publicPlan(id, plans[id])) };
    if (!isPublicPricing(catalog)) throw new Error('Invalid public price configuration');
    return catalog;
  })().finally(() => { pending = null; });
  return pending;
}
const router = Router();
router.get('/plans', async (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try { res.json(await readPublicPricing()); }
  catch (error) { logger.warn('Public pricing unavailable', { service: 'plans' }, error); res.status(503).json({ error: 'Current pricing is temporarily unavailable.' }); }
});
export default router;
