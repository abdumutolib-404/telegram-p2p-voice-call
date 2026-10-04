import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getRedis } from '../config/redis';
import { prisma } from '../config/database';
import { QuestionIngestionService } from '../services/crawler/ingestionService';
import { QuestionFilterService } from '../services/crawler/questionFilterService';
import { aiCurationService } from '../services/crawler/aiCurationService';

vi.mock('../services/crawler/aiCurationService', () => ({ aiCurationService: { curateQuestionBatch: vi.fn(async (inputs: unknown[]) => inputs.map(() => ({ isValidIeltsSpeaking: false, rejectionReason: 'Synthetic fixture' }))) } }));
let release: (() => void) | undefined;
beforeEach(async () => { await getRedis().del('pairtalk:crawler:lock', 'pairtalk:crawler:filter_lock'); });
afterEach(async () => {
  release?.(); release = undefined;
  vi.useRealTimers(); vi.restoreAllMocks();
  await getRedis().del('pairtalk:crawler:lock', 'pairtalk:crawler:filter_lock');
  await prisma.ieltsQuestion.deleteMany();
  for (const topic of await prisma.ieltsTopic.findMany()) await prisma.ieltsTopic.delete({ where: { id: topic.id } });
});
describe('crawler lease coordination', () => {
  it('does not start ingestion writes when Redis cannot authorize the job', async () => {
    vi.spyOn(getRedis(), 'set').mockRejectedValueOnce(new Error('Synthetic Redis outage'));
    const write = vi.spyOn(prisma.ieltsTopic, 'create');
    expect((await new QuestionIngestionService().runIngestion()).status).toBe('LOCKED');
    expect(write).not.toHaveBeenCalled();
  });
  it('does not let force bypass or remove another ingestion owner', async () => {
    await getRedis().set('pairtalk:crawler:lock', 'other-owner', 'PX', 60000, 'NX');
    expect((await new QuestionIngestionService().runIngestion({ force: true })).status).toBe('LOCKED');
    expect(await getRedis().get('pairtalk:crawler:lock')).toBe('other-owner');
  });
  it('keeps the lease while curation is delayed beyond its original lifetime', async () => {
    vi.useFakeTimers();
    const barrier = new Promise<void>(resolve => { release = resolve; });
    let signalStarted!: () => void;
    const started = new Promise<void>(resolve => { signalStarted = resolve; });
    const original = aiCurationService.curateQuestionBatch;
    const curated = vi.spyOn(aiCurationService, 'curateQuestionBatch').mockImplementationOnce(async inputs => { signalStarted(); await barrier; return original(inputs); });
    const first = new QuestionIngestionService().runIngestion();
    try {
      await started;
      expect(curated).toHaveBeenCalledOnce();
      await vi.advanceTimersByTimeAsync(61000);
      expect((await new QuestionIngestionService().runIngestion()).status).toBe('LOCKED');
    } finally { release?.(); await first; }
  });
  it('coordinates the destructive filter with an ongoing ingestion job even when forced', async () => {
    await getRedis().set('pairtalk:crawler:lock', 'ingestion-owner', 'PX', 60000, 'NX');
    const remove = vi.spyOn(prisma.ieltsQuestion, 'deleteMany');
    expect((await new QuestionFilterService().runFilterCycle({ force: true })).status).toBe('LOCKED');
    expect(remove).not.toHaveBeenCalled();
    expect(await getRedis().get('pairtalk:crawler:lock')).toBe('ingestion-owner');
  });
  it('does not start destructive filtering during a Redis outage', async () => {
    vi.spyOn(getRedis(), 'set').mockRejectedValueOnce(new Error('Synthetic Redis outage'));
    const remove = vi.spyOn(prisma.ieltsQuestion, 'delete');
    expect((await new QuestionFilterService().runFilterCycle()).status).toBe('LOCKED');
    expect(remove).not.toHaveBeenCalled();
  });
  it('stops after losing ownership and leaves a replacement owner intact', async () => {
    let signalStarted!: () => void;
    const started = new Promise<void>(resolve => { signalStarted = resolve; });
    const barrier = new Promise<void>(resolve => { release = resolve; });
    const original = aiCurationService.curateQuestionBatch;
    vi.spyOn(aiCurationService, 'curateQuestionBatch').mockImplementationOnce(async inputs => { signalStarted(); await barrier; return original(inputs); });
    const create = vi.spyOn(prisma.ieltsQuestion, 'create');
    const first = new QuestionIngestionService().runIngestion();
    await started;
    await getRedis().set('pairtalk:crawler:lock', 'replacement-owner', 'PX', 60000);
    release?.();
    const result = await first;
    expect(result.status).toBe('FAILED'); expect(result.error).toContain('lease lost');
    expect(create).not.toHaveBeenCalled();
    expect(await getRedis().get('pairtalk:crawler:lock')).toBe('replacement-owner');
  });
  it('preserves a topic populated after the orphan snapshot was read', async () => {
    const topic = await prisma.ieltsTopic.create({ data: { name: 'Concurrent administrative topic', slug: 'concurrent-admin-topic' } });
    const original = prisma.ieltsTopic.findMany.bind(prisma.ieltsTopic);
    vi.spyOn(prisma.ieltsTopic, 'findMany').mockImplementation(async args => {
      const result = await original(args);
      if (args?.include?._count) {
        await prisma.ieltsQuestion.create({ data: { topicId: topic.id, part: 'PART_1', questionText: 'What do you enjoy about your local community?', sourceHash: 'concurrent-admin-question' } });
      }
      return result;
    });
    const result = await new QuestionFilterService().runFilterCycle();
    expect(result.status).toBe('SUCCESS');
    expect(result.orphansPurgedCount).toBe(0);
    expect(await prisma.ieltsTopic.findUnique({ where: { id: topic.id } })).not.toBeNull();
    expect(await prisma.ieltsQuestion.count({ where: { topicId: topic.id } })).toBe(1);
  });
});
