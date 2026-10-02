import { prisma } from '../config/database';
import { getPlansConfig, updatePlansConfig, type SystemPlansConfig } from './plan';
import { logger } from '../utils/logger';
const tiers = ['FREE', 'PLUS', 'PRO', 'BOSS'] as const;
const bounds = { maxDuration:[1,1440], dailyLimit:[0,2147483647], callsLimit:[0,2147483647], recordingLimit:[0,2147483647], retentionDays:[1,3650], starsPrice:[0,2147483647], uzsPrice:[0,2147483647], subscriptionDurationDays:[0,3650] };
export function validatePlanUpdate(input: unknown, previous = getPlansConfig()): SystemPlansConfig {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('A plan configuration object is required.');
  const data = input as Partial<SystemPlansConfig>, result = structuredClone(previous);
  for (const tier of tiers) {
    const patch = data[tier]; if (patch === undefined) continue;
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error(tier + ': invalid configuration.');
    for (const key of Object.keys(patch)) if (!(key in previous[tier])) throw new Error(tier + ': unsupported field ' + key);
    result[tier] = { ...previous[tier], ...patch };
    if (patch.dailyLimit !== undefined && patch.callsLimit !== undefined && patch.dailyLimit !== patch.callsLimit) throw new Error(tier + ': dailyLimit and callsLimit must match.');
    result[tier].dailyLimit = patch.dailyLimit ?? patch.callsLimit ?? previous[tier].dailyLimit;
    result[tier].callsLimit = result[tier].dailyLimit;
    for (const [key, [min,max]] of Object.entries(bounds)) {
      const value = result[tier][key as keyof typeof bounds];
      if (!Number.isInteger(value) || value < min || value > max) throw new Error(tier + ': invalid ' + key);
    }
    if (tier !== 'FREE' && result[tier].subscriptionDurationDays === 0) throw new Error(tier + ': paid subscription validity must be positive.');
    if (typeof result[tier].active !== 'boolean' || typeof result[tier].name !== 'string' || !result[tier].name.trim() || result[tier].name.length > 80 || typeof result[tier].description !== 'string' || result[tier].description.length > 1000) throw new Error(tier + ': invalid name, description or availability.');
  }
  return result;
}
// The audited configuration is persisted in the existing audit table, keeping the API and schema compatible.
export async function loadPlanConfiguration() {
  const latest = await prisma.auditLog.findFirst({ where:{action:'GLOBAL_PLANS_UPDATE',targetId:'plans_config'},orderBy:{createdAt:'desc'} });
  if (latest?.afterState) updatePlansConfig(validatePlanUpdate(JSON.parse(latest.afterState)));
  return getPlansConfig();
}
export async function savePlanConfiguration(input: unknown, adminId: string) {
  const result = await prisma.$transaction(async tx => {
    if (process.env.NODE_ENV !== 'test') await tx.$queryRaw`SELECT pg_advisory_xact_lock(736251009)`;
    const latest = await tx.auditLog.findFirst({ where:{action:'GLOBAL_PLANS_UPDATE',targetId:'plans_config'},orderBy:{createdAt:'desc'} });
    const previous = latest?.afterState ? validatePlanUpdate(JSON.parse(latest.afterState)) : getPlansConfig();
    const updated = validatePlanUpdate(input, previous);
    await tx.auditLog.create({data:{action:'GLOBAL_PLANS_UPDATE',targetId:'plans_config',adminId,beforeState:JSON.stringify(previous),afterState:JSON.stringify(updated),reason:'Administrator updated subscription configuration'}});
    return updated;
  });
  updatePlansConfig(result); return result;
}
export function startPlanConfigurationRefresh(): () => void {
  let stopped=false, timer:NodeJS.Timeout | undefined;
  const tick=async()=>{try{await loadPlanConfiguration();}catch(error){logger.warn('Plan configuration refresh failed',{service:'plans'},error);}if(!stopped)timer=setTimeout(tick,5000);};
  timer=setTimeout(tick,5000); return()=>{stopped=true;clearTimeout(timer);};
}
