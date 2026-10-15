import { afterEach, expect, it, vi } from 'vitest';
import { scheduleAuthoritativeSessionTeardown } from '../socket/signaling';
import { prisma } from '../config/database';
afterEach(()=>{vi.useRealTimers();vi.restoreAllMocks();});
it('does not move an established teardown later when readiness is replayed near expiry',async()=>{
  vi.useFakeTimers();
  const lookup=vi.spyOn(prisma.callSession,'findUnique').mockResolvedValue(null);
  const original=scheduleAuthoritativeSessionTeardown('deadline-replay-fixture',1);
  await vi.advanceTimersByTimeAsync(900);
  for(let index=0;index<100;index++) expect(scheduleAuthoritativeSessionTeardown('deadline-replay-fixture',1)).toBe(original);
  await vi.advanceTimersByTimeAsync(100);
  expect(lookup).toHaveBeenCalledTimes(1);
});
it('permits immediate overdue cleanup to shorten an existing timeout',async()=>{
  vi.useFakeTimers();const lookup=vi.spyOn(prisma.callSession,'findUnique').mockResolvedValue(null);
  scheduleAuthoritativeSessionTeardown('deadline-overdue-fixture',100);
  scheduleAuthoritativeSessionTeardown('deadline-overdue-fixture',0);
  await vi.advanceTimersByTimeAsync(1);expect(lookup).toHaveBeenCalledOnce();
});
